import { saveProfileAction } from "@/app/actions";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/data";

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await getProfile(user.id, user.organizationId);

  return (
    <WorkspaceShell user={user}>
      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[32px] bg-slate-950 p-8 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-300">Salesperson Settings</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">Shape the voice that the drafts inherit.</h1>
          <p className="mt-4 text-base leading-7 text-slate-300">
            The system uses these preferences to reduce generic AI copy and make the first pass feel closer to the rep.
          </p>
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
          <button
            type="submit"
            className="mt-6 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Save profile settings
          </button>
        </form>
      </section>
    </WorkspaceShell>
  );
}
