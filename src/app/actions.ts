"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { parseLeadFile } from "@/lib/importer";
import { canBulkApprove, canManageProducts } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  bulkApproveLeads,
  processLeadList,
  regenerateSequence,
  setSequenceStatus,
  updateSequenceContent,
} from "@/lib/workflows";

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

  await prisma.user.update({
    where: { id: user.id },
    data: {
      phone: String(formData.get("phone") ?? "") || null,
      title: String(formData.get("title") ?? "") || null,
      emailPromptPreference: String(formData.get("emailPromptPreference") ?? "") || null,
      sampleEmail: String(formData.get("sampleEmail") ?? "") || null,
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
