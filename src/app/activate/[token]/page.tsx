import Link from "next/link";
import { completeInviteActivationAction } from "@/app/actions";
import { getInviteByToken } from "@/lib/data";

type ActivationPageProps = {
  params: Promise<{
    token: string;
  }>;
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function ActivationPage({ params, searchParams }: ActivationPageProps) {
  const { token } = await params;
  const { error } = await searchParams;
  const invite = await getInviteByToken(token);
  const isExpired = invite ? invite.expiresAt <= new Date() : false;

  if (!invite || invite.status !== "pending" || isExpired) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.18),_transparent_25%),linear-gradient(180deg,_#f9fbfb_0%,_#eef2f7_100%)] px-6 py-10">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
          <section className="w-full rounded-[36px] border border-white/80 bg-white/85 p-10 shadow-xl shadow-slate-200/50">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Activation</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">This invite is no longer active</h1>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              The activation link may have expired, already been accepted, or been replaced by a newer invite.
            </p>
            <Link
              href="/login"
              className="mt-8 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Return to login
            </Link>
          </section>
        </div>
      </div>
    );
  }

  const activateAction = completeInviteActivationAction.bind(null, token);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.25),_transparent_25%),linear-gradient(180deg,_#f9fbfb_0%,_#eef2f7_100%)] px-6 py-10">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[40px] bg-slate-950 px-8 py-10 text-white shadow-2xl shadow-slate-300/30">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-teal-300">Xelera.ai</p>
          <h1 className="mt-5 text-5xl font-semibold tracking-tight">Finish your workspace activation.</h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300">
            Your manager created an organization-scoped seat for {invite.user.email}. Set your password here and
            you will be able to sign in immediately.
          </p>
          <div className="mt-10 rounded-[26px] border border-slate-800 bg-slate-900/80 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Invite Summary</p>
            <p className="mt-3 text-lg font-semibold">{invite.user.name}</p>
            <p className="mt-1 text-sm text-slate-400">{invite.user.role.replaceAll("_", " ")}</p>
            <p className="mt-4 text-sm text-slate-300">
              Invited by {invite.invitedBy?.name ?? "your admin"} for {invite.organization.name}
            </p>
          </div>
        </section>

        <section className="flex items-center justify-center rounded-[40px] border border-white/80 bg-white/80 p-8 shadow-xl shadow-slate-200/50 backdrop-blur">
          <form action={activateAction} className="w-full max-w-md space-y-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Activate Seat</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Set your password</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                We’ve pre-filled the organization details. You can adjust your title or phone while finishing setup.
              </p>
            </div>

            {error ? (
              <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>
            ) : null}

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Email</span>
              <input
                value={invite.user.email}
                disabled
                className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-600"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Job title</span>
                <input
                  name="title"
                  defaultValue={invite.user.title ?? ""}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-teal-400"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Phone</span>
                <input
                  name="phone"
                  defaultValue={invite.user.phone ?? ""}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-teal-400"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Password</span>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-teal-400"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Confirm password</span>
              <input
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-teal-400"
              />
            </label>

            <button
              type="submit"
              className="w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Activate and continue
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
