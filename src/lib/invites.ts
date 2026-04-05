import { prisma } from "@/lib/prisma";

async function markInviteExpired(args: {
  inviteId: string;
  organizationId: string;
  email: string;
}) {
  await prisma.$transaction([
    prisma.userInvite.update({
      where: { id: args.inviteId },
      data: {
        status: "expired",
      },
    }),
    prisma.auditEvent.create({
      data: {
        organizationId: args.organizationId,
        entityType: "user_invite",
        entityId: args.inviteId,
        action: "expired",
        metadata: {
          email: args.email,
        },
      },
    }),
  ]);
}

export async function expireInviteIfNeeded(args: {
  inviteId: string;
  organizationId: string;
  email: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: Date;
}) {
  if (args.status !== "pending" || args.expiresAt > new Date()) {
    return false;
  }

  await markInviteExpired({
    inviteId: args.inviteId,
    organizationId: args.organizationId,
    email: args.email,
  });

  return true;
}

export async function expireStaleInvitesForOrganization(organizationId: string) {
  const expiredInvites = await prisma.userInvite.findMany({
    where: {
      organizationId,
      status: "pending",
      expiresAt: {
        lte: new Date(),
      },
    },
    select: {
      id: true,
      organizationId: true,
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  for (const invite of expiredInvites) {
    await markInviteExpired({
      inviteId: invite.id,
      organizationId: invite.organizationId,
      email: invite.user.email,
    });
  }

  return expiredInvites.length;
}
