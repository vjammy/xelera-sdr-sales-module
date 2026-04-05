import { expireStaleInvitesForOrganization, isInviteExpiringSoon, isInviteStale } from "@/lib/invites";
import { prisma } from "@/lib/prisma";

export type InviteHygieneAlertKind = "stale" | "expiring_soon";

export type InviteHygieneAlert = {
  inviteId: string;
  kind: InviteHygieneAlertKind;
  createdAt: Date;
  expiresAt: Date;
  lastDeliveryAttemptAt: Date | null;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
};

export async function getInviteHygieneAlerts(organizationId: string) {
  await expireStaleInvitesForOrganization(organizationId);

  const invites = await prisma.userInvite.findMany({
    where: {
      organizationId,
      status: "pending",
    },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });

  const alerts: InviteHygieneAlert[] = [];

  for (const invite of invites) {
    if (
      isInviteStale({
        createdAt: invite.createdAt,
        lastDeliveryAttemptAt: invite.lastDeliveryAttemptAt,
      })
    ) {
      alerts.push({
        inviteId: invite.id,
        kind: "stale",
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
        lastDeliveryAttemptAt: invite.lastDeliveryAttemptAt,
        user: invite.user,
      });
      continue;
    }

    if (isInviteExpiringSoon(invite.expiresAt)) {
      alerts.push({
        inviteId: invite.id,
        kind: "expiring_soon",
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
        lastDeliveryAttemptAt: invite.lastDeliveryAttemptAt,
        user: invite.user,
      });
    }
  }

  return {
    alerts,
    staleAlerts: alerts.filter((alert) => alert.kind === "stale"),
    expiringSoonAlerts: alerts.filter((alert) => alert.kind === "expiring_soon"),
  };
}
