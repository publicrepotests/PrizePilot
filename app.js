if (window.PrizePilotStore) {
  window.PrizePilotStore.seed();
}

const dashboardFilters = document.querySelectorAll("[data-dashboard-filter]");
let campaignRows = document.querySelectorAll(".campaign-row");

const planNames = {
  starter: "Starter",
  pro: "Pro",
  business: "Business",
};

const planCopy = {
  starter: "Great for local shops running a few campaigns each month.",
  pro: "Unlimited campaigns, branding controls, and judging dashboard access.",
  business: "Team access, analytics, exports, and branded campaign ops.",
};

function getState() {
  return window.PrizePilotStore ? window.PrizePilotStore.getState() : null;
}

function redirectIfSignedOut() {
  const state = getState();
  if (!state) {
    return;
  }

  const needsAuthPage =
    document.body.classList.contains("app-body") &&
    !window.location.pathname.endsWith("auth.html");

  if (needsAuthPage && !state.session.loggedIn) {
    window.location.href = "auth.html";
  }
}

redirectIfSignedOut();

function renderCampaignRows(filter = "all") {
  const list = document.getElementById("campaign-list");
  const state = getState();
  if (!list || !state) {
    return;
  }

  list.innerHTML = "";
  state.campaigns
    .filter((campaign) => filter === "all" || campaign.type === filter)
    .forEach((campaign) => {
      const row = document.createElement("article");
      row.className = "campaign-row";
      row.dataset.kind = campaign.type;

      const statusClass =
        campaign.status === "review"
          ? "status-pill status-pill--alt"
          : campaign.status === "closed"
            ? "status-pill status-pill--muted"
            : "status-pill";

      row.innerHTML = `
        <div>
          <p class="dashboard-card__label">${campaign.type}</p>
          <h3>${campaign.title}</h3>
          <p>${campaign.audience}</p>
        </div>
        <div>
          <strong>${campaign.entries} entries</strong>
          <p>Ends ${campaign.endsOn}</p>
        </div>
        <div>
          <strong>${campaign.shareRate} share rate</strong>
          <p>${campaign.duplicates} checks or duplicates</p>
        </div>
        <span class="${statusClass}">${campaign.status}</span>
      `;

      list.appendChild(row);
    });

  campaignRows = document.querySelectorAll(".campaign-row");
}

function hydrateDashboardHeader() {
  const state = getState();
  if (!state) {
    return;
  }

  const welcome = document.getElementById("dashboard-welcome");
  const planName = document.getElementById("sidebar-plan-name");
  const planText = document.getElementById("sidebar-plan-copy");

  if (welcome) {
    welcome.textContent = `${state.session.organizerName || "Organizer"}, ${state.session.businessName || "your workspace"} is ready.`;
  }

  if (planName) {
    planName.textContent = planNames[state.billing.plan] || "Starter";
  }

  if (planText) {
    planText.textContent = planCopy[state.billing.plan] || planCopy.starter;
  }
}

dashboardFilters.forEach((button) => {
  button.setAttribute(
    "aria-pressed",
    String(button.classList.contains("is-active"))
  );

  button.addEventListener("click", () => {
    const filter = button.dataset.dashboardFilter;

    dashboardFilters.forEach((toggle) => {
      const isActive = toggle === button;
      toggle.classList.toggle("is-active", isActive);
      toggle.setAttribute("aria-pressed", String(isActive));
    });

    renderCampaignRows(filter);
  });
});

renderCampaignRows();
hydrateDashboardHeader();

const authForm = document.getElementById("auth-form");
if (authForm && window.PrizePilotStore) {
  authForm.addEventListener("submit", (event) => {
    event.preventDefault();

    window.PrizePilotStore.setSession({
      organizerName: document.getElementById("auth-name").value,
      businessName: document.getElementById("auth-business").value,
      email: document.getElementById("auth-email").value,
    });

    window.location.href = "dashboard.html";
  });
}

const signOutButton = document.getElementById("sign-out-button");
if (signOutButton && window.PrizePilotStore) {
  signOutButton.addEventListener("click", () => {
    window.PrizePilotStore.signOut();
    window.location.href = "auth.html";
  });
}

const studioType = document.getElementById("studio-type");
const studioTitle = document.getElementById("studio-title");
const studioPrize = document.getElementById("studio-prize");
const studioRegion = document.getElementById("studio-region");
const studioMethod = document.getElementById("studio-method");
const studioEndDate = document.getElementById("studio-end-date");
const previewTitle = document.getElementById("preview-title");
const previewRules = document.getElementById("preview-rules");
const landingPreviewTitle = document.getElementById("landing-preview-title");
const saveCampaignButton = document.getElementById("save-campaign-button");
const studioSaveMessage = document.getElementById("studio-save-message");

const studioPresets = {
  giveaway: {
    title: "Free-entry giveaway rules",
    prize: "Free premium detailing package",
    region: "Illinois residents, 18+",
    method: "Random draw from valid free entries",
  },
  contest: {
    title: "Skill contest rules",
    prize: "$100 creator bundle",
    region: "United States residents, 18+",
    method: "Winner selected using published judging criteria",
  },
  referral: {
    title: "Referral challenge rules",
    prize: "3 free months of membership",
    region: "Local customers in the Chicago metro",
    method: "Highest verified referral count wins",
  },
  loyalty: {
    title: "Loyalty reward terms",
    prize: "Free branded t-shirt",
    region: "Existing members and new signups",
    method: "Reward unlocks after completing the required milestone",
  },
};

function updateRulesPreview() {
  if (!previewRules || !previewTitle) {
    return;
  }

  previewTitle.textContent = studioPresets[studioType?.value || "giveaway"].title;
  previewRules.innerHTML = "";
  if (landingPreviewTitle && studioTitle) {
    landingPreviewTitle.textContent = studioTitle.value || "Untitled campaign";
  }

  [
    "No purchase is necessary to enter or win.",
    `Prize: ${studioPrize?.value || ""}.`,
    `Eligibility: ${studioRegion?.value || ""}.`,
    `Winner method: ${studioMethod?.value || ""}.`,
  ].forEach((line) => {
    const item = document.createElement("li");
    item.textContent = line;
    previewRules.appendChild(item);
  });
}

if (studioType && studioPrize && studioRegion && studioMethod && studioTitle) {
  studioType.addEventListener("change", () => {
    const preset = studioPresets[studioType.value];
    studioTitle.value =
      studioType.value === "giveaway"
        ? "Win a free full detail"
        : studioType.value === "contest"
          ? "Best custom 3D print design"
          : studioType.value === "referral"
            ? "Top referrer wins 3 months free"
            : "Refer 5 friends, get a free shirt";
    studioPrize.value = preset.prize;
    studioRegion.value = preset.region;
    studioMethod.value = preset.method;
    updateRulesPreview();
  });

  [studioTitle, studioPrize, studioRegion, studioMethod].forEach((field) => {
    field.addEventListener("input", updateRulesPreview);
  });

  updateRulesPreview();
}

if (saveCampaignButton && window.PrizePilotStore) {
  saveCampaignButton.addEventListener("click", () => {
    const saved = window.PrizePilotStore.saveCampaign({
      title: studioTitle.value,
      prize: studioPrize.value,
      audience: studioRegion.value,
      method: studioMethod.value,
      type: studioType.value,
      status: "draft",
      entries: 0,
      shareRate: "0%",
      duplicates: 0,
      endsOn: studioEndDate ? studioEndDate.value : "TBD",
    });

    if (studioSaveMessage) {
      studioSaveMessage.textContent = `${saved.title} was saved to your dashboard.`;
    }
  });
}

const studioViewButtons = document.querySelectorAll("[data-studio-view]");
const studioPanels = document.querySelectorAll("[data-studio-panel]");

studioViewButtons.forEach((button) => {
  button.setAttribute(
    "aria-pressed",
    String(button.classList.contains("is-active"))
  );

  button.addEventListener("click", () => {
    const view = button.dataset.studioView;

    studioViewButtons.forEach((toggle) => {
      const isActive = toggle === button;
      toggle.classList.toggle("is-active", isActive);
      toggle.setAttribute("aria-pressed", String(isActive));
    });

    studioPanels.forEach((panel) => {
      panel.classList.toggle("is-hidden", panel.dataset.studioPanel !== view);
    });
  });
});

const currentPlanName = document.getElementById("current-plan-name");
const currentRenewal = document.getElementById("current-renewal");
const billingContact = document.getElementById("billing-contact");
const billingStatus = document.getElementById("billing-status");
const billingCheckout = document.getElementById("billing-checkout");
const planButtons = document.querySelectorAll(".plan-button");

function hydrateBilling() {
  const state = getState();
  if (!state) {
    return;
  }

  if (currentPlanName) {
    currentPlanName.textContent = planNames[state.billing.plan] || "Starter";
  }
  if (currentRenewal) {
    currentRenewal.textContent = state.billing.renewalDate;
  }
  if (billingContact) {
    billingContact.textContent = state.session.email || "owner@example.com";
  }
  if (billingStatus) {
    billingStatus.textContent = state.billing.status;
  }
}

hydrateBilling();

planButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const plan = button.dataset.plan;
    if (!window.PrizePilotStore || !plan) {
      return;
    }

    window.PrizePilotStore.setPlan(plan);
    hydrateBilling();

    if (billingCheckout) {
      billingCheckout.innerHTML = `
        <strong>Stripe checkout simulated:</strong>
        ${planNames[plan]} selected successfully. Organizer billing is now marked active in local storage.
      `;
    }
  });
});

const revealNodes = document.querySelectorAll("[data-reveal]");

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.15,
    }
  );

  revealNodes.forEach((node, index) => {
    node.style.transitionDelay = `${Math.min(index * 45, 240)}ms`;
    revealObserver.observe(node);
  });
} else {
  revealNodes.forEach((node) => {
    node.classList.add("is-visible");
  });
}
