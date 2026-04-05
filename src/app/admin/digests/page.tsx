import Link from "next/link";
import { notFound } from "next/navigation";
import { retryInviteDigestRecipientsAction, runInviteDigestNowAction } from "@/app/actions";
import { ShareLinkPanel } from "@/components/share-link-panel";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireUser } from "@/lib/auth";
import { getOrganizationInviteDigestHistory } from "@/lib/data";
import {
  buildDigestExportHref,
  buildDigestHref,
  filterDigestHistory,
  normalizeFilterState,
  normalizePageNumber,
  type DigestFilterState,
  paginateDigestHistory,
} from "@/lib/invite-digest-view";
import { canManageUsers } from "@/lib/permissions";

function isPresetActive(args: {
  presetState: DigestFilterState;
  presetRecipientQuery: string;
  activeState: DigestFilterState;
  activeRecipientQuery: string;
}) {
  return args.presetState === args.activeState && args.presetRecipientQuery === args.activeRecipientQuery;
}

function getRetryOutcomeLabel(args: {
  deliveryState: string;
  isTargetedRetry: boolean;
}) {
  if (!args.isTargetedRetry) {
    return null;
  }

  if (args.deliveryState === "sent") {
    return "Recovered on retry";
  }

  if (args.deliveryState === "manual" || args.deliveryState === "failed") {
    return "Still needs attention";
  }

  return "Skipped on retry";
}

function getRecipientIssueBadge(delivery: {
  issueState: string;
  recentAttentionRuns: number;
  currentAttentionStreak: number;
  reviewActorName: string | null;
  reviewActorEmail: string | null;
  reviewCreatedAt: Date | null;
}) {
  if (delivery.issueState === "active_issue") {
    return {
      label: "Unresolved repeated issue",
      detail: `${delivery.recentAttentionRuns} attention runs, streak ${delivery.currentAttentionStreak}`,
      className: "bg-amber-100 text-amber-950",
    };
  }

  if (delivery.issueState === "reviewed") {
    return {
      label: "Reviewed issue",
      detail: `${delivery.reviewActorName ?? delivery.reviewActorEmail ?? "Manager"} reviewed it`,
      className: "bg-emerald-100 text-emerald-950",
    };
  }

  return null;
}

export default async function DigestOpsPage(props: {
  searchParams?: Promise<{ state?: string; recipient?: string; page?: string }>;
}) {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    notFound();
  }

  const searchParams = (await props.searchParams) ?? {};
  const filterState = normalizeFilterState(searchParams.state);
  const recipientQuery = searchParams.recipient?.trim() ?? "";
  const requestedPage = normalizePageNumber(searchParams.page);
  const history = await getOrganizationInviteDigestHistory(user.organizationId);
  const filteredHistory = filterDigestHistory(history, filterState, recipientQuery);
  const { currentPage, totalPages, paginatedHistory } = paginateDigestHistory(filteredHistory, requestedPage);
  const formatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const currentViewPath = buildDigestHref({
    page: currentPage,
    state: filterState,
    recipientQuery,
  });
  const exportHref = buildDigestExportHref({
    page: currentPage,
    state: filterState,
    recipientQuery,
  });
  const shareUrl = new URL(currentViewPath, appUrl).toString();
  const presets = [
    {
      label: "All runs",
      state: "all" as DigestFilterState,
      recipientQuery: "",
    },
    {
      label: "Targeted retries",
      state: "retry" as DigestFilterState,
      recipientQuery: "",
    },
    {
      label: "Failed deliveries",
      state: "failed" as DigestFilterState,
      recipientQuery: "",
    },
    {
      label: "Manual fallback",
      state: "manual" as DigestFilterState,
      recipientQuery: "",
    },
    {
      label: "My deliveries",
      state: "all" as DigestFilterState,
      recipientQuery: user.email,
    },
  ];

  return (
    <WorkspaceShell user={user}>
      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-[32px] bg-slate-950 p-8 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-teal-300">Digest Operations</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Organization-wide invite hygiene delivery history
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
            Review recent scheduled digest runs, see who received each reminder, and spot fallback or failure states
            without opening every individual profile.
          </p>
          <form action={runInviteDigestNowAction} className="mt-6">
            <button
              type="submit"
              className="rounded-full bg-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300"
            >
              Run digest now
            </button>
          </form>
        </article>

        <article className="rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-lg shadow-slate-200/40">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Recent Runs</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                Latest invite hygiene digests
              </h2>
            </div>
          </div>
          <form className="mt-5 grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 lg:grid-cols-[220px_minmax(0,1fr)_auto_auto]">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Run state
              <select
                name="state"
                defaultValue={filterState}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              >
                <option value="all">All runs</option>
                <option value="sent">Emailed</option>
                <option value="manual">Manual fallback</option>
                <option value="failed">Failed</option>
                <option value="skipped">Skipped</option>
                <option value="retry">Targeted retries</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Recipient
              <input
                type="search"
                name="recipient"
                defaultValue={recipientQuery}
                placeholder="Filter by recipient email"
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
              />
            </label>
            <input type="hidden" name="page" value="1" />
            <button
              type="submit"
              className="self-end rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Apply filters
            </button>
            <Link
              href="/admin/digests"
              className="self-end rounded-full border border-slate-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Clear
            </Link>
          </form>
          <div className="mt-4 flex flex-wrap items-center gap-2" data-digest-presets>
            {presets.map((preset) => {
              const active = isPresetActive({
                presetState: preset.state,
                presetRecipientQuery: preset.recipientQuery,
                activeState: filterState,
                activeRecipientQuery: recipientQuery,
              });

              return (
                <Link
                  key={`${preset.label}-${preset.state}-${preset.recipientQuery}`}
                  href={buildDigestHref({
                    page: 1,
                    state: preset.state,
                    recipientQuery: preset.recipientQuery,
                  })}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    active
                      ? "bg-slate-950 text-white"
                      : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                  }`}
                >
                  {preset.label}
                </Link>
              );
            })}
          </div>
          <div className="mt-4">
            <ShareLinkPanel
              title="Share this view"
              description="Copy the current filters and page into a direct link so another manager lands on the same digest investigation view."
              url={shareUrl}
            />
          </div>
          <div className="mt-3 flex justify-end">
            <Link
              href={exportHref}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50"
              data-export-digest-view
            >
              Export current view CSV
            </Link>
          </div>
          {filterState !== "all" || recipientQuery ? (
            <p className="mt-4 text-sm text-slate-600" data-digest-filter-summary>
              Showing {filteredHistory.length} run{filteredHistory.length === 1 ? "" : "s"}
              {filterState !== "all" ? ` for ${filterState === "retry" ? "targeted retries" : filterState}` : ""}
              {recipientQuery ? `${filterState !== "all" ? " matching" : " matching"} "${recipientQuery}"` : ""}.
            </p>
          ) : null}
          {filteredHistory.length ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
              <p data-digest-page-summary>
                Page {currentPage} of {totalPages}
              </p>
              <p>
                Showing {paginatedHistory.length} of {filteredHistory.length} matching run
                {filteredHistory.length === 1 ? "" : "s"}.
              </p>
            </div>
          ) : null}

          {paginatedHistory.length ? (
            <div className="mt-6 space-y-4" data-digest-ops-history>
              {paginatedHistory.map((entry) => (
                <article
                  key={entry.id}
                  className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5"
                  data-digest-run-id={entry.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-slate-950">
                        {entry.action === "sent"
                          ? "Digest emailed"
                          : entry.action === "manual"
                            ? "Manual fallback"
                            : entry.action === "failed"
                              ? "Digest failed"
                              : "Digest skipped"}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">{formatter.format(entry.createdAt)}</p>
                    </div>
                    <div className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">
                      {entry.alertCount} alerts
                    </div>
                  </div>
                  {entry.isTargetedRetry ? (
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-teal-900">
                        Retry attempted
                      </span>
                      <p className="text-sm text-slate-600">
                        Requested recipients: {entry.requestedRecipients.join(", ")}
                      </p>
                    </div>
                  ) : null}
                  {entry.retryableRecipientCount > 0 ? (
                    <form action={retryInviteDigestRecipientsAction.bind(null, entry.id)} className="mt-4">
                      <button
                        type="submit"
                        className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50"
                      >
                        Retry manual and failed recipients
                      </button>
                    </form>
                  ) : null}

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Stale</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">{entry.staleCount}</p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Expiring Soon</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">{entry.expiringSoonCount}</p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Recipients</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">{entry.recipients.length}</p>
                    </div>
                  </div>

                  <div className="mt-5 overflow-hidden rounded-[20px] border border-slate-200 bg-white">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Recipient</th>
                          <th className="px-4 py-3 font-semibold">State</th>
                          <th className="px-4 py-3 font-semibold">Preference</th>
                          <th className="px-4 py-3 font-semibold">Alerts</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {entry.recipientDeliveries.map((delivery) => {
                          const issueBadge = getRecipientIssueBadge(delivery);

                          return (
                          <tr key={delivery.id}>
                            <td className="px-4 py-3 text-slate-700">
                              <Link
                                href={`/admin/digests/recipient?email=${encodeURIComponent(delivery.email)}`}
                                className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-700 hover:decoration-slate-500"
                              >
                                {delivery.email}
                              </Link>
                              {issueBadge ? (
                                <div className="mt-2">
                                  <span
                                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${issueBadge.className}`}
                                  >
                                    {issueBadge.label}
                                  </span>
                                  <p className="mt-1 text-xs text-slate-500">{issueBadge.detail}</p>
                                </div>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              <div>{delivery.deliveryState.replaceAll("_", " ")}</div>
                              {getRetryOutcomeLabel({
                                deliveryState: delivery.deliveryState,
                                isTargetedRetry: entry.isTargetedRetry,
                              }) ? (
                                <div className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                                  {getRetryOutcomeLabel({
                                    deliveryState: delivery.deliveryState,
                                    isTargetedRetry: entry.isTargetedRetry,
                                  })}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-slate-700">{delivery.preference.replaceAll("_", " ")}</td>
                            <td className="px-4 py-3 text-slate-700">
                              {delivery.alertCount} total · {delivery.staleCount} stale · {delivery.expiringSoonCount} soon
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-sm leading-7 text-slate-600">
              {filterState !== "all" || recipientQuery
                ? "No digest runs match the current filters."
                : "No invite hygiene digest runs have been recorded for this organization yet."}
            </p>
          )}
          {totalPages > 1 ? (
            <nav className="mt-6 flex flex-wrap items-center justify-between gap-3" aria-label="Digest history pagination">
              <Link
                href={buildDigestHref({
                  page: Math.max(1, currentPage - 1),
                  state: filterState,
                  recipientQuery,
                })}
                aria-disabled={currentPage === 1}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  currentPage === 1
                    ? "pointer-events-none border border-slate-200 bg-slate-100 text-slate-400"
                    : "border border-slate-300 bg-white text-slate-900 hover:border-slate-400 hover:bg-slate-50"
                }`}
              >
                Newer runs
              </Link>
              <div className="flex items-center gap-2 text-sm text-slate-600" data-digest-pagination>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                  <Link
                    key={pageNumber}
                    href={buildDigestHref({
                      page: pageNumber,
                      state: filterState,
                      recipientQuery,
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
                href={buildDigestHref({
                  page: Math.min(totalPages, currentPage + 1),
                  state: filterState,
                  recipientQuery,
                })}
                aria-disabled={currentPage === totalPages}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  currentPage === totalPages
                    ? "pointer-events-none border border-slate-200 bg-slate-100 text-slate-400"
                    : "border border-slate-300 bg-white text-slate-900 hover:border-slate-400 hover:bg-slate-50"
                }`}
              >
                Older runs
              </Link>
            </nav>
          ) : null}
        </article>
      </section>
    </WorkspaceShell>
  );
}
