import Link from "next/link";
import { rotateExpiringInvitesDashboardAction } from "@/app/actions";
import { MetricCard } from "@/components/metric-card";
import { StatusPill } from "@/components/status-pill";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { canManageUsers } from "@/lib/permissions";

function formatInviteAge(date: Date) {
  const hours = Math.max(1, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60)));
  if (hours < 24) {
    return `${hours}h`;
  }

  return `${Math.floor(hours / 24)}d`;
}

export default async function Home() {
  const user = await requireUser();
  const { leadLists, metrics, staleInviteAlerts, expiringSoonInviteAlerts, inviteIssueSummary } =
    await getDashboardData(user);

  return (
    <WorkspaceShell user={user}>
      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[36px] border border-white/70 bg-slate-950 px-8 py-10 text-white shadow-xl shadow-slate-300/30">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-teal-300">Core Flow</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight">
            Intake event leads, enrich them, draft sequences, and keep humans in charge before approval.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
            Reps review lead-by-lead. Managers only bulk approve sequences that are already review-ready.
            That keeps trust high while still making volume manageable after a conference.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/upload"
              className="rounded-full bg-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300"
            >
              Upload a new lead list
            </Link>
            <Link
              href="/lists"
              className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-white transition hover:border-slate-500"
            >
              Open operating view
            </Link>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <MetricCard label="Lead Lists" value={metrics.listCount} hint="Uploaded event or conference lists." />
          <MetricCard label="Leads" value={metrics.leadCount} hint="Stored records in the current workspace." />
          <MetricCard label="Review Ready" value={metrics.reviewReadyCount} hint="Safe to open and approve now." />
          <MetricCard label="Approved" value={metrics.approvedCount} hint="Explicitly approved by a human." />
          <MetricCard label="Research Complete" value={metrics.researchCompleteCount} hint="Company and contact context ready." />
          <MetricCard label="Active Products" value={metrics.activeProductCount} hint="Available positioning angles." />
        </div>
      </section>

      <section className="mt-8 rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-lg shadow-slate-200/40">
        {canManageUsers(user.role) &&
        (staleInviteAlerts.length > 0 || expiringSoonInviteAlerts.length > 0) ? (
          <div
            data-dashboard-invite-hygiene-summary
            className="mb-6 rounded-[28px] border border-slate-200 bg-slate-50/90 px-5 py-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Invite Hygiene</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  Aging activation links need attention before onboarding slips
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                  Spot stale pending invites and links that are close to expiring, then jump straight into the filtered
                  onboarding queue to retry, rotate, or revoke them.
                </p>
              </div>
              <Link
                href="/admin/users"
                className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Open user onboarding
              </Link>
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              <div className="rounded-[24px] border border-amber-200 bg-white/90 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-900">Stale Pending Invites</p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">{staleInviteAlerts.length}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Pending seats that have gone untouched for several days and should be reviewed now.
                </p>
                <div className="mt-4">
                  <Link
                    href="/admin/users?attention=stale"
                    className="inline-flex rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Open stale seats
                  </Link>
                </div>
              </div>
              <div className="rounded-[24px] border border-orange-200 bg-white/90 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-900">Expiring Soon Invites</p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">{expiringSoonInviteAlerts.length}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Pending seats with little time left on their activation links, ready for fast rotation.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    href="/admin/users?attention=expiring_soon"
                    className="inline-flex rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    Review expiring seats
                  </Link>
                  {expiringSoonInviteAlerts.length ? (
                    <form action={rotateExpiringInvitesDashboardAction}>
                      <button
                        type="submit"
                        className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        Rotate expiring invites now
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {canManageUsers(user.role) && staleInviteAlerts.length ? (
          <div
            data-stale-invite-callout
            className="mb-6 rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-700">Invite Attention</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-amber-950">
                  Pending seats have gone untouched for several days
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-amber-900">
                  These invites have not been retried or rotated recently. Review them before the activation links
                  become urgent or expire.
                </p>
              </div>
              <Link
                href="/admin/users"
                className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Open user onboarding
              </Link>
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {staleInviteAlerts.map((invite) => {
                const lastTouchedAt = invite.lastDeliveryAttemptAt ?? invite.createdAt;
                return (
                  <article
                    key={invite.inviteId}
                    data-stale-invite-email={invite.user.email}
                    className="rounded-2xl border border-amber-200 bg-white/80 px-4 py-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-slate-950">{invite.user.name}</p>
                        <p className="mt-1 text-sm text-slate-600">{invite.user.email}</p>
                      </div>
                      <StatusPill value="uploaded" />
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-700">
                      Pending for {formatInviteAge(invite.createdAt)}.
                      {" "}
                      Last touch {formatInviteAge(lastTouchedAt)} ago.
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                      Expires {formatDate(invite.expiresAt)}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}
        {canManageUsers(user.role) &&
        (inviteIssueSummary.activeIssueCount > 0 || inviteIssueSummary.reviewedIssueCount > 0) ? (
          <div
            data-dashboard-digest-issue-summary
            className="mb-6 rounded-[28px] border border-slate-200 bg-slate-50/90 px-5 py-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Digest Triage</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  Onboarding delivery issues are ready for manager review
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                  Review unresolved repeated delivery issues quickly, or jump into the reviewed set to confirm prior
                  triage decisions.
                </p>
              </div>
              <Link
                href="/admin/digests"
                className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Open digest operations
              </Link>
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              <Link
                href="/admin/digests?issue=active_issue"
                className="rounded-[24px] border border-amber-200 bg-white/90 px-4 py-4 transition hover:border-amber-300 hover:bg-amber-50/70"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-900">
                  Unresolved Recipient Issues
                </p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">
                  {inviteIssueSummary.activeIssueCount}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Recipients with repeated manual fallback or failed digest delivery that still need attention.
                </p>
              </Link>
              <Link
                href="/admin/digests?issue=reviewed"
                className="rounded-[24px] border border-emerald-200 bg-white/90 px-4 py-4 transition hover:border-emerald-300 hover:bg-emerald-50/70"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-900">
                  Reviewed Recipient Issues
                </p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">
                  {inviteIssueSummary.reviewedIssueCount}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Repeated delivery issues that have already been acknowledged by a manager.
                </p>
              </Link>
            </div>
          </div>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Recent Lists</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              Keep list-level work visible for reps and managers
            </h2>
          </div>
          <Link href="/lists" className="text-sm font-semibold text-teal-700 hover:text-teal-900">
            View all lists
          </Link>
        </div>

        <div className="mt-6 overflow-hidden rounded-[28px] border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">List</th>
                <th className="px-4 py-3 font-semibold">Event</th>
                <th className="px-4 py-3 font-semibold">Assigned</th>
                <th className="px-4 py-3 font-semibold">Leads</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {leadLists.map((list) => (
                <tr key={list.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-4">
                    <Link href={`/lists/${list.id}`} className="font-semibold text-slate-950 hover:text-teal-700">
                      {list.name}
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-slate-600">{list.eventSourceName}</td>
                  <td className="px-4 py-4 text-slate-600">{list.assignedSalesperson?.name ?? "Unassigned"}</td>
                  <td className="px-4 py-4 text-slate-600">{list.leads.length}</td>
                  <td className="px-4 py-4">
                    <StatusPill value={list.status} />
                  </td>
                  <td className="px-4 py-4 text-slate-600">{formatDate(list.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </WorkspaceShell>
  );
}
