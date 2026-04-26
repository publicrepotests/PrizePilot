import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="page-shell">
      <main className="section">
        <div className="section-heading">
          <p className="eyebrow">Legal</p>
          <h1>Terms of Service</h1>
        </div>
        <p>
          PrizePilot provides software for creating and managing giveaways and contests. You are
          responsible for legal compliance in your target jurisdictions.
        </p>
        <p>
          You agree not to use PrizePilot for unlawful lotteries, fraudulent entry collection, or
          abusive campaigns.
        </p>
        <p>
          Subscription billing is handled through Stripe. Plan access may be limited or suspended
          for unpaid invoices or misuse.
        </p>
        <p>
          We may update these terms as the product evolves. Continued use means acceptance of the
          latest version.
        </p>
        <p>
          <Link href="/">Back to home</Link>
        </p>
      </main>
    </div>
  );
}
