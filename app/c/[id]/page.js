"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const MAX_UPLOAD_IMAGE_BYTES = 4 * 1024 * 1024;
const TURNSTILE_SITE_KEY = String(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim();

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read the selected image."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("The selected file is not a supported image."));
      img.onload = () => resolve(img);
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

async function compressImageToDataUrl(file) {
  if (!file || !file.type?.startsWith("image/")) {
    throw new Error("Please choose a PNG, JPG, or WEBP image.");
  }
  if (file.size > MAX_UPLOAD_IMAGE_BYTES) {
    throw new Error("File too big. Please upload an image 4MB or smaller.");
  }

  const image = await loadImageFromFile(file);
  const maxDimension = 1280;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to process image in this browser.");
  }
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

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

export default function PublicCampaignPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const campaignId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRevealingWinner, setIsRevealingWinner] = useState(false);
  const [winnerVisible, setWinnerVisible] = useState(false);
  const [reelSequence, setReelSequence] = useState([]);
  const [reelOffset, setReelOffset] = useState(0);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    submissionTitle: "",
    projectLink: "",
    submissionImageData: "",
  });
  const [imageName, setImageName] = useState("");
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [submissionsOpen, setSubmissionsOpen] = useState(false);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [submissionsError, setSubmissionsError] = useState("");
  const [submissions, setSubmissions] = useState([]);
  const [galleryPointer, setGalleryPointer] = useState({ x: 50, y: 16 });
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReady, setCaptchaReady] = useState(!TURNSTILE_SITE_KEY);
  const turnstileContainerRef = useRef(null);
  const turnstileWidgetIdRef = useRef(null);

  async function loadSubmissions() {
    if (!campaignId) {
      return;
    }
    setSubmissionsLoading(true);
    setSubmissionsError("");
    try {
      const payload = await requestJson(`/api/public/campaigns/${campaignId}/entrants`);
      setSubmissions(Array.isArray(payload.submissions) ? payload.submissions : []);
    } catch (error) {
      setSubmissionsError(error.message || "Unable to load submissions.");
    } finally {
      setSubmissionsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!campaignId) {
        setErrorMessage("Campaign link is missing an ID.");
        setLoading(false);
        return;
      }
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
    const interval = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [campaignId]);

  useEffect(() => {
    if (campaign?.status !== "closed" || !campaign?.winner?.name) {
      setIsRevealingWinner(false);
      setWinnerVisible(false);
      setReelSequence([]);
      setReelOffset(0);
      return;
    }

    const winnerName = campaign.winner.name;
    const sourceNames =
      Array.isArray(campaign.revealNames) && campaign.revealNames.length > 0
        ? campaign.revealNames.filter((name) => name && name !== winnerName)
        : [];
    const pool = sourceNames.length > 0 ? sourceNames : ["Entry", "Lucky entrant", "Contestant"];
    const sequence = [];
    for (let index = 0; index < 24; index += 1) {
      sequence.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    sequence.push(winnerName, winnerName, winnerName);

    setReelSequence(sequence);
    setIsRevealingWinner(false);
    setWinnerVisible(false);

    const reelCellHeight = 58;
    const reelWindowHeight = 330;
    const winnerIndex = sequence.length - 2;
    const centerOffset = Math.floor(reelWindowHeight / 2 - reelCellHeight / 2);
    const finalOffset = Math.max(0, winnerIndex * reelCellHeight - centerOffset);
    setReelOffset(0);

    const kickOff = setTimeout(() => {
      setIsRevealingWinner(true);
      setReelOffset(finalOffset);
    }, 40);

    const timer = setTimeout(() => {
      setIsRevealingWinner(false);
      setWinnerVisible(true);
    }, 6000);
    return () => {
      clearTimeout(kickOff);
      clearTimeout(timer);
    };
  }, [campaign?.status, campaign?.winner?.name, campaign?.winner?.announcedAt, campaign?.id]);

  useEffect(() => {
    if (!submissionsOpen) {
      return undefined;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [submissionsOpen]);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || campaign?.status !== "live" || !campaign?.acceptingEntries) {
      setCaptchaReady(!TURNSTILE_SITE_KEY);
      return undefined;
    }

    let cancelled = false;

    function mountTurnstileWidget() {
      if (cancelled) {
        return;
      }
      if (!window.turnstile || !turnstileContainerRef.current || turnstileWidgetIdRef.current !== null) {
        return;
      }
      setCaptchaReady(false);
      turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: "light",
        callback: (token) => {
          setCaptchaToken(String(token || ""));
          setCaptchaReady(true);
        },
        "expired-callback": () => {
          setCaptchaToken("");
          setCaptchaReady(false);
        },
        "error-callback": () => {
          setCaptchaToken("");
          setCaptchaReady(false);
        },
      });
    }

    if (window.turnstile) {
      mountTurnstileWidget();
      return () => {
        cancelled = true;
      };
    }

    const existingScript = document.querySelector("script[data-prizepilot-turnstile='true']");
    if (existingScript) {
      existingScript.addEventListener("load", mountTurnstileWidget, { once: true });
      return () => {
        cancelled = true;
      };
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.prizepilotTurnstile = "true";
    script.addEventListener("load", mountTurnstileWidget, { once: true });
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [campaign?.status, campaign?.acceptingEntries]);

  function handleGalleryPointerMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 100;
    const y = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 100;
    setGalleryPointer({
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    });
  }

  function handleSubmissionCardMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const py = (event.clientY - rect.top) / Math.max(rect.height, 1);
    const rx = ((0.5 - py) * 8).toFixed(2);
    const ry = ((px - 0.5) * 10).toFixed(2);
    event.currentTarget.style.setProperty("--card-rx", `${rx}deg`);
    event.currentTarget.style.setProperty("--card-ry", `${ry}deg`);
  }

  function resetSubmissionCardMove(event) {
    event.currentTarget.style.setProperty("--card-rx", "0deg");
    event.currentTarget.style.setProperty("--card-ry", "0deg");
  }

  useEffect(() => {
    if (!submissionsOpen) {
      return undefined;
    }
    function handleEscape(event) {
      if (event.key === "Escape") {
        setSubmissionsOpen(false);
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [submissionsOpen]);

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
    <div
      className={`auth-body${campaign.brandName || campaign.brandLogoUrl ? " auth-body--campaign-theme" : ""}`}
      style={{
        "--campaign-primary": campaign.brandPrimary || "#172033",
        "--campaign-accent": campaign.brandAccent || "#f06a43",
      }}
    >
      <div className="auth-shell">
        <section
          className="auth-panel auth-panel--intro auth-panel--campaign-brand"
        >
          {!campaign.hidePrizePilotBranding ? (
            <div className="brand-mark">
              <span className="brand-mark__badge"></span>
              <span>PrizePilot</span>
            </div>
          ) : null}
          {campaign.brandLogoUrl ? (
            <img
              className="campaign-brand-logo"
              src={campaign.brandLogoUrl}
              alt={`${campaign.brandName || "Organizer"} logo`}
            />
          ) : null}
          {campaign.brandName ? <p className="campaign-brand-name">{campaign.brandName}</p> : null}
          <p className="eyebrow">{campaign.type}</p>
          <h1>{campaign.title}</h1>
          <p>{campaign.prize}</p>
          <ul className="hero__proof">
            <li>Eligibility: {campaign.audience}</li>
            <li>Winner method: {campaign.method}</li>
            <li>Campaign ends: {campaign.endsOn}</li>
          </ul>
          <div className="hero__actions campaign-rules-link-wrap">
            <a className="button button--ghost button--mini" href={`/r/${campaign.id}`} target="_blank" rel="noreferrer">
              Official rules
            </a>
          </div>
        </section>

        <section className="auth-panel">
          {campaign.status === "live" && campaign.acceptingEntries ? (
            <form
              className="auth-form"
              onSubmit={async (event) => {
                event.preventDefault();
                setMessage("");
                if (TURNSTILE_SITE_KEY && !captchaToken) {
                  setErrorMessage("Please complete the security check before submitting.");
                  return;
                }
                if (campaign.type === "contest") {
                  if (!form.submissionTitle.trim()) {
                    setErrorMessage("Please add a title for your work.");
                    return;
                  }
                  if (!form.submissionImageData) {
                    setErrorMessage("Image required. If your file was too big, use an image 4MB or smaller.");
                    return;
                  }
                }
                setErrorMessage("");
                try {
                  const result = await requestJson(`/api/public/campaigns/${campaignId}/entries`, {
                    method: "POST",
                    body: JSON.stringify({
                      name: form.name,
                      email: form.email,
                      source: searchParams.get("src") || "public-link",
                      submissionTitle: form.submissionTitle,
                      projectLink: form.projectLink,
                      submissionImageData: form.submissionImageData,
                      captchaToken,
                    }),
                  });
                  setMessage(result.message || "Entry received.");
                  setForm({
                    name: "",
                    email: "",
                    submissionTitle: "",
                    projectLink: "",
                    submissionImageData: "",
                  });
                  setImageName("");
                  setCaptchaToken("");
                  if (TURNSTILE_SITE_KEY && window.turnstile && turnstileWidgetIdRef.current !== null) {
                    window.turnstile.reset(turnstileWidgetIdRef.current);
                    setCaptchaReady(false);
                  }
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
              {campaign.type === "contest" ? (
                <>
                  <label className="studio-field">
                    <span>Title of work</span>
                    <input
                      value={form.submissionTitle}
                      placeholder="Sunset Dragon Render"
                      onChange={(event) =>
                        setForm((current) => ({ ...current, submissionTitle: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label className="studio-field">
                    <span>Entry image (required)</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      required
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        setErrorMessage("");
                        setMessage("");
                        if (!file) {
                          setForm((current) => ({ ...current, submissionImageData: "" }));
                          setImageName("");
                          return;
                        }
                        try {
                          setIsProcessingImage(true);
                          const dataUrl = await compressImageToDataUrl(file);
                          setForm((current) => ({ ...current, submissionImageData: dataUrl }));
                          setImageName(file.name);
                          setMessage(`Image ready: ${file.name}`);
                        } catch (uploadError) {
                          setForm((current) => ({ ...current, submissionImageData: "" }));
                          setImageName("");
                          setErrorMessage(uploadError.message || "Unable to process image.");
                        } finally {
                          setIsProcessingImage(false);
                        }
                      }}
                    />
                  </label>
                  <label className="studio-field">
                    <span>Project link (optional, Google Drive/etc.)</span>
                    <input
                      type="url"
                      value={form.projectLink}
                      placeholder="https://drive.google.com/..."
                      onChange={(event) =>
                        setForm((current) => ({ ...current, projectLink: event.target.value }))
                      }
                    />
                  </label>
                  <p className="studio-save-message">
                    {isProcessingImage
                      ? "Processing image..."
                      : imageName
                        ? `Ready to submit: ${imageName}`
                        : "Upload one image (max 4MB). Add a Drive/share link for larger files if needed."}
                  </p>
                  <div className="campaign-actions">
                    <button
                      className="button button--ghost button--mini"
                      type="button"
                      onClick={async () => {
                        const nextOpen = !submissionsOpen;
                        setSubmissionsOpen(nextOpen);
                        if (nextOpen) {
                          await loadSubmissions();
                        }
                      }}
                    >
                      {submissionsOpen ? "Hide submissions" : "View submissions"}
                    </button>
                  </div>
                </>
              ) : null}
              {TURNSTILE_SITE_KEY ? (
                <label className="studio-field">
                  <span>Security check</span>
                  <div className="captcha-box">
                    <div ref={turnstileContainerRef}></div>
                    {!captchaReady ? (
                      <small className="captcha-box__hint">Loading verification...</small>
                    ) : null}
                  </div>
                </label>
              ) : null}
              {message ? <p className="studio-save-message">{message}</p> : null}
              {errorMessage ? <p className="studio-save-message">{errorMessage}</p> : null}
              <button
                className="button"
                type="submit"
                disabled={isProcessingImage || (Boolean(TURNSTILE_SITE_KEY) && !captchaReady)}
              >
                Submit entry
              </button>
            </form>
          ) : (
            <div className="winner-reveal">
              <div className="winner-reveal__header">
                <p className="dashboard-card__label">Winner reveal</p>
                <span className="winner-reveal__badge">Live draw recap</span>
              </div>

              <h2>{winnerVisible && campaign?.winner?.name ? campaign.winner.name : "Spinning for winner..."}</h2>

              <div className="winner-machine">
                <div className="winner-machine__lights" />
                <div className="winner-machine__window">
                  <div
                    className={`winner-machine__reel${isRevealingWinner ? " is-spinning" : ""}`}
                    style={{ transform: `translateY(-${reelOffset}px)` }}
                  >
                    {reelSequence.map((name, index) => (
                      <div className="winner-machine__cell" key={`${name}-${index}`}>
                        {name}
                      </div>
                    ))}
                  </div>
                  <span className="winner-machine__pointer">◀</span>
                </div>
              </div>

              <div className="winner-callout">
                <p className="winner-callout__label">Official winner</p>
                <strong>
                  {campaign?.winner?.name
                    ? campaign.winner.name
                    : "No eligible entries were received."}
                </strong>
                <p className="studio-save-message">
                  This result page remains available briefly after close so entrants can watch the reveal.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
      {campaign.type === "contest" && submissionsOpen ? (
        <div
          className="public-submissions-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Submitted work gallery"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSubmissionsOpen(false);
            }
          }}
        >
          <div
            className="public-submissions-modal__panel"
            style={{
              "--gallery-x": `${galleryPointer.x}%`,
              "--gallery-y": `${galleryPointer.y}%`,
            }}
            onMouseMove={handleGalleryPointerMove}
          >
            <div className="app-section__heading">
              <div>
                <h2>Submitted work</h2>
                <p className="studio-save-message">
                  Showcase mode with {submissions.length} submission{submissions.length === 1 ? "" : "s"}.
                </p>
              </div>
              <button
                className="button button--ghost button--mini"
                type="button"
                onClick={() => setSubmissionsOpen(false)}
              >
                Close
              </button>
            </div>
            {submissionsLoading ? <p className="studio-save-message">Loading submissions...</p> : null}
            {submissionsError ? <p className="studio-save-message">{submissionsError}</p> : null}
            {!submissionsLoading && !submissionsError ? (
              submissions.length > 0 ? (
                <div className="public-submissions__grid">
                  {submissions.map((item) => (
                    <article
                      className="campaign-card public-submission-card"
                      key={item.id}
                      onMouseMove={handleSubmissionCardMove}
                      onMouseLeave={resetSubmissionCardMove}
                    >
                      <div className="campaign-card__header">
                        <div>
                          <p className="dashboard-card__label">Entrant</p>
                          <h3>{item.name}</h3>
                        </div>
                      </div>
                      {item.submissionTitle ? (
                        <p className="studio-save-message">
                          Work title: <strong>{item.submissionTitle}</strong>
                        </p>
                      ) : null}
                      {item.submissionImageData ? (
                        <img
                          className="judging-submission__image public-submission-card__image"
                          src={item.submissionImageData}
                          alt={`${item.name} submission`}
                        />
                      ) : null}
                      {item.submissionLink ? (
                        <a
                          className="button button--ghost button--mini"
                          href={item.submissionLink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open project link
                        </a>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="studio-save-message">No work submissions yet.</p>
              )
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
