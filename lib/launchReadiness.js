export function parseStripeMode(secretKey) {
  const key = String(secretKey || "").trim();
  if (!key) {
    return "missing";
  }
  if (key.startsWith("sk_live_")) {
    return "live";
  }
  if (key.startsWith("sk_test_")) {
    return "test";
  }
  return "unknown";
}

export function buildLaunchReadinessChecks(store) {
  const stripeMode = parseStripeMode(process.env.STRIPE_SECRET_KEY);
  const freeTestMode = String(process.env.PRIZEPILOT_FREE_TEST_MODE || "").trim().toLowerCase() === "true";
  const captchaConfigured = Boolean(
    process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  );
  const cronSecretConfigured = Boolean(process.env.PRIZEPILOT_CRON_SECRET || process.env.CRON_SECRET);
  const sentryConfigured = Boolean(process.env.SENTRY_DSN);
  const checks = {
    database: Boolean(store?.ok),
    stripeSecretConfigured: stripeMode !== "missing",
    stripeMode,
    stripeWebhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    appUrlConfigured: Boolean(process.env.NEXT_PUBLIC_APP_URL),
    resetEmailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
    captchaConfigured,
    cronSecretConfigured,
    sentryConfigured,
    freeTestModeDisabled: !freeTestMode,
    dueLiveCampaigns: Number(store?.dueLiveCampaigns || 0),
  };

  const warnings = [];
  if (checks.stripeMode === "test") {
    warnings.push("Stripe secret key is in test mode.");
  }
  if (checks.freeTestModeDisabled === false) {
    warnings.push("PRIZEPILOT_FREE_TEST_MODE is enabled.");
  }
  if (!checks.captchaConfigured) {
    warnings.push("Turnstile CAPTCHA is not configured.");
  }
  if (!checks.cronSecretConfigured) {
    warnings.push("Cron secret is not configured.");
  }
  if (!checks.sentryConfigured) {
    warnings.push("Sentry is not configured.");
  }
  if (checks.dueLiveCampaigns > 0) {
    warnings.push(`${checks.dueLiveCampaigns} live campaigns are past end time and waiting to settle.`);
  }

  const ok =
    checks.database &&
    checks.appUrlConfigured &&
    checks.stripeSecretConfigured &&
    checks.stripeWebhookConfigured &&
    checks.freeTestModeDisabled;

  return { ok, checks, warnings };
}
