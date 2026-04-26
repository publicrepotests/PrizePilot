"use client";

import { useEffect, useState } from "react";

async function requestJson(url, options) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed: ${response.status}`);
  }
  return payload;
}

export default function PublicCampaignPage({ params }) {
  const campaignId = params?.id;
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const payload = await requestJson(`/api/public/campaigns/${campaignId}`);
        if (!cancelled) {
          setCampaign(payload);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error.message || "Campaign unavailable.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  if (loading) {
    return <div className="auth-body"><div className="auth-shell"><section className="auth-panel">Loading campaign...</section></div></div>;
  }

  if (!campaign) {
    return (
      <div className="auth-body">
        <div className="auth-shell">
          <section className="auth-panel">
            <h1>Campaign not available</h1>
            <p>{errorMessage || "This campaign is not live right now."}</p>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-body">
      <div className="auth-shell">
        <section className="auth-panel auth-panel--intro">
          <p className="eyebrow">{campaign.type}</p>
          <h1>{campaign.title}</h1>
          <p>{campaign.prize}</p>
          <ul className="hero__proof">
            <li>Eligibility: {campaign.audience}</li>
            <li>Winner method: {campaign.method}</li>
            <li>Campaign ends: {campaign.endsOn}</li>
          </ul>
        </section>

        <section className="auth-panel">
          <form
            className="auth-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setErrorMessage("");
              setMessage("");
              try {
                const result = await requestJson(`/api/public/campaigns/${campaignId}/entries`, {
                  method: "POST",
                  body: JSON.stringify({
                    name: form.name,
                    email: form.email,
                    source: "public-link",
                  }),
                });
                setMessage(result.message || "Entry received.");
                setForm({ name: "", email: "" });
              } catch (error) {
                setErrorMessage(error.message || "Unable to submit entry.");
              }
            }}
          >
            <p className="dashboard-card__label">Enter campaign</p>
            <h2>Submit your entry</h2>
            <label className="studio-field">
              <span>Name</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </label>
            <label className="studio-field">
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                required
              />
            </label>
            {message ? <p className="studio-save-message">{message}</p> : null}
            {errorMessage ? <p className="studio-save-message">{errorMessage}</p> : null}
            <button className="button" type="submit">
              Submit entry
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
