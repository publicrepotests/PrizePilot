"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePrizePilotStore } from "lib/usePrizePilotStore";

export default function AuthPage() {
  const router = useRouter();
  const { state, hydrated, signIn } = usePrizePilotStore();
  const [form, setForm] = useState({
    organizerName: "Shane",
    businessName: "Windy City Detail Co.",
    email: "owner@windycitydetail.co",
  });

  useEffect(() => {
    if (hydrated && state.session.loggedIn) {
      router.replace("/dashboard");
    }
  }, [hydrated, router, state.session.loggedIn]);

  async function handleSubmit(event) {
    event.preventDefault();
    await signIn(form);
    router.push("/dashboard");
  }

  return (
    <div className="auth-body">
      <div className="auth-shell">
        <section className="auth-panel auth-panel--intro">
          <div className="brand-mark">
            <span className="brand-mark__badge"></span>
            <span>PrizePilot</span>
          </div>
          <p className="eyebrow">Organizer access</p>
          <h1>Launch better giveaways without looking sketchy.</h1>
          <p>
            This demo stores organizer info, billing, and campaigns locally so you
            can move through a realistic SaaS flow right in the browser.
          </p>
          <ul className="hero__proof">
            <li>Saved organizer profile</li>
            <li>Persistent campaign drafts</li>
            <li>Billing and plan selection</li>
          </ul>
        </section>

        <section className="auth-panel">
          <form className="auth-form" onSubmit={handleSubmit}>
            <p className="dashboard-card__label">Sign in to demo</p>
            <h2>Set up your organizer workspace.</h2>

            <label className="studio-field">
              <span>Your name</span>
              <input
                value={form.organizerName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    organizerName: event.target.value,
                  }))
                }
                required
              />
            </label>

            <label className="studio-field">
              <span>Business name</span>
              <input
                value={form.businessName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    businessName: event.target.value,
                  }))
                }
                required
              />
            </label>

            <label className="studio-field">
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
                required
              />
            </label>

            <button className="button" type="submit">
              Enter dashboard
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
