"use client";

import { signIn } from "next-auth/react";
import { useState, useTransition } from "react";

export function LoginForm() {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const email = String(formData.get("email") ?? "");
        const password = String(formData.get("password") ?? "");

        startTransition(async () => {
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
          Use one of the seeded demo users or replace them with your own records after seeding.
        </p>
      </div>
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">Email</span>
        <input
          name="email"
          type="email"
          required
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
    </form>
  );
}
