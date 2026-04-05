import { getInviteHygieneAlerts } from "@/lib/invite-hygiene";
import { canViewAllWork } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { expireInviteIfNeeded } from "@/lib/invites";

export async function getDashboardData(user: {
  id: string;
  organizationId: string;
  role: "salesperson" | "sales_manager" | "admin_operator";
}) {
  const leadWhere = canViewAllWork(user.role)
    ? { organizationId: user.organizationId }
    : { organizationId: user.organizationId, assignedSalespersonId: user.id };

  const listWhere = canViewAllWork(user.role)
    ? { organizationId: user.organizationId }
    : { organizationId: user.organizationId, assignedSalespersonId: user.id };

  const [leadLists, metrics, products] = await Promise.all([
    prisma.leadList.findMany({
      where: listWhere,
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        assignedSalesperson: true,
        leads: {
          select: { id: true, status: true },
        },
      },
    }),
    prisma.$transaction([
      prisma.leadList.count({ where: listWhere }),
      prisma.lead.count({ where: leadWhere }),
      prisma.lead.count({ where: { ...leadWhere, status: "review_ready" } }),
      prisma.lead.count({ where: { ...leadWhere, status: "approved" } }),
      prisma.lead.count({ where: { ...leadWhere, companyResearchStatus: "complete", contactResearchStatus: "complete" } }),
    ]),
    prisma.product.count({
      where: { organizationId: user.organizationId, isActive: true },
    }),
  ]);

  const inviteHygiene =
    user.role === "sales_manager" || user.role === "admin_operator"
      ? await getInviteHygieneAlerts(user.organizationId)
      : { staleAlerts: [], expiringSoonAlerts: [], alerts: [] };

  return {
    leadLists,
    metrics: {
      listCount: metrics[0],
      leadCount: metrics[1],
      reviewReadyCount: metrics[2],
      approvedCount: metrics[3],
      researchCompleteCount: metrics[4],
      activeProductCount: products,
    },
    staleInviteAlerts: inviteHygiene.staleAlerts.slice(0, 5),
    expiringSoonInviteAlerts: inviteHygiene.expiringSoonAlerts.slice(0, 5),
  };
}

export async function getLeadLists(user: {
  id: string;
  organizationId: string;
  role: "salesperson" | "sales_manager" | "admin_operator";
}) {
  return prisma.leadList.findMany({
    where: canViewAllWork(user.role)
      ? { organizationId: user.organizationId }
      : { organizationId: user.organizationId, assignedSalespersonId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      assignedSalesperson: true,
      uploadedBy: true,
      leads: {
        include: {
          sequence: true,
        },
      },
    },
  });
}

export async function getLeadListDetails(
  listId: string,
  user: { id: string; organizationId: string; role: "salesperson" | "sales_manager" | "admin_operator" },
) {
  return prisma.leadList.findFirst({
    where: canViewAllWork(user.role)
      ? { id: listId, organizationId: user.organizationId }
      : { id: listId, organizationId: user.organizationId, assignedSalespersonId: user.id },
    include: {
      assignedSalesperson: true,
      uploadedBy: true,
      importRows: {
        orderBy: { rowNumber: "asc" },
        take: 10,
      },
      leads: {
        orderBy: { updatedAt: "desc" },
        include: {
          company: true,
          contact: true,
          sequence: {
            include: { emails: true },
          },
        },
      },
    },
  });
}

export async function getLeadDetails(
  leadId: string,
  user: { id: string; organizationId: string; role: "salesperson" | "sales_manager" | "admin_operator" },
) {
  return prisma.lead.findFirst({
    where: canViewAllWork(user.role)
      ? { id: leadId, organizationId: user.organizationId }
      : { id: leadId, organizationId: user.organizationId, assignedSalespersonId: user.id },
    include: {
      assignedSalesperson: true,
      leadList: true,
      company: true,
      contact: true,
      sequence: {
        include: {
          emails: {
            orderBy: { emailOrder: "asc" },
          },
          product: true,
        },
      },
      reviewActions: {
        include: { actor: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      },
    },
  });
}

export async function getProducts(user: { organizationId: string }) {
  return prisma.product.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
  });
}

export async function getProfile(userId: string, organizationId: string) {
  return prisma.user.findFirst({
    where: {
      id: userId,
      organizationId,
    },
  });
}

export async function getOrganizationUserByEmail(email: string, organizationId: string) {
  return prisma.user.findFirst({
    where: {
      email,
      organizationId,
    },
    include: {
      team: true,
    },
  });
}

export async function getInviteDigestHistory(recipientEmail: string, organizationId: string) {
  const events = await prisma.auditEvent.findMany({
    where: {
      organizationId,
      entityType: "invite_hygiene_digest",
    },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  return events
    .map((event) => {
      const metadata =
        event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
          ? (event.metadata as Record<string, unknown>)
          : null;
      const deliveries = Array.isArray(metadata?.recipientDeliveries)
        ? (metadata.recipientDeliveries as Array<Record<string, unknown>>)
        : [];
      const delivery = deliveries.find((entry) => entry.email === recipientEmail);

      if (!delivery) {
        return null;
      }

      return {
        id: event.id,
        createdAt: event.createdAt,
        action: event.action,
        deliveryState:
          typeof delivery.deliveryState === "string" ? delivery.deliveryState : "skipped",
        alertCount: typeof delivery.alertCount === "number" ? delivery.alertCount : 0,
        staleCount: typeof delivery.staleCount === "number" ? delivery.staleCount : 0,
        expiringSoonCount:
          typeof delivery.expiringSoonCount === "number" ? delivery.expiringSoonCount : 0,
        preference: typeof delivery.preference === "string" ? delivery.preference : "all_alerts",
      };
    })
    .filter((entry) => entry !== null);
}

export async function getRecipientDigestReviewState(recipientEmail: string, organizationId: string) {
  const event = await prisma.auditEvent.findFirst({
    where: {
      organizationId,
      entityType: "invite_digest_recipient_review",
      entityId: recipientEmail,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!event) {
    return null;
  }

  const metadata =
    event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
      ? (event.metadata as Record<string, unknown>)
      : null;

  return {
    id: event.id,
    action: event.action,
    createdAt: event.createdAt,
    actorName: typeof metadata?.actorName === "string" ? metadata.actorName : null,
    actorEmail: typeof metadata?.actorEmail === "string" ? metadata.actorEmail : null,
  };
}

export async function getOrganizationInviteDigestHistory(organizationId: string) {
  const events = await prisma.auditEvent.findMany({
    where: {
      organizationId,
      entityType: "invite_hygiene_digest",
    },
    orderBy: { createdAt: "desc" },
  });

  return events.map((event) => {
    const metadata =
      event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
        ? (event.metadata as Record<string, unknown>)
        : null;
    const recipientDeliveries = Array.isArray(metadata?.recipientDeliveries)
      ? (metadata.recipientDeliveries as Array<Record<string, unknown>>)
      : [];
    const requestedRecipients = Array.isArray(metadata?.requestedRecipients)
      ? (metadata.requestedRecipients.filter((entry) => typeof entry === "string") as string[])
      : [];

    return {
      id: event.id,
      createdAt: event.createdAt,
      action: event.action,
      alertCount: typeof metadata?.alertCount === "number" ? metadata.alertCount : 0,
      staleCount: typeof metadata?.staleCount === "number" ? metadata.staleCount : 0,
      expiringSoonCount: typeof metadata?.expiringSoonCount === "number" ? metadata.expiringSoonCount : 0,
      recipients: Array.isArray(metadata?.recipients)
        ? (metadata.recipients.filter((entry) => typeof entry === "string") as string[])
        : [],
      requestedRecipients,
      isTargetedRetry: requestedRecipients.length > 0,
      recipientDeliveries: recipientDeliveries.map((delivery, index) => ({
        id: `${event.id}-${index}`,
        email: typeof delivery.email === "string" ? delivery.email : "unknown",
        deliveryState:
          typeof delivery.deliveryState === "string" ? delivery.deliveryState : "skipped",
        alertCount: typeof delivery.alertCount === "number" ? delivery.alertCount : 0,
        staleCount: typeof delivery.staleCount === "number" ? delivery.staleCount : 0,
        expiringSoonCount:
          typeof delivery.expiringSoonCount === "number" ? delivery.expiringSoonCount : 0,
        preference: typeof delivery.preference === "string" ? delivery.preference : "all_alerts",
      })),
      retryableRecipientCount: recipientDeliveries.filter(
        (delivery) => delivery.deliveryState === "manual" || delivery.deliveryState === "failed",
      ).length,
    };
  });
}

export async function getAssignableSalespeople(organizationId: string) {
  return prisma.user.findMany({
    where: {
      organizationId,
      role: { in: ["salesperson", "sales_manager"] },
    },
    orderBy: { name: "asc" },
  });
}

export async function getOrganizationUsers(organizationId: string) {
  return prisma.user.findMany({
    where: {
      organizationId,
    },
    include: {
      team: true,
      assignedLists: {
        select: { id: true },
      },
      assignedLeads: {
        select: { id: true },
      },
      invites: {
        orderBy: {
          createdAt: "desc",
        },
        take: 3,
      },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
}

export async function getInviteByToken(token: string) {
  const invite = await prisma.userInvite.findUnique({
    where: { token },
    include: {
      user: true,
      invitedBy: true,
      organization: true,
    },
  });

  if (!invite) {
    return null;
  }

  if (invite.status !== "pending") {
    return invite;
  }

  const expired = await expireInviteIfNeeded({
    inviteId: invite.id,
    organizationId: invite.organizationId,
    email: invite.user.email,
    status: invite.status,
    expiresAt: invite.expiresAt,
  });

  if (expired) {
    return prisma.userInvite.findUnique({
      where: { id: invite.id },
      include: {
        user: true,
        invitedBy: true,
        organization: true,
      },
    });
  }

  return invite;
}
