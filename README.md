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

For a step-by-step launch flow tailored to this repo, use [DEPLOYMENT.md](/mnt/c/Users/shane/Documents/Codex/2026-04-24/i-want-to-make-a-cool/DEPLOYMENT.md).

## What I recommend next

If you want the app genuinely deployable on a free cloud stack, the next setup step is creating a free hosted Postgres database and dropping its connection string into `POSTGRES_URL`.
