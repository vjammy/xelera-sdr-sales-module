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

function buildHistoryHref(args: {
  providerFilter: string;
  actionFilter: string;
  actorFilter: string;
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

  const query = params.toString();
  return query ? `/admin/setup/history?${query}` : "/admin/setup/history";
}

export default async function SetupHistoryPage(props: {
  searchParams?: Promise<{ provider?: string; action?: string; actor?: string }>;
}) {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    notFound();
  }

  const searchParams = (await props.searchParams) ?? {};
  const providerFilter = normalizeProviderFilter(searchParams.provider);
  const actionFilter = normalizeActionFilter(searchParams.action);
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
  const filteredHistory = history.filter((event) => {
    const providerMatches = providerFilter === "all" || event.providerKey === providerFilter;
    const actionMatches = actionFilter === "all" || event.action === actionFilter;
    const actorMatches = actorFilter === "all" || event.actorEmail === actorFilter;

    return providerMatches && actionMatches && actorMatches;
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
              {providerFilter !== "all" || actionFilter !== "all" || actorFilter !== "all" ? (
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
              <div className="flex flex-wrap gap-2" data-provider-history-actor-filters>
                <Link
                  href={buildHistoryHref({
                    providerFilter,
                    actionFilter,
                    actorFilter: "all",
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
            </div>
          </div>
          <div className="mt-5 space-y-3" data-provider-verification-events>
            {filteredHistory.length ? (
              filteredHistory.map((event) => (
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
                {providerFilter === "all" && actionFilter === "all" && actorFilter === "all"
                  ? "No provider verification history has been recorded yet."
                  : "No provider verification events match the current filters."}
              </p>
            )}
          </div>
        </article>
      </section>
    </WorkspaceShell>
  );
}
