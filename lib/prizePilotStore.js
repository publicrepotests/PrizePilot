import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Pool } from "pg";

const VALID_PLANS = new Set(["starter", "pro", "business"]);
const PRO_PLUS_PLANS = new Set(["pro", "business"]);
const VALID_CAMPAIGN_TYPES = new Set(["giveaway", "contest", "referral", "loyalty"]);
const VALID_CAMPAIGN_STATUS = new Set(["draft", "live", "review", "closed"]);
const VALID_TEAM_ROLES = new Set(["manager", "viewer"]);
const VALID_TRUST_MODES = new Set(["open", "verified", "high_trust", "owned_audience"]);
const VALID_ENTRY_SOURCES = new Set(["public-link", "instagram", "email", "qr", "partner"]);
const DEFAULT_RENEWAL_DATE = "2026-06-01";
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 14);
const RESET_TOKEN_TTL_MINUTES = Number(process.env.RESET_TOKEN_TTL_MINUTES || 30);
const WINNER_PUBLIC_WINDOW_MS = 60 * 60 * 1000;
const USERNAME_PATTERN = /^[a-z0-9._-]{3,24}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IMAGE_DATA_URL_PATTERN = /^data:image\/(png|jpeg|jpg|webp);base64,/i;
const MAX_ENTRY_IMAGE_DATA_URL_CHARS = 1200000;
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "tempmail.com",
  "10minutemail.com",
  "yopmail.com",
  "trashmail.com",
]);

function isProPlusPlan(plan) {
  return PRO_PLUS_PLANS.has(plan);
}

export class StoreError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "StoreError";
    this.status = status;
  }
}

function getDatabaseUrl() {
  return process.env.POSTGRES_URL || process.env.DATABASE_URL || "file:./prisma/dev.db";
}

function isPostgresUrl(url) {
  return /^postgres(ql)?:\/\//i.test(url);
}

function resolveSqlitePath(url) {
  if (!url.startsWith("file:")) {
    throw new Error("Local database URLs must use file: for SQLite.");
  }
  const filePath = url.replace(/^file:/, "");
  return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
}

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeText(value, maxLength = 160) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function normalizeIsoDateTime(value) {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString();
}

function normalizeHttpUrl(value, maxLength = 600) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.length > maxLength) {
    throw new StoreError("Project link is too long.", 400);
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new StoreError("Project link must be a valid URL.", 400);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new StoreError("Project link must start with http:// or https://.", 400);
  }
  return parsed.toString();
}

function normalizeHexColor(value, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) {
    return normalized;
  }
  return fallback;
}

function normalizeCommaList(value, maxItems = 12) {
  const items = String(value || "")
    .split(",")
    .map((item) => normalizeText(item, 60).toLowerCase())
    .filter(Boolean);
  return [...new Set(items)].slice(0, maxItems);
}

function normalizeLineList(value, maxItems = 300) {
  const items = String(value || "")
    .split(/\r?\n|,/)
    .map((item) => normalizeText(item, 140).toLowerCase())
    .filter(Boolean);
  return [...new Set(items)].slice(0, maxItems);
}

function parseLineList(value) {
  return String(value || "")
    .split(/\r?\n|,/)
    .map((item) => normalizeText(item, 140))
    .filter(Boolean);
}

function getEmailDomain(email) {
  const value = normalizeEmail(email);
  return value.includes("@") ? value.split("@")[1] : "";
}

function matchesAudienceAllowlist(email, rawAllowlist) {
  const list = normalizeLineList(rawAllowlist);
  if (list.length === 0) {
    return false;
  }
  const normalizedEmail = normalizeEmail(email);
  const domain = getEmailDomain(normalizedEmail);
  return list.some((item) => {
    if (item.startsWith("@")) {
      return domain === item.slice(1);
    }
    return normalizedEmail === item;
  });
}

function hasCampaignEnded(endsAtIso) {
  if (!endsAtIso) {
    return false;
  }
  const endsAtMs = Date.parse(endsAtIso);
  if (Number.isNaN(endsAtMs)) {
    return false;
  }
  return Date.now() >= endsAtMs;
}

function isClosedCampaignPubliclyVisible(endsAtIso) {
  if (!endsAtIso) {
    return false;
  }
  const endsAtMs = Date.parse(endsAtIso);
  if (Number.isNaN(endsAtMs)) {
    return false;
  }
  return Date.now() <= endsAtMs + WINNER_PUBLIC_WINDOW_MS;
}

function pickRandomItem(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  const index = Math.floor(Math.random() * items.length);
  return items[index] || null;
}

function hashPassword(password) {
  const normalized = String(password || "");
  if (normalized.length < 10) {
    throw new StoreError("Password must be at least 10 characters.", 400);
  }
  if (!/[a-z]/i.test(normalized) || !/[0-9]/.test(normalized)) {
    throw new StoreError("Password must include letters and numbers.", 400);
  }
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(normalized, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) {
    return false;
  }
  const [salt, expectedHex] = storedHash.split(":");
  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(String(password || ""), salt, expected.length);
  return timingSafeEqual(actual, expected);
}

function hashResetToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

function makeSessionToken() {
  return randomUUID();
}

function makeResetToken() {
  return randomBytes(32).toString("hex");
}

function getSessionExpiryIso() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);
  return expiresAt.toISOString();
}

function getResetExpiryIso() {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + RESET_TOKEN_TTL_MINUTES);
  return expiresAt.toISOString();
}

function validateRegisterInput(input) {
  const username = normalizeUsername(input.username);
  const organizerName = normalizeText(input.organizerName, 80);
  const businessName = normalizeText(input.businessName, 120);
  const email = normalizeEmail(input.email);
  const password = String(input.password || "");

  if (!USERNAME_PATTERN.test(username)) {
    throw new StoreError(
      "Username must be 3-24 chars and use lowercase letters, numbers, dot, dash, or underscore.",
      400
    );
  }
  if (!organizerName) {
    throw new StoreError("Organizer name is required.", 400);
  }
  if (!businessName) {
    throw new StoreError("Business name is required.", 400);
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new StoreError("A valid email address is required.", 400);
  }

  return { username, organizerName, businessName, email, password };
}

function validateLoginInput(input) {
  const username = normalizeUsername(input.username);
  const password = String(input.password || "");
  if (!USERNAME_PATTERN.test(username) || !password) {
    throw new StoreError("Username and password are required.", 400);
  }
  return { username, password };
}

function validateResetRequestInput(input) {
  const username = normalizeUsername(input.username);
  const email = normalizeEmail(input.email);
  if (!USERNAME_PATTERN.test(username)) {
    throw new StoreError("Valid username is required.", 400);
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new StoreError("Valid email is required.", 400);
  }
  return { username, email };
}

function validateCampaignInput(campaign) {
  const type = VALID_CAMPAIGN_TYPES.has(campaign?.type) ? campaign.type : "giveaway";
  const status = VALID_CAMPAIGN_STATUS.has(campaign?.status) ? campaign.status : "draft";
  const title = normalizeText(campaign?.title || "Untitled campaign", 120);
  const prize = normalizeText(campaign?.prize, 240);
  const audience = normalizeText(campaign?.audience, 240);
  const method = normalizeText(campaign?.method, 240);
  const endsOn = normalizeText(campaign?.endsOn || "TBD", 40);
  const endsAt = normalizeIsoDateTime(campaign?.endsAt);
  const trustMode = VALID_TRUST_MODES.has(campaign?.trustMode) ? campaign.trustMode : "open";
  const allowedSources = normalizeCommaList(campaign?.allowedSources || "public-link").filter((source) =>
    VALID_ENTRY_SOURCES.has(source)
  );
  const audienceAllowlist = normalizeLineList(campaign?.audienceAllowlist || "");
  const brandName = normalizeText(campaign?.brandName, 120);
  const brandLogoUrl = normalizeText(campaign?.brandLogoUrl, 280);
  const brandPrimary = normalizeHexColor(campaign?.brandPrimary, "#172033");
  const brandAccent = normalizeHexColor(campaign?.brandAccent, "#f06a43");
  const hidePrizePilotBranding = Boolean(campaign?.hidePrizePilotBranding);
  const judgingCriteria = normalizeLineList(campaign?.judgingCriteria || "", 12);

  if (!title) {
    throw new StoreError("Campaign title is required.", 400);
  }

  return {
    type,
    status,
    title,
    prize,
    audience,
    method,
    endsOn,
    endsAt,
    trustMode,
    allowedSources: allowedSources.length > 0 ? allowedSources : ["public-link"],
    audienceAllowlist,
    brandName,
    brandLogoUrl,
    brandPrimary,
    brandAccent,
    hidePrizePilotBranding,
    judgingCriteria,
  };
}

function validateEntrantInput(input) {
  const name = normalizeText(input.name, 120);
  const email = normalizeEmail(input.email);
  const source = normalizeText(input.source || "public-link", 40).toLowerCase();
  const ipHash = normalizeText(input.ipHash || "", 160);
  const submissionTitle = normalizeText(input.submissionTitle || "", 140);
  const projectLink = normalizeHttpUrl(input.projectLink || "", 600);
  const submissionImageData = String(input.submissionImageData || "").trim();
  if (!name) {
    throw new StoreError("Name is required.", 400);
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new StoreError("Valid email is required.", 400);
  }
  if (submissionImageData) {
    if (!IMAGE_DATA_URL_PATTERN.test(submissionImageData)) {
      throw new StoreError("Submission image must be PNG, JPG, or WEBP.", 400);
    }
    if (submissionImageData.length > MAX_ENTRY_IMAGE_DATA_URL_CHARS) {
      throw new StoreError("Submission image is too large after processing. Use a smaller image (max 4MB original file).", 400);
    }
  }
  return { name, email, source, ipHash, submissionTitle, projectLink, submissionImageData };
}

function makeEmptyState() {
  return {
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
      renewalDate: DEFAULT_RENEWAL_DATE,
      cancelAtPeriodEnd: false,
    },
    campaigns: [],
  };
}

function mapCampaign(row) {
  const allowedSources = String(row.allowed_sources ?? row.allowedSources ?? "public-link")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    id: row.id,
    type: row.type,
    title: row.title,
    prize: row.prize,
    audience: row.audience,
    method: row.method,
    status: row.status,
    entries: Number(row.entries || 0),
    shareRate: row.share_rate ?? row.shareRate ?? "0%",
    duplicates: Number(row.duplicates || 0),
    endsOn: row.ends_on ?? row.endsOn ?? "TBD",
    endsAt: row.ends_at ?? row.endsAt ?? "",
    winnerName: row.winner_name ?? row.winnerName ?? "",
    winnerAnnouncedAt: row.winner_announced_at ?? row.winnerAnnouncedAt ?? "",
    trustMode: row.trust_mode ?? row.trustMode ?? "open",
    allowedSources: allowedSources.length > 0 ? allowedSources : ["public-link"],
    audienceAllowlist: row.audience_allowlist ?? row.audienceAllowlist ?? "",
    brandName: row.brand_name ?? row.brandName ?? "",
    brandLogoUrl: row.brand_logo_url ?? row.brandLogoUrl ?? "",
    brandPrimary: row.brand_primary ?? row.brandPrimary ?? "#172033",
    brandAccent: row.brand_accent ?? row.brandAccent ?? "#f06a43",
    hidePrizePilotBranding: Boolean(
      row.hide_prizepilot_branding ?? row.hidePrizePilotBranding ?? false
    ),
    judgingCriteria: parseLineList(row.judging_criteria ?? row.judgingCriteria ?? ""),
  };
}

function getWorkspaceOwnerIdFromUser(user) {
  return user?.workspace_owner_id || user?.workspaceOwnerId || user?.id || "";
}

async function getTeamRoleForUser(backend, workspaceOwnerId, userId) {
  if (!workspaceOwnerId || !userId) {
    return "";
  }
  if (backend === "postgres") {
    const pool = getPgPool();
    const result = await pool.query(
      `
        SELECT role
        FROM team_members
        WHERE workspace_owner_id = $1 AND user_id = $2
        LIMIT 1
      `,
      [workspaceOwnerId, userId]
    );
    return result.rows[0]?.role || "";
  }

  const db = await getSqliteDb();
  const row = db
    .prepare(
      `
      SELECT role
      FROM team_members
      WHERE workspace_owner_id = ? AND user_id = ?
      LIMIT 1
    `
    )
    .get(workspaceOwnerId, userId);
  return row?.role || "";
}

let sqliteReady = false;
let sqliteDb;

async function getSqliteDb() {
  if (sqliteDb) {
    return sqliteDb;
  }

  const dbPath = resolveSqlitePath(getDatabaseUrl());
  await mkdir(path.dirname(dbPath), { recursive: true });
  sqliteDb = new DatabaseSync(dbPath);
  return sqliteDb;
}

async function ensureSqliteStore() {
  if (sqliteReady) {
    return;
  }

  const db = await getSqliteDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      organizer_name TEXT NOT NULL DEFAULT '',
      business_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      workspace_owner_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY,
      workspace_owner_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'manager',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'stripe',
      processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS billings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      plan TEXT NOT NULL DEFAULT 'starter',
      status TEXT NOT NULL DEFAULT 'trialing',
      renewal_date TEXT NOT NULL DEFAULT '2026-06-01',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      prize TEXT NOT NULL,
      audience TEXT NOT NULL,
      method TEXT NOT NULL,
      status TEXT NOT NULL,
      entries INTEGER NOT NULL DEFAULT 0,
      share_rate TEXT NOT NULL DEFAULT '0%',
      duplicates INTEGER NOT NULL DEFAULT 0,
      ends_on TEXT NOT NULL,
      ends_at TEXT NOT NULL DEFAULT '',
      winner_name TEXT NOT NULL DEFAULT '',
      winner_email TEXT NOT NULL DEFAULT '',
      winner_announced_at TEXT,
      trust_mode TEXT NOT NULL DEFAULT 'open',
      allowed_sources TEXT NOT NULL DEFAULT 'public-link',
      audience_allowlist TEXT NOT NULL DEFAULT '',
      workspace_owner_id TEXT NOT NULL DEFAULT '',
      brand_name TEXT NOT NULL DEFAULT '',
      brand_logo_url TEXT NOT NULL DEFAULT '',
      brand_primary TEXT NOT NULL DEFAULT '#172033',
      brand_accent TEXT NOT NULL DEFAULT '#f06a43',
      hide_prizepilot_branding INTEGER NOT NULL DEFAULT 0,
      judging_criteria TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS entrants (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'direct',
      ip_hash TEXT NOT NULL DEFAULT '',
      submission_title TEXT NOT NULL DEFAULT '',
      submission_image_data TEXT NOT NULL DEFAULT '',
      submission_link TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS judging_scores (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      entrant_id TEXT NOT NULL,
      judge_user_id TEXT NOT NULL,
      score REAL NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
    CREATE INDEX IF NOT EXISTS idx_resets_user_id ON password_resets (user_id);
    CREATE INDEX IF NOT EXISTS idx_resets_token_hash ON password_resets (token_hash);
    CREATE INDEX IF NOT EXISTS idx_entrants_campaign_id ON entrants (campaign_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_entrants_campaign_email ON entrants (campaign_id, email);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_judging_unique_vote ON judging_scores (campaign_id, entrant_id, judge_user_id);
  `);

  // Migrations from previous versions.
  try {
    db.exec("ALTER TABLE users ADD COLUMN workspace_owner_id TEXT NOT NULL DEFAULT ''");
  } catch {}
  try {
    db.exec("UPDATE users SET workspace_owner_id = id WHERE workspace_owner_id = '' OR workspace_owner_id IS NULL");
  } catch {}
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_users_workspace_owner_id ON users (workspace_owner_id)");
  } catch {}
  try {
    db.exec(
      "CREATE TABLE IF NOT EXISTS team_members (id TEXT PRIMARY KEY, workspace_owner_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'manager', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    );
  } catch {}
  try {
    db.exec("ALTER TABLE campaigns ADD COLUMN user_id TEXT");
  } catch {}
  try {
    db.exec("ALTER TABLE billings ADD COLUMN user_id TEXT");
  } catch {}
  try {
    db.exec("ALTER TABLE billings ADD COLUMN stripe_customer_id TEXT");
  } catch {}
  try {
    db.exec("ALTER TABLE billings ADD COLUMN stripe_subscription_id TEXT");
  } catch {}
  try {
    db.exec("ALTER TABLE billings ADD COLUMN cancel_at_period_end INTEGER NOT NULL DEFAULT 0");
  } catch {}
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN expires_at TEXT");
  } catch {}
  try {
    db.exec("UPDATE sessions SET expires_at = datetime('now', '+14 days') WHERE expires_at IS NULL");
  } catch {}
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns (user_id)");
  } catch {}
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_billings_user_id ON billings (user_id)");
  } catch {}
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_billings_subscription ON billings (stripe_subscription_id)");
  } catch {}
  try {
    db.exec("ALTER TABLE campaigns ADD COLUMN ends_at TEXT NOT NULL DEFAULT ''");
  } catch {}
  try {
    db.exec("ALTER TABLE campaigns ADD COLUMN winner_name TEXT NOT NULL DEFAULT ''");
  } catch {}
  try {
    db.exec("ALTER TABLE campaigns ADD COLUMN winner_email TEXT NOT NULL DEFAULT ''");
  } catch {}
  try {
    db.exec("ALTER TABLE campaigns ADD COLUMN winner_announced_at TEXT");
  } catch {}
  try {
    db.exec("ALTER TABLE campaigns ADD COLUMN trust_mode TEXT NOT NULL DEFAULT 'open'");
  } catch {}
  try {
    db.exec("ALTER TABLE campaigns ADD COLUMN allowed_sources TEXT NOT NULL DEFAULT 'public-link'");
  } catch {}
  try {
    db.exec("ALTER TABLE campaigns ADD COLUMN audience_allowlist TEXT NOT NULL DEFAULT ''");
  } catch {}
  try {
    db.exec("ALTER TABLE campaigns ADD COLUMN workspace_owner_id TEXT NOT NULL DEFAULT ''");
  } catch {}
  try {
    db.exec(
      "UPDATE campaigns SET workspace_owner_id = user_id WHERE workspace_owner_id = '' OR workspace_owner_id IS NULL"
    );
  } catch {}
  try {
    db.exec("ALTER TABLE campaigns ADD COLUMN brand_name TEXT NOT NULL DEFAULT ''");
  } catch {}
  try {
    db.exec("ALTER TABLE campaigns ADD COLUMN brand_logo_url TEXT NOT NULL DEFAULT ''");
  } catch {}
  try {
    db.exec("ALTER TABLE campaigns ADD COLUMN brand_primary TEXT NOT NULL DEFAULT '#172033'");
  } catch {}
  try {
    db.exec("ALTER TABLE campaigns ADD COLUMN brand_accent TEXT NOT NULL DEFAULT '#f06a43'");
  } catch {}
  try {
    db.exec("ALTER TABLE campaigns ADD COLUMN hide_prizepilot_branding INTEGER NOT NULL DEFAULT 0");
  } catch {}
  try {
    db.exec("ALTER TABLE entrants ADD COLUMN ip_hash TEXT NOT NULL DEFAULT ''");
  } catch {}
  try {
    db.exec("ALTER TABLE entrants ADD COLUMN submission_image_data TEXT NOT NULL DEFAULT ''");
  } catch {}
  try {
    db.exec("ALTER TABLE entrants ADD COLUMN submission_link TEXT NOT NULL DEFAULT ''");
  } catch {}
  try {
    db.exec("ALTER TABLE entrants ADD COLUMN submission_title TEXT NOT NULL DEFAULT ''");
  } catch {}
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_campaigns_status_ends_at ON campaigns (status, ends_at)");
  } catch {}
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_campaigns_workspace_owner_id ON campaigns (workspace_owner_id)");
  } catch {}
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_entrants_campaign_ip_hash ON entrants (campaign_id, ip_hash)");
  } catch {}
  try {
    db.exec("ALTER TABLE campaigns ADD COLUMN judging_criteria TEXT NOT NULL DEFAULT ''");
  } catch {}
  try {
    db.exec(
      "CREATE TABLE IF NOT EXISTS judging_scores (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, entrant_id TEXT NOT NULL, judge_user_id TEXT NOT NULL, score REAL NOT NULL, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    );
  } catch {}
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_judging_unique_vote ON judging_scores (campaign_id, entrant_id, judge_user_id)");
  } catch {}
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_workspace_user ON team_members (workspace_owner_id, user_id)");
  } catch {}

  sqliteReady = true;
}

const globalForPg = globalThis;

function getPgPool() {
  const connectionString = getDatabaseUrl();
  if (!isPostgresUrl(connectionString)) {
    return null;
  }

  if (!globalForPg.prizePilotPgPool) {
    globalForPg.prizePilotPgPool = new Pool({
      connectionString,
      ssl:
        connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
          ? false
          : { rejectUnauthorized: false },
    });
  }
  return globalForPg.prizePilotPgPool;
}

let postgresReady = false;

async function ensurePostgresStore() {
  if (postgresReady) {
    return;
  }

  const pool = getPgPool();
  if (!pool) {
    throw new Error("POSTGRES_URL is not configured.");
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      organizer_name TEXT NOT NULL DEFAULT '',
      business_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      workspace_owner_id TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY,
      workspace_owner_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'manager',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'stripe',
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS billings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      plan TEXT NOT NULL DEFAULT 'starter',
      status TEXT NOT NULL DEFAULT 'trialing',
      renewal_date TEXT NOT NULL DEFAULT '2026-06-01',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      cancel_at_period_end BOOLEAN NOT NULL DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      prize TEXT NOT NULL,
      audience TEXT NOT NULL,
      method TEXT NOT NULL,
      status TEXT NOT NULL,
      entries INTEGER NOT NULL DEFAULT 0,
      share_rate TEXT NOT NULL DEFAULT '0%',
      duplicates INTEGER NOT NULL DEFAULT 0,
      ends_on TEXT NOT NULL,
      ends_at TEXT NOT NULL DEFAULT '',
      winner_name TEXT NOT NULL DEFAULT '',
      winner_email TEXT NOT NULL DEFAULT '',
      winner_announced_at TIMESTAMPTZ,
      trust_mode TEXT NOT NULL DEFAULT 'open',
      allowed_sources TEXT NOT NULL DEFAULT 'public-link',
      audience_allowlist TEXT NOT NULL DEFAULT '',
      workspace_owner_id TEXT NOT NULL DEFAULT '',
      brand_name TEXT NOT NULL DEFAULT '',
      brand_logo_url TEXT NOT NULL DEFAULT '',
      brand_primary TEXT NOT NULL DEFAULT '#172033',
      brand_accent TEXT NOT NULL DEFAULT '#f06a43',
      hide_prizepilot_branding BOOLEAN NOT NULL DEFAULT false,
      judging_criteria TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS entrants (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'direct',
      ip_hash TEXT NOT NULL DEFAULT '',
      submission_title TEXT NOT NULL DEFAULT '',
      submission_image_data TEXT NOT NULL DEFAULT '',
      submission_link TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS judging_scores (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      entrant_id TEXT NOT NULL,
      judge_user_id TEXT NOT NULL,
      score DOUBLE PRECISION NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
    CREATE INDEX IF NOT EXISTS idx_resets_user_id ON password_resets (user_id);
    CREATE INDEX IF NOT EXISTS idx_resets_token_hash ON password_resets (token_hash);
    CREATE INDEX IF NOT EXISTS idx_entrants_campaign_id ON entrants (campaign_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_entrants_campaign_email ON entrants (campaign_id, email);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_judging_unique_vote ON judging_scores (campaign_id, entrant_id, judge_user_id);
  `);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS workspace_owner_id TEXT NOT NULL DEFAULT ''`);
  await pool.query(
    `UPDATE users SET workspace_owner_id = id WHERE workspace_owner_id = '' OR workspace_owner_id IS NULL`
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_workspace_owner_id ON users (workspace_owner_id)`);
  await pool.query(
    `CREATE TABLE IF NOT EXISTS team_members (id TEXT PRIMARY KEY, workspace_owner_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'manager', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`
  );
  await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS user_id TEXT`);
  await pool.query(`ALTER TABLE billings ADD COLUMN IF NOT EXISTS user_id TEXT`);
  await pool.query(`ALTER TABLE billings ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`);
  await pool.query(`ALTER TABLE billings ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT`);
  await pool.query(
    `ALTER TABLE billings ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false`
  );
  await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`);
  await pool.query(
    `UPDATE sessions SET expires_at = NOW() + INTERVAL '14 days' WHERE expires_at IS NULL`
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns (user_id)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_billings_user_id ON billings (user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_billings_subscription ON billings (stripe_subscription_id)`);
  await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ends_at TEXT NOT NULL DEFAULT ''`);
  await pool.query(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS winner_name TEXT NOT NULL DEFAULT ''`
  );
  await pool.query(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS winner_email TEXT NOT NULL DEFAULT ''`
  );
  await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS winner_announced_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS trust_mode TEXT NOT NULL DEFAULT 'open'`);
  await pool.query(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS allowed_sources TEXT NOT NULL DEFAULT 'public-link'`
  );
  await pool.query(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS audience_allowlist TEXT NOT NULL DEFAULT ''`
  );
  await pool.query(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS workspace_owner_id TEXT NOT NULL DEFAULT ''`
  );
  await pool.query(
    `UPDATE campaigns SET workspace_owner_id = user_id WHERE workspace_owner_id = '' OR workspace_owner_id IS NULL`
  );
  await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS brand_name TEXT NOT NULL DEFAULT ''`);
  await pool.query(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS brand_logo_url TEXT NOT NULL DEFAULT ''`
  );
  await pool.query(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS brand_primary TEXT NOT NULL DEFAULT '#172033'`
  );
  await pool.query(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS brand_accent TEXT NOT NULL DEFAULT '#f06a43'`
  );
  await pool.query(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS hide_prizepilot_branding BOOLEAN NOT NULL DEFAULT false`
  );
  await pool.query(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS judging_criteria TEXT NOT NULL DEFAULT ''`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS judging_scores (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, entrant_id TEXT NOT NULL, judge_user_id TEXT NOT NULL, score DOUBLE PRECISION NOT NULL, notes TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`
  );
  await pool.query(`ALTER TABLE entrants ADD COLUMN IF NOT EXISTS ip_hash TEXT NOT NULL DEFAULT ''`);
  await pool.query(
    `ALTER TABLE entrants ADD COLUMN IF NOT EXISTS submission_image_data TEXT NOT NULL DEFAULT ''`
  );
  await pool.query(
    `ALTER TABLE entrants ADD COLUMN IF NOT EXISTS submission_link TEXT NOT NULL DEFAULT ''`
  );
  await pool.query(
    `ALTER TABLE entrants ADD COLUMN IF NOT EXISTS submission_title TEXT NOT NULL DEFAULT ''`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_campaigns_status_ends_at ON campaigns (status, ends_at)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_campaigns_workspace_owner_id ON campaigns (workspace_owner_id)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_entrants_campaign_ip_hash ON entrants (campaign_id, ip_hash)`
  );
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_judging_unique_vote ON judging_scores (campaign_id, entrant_id, judge_user_id)`
  );
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_workspace_user ON team_members (workspace_owner_id, user_id)`
  );

  postgresReady = true;
}

async function ensureStore() {
  const url = getDatabaseUrl();
  if (isPostgresUrl(url)) {
    await ensurePostgresStore();
    return "postgres";
  }
  await ensureSqliteStore();
  return "sqlite";
}

async function ensureBillingRowSqlite(userId) {
  const db = await getSqliteDb();
  db.prepare(`
    INSERT OR IGNORE INTO billings (id, user_id, plan, status, renewal_date)
    VALUES (?, ?, ?, ?, ?)
  `).run(`billing-${userId}`, userId, "starter", "trialing", DEFAULT_RENEWAL_DATE);
}

async function ensureBillingRowPostgres(userId) {
  const pool = getPgPool();
  await pool.query(
    `
      INSERT INTO billings (id, user_id, plan, status, renewal_date)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) DO NOTHING
    `,
    [`billing-${userId}`, userId, "starter", "trialing", DEFAULT_RENEWAL_DATE]
  );
}

async function getSessionUserSqlite(token) {
  const db = await getSqliteDb();
  if (!token) {
    return null;
  }

  db.prepare(`DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now')`).run();
  let row;
  try {
    row = db
      .prepare(`
        SELECT u.id, u.username, u.organizer_name, u.business_name, u.email, u.workspace_owner_id
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')
        LIMIT 1
      `)
      .get(token);
  } catch {
    row = db
      .prepare(`
        SELECT u.id, u.username, u.organizer_name, u.business_name, u.email
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')
        LIMIT 1
      `)
      .get(token);
    if (row) {
      row.workspace_owner_id = row.id;
    }
  }

  return row || null;
}

async function getSessionUserPostgres(token) {
  const pool = getPgPool();
  if (!token) {
    return null;
  }

  await pool.query(`DELETE FROM sessions WHERE expires_at <= NOW()`);
  let result;
  try {
    result = await pool.query(
      `
        SELECT u.id, u.username, u.organizer_name, u.business_name, u.email, u.workspace_owner_id
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = $1 AND s.expires_at > NOW()
        LIMIT 1
      `,
      [token]
    );
  } catch {
    result = await pool.query(
      `
        SELECT u.id, u.username, u.organizer_name, u.business_name, u.email
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = $1 AND s.expires_at > NOW()
        LIMIT 1
      `,
      [token]
    );
    if (result.rows[0]) {
      result.rows[0].workspace_owner_id = result.rows[0].id;
    }
  }
  return result.rows[0] || null;
}

async function readUserStateSqlite(user) {
  const db = await getSqliteDb();
  const workspaceOwnerId = getWorkspaceOwnerIdFromUser(user);
  let billing;
  let campaigns = [];
  try {
    await ensureBillingRowSqlite(workspaceOwnerId);
    billing = db
      .prepare(`
        SELECT plan, status, renewal_date, cancel_at_period_end
        FROM billings
        WHERE user_id = ?
        LIMIT 1
      `)
      .get(workspaceOwnerId);

    campaigns = db
      .prepare(`
        SELECT id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on, ends_at, winner_name, winner_announced_at, trust_mode, allowed_sources, audience_allowlist, brand_name, brand_logo_url, brand_primary, brand_accent, hide_prizepilot_branding, judging_criteria
        FROM campaigns
        WHERE workspace_owner_id = ?
        ORDER BY rowid DESC
      `)
      .all(workspaceOwnerId);
  } catch {
    await ensureBillingRowSqlite(user.id);
    billing = db
      .prepare(`
        SELECT plan, status, renewal_date, cancel_at_period_end
        FROM billings
        WHERE user_id = ?
        LIMIT 1
      `)
      .get(user.id);
    campaigns = db
      .prepare(`
        SELECT id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on, ends_at, winner_name, winner_announced_at, trust_mode, allowed_sources, audience_allowlist, brand_name, brand_logo_url, brand_primary, brand_accent, hide_prizepilot_branding, judging_criteria
        FROM campaigns
        WHERE user_id = ?
        ORDER BY rowid DESC
      `)
      .all(user.id);
  }

  return {
    session: {
      loggedIn: true,
      username: user.username || "",
      organizerName: user.organizer_name || "",
      businessName: user.business_name || "",
      email: user.email || "",
    },
    billing: {
      plan: billing?.plan || "starter",
      status: billing?.status || "trialing",
      renewalDate: billing?.renewal_date || DEFAULT_RENEWAL_DATE,
      cancelAtPeriodEnd: Boolean(billing?.cancel_at_period_end),
    },
    campaigns: campaigns.map(mapCampaign),
  };
}

async function readUserStatePostgres(user) {
  const pool = getPgPool();
  const workspaceOwnerId = getWorkspaceOwnerIdFromUser(user);
  let billing;
  let campaignRows = [];
  try {
    await ensureBillingRowPostgres(workspaceOwnerId);
    const [billingResult, campaignResult] = await Promise.all([
      pool.query(
        `
          SELECT plan, status, renewal_date, cancel_at_period_end
          FROM billings
          WHERE user_id = $1
          LIMIT 1
        `,
        [workspaceOwnerId]
      ),
      pool.query(
        `
          SELECT id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on, ends_at, winner_name, winner_announced_at, trust_mode, allowed_sources, audience_allowlist, brand_name, brand_logo_url, brand_primary, brand_accent, hide_prizepilot_branding, judging_criteria
          FROM campaigns
          WHERE workspace_owner_id = $1
          ORDER BY id DESC
        `,
        [workspaceOwnerId]
      ),
    ]);
    billing = billingResult.rows[0];
    campaignRows = campaignResult.rows;
  } catch {
    await ensureBillingRowPostgres(user.id);
    const [billingResult, campaignResult] = await Promise.all([
      pool.query(
        `
          SELECT plan, status, renewal_date, cancel_at_period_end
          FROM billings
          WHERE user_id = $1
          LIMIT 1
        `,
        [user.id]
      ),
      pool.query(
        `
          SELECT id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on, ends_at, winner_name, winner_announced_at, trust_mode, allowed_sources, audience_allowlist, brand_name, brand_logo_url, brand_primary, brand_accent, hide_prizepilot_branding, judging_criteria
          FROM campaigns
          WHERE user_id = $1
          ORDER BY id DESC
        `,
        [user.id]
      ),
    ]);
    billing = billingResult.rows[0];
    campaignRows = campaignResult.rows;
  }

  return {
    session: {
      loggedIn: true,
      username: user.username || "",
      organizerName: user.organizer_name || "",
      businessName: user.business_name || "",
      email: user.email || "",
    },
    billing: {
      plan: billing?.plan || "starter",
      status: billing?.status || "trialing",
      renewalDate: billing?.renewal_date || DEFAULT_RENEWAL_DATE,
      cancelAtPeriodEnd: Boolean(billing?.cancel_at_period_end),
    },
    campaigns: campaignRows.map(mapCampaign),
  };
}

async function closeCampaignAndPickWinnerSqlite(campaignId, workspaceOwnerId = "") {
  const db = await getSqliteDb();
  const campaign = db
    .prepare(
      `
      SELECT id, user_id, workspace_owner_id, status, ends_at, winner_name, winner_announced_at
      FROM campaigns
      WHERE id = ?
      LIMIT 1
    `
    )
    .get(campaignId);
  if (!campaign) {
    return null;
  }
  if (workspaceOwnerId && campaign.workspace_owner_id !== workspaceOwnerId) {
    return null;
  }

  const needsWinnerSelection =
    (campaign.status === "live" || campaign.status === "closed") && !campaign.winner_name;
  if (needsWinnerSelection) {
    const entrants = db
      .prepare(
        `
        SELECT name, email
        FROM entrants
        WHERE campaign_id = ?
        ORDER BY created_at ASC
      `
      )
      .all(campaignId);
    const winner = pickRandomItem(entrants);
    const winnerName = winner?.name || "No eligible entries";
    const winnerEmail = winner?.email || "";
    const winnerAnnouncedAt = new Date().toISOString();
    db.prepare(
      `
      UPDATE campaigns
      SET status = ?, winner_name = ?, winner_email = ?, winner_announced_at = ?
      WHERE id = ?
    `
    ).run("closed", winnerName, winnerEmail, winnerAnnouncedAt, campaignId);
  } else if (campaign.status === "live") {
    db.prepare(`UPDATE campaigns SET status = ? WHERE id = ?`).run("closed", campaignId);
  }

  return db
    .prepare(
      `
      SELECT id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on, ends_at, winner_name, winner_announced_at, trust_mode, allowed_sources, audience_allowlist, brand_name, brand_logo_url, brand_primary, brand_accent, hide_prizepilot_branding, judging_criteria
      FROM campaigns
      WHERE id = ?
      LIMIT 1
    `
    )
    .get(campaignId);
}

async function closeCampaignAndPickWinnerPostgres(campaignId, workspaceOwnerId = "") {
  const pool = getPgPool();
  const campaignResult = await pool.query(
    `
      SELECT id, user_id, workspace_owner_id, status, ends_at, winner_name, winner_announced_at
      FROM campaigns
      WHERE id = $1
      LIMIT 1
    `,
    [campaignId]
  );
  const campaign = campaignResult.rows[0];
  if (!campaign) {
    return null;
  }
  if (workspaceOwnerId && campaign.workspace_owner_id !== workspaceOwnerId) {
    return null;
  }

  const needsWinnerSelection =
    (campaign.status === "live" || campaign.status === "closed") && !campaign.winner_name;
  if (needsWinnerSelection) {
    const entrantsResult = await pool.query(
      `
        SELECT name, email
        FROM entrants
        WHERE campaign_id = $1
        ORDER BY created_at ASC
      `,
      [campaignId]
    );
    const winner = pickRandomItem(entrantsResult.rows);
    const winnerName = winner?.name || "No eligible entries";
    const winnerEmail = winner?.email || "";
    const winnerAnnouncedAt = new Date().toISOString();
    await pool.query(
      `
        UPDATE campaigns
        SET status = $2, winner_name = $3, winner_email = $4, winner_announced_at = $5
        WHERE id = $1
      `,
      [campaignId, "closed", winnerName, winnerEmail, winnerAnnouncedAt]
    );
  } else if (campaign.status === "live") {
    await pool.query(`UPDATE campaigns SET status = $2 WHERE id = $1`, [campaignId, "closed"]);
  }

  const refreshedResult = await pool.query(
    `
      SELECT id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on, ends_at, winner_name, winner_announced_at, trust_mode, allowed_sources, audience_allowlist, brand_name, brand_logo_url, brand_primary, brand_accent, hide_prizepilot_branding, judging_criteria
      FROM campaigns
      WHERE id = $1
      LIMIT 1
    `,
    [campaignId]
  );
  return refreshedResult.rows[0] || null;
}

async function settleExpiredCampaignsSqlite() {
  const db = await getSqliteDb();
  const rows = db
    .prepare(
      `
      SELECT id
      FROM campaigns
      WHERE status = 'live' AND ends_at != '' AND datetime(ends_at) <= datetime('now')
    `
    )
    .all();
  const processedIds = [];
  for (const row of rows) {
    const updated = await closeCampaignAndPickWinnerSqlite(row.id);
    if (updated?.id) {
      processedIds.push(updated.id);
    }
  }
  return {
    backend: "sqlite",
    processedIds,
    settledCount: processedIds.length,
  };
}

async function settleExpiredCampaignsPostgres() {
  const pool = getPgPool();
  const result = await pool.query(
    `
      SELECT id
      FROM campaigns
      WHERE status = 'live' AND ends_at <> '' AND ends_at::timestamptz <= NOW()
    `
  );
  const processedIds = [];
  for (const row of result.rows) {
    const updated = await closeCampaignAndPickWinnerPostgres(row.id);
    if (updated?.id) {
      processedIds.push(updated.id);
    }
  }
  return {
    backend: "postgres",
    processedIds,
    settledCount: processedIds.length,
  };
}

async function settleExpiredCampaigns() {
  const backend = await ensureStore();
  if (backend === "postgres") {
    return settleExpiredCampaignsPostgres();
  }
  return settleExpiredCampaignsSqlite();
}

async function getDueLiveCampaignCount() {
  const backend = await ensureStore();
  if (backend === "postgres") {
    const pool = getPgPool();
    const result = await pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM campaigns
        WHERE status = 'live' AND ends_at <> '' AND ends_at::timestamptz <= NOW()
      `
    );
    return Number(result.rows[0]?.count || 0);
  }

  const db = await getSqliteDb();
  const row = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM campaigns
      WHERE status = 'live' AND ends_at != '' AND datetime(ends_at) <= datetime('now')
    `
    )
    .get();
  return Number(row?.count || 0);
}

async function getCampaignRevealNamesSqlite(campaignId) {
  const db = await getSqliteDb();
  return db
    .prepare(
      `
      SELECT name
      FROM entrants
      WHERE campaign_id = ?
      ORDER BY created_at DESC
      LIMIT 14
    `
    )
    .all(campaignId)
    .map((row) => row.name)
    .filter(Boolean);
}

async function getCampaignRevealNamesPostgres(campaignId) {
  const pool = getPgPool();
  const result = await pool.query(
    `
      SELECT name
      FROM entrants
      WHERE campaign_id = $1
      ORDER BY created_at DESC
      LIMIT 14
    `,
    [campaignId]
  );
  return result.rows.map((row) => row.name).filter(Boolean);
}

async function getSessionUser(sessionToken) {
  const backend = await ensureStore();
  return backend === "postgres"
    ? getSessionUserPostgres(sessionToken)
    : getSessionUserSqlite(sessionToken);
}

export async function getPublicState(sessionToken) {
  const backend = await ensureStore();
  await settleExpiredCampaigns();
  if (!sessionToken) {
    return makeEmptyState();
  }

  const user =
    backend === "postgres"
      ? await getSessionUserPostgres(sessionToken)
      : await getSessionUserSqlite(sessionToken);

  if (!user) {
    return makeEmptyState();
  }

  return backend === "postgres"
    ? readUserStatePostgres(user)
    : readUserStateSqlite(user);
}

export async function registerOrganizer(input) {
  const backend = await ensureStore();
  const validated = validateRegisterInput(input);
  const userId = `usr-${randomUUID()}`;
  const sessionToken = makeSessionToken();
  const expiresAt = getSessionExpiryIso();
  const passwordHash = hashPassword(validated.password);

  if (backend === "postgres") {
    const pool = getPgPool();
    try {
      await pool.query(
        `
          INSERT INTO users (id, username, password_hash, organizer_name, business_name, email, workspace_owner_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          userId,
          validated.username,
          passwordHash,
          validated.organizerName,
          validated.businessName,
          validated.email,
          userId,
        ]
      );
    } catch (error) {
      if (error?.code === "23505") {
        throw new StoreError("That username is already taken.", 409);
      }
      throw error;
    }

    await pool.query(`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`, [
      sessionToken,
      userId,
      expiresAt,
    ]);
    await ensureBillingRowPostgres(userId);
  } else {
    const db = await getSqliteDb();
    try {
      db.prepare(`
        INSERT INTO users (id, username, password_hash, organizer_name, business_name, email, workspace_owner_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        validated.username,
        passwordHash,
        validated.organizerName,
        validated.businessName,
        validated.email,
        userId
      );
    } catch (error) {
      if (String(error?.message || "").includes("UNIQUE constraint failed: users.username")) {
        throw new StoreError("That username is already taken.", 409);
      }
      throw error;
    }

    db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`).run(
      sessionToken,
      userId,
      expiresAt
    );
    await ensureBillingRowSqlite(userId);
  }

  return {
    token: sessionToken,
    state: await getPublicState(sessionToken),
  };
}

export async function loginOrganizer(input) {
  const backend = await ensureStore();
  const credentials = validateLoginInput(input);

  let user;
  if (backend === "postgres") {
    const pool = getPgPool();
    const result = await pool.query(
      `
        SELECT id, password_hash
        FROM users
        WHERE username = $1
        LIMIT 1
      `,
      [credentials.username]
    );
    user = result.rows[0];
  } else {
    const db = await getSqliteDb();
    user = db
      .prepare(`
        SELECT id, password_hash
        FROM users
        WHERE username = ?
        LIMIT 1
      `)
      .get(credentials.username);
  }

  if (!user || !verifyPassword(credentials.password, user.password_hash)) {
    throw new StoreError("Invalid username or password.", 401);
  }

  const sessionToken = makeSessionToken();
  const expiresAt = getSessionExpiryIso();
  if (backend === "postgres") {
    const pool = getPgPool();
    await pool.query(`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`, [
      sessionToken,
      user.id,
      expiresAt,
    ]);
  } else {
    const db = await getSqliteDb();
    db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`).run(
      sessionToken,
      user.id,
      expiresAt
    );
  }

  return {
    token: sessionToken,
    state: await getPublicState(sessionToken),
  };
}

export async function requestPasswordReset(input, origin) {
  const backend = await ensureStore();
  const validated = validateResetRequestInput(input);
  const safeOrigin = origin?.startsWith("http") ? origin : process.env.NEXT_PUBLIC_APP_URL || "";

  let user;
  if (backend === "postgres") {
    const pool = getPgPool();
    const result = await pool.query(
      `
        SELECT id, email
        FROM users
        WHERE username = $1 AND email = $2
        LIMIT 1
      `,
      [validated.username, validated.email]
    );
    user = result.rows[0];
  } else {
    const db = await getSqliteDb();
    user = db
      .prepare(`
        SELECT id, email
        FROM users
        WHERE username = ? AND email = ?
        LIMIT 1
      `)
      .get(validated.username, validated.email);
  }

  if (!user) {
    // Prevent account enumeration
    return {
      ok: true,
      message: "If the account exists, a password reset link has been sent.",
    };
  }

  const token = makeResetToken();
  const tokenHash = hashResetToken(token);
  const resetId = `rst-${randomUUID()}`;
  const expiresAt = getResetExpiryIso();

  if (backend === "postgres") {
    const pool = getPgPool();
    await pool.query(`DELETE FROM password_resets WHERE expires_at <= NOW() OR used_at IS NOT NULL`);
    await pool.query(
      `
        INSERT INTO password_resets (id, user_id, token_hash, expires_at)
        VALUES ($1, $2, $3, $4)
      `,
      [resetId, user.id, tokenHash, expiresAt]
    );
  } else {
    const db = await getSqliteDb();
    db.prepare(
      `DELETE FROM password_resets WHERE datetime(expires_at) <= datetime('now') OR used_at IS NOT NULL`
    ).run();
    db.prepare(`
      INSERT INTO password_resets (id, user_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(resetId, user.id, tokenHash, expiresAt);
  }

  const resetUrl = `${safeOrigin}/auth?mode=reset&token=${encodeURIComponent(token)}`;
  const response = {
    ok: true,
    message: "If the account exists, a password reset link has been sent.",
    resetUrl,
    deliveryEmail: user.email,
  };
  return response;
}

export async function resetPasswordWithToken(input) {
  const backend = await ensureStore();
  const token = String(input.token || "").trim();
  const newPassword = String(input.password || "");
  if (!token) {
    throw new StoreError("Reset token is required.", 400);
  }
  const tokenHash = hashResetToken(token);
  const passwordHash = hashPassword(newPassword);

  if (backend === "postgres") {
    const pool = getPgPool();
    const tokenResult = await pool.query(
      `
        SELECT id, user_id
        FROM password_resets
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tokenHash]
    );
    const row = tokenResult.rows[0];
    if (!row) {
      throw new StoreError("This reset link is invalid or expired.", 400);
    }

    await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, row.user_id]);
    await pool.query(`UPDATE password_resets SET used_at = NOW() WHERE id = $1`, [row.id]);
    await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [row.user_id]);
  } else {
    const db = await getSqliteDb();
    const row = db
      .prepare(`
        SELECT id, user_id
        FROM password_resets
        WHERE token_hash = ? AND used_at IS NULL AND datetime(expires_at) > datetime('now')
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .get(tokenHash);

    if (!row) {
      throw new StoreError("This reset link is invalid or expired.", 400);
    }

    db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(passwordHash, row.user_id);
    db.prepare(`UPDATE password_resets SET used_at = ? WHERE id = ?`).run(new Date().toISOString(), row.id);
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(row.user_id);
  }

  return {
    ok: true,
    message: "Password reset successful. Please sign in with your new password.",
  };
}

export async function logoutOrganizer(sessionToken) {
  if (!sessionToken) {
    return makeEmptyState();
  }

  const backend = await ensureStore();
  if (backend === "postgres") {
    const pool = getPgPool();
    await pool.query(`DELETE FROM sessions WHERE token = $1`, [sessionToken]);
  } else {
    const db = await getSqliteDb();
    db.prepare(`DELETE FROM sessions WHERE token = ?`).run(sessionToken);
  }

  return makeEmptyState();
}

export async function saveBilling(plan, sessionToken) {
  const access = await getWorkspaceAccess(sessionToken);
  if (!access.isOwner) {
    throw new StoreError("Only workspace owners can update billing.", 403);
  }

  const normalizedPlan = VALID_PLANS.has(plan) ? plan : "starter";
  const workspaceOwnerId = access.workspaceOwnerId;
  const backend = await ensureStore();
  if (backend === "postgres") {
    const pool = getPgPool();
    await pool.query(
      `
        INSERT INTO billings (id, user_id, plan, status, renewal_date, cancel_at_period_end)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id) DO UPDATE SET
          plan = EXCLUDED.plan,
          status = EXCLUDED.status,
          renewal_date = EXCLUDED.renewal_date,
          cancel_at_period_end = EXCLUDED.cancel_at_period_end
      `,
      [
        `billing-${workspaceOwnerId}`,
        workspaceOwnerId,
        normalizedPlan,
        "active",
        DEFAULT_RENEWAL_DATE,
        false,
      ]
    );
  } else {
    const db = await getSqliteDb();
    db.prepare(`
      INSERT INTO billings (id, user_id, plan, status, renewal_date, cancel_at_period_end)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        plan = excluded.plan,
        status = excluded.status,
        renewal_date = excluded.renewal_date,
        cancel_at_period_end = excluded.cancel_at_period_end
    `).run(
      `billing-${workspaceOwnerId}`,
      workspaceOwnerId,
      normalizedPlan,
      "active",
      DEFAULT_RENEWAL_DATE,
      0
    );
  }

  return getPublicState(sessionToken);
}

export async function getBillingSubscriptionInfo(sessionToken) {
  const access = await getWorkspaceAccess(sessionToken);
  if (!access.isOwner) {
    throw new StoreError("Only workspace owners can view billing settings.", 403);
  }
  const backend = await ensureStore();
  const workspaceOwnerId = access.workspaceOwnerId;

  if (backend === "postgres") {
    const pool = getPgPool();
    await ensureBillingRowPostgres(workspaceOwnerId);
    const result = await pool.query(
      `
        SELECT plan, status, renewal_date, cancel_at_period_end, stripe_subscription_id
        FROM billings
        WHERE user_id = $1
        LIMIT 1
      `,
      [workspaceOwnerId]
    );
    const row = result.rows[0] || {};
    return {
      plan: VALID_PLANS.has(row.plan) ? row.plan : "starter",
      status: row.status || "trialing",
      renewalDate: row.renewal_date || DEFAULT_RENEWAL_DATE,
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      stripeSubscriptionId: row.stripe_subscription_id || "",
    };
  }

  const db = await getSqliteDb();
  await ensureBillingRowSqlite(workspaceOwnerId);
  const row =
    db
      .prepare(
        `
      SELECT plan, status, renewal_date, cancel_at_period_end, stripe_subscription_id
      FROM billings
      WHERE user_id = ?
      LIMIT 1
    `
      )
      .get(workspaceOwnerId) || {};

  return {
    plan: VALID_PLANS.has(row.plan) ? row.plan : "starter",
    status: row.status || "trialing",
    renewalDate: row.renewal_date || DEFAULT_RENEWAL_DATE,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    stripeSubscriptionId: row.stripe_subscription_id || "",
  };
}

export async function setBillingCancelAtPeriodEnd(cancelAtPeriodEnd, sessionToken) {
  const access = await getWorkspaceAccess(sessionToken);
  if (!access.isOwner) {
    throw new StoreError("Only workspace owners can update billing.", 403);
  }

  const normalizedCancel = Boolean(cancelAtPeriodEnd);
  const backend = await ensureStore();
  const workspaceOwnerId = access.workspaceOwnerId;

  if (backend === "postgres") {
    const pool = getPgPool();
    await ensureBillingRowPostgres(workspaceOwnerId);
    await pool.query(
      `
        UPDATE billings
        SET cancel_at_period_end = $2,
            status = $3
        WHERE user_id = $1
      `,
      [workspaceOwnerId, normalizedCancel, normalizedCancel ? "canceling" : "active"]
    );
  } else {
    const db = await getSqliteDb();
    await ensureBillingRowSqlite(workspaceOwnerId);
    db.prepare(
      `
      UPDATE billings
      SET cancel_at_period_end = ?,
          status = ?
      WHERE user_id = ?
    `
    ).run(normalizedCancel ? 1 : 0, normalizedCancel ? "canceling" : "active", workspaceOwnerId);
  }

  return getPublicState(sessionToken);
}

export async function syncBillingFromCheckout({
  username,
  plan,
  status,
  renewalDate,
  stripeCustomerId,
  stripeSubscriptionId,
}) {
  const backend = await ensureStore();
  const normalizedUsername = normalizeUsername(username);
  const normalizedPlan = VALID_PLANS.has(plan) ? plan : "starter";
  const normalizedStatus = normalizeText(status || "active", 40) || "active";
  const normalizedRenewalDate = normalizeText(renewalDate || DEFAULT_RENEWAL_DATE, 40);

  if (!normalizedUsername) {
    throw new StoreError("Missing username metadata for checkout sync.", 400);
  }

  let user;
  if (backend === "postgres") {
    const pool = getPgPool();
    const userResult = await pool.query(`SELECT id FROM users WHERE username = $1 LIMIT 1`, [
      normalizedUsername,
    ]);
    user = userResult.rows[0];
    if (!user) {
      throw new StoreError("No user found for checkout sync metadata.", 404);
    }

    await pool.query(
      `
        INSERT INTO billings (
          id, user_id, plan, status, renewal_date, stripe_customer_id, stripe_subscription_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id) DO UPDATE SET
          plan = EXCLUDED.plan,
          status = EXCLUDED.status,
          renewal_date = EXCLUDED.renewal_date,
          stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, billings.stripe_customer_id),
          stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, billings.stripe_subscription_id)
      `,
      [
        `billing-${user.id}`,
        user.id,
        normalizedPlan,
        normalizedStatus,
        normalizedRenewalDate,
        stripeCustomerId || null,
        stripeSubscriptionId || null,
      ]
    );
    return;
  }

  const db = await getSqliteDb();
  user = db
    .prepare(`SELECT id FROM users WHERE username = ? LIMIT 1`)
    .get(normalizedUsername);
  if (!user) {
    throw new StoreError("No user found for checkout sync metadata.", 404);
  }

  db.prepare(`
    INSERT INTO billings (
      id, user_id, plan, status, renewal_date, stripe_customer_id, stripe_subscription_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      plan = excluded.plan,
      status = excluded.status,
      renewal_date = excluded.renewal_date,
      stripe_customer_id = COALESCE(excluded.stripe_customer_id, billings.stripe_customer_id),
      stripe_subscription_id = COALESCE(excluded.stripe_subscription_id, billings.stripe_subscription_id)
  `).run(
    `billing-${user.id}`,
    user.id,
    normalizedPlan,
    normalizedStatus,
    normalizedRenewalDate,
    stripeCustomerId || null,
    stripeSubscriptionId || null
  );
}

export async function syncBillingFromSubscription({
  stripeSubscriptionId,
  status,
  renewalDate,
  cancelAtPeriodEnd,
}) {
  const backend = await ensureStore();
  if (!stripeSubscriptionId) {
    throw new StoreError("Missing subscription ID for sync.", 400);
  }

  const normalizedStatus = normalizeText(status || "active", 40) || "active";
  const normalizedRenewalDate = normalizeText(renewalDate || DEFAULT_RENEWAL_DATE, 40);
  const normalizedCancel = Boolean(cancelAtPeriodEnd);

  if (backend === "postgres") {
    const pool = getPgPool();
    await pool.query(
      `
        UPDATE billings
        SET status = $2, renewal_date = $3, cancel_at_period_end = $4
        WHERE stripe_subscription_id = $1
      `,
      [stripeSubscriptionId, normalizedStatus, normalizedRenewalDate, normalizedCancel]
    );
    return;
  }

  const db = await getSqliteDb();
  db.prepare(`
    UPDATE billings
    SET status = ?, renewal_date = ?, cancel_at_period_end = ?
    WHERE stripe_subscription_id = ?
  `).run(normalizedStatus, normalizedRenewalDate, normalizedCancel ? 1 : 0, stripeSubscriptionId);
}

export async function saveCampaign(campaign, sessionToken) {
  const access = await getWorkspaceAccess(sessionToken);
  if (!access.canManageCampaigns) {
    throw new StoreError("You have view-only access in this workspace.", 403);
  }

  const backend = await ensureStore();
  const workspaceOwnerId = access.workspaceOwnerId;
  const validatedCampaign = validateCampaignInput(campaign);
  const plan = access.billingPlan || "starter";
  const canUseProFeatures = isProPlusPlan(plan);

  if (validatedCampaign.type === "contest" && !canUseProFeatures) {
    throw new StoreError("Skill contests and judging dashboard are available on Pro or Business.", 403);
  }

  const isBrandingCustomized =
    Boolean(validatedCampaign.brandName) ||
    Boolean(validatedCampaign.brandLogoUrl) ||
    validatedCampaign.brandPrimary !== "#172033" ||
    validatedCampaign.brandAccent !== "#f06a43" ||
    validatedCampaign.hidePrizePilotBranding;
  if (isBrandingCustomized && !canUseProFeatures) {
    throw new StoreError("Custom branding is available on Pro or Business.", 403);
  }

  const nextCampaign = {
    id: campaign.id || `cmp-${Date.now()}`,
    entries: 0,
    shareRate: "0%",
    duplicates: 0,
    ...validatedCampaign,
  };

  if (backend === "postgres") {
    const pool = getPgPool();
    await pool.query(
      `
        INSERT INTO campaigns
        (id, user_id, workspace_owner_id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on, ends_at, winner_name, winner_email, winner_announced_at, trust_mode, allowed_sources, audience_allowlist, brand_name, brand_logo_url, brand_primary, brand_accent, hide_prizepilot_branding, judging_criteria)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
      `,
      [
        nextCampaign.id,
        access.user.id,
        workspaceOwnerId,
        nextCampaign.type,
        nextCampaign.title,
        nextCampaign.prize,
        nextCampaign.audience,
        nextCampaign.method,
        nextCampaign.status,
        nextCampaign.entries,
        nextCampaign.shareRate,
        nextCampaign.duplicates,
        nextCampaign.endsOn,
        nextCampaign.endsAt,
        "",
        "",
        null,
        nextCampaign.trustMode,
        nextCampaign.allowedSources.join(","),
        nextCampaign.audienceAllowlist.join("\n"),
        nextCampaign.brandName,
        nextCampaign.brandLogoUrl,
        nextCampaign.brandPrimary,
        nextCampaign.brandAccent,
        nextCampaign.hidePrizePilotBranding,
        nextCampaign.judgingCriteria.join("\n"),
      ]
    );
  } else {
    const db = await getSqliteDb();
    db.prepare(`
      INSERT INTO campaigns
      (id, user_id, workspace_owner_id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on, ends_at, winner_name, winner_email, winner_announced_at, trust_mode, allowed_sources, audience_allowlist, brand_name, brand_logo_url, brand_primary, brand_accent, hide_prizepilot_branding, judging_criteria)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nextCampaign.id,
      access.user.id,
      workspaceOwnerId,
      nextCampaign.type,
      nextCampaign.title,
      nextCampaign.prize,
      nextCampaign.audience,
      nextCampaign.method,
      nextCampaign.status,
      nextCampaign.entries,
      nextCampaign.shareRate,
      nextCampaign.duplicates,
      nextCampaign.endsOn,
      nextCampaign.endsAt,
      "",
      "",
      null,
      nextCampaign.trustMode,
      nextCampaign.allowedSources.join(","),
      nextCampaign.audienceAllowlist.join("\n"),
      nextCampaign.brandName,
      nextCampaign.brandLogoUrl,
      nextCampaign.brandPrimary,
      nextCampaign.brandAccent,
      nextCampaign.hidePrizePilotBranding ? 1 : 0,
      nextCampaign.judgingCriteria.join("\n")
    );
  }

  return nextCampaign;
}

export async function updateCampaignStatus(campaignId, status, sessionToken) {
  const access = await getWorkspaceAccess(sessionToken);
  if (!access.canManageCampaigns) {
    throw new StoreError("You have view-only access in this workspace.", 403);
  }

  const normalizedId = normalizeText(campaignId, 80);
  const normalizedStatus = VALID_CAMPAIGN_STATUS.has(status) ? status : null;
  if (!normalizedId || !normalizedStatus) {
    throw new StoreError("Invalid campaign update request.", 400);
  }

  const backend = await ensureStore();
  const workspaceOwnerId = access.workspaceOwnerId;
  await settleExpiredCampaigns();

  if (normalizedStatus === "closed") {
    const row =
      backend === "postgres"
        ? await closeCampaignAndPickWinnerPostgres(normalizedId, workspaceOwnerId)
        : await closeCampaignAndPickWinnerSqlite(normalizedId, workspaceOwnerId);
    if (!row) {
      throw new StoreError("Campaign not found.", 404);
    }
    return mapCampaign(row);
  }

  if (backend === "postgres") {
    const pool = getPgPool();
    const result = await pool.query(
      `
        UPDATE campaigns
        SET status = $3,
          winner_name = CASE WHEN $3 = 'live' THEN '' ELSE winner_name END,
          winner_email = CASE WHEN $3 = 'live' THEN '' ELSE winner_email END,
          winner_announced_at = CASE WHEN $3 = 'live' THEN NULL ELSE winner_announced_at END
        WHERE id = $1 AND workspace_owner_id = $2
        RETURNING id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on, ends_at, winner_name, winner_announced_at, trust_mode, allowed_sources, audience_allowlist, brand_name, brand_logo_url, brand_primary, brand_accent, hide_prizepilot_branding, judging_criteria
      `,
      [normalizedId, workspaceOwnerId, normalizedStatus]
    );
    const row = result.rows[0];
    if (!row) {
      throw new StoreError("Campaign not found.", 404);
    }
    return mapCampaign(row);
  }

  const db = await getSqliteDb();
  db.prepare(`
    UPDATE campaigns
    SET status = ?,
      winner_name = CASE WHEN ? = 'live' THEN '' ELSE winner_name END,
      winner_email = CASE WHEN ? = 'live' THEN '' ELSE winner_email END,
      winner_announced_at = CASE WHEN ? = 'live' THEN NULL ELSE winner_announced_at END
    WHERE id = ? AND workspace_owner_id = ?
  `).run(
    normalizedStatus,
    normalizedStatus,
    normalizedStatus,
    normalizedStatus,
    normalizedId,
    workspaceOwnerId
  );

  const row = db
    .prepare(`
      SELECT id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on, ends_at, winner_name, winner_announced_at, trust_mode, allowed_sources, audience_allowlist, brand_name, brand_logo_url, brand_primary, brand_accent, hide_prizepilot_branding, judging_criteria
      FROM campaigns
      WHERE id = ? AND workspace_owner_id = ?
      LIMIT 1
    `)
    .get(normalizedId, workspaceOwnerId);

  if (!row) {
    throw new StoreError("Campaign not found.", 404);
  }

  return mapCampaign(row);
}

export async function getPublicCampaignById(campaignId) {
  const backend = await ensureStore();
  await settleExpiredCampaigns();
  const normalizedId = normalizeText(campaignId, 80);
  if (!normalizedId) {
    return null;
  }

  if (backend === "postgres") {
    const pool = getPgPool();
    const result = await pool.query(
      `
        SELECT id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on, ends_at, winner_name, winner_announced_at, trust_mode, allowed_sources, audience_allowlist, brand_name, brand_logo_url, brand_primary, brand_accent, hide_prizepilot_branding, judging_criteria
        FROM campaigns
        WHERE id = $1
        LIMIT 1
      `,
      [normalizedId]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const mapped = mapCampaign(row);
    if (row.status === "live") {
      return {
        ...mapped,
        acceptingEntries: !hasCampaignEnded(mapped.endsAt),
        revealNames: [],
      };
    }
    if (row.status !== "closed" || !isClosedCampaignPubliclyVisible(mapped.endsAt)) {
      return null;
    }
    return {
      ...mapped,
      acceptingEntries: false,
      revealNames: await getCampaignRevealNamesPostgres(normalizedId),
      winner: mapped.winnerName
        ? {
            name: mapped.winnerName,
            announcedAt: mapped.winnerAnnouncedAt,
          }
        : null,
    };
  }

  const db = await getSqliteDb();
  const row = db
    .prepare(
      `
      SELECT id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on, ends_at, winner_name, winner_announced_at, trust_mode, allowed_sources, audience_allowlist, brand_name, brand_logo_url, brand_primary, brand_accent, hide_prizepilot_branding, judging_criteria
      FROM campaigns
      WHERE id = ?
      LIMIT 1
    `
    )
    .get(normalizedId);
  if (!row) {
    return null;
  }

  const mapped = mapCampaign(row);
  if (row.status === "live") {
    return {
      ...mapped,
      acceptingEntries: !hasCampaignEnded(mapped.endsAt),
      revealNames: [],
    };
  }
  if (row.status !== "closed" || !isClosedCampaignPubliclyVisible(mapped.endsAt)) {
    return null;
  }
  return {
    ...mapped,
    acceptingEntries: false,
    revealNames: await getCampaignRevealNamesSqlite(normalizedId),
    winner: mapped.winnerName
      ? {
          name: mapped.winnerName,
          announcedAt: mapped.winnerAnnouncedAt,
        }
      : null,
  };
}

export async function getPublicCampaignSubmissionsById(campaignId) {
  const backend = await ensureStore();
  await settleExpiredCampaigns();
  const normalizedId = normalizeText(campaignId, 80);
  if (!normalizedId) {
    return null;
  }

  if (backend === "postgres") {
    const pool = getPgPool();
    const campaignResult = await pool.query(
      `
        SELECT id, title, type, status, ends_at
        FROM campaigns
        WHERE id = $1
        LIMIT 1
      `,
      [normalizedId]
    );
    const campaign = campaignResult.rows[0];
    if (!campaign) {
      return null;
    }
    const mappedStatus = campaign.status;
    const endsAt = campaign.ends_at || "";
    const isVisible =
      mappedStatus === "live" ||
      (mappedStatus === "closed" && isClosedCampaignPubliclyVisible(endsAt));
    if (!isVisible) {
      return null;
    }

    const submissionsResult = await pool.query(
      `
        SELECT id, name, submission_title, submission_image_data, submission_link, created_at
        FROM entrants
        WHERE campaign_id = $1
          AND (
            submission_title <> ''
            OR submission_image_data <> ''
            OR submission_link <> ''
          )
        ORDER BY created_at DESC
      `,
      [normalizedId]
    );
    return {
      campaign: {
        id: campaign.id,
        title: campaign.title,
        type: campaign.type,
        status: campaign.status,
      },
      submissions: submissionsResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        submissionTitle: row.submission_title || "",
        submissionImageData: row.submission_image_data || "",
        submissionLink: row.submission_link || "",
        createdAt: row.created_at,
      })),
    };
  }

  const db = await getSqliteDb();
  const campaign = db
    .prepare(
      `
      SELECT id, title, type, status, ends_at
      FROM campaigns
      WHERE id = ?
      LIMIT 1
    `
    )
    .get(normalizedId);
  if (!campaign) {
    return null;
  }
  const isVisible =
    campaign.status === "live" ||
    (campaign.status === "closed" && isClosedCampaignPubliclyVisible(campaign.ends_at || ""));
  if (!isVisible) {
    return null;
  }

  const submissions = db
    .prepare(
      `
      SELECT id, name, submission_title, submission_image_data, submission_link, created_at
      FROM entrants
      WHERE campaign_id = ?
        AND (
          submission_title != ''
          OR submission_image_data != ''
          OR submission_link != ''
        )
      ORDER BY created_at DESC
    `
    )
    .all(normalizedId)
    .map((row) => ({
      id: row.id,
      name: row.name,
      submissionTitle: row.submission_title || "",
      submissionImageData: row.submission_image_data || "",
      submissionLink: row.submission_link || "",
      createdAt: row.created_at,
    }));

  return {
    campaign: {
      id: campaign.id,
      title: campaign.title,
      type: campaign.type,
      status: campaign.status,
    },
    submissions,
  };
}

export async function submitCampaignEntry(campaignId, input) {
  const backend = await ensureStore();
  await settleExpiredCampaigns();
  const normalizedId = normalizeText(campaignId, 80);
  const entry = validateEntrantInput(input);
  const entrantId = `ent-${randomUUID()}`;
  const source = VALID_ENTRY_SOURCES.has(entry.source) ? entry.source : "public-link";
  const ipHash = normalizeText(entry.ipHash, 160);

  if (backend === "postgres") {
    const pool = getPgPool();
    const campaignResult = await pool.query(
      `
        SELECT id, user_id, type, status, ends_at, trust_mode, allowed_sources, audience_allowlist
        FROM campaigns
        WHERE id = $1
        LIMIT 1
      `,
      [normalizedId]
    );
    const campaign = campaignResult.rows[0];
    if (!campaign || campaign.status !== "live") {
      throw new StoreError("Campaign is not accepting entries.", 404);
    }
    if (hasCampaignEnded(campaign.ends_at)) {
      await closeCampaignAndPickWinnerPostgres(normalizedId);
      throw new StoreError("Campaign has ended and is no longer accepting entries.", 409);
    }
    const allowedSources = normalizeCommaList(campaign.allowed_sources || "public-link");
    if (!allowedSources.includes(source)) {
      throw new StoreError("Entry source is not approved for this campaign.", 403);
    }
    if (campaign.trust_mode === "verified" || campaign.trust_mode === "high_trust") {
      const domain = getEmailDomain(entry.email);
      if (!domain || DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
        throw new StoreError("Please use a standard email address to enter this campaign.", 400);
      }
    }
    if (campaign.trust_mode === "owned_audience") {
      if (!matchesAudienceAllowlist(entry.email, campaign.audience_allowlist)) {
        throw new StoreError("This campaign is restricted to the organizer's approved audience.", 403);
      }
    }
    if (campaign.trust_mode === "high_trust" && ipHash) {
      const ipCheck = await pool.query(
        `SELECT id FROM entrants WHERE campaign_id = $1 AND ip_hash = $2 LIMIT 1`,
        [normalizedId, ipHash]
      );
      if (ipCheck.rows[0]) {
        throw new StoreError("This device has already submitted an entry for this campaign.", 409);
      }
    }
    if (campaign.type === "contest" && !entry.submissionTitle) {
      throw new StoreError("Contest entries require a title for the work.", 400);
    }
    if (campaign.type === "contest" && !entry.submissionImageData) {
      throw new StoreError("Contest entries require an image upload.", 400);
    }

    const duplicateCheck = await pool.query(
      `SELECT id FROM entrants WHERE campaign_id = $1 AND email = $2 LIMIT 1`,
      [normalizedId, entry.email]
    );
    if (duplicateCheck.rows[0]) {
      await pool.query(`UPDATE campaigns SET duplicates = duplicates + 1 WHERE id = $1`, [normalizedId]);
      throw new StoreError("This email has already entered this campaign.", 409);
    }

    await pool.query(
      `
        INSERT INTO entrants (id, campaign_id, user_id, name, email, source, ip_hash, submission_title, submission_image_data, submission_link)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        entrantId,
        normalizedId,
        campaign.user_id,
        entry.name,
        entry.email,
        source,
        ipHash,
        entry.submissionTitle,
        entry.submissionImageData,
        entry.projectLink,
      ]
    );
    await pool.query(`UPDATE campaigns SET entries = entries + 1 WHERE id = $1`, [normalizedId]);
    return { accepted: true, message: "Entry confirmed. Good luck!" };
  }

  const db = await getSqliteDb();
  const campaign = db
    .prepare(
      `SELECT id, user_id, type, status, ends_at, trust_mode, allowed_sources, audience_allowlist FROM campaigns WHERE id = ? LIMIT 1`
    )
    .get(normalizedId);
  if (!campaign || campaign.status !== "live") {
    throw new StoreError("Campaign is not accepting entries.", 404);
  }
  if (hasCampaignEnded(campaign.ends_at)) {
    await closeCampaignAndPickWinnerSqlite(normalizedId);
    throw new StoreError("Campaign has ended and is no longer accepting entries.", 409);
  }
  const allowedSources = normalizeCommaList(campaign.allowed_sources || "public-link");
  if (!allowedSources.includes(source)) {
    throw new StoreError("Entry source is not approved for this campaign.", 403);
  }
  if (campaign.trust_mode === "verified" || campaign.trust_mode === "high_trust") {
    const domain = getEmailDomain(entry.email);
    if (!domain || DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
      throw new StoreError("Please use a standard email address to enter this campaign.", 400);
    }
  }
  if (campaign.trust_mode === "owned_audience") {
    if (!matchesAudienceAllowlist(entry.email, campaign.audience_allowlist)) {
      throw new StoreError("This campaign is restricted to the organizer's approved audience.", 403);
    }
  }
  if (campaign.trust_mode === "high_trust" && ipHash) {
    const ipDuplicate = db
      .prepare(`SELECT id FROM entrants WHERE campaign_id = ? AND ip_hash = ? LIMIT 1`)
      .get(normalizedId, ipHash);
    if (ipDuplicate) {
      throw new StoreError("This device has already submitted an entry for this campaign.", 409);
    }
  }
  if (campaign.type === "contest" && !entry.submissionTitle) {
    throw new StoreError("Contest entries require a title for the work.", 400);
  }
  if (campaign.type === "contest" && !entry.submissionImageData) {
    throw new StoreError("Contest entries require an image upload.", 400);
  }

  const duplicate = db
    .prepare(`SELECT id FROM entrants WHERE campaign_id = ? AND email = ? LIMIT 1`)
    .get(normalizedId, entry.email);
  if (duplicate) {
    db.prepare(`UPDATE campaigns SET duplicates = duplicates + 1 WHERE id = ?`).run(normalizedId);
    throw new StoreError("This email has already entered this campaign.", 409);
  }

  db.prepare(`
    INSERT INTO entrants (id, campaign_id, user_id, name, email, source, ip_hash, submission_title, submission_image_data, submission_link)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entrantId,
    normalizedId,
    campaign.user_id,
    entry.name,
    entry.email,
    source,
    ipHash,
    entry.submissionTitle,
    entry.submissionImageData,
    entry.projectLink
  );
  db.prepare(`UPDATE campaigns SET entries = entries + 1 WHERE id = ?`).run(normalizedId);
  return { accepted: true, message: "Entry confirmed. Good luck!" };
}

export async function getCampaignEntrants(campaignId, sessionToken) {
  const user = await getSessionUser(sessionToken);
  if (!user) {
    throw new StoreError("You need to sign in to export entrants.", 401);
  }

  const backend = await ensureStore();
  const workspaceOwnerId = getWorkspaceOwnerIdFromUser(user);
  const normalizedId = normalizeText(campaignId, 80);
  if (!normalizedId) {
    throw new StoreError("Campaign id is required.", 400);
  }

  if (backend === "postgres") {
    const pool = getPgPool();
    const campaignResult = await pool.query(
      `SELECT id, title FROM campaigns WHERE id = $1 AND workspace_owner_id = $2 LIMIT 1`,
      [normalizedId, workspaceOwnerId]
    );
    const campaign = campaignResult.rows[0];
    if (!campaign) {
      throw new StoreError("Campaign not found.", 404);
    }
    const entrantsResult = await pool.query(
      `
        SELECT id, name, email, source, created_at, submission_title, submission_image_data, submission_link
        FROM entrants
        WHERE campaign_id = $1
        ORDER BY created_at DESC
      `,
      [normalizedId]
    );
    return {
      campaignTitle: campaign.title,
      entrants: entrantsResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        source: row.source,
        createdAt: row.created_at,
        submissionTitle: row.submission_title || "",
        hasImage: Boolean(row.submission_image_data),
        projectLink: row.submission_link || "",
      })),
    };
  }

  const db = await getSqliteDb();
  const campaign = db
    .prepare(`SELECT id, title FROM campaigns WHERE id = ? AND workspace_owner_id = ? LIMIT 1`)
    .get(normalizedId, workspaceOwnerId);
  if (!campaign) {
    throw new StoreError("Campaign not found.", 404);
  }
  const entrants = db
    .prepare(
      `
      SELECT id, name, email, source, created_at, submission_title, submission_image_data, submission_link
      FROM entrants
      WHERE campaign_id = ?
      ORDER BY created_at DESC
    `
    )
    .all(normalizedId)
    .map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      source: row.source,
      createdAt: row.created_at,
      submissionTitle: row.submission_title || "",
      hasImage: Boolean(row.submission_image_data),
      projectLink: row.submission_link || "",
    }));

  return {
    campaignTitle: campaign.title,
    entrants,
  };
}

function buildOfficialRulesPayload(campaign) {
  const normalizedCampaign = mapCampaign(campaign);
  const nowIso = new Date().toISOString();
  const defaultCriteria =
    normalizedCampaign.type === "contest"
      ? [
          "Originality and creativity",
          "Execution quality",
          "Relevance to campaign theme",
        ]
      : [];
  const criteria =
    Array.isArray(normalizedCampaign.judgingCriteria) && normalizedCampaign.judgingCriteria.length > 0
      ? normalizedCampaign.judgingCriteria
      : defaultCriteria;
  const hasNoPurchaseLanguage =
    normalizedCampaign.type === "giveaway" || normalizedCampaign.type === "referral";

  return {
    campaignId: normalizedCampaign.id,
    type: normalizedCampaign.type,
    title: normalizedCampaign.title,
    generatedAt: nowIso,
    sections: [
      {
        heading: "Eligibility",
        body: `Open to ${normalizedCampaign.audience || "eligible participants as listed by the organizer"}.`,
      },
      {
        heading: "Entry Window",
        body: normalizedCampaign.endsAt
          ? `Entries are accepted until ${normalizedCampaign.endsOn}.`
          : "Entry end timing is listed on the campaign page.",
      },
      {
        heading: "Prize",
        body: normalizedCampaign.prize || "Prize details are listed on the campaign page.",
      },
      {
        heading: "Winner Method",
        body: normalizedCampaign.method || "Winner method is published on the campaign page.",
      },
      ...(criteria.length > 0
        ? [
            {
              heading: "Judging Criteria",
              body: criteria.join(" • "),
            },
          ]
        : []),
      ...(hasNoPurchaseLanguage
        ? [
            {
              heading: "No Purchase Necessary",
              body: "No purchase is necessary to enter or win. Purchase does not increase chance of winning.",
            },
          ]
        : []),
      {
        heading: "Anti-Fraud Policy",
        body:
          "Duplicate, abusive, or ineligible entries may be disqualified at organizer discretion and according to posted campaign controls.",
      },
    ],
  };
}

export async function getCampaignRules(campaignId, sessionToken) {
  const access = await getWorkspaceAccess(sessionToken);
  const backend = await ensureStore();
  const normalizedId = normalizeText(campaignId, 80);
  if (!normalizedId) {
    throw new StoreError("Campaign id is required.", 400);
  }

  if (backend === "postgres") {
    const pool = getPgPool();
    const result = await pool.query(
      `
        SELECT id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on, ends_at, winner_name, winner_announced_at, trust_mode, allowed_sources, audience_allowlist, brand_name, brand_logo_url, brand_primary, brand_accent, hide_prizepilot_branding, judging_criteria
        FROM campaigns
        WHERE id = $1 AND workspace_owner_id = $2
        LIMIT 1
      `,
      [normalizedId, access.workspaceOwnerId]
    );
    const row = result.rows[0];
    if (!row) {
      throw new StoreError("Campaign not found.", 404);
    }
    return buildOfficialRulesPayload(row);
  }

  const db = await getSqliteDb();
  const row = db
    .prepare(
      `
      SELECT id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on, ends_at, winner_name, winner_announced_at, trust_mode, allowed_sources, audience_allowlist, brand_name, brand_logo_url, brand_primary, brand_accent, hide_prizepilot_branding, judging_criteria
      FROM campaigns
      WHERE id = ? AND workspace_owner_id = ?
      LIMIT 1
    `
    )
    .get(normalizedId, access.workspaceOwnerId);
  if (!row) {
    throw new StoreError("Campaign not found.", 404);
  }
  return buildOfficialRulesPayload(row);
}

export async function getPublicCampaignRulesById(campaignId) {
  const backend = await ensureStore();
  await settleExpiredCampaigns();
  const normalizedId = normalizeText(campaignId, 80);
  if (!normalizedId) {
    return null;
  }

  if (backend === "postgres") {
    const pool = getPgPool();
    const result = await pool.query(
      `
        SELECT id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on, ends_at, winner_name, winner_announced_at, trust_mode, allowed_sources, audience_allowlist, brand_name, brand_logo_url, brand_primary, brand_accent, hide_prizepilot_branding, judging_criteria
        FROM campaigns
        WHERE id = $1
        LIMIT 1
      `,
      [normalizedId]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const mapped = mapCampaign(row);
    const isVisible =
      mapped.status === "live" ||
      (mapped.status === "closed" && isClosedCampaignPubliclyVisible(mapped.endsAt));
    if (!isVisible) {
      return null;
    }
    return buildOfficialRulesPayload(row);
  }

  const db = await getSqliteDb();
  const row = db
    .prepare(
      `
      SELECT id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on, ends_at, winner_name, winner_announced_at, trust_mode, allowed_sources, audience_allowlist, brand_name, brand_logo_url, brand_primary, brand_accent, hide_prizepilot_branding, judging_criteria
      FROM campaigns
      WHERE id = ?
      LIMIT 1
    `
    )
    .get(normalizedId);
  if (!row) {
    return null;
  }
  const mapped = mapCampaign(row);
  const isVisible =
    mapped.status === "live" || (mapped.status === "closed" && isClosedCampaignPubliclyVisible(mapped.endsAt));
  if (!isVisible) {
    return null;
  }
  return buildOfficialRulesPayload(row);
}

export async function getContestJudgingBoard(campaignId, sessionToken) {
  const access = await getWorkspaceAccess(sessionToken);
  if (!isProPlusPlan(access.billingPlan || "starter")) {
    throw new StoreError("Judging dashboard access is available on Pro or Business.", 403);
  }
  const backend = await ensureStore();
  const normalizedId = normalizeText(campaignId, 80);
  if (!normalizedId) {
    throw new StoreError("Campaign id is required.", 400);
  }

  if (backend === "postgres") {
    const pool = getPgPool();
    const campaignResult = await pool.query(
      `
        SELECT id, type, title, status, judging_criteria
        FROM campaigns
        WHERE id = $1 AND workspace_owner_id = $2
        LIMIT 1
      `,
      [normalizedId, access.workspaceOwnerId]
    );
    const campaign = campaignResult.rows[0];
    if (!campaign) {
      throw new StoreError("Campaign not found.", 404);
    }
    if (campaign.type !== "contest") {
      throw new StoreError("Judging dashboard is only available for skill contests.", 400);
    }

    const entrantsResult = await pool.query(
      `
        SELECT
          e.id,
          e.name,
          e.email,
          e.source,
          e.created_at,
          e.submission_title,
          e.submission_image_data,
          e.submission_link,
          COALESCE(AVG(js.score), 0) AS avg_score,
          COUNT(js.id)::int AS score_count,
          MAX(CASE WHEN js.judge_user_id = $2 THEN js.score END) AS my_score,
          MAX(CASE WHEN js.judge_user_id = $2 THEN js.notes END) AS my_notes
        FROM entrants e
        LEFT JOIN judging_scores js ON js.entrant_id = e.id AND js.campaign_id = e.campaign_id
        WHERE e.campaign_id = $1
        GROUP BY e.id
        ORDER BY avg_score DESC, score_count DESC, e.created_at ASC
      `,
      [normalizedId, access.user.id]
    );

    return {
      campaign: {
        id: campaign.id,
        title: campaign.title,
        status: campaign.status,
        criteria: parseLineList(campaign.judging_criteria || ""),
      },
      permissions: {
        role: access.role,
        canScore: access.canManageCampaigns,
      },
      entrants: entrantsResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        source: row.source,
        createdAt: row.created_at,
        submissionTitle: row.submission_title || "",
        submissionImageData: row.submission_image_data || "",
        submissionLink: row.submission_link || "",
        averageScore: Number(row.avg_score || 0),
        scoreCount: Number(row.score_count || 0),
        myScore: row.my_score === null || row.my_score === undefined ? null : Number(row.my_score),
        myNotes: row.my_notes || "",
      })),
    };
  }

  const db = await getSqliteDb();
  const campaign = db
    .prepare(
      `
      SELECT id, type, title, status, judging_criteria
      FROM campaigns
      WHERE id = ? AND workspace_owner_id = ?
      LIMIT 1
    `
    )
    .get(normalizedId, access.workspaceOwnerId);
  if (!campaign) {
    throw new StoreError("Campaign not found.", 404);
  }
  if (campaign.type !== "contest") {
    throw new StoreError("Judging dashboard is only available for skill contests.", 400);
  }

  const entrants = db
    .prepare(
      `
      SELECT
        e.id,
        e.name,
        e.email,
        e.source,
        e.created_at,
        e.submission_title,
        e.submission_image_data,
        e.submission_link,
        COALESCE(AVG(js.score), 0) AS avg_score,
        COUNT(js.id) AS score_count,
        MAX(CASE WHEN js.judge_user_id = ? THEN js.score END) AS my_score,
        MAX(CASE WHEN js.judge_user_id = ? THEN js.notes END) AS my_notes
      FROM entrants e
      LEFT JOIN judging_scores js ON js.entrant_id = e.id AND js.campaign_id = e.campaign_id
      WHERE e.campaign_id = ?
      GROUP BY e.id
      ORDER BY avg_score DESC, score_count DESC, e.created_at ASC
    `
    )
    .all(access.user.id, access.user.id, normalizedId);

  return {
    campaign: {
      id: campaign.id,
      title: campaign.title,
      status: campaign.status,
      criteria: parseLineList(campaign.judging_criteria || ""),
    },
    permissions: {
      role: access.role,
      canScore: access.canManageCampaigns,
    },
    entrants: entrants.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      source: row.source,
      createdAt: row.created_at,
      submissionTitle: row.submission_title || "",
      submissionImageData: row.submission_image_data || "",
      submissionLink: row.submission_link || "",
      averageScore: Number(row.avg_score || 0),
      scoreCount: Number(row.score_count || 0),
      myScore: row.my_score === null || row.my_score === undefined ? null : Number(row.my_score),
      myNotes: row.my_notes || "",
    })),
  };
}

export async function submitContestJudgingScore(campaignId, input, sessionToken) {
  const access = await getWorkspaceAccess(sessionToken);
  if (!access.canManageCampaigns) {
    throw new StoreError("You have view-only access in this workspace.", 403);
  }
  if (!isProPlusPlan(access.billingPlan || "starter")) {
    throw new StoreError("Judging dashboard access is available on Pro or Business.", 403);
  }

  const backend = await ensureStore();
  const normalizedId = normalizeText(campaignId, 80);
  const entrantId = normalizeText(input?.entrantId, 120);
  const score = Number(input?.score);
  const notes = normalizeText(input?.notes, 240);
  if (!normalizedId || !entrantId) {
    throw new StoreError("Campaign and entrant are required.", 400);
  }
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new StoreError("Score must be between 0 and 100.", 400);
  }

  if (backend === "postgres") {
    const pool = getPgPool();
    const campaignResult = await pool.query(
      `SELECT id, type FROM campaigns WHERE id = $1 AND workspace_owner_id = $2 LIMIT 1`,
      [normalizedId, access.workspaceOwnerId]
    );
    const campaign = campaignResult.rows[0];
    if (!campaign) {
      throw new StoreError("Campaign not found.", 404);
    }
    if (campaign.type !== "contest") {
      throw new StoreError("Judging dashboard is only available for skill contests.", 400);
    }
    const entrantResult = await pool.query(
      `SELECT id FROM entrants WHERE id = $1 AND campaign_id = $2 LIMIT 1`,
      [entrantId, normalizedId]
    );
    if (!entrantResult.rows[0]) {
      throw new StoreError("Entrant not found for this campaign.", 404);
    }
    await pool.query(
      `
        INSERT INTO judging_scores (id, campaign_id, entrant_id, judge_user_id, score, notes)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (campaign_id, entrant_id, judge_user_id) DO UPDATE SET
          score = EXCLUDED.score,
          notes = EXCLUDED.notes,
          created_at = NOW()
      `,
      [`js-${randomUUID()}`, normalizedId, entrantId, access.user.id, score, notes]
    );
    return getContestJudgingBoard(normalizedId, sessionToken);
  }

  const db = await getSqliteDb();
  const campaign = db
    .prepare(`SELECT id, type FROM campaigns WHERE id = ? AND workspace_owner_id = ? LIMIT 1`)
    .get(normalizedId, access.workspaceOwnerId);
  if (!campaign) {
    throw new StoreError("Campaign not found.", 404);
  }
  if (campaign.type !== "contest") {
    throw new StoreError("Judging dashboard is only available for skill contests.", 400);
  }
  const entrant = db
    .prepare(`SELECT id FROM entrants WHERE id = ? AND campaign_id = ? LIMIT 1`)
    .get(entrantId, normalizedId);
  if (!entrant) {
    throw new StoreError("Entrant not found for this campaign.", 404);
  }
  db.prepare(
    `
    INSERT INTO judging_scores (id, campaign_id, entrant_id, judge_user_id, score, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(campaign_id, entrant_id, judge_user_id) DO UPDATE SET
      score = excluded.score,
      notes = excluded.notes,
      created_at = excluded.created_at
  `
  ).run(`js-${randomUUID()}`, normalizedId, entrantId, access.user.id, score, notes, new Date().toISOString());
  return getContestJudgingBoard(normalizedId, sessionToken);
}

async function getWorkspaceUserContext(sessionToken) {
  const user = await getSessionUser(sessionToken);
  if (!user) {
    throw new StoreError("You need to sign in first.", 401);
  }
  const workspaceOwnerId = getWorkspaceOwnerIdFromUser(user);
  return {
    user,
    workspaceOwnerId,
    isOwner: workspaceOwnerId === user.id,
  };
}

async function getWorkspaceBillingPlan(backend, workspaceOwnerId) {
  if (!workspaceOwnerId) {
    return "starter";
  }

  if (backend === "postgres") {
    await ensureBillingRowPostgres(workspaceOwnerId);
    const pool = getPgPool();
    const result = await pool.query(
      `
        SELECT plan
        FROM billings
        WHERE user_id = $1
        LIMIT 1
      `,
      [workspaceOwnerId]
    );
    const plan = normalizeText(result.rows[0]?.plan || "starter", 20);
    return VALID_PLANS.has(plan) ? plan : "starter";
  }

  await ensureBillingRowSqlite(workspaceOwnerId);
  const db = await getSqliteDb();
  const row = db
    .prepare(
      `
      SELECT plan
      FROM billings
      WHERE user_id = ?
      LIMIT 1
    `
    )
    .get(workspaceOwnerId);
  const plan = normalizeText(row?.plan || "starter", 20);
  return VALID_PLANS.has(plan) ? plan : "starter";
}

async function getWorkspaceAccess(sessionToken) {
  const backend = await ensureStore();
  const context = await getWorkspaceUserContext(sessionToken);
  const billingPlan = await getWorkspaceBillingPlan(backend, context.workspaceOwnerId);
  if (context.isOwner) {
    return {
      ...context,
      role: "owner",
      canManageCampaigns: true,
      billingPlan,
    };
  }

  const role = await getTeamRoleForUser(backend, context.workspaceOwnerId, context.user.id);
  if (!role) {
    throw new StoreError("Your workspace access could not be verified.", 403);
  }
  return {
    ...context,
    role,
    canManageCampaigns: role === "manager",
    billingPlan,
  };
}

export async function getTeamMembers(sessionToken) {
  const { workspaceOwnerId, isOwner } = await getWorkspaceUserContext(sessionToken);
  const backend = await ensureStore();

  if (backend === "postgres") {
    const pool = getPgPool();
    const ownerResult = await pool.query(
      `SELECT id, username, organizer_name, email FROM users WHERE id = $1 LIMIT 1`,
      [workspaceOwnerId]
    );
    const owner = ownerResult.rows[0];
    const membersResult = await pool.query(
      `
        SELECT tm.id, tm.role, u.id AS user_id, u.username, u.organizer_name, u.email
        FROM team_members tm
        JOIN users u ON u.id = tm.user_id
        WHERE tm.workspace_owner_id = $1
        ORDER BY tm.created_at ASC
      `,
      [workspaceOwnerId]
    );
    return {
      isOwner,
      owner: owner
        ? {
            id: owner.id,
            username: owner.username,
            organizerName: owner.organizer_name,
            email: owner.email,
          }
        : null,
      members: membersResult.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        username: row.username,
        organizerName: row.organizer_name,
        email: row.email,
        role: row.role,
      })),
    };
  }

  const db = await getSqliteDb();
  const owner = db
    .prepare(`SELECT id, username, organizer_name, email FROM users WHERE id = ? LIMIT 1`)
    .get(workspaceOwnerId);
  const members = db
    .prepare(
      `
      SELECT tm.id, tm.role, u.id AS user_id, u.username, u.organizer_name, u.email
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.workspace_owner_id = ?
      ORDER BY tm.created_at ASC
    `
    )
    .all(workspaceOwnerId);

  return {
    isOwner,
    owner: owner
      ? {
          id: owner.id,
          username: owner.username,
          organizerName: owner.organizer_name,
          email: owner.email,
        }
      : null,
    members: members.map((row) => ({
      id: row.id,
      userId: row.user_id,
      username: row.username,
      organizerName: row.organizer_name,
      email: row.email,
      role: row.role,
    })),
  };
}

export async function addTeamMember(input, sessionToken) {
  const { user, workspaceOwnerId, isOwner } = await getWorkspaceUserContext(sessionToken);
  if (!isOwner) {
    throw new StoreError("Only workspace owners can add team members.", 403);
  }

  const role = VALID_TEAM_ROLES.has(input?.role) ? input.role : "manager";
  const identifier = normalizeText(input?.usernameOrEmail, 120).toLowerCase();
  if (!identifier) {
    throw new StoreError("Username or email is required.", 400);
  }

  const backend = await ensureStore();

  if (backend === "postgres") {
    const pool = getPgPool();
    const userResult = await pool.query(
      `
        SELECT id, username, email, workspace_owner_id
        FROM users
        WHERE username = $1 OR email = $1
        LIMIT 1
      `,
      [identifier]
    );
    const target = userResult.rows[0];
    if (!target) {
      throw new StoreError("No account found for that username or email.", 404);
    }
    if (target.id === user.id) {
      throw new StoreError("You are already the workspace owner.", 400);
    }
    await pool.query(
      `UPDATE users SET workspace_owner_id = $2 WHERE id = $1`,
      [target.id, workspaceOwnerId]
    );
    await pool.query(`DELETE FROM team_members WHERE user_id = $1 AND workspace_owner_id <> $2`, [
      target.id,
      workspaceOwnerId,
    ]);
    await pool.query(
      `
        INSERT INTO team_members (id, workspace_owner_id, user_id, role)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (workspace_owner_id, user_id) DO UPDATE SET role = EXCLUDED.role
      `,
      [`tm-${randomUUID()}`, workspaceOwnerId, target.id, role]
    );
    return getTeamMembers(sessionToken);
  }

  const db = await getSqliteDb();
  const target = db
    .prepare(
      `
      SELECT id, username, email, workspace_owner_id
      FROM users
      WHERE username = ? OR email = ?
      LIMIT 1
    `
    )
    .get(identifier, identifier);
  if (!target) {
    throw new StoreError("No account found for that username or email.", 404);
  }
  if (target.id === user.id) {
    throw new StoreError("You are already the workspace owner.", 400);
  }
  db.prepare(`UPDATE users SET workspace_owner_id = ? WHERE id = ?`).run(workspaceOwnerId, target.id);
  db.prepare(`DELETE FROM team_members WHERE user_id = ? AND workspace_owner_id <> ?`).run(
    target.id,
    workspaceOwnerId
  );
  db.prepare(
    `
    INSERT INTO team_members (id, workspace_owner_id, user_id, role)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(workspace_owner_id, user_id) DO UPDATE SET role = excluded.role
  `
  ).run(`tm-${randomUUID()}`, workspaceOwnerId, target.id, role);
  return getTeamMembers(sessionToken);
}

export async function updateTeamMemberRole(memberId, role, sessionToken) {
  const { workspaceOwnerId, isOwner } = await getWorkspaceUserContext(sessionToken);
  if (!isOwner) {
    throw new StoreError("Only workspace owners can update roles.", 403);
  }

  const normalizedMemberId = normalizeText(memberId, 120);
  const normalizedRole = VALID_TEAM_ROLES.has(role) ? role : null;
  if (!normalizedMemberId || !normalizedRole) {
    throw new StoreError("Invalid role update request.", 400);
  }

  const backend = await ensureStore();
  if (backend === "postgres") {
    const pool = getPgPool();
    await pool.query(
      `UPDATE team_members SET role = $3 WHERE id = $1 AND workspace_owner_id = $2`,
      [normalizedMemberId, workspaceOwnerId, normalizedRole]
    );
    return getTeamMembers(sessionToken);
  }

  const db = await getSqliteDb();
  db.prepare(`UPDATE team_members SET role = ? WHERE id = ? AND workspace_owner_id = ?`).run(
    normalizedRole,
    normalizedMemberId,
    workspaceOwnerId
  );
  return getTeamMembers(sessionToken);
}

export async function removeTeamMember(memberId, sessionToken) {
  const { workspaceOwnerId, isOwner } = await getWorkspaceUserContext(sessionToken);
  if (!isOwner) {
    throw new StoreError("Only workspace owners can remove members.", 403);
  }
  const normalizedMemberId = normalizeText(memberId, 120);
  if (!normalizedMemberId) {
    throw new StoreError("Member id is required.", 400);
  }

  const backend = await ensureStore();
  if (backend === "postgres") {
    const pool = getPgPool();
    const result = await pool.query(
      `SELECT user_id FROM team_members WHERE id = $1 AND workspace_owner_id = $2 LIMIT 1`,
      [normalizedMemberId, workspaceOwnerId]
    );
    const target = result.rows[0];
    if (target) {
      await pool.query(`DELETE FROM team_members WHERE id = $1 AND workspace_owner_id = $2`, [
        normalizedMemberId,
        workspaceOwnerId,
      ]);
      await pool.query(`UPDATE users SET workspace_owner_id = id WHERE id = $1`, [target.user_id]);
    }
    return getTeamMembers(sessionToken);
  }

  const db = await getSqliteDb();
  const target = db
    .prepare(`SELECT user_id FROM team_members WHERE id = ? AND workspace_owner_id = ? LIMIT 1`)
    .get(normalizedMemberId, workspaceOwnerId);
  if (target) {
    db.prepare(`DELETE FROM team_members WHERE id = ? AND workspace_owner_id = ?`).run(
      normalizedMemberId,
      workspaceOwnerId
    );
    db.prepare(`UPDATE users SET workspace_owner_id = id WHERE id = ?`).run(target.user_id);
  }
  return getTeamMembers(sessionToken);
}

export async function getWorkspaceAnalytics(sessionToken) {
  const { workspaceOwnerId } = await getWorkspaceUserContext(sessionToken);
  const backend = await ensureStore();

  if (backend === "postgres") {
    const pool = getPgPool();
    const [campaignStats, sources, daily] = await Promise.all([
      pool.query(
        `
          SELECT
            COUNT(*)::int AS campaigns,
            COALESCE(SUM(entries), 0)::int AS entries,
            COALESCE(SUM(duplicates), 0)::int AS duplicates
          FROM campaigns
          WHERE workspace_owner_id = $1
        `,
        [workspaceOwnerId]
      ),
      pool.query(
        `
          SELECT e.source, COUNT(*)::int AS count
          FROM entrants e
          JOIN campaigns c ON c.id = e.campaign_id
          WHERE c.workspace_owner_id = $1
          GROUP BY e.source
          ORDER BY count DESC
          LIMIT 8
        `,
        [workspaceOwnerId]
      ),
      pool.query(
        `
          SELECT TO_CHAR(DATE_TRUNC('day', e.created_at), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
          FROM entrants e
          JOIN campaigns c ON c.id = e.campaign_id
          WHERE c.workspace_owner_id = $1
            AND e.created_at >= NOW() - INTERVAL '7 days'
          GROUP BY DATE_TRUNC('day', e.created_at)
          ORDER BY day ASC
        `,
        [workspaceOwnerId]
      ),
    ]);

    const stats = campaignStats.rows[0] || { campaigns: 0, entries: 0, duplicates: 0 };
    const entries = Number(stats.entries || 0);
    const duplicates = Number(stats.duplicates || 0);
    return {
      campaigns: Number(stats.campaigns || 0),
      entries,
      duplicates,
      accepted: Math.max(0, entries - duplicates),
      duplicateRate: entries > 0 ? Math.round((duplicates / entries) * 100) : 0,
      sourceBreakdown: sources.rows.map((row) => ({
        source: row.source,
        count: Number(row.count || 0),
      })),
      dailyEntries: daily.rows.map((row) => ({
        day: row.day,
        count: Number(row.count || 0),
      })),
    };
  }

  const db = await getSqliteDb();
  const stats = db
    .prepare(
      `
      SELECT
        COUNT(*) AS campaigns,
        COALESCE(SUM(entries), 0) AS entries,
        COALESCE(SUM(duplicates), 0) AS duplicates
      FROM campaigns
      WHERE workspace_owner_id = ?
    `
    )
    .get(workspaceOwnerId);
  const sourceBreakdown = db
    .prepare(
      `
      SELECT e.source AS source, COUNT(*) AS count
      FROM entrants e
      JOIN campaigns c ON c.id = e.campaign_id
      WHERE c.workspace_owner_id = ?
      GROUP BY e.source
      ORDER BY count DESC
      LIMIT 8
    `
    )
    .all(workspaceOwnerId);
  const dailyEntries = db
    .prepare(
      `
      SELECT strftime('%Y-%m-%d', e.created_at) AS day, COUNT(*) AS count
      FROM entrants e
      JOIN campaigns c ON c.id = e.campaign_id
      WHERE c.workspace_owner_id = ?
        AND datetime(e.created_at) >= datetime('now', '-7 days')
      GROUP BY strftime('%Y-%m-%d', e.created_at)
      ORDER BY day ASC
    `
    )
    .all(workspaceOwnerId);

  const entries = Number(stats?.entries || 0);
  const duplicates = Number(stats?.duplicates || 0);
  return {
    campaigns: Number(stats?.campaigns || 0),
    entries,
    duplicates,
    accepted: Math.max(0, entries - duplicates),
    duplicateRate: entries > 0 ? Math.round((duplicates / entries) * 100) : 0,
    sourceBreakdown: sourceBreakdown.map((row) => ({
      source: row.source,
      count: Number(row.count || 0),
    })),
    dailyEntries: dailyEntries.map((row) => ({
      day: row.day,
      count: Number(row.count || 0),
    })),
  };
}

export async function markWebhookEventProcessed(eventId, source = "stripe") {
  const backend = await ensureStore();
  const normalizedId = normalizeText(eventId, 120);
  const normalizedSource = normalizeText(source, 40) || "stripe";
  if (!normalizedId) {
    throw new StoreError("Webhook event id is required.", 400);
  }

  if (backend === "postgres") {
    const pool = getPgPool();
    const result = await pool.query(
      `
        INSERT INTO webhook_events (id, source)
        VALUES ($1, $2)
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `,
      [normalizedId, normalizedSource]
    );
    return result.rowCount > 0;
  }

  const db = await getSqliteDb();
  const result = db
    .prepare(
      `
      INSERT OR IGNORE INTO webhook_events (id, source)
      VALUES (?, ?)
    `
    )
    .run(normalizedId, normalizedSource);
  return Number(result.changes || 0) > 0;
}

export async function getStoreHealth() {
  const backend = await ensureStore();
  const dueLiveCampaigns = await getDueLiveCampaignCount();
  return {
    ok: true,
    backend,
    dueLiveCampaigns,
  };
}

export async function settleExpiredCampaignsNow() {
  const summary = await settleExpiredCampaigns();
  return {
    ok: true,
    ...summary,
    settledAt: new Date().toISOString(),
  };
}
