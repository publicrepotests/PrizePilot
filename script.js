const campaignModes = {
  giveaway: {
    title: "Free oil change giveaway",
    description:
      "A random giveaway for a local mechanic collecting emails and bonus shares while clearly showing eligibility, dates, prize value, and winner method.",
    method: "Random draw from valid free entries",
    audience: "Mechanics, boutiques, gyms, restaurants",
    prompt: "“Enter your email for a chance to win.”",
    assets: [
      "Official rules page",
      "Entry form + confirmation email",
      "QR code poster",
      "Winner picker",
    ],
    note:
      "PrizePilot helps collect the details that usually make a giveaway feel trustworthy. For paid entries or tricky jurisdictions, organizers should still get legal review.",
  },
  contest: {
    title: "Best custom 3D print design",
    description:
      "A judged contest for creators and makers where uploads, judging criteria, and scorecards matter more than pure chance.",
    method: "Judged using published score criteria",
    audience: "3D print shops, photographers, creators, schools",
    prompt: "“Submit your best design for a chance to win the filament bundle.”",
    assets: [
      "Submission upload form",
      "Judging dashboard",
      "Criteria score sheet",
      "Winner showcase page",
    ],
    note:
      "Skill-based contests shift the winner logic away from random chance, but organizers still need clear published judging rules and review where needed.",
  },
  referral: {
    title: "Top referrer wins a free detail",
    description:
      "A referral competition that rewards the person who drives the most qualified signups instead of relying on a random draw.",
    method: "Winner chosen by verified referral count",
    audience: "Detailers, gyms, salons, local service businesses",
    prompt: "“Share your link. The top referrer this month wins.”",
    assets: [
      "Referral leaderboard",
      "Share link + QR code",
      "Fraud review queue",
      "Top performer announcement page",
    ],
    note:
      "Performance-based campaigns are easier to explain because there is no chance element, but they still need clear tie-breakers and qualification rules.",
  },
  loyalty: {
    title: "Refer 5 friends, get a free shirt",
    description:
      "A guaranteed reward flow that swaps the drama of a drawing for a more predictable loyalty milestone.",
    method: "Reward unlocks after the required action count",
    audience: "Gyms, studios, local merch brands, restaurants",
    prompt: "“Complete the milestone and unlock the reward.”",
    assets: [
      "Milestone tracker",
      "Reward unlock email",
      "QR code poster",
      "Organizer redemption list",
    ],
    note:
      "Guaranteed rewards avoid random winner selection altogether, which makes them useful for loyalty campaigns and community growth pushes.",
  },
};

const builderFields = {
  title: document.getElementById("builder-title"),
  description: document.getElementById("builder-description"),
  method: document.getElementById("builder-method"),
  audience: document.getElementById("builder-audience"),
  prompt: document.getElementById("builder-prompt"),
  assets: document.getElementById("builder-assets"),
  note: document.getElementById("builder-note"),
};

const modeButtons = document.querySelectorAll("[data-mode]");

function renderMode(mode) {
  const config = campaignModes[mode];
  if (!config) {
    return;
  }

  builderFields.title.textContent = config.title;
  builderFields.description.textContent = config.description;
  builderFields.method.textContent = config.method;
  builderFields.audience.textContent = config.audience;
  builderFields.prompt.textContent = config.prompt;
  builderFields.note.textContent = config.note;
  builderFields.assets.innerHTML = "";

  config.assets.forEach((asset) => {
    const item = document.createElement("li");
    item.textContent = asset;
    builderFields.assets.appendChild(item);
  });

  modeButtons.forEach((button) => {
    const isActive = button.dataset.mode === mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

modeButtons.forEach((button) => {
  button.addEventListener("click", () => renderMode(button.dataset.mode));
});

const priceToggles = document.querySelectorAll("[data-price-view]");
const priceGrids = document.querySelectorAll("[data-price-grid]");

priceToggles.forEach((button) => {
  button.setAttribute(
    "aria-pressed",
    String(button.classList.contains("is-active"))
  );
});

priceToggles.forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.priceView;

    priceToggles.forEach((toggle) => {
      const isActive = toggle === button;
      toggle.classList.toggle("is-active", isActive);
      toggle.setAttribute("aria-pressed", String(isActive));
    });

    priceGrids.forEach((grid) => {
      grid.classList.toggle("is-hidden", grid.dataset.priceGrid !== view);
    });
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
      threshold: 0.18,
    }
  );

  revealNodes.forEach((node, index) => {
    node.style.transitionDelay = `${Math.min(index * 55, 280)}ms`;
    revealObserver.observe(node);
  });
} else {
  revealNodes.forEach((node) => {
    node.classList.add("is-visible");
  });
}

renderMode("giveaway");
