# PrizePilot Deployment Runbook (Vercel + Neon + Stripe)

This is the fastest low-cost production path for this repo.

## 1. Create your hosted Postgres (Neon)

1. Create a Neon account: https://neon.tech
2. Create a new project.
3. Copy the connection string (looks like `postgresql://...`).
4. Save it as `POSTGRES_URL` for Vercel.

## 2. Create your Stripe keys

1. Create or log into Stripe: https://dashboard.stripe.com
2. Go to Developers > API keys.
3. Copy your secret key (`sk_...`) for test mode first.
4. Save it as `STRIPE_SECRET_KEY` for Vercel.

## 3. Push this repo to GitHub

From this project root:

```bash
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

## 4. Deploy on Vercel

1. Create/log into Vercel: https://vercel.com
2. Import your GitHub repo.
3. Framework should auto-detect as Next.js.
4. Add these Environment Variables in Vercel Project Settings:
   - `POSTGRES_URL` = your Neon connection string
   - `NEXT_PUBLIC_APP_URL` = your production URL (for example `https://prizepilot.app`)
   - `STRIPE_SECRET_KEY` = your Stripe secret key
   - `STRIPE_WEBHOOK_SECRET` = webhook signing secret from Stripe
   - `PRIZEPILOT_FREE_TEST_MODE` = `false`
   - `TURNSTILE_SECRET_KEY` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` for public entry CAPTCHA
   - `CRON_SECRET` (or `PRIZEPILOT_CRON_SECRET`) for scheduled campaign settling endpoint auth
   - `SESSION_TTL_DAYS` = recommended `14`
   - `RESET_TOKEN_TTL_MINUTES` = recommended `30`
   - `RESEND_API_KEY` and `RESEND_FROM_EMAIL` for password reset emails
5. Deploy.

## Stripe webhook setup

1. In Stripe Dashboard, create a webhook endpoint:
   - URL: `https://<your-domain>/api/stripe/webhook`
2. Subscribe to:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
3. Copy signing secret into `STRIPE_WEBHOOK_SECRET`.

## 5. Verify after first deploy

1. Open `/auth`
2. Sign in with test organizer info
3. Create a campaign in `/studio`
4. Confirm campaign appears on `/dashboard`
5. Open `/billing` and test checkout path behavior
6. Check `/api/health/ready` returns `ok: true` when required env is configured
7. Confirm `backend` in `/api/health/ready` is `postgres` in production
8. Confirm `checks.stripeMode` is `live` and `checks.freeTestModeDisabled` is `true`

## Scheduled auto-close job

Use Vercel Cron (or any scheduler) to call:

- `GET https://<your-domain>/api/jobs/settle-campaigns`
- Header: `Authorization: Bearer <CRON_SECRET>`

Recommended cadence: every 1-5 minutes.

## 6. Add custom domain (`.app`)

1. Buy domain from your registrar.
2. In Vercel Project Settings > Domains, add your domain.
3. Apply the DNS records Vercel gives you at the registrar.
4. Wait for verification + SSL issuance.
5. Set `NEXT_PUBLIC_APP_URL` to the live `https://...` domain.

## 7. Recommended hardening after launch

Already included in this repo:

1. Multi-tenant user-scoped data (each user sees only their own campaigns).
2. Username/password auth with hashed passwords.
3. Session expiry (`SESSION_TTL_DAYS`) and secure cookie settings.
4. Auth and checkout rate limiting.
5. Baseline security headers in middleware.
6. Origin checks for authenticated mutation endpoints.
7. Endpoint rate limiting for campaign/team/judging/public-entry writes.
8. CI build workflow (`.github/workflows/ci.yml`).

Still required before accepting real customer payments:

1. Add Stripe webhook handling for authoritative billing state.
2. Add monitoring and error tracking.
3. Add automated tests and deployment health checks.
4. Complete legal review of giveaway/contest rules by jurisdiction.
