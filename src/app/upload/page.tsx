import { createLeadListAction } from "@/app/actions";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireUser } from "@/lib/auth";
import { getAssignableSalespeople } from "@/lib/data";

export default async function UploadPage() {
  const user = await requireUser();
  const salespeople = await getAssignableSalespeople(user.organizationId);

  return (
    <WorkspaceShell user={user}>
      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[32px] bg-slate-950 p-8 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-300">Upload Intake</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">Bring an event list into the review pipeline.</h1>
          <p className="mt-4 text-base leading-7 text-slate-300">
            Capture the list context up front. That context flows into research, product angle selection, and
            the first draft of every sequence.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-slate-300">
            <li>Accepts CSV and XLSX files.</li>
            <li>Persists accepted rows, rejected row reasons, and list-level metadata.</li>
            <li>Lets you hand the list to a named salesperson before research starts.</li>
          </ul>
        </div>

        <form
          action={createLeadListAction}
          className="rounded-[32px] border border-white/80 bg-white/90 p-8 shadow-lg shadow-slate-200/40"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">List Name</span>
              <input name="name" required className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Event or Source</span>
              <input
                name="eventSourceName"
                required
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Event Date</span>
              <input name="eventDate" type="date" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Assigned Salesperson</span>
              <select
                name="assignedSalespersonId"
                defaultValue={user.id}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
              >
                {salespeople.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Event City</span>
              <input name="eventCity" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Event Country</span>
              <input name="eventCountry" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
            </label>
          </div>
          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-medium text-slate-700">List-level Notes</span>
            <textarea
              name="notes"
              rows={4}
              className="w-full rounded-[24px] border border-slate-200 px-4 py-3 text-sm"
              placeholder="What context should the AI preserve from the event, booth conversation, or campaign?"
            />
          </label>
          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Upload File</span>
            <input
              name="file"
              type="file"
              accept=".csv,.xlsx"
              required
              className="w-full rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm"
            />
          </label>
          <button
            type="submit"
            className="mt-6 rounded-full bg-teal-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-400"
          >
            Upload and create list
          </button>
        </form>
      </section>
    </WorkspaceShell>
  );
}
