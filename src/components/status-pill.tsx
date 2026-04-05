import { titleCase } from "@/lib/format";

const STATUS_STYLES: Record<string, string> = {
  uploaded: "bg-slate-100 text-slate-700",
  processing: "bg-amber-100 text-amber-800",
  research_in_progress: "bg-amber-100 text-amber-800",
  drafts_ready: "bg-cyan-100 text-cyan-800",
  partially_approved: "bg-indigo-100 text-indigo-800",
  fully_approved: "bg-emerald-100 text-emerald-800",
  review_ready: "bg-cyan-100 text-cyan-800",
  approved: "bg-emerald-100 text-emerald-800",
  paused: "bg-orange-100 text-orange-800",
  rejected: "bg-rose-100 text-rose-800",
  intake_valid: "bg-slate-100 text-slate-700",
  research_pending: "bg-amber-100 text-amber-800",
  research_complete: "bg-cyan-100 text-cyan-800",
  draft_pending: "bg-slate-100 text-slate-700",
  draft: "bg-slate-100 text-slate-700",
};

export function StatusPill({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[value] ?? "bg-slate-100 text-slate-700"}`}
    >
      {titleCase(value)}
    </span>
  );
}
