"use client";

import { useEffect, useState } from "react";

const defaultState = {
  session: {
    loggedIn: false,
    username: "",
    organizerName: "",
    businessName: "",
    email: "",
  },
  billing: {
    plan: "starter",
    status: "trialing",
    renewalDate: "2026-06-01",
  },
  campaigns: [],
};

async function requestJson(url, options) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.error) {
        message = payload.error;
      }
    } catch {}
    throw new Error(message);
  }

  return response.json();
}

export function usePrizePilotStore() {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState(defaultState);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const nextState = await requestJson("/api/session");
        if (!cancelled) {
          setState(nextState);
        }
      } catch (error) {
        console.error("Failed to load session state:", error);
      } finally {
        if (!cancelled) {
          setHydrated(true);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function register(account) {
    const nextState = await requestJson("/api/session", {
      method: "POST",
      body: JSON.stringify({
        mode: "register",
        username: account.username,
        password: account.password,
        organizerName: account.organizerName,
        businessName: account.businessName,
        email: account.email,
      }),
    });
    setState(nextState);
    return nextState;
  }

  async function signIn(credentials) {
    const nextState = await requestJson("/api/session", {
      method: "POST",
      body: JSON.stringify({
        mode: "login",
        username: credentials.username,
        password: credentials.password,
      }),
    });
    setState(nextState);
    return nextState;
  }

  async function requestPasswordReset(account) {
    return requestJson("/api/session", {
      method: "POST",
      body: JSON.stringify({
        mode: "reset_request",
        username: account.username,
        email: account.email,
      }),
    });
  }

  async function confirmPasswordReset(account) {
    return requestJson("/api/session", {
      method: "POST",
      body: JSON.stringify({
        mode: "reset_confirm",
        token: account.token,
        password: account.password,
      }),
    });
  }

  async function signOut() {
    const nextState = await requestJson("/api/session", {
      method: "DELETE",
    });
    setState(nextState);
    return nextState;
  }

  async function setPlan(plan) {
    const nextState = await requestJson("/api/billing", {
      method: "PATCH",
      body: JSON.stringify({ plan }),
    });
    setState(nextState);
    return nextState;
  }

  async function saveCampaign(campaign) {
    const savedCampaign = await requestJson("/api/campaigns", {
      method: "POST",
      body: JSON.stringify(campaign),
    });
    setState((current) => ({
      ...current,
      campaigns: [savedCampaign, ...current.campaigns],
    }));
    return savedCampaign;
  }

  return {
    hydrated,
    state,
    saveCampaign,
    setPlan,
    confirmPasswordReset,
    register,
    requestPasswordReset,
    signIn,
    signOut,
  };
}
