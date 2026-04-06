import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireUser } from "@/lib/auth";
import { getProviderVerificationHistory } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { canManageUsers } from "@/lib/permissions";

const PROVIDER_FILTERS = [
  { value: "all", label: "All providers" },
  { value: "auth_email", label: "Auth sign-in email" },
  { value: "outbound_email", label: "Outbound email delivery" },
  { value: "ai_generation", label: "AI research and drafting" },
  { value: "cron_protection", label: "Cron protection" },
] as const;
const ACTION_FILTERS = [
  { value: "all", label: "All actions" },
  { value: "verified", label: "Verified" },
  { value: "reopened", label: "Reopened" },
] as const;
const TIME_FILTERS = [
  { value: "all", label: "All time" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
] as const;
const SORT_FILTERS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
] as const;
const PAGE_SIZE_OPTIONS = [8, 20, 50] as const;
const DEFAULT_PAGE_SIZE = 8;
type SetupHistoryPreset = {
  label: string;
  providerFilter: string;
  actionFilter: string;
  actorFilter: string;
  timeFilter: string;
  sortOrder: string;
  pageSize: number;
  searchQuery: string;
};

function getStatusBadgeClasses(action: string) {
  if (action === "verified") {
    return "bg-emerald-100 text-emerald-950";
  }

  return "bg-amber-100 text-amber-950";
}

function normalizeProviderFilter(value: string | undefined) {
  return PROVIDER_FILTERS.some((option) => option.value === value) ? value ?? "all" : "all";
}

function normalizeActionFilter(value: string | undefined) {
  return ACTION_FILTERS.some((option) => option.value === value) ? value ?? "all" : "all";
}

function normalizeTimeFilter(value: string | undefined) {
  return TIME_FILTERS.some((option) => option.value === value) ? value ?? "all" : "all";
}

function normalizeSortOrder(value: string | undefined) {
  return SORT_FILTERS.some((option) => option.value === value) ? value ?? "newest" : "newest";
}

function normalizePageNumber(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

function normalizePageSize(value: string | undefined) {
  const parsed = Number.parseInt(value ?? String(DEFAULT_PAGE_SIZE), 10);

  return PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number]) ? parsed : DEFAULT_PAGE_SIZE;
}

function normalizeSearchQuery(value: string | undefined) {
  return (value ?? "").trim().slice(0, 80);
}

function buildHistoryHref(args: {
  providerFilter: string;
  actionFilter: string;
  actorFilter: string;
  timeFilter: string;
  sortOrder: string;
  pageSize: number;
  searchQuery?: string;
  page?: number;
  exportPath?: boolean;
  exportScope?: "page" | "all";
}) {
  const params = new URLSearchParams();

  if (args.providerFilter !== "all") {
    params.set("provider", args.providerFilter);
  }

  if (args.actionFilter !== "all") {
    params.set("action", args.actionFilter);
  }

  if (args.actorFilter !== "all") {
    params.set("actor", args.actorFilter);
  }

  if (args.timeFilter !== "all") {
    params.set("time", args.timeFilter);
  }

  if (args.sortOrder !== "newest") {
    params.set("sort", args.sortOrder);
  }

  if (args.pageSize !== DEFAULT_PAGE_SIZE) {
    params.set("pageSize", String(args.pageSize));
  }

  const normalizedSearchQuery = (args.searchQuery ?? "").trim();
  if (normalizedSearchQuery) {
    params.set("q", normalizedSearchQuery);
  }

  if ((args.page ?? 1) > 1) {
    params.set("page", String(args.page));
  }

  if (args.exportPath && args.exportScope === "all") {
    params.set("scope", "all");
  }

  const query = params.toString();
  const basePath = args.exportPath ? "/admin/setup/history/export" : "/admin/setup/history";
  return query ? `${basePath}?${query}` : basePath;
}

export default async function SetupHistoryPage(props: {
  searchParams?: Promise<{
    provider?: string;
    action?: string;
    actor?: string;
    time?: string;
    sort?: string;
    pageSize?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    notFound();
  }

  const searchParams = (await props.searchParams) ?? {};
  const providerFilter = normalizeProviderFilter(searchParams.provider);
  const actionFilter = normalizeActionFilter(searchParams.action);
  const timeFilter = normalizeTimeFilter(searchParams.time);
  const sortOrder = normalizeSortOrder(searchParams.sort);
  const pageSize = normalizePageSize(searchParams.pageSize);
  const searchQuery = normalizeSearchQuery(searchParams.q);
  const requestedPage = normalizePageNumber(searchParams.page);
  const history = await getProviderVerificationHistory(user.organizationId);
  const actorOptions = Array.from(
    new Map(
      history
        .filter((event) => event.actorEmail)
        .map((event) => [
          event.actorEmail as string,
          {
            value: event.actorEmail as string,
            label: event.actorName === event.actorEmail ? (event.actorEmail as string) : `${event.actorName} (${event.actorEmail})`,
          },
        ]),
    ).values(),
  );
  const actorFilter =
    searchParams.actor && actorOptions.some((option) => option.value === searchParams.actor)
      ? searchParams.actor
      : "all";
  const currentTimestamp = new Date().getTime();
  const presets: SetupHistoryPreset[] = [
    {
      label: "All events",
      providerFilter: "all",
      actionFilter: "all",
      actorFilter: "all",
      timeFilter: "all",
      sortOrder: "newest",
      pageSize: DEFAULT_PAGE_SIZE,
      searchQuery: "",
    },
    {
      label: "Reopened events",
      providerFilter: "all",
      actionFilter: "reopened",
      actorFilter: "all",
      timeFilter: "all",
      sortOrder: "newest",
      pageSize: DEFAULT_PAGE_SIZE,
      searchQuery: "",
    },
    {
      label: "Reopened this week",
      providerFilter: "all",
      actionFilter: "reopened",
      actorFilter: "all",
      timeFilter: "7d",
      sortOrder: "newest",
      pageSize: DEFAULT_PAGE_SIZE,
      searchQuery: "",
    },
    {
      label: "Verified events",
      providerFilter: "all",
      actionFilter: "verified",
      actorFilter: "all",
      timeFilter: "all",
      sortOrder: "newest",
      pageSize: DEFAULT_PAGE_SIZE,
      searchQuery: "",
    },
    {
      label: "Verified this week",
      providerFilter: "all",
      actionFilter: "verified",
      actorFilter: "all",
      timeFilter: "7d",
      sortOrder: "newest",
      pageSize: DEFAULT_PAGE_SIZE,
      searchQuery: "",
    },
    {
      label: "My changes",
      providerFilter: "all",
      actionFilter: "all",
      actorFilter: user.email,
      timeFilter: "all",
      sortOrder: "newest",
      pageSize: DEFAULT_PAGE_SIZE,
      searchQuery: "",
    },
    {
      label: "My reopened this week",
      providerFilter: "all",
      actionFilter: "reopened",
      actorFilter: user.email,
      timeFilter: "7d",
      sortOrder: "newest",
      pageSize: DEFAULT_PAGE_SIZE,
      searchQuery: "",
    },
  ];
  const resolveCutoffTimestamp = (value: string) =>
    value === "24h"
      ? new Date(currentTimestamp - 24 * 60 * 60 * 1000)
      : value === "7d"
        ? new Date(currentTimestamp - 7 * 24 * 60 * 60 * 1000)
        : value === "30d"
          ? new Date(currentTimestamp - 30 * 24 * 60 * 60 * 1000)
          : null;
  const presetCounts = new Map(
    presets.map((preset) => {
      const presetCutoff = resolveCutoffTimestamp(preset.timeFilter);
      const count = history.filter((event) => {
        const timeMatches = presetCutoff === null || event.createdAt >= presetCutoff;
        const providerMatches = preset.providerFilter === "all" || event.providerKey === preset.providerFilter;
        const actionMatches = preset.actionFilter === "all" || event.action === preset.actionFilter;
        const actorMatches = preset.actorFilter === "all" || event.actorEmail === preset.actorFilter;

        return timeMatches && providerMatches && actionMatches && actorMatches;
      }).length;

      return [preset.label, count] as const;
    }),
  );
  const cutoffTimestamp =
    timeFilter === "24h"
      ? new Date(currentTimestamp - 24 * 60 * 60 * 1000)
      : timeFilter === "7d"
        ? new Date(currentTimestamp - 7 * 24 * 60 * 60 * 1000)
        : timeFilter === "30d"
          ? new Date(currentTimestamp - 30 * 24 * 60 * 60 * 1000)
          : null;
  const timeScopedHistory = cutoffTimestamp ? history.filter((event) => event.createdAt >= cutoffTimestamp) : history;
  const providerActorScopedHistory = history.filter((event) => {
    const timeMatches = cutoffTimestamp === null || event.createdAt >= cutoffTimestamp;
    const providerMatches = providerFilter === "all" || event.providerKey === providerFilter;
    const actorMatches = actorFilter === "all" || event.actorEmail === actorFilter;
    const queryMatches =
      searchQuery.length === 0 ||
      event.providerLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.providerKey.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.actorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (event.actorEmail ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.action.toLowerCase().includes(searchQuery.toLowerCase());

    return timeMatches && providerMatches && actorMatches && queryMatches;
  });
  const actionSummary = providerActorScopedHistory.reduce(
    (summary, event) => {
      if (event.action === "verified") {
        summary.verified += 1;
      }

      if (event.action === "reopened") {
        summary.reopened += 1;
      }

      return summary;
    },
    { verified: 0, reopened: 0 },
  );
  const filteredHistory = timeScopedHistory.filter((event) => {
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

    return providerMatches && actionMatches && actorMatches && queryMatches;
  });
  const sortedFilteredHistory = sortOrder === "oldest" ? [...filteredHistory].reverse() : filteredHistory;
  const totalPages = Math.max(1, Math.ceil(sortedFilteredHistory.length / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedHistory = sortedFilteredHistory.slice(startIndex, startIndex + pageSize);
  const exportHref = buildHistoryHref({
    providerFilter,
    actionFilter,
    actorFilter,
    timeFilter,
    sortOrder,
    pageSize,
    searchQuery,
    page: currentPage,
    exportPath: true,
  });
  const exportFilteredHref = buildHistoryHref({
    providerFilter,
    actionFilter,
    actorFilter,
    timeFilter,
    sortOrder,
    pageSize,
    searchQuery,
    page: currentPage,
    exportPath: true,
    exportScope: "all",
  });
  const currentViewHref = buildHistoryHref({
    providerFilter,
    actionFilter,
    actorFilter,
    timeFilter,
    sortOrder,
    pageSize,
    searchQuery,
    page: currentPage,
  });
  const clearFiltersHref = buildHistoryHref({
    providerFilter: "all",
    actionFilter: "all",
    actorFilter: "all",
    timeFilter: "all",
    sortOrder: "newest",
    pageSize: DEFAULT_PAGE_SIZE,
    searchQuery: "",
    page: 1,
  });
  const activeFilterChips = [
    providerFilter !== "all"
      ? {
          key: "provider",
          label: `Provider: ${PROVIDER_FILTERS.find((option) => option.value === providerFilter)?.label ?? providerFilter}`,
          href: buildHistoryHref({
            providerFilter: "all",
            actionFilter,
            actorFilter,
            timeFilter,
            sortOrder,
            pageSize,
            searchQuery,
            page: 1,
          }),
        }
      : null,
    actionFilter !== "all"
      ? {
          key: "action",
          label: `Action: ${ACTION_FILTERS.find((option) => option.value === actionFilter)?.label ?? actionFilter}`,
          href: buildHistoryHref({
            providerFilter,
            actionFilter: "all",
            actorFilter,
            timeFilter,
            sortOrder,
            pageSize,
            searchQuery,
            page: 1,
          }),
        }
      : null,
    actorFilter !== "all"
      ? {
          key: "actor",
          label: `Actor: ${actorOptions.find((option) => option.value === actorFilter)?.label ?? actorFilter}`,
          href: buildHistoryHref({
            providerFilter,
            actionFilter,
            actorFilter: "all",
            timeFilter,
            sortOrder,
            pageSize,
            searchQuery,
            page: 1,
          }),
        }
      : null,
    timeFilter !== "all"
      ? {
          key: "time",
          label: `Time: ${TIME_FILTERS.find((option) => option.value === timeFilter)?.label ?? timeFilter}`,
          href: buildHistoryHref({
            providerFilter,
            actionFilter,
            actorFilter,
            timeFilter: "all",
            sortOrder,
            pageSize,
            searchQuery,
            page: 1,
          }),
        }
      : null,
    sortOrder !== "newest"
      ? {
          key: "sort",
          label: `Sort: ${SORT_FILTERS.find((option) => option.value === sortOrder)?.label ?? sortOrder}`,
          href: buildHistoryHref({
            providerFilter,
            actionFilter,
            actorFilter,
            timeFilter,
            sortOrder: "newest",
            pageSize,
            searchQuery,
            page: 1,
          }),
        }
      : null,
    pageSize !== DEFAULT_PAGE_SIZE
      ? {
          key: "pageSize",
          label: `Page size: ${pageSize}`,
          href: buildHistoryHref({
            providerFilter,
            actionFilter,
            actorFilter,
            timeFilter,
            sortOrder,
            pageSize: DEFAULT_PAGE_SIZE,
            searchQuery,
            page: 1,
          }),
        }
      : null,
    searchQuery.length > 0
      ? {
          key: "search",
          label: `Search: ${searchQuery}`,
          href: buildHistoryHref({
            providerFilter,
            actionFilter,
            actorFilter,
            timeFilter,
            sortOrder,
            pageSize,
            searchQuery: "",
            page: 1,
          }),
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; href: string }>;

  return (
    <WorkspaceShell user={user}>
      <section className="grid gap-6 xl:grid-cols-[0.86fr_1.14fr]">
        <article className="rounded-[32px] bg-slate-950 p-8 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-teal-300">Setup History</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Provider verification audit trail</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
            Follow who marked each provider area verified, when it was reopened for recheck, and how the setup posture
            has changed over time.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/admin/setup"
              className="rounded-full bg-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300"
            >
              Return to setup
            </Link>
            <Link
              href="/admin/sends"
              className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-white transition hover:border-slate-500"
            >
              Open send operations
            </Link>
          </div>
        </article>

        <article
          className="rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-lg shadow-slate-200/40"
          data-provider-verification-history
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Recent Events</p>
              {providerFilter !== "all" ||
              actionFilter !== "all" ||
              actorFilter !== "all" ||
              timeFilter !== "all" ||
              sortOrder !== "newest" ||
              searchQuery.length > 0 ? (
                <>
                  <p className="mt-2 text-sm text-slate-600" data-provider-history-filter-summary>
                    Showing {filteredHistory.length} event{filteredHistory.length === 1 ? "" : "s"}
                    {providerFilter !== "all"
                      ? ` for ${PROVIDER_FILTERS.find((option) => option.value === providerFilter)?.label}`
                      : ""}
                    {actionFilter !== "all"
                      ? `${providerFilter !== "all" ? " with " : " for "}${ACTION_FILTERS.find((option) => option.value === actionFilter)?.label.toLowerCase()} actions`
                      : ""}
                    {actorFilter !== "all"
                      ? `${providerFilter !== "all" || actionFilter !== "all" ? " by " : " for "} ${
                          actorOptions.find((option) => option.value === actorFilter)?.label
                        }`
                      : ""}
                    {timeFilter !== "all"
                      ? `${providerFilter !== "all" || actionFilter !== "all" || actorFilter !== "all" ? " in " : " for "}${
                          TIME_FILTERS.find((option) => option.value === timeFilter)?.label?.toLowerCase() ?? "selected range"
                        }`
                      : ""}
                    {sortOrder !== "newest"
                      ? `${providerFilter !== "all" || actionFilter !== "all" || actorFilter !== "all" || timeFilter !== "all" ? ", " : " sorted "}${
                          SORT_FILTERS.find((option) => option.value === sortOrder)?.label.toLowerCase() ?? "oldest first"
                        }`
                      : ""}
                    {searchQuery.length > 0
                      ? `${providerFilter !== "all" || actionFilter !== "all" || actorFilter !== "all" || timeFilter !== "all" || sortOrder !== "newest" ? ", " : " matching "}“${searchQuery}”`
                      : ""}
                    .
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2" data-setup-history-active-filters>
                    {activeFilterChips.map((chip) => (
                      <Link
                        key={chip.key}
                        href={chip.href}
                        aria-label={`Remove ${chip.key} filter`}
                        className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                      >
                        {chip.label}
                      </Link>
                    ))}
                    {activeFilterChips.length > 1 ? (
                      <Link
                        href={clearFiltersHref}
                        className="rounded-full border border-slate-300 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                        data-setup-history-clear-all
                      >
                        Clear all
                      </Link>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
            <div className="space-y-3">
              <form method="GET" className="flex flex-wrap items-center gap-2" data-provider-history-search>
                {providerFilter !== "all" ? <input type="hidden" name="provider" value={providerFilter} /> : null}
                {actionFilter !== "all" ? <input type="hidden" name="action" value={actionFilter} /> : null}
                {actorFilter !== "all" ? <input type="hidden" name="actor" value={actorFilter} /> : null}
                {timeFilter !== "all" ? <input type="hidden" name="time" value={timeFilter} /> : null}
                {sortOrder !== "newest" ? <input type="hidden" name="sort" value={sortOrder} /> : null}
                {pageSize !== DEFAULT_PAGE_SIZE ? <input type="hidden" name="pageSize" value={String(pageSize)} /> : null}
                <input
                  type="search"
                  name="q"
                  defaultValue={searchQuery}
                  placeholder="Search actor, provider, or action"
                  className="min-w-[240px] flex-1 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400"
                />
                <button
                  type="submit"
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Apply search
                </button>
                {searchQuery.length > 0 ? (
                  <Link
                    href={buildHistoryHref({
                      providerFilter,
                      actionFilter,
                      actorFilter,
                      timeFilter,
                      sortOrder,
                      pageSize,
                      searchQuery: "",
                      page: 1,
                    })}
                    className="text-xs font-semibold text-teal-700 transition hover:text-teal-900"
                  >
                    Clear search
                  </Link>
                ) : null}
              </form>
              <div className="flex flex-wrap gap-2" data-provider-history-filters>
              {PROVIDER_FILTERS.map((filter) => {
                const isActive = filter.value === providerFilter;

                return (
                  <Link
                    key={filter.value}
                    href={buildHistoryHref({
                      providerFilter: filter.value,
                      actionFilter,
                      actorFilter,
                      timeFilter,
                      sortOrder,
                      pageSize,
                      searchQuery,
                      page: 1,
                    })}
                    aria-current={isActive ? "page" : undefined}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      isActive
                        ? "bg-slate-950 text-white"
                        : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                    }`}
                  >
                    {filter.label}
                  </Link>
                );
              })}
              </div>
              <div className="flex flex-wrap gap-2" data-provider-history-action-filters>
                {ACTION_FILTERS.map((filter) => {
                  const isActive = filter.value === actionFilter;

                  return (
                    <Link
                      key={filter.value}
                      href={buildHistoryHref({
                        providerFilter,
                        actionFilter: filter.value,
                        actorFilter,
                        timeFilter,
                        sortOrder,
                        pageSize,
                        searchQuery,
                        page: 1,
                      })}
                      aria-current={isActive ? "page" : undefined}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        isActive
                          ? "bg-slate-950 text-white"
                          : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                      }`}
                    >
                      {filter.label}
                    </Link>
                  );
                })}
              </div>
              <div className="grid gap-2 sm:grid-cols-2" data-provider-history-action-summary>
                <Link
                  href={buildHistoryHref({
                    providerFilter,
                    actionFilter: "verified",
                    actorFilter,
                    timeFilter,
                    sortOrder,
                    pageSize,
                    searchQuery,
                    page: 1,
                  })}
                  className={`rounded-2xl border px-3 py-2 text-sm transition ${
                    actionFilter === "verified"
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-slate-300 bg-white hover:border-emerald-200 hover:bg-emerald-50/60"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-900">Verified</p>
                  <p className="mt-1 text-xl font-semibold text-slate-950">{actionSummary.verified}</p>
                </Link>
                <Link
                  href={buildHistoryHref({
                    providerFilter,
                    actionFilter: "reopened",
                    actorFilter,
                    timeFilter,
                    sortOrder,
                    pageSize,
                    searchQuery,
                    page: 1,
                  })}
                  className={`rounded-2xl border px-3 py-2 text-sm transition ${
                    actionFilter === "reopened"
                      ? "border-amber-300 bg-amber-50"
                      : "border-slate-300 bg-white hover:border-amber-200 hover:bg-amber-50/60"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-900">Reopened</p>
                  <p className="mt-1 text-xl font-semibold text-slate-950">{actionSummary.reopened}</p>
                </Link>
              </div>
              <div className="flex flex-wrap gap-2" data-setup-history-presets>
                {presets.map((preset) => {
                  const isActive =
                    preset.providerFilter === providerFilter &&
                    preset.actionFilter === actionFilter &&
                    preset.actorFilter === actorFilter &&
                    preset.timeFilter === timeFilter &&
                    preset.sortOrder === sortOrder &&
                    preset.pageSize === pageSize &&
                    preset.searchQuery === searchQuery;

                  return (
                    <Link
                      key={preset.label}
                      href={buildHistoryHref({
                        providerFilter: preset.providerFilter,
                        actionFilter: preset.actionFilter,
                        actorFilter: preset.actorFilter,
                        timeFilter: preset.timeFilter,
                        sortOrder: preset.sortOrder,
                        pageSize: preset.pageSize,
                        searchQuery: preset.searchQuery,
                        page: 1,
                      })}
                      aria-current={isActive ? "page" : undefined}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        isActive
                          ? "bg-slate-950 text-white"
                          : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                      }`}
                    >
                      {preset.label}
                      <span className="ml-1 text-xs font-semibold opacity-80" data-setup-history-preset-count>
                        ({presetCounts.get(preset.label) ?? 0})
                      </span>
                    </Link>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2" data-provider-history-actor-filters>
                <Link
                  href={buildHistoryHref({
                    providerFilter,
                    actionFilter,
                    actorFilter: "all",
                    timeFilter,
                    sortOrder,
                    pageSize,
                    searchQuery,
                    page: 1,
                  })}
                  aria-current={actorFilter === "all" ? "page" : undefined}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    actorFilter === "all"
                      ? "bg-slate-950 text-white"
                      : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                  }`}
                >
                  All actors
                </Link>
                {actorOptions.map((actor) => (
                  <Link
                    key={actor.value}
                    href={buildHistoryHref({
                      providerFilter,
                      actionFilter,
                      actorFilter: actor.value,
                      timeFilter,
                      sortOrder,
                      pageSize,
                      searchQuery,
                      page: 1,
                    })}
                    aria-current={actor.value === actorFilter ? "page" : undefined}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      actor.value === actorFilter
                        ? "bg-slate-950 text-white"
                        : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                    }`}
                  >
                    {actor.label}
                  </Link>
                ))}
              </div>
              <div className="flex flex-wrap gap-2" data-provider-history-time-filters>
                {TIME_FILTERS.map((filter) => {
                  const isActive = filter.value === timeFilter;

                  return (
                    <Link
                      key={filter.value}
                      href={buildHistoryHref({
                        providerFilter,
                        actionFilter,
                        actorFilter,
                        timeFilter: filter.value,
                        sortOrder,
                        pageSize,
                        searchQuery,
                        page: 1,
                      })}
                      aria-current={isActive ? "page" : undefined}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        isActive
                          ? "bg-slate-950 text-white"
                          : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                      }`}
                    >
                      {filter.label}
                    </Link>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2" data-provider-history-sort-filters>
                {SORT_FILTERS.map((filter) => {
                  const isActive = filter.value === sortOrder;

                  return (
                    <Link
                      key={filter.value}
                      href={buildHistoryHref({
                        providerFilter,
                        actionFilter,
                        actorFilter,
                        timeFilter,
                        sortOrder: filter.value,
                        pageSize,
                        searchQuery,
                        page: 1,
                      })}
                      aria-current={isActive ? "page" : undefined}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        isActive
                          ? "bg-slate-950 text-white"
                          : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                      }`}
                    >
                      {filter.label}
                    </Link>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2" data-provider-history-page-size-filters>
                {PAGE_SIZE_OPTIONS.map((size) => {
                  const isActive = size === pageSize;

                  return (
                    <Link
                      key={size}
                      href={buildHistoryHref({
                        providerFilter,
                        actionFilter,
                        actorFilter,
                        timeFilter,
                        sortOrder,
                        pageSize: size,
                        searchQuery,
                        page: 1,
                      })}
                      aria-current={isActive ? "page" : undefined}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        isActive
                          ? "bg-slate-950 text-white"
                          : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                      }`}
                    >
                      {size} per page
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="mt-5 space-y-3" data-provider-verification-events>
            {paginatedHistory.length ? (
              paginatedHistory.map((event) => (
                <article key={event.id} className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-slate-950">{event.providerLabel}</p>
                      <p className="mt-1 text-sm text-slate-600">{formatDate(event.createdAt, "MMM d, yyyy h:mm a")}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${getStatusBadgeClasses(
                        event.action,
                      )}`}
                    >
                      {event.action === "verified" ? "Verified" : "Reopened"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">
                    {event.actorName} marked this provider {event.action === "verified" ? "verified" : "for recheck"}.
                  </p>
                </article>
              ))
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <p className="text-sm leading-7 text-slate-600">
                  {providerFilter === "all" &&
                  actionFilter === "all" &&
                  actorFilter === "all" &&
                  timeFilter === "all" &&
                  sortOrder === "newest" &&
                  searchQuery.length === 0
                    ? "No provider verification history has been recorded yet."
                    : "No provider verification events match the current filters."}
                </p>
                {providerFilter !== "all" ||
                actionFilter !== "all" ||
                actorFilter !== "all" ||
                timeFilter !== "all" ||
                sortOrder !== "newest" ||
                pageSize !== DEFAULT_PAGE_SIZE ||
                searchQuery.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-3 text-sm" data-setup-history-empty-actions>
                    <Link href={clearFiltersHref} className="font-semibold text-teal-700 transition hover:text-teal-900">
                      Clear filters
                    </Link>
                    <Link
                      href={buildHistoryHref({
                        providerFilter: "all",
                        actionFilter: "reopened",
                        actorFilter: "all",
                        timeFilter: "7d",
                        sortOrder: "newest",
                        pageSize: DEFAULT_PAGE_SIZE,
                        searchQuery: "",
                        page: 1,
                      })}
                      className="font-semibold text-teal-700 transition hover:text-teal-900"
                    >
                      Reopened this week
                    </Link>
                  </div>
                ) : null}
              </div>
            )}
          </div>
          {filteredHistory.length ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
              <p data-setup-history-page-summary>
                Page {currentPage} of {totalPages}
              </p>
              <p>
                Showing {paginatedHistory.length} of {filteredHistory.length} matching event
                {filteredHistory.length === 1 ? "" : "s"} ({pageSize} per page).
              </p>
            </div>
          ) : null}
          <div
            data-setup-history-share-view
            className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-700"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Share Current View</p>
              <Link
                href={clearFiltersHref}
                className="text-xs font-semibold text-teal-700 transition hover:text-teal-900"
              >
                Clear filters
              </Link>
            </div>
            <input
              readOnly
              value={currentViewHref}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700"
              data-setup-history-share-url
            />
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Link
              href={exportFilteredHref}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50"
              data-export-setup-history-filtered
            >
              Export filtered CSV
            </Link>
            <Link
              href={exportHref}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50"
              data-export-setup-history
            >
              Export current page CSV
            </Link>
          </div>
          {totalPages > 1 ? (
            <nav className="mt-5 flex flex-wrap items-center justify-between gap-3" aria-label="Setup history pagination">
              <Link
                href={buildHistoryHref({
                  providerFilter,
                  actionFilter,
                  actorFilter,
                  timeFilter,
                  sortOrder,
                  pageSize,
                  searchQuery,
                  page: Math.max(1, currentPage - 1),
                })}
                aria-disabled={currentPage === 1}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  currentPage === 1
                    ? "pointer-events-none border border-slate-200 bg-slate-100 text-slate-400"
                    : "border border-slate-300 bg-white text-slate-900 hover:border-slate-400 hover:bg-slate-50"
                }`}
              >
                Newer events
              </Link>
              <div className="flex items-center gap-2 text-sm text-slate-600" data-setup-history-pagination>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                  <Link
                    key={pageNumber}
                    href={buildHistoryHref({
                      providerFilter,
                      actionFilter,
                      actorFilter,
                      timeFilter,
                      sortOrder,
                      pageSize,
                      searchQuery,
                      page: pageNumber,
                    })}
                    aria-current={pageNumber === currentPage ? "page" : undefined}
                    className={`rounded-full px-3 py-1.5 font-semibold transition ${
                      pageNumber === currentPage
                        ? "bg-slate-950 text-white"
                        : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                    }`}
                  >
                    {pageNumber}
                  </Link>
                ))}
              </div>
              <Link
                href={buildHistoryHref({
                  providerFilter,
                  actionFilter,
                  actorFilter,
                  timeFilter,
                  sortOrder,
                  pageSize,
                  searchQuery,
                  page: Math.min(totalPages, currentPage + 1),
                })}
                aria-disabled={currentPage === totalPages}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  currentPage === totalPages
                    ? "pointer-events-none border border-slate-200 bg-slate-100 text-slate-400"
                    : "border border-slate-300 bg-white text-slate-900 hover:border-slate-400 hover:bg-slate-50"
                }`}
              >
                Older events
              </Link>
            </nav>
          ) : null}
        </article>
      </section>
    </WorkspaceShell>
  );
}
