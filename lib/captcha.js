const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function getTurnstileSecret() {
  return String(process.env.TURNSTILE_SECRET_KEY || "").trim();
}

export function getCaptchaConfig() {
  const siteKey = String(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim();
  const secretKey = getTurnstileSecret();
  const enabled = Boolean(siteKey && secretKey);
  return {
    provider: enabled ? "turnstile" : "none",
    enabled,
    siteKey,
  };
}

export async function verifyEntryCaptcha(token, remoteIp) {
  const config = getCaptchaConfig();
  if (!config.enabled) {
    return {
      ok: true,
      provider: "none",
      skipped: true,
    };
  }

  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    return {
      ok: false,
      provider: "turnstile",
      message: "Please complete the security check before submitting.",
    };
  }

  const payload = new URLSearchParams();
  payload.set("secret", getTurnstileSecret());
  payload.set("response", normalizedToken);
  if (remoteIp) {
    payload.set("remoteip", String(remoteIp).trim());
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload,
      cache: "no-store",
    });

    const body = await response.json().catch(() => ({}));
    if (response.ok && body?.success) {
      return {
        ok: true,
        provider: "turnstile",
      };
    }

    return {
      ok: false,
      provider: "turnstile",
      message: "Security check failed. Please try again.",
      errors: Array.isArray(body?.["error-codes"]) ? body["error-codes"] : [],
    };
  } catch {
    return {
      ok: false,
      provider: "turnstile",
      message: "Unable to verify the security check right now. Please retry.",
    };
  }
}
