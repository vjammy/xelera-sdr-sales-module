import { notFound } from "next/navigation";
import { runInviteDigestNowAction } from "@/app/actions";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireUser } from "@/lib/auth";
import { getOrganizationInviteDigestHistory } from "@/lib/data";
import { canManageUsers } from "@/lib/permissions";

export default async function DigestOpsPage() {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    notFound();
  }

  const history = await getOrganizationInviteDigestHistory(user.organizationId);
  const formatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

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

          {history.length ? (
            <div className="mt-6 space-y-4" data-digest-ops-history>
              {history.map((entry) => (
                <article
                  key={entry.id}
                  className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5"
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
                        {entry.recipientDeliveries.map((delivery) => (
                          <tr key={delivery.id}>
                            <td className="px-4 py-3 text-slate-700">{delivery.email}</td>
                            <td className="px-4 py-3 text-slate-700">{delivery.deliveryState.replaceAll("_", " ")}</td>
                            <td className="px-4 py-3 text-slate-700">{delivery.preference.replaceAll("_", " ")}</td>
                            <td className="px-4 py-3 text-slate-700">
                              {delivery.alertCount} total · {delivery.staleCount} stale · {delivery.expiringSoonCount} soon
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-sm leading-7 text-slate-600">
              No invite hygiene digest runs have been recorded for this organization yet.
            </p>
          )}
        </article>
      </section>
    </WorkspaceShell>
  );
}
