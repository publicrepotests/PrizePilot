"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePrizePilotStore } from "lib/usePrizePilotStore";

const filters = ["all", "giveaway", "contest", "referral"];

const planCopy = {
  starter: "Great for local shops running a few campaigns each month.",
  pro: "Unlimited campaigns, branding controls, and judging dashboard access.",
  business: "Team access, analytics, exports, and branded campaign ops.",
};

export default function DashboardPage() {
  const router = useRouter();
  const { state, hydrated, signOut } = usePrizePilotStore();
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (hydrated && !state.session.loggedIn) {
      router.replace("/auth");
    }
  }, [hydrated, router, state.session.loggedIn]);

  const campaigns = state.campaigns.filter(
    (campaign) => filter === "all" || campaign.type === filter
  );

  return (
    <div className="app-body">
      <div className="app-shell">
        <aside className="app-sidebar">
          <div className="brand-mark">
            <span className="brand-mark__badge"></span>
            <span>PrizePilot</span>
          </div>
          <p className="app-sidebar__copy">
            Clean campaigns for detailers, gyms, boutiques, creators, and local brands.
          </p>
          <nav className="app-nav">
            <Link className="is-current" href="/dashboard">
              Overview
            </Link>
            <Link href="/studio">Campaign studio</Link>
            <Link href="/billing">Billing</Link>
            <Link href="/">Marketing site</Link>
          </nav>
          <div className="app-sidebar__card">
            <p className="dashboard-card__label">Current plan</p>
            <h3>{state.billing.plan.toUpperCase()}</h3>
            <p>{planCopy[state.billing.plan]}</p>
          </div>
        </aside>

        <main className="app-main">
          <header className="app-topbar">
            <div>
              <p className="eyebrow">Organizer dashboard</p>
              <h1>Good campaigns should feel easy to run.</h1>
              <p className="app-welcome">
                {state.session.organizerName || "Organizer"},{" "}
                {state.session.businessName || "your workspace"} is ready.
              </p>
            </div>
            <div className="app-topbar__actions">
              <Link className="button button--ghost" href="/">
                Back to site
              </Link>
              <Link className="button" href="/studio">
                New campaign
              </Link>
              <button
                className="button button--ghost"
                type="button"
                onClick={async () => {
                  await signOut();
                  router.push("/auth");
                }}
              >
                Sign out
              </button>
            </div>
          </header>

          <section className="app-hero-grid">
            <article className="app-panel app-panel--feature">
              <div className="app-panel__row">
                <span className="pill pill--warm">Live this week</span>
                <span className="muted">7 day trend: +18%</span>
              </div>
              <h2>Win a free full detail</h2>
              <p>
                The launch is collecting qualified local leads, blocking duplicate
                entries, and driving more shares than the last campaign.
              </p>
              <div className="dashboard-stats dashboard-stats--app">
                <article>
                  <span className="dashboard-card__label">Valid entries</span>
                  <strong>1,248</strong>
                </article>
                <article>
                  <span className="dashboard-card__label">Share clicks</span>
                  <strong>514</strong>
                </article>
                <article>
                  <span className="dashboard-card__label">Blocked duplicates</span>
                  <strong>37</strong>
                </article>
              </div>
            </article>

            <article className="app-panel app-panel--stack">
              <p className="dashboard-card__label">Tasks to close out</p>
              <div className="task-list">
                <div>
                  <strong>Review 12 suspicious referrals</strong>
                  <p>Most were shared from the same IP block in under two minutes.</p>
                </div>
                <div>
                  <strong>Schedule the winner announcement</strong>
                  <p>Publish on May 31 at 2:00 PM with public rules linked below.</p>
                </div>
                <div>
                  <strong>Export email leads</strong>
                  <p>Send the campaign leads into your CRM or newsletter stack.</p>
                </div>
              </div>
            </article>
          </section>

          <section className="app-section">
            <div className="app-section__heading">
              <h2>Campaigns</h2>
              <div className="segmented-controls">
                {filters.map((currentFilter) => (
                  <button
                    key={currentFilter}
                    className={`toggle-button${filter === currentFilter ? " is-active" : ""}`}
                    onClick={() => setFilter(currentFilter)}
                    type="button"
                  >
                    {currentFilter === "all"
                      ? "All"
                      : currentFilter.charAt(0).toUpperCase() + currentFilter.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="campaign-list">
              {campaigns.map((campaign) => (
                <article className="campaign-row" key={campaign.id}>
                  <div>
                    <p className="dashboard-card__label">{campaign.type}</p>
                    <h3>{campaign.title}</h3>
                    <p>{campaign.audience}</p>
                  </div>
                  <div>
                    <strong>{campaign.entries} entries</strong>
                    <p>Ends {campaign.endsOn}</p>
                  </div>
                  <div>
                    <strong>{campaign.shareRate} share rate</strong>
                    <p>{campaign.duplicates} checks or duplicates</p>
                  </div>
                  <span
                    className={`status-pill${
                      campaign.status === "review"
                        ? " status-pill--alt"
                        : campaign.status === "closed"
                          ? " status-pill--muted"
                          : ""
                    }`}
                  >
                    {campaign.status}
                  </span>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
