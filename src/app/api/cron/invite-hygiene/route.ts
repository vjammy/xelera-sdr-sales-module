import { NextRequest, NextResponse } from "next/server";
import { InviteDigestPreference } from "@prisma/client";
import { deliverInviteHygieneDigestEmail } from "@/lib/email";
import { getInviteHygieneAlerts } from "@/lib/invite-hygiene";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function filterAlertsForPreference(args: {
  alerts: Awaited<ReturnType<typeof getInviteHygieneAlerts>>;
  preference: InviteDigestPreference;
}) {
  if (args.preference === "off") {
    return [];
  }

  if (args.preference === "stale_only") {
    return args.alerts.staleAlerts;
  }

  return args.alerts.alerts;
}

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const organizations = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      users: {
        where: {
          role: {
            in: ["sales_manager", "admin_operator"],
          },
          passwordHash: {
            not: null,
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          inviteDigestPreference: true,
        },
      },
    },
  });

  const results: Array<{
    organizationId: string;
    organizationName: string;
    alertCount: number;
    staleCount: number;
    expiringSoonCount: number;
    recipients: string[];
    recipientDeliveries: Array<{
      email: string;
      deliveryState: "skipped" | "manual" | "sent" | "failed";
      alertCount: number;
      staleCount: number;
      expiringSoonCount: number;
      preference: InviteDigestPreference;
    }>;
    deliveryState: "skipped" | "manual" | "sent" | "failed";
  }> = [];

  for (const organization of organizations) {
    const alerts = await getInviteHygieneAlerts(organization.id);

    if (!alerts.alerts.length) {
      continue;
    }

    const recipientEmails = organization.users.map((user) => user.email);

    if (!recipientEmails.length) {
      await prisma.auditEvent.create({
        data: {
          organizationId: organization.id,
          entityType: "invite_hygiene_digest",
          entityId: organization.id,
          action: "skipped",
          metadata: {
            reason: "No eligible manager or admin recipients.",
            alertCount: alerts.alerts.length,
          },
        },
      });

      results.push({
        organizationId: organization.id,
        organizationName: organization.name,
        alertCount: alerts.alerts.length,
        staleCount: alerts.staleAlerts.length,
        expiringSoonCount: alerts.expiringSoonAlerts.length,
        recipients: [],
        recipientDeliveries: [],
        deliveryState: "skipped",
      });
      continue;
    }

    let deliveryState: "manual" | "sent" | "failed" = "manual";
    const recipientDeliveries: Array<{
      email: string;
      deliveryState: "skipped" | "manual" | "sent" | "failed";
      alertCount: number;
      staleCount: number;
      expiringSoonCount: number;
      preference: InviteDigestPreference;
    }> = [];

    for (const recipient of organization.users) {
      const filteredAlerts = filterAlertsForPreference({
        alerts,
        preference: recipient.inviteDigestPreference,
      });
      const staleCount = filteredAlerts.filter((alert) => alert.kind === "stale").length;
      const expiringSoonCount = filteredAlerts.filter((alert) => alert.kind === "expiring_soon").length;

      if (!filteredAlerts.length) {
        recipientDeliveries.push({
          email: recipient.email,
          deliveryState: "skipped",
          alertCount: 0,
          staleCount,
          expiringSoonCount,
          preference: recipient.inviteDigestPreference,
        });
        continue;
      }

      const delivery = await deliverInviteHygieneDigestEmail({
        adminUrl: `${appUrl}/admin/users`,
        alertCount: filteredAlerts.length,
        expiringSoonCount,
        staleCount,
        organizationName: organization.name,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        alerts: filteredAlerts.map((alert) => ({
          email: alert.user.email,
          expiresAt: alert.expiresAt,
          kind: alert.kind,
          name: alert.user.name,
        })),
      });

      if (delivery.state === "failed") {
        deliveryState = "failed";
      } else if (delivery.state === "sent" && deliveryState !== "failed") {
        deliveryState = "sent";
      }

      recipientDeliveries.push({
        email: recipient.email,
        deliveryState: delivery.state,
        alertCount: filteredAlerts.length,
        staleCount,
        expiringSoonCount,
        preference: recipient.inviteDigestPreference,
      });
    }

    await prisma.auditEvent.create({
      data: {
        organizationId: organization.id,
        entityType: "invite_hygiene_digest",
        entityId: organization.id,
        action: deliveryState === "sent" ? "sent" : deliveryState,
        metadata: {
          alertCount: alerts.alerts.length,
          staleCount: alerts.staleAlerts.length,
          expiringSoonCount: alerts.expiringSoonAlerts.length,
          recipients: recipientEmails,
          recipientDeliveries,
        },
      },
    });

    results.push({
      organizationId: organization.id,
      organizationName: organization.name,
      alertCount: alerts.alerts.length,
      staleCount: alerts.staleAlerts.length,
      expiringSoonCount: alerts.expiringSoonAlerts.length,
      recipients: recipientEmails,
      recipientDeliveries,
      deliveryState,
    });
  }

  return NextResponse.json({
    processedAt: new Date().toISOString(),
    organizationsProcessed: results.length,
    results,
  });
}
