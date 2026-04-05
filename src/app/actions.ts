"use server";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { InviteDigestPreference, UserRole } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { deliverInviteEmail } from "@/lib/email";
import { runInviteHygieneDigest } from "@/lib/invite-digest-runner";
import { parseLeadFile } from "@/lib/importer";
import {
  expireInviteIfNeeded,
  expireStaleInvitesForOrganization,
  INVITE_EXPIRING_SOON_WINDOW_MS,
} from "@/lib/invites";
import { canBulkApprove, canManageProducts, canManageUsers } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { processOutboundEmailQueue, queueSequenceForSend, retryFailedSequenceEmail } from "@/lib/outbound";
import {
  bulkApproveLeads,
  processLeadList,
  regenerateSequence,
  setSequenceStatus,
  updateSequenceContent,
} from "@/lib/workflows";
import type { ProviderReadinessKey } from "@/lib/provider-readiness";

const productSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(10),
  industry: z.string().min(2),
  productType: z.string().min(2),
  targetPersona: z.string().min(2),
  problemStatement: z.string().min(10),
  keyBenefits: z.string().min(10),
  samplePitch: z.string().min(10),
  pricingNotes: z.string().optional(),
});

const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.nativeEnum(UserRole),
  title: z.string().optional(),
  phone: z.string().optional(),
});

const digestPreferenceSchema = z.nativeEnum(InviteDigestPreference);
const providerReadinessKeySchema = z.enum(["auth_email", "outbound_email", "ai_generation", "cron_protection"]);

const activationSchema = z
  .object({
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
    title: z.string().optional(),
    phone: z.string().optional(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

async function attemptInviteDelivery(args: {
  inviteId: string;
  organizationId: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
}) {
  const invite = await prisma.userInvite.findUnique({
    where: { id: args.inviteId },
    include: {
      user: true,
      organization: true,
    },
  });

  if (!invite || invite.organizationId !== args.organizationId || invite.status !== "pending") {
    throw new Error("This invite is no longer eligible for delivery.");
  }

  const expired = await expireInviteIfNeeded({
    inviteId: invite.id,
    organizationId: invite.organizationId,
    email: invite.user.email,
    status: invite.status,
    expiresAt: invite.expiresAt,
  });

  if (expired) {
    throw new Error("This invite has expired and must be replaced.");
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const activationUrl = `${appUrl}/activate/${invite.token}`;

  const delivery = await deliverInviteEmail({
    activationUrl,
    expiresAt: invite.expiresAt,
    inviteeEmail: invite.user.email,
    inviteeName: invite.user.name,
    invitedByName: args.actorName || args.actorEmail,
    organizationName: invite.organization.name,
    roleLabel: invite.user.role.replaceAll("_", " "),
  });

  await prisma.userInvite.update({
    where: { id: invite.id },
    data: {
      deliveryState: delivery.state,
      deliveryError: delivery.state === "failed" ? delivery.reason : delivery.state === "manual" ? delivery.reason : null,
      deliveredAt: delivery.state === "sent" ? new Date() : null,
      lastDeliveryAttemptAt: new Date(),
    },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: invite.organizationId,
      actorId: args.actorId,
      entityType: "user_invite",
      entityId: invite.id,
      action: "delivery_updated",
      metadata: {
        email: invite.user.email,
        deliveryState: delivery.state,
        deliveryReason: "reason" in delivery ? delivery.reason : null,
        providerMessageId: "providerMessageId" in delivery ? delivery.providerMessageId : null,
      },
    },
  });
}

async function createInviteForExistingUser(args: {
  userId: string;
  organizationId: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
}) {
  await expireStaleInvitesForOrganization(args.organizationId);

  const targetUser = await prisma.user.findFirst({
    where: {
      id: args.userId,
      organizationId: args.organizationId,
    },
    include: {
      invites: {
        where: {
          status: "pending",
        },
        take: 1,
      },
    },
  });

  if (!targetUser) {
    throw new Error("That user could not be found.");
  }

  if (targetUser.passwordHash) {
    throw new Error("That user has already activated their seat.");
  }

  if (targetUser.invites.length > 0) {
    throw new Error("That user already has a pending invite.");
  }

  const inviteToken = crypto.randomBytes(24).toString("hex");
  const inviteExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  const invite = await prisma.userInvite.create({
    data: {
      organizationId: args.organizationId,
      userId: targetUser.id,
      invitedById: args.actorId,
      token: inviteToken,
      expiresAt: inviteExpiresAt,
    },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: args.organizationId,
      actorId: args.actorId,
      entityType: "user_invite",
      entityId: targetUser.id,
      action: "created",
      metadata: {
        email: targetUser.email,
        role: targetUser.role,
        expiresAt: inviteExpiresAt.toISOString(),
        replacement: true,
      },
    },
  });

  await attemptInviteDelivery({
    inviteId: invite.id,
    organizationId: args.organizationId,
    actorId: args.actorId,
    actorName: args.actorName,
    actorEmail: args.actorEmail,
  });
}

async function rotatePendingInvite(args: {
  inviteId: string;
  organizationId: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
}) {
  const invite = await prisma.userInvite.findUnique({
    where: { id: args.inviteId },
    include: {
      user: true,
    },
  });

  if (!invite || invite.organizationId !== args.organizationId || invite.status !== "pending") {
    throw new Error("This invite is no longer eligible for rotation.");
  }

  const expired = await expireInviteIfNeeded({
    inviteId: invite.id,
    organizationId: invite.organizationId,
    email: invite.user.email,
    status: invite.status,
    expiresAt: invite.expiresAt,
  });

  if (expired) {
    throw new Error("This invite already expired. Refresh and issue a replacement invite.");
  }

  if (invite.user.passwordHash) {
    throw new Error("That user has already activated their seat.");
  }

  const replacementToken = crypto.randomBytes(24).toString("hex");
  const replacementExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  const replacementInvite = await prisma.$transaction(async (tx) => {
    await tx.userInvite.update({
      where: { id: invite.id },
      data: {
        status: "revoked",
      },
    });

    const rotatedInvite = await tx.userInvite.create({
      data: {
        organizationId: invite.organizationId,
        userId: invite.userId,
        invitedById: args.actorId,
        token: replacementToken,
        expiresAt: replacementExpiresAt,
      },
    });

    await tx.auditEvent.create({
      data: {
        organizationId: invite.organizationId,
        actorId: args.actorId,
        entityType: "user_invite",
        entityId: invite.id,
        action: "rotated",
        metadata: {
          email: invite.user.email,
          replacementInviteId: rotatedInvite.id,
          replacementExpiresAt: replacementExpiresAt.toISOString(),
        },
      },
    });

    return rotatedInvite;
  });

  await attemptInviteDelivery({
    inviteId: replacementInvite.id,
    organizationId: args.organizationId,
    actorId: args.actorId,
    actorName: args.actorName,
    actorEmail: args.actorEmail,
  });
}

export async function createLeadListAction(formData: FormData) {
  const user = await requireUser();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    throw new Error("A CSV or XLSX file is required.");
  }

  const parsedRows = await parseLeadFile(file);
  const assignedSalespersonId = String(formData.get("assignedSalespersonId") ?? "") || user.id;

  const leadList = await prisma.leadList.create({
    data: {
      organizationId: user.organizationId,
      assignedSalespersonId,
      uploadedById: user.id,
      name: String(formData.get("name") ?? "Untitled lead list"),
      eventSourceName: String(formData.get("eventSourceName") ?? "Event source"),
      eventDate: formData.get("eventDate")
        ? new Date(String(formData.get("eventDate")))
        : null,
      eventCity: String(formData.get("eventCity") ?? "") || null,
      eventCountry: String(formData.get("eventCountry") ?? "") || null,
      notes: String(formData.get("notes") ?? "") || null,
      uploadFileName: file.name,
      totalRows: parsedRows.length,
      acceptedRows: parsedRows.filter((row) => !row.rejected).length,
      rejectedRows: parsedRows.filter((row) => row.rejected).length,
      status: "uploaded",
      uploads: {
        create: {
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sourceType: file.name.endsWith(".csv") ? "csv" : "xlsx",
          rowCount: parsedRows.length,
        },
      },
      importRows: {
        create: parsedRows.map((row) => ({
          rowNumber: row.rowNumber,
          status: row.rejected ? "rejected" : "accepted",
          email: row.email || null,
          phone: row.phone || null,
          firstName: row.firstName || null,
          lastName: row.lastName || null,
          companyName: row.companyName || null,
          rawData: row.rawData,
          rejectionReasons: row.rejectionReasons.length ? row.rejectionReasons : undefined,
        })),
      },
    },
  });

  for (const row of parsedRows.filter((entry) => !entry.rejected)) {
    const company = row.companyName
      ? await prisma.company.upsert({
          where: {
            organizationId_name: {
              organizationId: user.organizationId,
              name: row.companyName,
            },
          },
          update: {},
          create: {
            organizationId: user.organizationId,
            name: row.companyName,
          },
        })
      : null;

    const contact = await prisma.contact.create({
      data: {
        organizationId: user.organizationId,
        companyId: company?.id ?? null,
        fullName: row.fullName,
        email: row.email || null,
        phone: row.phone || null,
        title: row.title || null,
      },
    });

    await prisma.lead.create({
      data: {
        organizationId: user.organizationId,
        leadListId: leadList.id,
        companyId: company?.id ?? null,
        contactId: contact.id,
        assignedSalespersonId,
        fullName: row.fullName,
        email: row.email || null,
        phone: row.phone || null,
        title: row.title || null,
        contactNotes: row.contactNotes || null,
        status: "research_pending",
      },
    });
  }

  revalidatePath("/");
  revalidatePath("/lists");
  redirect(`/lists/${leadList.id}`);
}

export async function runListWorkflowAction(listId: string) {
  const user = await requireUser();
  await processLeadList(listId, user.id);
  revalidatePath("/");
  revalidatePath("/lists");
  revalidatePath(`/lists/${listId}`);
}

export async function saveSequenceEditsAction(leadId: string, formData: FormData) {
  const user = await requireUser();
  const emails = [1, 2, 3].map((order) => ({
    order,
    subject: String(formData.get(`subject_${order}`) ?? ""),
    body: String(formData.get(`body_${order}`) ?? ""),
  }));

  await updateSequenceContent({
    leadId,
    actorId: user.id,
    emails,
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/lists");
}

export async function regenerateAllAction(leadId: string, formData: FormData) {
  const user = await requireUser();
  await regenerateSequence({
    leadId,
    actorId: user.id,
    prompt: String(formData.get("prompt") ?? "Make all 3 emails shorter and crisper."),
  });
  revalidatePath(`/leads/${leadId}`);
}

export async function regenerateOneAction(leadId: string, emailOrder: number, formData: FormData) {
  const user = await requireUser();
  await regenerateSequence({
    leadId,
    actorId: user.id,
    emailOrder,
    prompt: String(formData.get(`prompt_${emailOrder}`) ?? "Make this email softer and more technical."),
  });
  revalidatePath(`/leads/${leadId}`);
}

export async function approveSequenceAction(leadId: string) {
  const user = await requireUser();
  await setSequenceStatus({
    leadId,
    actorId: user.id,
    status: "approved",
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/lists");
  revalidatePath("/");
}

export async function pauseSequenceAction(leadId: string) {
  const user = await requireUser();
  await setSequenceStatus({
    leadId,
    actorId: user.id,
    status: "paused",
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/lists");
}

export async function rejectSequenceAction(leadId: string) {
  const user = await requireUser();
  await setSequenceStatus({
    leadId,
    actorId: user.id,
    status: "rejected",
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/lists");
}

export async function queueApprovedSequenceAction(leadId: string) {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    throw new Error("You do not have permission to queue outbound sends.");
  }

  await queueSequenceForSend({
    leadId,
    actorId: user.id,
    organizationId: user.organizationId,
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/lists");
  revalidatePath("/");
  revalidatePath("/admin/sends");
}

export async function retryFailedSequenceEmailAction(sequenceEmailId: string, leadId: string) {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    throw new Error("You do not have permission to retry failed sends.");
  }

  await retryFailedSequenceEmail({
    sequenceEmailId,
    actorId: user.id,
    organizationId: user.organizationId,
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/lists");
  revalidatePath("/");
  revalidatePath("/admin/sends");
}

export async function queueApprovedListSequencesAction(listId: string, formData: FormData) {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    throw new Error("You do not have permission to queue outbound sends.");
  }

  const leadIds = formData
    .getAll("leadIds")
    .map((value) => String(value))
    .filter(Boolean);

  for (const leadId of leadIds) {
    await queueSequenceForSend({
      leadId,
      actorId: user.id,
      organizationId: user.organizationId,
    });
  }

  revalidatePath(`/lists/${listId}`);
  revalidatePath("/lists");
  revalidatePath("/");
  revalidatePath("/admin/sends");
}

export async function processOutboundQueueNowAction() {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    throw new Error("You do not have permission to process outbound sends.");
  }

  await processOutboundEmailQueue({
    actorId: user.id,
  });

  revalidatePath("/");
  revalidatePath("/lists");
  revalidatePath("/admin/sends");
}

export async function updateProviderVerificationAction(
  providerKey: ProviderReadinessKey,
  nextState: "verified" | "reopened",
) {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    throw new Error("You do not have permission to update provider verification.");
  }

  const parsedKey = providerReadinessKeySchema.parse(providerKey);

  await prisma.auditEvent.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      entityType: "provider_setup_verification",
      entityId: parsedKey,
      action: nextState,
      metadata: {
        actorName: user.name,
        actorEmail: user.email,
      },
    },
  });

  revalidatePath("/");
  revalidatePath("/admin/sends");
  revalidatePath("/admin/setup");
}

export async function bulkApproveAction(formData: FormData) {
  const user = await requireUser();

  if (!canBulkApprove(user.role)) {
    throw new Error("Only sales managers can bulk approve in this release.");
  }

  const leadIds = formData
    .getAll("leadIds")
    .map((value) => String(value))
    .filter(Boolean);

  if (!leadIds.length) {
    throw new Error("Select at least one lead.");
  }

  await bulkApproveLeads({
    leadIds,
    actorId: user.id,
    actorRole: user.role,
    organizationId: user.organizationId,
  });

  revalidatePath("/");
  revalidatePath("/lists");
}

export async function saveProfileAction(formData: FormData) {
  const user = await requireUser();
  const rawDigestPreference = String(formData.get("inviteDigestPreference") ?? "");
  const inviteDigestPreference =
    user.role === "sales_manager" || user.role === "admin_operator"
      ? digestPreferenceSchema.parse(rawDigestPreference || "all_alerts")
      : "off";

  await prisma.user.update({
    where: { id: user.id },
    data: {
      phone: String(formData.get("phone") ?? "") || null,
      title: String(formData.get("title") ?? "") || null,
      emailPromptPreference: String(formData.get("emailPromptPreference") ?? "") || null,
      sampleEmail: String(formData.get("sampleEmail") ?? "") || null,
      inviteDigestPreference,
    },
  });

  revalidatePath("/settings/profile");
}

export async function saveProductAction(formData: FormData) {
  const user = await requireUser();

  if (!canManageProducts(user.role)) {
    throw new Error("You do not have permission to manage products.");
  }

  const parsed = productSchema.parse({
    name: formData.get("name"),
    description: formData.get("description"),
    industry: formData.get("industry"),
    productType: formData.get("productType"),
    targetPersona: formData.get("targetPersona"),
    problemStatement: formData.get("problemStatement"),
    keyBenefits: formData.get("keyBenefits"),
    samplePitch: formData.get("samplePitch"),
    pricingNotes: formData.get("pricingNotes"),
  });

  await prisma.product.create({
    data: {
      organizationId: user.organizationId,
      name: parsed.name,
      description: parsed.description,
      industry: parsed.industry,
      productType: parsed.productType,
      targetPersona: parsed.targetPersona,
      problemStatement: parsed.problemStatement,
      keyBenefits: parsed.keyBenefits
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      samplePitch: parsed.samplePitch,
      pricingNotes: parsed.pricingNotes || null,
    },
  });

  revalidatePath("/admin/products");
}

export async function createUserInviteAction(formData: FormData) {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    throw new Error("You do not have permission to manage users.");
  }

  const parsed = userSchema.parse({
    name: formData.get("name"),
    email: String(formData.get("email") ?? "").toLowerCase(),
    role: formData.get("role"),
    title: formData.get("title"),
    phone: formData.get("phone"),
  });

  const existing = await prisma.user.findUnique({
    where: { email: parsed.email },
  });

  if (existing) {
    throw new Error("A user with that email already exists.");
  }

  const inviteToken = crypto.randomBytes(24).toString("hex");
  const inviteExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  const createdInvite = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        organizationId: user.organizationId,
        name: parsed.name,
        email: parsed.email,
        role: parsed.role,
        title: parsed.title || null,
        phone: parsed.phone || null,
        passwordHash: null,
      },
    });

    const invite = await tx.userInvite.create({
      data: {
        organizationId: user.organizationId,
        userId: createdUser.id,
        invitedById: user.id,
        token: inviteToken,
        expiresAt: inviteExpiresAt,
      },
      include: {
        user: true,
        organization: true,
      },
    });

    await tx.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        entityType: "user_invite",
        entityId: createdUser.id,
        action: "created",
        metadata: {
          email: createdUser.email,
          role: createdUser.role,
          expiresAt: inviteExpiresAt.toISOString(),
        },
      },
    });

    return invite;
  });
  await attemptInviteDelivery({
    inviteId: createdInvite.id,
    organizationId: user.organizationId,
    actorId: user.id,
    actorName: user.name || "",
    actorEmail: user.email,
  });

  revalidatePath("/admin/users");
}

export async function resendUserInviteAction(inviteId: string) {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    throw new Error("You do not have permission to manage users.");
  }

  await attemptInviteDelivery({
    inviteId,
    organizationId: user.organizationId,
    actorId: user.id,
    actorName: user.name || "",
    actorEmail: user.email,
  });

  revalidatePath("/admin/users");
}

export async function revokeUserInviteAction(inviteId: string) {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    throw new Error("You do not have permission to manage users.");
  }

  const invite = await prisma.userInvite.findUnique({
    where: { id: inviteId },
    include: {
      user: true,
    },
  });

  if (!invite || invite.organizationId !== user.organizationId || invite.status !== "pending") {
    throw new Error("This invite is no longer eligible for revocation.");
  }

  const expired = await expireInviteIfNeeded({
    inviteId: invite.id,
    organizationId: invite.organizationId,
    email: invite.user.email,
    status: invite.status,
    expiresAt: invite.expiresAt,
  });

  if (expired) {
    throw new Error("This invite has already expired.");
  }

  await prisma.$transaction([
    prisma.userInvite.update({
      where: { id: invite.id },
      data: {
        status: "revoked",
      },
    }),
    prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        entityType: "user_invite",
        entityId: invite.id,
        action: "revoked",
        metadata: {
          email: invite.user.email,
        },
      },
    }),
  ]);

  revalidatePath("/admin/users");
}

export async function createReplacementInviteAction(userId: string) {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    throw new Error("You do not have permission to manage users.");
  }

  await createInviteForExistingUser({
    userId,
    organizationId: user.organizationId,
    actorId: user.id,
    actorName: user.name || "",
    actorEmail: user.email,
  });

  revalidatePath("/admin/users");
}

export async function rotateUserInviteAction(inviteId: string) {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    throw new Error("You do not have permission to manage users.");
  }

  await rotatePendingInvite({
    inviteId,
    organizationId: user.organizationId,
    actorId: user.id,
    actorName: user.name || "",
    actorEmail: user.email,
  });

  revalidatePath("/admin/users");
}

export async function rotateExpiringInvitesDashboardAction() {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    throw new Error("You do not have permission to manage users.");
  }

  const now = new Date();
  const windowEnd = new Date(now.getTime() + INVITE_EXPIRING_SOON_WINDOW_MS);
  const invites = await prisma.userInvite.findMany({
    where: {
      organizationId: user.organizationId,
      status: "pending",
      expiresAt: {
        gt: now,
        lte: windowEnd,
      },
    },
    orderBy: { expiresAt: "asc" },
  });

  for (const invite of invites) {
    await rotatePendingInvite({
      inviteId: invite.id,
      organizationId: user.organizationId,
      actorId: user.id,
      actorName: user.name || "",
      actorEmail: user.email,
    });
  }

  await prisma.auditEvent.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      entityType: "invite_hygiene_dashboard",
      entityId: user.organizationId,
      action: "rotated_expiring_invites",
      metadata: {
        inviteCount: invites.length,
      },
    },
  });

  revalidatePath("/");
  revalidatePath("/admin/users");
}

export async function runInviteDigestNowAction() {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    throw new Error("You do not have permission to run digest operations.");
  }

  await runInviteHygieneDigest({
    organizationId: user.organizationId,
    actorId: user.id,
  });

  revalidatePath("/admin/digests");
  revalidatePath("/settings/profile");
}

export async function retryInviteDigestRecipientsAction(eventId: string) {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    throw new Error("You do not have permission to run digest operations.");
  }

  const event = await prisma.auditEvent.findFirst({
    where: {
      id: eventId,
      organizationId: user.organizationId,
      entityType: "invite_hygiene_digest",
    },
  });

  if (!event) {
    throw new Error("That digest run could not be found.");
  }

  const metadata =
    event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
      ? (event.metadata as Record<string, unknown>)
      : null;
  const recipientDeliveries = Array.isArray(metadata?.recipientDeliveries)
    ? (metadata.recipientDeliveries as Array<Record<string, unknown>>)
    : [];
  const retryableRecipientEmails = recipientDeliveries
    .filter((delivery) => delivery.deliveryState === "manual" || delivery.deliveryState === "failed")
    .map((delivery) => (typeof delivery.email === "string" ? delivery.email : null))
    .filter((email): email is string => Boolean(email));

  if (!retryableRecipientEmails.length) {
    throw new Error("This digest run has no manual or failed recipients to retry.");
  }

  await runInviteHygieneDigest({
    organizationId: user.organizationId,
    actorId: user.id,
    recipientEmails: retryableRecipientEmails,
  });

  revalidatePath("/admin/digests");
  revalidatePath("/settings/profile");
}

export async function runInviteDigestForRecipientAction(recipientEmail: string) {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    throw new Error("You do not have permission to run digest operations.");
  }

  await runInviteHygieneDigest({
    organizationId: user.organizationId,
    actorId: user.id,
    recipientEmails: [recipientEmail],
  });

  revalidatePath("/admin/digests");
  revalidatePath("/admin/digests/recipient");
  revalidatePath("/settings/profile");
}

export async function updateRecipientDigestReviewAction(
  recipientEmail: string,
  nextState: "acknowledged" | "reopened",
) {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    throw new Error("You do not have permission to update digest review state.");
  }

  await prisma.auditEvent.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      entityType: "invite_digest_recipient_review",
      entityId: recipientEmail,
      action: nextState,
      metadata: {
        actorName: user.name,
        actorEmail: user.email,
      },
    },
  });

  revalidatePath("/admin/digests/recipient");
  revalidatePath("/admin/digests");
}

export async function completeInviteActivationAction(token: string, formData: FormData) {
  const parsed = activationSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    title: formData.get("title"),
    phone: formData.get("phone"),
  });

  if (!parsed.success) {
    redirect(`/activate/${token}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Activation failed.")}`);
  }

  const invite = await prisma.userInvite.findUnique({
    where: { token },
    include: {
      user: true,
    },
  });

  if (!invite || invite.status !== "pending") {
    redirect(`/activate/${token}?error=${encodeURIComponent("This activation link is no longer valid.")}`);
  }

  const expired = await expireInviteIfNeeded({
    inviteId: invite.id,
    organizationId: invite.organizationId,
    email: invite.user.email,
    status: invite.status,
    expiresAt: invite.expiresAt,
  });

  if (expired) {
    redirect(`/activate/${token}?error=${encodeURIComponent("This activation link has expired.")}`);
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: invite.userId },
      data: {
        passwordHash,
        title: parsed.data.title || invite.user.title || null,
        phone: parsed.data.phone || invite.user.phone || null,
      },
    }),
    prisma.userInvite.update({
      where: { id: invite.id },
      data: {
        status: "accepted",
        acceptedAt: new Date(),
      },
    }),
    prisma.auditEvent.create({
      data: {
        organizationId: invite.organizationId,
        actorId: invite.userId,
        entityType: "user_invite",
        entityId: invite.id,
        action: "accepted",
        metadata: {
          email: invite.user.email,
        },
      },
    }),
  ]);

  redirect(`/login?activated=1&email=${encodeURIComponent(invite.user.email)}`);
}
