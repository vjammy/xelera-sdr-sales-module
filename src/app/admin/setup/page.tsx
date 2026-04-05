import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireUser } from "@/lib/auth";
import { getProviderReadiness } from "@/lib/provider-readiness";
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

export default async function SetupPage() {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    notFound();
  }

  const readiness = getProviderReadiness();

  return (
    <WorkspaceShell user={user}>
      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-[32px] bg-slate-950 p-8 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-teal-300">Pilot Setup</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Finish live provider setup without leaving the app</h1>
          <p className="mt-4 text-base leading-7 text-slate-300">
            This page turns the readiness signals into an operator checklist. It shows which env vars are still
            missing, what each provider unlocks, and where the current Vercel Hobby limits still shape behavior.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-900/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Configured Areas</p>
              <p className="mt-2 text-3xl font-semibold text-white">
                {readiness.filter((item) => item.tone === "success").length}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-900/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Needs Follow-up</p>
              <p className="mt-2 text-3xl font-semibold text-white">
                {readiness.filter((item) => item.tone !== "success").length}
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/admin/sends"
              className="rounded-full bg-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300"
            >
              Open send operations
            </Link>
            <Link
              href="/"
              className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-white transition hover:border-slate-500"
            >
              Return to dashboard
            </Link>
          </div>
        </article>

        <div
          data-admin-setup-checklist
          className="rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-lg shadow-slate-200/40"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Setup Checklist</p>
          <div className="mt-5 space-y-4">
            {readiness.map((item) => (
              <article
                key={item.key}
                id={item.key}
                className="scroll-mt-24 rounded-[26px] border border-slate-200 bg-slate-50/80 p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                    <h2 className="mt-2 text-xl font-semibold text-slate-950">{item.setupTitle ?? item.label}</h2>
                  </div>
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
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Missing env vars</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.missingEnvNames.map((envName) => (
                        <code
                          key={`${item.key}-${envName}`}
                          className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
                        >
                          {envName}
                        </code>
                      ))}
                    </div>
                  </div>
                ) : null}
                {item.setupSteps?.length ? (
                  <div className="mt-4 space-y-2">
                    {item.setupSteps.map((step, index) => (
                      <p key={`${item.key}-${index}`} className="text-sm leading-6 text-slate-700">
                        {index + 1}. {step}
                      </p>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </section>
    </WorkspaceShell>
  );
}
