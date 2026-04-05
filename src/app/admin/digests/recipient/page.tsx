import Link from "next/link";
import { notFound } from "next/navigation";
import { runInviteDigestForRecipientAction } from "@/app/actions";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireUser } from "@/lib/auth";
import { getInviteDigestHistory, getOrganizationUserByEmail } from "@/lib/data";
import { canManageUsers } from "@/lib/permissions";

function getDeliveryLabel(deliveryState: string) {
  if (deliveryState === "sent") {
    return "Emailed successfully";
  }

  if (deliveryState === "manual") {
    return "Manual fallback";
  }

  if (deliveryState === "failed") {
    return "Delivery failed";
  }

  return "Skipped";
}

function isAttentionState(deliveryState: string) {
  return deliveryState === "manual" || deliveryState === "failed";
}

export default async function DigestRecipientPage(props: {
  searchParams?: Promise<{ email?: string }>;
}) {
  const user = await requireUser();

  if (!canManageUsers(user.role)) {
    notFound();
  }

  const searchParams = (await props.searchParams) ?? {};
  const recipientEmail = searchParams.email?.trim().toLowerCase() ?? "";

  if (!recipientEmail) {
    notFound();
  }

  const [recipient, digestHistory] = await Promise.all([
    getOrganizationUserByEmail(recipientEmail, user.organizationId),
    getInviteDigestHistory(recipientEmail, user.organizationId),
  ]);

  if (!recipient && digestHistory.length === 0) {
    notFound();
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const recentAttentionRuns = digestHistory.filter((entry) => isAttentionState(entry.deliveryState)).length;
  const recentSuccessfulRuns = digestHistory.filter((entry) => entry.deliveryState === "sent").length;
  let currentAttentionStreak = 0;
  for (const entry of digestHistory) {
    if (isAttentionState(entry.deliveryState)) {
      currentAttentionStreak += 1;
      continue;
    }

    break;
  }
  const needsAttentionBanner = recentAttentionRuns >= 2 || currentAttentionStreak >= 2;

  return (
    <WorkspaceShell user={user}>
      <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <article className="rounded-[32px] bg-slate-950 p-8 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-teal-300">Recipient Drill-In</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            {recipient?.name ?? recipientEmail}
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-300">
            Review recent invite hygiene delivery outcomes for this recipient without leaving digest operations.
          </p>
          <div className="mt-6 space-y-3 text-sm text-slate-300">
            <p>
              Email: <span className="font-semibold text-white">{recipientEmail}</span>
            </p>
            {recipient?.role ? (
              <p>
                Role: <span className="font-semibold text-white">{recipient.role.replaceAll("_", " ")}</span>
              </p>
            ) : null}
            {recipient?.team?.name ? (
              <p>
                Team: <span className="font-semibold text-white">{recipient.team.name}</span>
              </p>
            ) : null}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/admin/digests?recipient=${encodeURIComponent(recipientEmail)}`}
              className="rounded-full border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm font-semibold text-white transition hover:border-slate-500 hover:bg-slate-900"
            >
              Back to filtered digest runs
            </Link>
            <form action={runInviteDigestForRecipientAction.bind(null, recipientEmail)}>
              <button
                type="submit"
                className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Rerun digest for this recipient
              </button>
            </form>
            <Link
              href={`/admin/users?email=${encodeURIComponent(recipientEmail)}`}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Open onboarding seat
            </Link>
            {recipient?.id === user.id ? (
              <Link
                href="/settings/profile"
                className="rounded-full border border-teal-400/50 bg-teal-400/10 px-4 py-2 text-sm font-semibold text-teal-100 transition hover:border-teal-300 hover:bg-teal-400/20"
              >
                Open my profile history
              </Link>
            ) : null}
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3" data-recipient-digest-summary>
            <div className="rounded-2xl bg-slate-900/80 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Recent Attention Runs</p>
              <p className="mt-2 text-2xl font-semibold text-white">{recentAttentionRuns}</p>
            </div>
            <div className="rounded-2xl bg-slate-900/80 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Successful Sends</p>
              <p className="mt-2 text-2xl font-semibold text-white">{recentSuccessfulRuns}</p>
            </div>
            <div className="rounded-2xl bg-slate-900/80 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Current Attention Streak</p>
              <p className="mt-2 text-2xl font-semibold text-white">{currentAttentionStreak}</p>
            </div>
          </div>
          {needsAttentionBanner ? (
            <div className="mt-6 rounded-[24px] border border-amber-300/40 bg-amber-400/10 p-4" data-recipient-attention-banner>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-200">Needs repeated attention</p>
              <p className="mt-2 text-sm leading-7 text-amber-50">
                This recipient has hit manual fallback or failed delivery in multiple recent digest runs. Consider rerunning the digest,
                opening the onboarding seat, or checking whether their digest preference or inbox destination needs intervention.
              </p>
            </div>
          ) : null}
        </article>

        <article className="rounded-[32px] border border-white/80 bg-white/90 p-8 shadow-lg shadow-slate-200/40">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Delivery History</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            Recent invite hygiene deliveries for this recipient
          </h2>
          {digestHistory.length ? (
            <div className="mt-5 space-y-3" data-recipient-digest-history>
              {digestHistory.map((entry) => (
                <article key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-slate-950">
                        {getDeliveryLabel(entry.deliveryState)}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">{formatter.format(entry.createdAt)}</p>
                    </div>
                    <div className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">
                      {entry.preference.replaceAll("_", " ")}
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-700">
                    {entry.alertCount} alerts included. {entry.staleCount} stale and {entry.expiringSoonCount} expiring soon.
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm leading-7 text-slate-600">
              No invite hygiene digest runs have been recorded for this recipient yet.
            </p>
          )}
        </article>
      </section>
    </WorkspaceShell>
  );
}
