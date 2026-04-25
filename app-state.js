const PrizePilotStore = (() => {
  const STORAGE_KEY = "prizepilot.app.v1";

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
    campaigns: [
      {
        id: "cmp-detail-001",
        type: "giveaway",
        title: "Win a free full detail",
        prize: "Free premium detailing package",
        audience: "Illinois residents, 18+",
        method: "Random draw from valid free entries",
        status: "live",
        entries: 1248,
        shareRate: "41%",
        duplicates: 37,
        endsOn: "May 31, 2026",
      },
      {
        id: "cmp-gym-002",
        type: "referral",
        title: "Top referrer wins 3 months free",
        prize: "3 free months of membership",
        audience: "Chicago metro members",
        method: "Highest verified referral count wins",
        status: "live",
        entries: 312,
        shareRate: "29 top referrals",
        duplicates: 14,
        endsOn: "June 14, 2026",
      },
      {
        id: "cmp-photo-003",
        type: "contest",
        title: "Best tattoo flash concept",
        prize: "$100 creator bundle",
        audience: "United States residents, 18+",
        method: "Winner selected using published judging criteria",
        status: "review",
        entries: 86,
        shareRate: "4.8 avg score",
        duplicates: 0,
        endsOn: "June 3, 2026",
      },
    ],
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function read() {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return clone(defaultState);
    }

    try {
      return {
        ...clone(defaultState),
        ...JSON.parse(stored),
      };
    } catch {
      return clone(defaultState);
    }
  }

  function write(state) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return state;
  }

  function getState() {
    return read();
  }

  function seed() {
    const state = read();
    write(state);
    return state;
  }

  function setSession(session) {
    const state = read();
    state.session = {
      ...state.session,
      ...session,
      loggedIn: true,
    };
    write(state);
    return state;
  }

  function signOut() {
    const state = read();
    state.session = clone(defaultState.session);
    write(state);
    return state;
  }

  function setPlan(plan) {
    const state = read();
    state.billing.plan = plan;
    state.billing.status = "active";
    write(state);
    return state;
  }

  function saveCampaign(campaign) {
    const state = read();
    const id = campaign.id || `cmp-${Date.now()}`;
    const nextCampaign = {
      id,
      title: campaign.title || "Untitled campaign",
      prize: campaign.prize || "",
      audience: campaign.audience || "",
      method: campaign.method || "",
      type: campaign.type || "giveaway",
      status: campaign.status || "draft",
      entries: Number(campaign.entries || 0),
      shareRate: campaign.shareRate || "0%",
      duplicates: Number(campaign.duplicates || 0),
      endsOn: campaign.endsOn || "TBD",
    };

    const existingIndex = state.campaigns.findIndex((item) => item.id === id);
    if (existingIndex >= 0) {
      state.campaigns[existingIndex] = nextCampaign;
    } else {
      state.campaigns.unshift(nextCampaign);
    }

    write(state);
    return nextCampaign;
  }

  return {
    getState,
    seed,
    saveCampaign,
    setPlan,
    setSession,
    signOut,
  };
})();
