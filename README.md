# Xelera SDR Sales Module

Workflow-first SDR application for turning event lead lists into researched, human-reviewed 3-email sequences. The MVP is built around explicit approval, rep control, and manager-only bulk approval for review-ready drafts.

## What Is Included

- `Next.js App Router` UI deployed to `Vercel`
- `Neon Postgres` as the system of record via `Prisma`
- Credentials-based demo auth with role-aware access
- CSV/XLSX lead intake with row-level rejection tracking
- Lead lists grid, per-list lead grid, and lead detail review screen
- Product management and salesperson profile settings
- Research, drafting, regeneration, manual editing, approval, pause, reject, and manager bulk approval
- Prisma seed data with demo users and sample pipeline records

## Demo Users

- Sales manager: `ava.manager@xelera.ai` / `Welcome123!`
- Salesperson: `leo.rep@xelera.ai` / `Welcome123!`
- Admin operator: `maya.ops@xelera.ai` / `Welcome123!`

## Local Setup

1. Copy `.env.example` to `.env` and provide a valid `DATABASE_URL` and `AUTH_SECRET`.
   For invite delivery, also set `NEXT_PUBLIC_APP_URL` and optionally `INVITE_FROM_EMAIL`.
   Add `RESEND_API_KEY` when you want the app to send invite emails automatically.
   Add `CRON_SECRET` to protect scheduled invite hygiene runs.
2. Install dependencies:

```bash
npm install
```

3. Push the schema to Neon and seed demo data:

```bash
npm run db:push
npm run db:seed
```

4. Start the app:

```bash
npm run dev
```

5. Visit [http://localhost:3000](http://localhost:3000).

## Key Scripts

```bash
npm run dev
npm run lint
npm run build
npm run db:push
npm run db:seed
```

## Data Model Highlights

- Tenant-ready organization boundary for future multi-tenant expansion
- Lead intake tables for uploads, raw row outcomes, and accepted leads
- Company/contact research models separated from list-specific lead state
- Sequence and sequence-email records for the 3-email progression
- Review action, bulk approval batch, and audit event history for human control

## Deployment Notes

- Add `DATABASE_URL`, `AUTH_SECRET`, and `AUTH_TRUST_HOST=true` to Vercel.
- Add `NEXT_PUBLIC_APP_URL` with your production URL so invite links always point to the canonical host.
- Add `INVITE_FROM_EMAIL` to control the sender name/address for invite emails.
- Add `RESEND_API_KEY` to turn on automatic invite delivery. Without it, admins can still manually share the generated invite links.
- Add `CRON_SECRET` so the scheduled invite hygiene route at `/api/cron/invite-hygiene` can run safely.
- `vercel.json` schedules the invite hygiene digest daily at `13:00 UTC`, which is `9:00 AM` Eastern during daylight saving time.
- Run `npm run db:push` and `npm run db:seed` against the target Neon database before first production use.
- The included auth flow is intended for an MVP/internal pilot. If you later need customer-facing SaaS auth, swap the credentials flow for a managed provider.
