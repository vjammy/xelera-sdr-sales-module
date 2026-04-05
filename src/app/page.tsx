import Link from "next/link";
import { MetricCard } from "@/components/metric-card";
import { StatusPill } from "@/components/status-pill";
import { WorkspaceShell } from "@/components/workspace-shell";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/data";

export default async function Home() {
  const user = await requireUser();
  const { leadLists, metrics } = await getDashboardData(user);

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
