"use client";

import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState, useTransition } from "react";

export function LoginForm() {
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [magicLinkMessage, setMagicLinkMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const activated = searchParams.get("activated") === "1";
  const invitedEmail = searchParams.get("email") ?? "";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const email = String(formData.get("email") ?? "");
        const password = String(formData.get("password") ?? "");

        startTransition(async () => {
          setError("");
          setMagicLinkMessage("");
          const result = await signIn("credentials", {
            email,
            password,
            redirect: false,
            callbackUrl: "/",
          });

          if (result?.error) {
            setError("The email and password combination was not recognized.");
            return;
          }

          window.location.href = result?.url ?? "/";
        });
      }}
      className="w-full max-w-md space-y-5"
    >
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Sign In</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Open the operating console</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Use one of the seeded demo users or activate an invited seat before signing in.
        </p>
      </div>
      {activated ? (
        <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Your invite is active. Sign in with your new password.
        </p>
      ) : null}
      {magicLinkMessage ? (
        <p className="rounded-2xl bg-cyan-50 px-4 py-3 text-sm font-medium text-cyan-700">{magicLinkMessage}</p>
      ) : null}
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">Email</span>
        <input
          name="email"
          type="email"
          required
          defaultValue={invitedEmail}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-teal-400"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">Password</span>
        <input
          name="password"
          type="password"
          required
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-teal-400"
        />
      </label>
      {error ? (
        <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isPending ? "Signing in..." : "Enter workspace"}
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          const emailInput = document.querySelector<HTMLInputElement>('input[name="email"]');
          const email = emailInput?.value ?? invitedEmail;

          startTransition(async () => {
            setError("");
            const result = await signIn("email", {
              email,
              redirect: false,
              callbackUrl: "/",
            });

            if (result?.error) {
              setError("We could not send a sign-in link to that email.");
              return;
            }

            setMagicLinkMessage("Check your inbox for a secure sign-in link.");
          });
        }}
        className="w-full rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
      >
        Email me a sign-in link
      </button>
    </form>
  );
}
