"use client";

import { useEffect, useState } from "react";

const defaultState = {
  session: {
    loggedIn: false,
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
    throw new Error(`Request failed: ${response.status}`);
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

  async function signIn(session) {
    const nextState = await requestJson("/api/session", {
      method: "POST",
      body: JSON.stringify(session),
    });
    setState(nextState);
    return nextState;
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
    signIn,
    signOut,
  };
}
