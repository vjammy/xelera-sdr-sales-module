import Link from "next/link";
import { UserRole } from "@prisma/client";
import {
  createReplacementInviteAction,
  createUserInviteAction,
  resendUserInviteAction,
  revokeUserInviteAction,
  rotateUserInviteAction,
} from "@/app/actions";
import { StatusPill } from "@/components/status-pill";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireUser } from "@/lib/auth";
import { getOrganizationUsers } from "@/lib/data";
import { getInviteDeliveryConfig } from "@/lib/invite-config";
import { expireStaleInvitesForOrganization, isInviteExpiringSoon, isInviteStale } from "@/lib/invites";
import { canManageUsers } from "@/lib/permissions";

const ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: "salesperson", label: "Salesperson" },
  { value: "sales_manager", label: "Sales Manager" },
  { value: "admin_operator", label: "Admin Operator" },
];

type InviteAttentionFilter = "all" | "stale" | "expiring_soon";

function normalizeInviteAttentionFilter(value?: string): InviteAttentionFilter {
  if (value === "stale" || value === "expiring_soon") {
    return value;
  }

  return "all";
}

export default async function UsersPage(props: {
  searchParams?: Promise<{ email?: string; attention?: string }>;
}) {
  const user = await requireUser();
  await expireStaleInvitesForOrganization(user.organizationId);
  const searchParams = (await props.searchParams) ?? {};
  const emailFilter = searchParams.email?.trim().toLowerCase() ?? "";
  const attentionFilter = normalizeInviteAttentionFilter(searchParams.attention);
  const users = (await getOrganizationUsers(user.organizationId)).filter((member) => {
    const matchesEmail = emailFilter ? member.email.toLowerCase().includes(emailFilter) : true;
    const pendingInvite = member.invites.find((invite) => invite.status === "pending");
    const matchesAttention =
      attentionFilter === "all"
        ? true
        : attentionFilter === "stale"
          ? Boolean(
              pendingInvite &&
                isInviteStale({
                  createdAt: pendingInvite.createdAt,
                  lastDeliveryAttemptAt: pendingInvite.lastDeliveryAttemptAt,
                }),
            )
          : Boolean(pendingInvite && isInviteExpiringSoon(pendingInvite.expiresAt));

    return matchesEmail && matchesAttention;
  });
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const inviteConfig = getInviteDeliveryConfig();
  const formatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const pendingInviteCount = users.filter((member) => member.invites.some((invite) => invite.status === "pending")).length;
  const expiringSoonCount = users.filter((member) =>
    member.invites.some((invite) => invite.status === "pending" && isInviteExpiringSoon(invite.expiresAt)),
  ).length;

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
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:max-w-xl">
            <div className="rounded-2xl bg-slate-100 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pending Invites</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{pendingInviteCount}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Expiring Soon</p>
              <p className="mt-2 text-2xl font-semibold text-amber-950">{expiringSoonCount}</p>
            </div>
          </div>
          <form className="mt-5 flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 md:flex-row md:items-end">
            <label className="grid flex-1 gap-2 text-sm font-medium text-slate-700">
              Filter by email
              <input
                type="search"
                name="email"
                defaultValue={emailFilter}
                placeholder="Filter onboarding seats by email"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Invite attention
              <select
                name="attention"
                defaultValue={attentionFilter}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              >
                <option value="all">All seats</option>
                <option value="stale">Stale pending invites</option>
                <option value="expiring_soon">Expiring soon</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Apply filter
            </button>
            <Link
              href="/admin/users"
              className="rounded-full border border-slate-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Clear
            </Link>
          </form>
          {emailFilter || attentionFilter !== "all" ? (
            <p className="mt-4 text-sm text-slate-600" data-user-filter-summary>
              Showing {users.length} seat{users.length === 1 ? "" : "s"}
              {attentionFilter !== "all"
                ? ` with ${attentionFilter === "stale" ? "stale pending invites" : "expiring soon invites"}`
                : ""}
              {emailFilter ? `${attentionFilter !== "all" ? " matching" : " matching"} "${emailFilter}"` : ""}.
            </p>
          ) : null}

          <div className="mt-6 space-y-4">
            {users.map((member) => {
              const pendingInvite = member.invites.find((invite) => invite.status === "pending");
              const latestInvite = member.invites[0];
              const canIssueReplacement = !member.passwordHash && !pendingInvite && latestInvite;
              const expiringSoon = pendingInvite ? isInviteExpiringSoon(pendingInvite.expiresAt) : false;

              return (
                <article
                  key={member.id}
                  data-user-email={member.email}
                  className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-5"
                >
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
                  {pendingInvite ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="font-semibold">Pending activation invite</p>
                          {expiringSoon ? (
                            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-900">
                              Expiring soon
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs uppercase tracking-[0.18em] text-amber-700">
                          Expires {formatter.format(pendingInvite.expiresAt)}
                        </p>
                      </div>
                      {expiringSoon ? (
                        <p className="mt-3 rounded-2xl border border-amber-200 bg-white/70 px-4 py-3 text-sm leading-7 text-amber-950">
                          This link is close to expiring. Rotate it now to give the user a fresh 7-day activation window
                          without waiting for the current invite to lapse.
                        </p>
                      ) : null}
                      <div className="mt-3 rounded-2xl bg-white/80 px-4 py-3 text-slate-700">
                        {pendingInvite.deliveryState === "sent" ? (
                          <p>
                            Email sent {pendingInvite.deliveredAt ? formatter.format(pendingInvite.deliveredAt) : "recently"}.
                          </p>
                        ) : pendingInvite.deliveryState === "failed" ? (
                          <p>
                            Email delivery failed. Share the activation link manually for now.
                            {pendingInvite.deliveryError ? ` ${pendingInvite.deliveryError}` : ""}
                          </p>
                        ) : (
                          <p>
                            Manual share required. Configure `RESEND_API_KEY` and `INVITE_FROM_EMAIL` to send invites automatically.
                          </p>
                        )}
                      </div>
                      <a
                        href={`${appUrl}/activate/${pendingInvite.token}`}
                        data-invite-email={member.email}
                        className="mt-3 block break-all font-medium text-amber-900 underline decoration-amber-400 underline-offset-4"
                      >
                        {`${appUrl}/activate/${pendingInvite.token}`}
                      </a>
                      {canManageUsers(user.role) ? (
                        <div className="mt-4 flex flex-wrap gap-3">
                          {expiringSoon ? (
                            <form action={rotateUserInviteAction.bind(null, pendingInvite.id)}>
                              <button
                                type="submit"
                                className="rounded-full border border-slate-300 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                              >
                                Rotate invite now
                              </button>
                            </form>
                          ) : null}
                          <form action={resendUserInviteAction.bind(null, pendingInvite.id)}>
                            <button
                              type="submit"
                              className="rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 transition hover:border-amber-400 hover:bg-amber-100"
                            >
                              Retry invite delivery
                            </button>
                          </form>
                          <form action={revokeUserInviteAction.bind(null, pendingInvite.id)}>
                            <button
                              type="submit"
                              className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-900 transition hover:border-rose-300 hover:bg-rose-100"
                            >
                              Revoke invite
                            </button>
                          </form>
                        </div>
                      ) : null}
                    </div>
                  ) : canIssueReplacement ? (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-100 px-4 py-4 text-sm text-slate-800">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-semibold">No active invite</p>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Last invite {latestInvite.status.replaceAll("_", " ")}
                        </p>
                      </div>
                      <p className="mt-3 leading-7 text-slate-600">
                        The latest activation link is no longer usable. Issue a replacement invite to rotate the link
                        without recreating the user.
                      </p>
                      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                        {latestInvite.status === "expired"
                          ? `Expired ${formatter.format(latestInvite.expiresAt)}`
                          : `Updated ${formatter.format(latestInvite.updatedAt)}`}
                      </p>
                      {canManageUsers(user.role) ? (
                        <form action={createReplacementInviteAction.bind(null, member.id)} className="mt-4">
                          <button
                            type="submit"
                            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50"
                          >
                            Create replacement invite
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
          {!users.length ? (
            <p className="mt-6 text-sm leading-7 text-slate-600">
              {emailFilter
                ? "No onboarding seats match the current email filter."
                : "No onboarding seats have been created for this organization yet."}
            </p>
          ) : null}
        </article>

        <article className="rounded-[32px] bg-slate-950 p-8 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-300">Invite Seat</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">Create a user and hand off activation</h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            If email delivery is configured, Xelera will send the activation link automatically. Otherwise the
            link will still be generated here for manual sharing.
          </p>
          <div className="mt-5 rounded-[28px] border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Invite Delivery Readiness</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-slate-950/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Automatic Send</p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {inviteConfig.automaticDeliveryReady ? "Ready" : "Waiting on RESEND_API_KEY"}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-950/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">From Address</p>
                <p className="mt-2 text-sm font-semibold text-white">{inviteConfig.fromEmail}</p>
              </div>
              <div className="rounded-2xl bg-slate-950/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Activation Base URL</p>
                <p className="mt-2 break-all text-sm font-semibold text-white">{inviteConfig.appUrl}</p>
              </div>
            </div>
            {!inviteConfig.automaticDeliveryReady ? (
              <p className="mt-4 text-sm leading-7 text-slate-300">
                Add `RESEND_API_KEY` in Vercel to enable real invite emails. Until then, the app will keep
                generating secure links for manual sharing.
              </p>
            ) : null}
            {inviteConfig.usingFallbackAppUrl ? (
              <p className="mt-3 text-sm leading-7 text-slate-300">
                `NEXT_PUBLIC_APP_URL` is not set, so activation links fall back to the current deployment URL.
              </p>
            ) : null}
          </div>
          {canManageUsers(user.role) ? (
            <form action={createUserInviteAction} className="mt-6 space-y-4">
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
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
                  The new user will set their own password during activation.
                </div>
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
                Create activation invite
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
