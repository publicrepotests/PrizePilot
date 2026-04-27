"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePrizePilotStore } from "lib/usePrizePilotStore";

export default function AuthPage() {
  const router = useRouter();
  const { state, hydrated, confirmPasswordReset, register, requestPasswordReset, signIn } =
    usePrizePilotStore();
  const [mode, setMode] = useState("register");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    recoveryPassphrase: "",
    token: "",
    organizerName: "Shane",
    businessName: "Windy City Detail Co.",
    email: "",
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const urlMode = params.get("mode");
    const token = params.get("token");
    if (urlMode === "reset" && token) {
      setMode("reset_token");
      setForm((current) => ({
        ...current,
        token,
      }));
    }
  }, []);

  useEffect(() => {
    if (hydrated && state.session.loggedIn) {
      router.replace("/dashboard");
    }
  }, [hydrated, router, state.session.loggedIn]);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setIsSubmitting(true);

    try {
      if (mode === "register") {
        await register(form);
        router.push("/dashboard");
        return;
      }

      if (mode === "forgot") {
        if (form.password !== form.confirmPassword) {
          throw new Error("Passwords do not match.");
        }
        const result = await requestPasswordReset(form);
        setSuccessMessage(result.message || "Password reset successful.");
        setMode("login");
        setForm((current) => ({
          ...current,
          password: "",
          confirmPassword: "",
        }));
        return;
      }

      if (mode === "reset_token") {
        if (form.password !== form.confirmPassword) {
          throw new Error("Passwords do not match.");
        }
        const result = await confirmPasswordReset({
          token: form.token,
          password: form.password,
        });
        setSuccessMessage(result.message || "Password reset successful.");
        setMode("login");
        setForm((current) => ({
          ...current,
          password: "",
          confirmPassword: "",
          token: "",
        }));
      } else {
        await signIn({
          username: form.username,
          password: form.password,
        });
        router.push("/dashboard");
      }
    } catch (error) {
      setErrorMessage(error.message || "Unable to sign in right now.");
    } finally {
      setIsSubmitting(false);
    }
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
          <h1>Launch premium campaigns with professional controls.</h1>
          <p>
            Create your own PrizePilot account and keep your campaigns isolated
            to your workspace only.
          </p>
          <ul className="hero__proof">
            <li>Username + password login</li>
            <li>Recovery passphrase fallback reset</li>
            <li>Your own private campaign dashboard</li>
            <li>Per-account billing and exports</li>
          </ul>
        </section>

        <section className="auth-panel">
          <form className="auth-form" onSubmit={handleSubmit}>
            <p className="dashboard-card__label">Account access</p>
            <h2>
              {mode === "register"
                ? "Create your organizer workspace."
                : mode === "forgot"
                  ? "Recover your account with passphrase."
                  : mode === "reset_token"
                    ? "Set a new password."
                    : "Sign in to your workspace."}
            </h2>

            <div className="segmented-controls">
              <button
                className={`toggle-button${mode === "register" ? " is-active" : ""}`}
                type="button"
                onClick={() => setMode("register")}
              >
                Create account
              </button>
              <button
                className={`toggle-button${mode === "login" ? " is-active" : ""}`}
                type="button"
                onClick={() => setMode("login")}
              >
                Sign in
              </button>
            </div>

            <label className="studio-field">
              <span>Username</span>
              <input
                value={form.username}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    username: event.target.value,
                  }))
                }
                required
              />
            </label>

            {mode !== "forgot" ? (
              <label className="studio-field">
                <span>{mode === "reset_token" ? "New password" : "Password"}</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  required
                  minLength={10}
                />
              </label>
            ) : null}

            {mode === "reset_token" ? (
              <label className="studio-field">
                <span>Confirm new password</span>
                <input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      confirmPassword: event.target.value,
                    }))
                  }
                  required
                  minLength={10}
                />
              </label>
            ) : null}

            {mode === "forgot" ? (
              <>
                <label className="studio-field">
                  <span>Recovery passphrase</span>
                  <input
                    type="password"
                    value={form.recoveryPassphrase}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        recoveryPassphrase: event.target.value,
                      }))
                    }
                    required
                    minLength={8}
                  />
                </label>
                <label className="studio-field">
                  <span>New password</span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                    required
                    minLength={10}
                  />
                </label>
                <label className="studio-field">
                  <span>Confirm new password</span>
                  <input
                    type="password"
                    value={form.confirmPassword}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        confirmPassword: event.target.value,
                      }))
                    }
                    required
                    minLength={10}
                  />
                </label>
              </>
            ) : null}

            {mode === "register" ? (
              <>
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

                <label className="studio-field">
                  <span>Recovery passphrase</span>
                  <input
                    type="password"
                    value={form.recoveryPassphrase}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        recoveryPassphrase: event.target.value,
                      }))
                    }
                    required
                    minLength={8}
                  />
                </label>
              </>
            ) : null}

            {errorMessage ? <p className="studio-save-message">{errorMessage}</p> : null}
            {successMessage ? <p className="studio-save-message">{successMessage}</p> : null}

            <button className="button" type="submit">
              {isSubmitting
                ? "Working..."
                : mode === "register"
                  ? "Create account"
                  : mode === "forgot"
                    ? "Reset password"
                    : mode === "reset_token"
                      ? "Set new password"
                    : "Enter dashboard"}
            </button>
            {mode === "login" ? (
              <button
                className="button button--ghost"
                type="button"
                onClick={() => setMode("forgot")}
              >
                Forgot password?
              </button>
            ) : null}
            {mode === "forgot" || mode === "reset_token" ? (
              <button
                className="button button--ghost"
                type="button"
                onClick={() => setMode("login")}
              >
                Back to sign in
              </button>
            ) : null}
          </form>
        </section>
      </div>
    </div>
  );
}
