import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireUser } from "@/lib/auth";
import { getProviderVerificationHistory } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { canManageUsers } from "@/lib/permissions";

function getStatusBadgeClasses(action: string) {
  if (action === "verified") {
    return "bg-emerald-100 text-emerald-950";
  }

  return "bg-amber-100 text-amber-950";
}

export default async function SetupHistoryPage() {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    notFound();
  }

  const history = await getProviderVerificationHistory(user.organizationId);

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
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Recent Events</p>
          <div className="mt-5 space-y-3">
            {history.length ? (
              history.map((event) => (
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
                No provider verification history has been recorded yet.
              </p>
            )}
          </div>
        </article>
      </section>
    </WorkspaceShell>
  );
}
