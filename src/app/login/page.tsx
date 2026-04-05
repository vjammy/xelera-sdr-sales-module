import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { LOGIN_HINTS } from "@/lib/constants";
import { auth } from "@/lib/auth";

export default async function LoginPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.25),_transparent_25%),linear-gradient(180deg,_#f9fbfb_0%,_#eef2f7_100%)] px-6 py-10">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[40px] bg-slate-950 px-8 py-10 text-white shadow-2xl shadow-slate-300/30">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-teal-300">Xelera.ai</p>
          <h1 className="mt-5 text-5xl font-semibold tracking-tight">
            SDR workflow software built around human trust.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300">
            Upload conference leads, research the account, draft the sequence, and keep explicit review in the
            loop before anything gets approved.
          </p>
          <div className="mt-8 rounded-[26px] border border-teal-900/60 bg-teal-950/30 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-teal-300">Invite-based onboarding</p>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              New users now activate their seat from an invite link, create their own password, and then sign in
              here. The demo users below still exist for seeded local verification.
            </p>
          </div>
          <div className="mt-10 grid gap-4">
            {LOGIN_HINTS.map((hint) => (
              <div key={hint.email} className="rounded-[26px] border border-slate-800 bg-slate-900/80 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">{hint.role}</p>
                <p className="mt-3 text-lg font-semibold">{hint.email}</p>
                <p className="mt-1 text-sm text-slate-400">Password: {hint.password}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center rounded-[40px] border border-white/80 bg-white/80 p-8 shadow-xl shadow-slate-200/50 backdrop-blur">
          <LoginForm />
        </section>
      </div>
    </div>
  );
}
