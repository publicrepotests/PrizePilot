import Link from "next/link";

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

export default function HomePage() {
  return (
    <div className="page-shell">
      <header className="site-header">
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
          <div className="hero__copy">
            <p className="eyebrow">Giveaways that look legit and feel premium</p>
            <h1>Run polished campaigns your audience can trust.</h1>
            <p className="hero__lede">
              PrizePilot gives small businesses and creators a clean way to launch
              giveaways, skill contests, referral challenges, and loyalty rewards
              with landing pages, official rules, fraud checks, and winner tools
              built in.
            </p>
            <div className="hero__actions">
              <Link className="button" href="/studio">
                Launch your first campaign
              </Link>
              <Link className="button button--secondary" href="/auth">
                Sign in
              </Link>
            </div>
            <ul className="hero__proof">
              <li>No purchase language guidance</li>
              <li>Random draw or judging workflow</li>
              <li>Built for local businesses and creators</li>
            </ul>
          </div>

          <div className="hero__visual">
            <div className="dashboard-card dashboard-card--main">
              <div className="dashboard-card__topline">
                <span className="pill pill--warm">Live campaign preview</span>
                <span className="muted">Launch in 5 minutes</span>
              </div>
              <div className="dashboard-card__hero">
                <div>
                  <p className="dashboard-card__label">Featured campaign</p>
                  <h2>Win a free detailing package</h2>
                  <p className="dashboard-card__muted">
                    Collect emails, bonus shares, and a clean export without
                    sending people into a messy social comment thread.
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
          </div>
        </section>

        <section className="section section--split" id="product">
          <div className="section-heading">
            <p className="eyebrow">The product</p>
            <h2>Everything an organizer needs to look professional and stay organized.</h2>
          </div>
          <div className="feature-grid">
            {campaignModes.map((mode, index) => (
              <article className="feature-card" key={mode.id}>
                <span className="feature-card__icon">0{index + 1}</span>
                <h3>{mode.label}</h3>
                <p>{mode.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section pricing-section" id="pricing">
          <div className="section-heading">
            <p className="eyebrow">Monetization</p>
            <h2>Recurring revenue for power users, simple launch fees for everyone else.</h2>
          </div>
          <div className="pricing-grid pricing-grid--app">
            <article className="price-card">
              <p className="dashboard-card__label">Starter</p>
              <h3>$19<span>/mo</span></h3>
              <p>3 campaigns, 500 entries, and email confirmations.</p>
            </article>
            <article className="price-card price-card--featured">
              <p className="dashboard-card__label">Pro</p>
              <h3>$49<span>/mo</span></h3>
              <p>Unlimited campaigns, custom branding, and judging dashboard access.</p>
            </article>
            <article className="price-card">
              <p className="dashboard-card__label">Business</p>
              <h3>$99<span>/mo</span></h3>
              <p>Team access, advanced analytics, and exports.</p>
            </article>
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
