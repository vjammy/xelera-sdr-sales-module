import Link from "next/link";
import { notFound } from "next/navigation";
import { processOutboundQueueNowAction, retryFailedSequenceEmailAction } from "@/app/actions";
import { StatusPill } from "@/components/status-pill";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireUser } from "@/lib/auth";
import { getOutboundOperationsData } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { canManageUsers } from "@/lib/permissions";

function getReadinessBadgeClasses(tone: "success" | "warning" | "neutral") {
  if (tone === "success") {
    return "bg-emerald-100 text-emerald-950";
  }

  if (tone === "warning") {
    return "bg-amber-100 text-amber-950";
  }

  return "bg-slate-200 text-slate-800";
}

export default async function SendOpsPage() {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    notFound();
  }

  const outbound = await getOutboundOperationsData(user);

  return (
    <WorkspaceShell user={user}>
      <section className="grid gap-6 xl:grid-cols-[0.86fr_1.14fr]">
        <div className="space-y-6">
          <article className="rounded-[32px] bg-slate-950 p-8 text-white">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-teal-300">Send Operations</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">Queue, failures, and worker activity</h1>
            <p className="mt-4 text-base leading-7 text-slate-300">
              Approved sequences stay human-controlled, but once queued they now move through an outbound worker with
              per-email delivery tracking and retry support.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-900/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Queued or Sending</p>
                <p className="mt-2 text-3xl font-semibold text-white">{outbound.queued.length}</p>
              </div>
              <div className="rounded-2xl bg-slate-900/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Failed</p>
                <p className="mt-2 text-3xl font-semibold text-white">{outbound.failed.length}</p>
              </div>
            </div>
            <form action={processOutboundQueueNowAction} className="mt-6">
              <button
                type="submit"
                className="rounded-full bg-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300"
              >
                Process outbound queue now
              </button>
            </form>
          </article>

          <article
            data-send-ops-provider-readiness
            className="rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-lg shadow-slate-200/40"
          >
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Provider Readiness</p>
            <div className="mt-5 space-y-3">
              {outbound.providerReadiness.map((item) => (
                <article key={item.key} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-base font-semibold text-slate-950">{item.label}</p>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${getReadinessBadgeClasses(
                        item.tone,
                      )}`}
                    >
                      {item.statusLabel}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{item.detail}</p>
                  {item.missingEnvNames?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.missingEnvNames.map((envName) => (
                        <code
                          key={`${item.key}-${envName}`}
                          className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
                        >
                          {envName}
                        </code>
                      ))}
                    </div>
                  ) : null}
                  {item.actionLabel && item.actionHref ? (
                    <div className="mt-3">
                      <Link
                        href={item.actionHref}
                        className="text-sm font-semibold text-teal-700 transition hover:text-teal-900"
                      >
                        {item.actionLabel}
                      </Link>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </article>

          <article className="rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-lg shadow-slate-200/40">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Failed Deliveries</p>
            <div className="mt-5 space-y-3">
              {outbound.failed.length ? (
                outbound.failed.map((email) => (
                  <article key={email.id} className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-slate-950">
                          {email.sequence.lead.fullName} · Email {email.emailOrder}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">{email.sequence.lead.email ?? "No recipient email"}</p>
                      </div>
                      <StatusPill value={email.sendStatus} />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-700">
                      {email.lastDeliveryError || "Delivery failed without a recorded provider error."}
                    </p>
                    <form action={retryFailedSequenceEmailAction.bind(null, email.id, email.sequence.leadId)} className="mt-4">
                      <button
                        type="submit"
                        className="rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-900 transition hover:border-rose-400 hover:bg-rose-100"
                      >
                        Retry failed email
                      </button>
                    </form>
                  </article>
                ))
              ) : (
                <p className="text-sm leading-7 text-slate-600">No failed outbound emails need attention right now.</p>
              )}
            </div>
          </article>
        </div>

        <div className="space-y-6">
          <article className="rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-lg shadow-slate-200/40">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Outbound Queue</p>
            <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Lead</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Due</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Last Update</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {outbound.emails.map((email) => (
                    <tr key={email.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-950">{email.sequence.lead.fullName}</p>
                        <p className="text-slate-500">Email {email.emailOrder}</p>
                      </td>
                      <td className="px-4 py-4 text-slate-600">{email.sequence.lead.email ?? "No email"}</td>
                      <td className="px-4 py-4 text-slate-600">{formatDate(email.dueAt, "MMM d, yyyy h:mm a")}</td>
                      <td className="px-4 py-4">
                        <StatusPill value={email.sendStatus} />
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {formatDate(email.sentAt || email.failedAt || email.queuedAt || email.updatedAt, "MMM d, yyyy h:mm a")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-lg shadow-slate-200/40">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Recent Worker Activity</p>
            <div className="mt-5 space-y-3">
              {outbound.recentEvents.map((event) => (
                <article key={event.id} className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-semibold text-slate-900">
                      {event.action.replaceAll("_", " ").replaceAll(".", " ")}
                    </p>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      {formatDate(event.createdAt, "MMM d, yyyy h:mm a")}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{event.actor?.name ?? event.actor?.email ?? "System"}</p>
                </article>
              ))}
            </div>
          </article>
        </div>
      </section>
    </WorkspaceShell>
  );
}
