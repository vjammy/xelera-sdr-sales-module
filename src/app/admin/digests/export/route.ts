import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOrganizationInviteDigestHistory } from "@/lib/data";
import {
  filterDigestHistory,
  normalizeFilterState,
  normalizePageNumber,
  paginateDigestHistory,
} from "@/lib/invite-digest-view";
import { canManageUsers } from "@/lib/permissions";

function csvEscape(value: string | number | boolean) {
  const stringValue = String(value);

  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }

  return stringValue;
}

export async function GET(request: Request) {
  const session = await auth();
  const user = session?.user;

  if (!user || !canManageUsers(user.role)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const filterState = normalizeFilterState(searchParams.get("state") ?? undefined);
  const recipientQuery = searchParams.get("recipient")?.trim() ?? "";
  const page = normalizePageNumber(searchParams.get("page") ?? undefined);

  const history = await getOrganizationInviteDigestHistory(user.organizationId);
  const filteredHistory = filterDigestHistory(history, filterState, recipientQuery);
  const { paginatedHistory, currentPage } = paginateDigestHistory(filteredHistory, page);

  const header = [
    "run_id",
    "run_created_at",
    "run_action",
    "run_alert_count",
    "run_stale_count",
    "run_expiring_soon_count",
    "is_targeted_retry",
    "requested_recipients",
    "recipient_email",
    "delivery_state",
    "delivery_preference",
    "delivery_alert_count",
    "delivery_stale_count",
    "delivery_expiring_soon_count",
  ];

  const rows = paginatedHistory.flatMap((entry) =>
    entry.recipientDeliveries.map((delivery) =>
      [
        entry.id,
        entry.createdAt.toISOString(),
        entry.action,
        entry.alertCount,
        entry.staleCount,
        entry.expiringSoonCount,
        entry.isTargetedRetry,
        entry.requestedRecipients.join("; "),
        delivery.email,
        delivery.deliveryState,
        delivery.preference,
        delivery.alertCount,
        delivery.staleCount,
        delivery.expiringSoonCount,
      ]
        .map((value) => csvEscape(value))
        .join(","),
    ),
  );

  const filenameParts = [
    "invite-digests",
    filterState !== "all" ? filterState : null,
    recipientQuery ? recipientQuery.replaceAll(/[^a-z0-9@._-]+/gi, "-") : null,
    `page-${currentPage}`,
  ].filter(Boolean);

  return new NextResponse([header.join(","), ...rows].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameParts.join("-")}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
