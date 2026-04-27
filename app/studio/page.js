"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePrizePilotStore } from "lib/usePrizePilotStore";

const presets = {
  giveaway: {
    title: "Win a free full detail",
    prize: "Free premium detailing package",
    audience: "Illinois residents, 18+",
    method: "Random draw from valid free entries",
    judgingCriteria: "",
    rulesTitle: "Free-entry giveaway rules",
  },
  contest: {
    title: "Best custom 3D print design",
    prize: "$100 creator bundle",
    audience: "United States residents, 18+",
    method: "Winner selected using published judging criteria",
    judgingCriteria: "Creativity\nExecution quality\nRelevance to theme",
    rulesTitle: "Skill contest rules",
  },
  referral: {
    title: "Top referrer wins 3 months free",
    prize: "3 free months of membership",
    audience: "Local customers in the Chicago metro",
    method: "Highest verified referral count wins",
    judgingCriteria: "",
    rulesTitle: "Referral challenge rules",
  },
  loyalty: {
    title: "Refer 5 friends, get a free shirt",
    prize: "Free branded t-shirt",
    audience: "Existing members and new signups",
    method: "Reward unlocks after completing the required milestone",
    judgingCriteria: "",
    rulesTitle: "Loyalty reward terms",
  },
};

const trustModes = [
  {
    id: "open",
    label: "Open access",
    help: "Fastest setup. Accepts standard email entries from allowed channels.",
  },
  {
    id: "verified",
    label: "Verified access",
    help: "Blocks disposable email domains for higher-quality entrant lists.",
  },
  {
    id: "high_trust",
    label: "High-trust",
    help: "Verified mode plus one entry per device fingerprint/IP hash.",
  },
  {
    id: "owned_audience",
    label: "Owned audience only",
    help: "Entrants must match your allowlist emails or allowed domains.",
  },
];

const sourceOptions = [
  {
    id: "public-link",
    label: "Main share link",
    hint: "Default campaign URL shared anywhere. Recommended as your baseline source.",
  },
  {
    id: "instagram",
    label: "Instagram",
    hint: "Use links like ?src=instagram from your bio, story, or post captions.",
  },
  {
    id: "email",
    label: "Email newsletter",
    hint: "Use links like ?src=email to track subscriber-driven entries.",
  },
  {
    id: "qr",
    label: "QR posters",
    hint: "Use links like ?src=qr for in-store signage or event handouts.",
  },
  {
    id: "partner",
    label: "Partner link",
    hint: "For referral partners, collaborators, and cross-promo traffic.",
  },
];

const setupModes = [
  {
    id: "easy",
    label: "Easy",
    help: "Launch fast with a single share link and duplicate protection.",
  },
  {
    id: "safer",
    label: "Safer",
    help: "Add stricter email quality checks while staying simple.",
  },
  {
    id: "advanced",
    label: "Advanced",
    help: "Fine-tune channels and audience controls.",
  },
];

const marketplaceTemplates = [
  {
    id: "instagram-giveaway",
    label: "Instagram giveaway",
    type: "giveaway",
    title: "Instagram shoutout giveaway",
    prize: "Creator gift pack + feature spotlight",
    audience: "United States residents, 18+",
    method: "Random draw from valid free entries",
    judgingCriteria: "",
  },
  {
    id: "best-photo-contest",
    label: "Best photo contest",
    type: "contest",
    title: "Best before/after photo challenge",
    prize: "$250 winner package",
    audience: "Open to all participants, 18+",
    method: "Judged by quality, creativity, and storytelling",
    judgingCriteria: "Creativity\nImage quality\nStorytelling",
  },
  {
    id: "gym-transformation",
    label: "Gym transformation",
    type: "contest",
    title: "30-day transformation challenge",
    prize: "6 months free membership",
    audience: "Local gym members, 18+",
    method: "Judged using progress, consistency, and impact",
    judgingCriteria: "Progress quality\nConsistency\nOverall impact",
  },
  {
    id: "school-art",
    label: "School art contest",
    type: "contest",
    title: "Student art spotlight challenge",
    prize: "$500 art supply grant",
    audience: "Students in participating schools",
    method: "Judged by originality and theme relevance",
    judgingCriteria: "Originality\nTheme relevance\nCraftsmanship",
  },
  {
    id: "grand-opening",
    label: "Grand opening giveaway",
    type: "giveaway",
    title: "Grand opening local giveaway",
    prize: "VIP service bundle",
    audience: "Local residents, 18+",
    method: "Random draw from verified free entries",
    judgingCriteria: "",
  },
];

function getDefaultEndDate() {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString().slice(0, 10);
}

function formatCampaignEnd(date, time) {
  if (!date) {
    return "TBD";
  }

  const safeTime = time || "23:59";
  const dt = new Date(`${date}T${safeTime}`);
  if (Number.isNaN(dt.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(dt);
}

function toCampaignEndIso(date, time) {
  if (!date) {
    return "";
  }
  const safeTime = time || "23:59";
  const dt = new Date(`${date}T${safeTime}`);
  if (Number.isNaN(dt.getTime())) {
    return "";
  }
  return dt.toISOString();
}

export default function StudioPage() {
  const router = useRouter();
  const { state, hydrated, saveCampaign } = usePrizePilotStore();
  const currentPlan =
    state.billing.plan === "pro" || state.billing.plan === "business"
      ? state.billing.plan
      : "starter";
  const hasProFeatures = currentPlan === "pro" || currentPlan === "business";
  const contestEnabled = hasProFeatures;
  const brandingEnabled = hasProFeatures;
  const [view, setView] = useState("rules");
  const [message, setMessage] = useState("");
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSavingLive, setIsSavingLive] = useState(false);
  const [form, setForm] = useState({
    type: "giveaway",
    title: presets.giveaway.title,
    prize: presets.giveaway.prize,
    audience: presets.giveaway.audience,
    method: presets.giveaway.method,
    judgingCriteria: presets.giveaway.judgingCriteria,
    endDate: getDefaultEndDate(),
    endTime: "17:00",
    trustMode: "open",
    allowedSources: ["public-link"],
    audienceAllowlist: "",
    brandName: "",
    brandLogoUrl: "",
    brandPrimary: "#172033",
    brandAccent: "#f06a43",
    hidePrizePilotBranding: false,
  });
  const [setupMode, setSetupMode] = useState("easy");

  useEffect(() => {
    if (hydrated && !state.session.loggedIn) {
      router.replace("/auth");
    }
  }, [hydrated, router, state.session.loggedIn]);

  useEffect(() => {
    if (!contestEnabled && form.type === "contest") {
      const fallback = presets.giveaway;
      setForm((current) => ({
        ...current,
        type: "giveaway",
        title: fallback.title,
        prize: fallback.prize,
        audience: fallback.audience,
        method: fallback.method,
        judgingCriteria: fallback.judgingCriteria,
      }));
      setMessage("Skill contests require Pro or Business. Switched to Free-entry giveaway.");
    }
  }, [contestEnabled, form.type]);

  function applyType(type) {
    if (type === "contest" && !contestEnabled) {
      setMessage("Skill contests require Pro or Business.");
      return;
    }
    const preset = presets[type];
    setForm((current) => ({
      ...current,
      type,
      title: preset.title,
      prize: preset.prize,
      audience: preset.audience,
      method: preset.method,
      judgingCriteria: preset.judgingCriteria,
    }));
  }

  function applySetupMode(nextMode) {
    setSetupMode(nextMode);
    setForm((current) => {
      if (nextMode === "easy") {
        return {
          ...current,
          trustMode: "open",
          allowedSources: ["public-link"],
          audienceAllowlist: "",
        };
      }
      if (nextMode === "safer") {
        return {
          ...current,
          trustMode: "verified",
          allowedSources: ["public-link"],
          audienceAllowlist: "",
        };
      }
      return current;
    });
  }

  function applyMarketplaceTemplate(template) {
    if (!template) {
      return;
    }
    if (template.type === "contest" && !contestEnabled) {
      setMessage("Contest templates require Pro or Business.");
      return;
    }
    setForm((current) => ({
      ...current,
      type: template.type,
      title: template.title,
      prize: template.prize,
      audience: template.audience,
      method: template.method,
      judgingCriteria: template.judgingCriteria || "",
    }));
    setMessage(`Template applied: ${template.label}.`);
  }

  return (
    <div className="app-body">
      <div className="app-shell app-shell--wide">
        <aside className="app-sidebar">
          <div className="brand-mark">
            <span className="brand-mark__badge"></span>
            <span>PrizePilot</span>
          </div>
          <p className="app-sidebar__copy">
            Campaign studio for rules, landing pages, QR assets, and launch prep.
          </p>
          <nav className="app-nav">
            <Link href="/dashboard">Overview</Link>
            <Link className="is-current" href="/studio">
              Campaign studio
            </Link>
            <Link href="/billing">Billing</Link>
            <Link href="/">Marketing site</Link>
          </nav>
        </aside>

        <main className="app-main">
          <header className="app-topbar">
            <div>
              <p className="eyebrow">Campaign studio</p>
              <h1>Launch flow for businesses that want it to feel buttoned up.</h1>
            </div>
            <div className="app-topbar__actions">
              <Link className="button button--ghost" href="/dashboard">
                Back to dashboard
              </Link>
              <Link className="button" href="/billing">
                Upgrade for branding
              </Link>
            </div>
          </header>

          <section className="studio-grid">
            <article className="app-panel studio-form">
              <div className="app-section__heading">
                <h2>Campaign setup</h2>
              </div>
              <div className="studio-field-grid">
                <label className="studio-field">
                  <span>Campaign type</span>
                  <select
                    value={form.type}
                    onChange={(event) => applyType(event.target.value)}
                  >
                    <option value="giveaway">Free-entry giveaway</option>
                    <option value="contest" disabled={!contestEnabled}>
                      Skill contest {contestEnabled ? "" : "(Pro+)"}
                    </option>
                    <option value="referral">Referral challenge</option>
                    <option value="loyalty">Loyalty reward</option>
                  </select>
                </label>
                <label className="studio-field">
                  <span>Campaign title</span>
                  <input
                    value={form.title}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, title: event.target.value }))
                    }
                  />
                </label>
                <label className="studio-field">
                  <span>Prize</span>
                  <input
                    value={form.prize}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, prize: event.target.value }))
                    }
                  />
                </label>
                <label className="studio-field">
                  <span>Open to</span>
                  <input
                    value={form.audience}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, audience: event.target.value }))
                    }
                  />
                </label>
                <label className="studio-field">
                  <span>Winner method</span>
                  <input
                    value={form.method}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, method: event.target.value }))
                    }
                  />
                </label>
                {form.type === "contest" ? (
                  <label className="studio-field" title="One criterion per line">
                    <span>Judging criteria</span>
                    <textarea
                      className="studio-textarea"
                      value={form.judgingCriteria}
                      placeholder={"Creativity\nExecution quality\nRelevance to theme"}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, judgingCriteria: event.target.value }))
                      }
                    />
                  </label>
                ) : null}
                <label className="studio-field">
                  <span>End date</span>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, endDate: event.target.value }))
                    }
                  />
                </label>
                <label className="studio-field">
                  <span>End time</span>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, endTime: event.target.value }))
                    }
                  />
                </label>
              </div>

              <div className="studio-template-market">
                <div className="app-section__heading">
                  <h2>Template marketplace</h2>
                </div>
                <div className="studio-template-grid">
                  {marketplaceTemplates.map((template) => (
                    <article className="mini-card" key={template.id}>
                      <p className="dashboard-card__label">{template.type}</p>
                      <strong>{template.label}</strong>
                      <p>{template.title}</p>
                      <button
                        className="button button--ghost button--mini"
                        type="button"
                        onClick={() => applyMarketplaceTemplate(template)}
                      >
                        Use template
                      </button>
                    </article>
                  ))}
                </div>
              </div>

              <div className="studio-checklist">
                <label><input type="checkbox" defaultChecked /> No purchase necessary language</label>
                <label><input type="checkbox" defaultChecked /> Email confirmation</label>
                <label><input type="checkbox" defaultChecked /> Duplicate prevention</label>
                <label><input type="checkbox" /> Public entrant gallery</label>
              </div>

              <div className="studio-trust">
                <div className="app-section__heading">
                  <h2>Entry quality controls</h2>
                </div>
                <div className="studio-trust__modes studio-trust__modes--top-level">
                  {setupModes.map((mode) => (
                    <label className="studio-trust__mode" key={mode.id} title={mode.help}>
                      <input
                        type="radio"
                        name="setup-mode"
                        value={mode.id}
                        checked={setupMode === mode.id}
                        onChange={(event) => applySetupMode(event.target.value)}
                      />
                      <span>
                        <strong>
                          {mode.label}
                          <span className="hint-dot" aria-hidden title={mode.help}>?</span>
                        </strong>
                        <small>{mode.help}</small>
                      </span>
                    </label>
                  ))}
                </div>

                {setupMode !== "advanced" ? (
                  <div className="studio-trust__simple">
                    <p className="studio-save-message">
                      {setupMode === "easy"
                        ? "Easy mode keeps setup simple: one main share link, clean anti-duplicate checks, and fastest launch."
                        : "Safer mode adds stricter email quality checks while keeping entry setup beginner-friendly."}
                    </p>
                    <p className="studio-save-message">
                      You can switch to Advanced later anytime for channel-by-channel or audience-allowlist controls.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="studio-trust__modes">
                      {trustModes.map((mode) => (
                        <label className="studio-trust__mode" key={mode.id} title={mode.help}>
                          <input
                            type="radio"
                            name="trust-mode"
                            value={mode.id}
                            checked={form.trustMode === mode.id}
                            onChange={(event) =>
                              setForm((current) => ({ ...current, trustMode: event.target.value }))
                            }
                          />
                          <span>
                            <strong>
                              {mode.label}
                              <span className="hint-dot" aria-hidden title={mode.help}>?</span>
                            </strong>
                            <small>{mode.help}</small>
                          </span>
                        </label>
                      ))}
                    </div>

                    <div className="studio-trust__channels">
                      <p className="dashboard-card__label">
                        Allowed channels
                        <span
                          className="hint-dot"
                          aria-hidden
                          title="Only entries from selected channel sources will be accepted."
                        >
                          ?
                        </span>
                      </p>
                      <div className="studio-checklist">
                        {sourceOptions.map((source) => (
                          <label key={source.id} title={source.hint}>
                            <input
                              type="checkbox"
                              checked={form.allowedSources.includes(source.id)}
                              onChange={(event) =>
                                setForm((current) => {
                                  const next = event.target.checked
                                    ? [...new Set([...current.allowedSources, source.id])]
                                    : current.allowedSources.filter((item) => item !== source.id);
                                  return {
                                    ...current,
                                    allowedSources: next.length > 0 ? next : ["public-link"],
                                  };
                                })
                              }
                            />
                            {source.label}
                            <span className="hint-dot" aria-hidden title={source.hint}>?</span>
                          </label>
                        ))}
                      </div>
                      <p className="studio-save-message">
                        Use channel links like <code>?src=instagram</code> or <code>?src=qr</code> to
                        track and enforce source quality.
                      </p>
                    </div>
                  </>
                )}

                {setupMode === "advanced" && form.trustMode === "owned_audience" ? (
                  <label
                    className="studio-field"
                    title="Add exact emails or whole domains like @yourgym.com. One per line or comma-separated."
                  >
                    <span>
                      Audience allowlist (emails or @domains, comma/new line separated)
                      <span
                        className="hint-dot"
                        aria-hidden
                        title="Examples: vip@shop.com or @yourgym.com"
                      >
                        ?
                      </span>
                    </span>
                    <textarea
                      className="studio-textarea"
                      value={form.audienceAllowlist}
                      placeholder={"vip@shop.com\n@yourgym.com"}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, audienceAllowlist: event.target.value }))
                      }
                    />
                  </label>
                ) : null}
              </div>

              <div className="studio-trust">
                <div className="app-section__heading">
                  <h2>Branding</h2>
                </div>
                {brandingEnabled ? (
                  <p className="studio-save-message">
                    Customize your public campaign look with your own brand identity.
                  </p>
                ) : (
                  <p className="studio-save-message">
                    Custom branding is available on Pro or Business.{" "}
                    <Link href="/billing">Upgrade plan</Link> to unlock logo, colors, and white-labeling.
                  </p>
                )}
                <div className="studio-field-grid">
                  <label className="studio-field">
                    <span>Brand display name</span>
                    <input
                      disabled={!brandingEnabled}
                      value={form.brandName}
                      placeholder="Detail Kings Chicago"
                      onChange={(event) =>
                        setForm((current) => ({ ...current, brandName: event.target.value }))
                      }
                    />
                  </label>
                  <label className="studio-field">
                    <span>Logo URL</span>
                    <input
                      disabled={!brandingEnabled}
                      value={form.brandLogoUrl}
                      placeholder="https://..."
                      onChange={(event) =>
                        setForm((current) => ({ ...current, brandLogoUrl: event.target.value }))
                      }
                    />
                  </label>
                  <label className="studio-field">
                    <span>Primary color</span>
                    <input
                      disabled={!brandingEnabled}
                      type="color"
                      value={form.brandPrimary}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, brandPrimary: event.target.value }))
                      }
                    />
                  </label>
                  <label className="studio-field">
                    <span>Accent color</span>
                    <input
                      disabled={!brandingEnabled}
                      type="color"
                      value={form.brandAccent}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, brandAccent: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <div className="studio-checklist">
                  <label>
                    <input
                      disabled={!brandingEnabled}
                      type="checkbox"
                      checked={form.hidePrizePilotBranding}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          hidePrizePilotBranding: event.target.checked,
                        }))
                      }
                    />
                    Hide PrizePilot badge on public campaign page
                  </label>
                </div>
              </div>

              <div className="studio-actions">
                <button
                  className="button"
                  type="button"
                  disabled={isSavingDraft || isSavingLive}
                  onClick={async () => {
                    setIsSavingDraft(true);
                    setMessage("");
                    try {
                      const effectiveType =
                        contestEnabled || form.type !== "contest" ? form.type : "giveaway";
                      const effectiveBranding = {
                        brandName: brandingEnabled ? form.brandName : "",
                        brandLogoUrl: brandingEnabled ? form.brandLogoUrl : "",
                        brandPrimary: brandingEnabled ? form.brandPrimary : "#172033",
                        brandAccent: brandingEnabled ? form.brandAccent : "#f06a43",
                        hidePrizePilotBranding: brandingEnabled
                          ? form.hidePrizePilotBranding
                          : false,
                      };
                      await saveCampaign({
                        title: form.title,
                        prize: form.prize,
                        audience: form.audience,
                        method: form.method,
                        judgingCriteria: form.judgingCriteria,
                        type: effectiveType,
                        endsOn: formatCampaignEnd(form.endDate, form.endTime),
                        endsAt: toCampaignEndIso(form.endDate, form.endTime),
                        trustMode: form.trustMode,
                        allowedSources: form.allowedSources,
                        audienceAllowlist: form.audienceAllowlist,
                        ...effectiveBranding,
                        status: "draft",
                      });
                      setMessage(`${form.title} saved as draft.`);
                    } catch (error) {
                      setMessage(error.message || "Unable to save draft right now.");
                    } finally {
                      setIsSavingDraft(false);
                    }
                  }}
                >
                  {isSavingDraft ? "Saving..." : "Save draft"}
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={isSavingDraft || isSavingLive}
                  onClick={async () => {
                    setIsSavingLive(true);
                    setMessage("");
                    try {
                      const effectiveType =
                        contestEnabled || form.type !== "contest" ? form.type : "giveaway";
                      const effectiveBranding = {
                        brandName: brandingEnabled ? form.brandName : "",
                        brandLogoUrl: brandingEnabled ? form.brandLogoUrl : "",
                        brandPrimary: brandingEnabled ? form.brandPrimary : "#172033",
                        brandAccent: brandingEnabled ? form.brandAccent : "#f06a43",
                        hidePrizePilotBranding: brandingEnabled
                          ? form.hidePrizePilotBranding
                          : false,
                      };
                      await saveCampaign({
                        title: form.title,
                        prize: form.prize,
                        audience: form.audience,
                        method: form.method,
                        judgingCriteria: form.judgingCriteria,
                        type: effectiveType,
                        endsOn: formatCampaignEnd(form.endDate, form.endTime),
                        endsAt: toCampaignEndIso(form.endDate, form.endTime),
                        trustMode: form.trustMode,
                        allowedSources: form.allowedSources,
                        audienceAllowlist: form.audienceAllowlist,
                        ...effectiveBranding,
                        status: "live",
                      });
                      setMessage(`${form.title} is now live on your dashboard.`);
                    } catch (error) {
                      setMessage(error.message || "Unable to launch campaign right now.");
                    } finally {
                      setIsSavingLive(false);
                    }
                  }}
                >
                  {isSavingLive ? "Launching..." : "Save & launch"}
                </button>
                <Link className="button button--ghost" href="/dashboard">
                  View dashboard
                </Link>
              </div>
              <p className="studio-save-message">{message}</p>
            </article>

            <article
              className="app-panel studio-preview"
              style={{
                "--campaign-primary": brandingEnabled ? form.brandPrimary || "#172033" : "#172033",
                "--campaign-accent": brandingEnabled ? form.brandAccent || "#f06a43" : "#f06a43",
              }}
            >
              <div className="app-section__heading">
                <h2>Generated output</h2>
                <div className="segmented-controls">
                  {["rules", "landing", "assets"].map((currentView) => (
                    <button
                      key={currentView}
                      className={`toggle-button${view === currentView ? " is-active" : ""}`}
                      onClick={() => setView(currentView)}
                      type="button"
                    >
                      {currentView.charAt(0).toUpperCase() + currentView.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {view === "rules" ? (
                <div className="studio-surface">
                  <p className="dashboard-card__label">Official rules preview</p>
                  <h3>{presets[form.type].rulesTitle}</h3>
                  <ul className="preview-list">
                    <li>No purchase is necessary to enter or win.</li>
                    <li>Prize: {form.prize}.</li>
                    <li>Eligibility: {form.audience}.</li>
                    <li>Winner method: {form.method}.</li>
                    {form.type === "contest" ? (
                      <li>
                        Judging criteria:{" "}
                        {form.judgingCriteria
                          .split(/\r?\n/)
                          .map((line) => line.trim())
                          .filter(Boolean)
                          .join(" • ") || "Published by organizer."}
                        .
                      </li>
                    ) : null}
                    <li>Trust mode: {trustModes.find((mode) => mode.id === form.trustMode)?.label}.</li>
                    <li>Allowed channels: {form.allowedSources.join(", ")}.</li>
                    <li>Campaign closes: {formatCampaignEnd(form.endDate, form.endTime)}.</li>
                  </ul>
                </div>
              ) : null}

              {view === "landing" ? (
                <div className="studio-surface">
                  <p className="dashboard-card__label">Landing page preview</p>
                  <div className="studio-landing-preview">
                    <section className="studio-landing-preview__brand">
                      {!(brandingEnabled ? form.hidePrizePilotBranding : false) ? (
                        <div className="brand-mark">
                          <span className="brand-mark__badge"></span>
                          <span>PrizePilot</span>
                        </div>
                      ) : null}
                      {brandingEnabled && form.brandLogoUrl ? (
                        <img
                          className="campaign-brand-logo"
                          src={form.brandLogoUrl}
                          alt={`${form.brandName || "Organizer"} logo`}
                        />
                      ) : null}
                      {brandingEnabled && form.brandName ? (
                        <p className="campaign-brand-name">{form.brandName}</p>
                      ) : null}
                      <p className="eyebrow">{form.type}</p>
                      <h3>{form.title}</h3>
                      <p>{form.prize}</p>
                      <ul className="hero__proof">
                        <li>Eligibility: {form.audience}</li>
                        <li>Winner method: {form.method}</li>
                        <li>Campaign ends: {formatCampaignEnd(form.endDate, form.endTime)}</li>
                      </ul>
                      <div className="hero__actions campaign-rules-link-wrap">
                        <button className="button button--ghost button--mini" type="button">
                          Official rules
                        </button>
                      </div>
                    </section>
                    <section className="studio-landing-preview__entry">
                      <p className="dashboard-card__label">Enter campaign</p>
                      <h3>Submit your entry</h3>
                      <label className="studio-field">
                        <span>Name</span>
                        <input value="Jane Entrant" readOnly />
                      </label>
                      <label className="studio-field">
                        <span>Email</span>
                        <input value="name@example.com" readOnly />
                      </label>
                      <button className="button" type="button">
                        Submit entry
                      </button>
                      <p className="studio-save-message">
                        Source tracking and quality filters apply based on your selected setup.
                      </p>
                    </section>
                  </div>
                  <div className="studio-preview-note">
                    <p className="studio-save-message">
                      This mirrors your audience-facing layout and updates live as you edit branding.
                    </p>
                    <div className="landing-mini__form">
                      <input value="https://prizepilot.app/c/your-campaign-id" readOnly />
                      <button className="button button--ghost" type="button">
                        Share link
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {view === "assets" ? (
                <div className="studio-surface">
                  <p className="dashboard-card__label">Launch asset bundle</p>
                  <div className="asset-grid">
                    <div className="mini-card">
                      <strong>QR poster</strong>
                      <p>Countertop and storefront version</p>
                    </div>
                    <div className="mini-card">
                      <strong>Winner page</strong>
                      <p>Public announcement with rules link</p>
                    </div>
                    <div className="mini-card">
                      <strong>Email confirmation</strong>
                      <p>Entry receipt plus date reminder</p>
                    </div>
                    <div className="mini-card">
                      <strong>CSV export</strong>
                      <p>Qualified entries and fraud notes</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </article>
          </section>
        </main>
      </div>
    </div>
  );
}
