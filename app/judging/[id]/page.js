"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { usePrizePilotStore } from "lib/usePrizePilotStore";

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

export default function JudgingPage() {
  const router = useRouter();
  const params = useParams();
  const campaignId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const { hydrated, state } = usePrizePilotStore();
  const [board, setBoard] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingEntrantId, setPendingEntrantId] = useState("");
  const [draftScores, setDraftScores] = useState({});

  useEffect(() => {
    if (hydrated && !state.session.loggedIn) {
      router.replace("/auth");
    }
  }, [hydrated, router, state.session.loggedIn]);

  useEffect(() => {
    let cancelled = false;
    async function loadBoard() {
      if (!campaignId) {
        return;
      }
      try {
        const payload = await requestJson(`/api/campaigns/${campaignId}/judging`);
        if (!cancelled) {
          setBoard(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Unable to load judging dashboard.");
        }
      }
    }
    if (hydrated && state.session.loggedIn) {
      loadBoard();
    }
    return () => {
      cancelled = true;
    };
  }, [campaignId, hydrated, state.session.loggedIn]);

  const rankedEntrants = useMemo(() => board?.entrants || [], [board?.entrants]);

  if (!hydrated) {
    return (
      <div className="auth-body">
        <div className="auth-shell">
          <section className="auth-panel">Loading workspace...</section>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="auth-body">
        <div className="auth-shell">
          <section className="auth-panel">
            <h1>Judging unavailable</h1>
            <p>{error}</p>
            <Link className="button button--ghost button--mini" href="/dashboard">
              Back to dashboard
            </Link>
          </section>
        </div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="auth-body">
        <div className="auth-shell">
          <section className="auth-panel">Loading judging dashboard...</section>
        </div>
      </div>
    );
  }

  return (
    <div className="app-body">
      <div className="app-shell app-shell--wide">
        <aside className="app-sidebar">
          <div className="brand-mark">
            <span className="brand-mark__badge"></span>
            <span>PrizePilot</span>
          </div>
          <p className="app-sidebar__copy">Skill contest scoring board.</p>
          <nav className="app-nav">
            <Link href="/dashboard">Overview</Link>
            <Link href="/studio">Campaign studio</Link>
            <Link className="is-current" href={`/judging/${board.campaign.id}`}>
              Judging board
            </Link>
          </nav>
        </aside>

        <main className="app-main">
          <header className="app-topbar">
            <div>
              <p className="eyebrow">Judging dashboard</p>
              <h1>{board.campaign.title}</h1>
              <p className="app-welcome">
                Role: {board.permissions.role}.{" "}
                {board.permissions.canScore
                  ? "You can score entries."
                  : "View-only mode. Ask owner to promote you to manager to score."}
              </p>
            </div>
            <div className="app-topbar__actions">
              <Link className="button button--ghost" href="/dashboard">
                Back to dashboard
              </Link>
              <a className="button button--ghost" href={`/r/${board.campaign.id}`} target="_blank" rel="noreferrer">
                Public rules
              </a>
            </div>
          </header>

          <section className="app-section">
            <div className="app-section__heading">
              <h2>Criteria</h2>
            </div>
            <article className="app-panel">
              {board.campaign.criteria.length > 0 ? (
                <ul className="preview-list">
                  {board.campaign.criteria.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="studio-save-message">
                  No criteria published yet. Use campaign studio to define contest criteria.
                </p>
              )}
            </article>
          </section>

          <section className="app-section">
            <div className="app-section__heading">
              <h2>Entrant scoring</h2>
            </div>
            {message ? <p className="studio-save-message">{message}</p> : null}
            <div className="campaign-list">
              {rankedEntrants.length > 0 ? (
                rankedEntrants.map((entrant, index) => (
                  <article className="campaign-card" key={entrant.id}>
                    <div className="campaign-card__header">
                      <div>
                        <p className="dashboard-card__label">Rank #{index + 1}</p>
                        <h3>{entrant.name}</h3>
                      </div>
                    </div>
                    <p className="campaign-card__audience">
                      {entrant.email} • {entrant.source}
                    </p>
                    {entrant.submissionTitle ? (
                      <p className="studio-save-message">
                        Work title: <strong>{entrant.submissionTitle}</strong>
                      </p>
                    ) : null}
                    {entrant.submissionImageData || entrant.submissionLink ? (
                      <div className="judging-submission">
                        {entrant.submissionImageData ? (
                          <img
                            className="judging-submission__image"
                            src={entrant.submissionImageData}
                            alt={`${entrant.name} submission`}
                          />
                        ) : null}
                        {entrant.submissionLink ? (
                          <a
                            className="button button--ghost button--mini"
                            href={entrant.submissionLink}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open project link
                          </a>
                        ) : null}
                      </div>
                    ) : (
                      <p className="studio-save-message">No submission asset attached.</p>
                    )}
                    <div className="campaign-card__stats">
                      <div>
                        <span className="dashboard-card__label">Scores</span>
                        <strong>{entrant.scoreCount}</strong>
                      </div>
                      <div>
                        <span className="dashboard-card__label">Your score</span>
                        <strong>
                          {draftScores[entrant.id] ?? entrant.myScore ?? "Not scored"}
                        </strong>
                      </div>
                      <div>
                        <span className="dashboard-card__label">Status</span>
                        <strong>{board.campaign.status}</strong>
                      </div>
                    </div>
                    {board.permissions.canScore ? (
                      <>
                        <label className="studio-field">
                          <span>Score (0-100)</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={draftScores[entrant.id] ?? entrant.myScore ?? ""}
                            onChange={(event) =>
                              setDraftScores((current) => ({
                                ...current,
                                [entrant.id]: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <div className="campaign-actions">
                          <button
                            className="button button--mini"
                            type="button"
                            disabled={pendingEntrantId === entrant.id}
                            onClick={async () => {
                              setPendingEntrantId(entrant.id);
                              setError("");
                              setMessage("");
                              try {
                                const payload = await requestJson(`/api/campaigns/${campaignId}/judging`, {
                                  method: "POST",
                                  body: JSON.stringify({
                                    entrantId: entrant.id,
                                    score: Number(draftScores[entrant.id] ?? entrant.myScore ?? 0),
                                  }),
                                });
                                setBoard(payload);
                                setMessage(`Score saved for ${entrant.name}.`);
                              } catch (submitError) {
                                setError(submitError.message || "Unable to save score.");
                              } finally {
                                setPendingEntrantId("");
                              }
                            }}
                          >
                            {pendingEntrantId === entrant.id ? "Saving..." : "Save score"}
                          </button>
                        </div>
                      </>
                    ) : null}
                  </article>
                ))
              ) : (
                <article className="campaign-row">
                  <div>
                    <p className="dashboard-card__label">No entrants yet</p>
                    <h3>Entries will appear here as they come in.</h3>
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
