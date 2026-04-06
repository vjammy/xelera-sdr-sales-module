import Link from "next/link";
import { notFound } from "next/navigation";
import { updateProviderVerificationAction } from "@/app/actions";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireUser } from "@/lib/auth";
import { getProviderVerificationHistory } from "@/lib/data";
import { getProviderReadiness } from "@/lib/provider-readiness";
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

export default async function SetupPage() {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    notFound();
  }

  const [readiness, verificationHistory] = await Promise.all([
    getProviderReadiness(user.organizationId),
    getProviderVerificationHistory(user.organizationId),
  ]);
  const currentTimestamp = new Date().getTime();
  const weekAgo = new Date(currentTimestamp - 7 * 24 * 60 * 60 * 1000);
  const reopenedThisWeekCount = verificationHistory.filter(
    (event) => event.action === "reopened" && event.createdAt >= weekAgo,
  ).length;
  const myReopenedThisWeekCount = verificationHistory.filter(
    (event) => event.action === "reopened" && event.createdAt >= weekAgo && event.actorEmail === user.email,
  ).length;

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
            <Link
              href="/admin/setup/history?time=7d"
              className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-white transition hover:border-slate-500"
            >
              Open setup history (7d)
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
                {item.verificationSteps?.length ? (
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-white/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {item.verificationTitle ?? "Verify after setup"}
                    </p>
                    <div className="mt-3 space-y-2">
                      {item.verificationSteps.map((step, index) => (
                        <p key={`${item.key}-verify-${index}`} className="text-sm leading-6 text-slate-700">
                          {index + 1}. {step}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div data-provider-verification-state={item.key} className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Verification status</p>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${getReadinessBadgeClasses(
                        item.verificationTone,
                      )}`}
                    >
                      {item.verificationStatusLabel}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{item.verificationDetail}</p>
                  {item.verificationCreatedAt ? (
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                      Last updated {formatDate(item.verificationCreatedAt, "MMM d, yyyy h:mm a")}
                    </p>
                  ) : null}
                  {item.verificationActionLabel ? (
                    <form
                      action={updateProviderVerificationAction.bind(
                        null,
                        item.key,
                        item.verificationState === "verified" ? "reopened" : "verified",
                      )}
                      className="mt-4"
                    >
                      <button
                        type="submit"
                        className="rounded-full border border-slate-300 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:border-slate-400 hover:bg-slate-800"
                      >
                        {item.verificationActionLabel}
                      </button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="mt-6 rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-lg shadow-slate-200/40">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Verification Activity</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              Recent provider verification changes
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/admin/setup/history?action=reopened&time=7d"
              className="text-sm font-semibold text-teal-700 transition hover:text-teal-900"
              data-setup-reopened-week-link
            >
              Reopened this week ({reopenedThisWeekCount})
            </Link>
            <Link
              href={`/admin/setup/history?action=reopened&actor=${encodeURIComponent(user.email)}&time=7d`}
              className="text-sm font-semibold text-teal-700 transition hover:text-teal-900"
              data-setup-my-reopened-week-link
            >
              My reopened this week ({myReopenedThisWeekCount})
            </Link>
            <Link
              href="/admin/setup/history?time=7d"
              className="text-sm font-semibold text-teal-700 transition hover:text-teal-900"
            >
              View recent history (7d)
            </Link>
          </div>
        </div>
        <div className="mt-5 space-y-3" data-provider-verification-history-preview>
          {verificationHistory.slice(0, 4).length ? (
            verificationHistory.slice(0, 4).map((event) => (
              <article key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Link
                    href={`/admin/setup/history?provider=${encodeURIComponent(event.providerKey)}&time=7d`}
                    className="text-base font-semibold text-slate-950 transition hover:text-slate-700"
                  >
                    {event.providerLabel}
                  </Link>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${getReadinessBadgeClasses(
                      event.action === "verified" ? "success" : "warning",
                    )}`}
                  >
                    {event.action === "verified" ? "Verified" : "Reopened"}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {event.actorName} marked this area {event.action === "verified" ? "verified" : "for recheck"} on{" "}
                  {formatDate(event.createdAt, "MMM d, yyyy h:mm a")}.
                </p>
              </article>
            ))
          ) : (
            <p className="text-sm leading-7 text-slate-600">
              No provider verification changes have been recorded yet.
            </p>
          )}
        </div>
      </section>
    </WorkspaceShell>
  );
}
