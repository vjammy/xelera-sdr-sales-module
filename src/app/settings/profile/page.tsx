import { saveProfileAction } from "@/app/actions";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireUser } from "@/lib/auth";
import { getInviteDigestHistory, getProfile } from "@/lib/data";
import { canManageUsers } from "@/lib/permissions";

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await getProfile(user.id, user.organizationId);
  const canManageInviteDigests = canManageUsers(user.role);
  const digestHistory = canManageInviteDigests
    ? await getInviteDigestHistory(user.email, user.organizationId)
    : [];
  const formatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <WorkspaceShell user={user}>
      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[32px] bg-slate-950 p-8 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-300">Salesperson Settings</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">Shape the voice that the drafts inherit.</h1>
          <p className="mt-4 text-base leading-7 text-slate-300">
            The system uses these preferences to reduce generic AI copy and make the first pass feel closer to the rep.
          </p>
          {canManageInviteDigests ? (
            <div className="mt-6 rounded-[24px] border border-slate-800 bg-slate-900/80 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Invite Digest</p>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                Because your role can manage onboarding, you can also choose how much invite hygiene email you want to receive.
              </p>
            </div>
          ) : null}
        </div>
        <form
          action={saveProfileAction}
          className="rounded-[32px] border border-white/80 bg-white/90 p-8 shadow-lg shadow-slate-200/40"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Name</span>
              <input disabled value={profile?.name ?? user.name ?? ""} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Email</span>
              <input disabled value={profile?.email ?? user.email ?? ""} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Phone</span>
              <input name="phone" defaultValue={profile?.phone ?? ""} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Job Title</span>
              <input name="title" defaultValue={profile?.title ?? ""} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
            </label>
          </div>
          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Email Prompt Preference</span>
            <textarea
              name="emailPromptPreference"
              rows={4}
              defaultValue={profile?.emailPromptPreference ?? ""}
              className="w-full rounded-[24px] border border-slate-200 px-4 py-3 text-sm"
            />
          </label>
          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Sample Email</span>
            <textarea
              name="sampleEmail"
              rows={5}
              defaultValue={profile?.sampleEmail ?? ""}
              className="w-full rounded-[24px] border border-slate-200 px-4 py-3 text-sm"
            />
          </label>
          {canManageInviteDigests ? (
            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Invite Digest Preference</span>
              <select
                name="inviteDigestPreference"
                defaultValue={profile?.inviteDigestPreference ?? "all_alerts"}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
              >
                <option value="all_alerts">Send both stale and expiring invite alerts</option>
                <option value="stale_only">Send only stale invite alerts</option>
                <option value="off">Do not send invite hygiene digests</option>
              </select>
            </label>
          ) : null}
          <button
            type="submit"
            className="mt-6 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Save profile settings
          </button>
          {canManageInviteDigests ? (
            <div className="mt-8 rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Digest History</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    Recent invite hygiene deliveries for your seat
                  </h2>
                </div>
              </div>
              {digestHistory.length ? (
                <div className="mt-5 space-y-3" data-invite-digest-history>
                  {digestHistory.map((entry) => (
                    <article
                      key={entry.id}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold text-slate-950">
                            {entry.deliveryState === "sent"
                              ? "Emailed successfully"
                              : entry.deliveryState === "manual"
                                ? "Manual fallback"
                                : entry.deliveryState === "failed"
                                  ? "Delivery failed"
                                  : "Skipped"}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">{formatter.format(entry.createdAt)}</p>
                        </div>
                        <div className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">
                          {entry.preference.replaceAll("_", " ")}
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-7 text-slate-700">
                        {entry.alertCount} alerts included.
                        {" "}
                        {entry.staleCount} stale and {entry.expiringSoonCount} expiring soon.
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-5 text-sm leading-7 text-slate-600">
                  No invite hygiene digest runs have been recorded for your seat yet.
                </p>
              )}
            </div>
          ) : null}
        </form>
      </section>
    </WorkspaceShell>
  );
}
