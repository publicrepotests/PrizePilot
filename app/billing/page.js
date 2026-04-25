"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePrizePilotStore } from "lib/usePrizePilotStore";

const plans = [
  {
    id: "starter",
    label: "Starter",
    price: "$19",
    copy: "3 campaigns, 500 entries, and email confirmations.",
  },
  {
    id: "pro",
    label: "Pro",
    price: "$49",
    copy: "Unlimited campaigns, branding, and judging dashboard access.",
  },
  {
    id: "business",
    label: "Business",
    price: "$99",
    copy: "Team access, exports, and advanced analytics.",
  },
];

export default function BillingPage() {
  const router = useRouter();
  const { state, hydrated, setPlan } = usePrizePilotStore();
  const [message, setMessage] = useState(
    "Pick a plan above to simulate a Stripe checkout confirmation."
  );

  useEffect(() => {
    if (hydrated && !state.session.loggedIn) {
      router.replace("/auth");
    }
  }, [hydrated, router, state.session.loggedIn]);

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
          </section>

          <section className="pricing-grid pricing-grid--app">
            {plans.map((plan) => (
              <article
                className={`price-card${plan.id === "pro" ? " price-card--featured" : ""}`}
                key={plan.id}
              >
                <p className="dashboard-card__label">{plan.label}</p>
                <h3>{plan.price}<span>/mo</span></h3>
                <p>{plan.copy}</p>
                <button
                  className="button"
                  onClick={async () => {
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
                      `Stripe checkout simulated: ${plan.label} selected successfully. Organizer billing is now marked active in the database.`
                    );
                  }}
                  type="button"
                >
                  Choose {plan.label}
                </button>
              </article>
            ))}
          </section>

          <section className="app-panel">
            <div className="app-section__heading">
              <h2>Checkout simulation</h2>
            </div>
            <div className="billing-checkout">{message}</div>
          </section>
        </main>
      </div>
    </div>
  );
}
