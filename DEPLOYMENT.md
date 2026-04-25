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
5. Deploy.

## 5. Verify after first deploy

1. Open `/auth`
2. Sign in with test organizer info
3. Create a campaign in `/studio`
4. Confirm campaign appears on `/dashboard`
5. Open `/billing` and test checkout path behavior

## 6. Add custom domain (`.app`)

1. Buy domain from your registrar.
2. In Vercel Project Settings > Domains, add your domain.
3. Apply the DNS records Vercel gives you at the registrar.
4. Wait for verification + SSL issuance.
5. Set `NEXT_PUBLIC_APP_URL` to the live `https://...` domain.

## 7. Recommended hardening after launch

1. Move from demo single-tenant data model to per-user/per-organization records.
2. Add proper auth provider (NextAuth/Clerk/Auth0/etc).
3. Add Stripe webhook handling for authoritative billing state.
4. Add rate limiting and abuse protection on API routes.
5. Add monitoring and error tracking.
