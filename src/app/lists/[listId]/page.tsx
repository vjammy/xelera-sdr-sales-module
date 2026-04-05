import Link from "next/link";
import { notFound } from "next/navigation";
import { bulkApproveAction, runListWorkflowAction } from "@/app/actions";
import { StatusPill } from "@/components/status-pill";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireUser } from "@/lib/auth";
import { getLeadListDetails } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { canBulkApprove } from "@/lib/permissions";

type LeadListDetailPageProps = {
  params: Promise<{ listId: string }>;
};

export default async function LeadListDetailPage({ params }: LeadListDetailPageProps) {
  const user = await requireUser();
  const { listId } = await params;
  const list = await getLeadListDetails(listId, user);

  if (!list) {
    notFound();
  }

  return (
    <WorkspaceShell user={user}>
      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <article className="rounded-[32px] bg-slate-950 p-8 text-white">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-4xl font-semibold tracking-tight">{list.name}</h1>
              <StatusPill value={list.status} />
            </div>
            <p className="mt-4 text-base leading-7 text-slate-300">
              {list.eventSourceName} · {formatDate(list.eventDate)} · {list.eventCity || "City n/a"},{" "}
              {list.eventCountry || "Country n/a"}
            </p>
            <p className="mt-5 text-sm leading-7 text-slate-300">{list.notes || "No list-level notes captured."}</p>
            <form action={runListWorkflowAction.bind(null, list.id)} className="mt-8">
              <button
                type="submit"
                className="rounded-full bg-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-teal-300"
              >
                Run research and drafting
              </button>
            </form>
          </article>

          <article className="rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-lg shadow-slate-200/40">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Upload Summary</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Accepted</p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">{list.acceptedRows}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Rejected</p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">{list.rejectedRows}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Assigned</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{list.assignedSalesperson?.name ?? "Unassigned"}</p>
              </div>
            </div>
            <div className="mt-5 rounded-[24px] border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Row</th>
                    <th className="px-4 py-3 font-semibold">Contact</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {list.importRows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3 text-slate-600">{row.rowNumber}</td>
                      <td className="px-4 py-3 text-slate-600">{row.email || row.phone || "Unknown"}</td>
                      <td className="px-4 py-3">
                        <StatusPill value={row.status === "accepted" ? "uploaded" : "rejected"} />
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {Array.isArray(row.rejectionReasons)
                          ? row.rejectionReasons.map((reason) => String(reason)).join(", ")
                          : "Accepted"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </div>

        <article className="rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-lg shadow-slate-200/40">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Leads Grid</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                Review-ready leads, statuses, and manager batch actions
              </h2>
            </div>
            {canBulkApprove(user.role) ? (
              <form action={bulkApproveAction}>
                <button
                  type="submit"
                  className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Bulk approve selected
                </button>
                <div className="hidden">
                  {list.leads
                    .filter((lead) => lead.status === "review_ready")
                    .map((lead) => (
                      <input key={lead.id} type="checkbox" name="leadIds" value={lead.id} readOnly checked />
                    ))}
                </div>
              </form>
            ) : null}
          </div>

          <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Lead</th>
                  <th className="px-4 py-3 font-semibold">Company</th>
                  <th className="px-4 py-3 font-semibold">Research</th>
                  <th className="px-4 py-3 font-semibold">Sequence</th>
                  <th className="px-4 py-3 font-semibold">Approval</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {list.leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-4">
                      <div className="font-semibold text-slate-950">{lead.fullName}</div>
                      <div className="text-slate-500">{lead.title || "Title n/a"}</div>
                    </td>
                    <td className="px-4 py-4 text-slate-600">{lead.company?.name ?? "Pending company match"}</td>
                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        <StatusPill value={lead.companyResearchStatus === "complete" ? "research_complete" : "research_pending"} />
                        <StatusPill value={lead.contactResearchStatus === "complete" ? "research_complete" : "research_pending"} />
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <StatusPill value={lead.sequence?.status ?? "draft"} />
                    </td>
                    <td className="px-4 py-4">
                      <StatusPill value={lead.status} />
                    </td>
                    <td className="px-4 py-4">
                      <Link href={`/leads/${lead.id}`} className="font-semibold text-teal-700 hover:text-teal-900">
                        Open detail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </WorkspaceShell>
  );
}
