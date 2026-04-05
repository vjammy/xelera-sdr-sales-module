import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { NAV_ITEMS } from "@/lib/constants";

type WorkspaceShellProps = {
  user: {
    name?: string | null;
    role: string;
  };
  children: React.ReactNode;
};

export function WorkspaceShell({ user, children }: WorkspaceShellProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.18),_transparent_28%),linear-gradient(180deg,_#f7fbfd_0%,_#eff4f8_100%)]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-6 lg:px-10">
        <header className="mb-8 flex flex-col gap-5 rounded-[32px] border border-white/70 bg-white/80 px-6 py-5 shadow-lg shadow-slate-200/40 backdrop-blur lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href="/" className="text-xs font-semibold uppercase tracking-[0.35em] text-teal-700">
              Xelera.ai SDR Agent Platform
            </Link>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Human-reviewed conference follow-up, with manager bulk approval only after drafts are ready.
            </p>
          </div>
          <div className="flex flex-col gap-4 lg:items-end">
            <nav className="flex flex-wrap gap-2">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-teal-300 hover:text-teal-800"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white">
                {user.name ?? "Workspace User"} · {user.role.replaceAll("_", " ")}
              </div>
              <LogoutButton />
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
