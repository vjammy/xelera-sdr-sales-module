type MetricCardProps = {
  label: string;
  value: string | number;
  hint: string;
};

export function MetricCard({ label, value, hint }: MetricCardProps) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-sm shadow-slate-200/50">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-sm text-slate-600">{hint}</p>
    </article>
  );
}
