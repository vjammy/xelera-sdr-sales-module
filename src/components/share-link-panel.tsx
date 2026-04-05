"use client";

import { useState } from "react";

export function ShareLinkPanel({
  title,
  description,
  url,
}: {
  title: string;
  description: string;
  url: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4" data-share-view-panel>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <a
          href={url}
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-center text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Open shared view
        </a>
      </div>
      <div className="mt-4 flex flex-col gap-3 lg:flex-row">
        <input
          readOnly
          value={url}
          aria-label="Shareable digest view link"
          data-share-view-url
          className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
        />
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          }}
          className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
