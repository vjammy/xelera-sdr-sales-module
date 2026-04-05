import { canViewAllWork } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

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

  if (invite.expiresAt <= new Date()) {
    return prisma.userInvite.update({
      where: { id: invite.id },
      data: {
        status: "expired",
      },
      include: {
        user: true,
        invitedBy: true,
        organization: true,
      },
    });
  }

  return invite;
}
