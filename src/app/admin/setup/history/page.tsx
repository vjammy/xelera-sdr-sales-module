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
const SETUP_HISTORY_PER_PAGE = 8;

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

function normalizePageNumber(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

function buildHistoryHref(args: {
  providerFilter: string;
  actionFilter: string;
  actorFilter: string;
  timeFilter: string;
  page?: number;
  exportPath?: boolean;
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

  if ((args.page ?? 1) > 1) {
    params.set("page", String(args.page));
  }

  const query = params.toString();
  const basePath = args.exportPath ? "/admin/setup/history/export" : "/admin/setup/history";
  return query ? `${basePath}?${query}` : basePath;
}

export default async function SetupHistoryPage(props: {
  searchParams?: Promise<{ provider?: string; action?: string; actor?: string; time?: string; page?: string }>;
}) {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    notFound();
  }

  const searchParams = (await props.searchParams) ?? {};
  const providerFilter = normalizeProviderFilter(searchParams.provider);
  const actionFilter = normalizeActionFilter(searchParams.action);
  const timeFilter = normalizeTimeFilter(searchParams.time);
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
  const presets = [
    {
      label: "All events",
      providerFilter: "all",
      actionFilter: "all",
      actorFilter: "all",
      timeFilter: "all",
    },
    {
      label: "Reopened events",
      providerFilter: "all",
      actionFilter: "reopened",
      actorFilter: "all",
      timeFilter: "all",
    },
    {
      label: "Verified events",
      providerFilter: "all",
      actionFilter: "verified",
      actorFilter: "all",
      timeFilter: "all",
    },
    {
      label: "My changes",
      providerFilter: "all",
      actionFilter: "all",
      actorFilter: user.email,
      timeFilter: "all",
    },
  ];
  const currentTimestamp = new Date().getTime();
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

    return timeMatches && providerMatches && actorMatches;
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

    return providerMatches && actionMatches && actorMatches;
  });
  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / SETUP_HISTORY_PER_PAGE));
  const currentPage = Math.min(requestedPage, totalPages);
  const startIndex = (currentPage - 1) * SETUP_HISTORY_PER_PAGE;
  const paginatedHistory = filteredHistory.slice(startIndex, startIndex + SETUP_HISTORY_PER_PAGE);
  const exportHref = buildHistoryHref({
    providerFilter,
    actionFilter,
    actorFilter,
    timeFilter,
    page: currentPage,
    exportPath: true,
  });

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
              {providerFilter !== "all" || actionFilter !== "all" || actorFilter !== "all" || timeFilter !== "all" ? (
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
                  .
                </p>
              ) : null}
            </div>
            <div className="space-y-3">
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
                    preset.timeFilter === timeFilter;

                  return (
                    <Link
                      key={preset.label}
                      href={buildHistoryHref({
                        providerFilter: preset.providerFilter,
                        actionFilter: preset.actionFilter,
                        actorFilter: preset.actorFilter,
                        timeFilter: preset.timeFilter,
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
              <p className="text-sm leading-7 text-slate-600">
                {providerFilter === "all" && actionFilter === "all" && actorFilter === "all" && timeFilter === "all"
                  ? "No provider verification history has been recorded yet."
                  : "No provider verification events match the current filters."}
              </p>
            )}
          </div>
          {filteredHistory.length ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
              <p data-setup-history-page-summary>
                Page {currentPage} of {totalPages}
              </p>
              <p>
                Showing {paginatedHistory.length} of {filteredHistory.length} matching event
                {filteredHistory.length === 1 ? "" : "s"}.
              </p>
            </div>
          ) : null}
          <div className="mt-4 flex justify-end">
            <Link
              href={exportHref}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50"
              data-export-setup-history
            >
              Export current view CSV
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
