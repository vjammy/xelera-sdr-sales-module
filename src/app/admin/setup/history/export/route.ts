import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getProviderVerificationHistory } from "@/lib/data";
import { canManageUsers } from "@/lib/permissions";

function csvEscape(value: string | number | boolean) {
  const stringValue = String(value);

  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }

  return stringValue;
}

const ALLOWED_PROVIDER_FILTERS = ["all", "auth_email", "outbound_email", "ai_generation", "cron_protection"] as const;
const ALLOWED_ACTION_FILTERS = ["all", "verified", "reopened"] as const;
const ALLOWED_TIME_FILTERS = ["all", "24h", "7d", "30d"] as const;
const ALLOWED_SORT_FILTERS = ["newest", "oldest"] as const;
const PAGE_SIZE_OPTIONS = [8, 20, 50] as const;
const DEFAULT_PAGE_SIZE = 8;

function normalizeProviderFilter(value: string | null) {
  return ALLOWED_PROVIDER_FILTERS.includes((value ?? "all") as (typeof ALLOWED_PROVIDER_FILTERS)[number])
    ? (value ?? "all")
    : "all";
}

function normalizeActionFilter(value: string | null) {
  return ALLOWED_ACTION_FILTERS.includes((value ?? "all") as (typeof ALLOWED_ACTION_FILTERS)[number])
    ? (value ?? "all")
    : "all";
}

function normalizeTimeFilter(value: string | null) {
  return ALLOWED_TIME_FILTERS.includes((value ?? "all") as (typeof ALLOWED_TIME_FILTERS)[number])
    ? (value ?? "all")
    : "all";
}

function normalizeSortOrder(value: string | null) {
  return ALLOWED_SORT_FILTERS.includes((value ?? "newest") as (typeof ALLOWED_SORT_FILTERS)[number])
    ? (value ?? "newest")
    : "newest";
}

function normalizePageNumber(value: string | null) {
  const parsed = Number.parseInt(value ?? "1", 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

function normalizePageSize(value: string | null) {
  const parsed = Number.parseInt(value ?? String(DEFAULT_PAGE_SIZE), 10);

  return PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number]) ? parsed : DEFAULT_PAGE_SIZE;
}

function normalizeSearchQuery(value: string | null) {
  return (value ?? "").trim().slice(0, 80);
}

export async function GET(request: Request) {
  const session = await auth();
  const user = session?.user;

  if (!user || !canManageUsers(user.role)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const providerFilter = normalizeProviderFilter(searchParams.get("provider"));
  const actionFilter = normalizeActionFilter(searchParams.get("action"));
  const timeFilter = normalizeTimeFilter(searchParams.get("time"));
  const sortOrder = normalizeSortOrder(searchParams.get("sort"));
  const pageSize = normalizePageSize(searchParams.get("pageSize"));
  const searchQuery = normalizeSearchQuery(searchParams.get("q"));
  const page = normalizePageNumber(searchParams.get("page"));
  const scope = searchParams.get("scope") === "all" ? "all" : "page";
  const actorFilter = searchParams.get("actor")?.trim() || "all";
  const history = await getProviderVerificationHistory(user.organizationId);
  const cutoffTimestamp =
    timeFilter === "24h"
      ? new Date(Date.now() - 24 * 60 * 60 * 1000)
      : timeFilter === "7d"
        ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        : timeFilter === "30d"
          ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          : null;
  const filteredHistory = history.filter((event) => {
    const timeMatches = cutoffTimestamp === null || event.createdAt >= cutoffTimestamp;
    const providerMatches = providerFilter === "all" || event.providerKey === providerFilter;
    const actionMatches = actionFilter === "all" || event.action === actionFilter;
    const actorMatches = actorFilter === "all" || event.actorEmail === actorFilter;
    const queryMatches =
      searchQuery.length === 0 ||
      event.providerLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.providerKey.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.actorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (event.actorEmail ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.action.toLowerCase().includes(searchQuery.toLowerCase());

    return timeMatches && providerMatches && actionMatches && actorMatches && queryMatches;
  });
  const sortedFilteredHistory = sortOrder === "oldest" ? [...filteredHistory].reverse() : filteredHistory;
  const totalPages = Math.max(1, Math.ceil(sortedFilteredHistory.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedHistory = sortedFilteredHistory.slice(startIndex, startIndex + pageSize);
  const historyToExport = scope === "all" ? sortedFilteredHistory : paginatedHistory;

  const header = [
    "event_id",
    "provider_key",
    "provider_label",
    "action",
    "actor_name",
    "actor_email",
    "created_at",
  ];

  const rows = historyToExport.map((event) =>
    [
      event.id,
      event.providerKey,
      event.providerLabel,
      event.action,
      event.actorName,
      event.actorEmail ?? "",
      event.createdAt.toISOString(),
    ]
      .map((value) => csvEscape(value))
      .join(","),
  );

  const filenameParts = [
    "setup-history",
    providerFilter !== "all" ? providerFilter : null,
    actionFilter !== "all" ? actionFilter : null,
    timeFilter !== "all" ? timeFilter : null,
    sortOrder !== "newest" ? sortOrder : null,
    pageSize !== DEFAULT_PAGE_SIZE ? `size-${pageSize}` : null,
    searchQuery.length > 0 ? `q-${searchQuery.replaceAll(/[^a-z0-9._-]+/gi, "-")}` : null,
    actorFilter !== "all" ? actorFilter.replaceAll(/[^a-z0-9@._-]+/gi, "-") : null,
    scope === "all" ? "all" : `page-${currentPage}`,
  ].filter(Boolean);

  return new NextResponse([header.join(","), ...rows].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameParts.join("-")}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
