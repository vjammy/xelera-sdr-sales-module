import { UserRole } from "@prisma/client";
import { saveUserAction } from "@/app/actions";
import { StatusPill } from "@/components/status-pill";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireUser } from "@/lib/auth";
import { getOrganizationUsers } from "@/lib/data";
import { canManageUsers } from "@/lib/permissions";

const ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: "salesperson", label: "Salesperson" },
  { value: "sales_manager", label: "Sales Manager" },
  { value: "admin_operator", label: "Admin Operator" },
];

export default async function UsersPage() {
  const user = await requireUser();
  const users = await getOrganizationUsers(user.organizationId);

  return (
    <WorkspaceShell user={user}>
      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <article className="rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-lg shadow-slate-200/40">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">User Onboarding</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Organization-scoped users and operating seats
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            Users created here belong only to this organization. Managers and admins can add seats without
            crossing tenant boundaries or touching another workspace.
          </p>

          <div className="mt-6 space-y-4">
            {users.map((member) => (
              <article key={member.id} className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-950">{member.name}</h2>
                    <p className="mt-1 text-sm text-slate-600">{member.email}</p>
                  </div>
                  <StatusPill value={member.role === "salesperson" ? "review_ready" : member.role === "sales_manager" ? "approved" : "uploaded"} />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Role</p>
                    <p className="mt-2 text-sm font-medium text-slate-900">{member.role.replaceAll("_", " ")}</p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Title</p>
                    <p className="mt-2 text-sm font-medium text-slate-900">{member.title || "Not set"}</p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Assigned Lists</p>
                    <p className="mt-2 text-sm font-medium text-slate-900">{member.assignedLists.length}</p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Assigned Leads</p>
                    <p className="mt-2 text-sm font-medium text-slate-900">{member.assignedLeads.length}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="rounded-[32px] bg-slate-950 p-8 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-300">Create Seat</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">Add a new user to this organization</h2>
          {canManageUsers(user.role) ? (
            <form action={saveUserAction} className="mt-6 space-y-4">
              <input
                name="name"
                placeholder="Full name"
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm"
              />
              <input
                name="email"
                type="email"
                placeholder="Work email"
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm"
              />
              <div className="grid gap-4 md:grid-cols-2">
                <select
                  name="role"
                  defaultValue="salesperson"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
                <input
                  name="password"
                  type="text"
                  defaultValue="Welcome123!"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <input
                  name="title"
                  placeholder="Job title"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm"
                />
                <input
                  name="phone"
                  placeholder="Phone"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm"
                />
              </div>
              <button
                type="submit"
                className="rounded-full bg-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-teal-300"
              >
                Create user
              </button>
            </form>
          ) : (
            <p className="mt-5 text-sm leading-7 text-slate-300">
              Only managers and admin operators can onboard new users.
            </p>
          )}
        </article>
      </section>
    </WorkspaceShell>
  );
}
