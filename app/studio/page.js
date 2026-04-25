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
    rulesTitle: "Free-entry giveaway rules",
  },
  contest: {
    title: "Best custom 3D print design",
    prize: "$100 creator bundle",
    audience: "United States residents, 18+",
    method: "Winner selected using published judging criteria",
    rulesTitle: "Skill contest rules",
  },
  referral: {
    title: "Top referrer wins 3 months free",
    prize: "3 free months of membership",
    audience: "Local customers in the Chicago metro",
    method: "Highest verified referral count wins",
    rulesTitle: "Referral challenge rules",
  },
  loyalty: {
    title: "Refer 5 friends, get a free shirt",
    prize: "Free branded t-shirt",
    audience: "Existing members and new signups",
    method: "Reward unlocks after completing the required milestone",
    rulesTitle: "Loyalty reward terms",
  },
};

export default function StudioPage() {
  const router = useRouter();
  const { state, hydrated, saveCampaign } = usePrizePilotStore();
  const [view, setView] = useState("rules");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    type: "giveaway",
    title: presets.giveaway.title,
    prize: presets.giveaway.prize,
    audience: presets.giveaway.audience,
    method: presets.giveaway.method,
    endDate: "May 31, 2026",
  });

  useEffect(() => {
    if (hydrated && !state.session.loggedIn) {
      router.replace("/auth");
    }
  }, [hydrated, router, state.session.loggedIn]);

  function applyType(type) {
    const preset = presets[type];
    setForm((current) => ({
      ...current,
      type,
      title: preset.title,
      prize: preset.prize,
      audience: preset.audience,
      method: preset.method,
    }));
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
                    <option value="contest">Skill contest</option>
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
                <label className="studio-field">
                  <span>End date</span>
                  <input
                    value={form.endDate}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, endDate: event.target.value }))
                    }
                  />
                </label>
              </div>

              <div className="studio-checklist">
                <label><input type="checkbox" defaultChecked /> No purchase necessary language</label>
                <label><input type="checkbox" defaultChecked /> Email confirmation</label>
                <label><input type="checkbox" defaultChecked /> Duplicate prevention</label>
                <label><input type="checkbox" /> Public entrant gallery</label>
              </div>

              <div className="studio-actions">
                <button
                  className="button"
                  type="button"
                  onClick={async () => {
                    await saveCampaign({
                      title: form.title,
                      prize: form.prize,
                      audience: form.audience,
                      method: form.method,
                      type: form.type,
                      endsOn: form.endDate,
                      status: "draft",
                    });
                    setMessage(`${form.title} was saved to your dashboard.`);
                  }}
                >
                  Save campaign
                </button>
                <Link className="button button--ghost" href="/dashboard">
                  View dashboard
                </Link>
              </div>
              <p className="studio-save-message">{message}</p>
            </article>

            <article className="app-panel studio-preview">
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
                  </ul>
                </div>
              ) : null}

              {view === "landing" ? (
                <div className="studio-surface">
                  <p className="dashboard-card__label">Landing page preview</p>
                  <div className="landing-mini">
                    <span className="pill pill--warm">Launching soon</span>
                    <h3>{form.title}</h3>
                    <p>
                      Enter with your email, share for bonus visibility, and review
                      the official rules before you submit.
                    </p>
                    <div className="landing-mini__form">
                      <input value="name@example.com" readOnly />
                      <button className="button" type="button">
                        Enter now
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
