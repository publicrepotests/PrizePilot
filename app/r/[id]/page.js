"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

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

export default function RulesPage() {
  const params = useParams();
  const campaignId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [rules, setRules] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadRules() {
      try {
        const payload = await requestJson(`/api/public/campaigns/${campaignId}/rules`);
        if (!cancelled) {
          setRules(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Rules are not available.");
        }
      }
    }
    if (campaignId) {
      loadRules();
    }
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  if (!campaignId) {
    return (
      <div className="auth-body">
        <div className="auth-shell">
          <section className="auth-panel">
            <h1>Rules unavailable</h1>
            <p>Campaign link is missing an id.</p>
          </section>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="auth-body">
        <div className="auth-shell">
          <section className="auth-panel">
            <h1>Rules unavailable</h1>
            <p>{error}</p>
          </section>
        </div>
      </div>
    );
  }

  if (!rules) {
    return (
      <div className="auth-body">
        <div className="auth-shell">
          <section className="auth-panel">Loading official rules...</section>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-body">
      <div className="auth-shell">
        <section className="auth-panel auth-panel--intro">
          <p className="eyebrow">Official rules</p>
          <h1>{rules.title}</h1>
          <p>
            Campaign type: {rules.type}. Generated {new Date(rules.generatedAt).toLocaleString()}.
          </p>
          <div className="hero__actions">
            <Link className="button button--ghost button--mini" href={`/c/${rules.campaignId}`}>
              Back to campaign
            </Link>
          </div>
        </section>
        <section className="auth-panel">
          <div className="studio-surface">
            <ul className="preview-list">
              {(rules.sections || []).map((section) => (
                <li key={section.heading}>
                  <strong>{section.heading}:</strong> {section.body}
                </li>
              ))}
            </ul>
            <p className="studio-save-message">
              Organizer is responsible for legal compliance in all active regions.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
