import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="page-shell">
      <main className="section">
        <div className="section-heading">
          <p className="eyebrow">Legal</p>
          <h1>Privacy Policy</h1>
        </div>
        <p>
          PrizePilot collects account profile data, campaign data, and billing metadata needed
          to operate the service. We do not sell personal data.
        </p>
        <p>
          Passwords are stored as one-way hashes. Account sessions are stored with expiration,
          and access can be revoked by signing out or resetting a password.
        </p>
        <p>
          Organizers are responsible for lawful campaign usage and entrant data handling under
          applicable local laws.
        </p>
        <p>
          Contact: <a href="mailto:support@prizepilot.app">support@prizepilot.app</a>
        </p>
        <p>
          <Link href="/">Back to home</Link>
        </p>
      </main>
    </div>
  );
}
