"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePrizePilotStore } from "lib/usePrizePilotStore";

const plans = [
  {
    id: "starter",
    label: "Starter",
    price: "$0",
    copy: "Free plan with limited features for teams just getting started.",
    perks: [
      "1 active campaign and up to 25 entries",
      "Official rules output and duplicate blocking",
      "Core launch controls with basic sharing",
    ],
  },
  {
    id: "pro",
    label: "Pro",
    price: "$19.99",
    copy: "Unlimited campaigns, branding, and judging dashboard access.",
    perks: [
      "Everything in Starter plus full campaign branding",
      "Judging dashboard for skill-contest scoring workflow",
      "Enhanced winner reveal customization and polish",
    ],
  },
  {
    id: "business",
    label: "Business",
    price: "In the works",
    copy: "Temporarily unavailable while we expand advanced team and analytics features.",
    unavailable: true,
    perks: [
      "Team access + role controls (coming soon)",
      "Advanced analytics suite (coming soon)",
      "Operations-grade exports and support (coming soon)",
    ],
  },
];
const glossary = [
  {
    term: "Judging dashboard access",
    status: "Included in Pro+",
    definition:
      "A dedicated workspace for skill contests where judges can review, score, and rank entries with transparent criteria.",
  },
  {
    term: "Team access",
    status: "Business (coming soon)",
    definition:
      "Invite additional staff accounts so multiple people can manage campaigns, moderation, and reporting in one workspace.",
  },
  {
    term: "Advanced analytics",
    status: "Business (coming soon)",
    definition:
      "Deeper reporting on source quality, conversion trends, duplicate risk, and campaign performance over time.",
  },
];

export default function BillingPage() {
  const router = useRouter();
  const { state, hydrated, cancelSubscription, resumeSubscription, setPlan } = usePrizePilotStore();
  const [isUpdatingSubscription, setIsUpdatingSubscription] = useState(false);
  const [readiness, setReadiness] = useState(null);
  const [readinessError, setReadinessError] = useState("");
  const [message, setMessage] = useState(
    "Choose Starter to stay on the free limited plan, or upgrade to Pro for full campaign tools."
  );

  useEffect(() => {
    if (hydrated && !state.session.loggedIn) {
      router.replace("/auth");
    }
  }, [hydrated, router, state.session.loggedIn]);

  useEffect(() => {
    if (!hydrated || !state.session.loggedIn) {
      return;
    }
    let cancelled = false;
    async function loadReadiness() {
      setReadinessError("");
      try {
        const response = await fetch("/api/health/ready", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!cancelled) {
          if (response.ok || payload?.checks) {
            setReadiness(payload);
          } else {
            setReadinessError(payload?.error || "Unable to load launch readiness status.");
          }
        }
      } catch (error) {
        if (!cancelled) {
          setReadinessError(error?.message || "Unable to load launch readiness status.");
        }
      }
    }
    loadReadiness();
    return () => {
      cancelled = true;
    };
  }, [hydrated, state.session.loggedIn]);

  return (
    <div className="app-body">
      <div className="app-shell">
        <aside className="app-sidebar">
          <div className="brand-mark">
            <span className="brand-mark__badge"></span>
            <span>PrizePilot</span>
          </div>
          <p className="app-sidebar__copy">
            Manage your plan, branded features, and launch add-ons.
          </p>
          <nav className="app-nav">
            <Link href="/dashboard">Overview</Link>
            <Link href="/studio">Campaign studio</Link>
            <Link className="is-current" href="/billing">
              Billing
            </Link>
            <Link href="/diagnostics">Diagnostics</Link>
            <Link href="/">Marketing site</Link>
          </nav>
        </aside>

        <main className="app-main">
          <header className="app-topbar">
            <div>
              <p className="eyebrow">Billing</p>
              <h1>Choose the plan that fits how often you launch.</h1>
            </div>
            <div className="app-topbar__actions">
              <Link className="button button--ghost" href="/dashboard">
                Back to dashboard
              </Link>
            </div>
          </header>

          <section className="app-panel">
            <div className="app-section__heading">
              <h2>Current subscription</h2>
              <span className="status-pill">{state.billing.status}</span>
            </div>
            <div className="billing-summary">
              <div className="mini-card">
                <span className="dashboard-card__label">Current plan</span>
                <strong>{state.billing.plan.toUpperCase()}</strong>
              </div>
              <div className="mini-card">
                <span className="dashboard-card__label">Renewal</span>
                <strong>{state.billing.renewalDate}</strong>
              </div>
              <div className="mini-card">
                <span className="dashboard-card__label">Billing contact</span>
                <strong>{state.session.email || "owner@example.com"}</strong>
              </div>
            </div>
            <div className="billing-subscription-actions">
              {state.billing.cancelAtPeriodEnd ? (
                <button
                  className="button button--ghost"
                  type="button"
                  disabled={isUpdatingSubscription}
                  onClick={async () => {
                    setIsUpdatingSubscription(true);
                    try {
                      await resumeSubscription();
                      setMessage(
                        "Cancellation removed. Subscription will continue and renew on schedule."
                      );
                    } catch (error) {
                      setMessage(error.message || "Unable to resume subscription right now.");
                    } finally {
                      setIsUpdatingSubscription(false);
                    }
                  }}
                >
                  {isUpdatingSubscription ? "Updating..." : "Resume subscription"}
                </button>
              ) : (
                <button
                  className="button button--ghost"
                  type="button"
                  disabled={isUpdatingSubscription}
                  onClick={async () => {
                    setIsUpdatingSubscription(true);
                    try {
                      await cancelSubscription();
                      setMessage(
                        "Subscription will cancel at the end of the current billing period."
                      );
                    } catch (error) {
                      setMessage(error.message || "Unable to cancel subscription right now.");
                    } finally {
                      setIsUpdatingSubscription(false);
                    }
                  }}
                >
                  {isUpdatingSubscription ? "Updating..." : "Cancel subscription"}
                </button>
              )}
              {state.billing.cancelAtPeriodEnd ? (
                <p className="studio-save-message">
                  Cancellation is scheduled. Access remains active until {state.billing.renewalDate}.
                </p>
              ) : null}
            </div>
          </section>

          <section className="app-panel">
            <div className="app-section__heading">
              <h2>Launch readiness</h2>
              <span className={`status-pill${readiness?.ok ? "" : " status-pill--alt"}`}>
                {readiness?.ok ? "ready" : "action needed"}
              </span>
            </div>
            {readinessError ? <p className="studio-save-message">{readinessError}</p> : null}
            {readiness?.checks ? (
              <div className="billing-glossary">
                <article className="mini-card">
                  <span className="dashboard-card__label">Stripe mode</span>
                  <strong>{String(readiness.checks.stripeMode || "missing").toUpperCase()}</strong>
                  <p>{readiness.checks.stripeWebhookConfigured ? "Webhook configured." : "Webhook secret missing."}</p>
                </article>
                <article className="mini-card">
                  <span className="dashboard-card__label">Entry protection</span>
                  <strong>{readiness.checks.captchaConfigured ? "CAPTCHA ON" : "CAPTCHA OFF"}</strong>
                  <p>{readiness.checks.captchaConfigured ? "Turnstile verification is active." : "Configure Turnstile keys."}</p>
                </article>
                <article className="mini-card">
                  <span className="dashboard-card__label">Scheduler</span>
                  <strong>{readiness.checks.cronSecretConfigured ? "CRON READY" : "CRON MISSING"}</strong>
                  <p>{readiness.checks.dueLiveCampaigns || 0} overdue live campaign(s) waiting for settle.</p>
                </article>
              </div>
            ) : null}
            {Array.isArray(readiness?.warnings) && readiness.warnings.length > 0 ? (
              <ul className="plan-perks">
                {readiness.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="pricing-grid pricing-grid--app">
            {plans.map((plan) => (
              <article
                className={`price-card${plan.id === "pro" ? " price-card--featured" : ""}${plan.unavailable ? " price-card--disabled" : ""}`}
                key={plan.id}
              >
                <p className="dashboard-card__label">{plan.label}</p>
                <h3>
                  {plan.price}
                  {plan.id !== "business" ? <span>/mo</span> : null}
                </h3>
                <p>{plan.copy}</p>
                <ul className="plan-perks">
                  {plan.perks.map((perk) => (
                    <li key={`${plan.id}-${perk}`}>{perk}</li>
                  ))}
                </ul>
                <button
                  className="button"
                  disabled={Boolean(plan.unavailable)}
                  onClick={async () => {
                    if (plan.unavailable) {
                      setMessage("Business plan is temporarily unavailable while we finish enterprise features.");
                      return;
                    }

                    if (plan.id === "starter") {
                      await setPlan(plan.id);
                      setMessage(
                        "Starter (free) is active. You can upgrade to Pro anytime."
                      );
                      return;
                    }

                    const response = await fetch("/api/checkout", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({ plan: plan.id }),
                    });

                    const payload = await response.json();

                    if (!response.ok) {
                      setMessage(payload.error || "Unable to start Stripe checkout.");
                      return;
                    }

                    if (payload.url) {
                      window.location.href = payload.url;
                      return;
                    }

                    await setPlan(plan.id);
                    setMessage(
                      `${plan.label} is now active for this workspace.`
                    );
                  }}
                  type="button"
                >
                  {plan.unavailable
                    ? "Business coming soon"
                    : plan.id === "starter"
                      ? "Use Starter (Free)"
                      : `Choose ${plan.label}`}
                </button>
              </article>
            ))}
          </section>

          <section className="app-panel">
            <div className="app-section__heading">
              <h2>Checkout and plan updates</h2>
            </div>
            <div className="billing-checkout">{message}</div>
          </section>

          <section className="app-panel">
            <div className="app-section__heading">
              <h2>Feature glossary</h2>
            </div>
            <div className="billing-glossary">
              {glossary.map((item) => (
                <article className="mini-card" key={item.term}>
                  <span className="dashboard-card__label">{item.status}</span>
                  <strong>{item.term}</strong>
                  <p>{item.definition}</p>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
