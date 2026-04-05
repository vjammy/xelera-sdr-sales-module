import Link from "next/link";
import { bulkApproveAction } from "@/app/actions";
import { StatusPill } from "@/components/status-pill";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireUser } from "@/lib/auth";
import { getLeadLists } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { canBulkApprove } from "@/lib/permissions";

export default async function LeadListsPage() {
  const user = await requireUser();
  const lists = await getLeadLists(user);

  return (
    <WorkspaceShell user={user}>
      <section className="rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-lg shadow-slate-200/40">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Operating View</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Lead lists and batch review readiness</h1>
          </div>
          <Link
            href="/upload"
            className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Upload another list
          </Link>
        </div>

        <div className="mt-6 space-y-5">
          {lists.map((list) => {
            const reviewReady = list.leads.filter((lead) => lead.status === "review_ready").length;
            const approved = list.leads.filter((lead) => lead.status === "approved").length;

            return (
              <article key={list.id} className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <Link href={`/lists/${list.id}`} className="text-2xl font-semibold tracking-tight text-slate-950 hover:text-teal-700">
                        {list.name}
                      </Link>
                      <StatusPill value={list.status} />
                    </div>
                    <p className="text-sm text-slate-600">
                      {list.eventSourceName} · {formatDate(list.eventDate)} · {list.eventCity || "City n/a"},{" "}
                      {list.eventCountry || "Country n/a"}
                    </p>
                    <p className="max-w-3xl text-sm leading-6 text-slate-600">{list.notes || "No list-level notes captured."}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[360px]">
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Assigned</p>
                      <p className="mt-2 text-sm font-medium text-slate-900">{list.assignedSalesperson?.name ?? "Unassigned"}</p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Uploaded By</p>
                      <p className="mt-2 text-sm font-medium text-slate-900">{list.uploadedBy?.name ?? "Unknown"}</p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Review Ready</p>
                      <p className="mt-2 text-sm font-medium text-slate-900">{reviewReady} leads</p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Approved</p>
                      <p className="mt-2 text-sm font-medium text-slate-900">{approved} leads</p>
                    </div>
                  </div>
                </div>

                {canBulkApprove(user.role) ? (
                  <form action={bulkApproveAction} className="mt-5">
                    <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Manager bulk approval</p>
                          <p className="mt-1 text-sm text-slate-600">
                            Select only review-ready leads. Ineligible leads are skipped automatically.
                          </p>
                        </div>
                        <button
                          type="submit"
                          className="rounded-full bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400"
                        >
                          Bulk approve selected
                        </button>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {list.leads.map((lead) => (
                          <label
                            key={lead.id}
                            className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
                              lead.status === "review_ready"
                                ? "border-teal-200 bg-teal-50/70"
                                : "border-slate-200 bg-slate-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              name="leadIds"
                              value={lead.id}
                              disabled={lead.status !== "review_ready"}
                              className="mt-1"
                            />
                            <span>
                              <span className="block font-medium text-slate-900">{lead.fullName}</span>
                              <span className="block text-slate-500">{lead.sequence?.selectedProductName ?? "No draft yet"}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </form>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </WorkspaceShell>
  );
}
