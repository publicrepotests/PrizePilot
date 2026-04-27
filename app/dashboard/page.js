"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePrizePilotStore } from "lib/usePrizePilotStore";

const filters = ["all", "giveaway", "contest", "referral", "loyalty"];

const planCopy = {
  starter: "Free starter plan with limited features for early campaigns.",
  pro: "Unlimited campaigns, branding controls, and judging dashboard access.",
  business: "Business tier is currently in progress while we expand team and enterprise tooling.",
};

const WINNER_PUBLIC_WINDOW_MS = 60 * 60 * 1000;
const QR_IMAGE_SIZE = 1200;

function canShareCampaign(campaign) {
  if (campaign.status === "live") {
    return true;
  }
  if (campaign.status !== "closed" || !campaign.endsAt) {
    return false;
  }
  const endsAtMs = Date.parse(campaign.endsAt);
  if (Number.isNaN(endsAtMs)) {
    return false;
  }
  return Date.now() <= endsAtMs + WINNER_PUBLIC_WINDOW_MS;
}

function buildQrImageUrl(url) {
  const encoded = encodeURIComponent(url);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${QR_IMAGE_SIZE}x${QR_IMAGE_SIZE}&data=${encoded}`;
}

async function downloadQrCodePng(shareUrl, title) {
  const qrUrl = buildQrImageUrl(shareUrl);
  const response = await fetch(qrUrl);
  if (!response.ok) {
    throw new Error("Unable to generate QR code right now.");
  }
  const blob = await response.blob();
  const fileUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = fileUrl;
  anchor.download = `${String(title || "campaign")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}-qr.png`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(fileUrl);
}

function openPrintableFlyer(campaign, shareUrl) {
  const qrUrl = buildQrImageUrl(shareUrl);
  const escapedTitle = String(campaign.title || "Campaign").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escapedPrize = String(campaign.prize || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escapedAudience = String(campaign.audience || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escapedEndsOn = String(campaign.endsOn || "TBD").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escapedMethod = String(campaign.method || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const flyerWindow = window.open("", "_blank", "noopener,noreferrer,width=860,height=1040");
  if (!flyerWindow) {
    throw new Error("Popup blocked. Please allow popups to open printable flyer.");
  }
  flyerWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapedTitle} - Flyer</title>
    <style>
      body { margin: 0; font-family: 'Trebuchet MS', 'Manrope', sans-serif; background: #f5f0e8; color: #172033; }
      .sheet { max-width: 780px; margin: 0 auto; padding: 28px; }
      .card { background: #fffaf3; border: 1px solid rgba(23, 32, 51, 0.12); border-radius: 24px; padding: 28px; }
      .eyebrow { margin: 0 0 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #4e5968; }
      h1 { margin: 0 0 8px; font-size: 56px; line-height: 0.95; font-family: Georgia, serif; }
      .prize { margin: 0 0 16px; font-size: 24px; font-weight: 700; }
      .grid { display: grid; grid-template-columns: 1fr 260px; gap: 24px; align-items: start; }
      ul { margin: 0; padding-left: 18px; line-height: 1.6; color: #4e5968; }
      .qr { width: 100%; border-radius: 14px; border: 1px solid rgba(23, 32, 51, 0.12); background: #fff; }
      .link { margin-top: 8px; word-break: break-word; font-size: 13px; color: #4e5968; }
      .actions { margin-top: 20px; display: flex; gap: 10px; }
      button { border: 0; border-radius: 999px; padding: 10px 16px; font-weight: 700; background: #f06a43; color: #fff9f0; cursor: pointer; }
      .secondary { background: #172033; }
      @media print {
        body { background: #fff; }
        .actions { display: none; }
        .sheet { padding: 0; max-width: none; }
        .card { border: 0; border-radius: 0; padding: 0.3in; }
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="card">
        <p class="eyebrow">PrizePilot Campaign Flyer</p>
        <h1>${escapedTitle}</h1>
        <p class="prize">${escapedPrize}</p>
        <div class="grid">
          <div>
            <ul>
              <li><strong>Eligibility:</strong> ${escapedAudience}</li>
              <li><strong>Winner method:</strong> ${escapedMethod}</li>
              <li><strong>Campaign ends:</strong> ${escapedEndsOn}</li>
              <li><strong>No purchase necessary.</strong></li>
              <li>Scan the QR code to enter.</li>
            </ul>
            <p class="link">${shareUrl}</p>
          </div>
          <div>
            <img class="qr" src="${qrUrl}" alt="Campaign QR code" />
          </div>
        </div>
        <div class="actions">
          <button onclick="window.print()">Print Flyer</button>
          <button class="secondary" onclick="window.close()">Close</button>
        </div>
      </div>
    </div>
  </body>
</html>`);
  flyerWindow.document.close();
}

export default function DashboardPage() {
  const router = useRouter();
  const { state, hydrated, signOut, updateCampaignStatus } = usePrizePilotStore();
  const [filter, setFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState("");
  const [flashMessage, setFlashMessage] = useState("");
  const [team, setTeam] = useState({ isOwner: false, owner: null, members: [] });
  const [advancedAnalytics, setAdvancedAnalytics] = useState({
    campaigns: 0,
    entries: 0,
    duplicates: 0,
    accepted: 0,
    duplicateRate: 0,
    sourceBreakdown: [],
    dailyEntries: [],
  });
  const [teamForm, setTeamForm] = useState({ usernameOrEmail: "", role: "manager" });
  const [activeTool, setActiveTool] = useState("campaigns");

  async function requestJson(url, options) {
    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `Request failed: ${response.status}`);
    }
    return payload;
  }

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

  useEffect(() => {
    if (!hydrated || !state.session.loggedIn) {
      return;
    }
    let cancelled = false;
    async function loadWorkspaceMeta() {
      try {
        const [teamPayload, analyticsPayload] = await Promise.all([
          requestJson("/api/team"),
          requestJson("/api/analytics"),
        ]);
        if (!cancelled) {
          setTeam(teamPayload);
          setAdvancedAnalytics(analyticsPayload);
        }
      } catch (error) {
        if (!cancelled) {
          setFlashMessage(error.message || "Unable to load workspace insights.");
        }
      }
    }
    loadWorkspaceMeta();
    return () => {
      cancelled = true;
    };
  }, [hydrated, state.session.loggedIn]);

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
  const toolTabs = [
    { key: "campaigns", label: "Campaigns", detail: `${state.campaigns.length} total` },
    { key: "analytics", label: "Analytics", detail: `${acceptedEntries} valid entries` },
    { key: "team", label: "Team", detail: `${team.members.length} collaborators` },
  ];

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
            <Link href="/diagnostics">Diagnostics</Link>
            <Link href="/">Marketing site</Link>
          </nav>
          <div className="app-sidebar__tools">
            <p className="dashboard-card__label">Tools</p>
            <div className="app-tool-nav">
              {toolTabs.map((tool) => (
                <button
                  key={tool.key}
                  className={`app-tool-nav__button${activeTool === tool.key ? " is-active" : ""}`}
                  type="button"
                  onClick={() => setActiveTool(tool.key)}
                >
                  <span>{tool.label}</span>
                  <small>{tool.detail}</small>
                </button>
              ))}
            </div>
          </div>
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
              <h2>
                {activeTool === "campaigns"
                  ? "Campaigns"
                  : activeTool === "analytics"
                    ? "Analytics"
                    : "Team access"}
              </h2>
              {activeTool === "campaigns" ? (
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
              ) : null}
            </div>
            {flashMessage ? <p className="studio-save-message">{flashMessage}</p> : null}

            {activeTool === "analytics" ? (
              <>
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

                <div className="analytics-grid analytics-grid--compact">
                  <article className="mini-card">
                    <span className="dashboard-card__label">Top source</span>
                    <strong className="metric-value">
                      {advancedAnalytics.sourceBreakdown[0]?.source || "No source data yet"}
                    </strong>
                    <p>
                      {advancedAnalytics.sourceBreakdown[0]
                        ? `${advancedAnalytics.sourceBreakdown[0].count} verified entries`
                        : "Share tagged links to unlock source analytics."}
                    </p>
                  </article>
                  <article className="mini-card">
                    <span className="dashboard-card__label">7-day entry trend</span>
                    <strong className="metric-value">
                      {advancedAnalytics.dailyEntries.reduce((sum, day) => sum + Number(day.count || 0), 0)}
                    </strong>
                    <p>
                      {advancedAnalytics.dailyEntries.length > 0
                        ? advancedAnalytics.dailyEntries.map((day) => `${day.day.slice(5)}:${day.count}`).join(" • ")
                        : "No activity recorded yet."}
                    </p>
                  </article>
                  <article className="mini-card">
                    <span className="dashboard-card__label">Trust quality score</span>
                    <strong className="metric-value">
                      {Math.max(0, 100 - Number(advancedAnalytics.duplicateRate || 0))}%
                    </strong>
                    <p>Derived from accepted entries vs duplicate/abuse attempts.</p>
                  </article>
                </div>
              </>
            ) : null}

            {activeTool === "team" ? (
              <>
                <div className="analytics-grid analytics-grid--compact">
                  <article className="mini-card">
                    <span className="dashboard-card__label">Workspace owner</span>
                    <strong className="metric-value">
                      {team.owner?.organizerName || team.owner?.username || "Unknown"}
                    </strong>
                    <p>{team.owner?.email || "Owner profile unavailable."}</p>
                  </article>
                  <article className="mini-card">
                    <span className="dashboard-card__label">Active team members</span>
                    <strong className="metric-value">{team.members.length}</strong>
                    <p>Managers and viewers collaborating in this workspace.</p>
                  </article>
                  <article className="mini-card">
                    <span className="dashboard-card__label">Your permissions</span>
                    <strong className="metric-value">{team.isOwner ? "Owner" : "Member"}</strong>
                    <p>
                      {team.isOwner
                        ? "You can invite and manage team members."
                        : "You can run campaigns in the shared workspace."}
                    </p>
                  </article>
                </div>

                {team.isOwner ? (
                  <article className="app-panel">
                    <div className="studio-field-grid">
                      <label className="studio-field">
                        <span>Add by username or email</span>
                        <input
                          value={teamForm.usernameOrEmail}
                          onChange={(event) =>
                            setTeamForm((current) => ({ ...current, usernameOrEmail: event.target.value }))
                          }
                          placeholder="teammate_username or teammate@email.com"
                        />
                      </label>
                      <label className="studio-field">
                        <span>Role</span>
                        <select
                          value={teamForm.role}
                          onChange={(event) =>
                            setTeamForm((current) => ({ ...current, role: event.target.value }))
                          }
                        >
                          <option value="manager">Manager</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      </label>
                    </div>
                    <div className="studio-actions">
                      <button
                        className="button"
                        type="button"
                        onClick={async () => {
                          try {
                            const payload = await requestJson("/api/team", {
                              method: "POST",
                              body: JSON.stringify(teamForm),
                            });
                            setTeam(payload);
                            setTeamForm({ usernameOrEmail: "", role: "manager" });
                            setFlashMessage("Team member added.");
                          } catch (error) {
                            setFlashMessage(error.message || "Unable to add team member.");
                          }
                        }}
                      >
                        Add team member
                      </button>
                    </div>
                  </article>
                ) : null}

                {team.members.length > 0 ? (
                  <div className="campaign-list">
                    {team.members.map((member) => (
                      <article className="campaign-row" key={member.id}>
                        <div>
                          <p className="dashboard-card__label">{member.role}</p>
                          <h3>{member.organizerName || member.username}</h3>
                          <p>{member.email || member.username}</p>
                        </div>
                        {team.isOwner ? (
                          <div className="campaign-actions">
                            <button
                              className="button button--ghost button--mini"
                              type="button"
                              onClick={async () => {
                                try {
                                  const payload = await requestJson("/api/team", {
                                    method: "PATCH",
                                    body: JSON.stringify({
                                      memberId: member.id,
                                      role: member.role === "manager" ? "viewer" : "manager",
                                    }),
                                  });
                                  setTeam(payload);
                                  setFlashMessage("Team role updated.");
                                } catch (error) {
                                  setFlashMessage(error.message || "Unable to update role.");
                                }
                              }}
                            >
                              Make {member.role === "manager" ? "viewer" : "manager"}
                            </button>
                            <button
                              className="button button--ghost button--mini"
                              type="button"
                              onClick={async () => {
                                try {
                                  const payload = await requestJson("/api/team", {
                                    method: "DELETE",
                                    body: JSON.stringify({ memberId: member.id }),
                                  });
                                  setTeam(payload);
                                  setFlashMessage("Team member removed.");
                                } catch (error) {
                                  setFlashMessage(error.message || "Unable to remove team member.");
                                }
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <article className="campaign-row">
                    <div>
                      <p className="dashboard-card__label">No team members yet</p>
                      <h3>Invite teammates to collaborate on campaigns.</h3>
                      <p>Business workspaces can share campaign operations and analytics.</p>
                    </div>
                  </article>
                )}
              </>
            ) : null}

            {activeTool === "campaigns" ? (
              <div className="campaign-list">
                {campaigns.length > 0 ? (
                  campaigns.map((campaign) => (
                    <article className="campaign-card" key={campaign.id}>
                      {(() => {
                        const canShare = canShareCampaign(campaign);
                        return (
                          <>
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
                      <button
                        className="button button--ghost button--mini"
                        type="button"
                        disabled={!canShare}
                        title={
                          canShare
                            ? "Open public campaign page"
                            : "Share page is available while live and for 1 hour after closing"
                        }
                        onClick={() => {
                          if (!canShare) {
                            setFlashMessage(
                              "Share pages are available while live and for one hour after the campaign ends."
                            );
                            return;
                          }
                          window.open(getShareUrl(campaign.id), "_blank", "noopener,noreferrer");
                        }}
                      >
                        Open page
                      </button>
                      <button
                        className="button button--ghost button--mini"
                        type="button"
                        disabled={!canShare}
                        title={
                          canShare
                            ? "Copy public campaign link"
                            : "Share page is available while live and for 1 hour after closing"
                        }
                        onClick={async () => {
                          if (!canShare) {
                            setFlashMessage(
                              "Share pages are available while live and for one hour after the campaign ends."
                            );
                            return;
                          }
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
                        disabled={!canShare}
                        title={canShare ? "Copy source-tagged links" : "Campaign cannot be shared right now"}
                        onClick={async () => {
                          if (!canShare) {
                            return;
                          }
                          const sources = Array.isArray(campaign.allowedSources) && campaign.allowedSources.length
                            ? campaign.allowedSources
                            : ["public-link"];
                          const base = getShareUrl(campaign.id);
                          const lines = sources.map((source) =>
                            source === "public-link" ? `${source}: ${base}` : `${source}: ${base}?src=${source}`
                          );
                          const payload = lines.join("\n");
                          try {
                            if (navigator?.clipboard?.writeText) {
                              await navigator.clipboard.writeText(payload);
                              setFlashMessage(`Channel links copied for "${campaign.title}".`);
                            } else {
                              setFlashMessage(payload);
                            }
                          } catch {
                            setFlashMessage(payload);
                          }
                        }}
                      >
                        Copy channel links
                      </button>
                      <button
                        className="button button--ghost button--mini"
                        type="button"
                        disabled={!canShare}
                        title={
                          canShare ? "Download campaign QR poster code" : "Campaign cannot be shared right now"
                        }
                        onClick={async () => {
                          if (!canShare) {
                            return;
                          }
                          try {
                            await downloadQrCodePng(getShareUrl(campaign.id), campaign.title);
                            setFlashMessage(`QR code downloaded for "${campaign.title}".`);
                          } catch (error) {
                            setFlashMessage(error.message || "Unable to generate QR code.");
                          }
                        }}
                      >
                        Download QR
                      </button>
                      <button
                        className="button button--ghost button--mini"
                        type="button"
                        disabled={!canShare}
                        title={
                          canShare ? "Open printable flyer" : "Campaign cannot be shared right now"
                        }
                        onClick={() => {
                          if (!canShare) {
                            return;
                          }
                          try {
                            openPrintableFlyer(campaign, getShareUrl(campaign.id));
                            setFlashMessage(`Printable flyer opened for "${campaign.title}".`);
                          } catch (error) {
                            setFlashMessage(error.message || "Unable to open printable flyer.");
                          }
                        }}
                      >
                        Print flyer
                      </button>
                      <button
                        className="button button--ghost button--mini"
                        type="button"
                        disabled={!canShare}
                        title={
                          canShare
                            ? "Open the public official rules page"
                            : "Rules page is public while live and for 1 hour after closing"
                        }
                        onClick={() => {
                          if (!canShare) {
                            return;
                          }
                          window.open(`/r/${campaign.id}`, "_blank", "noopener,noreferrer");
                        }}
                      >
                        View rules
                      </button>
                      {campaign.type === "contest" ? (
                        <button
                          className="button button--ghost button--mini"
                          type="button"
                          onClick={() => {
                            router.push(`/judging/${campaign.id}`);
                          }}
                        >
                          Judging
                        </button>
                      ) : null}
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
                          </>
                        );
                      })()}
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
            ) : null}
          </section>
        </main>
      </div>
    </div>
  );
}
