"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePrizePilotStore } from "lib/usePrizePilotStore";

const filters = ["all", "giveaway", "contest", "referral", "loyalty"];

const planCopy = {
  starter: "Great for local shops running a few campaigns each month.",
  pro: "Unlimited campaigns, branding controls, and judging dashboard access.",
  business: "Team access, analytics, exports, and branded campaign ops.",
};

export default function DashboardPage() {
  const router = useRouter();
  const { state, hydrated, signOut, updateCampaignStatus } = usePrizePilotStore();
  const [filter, setFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState("");
  const [flashMessage, setFlashMessage] = useState("");

  function getShareUrl(campaignId) {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/c/${campaignId}`;
    }
    return `/c/${campaignId}`;
  }

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
  const draftCampaigns = state.campaigns.filter((campaign) => campaign.status === "draft").length;
  const closedCampaigns = state.campaigns.filter((campaign) => campaign.status === "closed").length;
  const acceptedEntries = Math.max(0, totalEntries - totalDuplicates);
  const avgEntriesPerCampaign = state.campaigns.length
    ? Math.round(totalEntries / state.campaigns.length)
    : 0;
  const launchReadiness = state.campaigns.length
    ? Math.round(((state.campaigns.length - draftCampaigns) / state.campaigns.length) * 100)
    : 0;
  const duplicateRate = totalEntries
    ? Math.min(100, Math.round((totalDuplicates / totalEntries) * 100))
    : 0;
  const topCampaign = [...state.campaigns].sort(
    (a, b) => Number(b.entries || 0) - Number(a.entries || 0)
  )[0];
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
                  <strong>Launch draft campaigns</strong>
                  <p>Use the Launch action below to push approved drafts live instantly.</p>
                </div>
                <div>
                  <strong>Schedule winner announcements</strong>
                  <p>Line up posting windows and share links before your campaign closes.</p>
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
              <h2>Analytics</h2>
            </div>
            <div className="analytics-grid">
              <article className="mini-card">
                <span className="dashboard-card__label">Entries accepted</span>
                <strong className="metric-value">{acceptedEntries}</strong>
                <p>{totalDuplicates} blocked as duplicates or abuse checks.</p>
              </article>
              <article className="mini-card">
                <span className="dashboard-card__label">Average campaign volume</span>
                <strong className="metric-value">{avgEntriesPerCampaign}</strong>
                <p>Average entries per campaign across your workspace.</p>
              </article>
              <article className="mini-card">
                <span className="dashboard-card__label">Top performer</span>
                <strong className="metric-value">
                  {topCampaign ? topCampaign.title : "No campaigns yet"}
                </strong>
                <p>{topCampaign ? `${topCampaign.entries} entries` : "Launch to unlock analytics."}</p>
              </article>
            </div>

            <div className="analytics-grid analytics-grid--compact">
              <article className="mini-card">
                <span className="dashboard-card__label">Launch readiness</span>
                <strong className="metric-value">{launchReadiness}%</strong>
                <div className="progress-track">
                  <span className="progress-fill" style={{ width: `${launchReadiness}%` }} />
                </div>
                <p>{draftCampaigns} campaigns still in draft.</p>
              </article>
              <article className="mini-card">
                <span className="dashboard-card__label">Duplicate risk</span>
                <strong className="metric-value">{duplicateRate}%</strong>
                <div className="progress-track">
                  <span className="progress-fill progress-fill--warn" style={{ width: `${duplicateRate}%` }} />
                </div>
                <p>Lower is better. Monitor suspicious spikes.</p>
              </article>
              <article className="mini-card">
                <span className="dashboard-card__label">Campaign status mix</span>
                <strong className="metric-value">
                  {liveCampaigns} live / {draftCampaigns} draft / {closedCampaigns} closed
                </strong>
                <p>Balanced pipeline keeps launches consistent.</p>
              </article>
            </div>
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
            {flashMessage ? <p className="studio-save-message">{flashMessage}</p> : null}

            <div className="campaign-list">
              {campaigns.length > 0 ? (
                campaigns.map((campaign) => (
                  <article className="campaign-card" key={campaign.id}>
                    <div className="campaign-card__header">
                      <div>
                        <p className="dashboard-card__label">{campaign.type}</p>
                        <h3>{campaign.title}</h3>
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
                    </div>

                    <p className="campaign-card__audience">{campaign.audience}</p>

                    <div className="campaign-card__stats">
                      <div>
                        <span className="dashboard-card__label">Entries</span>
                        <strong>{campaign.entries}</strong>
                      </div>
                      <div>
                        <span className="dashboard-card__label">Share rate</span>
                        <strong>{campaign.shareRate}</strong>
                      </div>
                      <div>
                        <span className="dashboard-card__label">Checks</span>
                        <strong>{campaign.duplicates}</strong>
                      </div>
                    </div>

                    <p className="campaign-card__deadline">Ends {campaign.endsOn}</p>

                    <div className="campaign-actions">
                      <a
                        className="button button--ghost button--mini"
                        href={getShareUrl(campaign.id)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open page
                      </a>
                      <button
                        className="button button--ghost button--mini"
                        type="button"
                        onClick={async () => {
                          const shareUrl = getShareUrl(campaign.id);
                          try {
                            if (navigator?.clipboard?.writeText) {
                              await navigator.clipboard.writeText(shareUrl);
                              setFlashMessage(`Share link copied for "${campaign.title}".`);
                            } else {
                              setFlashMessage(`Share link: ${shareUrl}`);
                            }
                          } catch {
                            setFlashMessage(`Share link: ${shareUrl}`);
                          }
                        }}
                      >
                        Copy link
                      </button>
                      <button
                        className="button button--ghost button--mini"
                        type="button"
                        onClick={async () => {
                          setFlashMessage("");
                          try {
                            const response = await fetch(
                              `/api/campaigns/${campaign.id}/entrants?format=csv`
                            );
                            if (!response.ok) {
                              const payload = await response.json().catch(() => ({}));
                              throw new Error(payload?.error || `Request failed: ${response.status}`);
                            }
                            const csv = await response.text();
                            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                            const url = URL.createObjectURL(blob);
                            const anchor = document.createElement("a");
                            anchor.href = url;
                            anchor.download = `${campaign.title
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, "-")}-entrants.csv`;
                            document.body.appendChild(anchor);
                            anchor.click();
                            document.body.removeChild(anchor);
                            URL.revokeObjectURL(url);
                            setFlashMessage(`Entrants exported for "${campaign.title}".`);
                          } catch (error) {
                            setFlashMessage(error.message || "Unable to export entrants.");
                          }
                        }}
                      >
                        Export entrants
                      </button>
                      {campaign.status === "draft" ? (
                        <button
                          className="button button--mini"
                          type="button"
                          disabled={updatingId === campaign.id}
                          onClick={async () => {
                            setUpdatingId(campaign.id);
                            setFlashMessage("");
                            try {
                              await updateCampaignStatus(campaign.id, "live");
                              setFlashMessage(`"${campaign.title}" is now live.`);
                            } catch (error) {
                              setFlashMessage(error.message || "Unable to launch campaign.");
                            } finally {
                              setUpdatingId("");
                            }
                          }}
                        >
                          {updatingId === campaign.id ? "Launching..." : "Launch"}
                        </button>
                      ) : null}
                      {campaign.status === "live" ? (
                        <button
                          className="button button--ghost button--mini"
                          type="button"
                          disabled={updatingId === campaign.id}
                          onClick={async () => {
                            setUpdatingId(campaign.id);
                            setFlashMessage("");
                            try {
                              await updateCampaignStatus(campaign.id, "closed");
                              setFlashMessage(`"${campaign.title}" was closed.`);
                            } catch (error) {
                              setFlashMessage(error.message || "Unable to close campaign.");
                            } finally {
                              setUpdatingId("");
                            }
                          }}
                        >
                          {updatingId === campaign.id ? "Closing..." : "Close"}
                        </button>
                      ) : null}
                      {campaign.status === "closed" ? (
                        <button
                          className="button button--ghost button--mini"
                          type="button"
                          disabled={updatingId === campaign.id}
                          onClick={async () => {
                            setUpdatingId(campaign.id);
                            setFlashMessage("");
                            try {
                              await updateCampaignStatus(campaign.id, "live");
                              setFlashMessage(`"${campaign.title}" is live again.`);
                            } catch (error) {
                              setFlashMessage(error.message || "Unable to relaunch campaign.");
                            } finally {
                              setUpdatingId("");
                            }
                          }}
                        >
                          {updatingId === campaign.id ? "Relaunching..." : "Relaunch"}
                        </button>
                      ) : null}
                    </div>
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
