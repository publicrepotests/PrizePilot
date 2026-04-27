"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePrizePilotStore } from "lib/usePrizePilotStore";

export default function DiagnosticsPage() {
  const router = useRouter();
  const { state, hydrated } = usePrizePilotStore();
  const [loading, setLoading] = useState(true);
  const [runningAction, setRunningAction] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [flashMessage, setFlashMessage] = useState("");
  const [payload, setPayload] = useState(null);

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
    async function load() {
      setLoading(true);
      setErrorMessage("");
      try {
        const response = await fetch("/api/diagnostics", { cache: "no-store" });
        const nextPayload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(nextPayload?.error || "Unable to load diagnostics.");
        }
        if (!cancelled) {
          setPayload(nextPayload);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error.message || "Unable to load diagnostics.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
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
            Operational checks and incident tools.
          </p>
          <nav className="app-nav">
            <Link href="/dashboard">Overview</Link>
            <Link href="/studio">Campaign studio</Link>
            <Link href="/billing">Billing</Link>
            <Link className="is-current" href="/diagnostics">
              Diagnostics
            </Link>
            <Link href="/">Marketing site</Link>
          </nav>
        </aside>

        <main className="app-main">
          <header className="app-topbar">
            <div>
              <p className="eyebrow">Diagnostics</p>
              <h1>Launch safety console.</h1>
            </div>
            <div className="app-topbar__actions">
              <Link className="button button--ghost" href="/dashboard">
                Back to dashboard
              </Link>
            </div>
          </header>

          <section className="app-panel">
            <div className="app-section__heading">
              <h2>Status snapshot</h2>
              <span className={`status-pill${payload?.readiness?.ok ? "" : " status-pill--alt"}`}>
                {payload?.readiness?.ok ? "healthy" : "attention"}
              </span>
            </div>
            {loading ? <p className="studio-save-message">Loading diagnostics...</p> : null}
            {errorMessage ? <p className="studio-save-message">{errorMessage}</p> : null}
            {!loading && payload ? (
              <div className="billing-glossary">
                <article className="mini-card">
                  <span className="dashboard-card__label">Backend</span>
                  <strong>{String(payload.backend || "unknown").toUpperCase()}</strong>
                  <p>Workspace: {payload.session?.username || "unknown"}</p>
                </article>
                <article className="mini-card">
                  <span className="dashboard-card__label">Stripe mode</span>
                  <strong>{String(payload.readiness?.checks?.stripeMode || "missing").toUpperCase()}</strong>
                  <p>Webhook: {payload.readiness?.checks?.stripeWebhookConfigured ? "configured" : "missing"}</p>
                </article>
                <article className="mini-card">
                  <span className="dashboard-card__label">Overdue live campaigns</span>
                  <strong>{Number(payload.dueLiveCampaigns || 0)}</strong>
                  <p>Use settle action to close expired campaigns now.</p>
                </article>
              </div>
            ) : null}
            {Array.isArray(payload?.readiness?.warnings) && payload.readiness.warnings.length > 0 ? (
              <ul className="plan-perks">
                {payload.readiness.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="app-panel">
            <div className="app-section__heading">
              <h2>Actions</h2>
            </div>
            <div className="campaign-actions">
              <button
                className="button button--ghost"
                type="button"
                disabled={runningAction}
                onClick={async () => {
                  setRunningAction(true);
                  setFlashMessage("");
                  setErrorMessage("");
                  try {
                    const response = await fetch("/api/diagnostics", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "settle_now" }),
                    });
                    const result = await response.json().catch(() => ({}));
                    if (!response.ok) {
                      throw new Error(result?.error || "Unable to settle campaigns right now.");
                    }
                    setFlashMessage(
                      `Settle complete: ${result.settledCount} campaign(s) processed at ${result.settledAt}.`
                    );
                  } catch (error) {
                    setErrorMessage(error.message || "Unable to run settle action.");
                  } finally {
                    setRunningAction(false);
                  }
                }}
              >
                {runningAction ? "Running..." : "Settle expired campaigns now"}
              </button>
            </div>
            {flashMessage ? <p className="studio-save-message">{flashMessage}</p> : null}
          </section>
        </main>
      </div>
    </div>
  );
}
