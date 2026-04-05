import { saveProductAction } from "@/app/actions";
import { StatusPill } from "@/components/status-pill";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireUser } from "@/lib/auth";
import { getProducts } from "@/lib/data";
import { canManageProducts } from "@/lib/permissions";

export default async function ProductsPage() {
  const user = await requireUser();
  const products = await getProducts(user);

  return (
    <WorkspaceShell user={user}>
      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <article className="rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-lg shadow-slate-200/40">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Product Management</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Define what the platform is selling</h1>
          <div className="mt-6 space-y-4">
            {products.map((product) => (
              <article key={product.id} className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-950">{product.name}</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {product.industry} · {product.productType} · {product.targetPersona}
                    </p>
                  </div>
                  <StatusPill value={product.isActive ? "approved" : "paused"} />
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-600">{product.description}</p>
                <p className="mt-4 text-sm leading-7 text-slate-600">{product.problemStatement}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="rounded-[32px] bg-slate-950 p-8 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-300">Admin Controls</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">Create a new product angle</h2>
          {canManageProducts(user.role) ? (
            <form action={saveProductAction} className="mt-6 space-y-4">
              <input name="name" placeholder="Product name" className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm" />
              <textarea name="description" rows={3} placeholder="Description" className="w-full rounded-[24px] border border-slate-700 bg-slate-900 px-4 py-3 text-sm" />
              <div className="grid gap-4 md:grid-cols-2">
                <input name="industry" placeholder="Industry" className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm" />
                <input name="productType" placeholder="Product type" className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm" />
                <input name="targetPersona" placeholder="Target persona" className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm" />
                <input name="pricingNotes" placeholder="Pricing notes" className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm" />
              </div>
              <textarea name="problemStatement" rows={3} placeholder="Problem statement" className="w-full rounded-[24px] border border-slate-700 bg-slate-900 px-4 py-3 text-sm" />
              <textarea name="keyBenefits" rows={4} placeholder="One benefit per line" className="w-full rounded-[24px] border border-slate-700 bg-slate-900 px-4 py-3 text-sm" />
              <textarea name="samplePitch" rows={3} placeholder="Sample pitch" className="w-full rounded-[24px] border border-slate-700 bg-slate-900 px-4 py-3 text-sm" />
              <button
                type="submit"
                className="rounded-full bg-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-teal-300"
              >
                Add product
              </button>
            </form>
          ) : (
            <p className="mt-5 text-sm leading-7 text-slate-300">Only managers and admins can create or manage products.</p>
          )}
        </article>
      </section>
    </WorkspaceShell>
  );
}
