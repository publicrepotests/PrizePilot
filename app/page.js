import Link from "next/link";
import MarketingWalkthrough from "./components/MarketingWalkthrough";

const campaignModes = [
  {
    id: "giveaway",
    label: "Free-entry giveaways",
    copy: "Launch a clean campaign page, collect entries, block duplicates, and run a transparent winner draw.",
  },
  {
    id: "contest",
    label: "Skill contests",
    copy: "Accept uploads, define judging criteria, and score submissions from one organized dashboard.",
  },
  {
    id: "referral",
    label: "Referral challenges",
    copy: "Track top referrers and reward performance instead of chance.",
  },
  {
    id: "loyalty",
    label: "Loyalty rewards",
    copy: "Let participants unlock guaranteed rewards after hitting milestones.",
  },
];

const liveModules = [
  {
    title: "Organizer dashboard with tools navigation",
    copy: "A clean operations hub where teams can launch campaigns, monitor performance, and manage collaboration without clutter.",
    points: ["Private workspace data", "Launch/relaunch controls", "Export + QR + flyer actions"],
    accent: "Dashboard",
  },
  {
    title: "Campaign Studio with live landing preview",
    copy: "Create campaigns in minutes with official rules output, polished public pages, and real-time branding control.",
    points: ["Rules/Landing/Assets tabs", "Template marketplace", "Entry-quality controls"],
    accent: "Studio",
  },
  {
    title: "Public campaign pages with winner reveal",
    copy: "Give entrants a premium campaign experience from entry to announcement, including a memorable winner reveal.",
    points: ["Email entry + source tracking", "Contest image + link submissions", "Post-close reveal window"],
    accent: "Public",
  },
  {
    title: "Billing controls with cancel/resume flow",
    copy: "Flexible subscriptions for growing teams with clear plan controls and lifecycle management.",
    points: ["Starter (free) and Pro plans", "Business tier marked in progress", "Cancel/resume controls"],
    accent: "Billing",
  },
];

export default function HomePage() {
  return (
    <div className="page-shell page-shell--marketing">
      <div className="marketing-atmosphere" aria-hidden>
        <span className="marketing-orb marketing-orb--coral"></span>
        <span className="marketing-orb marketing-orb--teal"></span>
        <span className="marketing-orb marketing-orb--gold"></span>
      </div>
      <header className="site-header reveal-item">
        <div className="brand-mark">
          <span className="brand-mark__badge"></span>
          <span>PrizePilot</span>
        </div>
        <nav className="site-nav">
          <a href="#product">Product</a>
          <a href="#pricing">Pricing</a>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/billing">Billing</Link>
        </nav>
        <Link className="button button--ghost" href="/auth">
          Organizer login
        </Link>
      </header>

      <main>
        <section className="hero">
          <div className="hero__copy reveal-item" style={{ "--stagger": "120ms" }}>
            <p className="eyebrow">Private giveaway experiences for premium brands</p>
            <h1>Run polished campaigns your audience can trust.</h1>
            <p className="hero__lede">
              PrizePilot gives businesses and creators a clean way to launch giveaways,
              skill contests, referral challenges, and loyalty rewards with official
              rules, anti-fraud controls, share tooling, judging, and winner reveal
              flows built in.
            </p>
            <div className="hero__actions">
              <Link className="button" href="/studio">
                Launch your first campaign
              </Link>
              <Link className="button button--secondary" href="/auth">
                Sign in
              </Link>
            </div>
            <div className="jackpot-ticker" aria-label="Giveaway highlights">
              <span>White-glove campaign flow</span>
              <span>Official rules, elevated</span>
              <span>Transparent luxury reveal</span>
            </div>
            <ul className="hero__proof">
              <li>No purchase language guidance</li>
              <li>Random draw or judging workflow</li>
              <li>Built for local businesses and creators</li>
            </ul>
          </div>

          <div className="hero__visual reveal-item" style={{ "--stagger": "220ms" }}>
            <div className="dashboard-card dashboard-card--main marketing-float-card">
              <div className="dashboard-card__topline">
                <span className="pill pill--warm">Live campaign preview</span>
                <span className="muted">Launch in 5 minutes</span>
              </div>
              <div className="dashboard-card__hero">
                <div>
                  <p className="dashboard-card__label">Featured campaign</p>
                  <h2>Win a free detailing package</h2>
                  <p className="dashboard-card__muted">
                    Collect emails, bonus shares, and clean entrant exports without
                    messy social comment threads.
                  </p>
                </div>
                <div className="score-ring">
                  <span>92%</span>
                  <small>completion</small>
                </div>
              </div>
              <div className="dashboard-stats">
                <article>
                  <span className="dashboard-card__label">Entries</span>
                  <strong>1,248</strong>
                </article>
                <article>
                  <span className="dashboard-card__label">Duplicates blocked</span>
                  <strong>37</strong>
                </article>
                <article>
                  <span className="dashboard-card__label">Share rate</span>
                  <strong>41%</strong>
                </article>
              </div>
            </div>
            <div className="giveaway-ticket-cluster" aria-hidden>
              <article className="giveaway-ticket">
                <p>Concierge bonus</p>
                <strong>Priority entry</strong>
              </article>
              <article className="giveaway-ticket giveaway-ticket--alt">
                <p>Reveal event</p>
                <strong>8:00 PM</strong>
              </article>
              <article className="giveaway-ticket giveaway-ticket--navy">
                <p>Verified guest list</p>
                <strong>1,248</strong>
              </article>
            </div>
          </div>
        </section>

        <section className="section section--split" id="product">
          <div className="section-heading">
            <p className="eyebrow">The product</p>
            <h2>Everything an organizer needs to look professional and stay organized.</h2>
          </div>
          <div className="feature-grid">
            {campaignModes.map((mode, index) => (
              <article
                className="feature-card reveal-item"
                key={mode.id}
                style={{ "--stagger": `${180 + index * 80}ms` }}
              >
                <span className="feature-card__icon">0{index + 1}</span>
                <h3>{mode.label}</h3>
                <p>{mode.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-heading">
            <p className="eyebrow">Why PrizePilot</p>
            <h2>Professional campaign tools built for everyday organizers.</h2>
          </div>
          <div className="marketing-shot-grid">
            {liveModules.map((module, index) => (
              <article
                className="feature-card marketing-shot reveal-item"
                key={module.title}
                style={{ "--stagger": `${220 + index * 90}ms` }}
              >
                <span className="marketing-shot__badge">{module.accent}</span>
                <h3>{module.title}</h3>
                <p>{module.copy}</p>
                <div className="marketing-shot__frame" role="img" aria-label={`${module.accent} UI preview`}>
                  <div className="marketing-shot__bar">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <div className="marketing-shot__pill-row">
                    <span className="pill">{module.accent}</span>
                    <span className="pill">PrizePilot</span>
                  </div>
                  <div className="marketing-shot__lines">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
                <ul className="preview-list">
                  {module.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <MarketingWalkthrough />

        <section className="section raffle-ribbon reveal-item" style={{ "--stagger": "220ms" }}>
          <p>
            PREMIUM GIVEAWAY EXPERIENCE • VERIFIED ENTRY FLOW • TRANSPARENT WINNER MOMENT
          </p>
        </section>

        <section className="section pricing-section" id="pricing">
          <div className="section-heading">
            <p className="eyebrow">Monetization</p>
            <h2>Recurring plans for growth, clean upgrade path as your campaigns scale.</h2>
          </div>
          <div className="pricing-grid pricing-grid--app">
            <article className="price-card reveal-item" style={{ "--stagger": "180ms" }}>
              <p className="dashboard-card__label">Starter</p>
              <h3>$0<span>/mo</span></h3>
              <p>Free plan with limited features: 1 campaign, 25 entries, and core launch tools.</p>
            </article>
            <article className="price-card price-card--featured reveal-item" style={{ "--stagger": "260ms" }}>
              <p className="dashboard-card__label">Pro</p>
              <h3>$19.99<span>/mo</span></h3>
              <p>Unlimited campaigns, custom branding, and skill contest judging access.</p>
            </article>
            <article className="price-card reveal-item" style={{ "--stagger": "340ms" }}>
              <p className="dashboard-card__label">Business · Temporarily unavailable</p>
              <h3>In the works</h3>
              <p>Team access and expanded enterprise analytics are coming in a future release.</p>
            </article>
          </div>
          <div className="hero__actions pricing-actions reveal-item" style={{ "--stagger": "420ms" }}>
            <Link className="button" href="/billing">
              Open billing and plans
            </Link>
            <Link className="button button--ghost" href="/studio">
              Open campaign studio
            </Link>
          </div>
        </section>
      </main>
      <footer className="section">
        <div className="section-heading">
          <p className="eyebrow">Legal</p>
          <h2>PrizePilot policies</h2>
        </div>
        <p>
          <Link href="/privacy">Privacy Policy</Link> · <Link href="/terms">Terms of Service</Link>
        </p>
      </footer>
    </div>
  );
}
