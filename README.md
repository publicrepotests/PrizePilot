# PrizePilot

PrizePilot is a Next.js prototype for running polished giveaways, contests, referral campaigns, and loyalty rewards.

## Run locally

```bash
npm install
npm run dev
```

App URL:

```txt
http://localhost:3000
```

## Environment variables

```txt
DATABASE_URL=file:./prisma/dev.db
POSTGRES_URL=
NEXT_PUBLIC_APP_URL=http://localhost:3000
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
TURNSTILE_SECRET_KEY=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
PRIZEPILOT_CRON_SECRET=
CRON_SECRET=
PRIZEPILOT_FREE_TEST_MODE=false
SESSION_TTL_DAYS=14
RESET_TOKEN_TTL_MINUTES=30
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

## Cheapest deployment path

Recommended stack:

1. Vercel for app hosting
2. Neon Postgres or another hosted database
3. Stripe for payments
4. Optional `.app` domain later

## Important note before production deploy

The app now supports both:

1. local SQLite for development via `DATABASE_URL=file:./prisma/dev.db`
2. hosted Postgres for production via `POSTGRES_URL=postgres://...`

That means you can keep local development simple and still deploy on a free cloud stack once you have a hosted Postgres connection string.

## Vercel deployment checklist

1. Create a Vercel account: [Next.js on Vercel](https://vercel.com/docs/frameworks/nextjs)
2. Push this project to GitHub
3. Import the repo into Vercel
4. Add project environment variables in Vercel:
   - `POSTGRES_URL`
   - `NEXT_PUBLIC_APP_URL`
   - `STRIPE_SECRET_KEY`
5. Deploy

Official Vercel references:

- [Next.js on Vercel](https://vercel.com/docs/frameworks/nextjs)
- [Environment Variables](https://vercel.com/docs/environment-variables)

For a step-by-step launch flow tailored to this repo, use [DEPLOYMENT.md](/mnt/c/Users/shane/Documents/Codex/2026-04-24/PrizePilot/DEPLOYMENT.md).

## Current production readiness

Current state includes:

1. Username/password auth with hashed passwords.
2. Session cookies with TTL, httpOnly flags, and user-isolated dashboard data.
3. Rate-limited auth and checkout endpoints.
4. Baseline security headers via middleware.
5. Token-based password reset flow with expiring reset links.
6. Stripe webhook endpoint for billing sync at `/api/stripe/webhook`.
7. Webhook idempotency tracking to prevent duplicate Stripe event processing.
8. Readiness endpoint at `/api/health/ready`.
9. Origin checks on authenticated mutation endpoints to reduce CSRF risk.
10. Endpoint-level rate limiting on auth, checkout, campaign edits, team actions, judging, and public entries.
11. CI workflow on GitHub Actions that runs `npm ci` + `npm run build`.
12. Optional Turnstile CAPTCHA support for public entry submission.
13. Scheduled campaign settle endpoint at `/api/jobs/settle-campaigns` for cron-driven auto-close.

Before paid launch, still complete:

1. Stripe webhook fulfillment and subscription lifecycle handling.
2. Observability (error tracking, metrics, uptime alerts).
3. Legal/compliance review of rules templates and jurisdiction restrictions.
4. Automated test coverage for auth/session/billing paths.

## Postgres switch checklist

If you are moving from local SQLite to production Postgres:

1. Keep local dev on SQLite (`DATABASE_URL=file:./prisma/dev.db`).
2. Set `POSTGRES_URL` in production (Vercel) to your managed Postgres URL.
3. Redeploy.
4. Open `/api/health/ready` and confirm `backend` is `postgres`.
5. Create a test account, create a campaign, and submit one test entry.

Note: this app bootstraps/migrates required tables at startup on the selected backend.
