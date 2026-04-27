"use client";

import { startTransition, useMemo, useState } from "react";

const tracks = {
  organizer: [
    {
      title: "Create your campaign in minutes",
      copy: "Choose giveaway, contest, referral, or loyalty. Fill out prize, audience, dates, and winner method.",
      points: ["Campaign Studio templates", "Official rules generated", "Plan-based feature checks"],
      previewLabel: "Studio setup",
      image: "/tutorial/organizer-1-studio.svg",
      imageAlt: "Campaign Studio setup screen preview",
    },
    {
      title: "Brand and launch with confidence",
      copy: "Set colors/logo (Pro), publish instantly, and generate your public campaign page plus share assets.",
      points: ["Launch/relaunch controls", "Share link + QR + flyer exports", "Duplicate prevention and confirmations"],
      previewLabel: "Launch tools",
      image: "/tutorial/organizer-2-launch.svg",
      imageAlt: "Organizer dashboard launch and sharing tools preview",
    },
    {
      title: "Track results and announce winner",
      copy: "Monitor entries, source quality, and campaign status. At close, winner reveal runs and stays visible publicly.",
      points: ["Organizer analytics view", "Contest judging dashboard", "Public winner reveal window"],
      previewLabel: "Ops + analytics",
      image: "/tutorial/organizer-3-analytics.svg",
      imageAlt: "Organizer analytics and campaign operations preview",
    },
  ],
  entrant: [
    {
      title: "Open a clean public campaign page",
      copy: "Entrants land on a branded page with clear rules, eligibility details, and campaign timeline.",
      points: ["Mobile-first experience", "No confusing social comment chains", "Rules and entry requirements up front"],
      previewLabel: "Public landing",
      image: "/tutorial/entrant-1-landing.svg",
      imageAlt: "Entrant public campaign landing page preview",
    },
    {
      title: "Submit a valid entry",
      copy: "Giveaways use simple entry forms. Skill contests accept image uploads plus optional project links.",
      points: ["Email confirmation", "Entry validation and duplicate checks", "Contest title + media support"],
      previewLabel: "Entry flow",
      image: "/tutorial/entrant-2-entry.svg",
      imageAlt: "Entrant submission form preview",
    },
    {
      title: "Watch the winner reveal",
      copy: "When the campaign ends, entrants can view a fun winner announcement moment on the public page.",
      points: ["Animated reveal experience", "Winner transparency", "Page remains live briefly after close"],
      previewLabel: "Reveal moment",
      image: "/tutorial/entrant-3-winner.svg",
      imageAlt: "Entrant winner reveal screen preview",
    },
  ],
};

export default function MarketingWalkthrough() {
  const [audience, setAudience] = useState("organizer");
  const [stepIndex, setStepIndex] = useState(0);

  const steps = useMemo(() => tracks[audience] || tracks.organizer, [audience]);
  const step = steps[stepIndex] || steps[0];

  function switchAudience(nextAudience) {
    startTransition(() => {
      setAudience(nextAudience);
      setStepIndex(0);
    });
  }

  function nextStep() {
    setStepIndex((current) => (current + 1) % steps.length);
  }

  function previousStep() {
    setStepIndex((current) => (current - 1 + steps.length) % steps.length);
  }

  return (
    <section className="section walkthrough-section" id="how-it-works">
      <div className="section-heading">
        <p className="eyebrow">How it works</p>
        <h2>A guided look at both sides of PrizePilot.</h2>
      </div>

      <div className="walkthrough">
        <div className="walkthrough__header">
          <div className="walkthrough__audience-toggle" role="tablist" aria-label="Walkthrough audience">
            <button
              className={`walkthrough__audience-button${audience === "organizer" ? " is-active" : ""}`}
              type="button"
              role="tab"
              aria-selected={audience === "organizer"}
              onClick={() => switchAudience("organizer")}
            >
              Organizer view
            </button>
            <button
              className={`walkthrough__audience-button${audience === "entrant" ? " is-active" : ""}`}
              type="button"
              role="tab"
              aria-selected={audience === "entrant"}
              onClick={() => switchAudience("entrant")}
            >
              Entrant view
            </button>
          </div>

          <div className="walkthrough__step-pills" aria-label="Step progress">
            {steps.map((item, index) => (
              <button
                key={`${audience}-${item.title}`}
                className={`walkthrough__step-pill${index === stepIndex ? " is-active" : ""}`}
                type="button"
                onClick={() => setStepIndex(index)}
                aria-label={`Go to step ${index + 1}`}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </div>

        <article className="walkthrough__stage" key={`${audience}-${stepIndex}`}>
          <div className="walkthrough__copy">
            <p className="dashboard-card__label">
              {audience === "organizer" ? "Organizer flow" : "Entrant flow"} · Step {stepIndex + 1}
            </p>
            <h3>{step.title}</h3>
            <p>{step.copy}</p>
            <ul className="preview-list">
              {step.points.map((point) => (
                <li key={`${step.title}-${point}`}>{point}</li>
              ))}
            </ul>
            <div className="walkthrough__actions">
              <button className="button button--ghost" type="button" onClick={previousStep}>
                Previous
              </button>
              <button className="button" type="button" onClick={nextStep}>
                Next
              </button>
            </div>
          </div>

          <div className="walkthrough__visual" aria-hidden>
            <div className="walkthrough__visual-header">
              <span className="walkthrough__chip">{step.previewLabel}</span>
              <span className="walkthrough__chip walkthrough__chip--alt">
                {audience === "organizer" ? "Workspace side" : "Audience side"}
              </span>
            </div>
            <img className="walkthrough__image" src={step.image} alt={step.imageAlt} loading="lazy" />
          </div>
        </article>
      </div>
    </section>
  );
}
