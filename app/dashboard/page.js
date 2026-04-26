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
  const totalEntries = state.campaigns.reduce(
    (sum, campaign) => sum + Number(campaign.entries || 0),
    0
  );
  const totalDuplicates = state.campaigns.reduce(
    (sum, campaign) => sum + Number(campaign.duplicates || 0),
    0
  );
  const liveCampaigns = state.campaigns.filter((campaign) => campaign.status === "live").length;
  const latestCampaign = state.campaigns[0];

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
                <span className="pill pill--warm">
                  {liveCampaigns > 0 ? "Live this week" : "Ready to launch"}
                </span>
                <span className="muted">
                  {state.campaigns.length} total campaign
                  {state.campaigns.length === 1 ? "" : "s"}
                </span>
              </div>
              <h2>{latestCampaign ? latestCampaign.title : "Create your first campaign"}</h2>
              <p>
                {latestCampaign
                  ? "Your dashboard only shows campaigns created by your account."
                  : "Start in Campaign Studio to publish your first giveaway and build your private dashboard stats."}
              </p>
              <div className="dashboard-stats dashboard-stats--app">
                <article>
                  <span className="dashboard-card__label">Valid entries</span>
                  <strong>{totalEntries}</strong>
                </article>
                <article>
                  <span className="dashboard-card__label">Live campaigns</span>
                  <strong>{liveCampaigns}</strong>
                </article>
                <article>
                  <span className="dashboard-card__label">Blocked duplicates</span>
                  <strong>{totalDuplicates}</strong>
                </article>
              </div>
            </article>

            <article className="app-panel app-panel--stack">
              <p className="dashboard-card__label">Tasks to close out</p>
              <div className="task-list">
                <div>
                  <strong>Finalize official rules</strong>
                  <p>Confirm eligibility, winner method, and prize value before launch.</p>
                </div>
                <div>
                  <strong>Set campaign end date reminders</strong>
                  <p>Queue your winner announcement message and export timeline.</p>
                </div>
                <div>
                  <strong>Connect your lead workflow</strong>
                  <p>Export entrants into your CRM or newsletter list when ready.</p>
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
              {campaigns.length > 0 ? (
                campaigns.map((campaign) => (
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
                ))
              ) : (
                <article className="campaign-row">
                  <div>
                    <p className="dashboard-card__label">No campaigns yet</p>
                    <h3>Your workspace is private and empty.</h3>
                    <p>Create a campaign in Studio and it will appear here instantly.</p>
                  </div>
                  <div>
                    <Link className="button" href="/studio">
                      Create campaign
                    </Link>
                  </div>
                </article>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
