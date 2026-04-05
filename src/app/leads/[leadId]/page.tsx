import { notFound } from "next/navigation";
import {
  approveSequenceAction,
  pauseSequenceAction,
  queueApprovedSequenceAction,
  regenerateAllAction,
  regenerateOneAction,
  rejectSequenceAction,
  retryFailedSequenceEmailAction,
  saveSequenceEditsAction,
} from "@/app/actions";
import { StatusPill } from "@/components/status-pill";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireUser } from "@/lib/auth";
import { getLeadDetails } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { canManageUsers } from "@/lib/permissions";

type LeadDetailPageProps = {
  params: Promise<{ leadId: string }>;
};

export default async function LeadDetailPage({ params }: LeadDetailPageProps) {
  const user = await requireUser();
  const { leadId } = await params;
  const lead = await getLeadDetails(leadId, user);

  if (!lead || !lead.sequence) {
    notFound();
  }

  return (
    <WorkspaceShell user={user}>
      <section className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
        <div className="space-y-6">
          <article className="rounded-[32px] bg-slate-950 p-8 text-white">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-4xl font-semibold tracking-tight">{lead.fullName}</h1>
              <StatusPill value={lead.status} />
            </div>
            <p className="mt-4 text-base leading-7 text-slate-300">
              {lead.title || "Title n/a"} · {lead.email || "No email"} · {lead.phone || "No phone"}
            </p>
            <p className="mt-5 text-sm leading-7 text-slate-300">
              {lead.contactNotes || "No contact notes were captured on intake."}
            </p>
          </article>

          <article className="rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-lg shadow-slate-200/40">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">List Context</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{lead.leadList.name}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {lead.leadList.eventSourceName} · {formatDate(lead.leadList.eventDate)} · {lead.leadList.eventCity || "City n/a"},{" "}
              {lead.leadList.eventCountry || "Country n/a"}
            </p>
            <p className="mt-4 text-sm leading-7 text-slate-600">{lead.leadList.notes || "No list-level notes recorded."}</p>
          </article>

          <article className="rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-lg shadow-slate-200/40">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Research and Strategy</p>
            <div className="mt-5 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Company Research</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{lead.company?.name ?? "Pending"}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{lead.company?.summary || "Company enrichment has not run yet."}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Contact Research</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{lead.contact?.roleSummary || "Contact enrichment has not run yet."}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{lead.contact?.buyerAngle || "Buyer angle pending."}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Messaging Brief</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{lead.sequence.mainOutreachAngle}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{lead.sequence.painHypothesis}</p>
                <p className="mt-2 text-sm font-medium text-slate-800">{lead.sequence.suggestedCta}</p>
              </div>
            </div>
          </article>

          <article className="rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-lg shadow-slate-200/40">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Review History</p>
            <div className="mt-5 space-y-3">
              {lead.reviewActions.map((action) => (
                <div key={action.id} className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-semibold text-slate-900">{action.actor.name}</p>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{formatDate(action.createdAt, "MMM d, yyyy h:mm a")}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {action.actionType.replaceAll("_", " ")}
                    {action.prompt ? ` · ${action.prompt}` : ""}
                    {action.note ? ` · ${action.note}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </article>
        </div>

        <div className="space-y-6">
          <form
            action={saveSequenceEditsAction.bind(null, lead.id)}
            className="rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-lg shadow-slate-200/40"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Review Screen</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Edit, regenerate, and approve the full 3-email sequence</h2>
              </div>
              <StatusPill value={lead.sequence.status} />
            </div>

            <div className="mt-6 space-y-5">
              {lead.sequence.emails.map((email) => (
                <section key={email.id} className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Email {email.emailOrder}</p>
                      <p className="mt-2 text-sm font-medium text-slate-700">Scheduled offset: {email.scheduledSendOffsetHours} hours</p>
                    </div>
                    <div className="sm:min-w-[260px]">
                      <input
                        name={`prompt_${email.emailOrder}`}
                        placeholder={`Make email ${email.emailOrder} softer or more technical`}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                      />
                      <button
                        type="submit"
                        formAction={regenerateOneAction.bind(null, lead.id, email.emailOrder)}
                        className="mt-3 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-teal-300 hover:text-teal-700"
                      >
                        Regenerate this email
                      </button>
                    </div>
                  </div>
                  <label className="mt-4 block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">Subject</span>
                    <input
                      name={`subject_${email.emailOrder}`}
                      defaultValue={email.subject}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                    />
                  </label>
                  <label className="mt-4 block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">Body</span>
                    <textarea
                      name={`body_${email.emailOrder}`}
                      rows={8}
                      defaultValue={email.body}
                      className="w-full rounded-[24px] border border-slate-200 bg-white px-4 py-3 text-sm leading-7"
                    />
                  </label>
                </section>
              ))}
            </div>

            <div className="mt-6 rounded-[26px] border border-slate-200 bg-slate-50/80 p-5">
              <p className="text-sm font-semibold text-slate-900">Regenerate all three emails together</p>
              <textarea
                name="prompt"
                rows={3}
                defaultValue="Make all 3 emails shorter, more direct, and slightly more technical."
                className="mt-3 w-full rounded-[24px] border border-slate-200 bg-white px-4 py-3 text-sm"
              />
              <button
                type="submit"
                formAction={regenerateAllAction.bind(null, lead.id)}
                className="mt-3 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-teal-300 hover:text-teal-700"
              >
                Regenerate all
              </button>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Save manual edits
              </button>
            </div>
          </form>

          <article className="rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-lg shadow-slate-200/40">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Approval Controls</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <form action={approveSequenceAction.bind(null, lead.id)}>
                <button
                  type="submit"
                  className="rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
                >
                  Approve full sequence
                </button>
              </form>
              <form action={pauseSequenceAction.bind(null, lead.id)}>
                <button
                  type="submit"
                  className="rounded-full bg-amber-200 px-5 py-3 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                >
                  Pause
                </button>
              </form>
              <form action={rejectSequenceAction.bind(null, lead.id)}>
                <button
                  type="submit"
                  className="rounded-full bg-rose-200 px-5 py-3 text-sm font-semibold text-rose-900 hover:bg-rose-100"
                >
                  Reject
                </button>
              </form>
              {canManageUsers(user.role) && lead.sequence.status === "approved" ? (
                <form action={queueApprovedSequenceAction.bind(null, lead.id)}>
                  <button
                    type="submit"
                    className="rounded-full bg-cyan-200 px-5 py-3 text-sm font-semibold text-cyan-950 hover:bg-cyan-100"
                  >
                    Queue approved sequence
                  </button>
                </form>
              ) : null}
            </div>
          </article>

          <article className="rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-lg shadow-slate-200/40">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Outbound Delivery</p>
            <div className="mt-5 space-y-4">
              {lead.sequence.emails.map((email) => (
                <div key={email.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">Email {email.emailOrder}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        Due {formatDate(email.dueAt, "MMM d, yyyy h:mm a")}
                      </p>
                    </div>
                    <StatusPill value={email.sendStatus} />
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    {email.sentAt
                      ? `Sent ${formatDate(email.sentAt, "MMM d, yyyy h:mm a")}`
                      : email.failedAt
                        ? `Failed ${formatDate(email.failedAt, "MMM d, yyyy h:mm a")}`
                        : email.queuedAt
                          ? `Queued ${formatDate(email.queuedAt, "MMM d, yyyy h:mm a")}`
                          : "Not queued for send yet."}
                  </p>
                  {email.lastDeliveryError ? (
                    <p className="mt-2 text-sm font-medium text-rose-700">{email.lastDeliveryError}</p>
                  ) : null}
                  {canManageUsers(user.role) && email.sendStatus === "failed" ? (
                    <form action={retryFailedSequenceEmailAction.bind(null, email.id, lead.id)} className="mt-3">
                      <button
                        type="submit"
                        className="rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-900 hover:border-rose-400 hover:bg-rose-50"
                      >
                        Retry failed send
                      </button>
                    </form>
                  ) : null}
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>
    </WorkspaceShell>
  );
}
