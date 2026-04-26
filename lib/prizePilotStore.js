import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Pool } from "pg";

const VALID_PLANS = new Set(["starter", "pro", "business"]);
const VALID_CAMPAIGN_TYPES = new Set(["giveaway", "contest", "referral", "loyalty"]);
const VALID_CAMPAIGN_STATUS = new Set(["draft", "live", "review", "closed"]);
const DEFAULT_RENEWAL_DATE = "2026-06-01";
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 14);
const RESET_TOKEN_TTL_MINUTES = Number(process.env.RESET_TOKEN_TTL_MINUTES || 30);
const USERNAME_PATTERN = /^[a-z0-9._-]{3,24}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  if (!title) {
    throw new StoreError("Campaign title is required.", 400);
  }

  return { type, status, title, prize, audience, method, endsOn };
}

function validateEntrantInput(input) {
  const name = normalizeText(input.name, 120);
  const email = normalizeEmail(input.email);
  if (!name) {
    throw new StoreError("Name is required.", 400);
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new StoreError("Valid email is required.", 400);
  }
  return { name, email };
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
  };
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
      ends_on TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS entrants (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'direct',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
    CREATE INDEX IF NOT EXISTS idx_resets_user_id ON password_resets (user_id);
    CREATE INDEX IF NOT EXISTS idx_resets_token_hash ON password_resets (token_hash);
    CREATE INDEX IF NOT EXISTS idx_entrants_campaign_id ON entrants (campaign_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_entrants_campaign_email ON entrants (campaign_id, email);
  `);

  // Migrations from previous versions.
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
      ends_on TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS entrants (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'direct',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
    CREATE INDEX IF NOT EXISTS idx_resets_user_id ON password_resets (user_id);
    CREATE INDEX IF NOT EXISTS idx_resets_token_hash ON password_resets (token_hash);
    CREATE INDEX IF NOT EXISTS idx_entrants_campaign_id ON entrants (campaign_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_entrants_campaign_email ON entrants (campaign_id, email);
  `);

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
  const row = db
    .prepare(`
      SELECT u.id, u.username, u.organizer_name, u.business_name, u.email
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')
      LIMIT 1
    `)
    .get(token);

  return row || null;
}

async function getSessionUserPostgres(token) {
  const pool = getPgPool();
  if (!token) {
    return null;
  }

  await pool.query(`DELETE FROM sessions WHERE expires_at <= NOW()`);
  const result = await pool.query(
    `
      SELECT u.id, u.username, u.organizer_name, u.business_name, u.email
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > NOW()
      LIMIT 1
    `,
    [token]
  );
  return result.rows[0] || null;
}

async function readUserStateSqlite(user) {
  const db = await getSqliteDb();
  await ensureBillingRowSqlite(user.id);

  const billing = db
    .prepare(`
      SELECT plan, status, renewal_date, cancel_at_period_end
      FROM billings
      WHERE user_id = ?
      LIMIT 1
    `)
    .get(user.id);

  const campaigns = db
    .prepare(`
      SELECT id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on
      FROM campaigns
      WHERE user_id = ?
      ORDER BY rowid DESC
    `)
    .all(user.id);

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
        SELECT id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on
        FROM campaigns
        WHERE user_id = $1
        ORDER BY id DESC
      `,
      [user.id]
    ),
  ]);

  const billing = billingResult.rows[0];
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
    campaigns: campaignResult.rows.map(mapCampaign),
  };
}

async function getSessionUser(sessionToken) {
  const backend = await ensureStore();
  return backend === "postgres"
    ? getSessionUserPostgres(sessionToken)
    : getSessionUserSqlite(sessionToken);
}

export async function getPublicState(sessionToken) {
  const backend = await ensureStore();
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
          INSERT INTO users (id, username, password_hash, organizer_name, business_name, email)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          userId,
          validated.username,
          passwordHash,
          validated.organizerName,
          validated.businessName,
          validated.email,
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
        INSERT INTO users (id, username, password_hash, organizer_name, business_name, email)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        validated.username,
        passwordHash,
        validated.organizerName,
        validated.businessName,
        validated.email
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
  const user = await getSessionUser(sessionToken);
  if (!user) {
    throw new StoreError("You need to sign in to update billing.", 401);
  }

  const normalizedPlan = VALID_PLANS.has(plan) ? plan : "starter";
  const backend = await ensureStore();
  if (backend === "postgres") {
    const pool = getPgPool();
    await pool.query(
      `
        INSERT INTO billings (id, user_id, plan, status, renewal_date)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id) DO UPDATE SET
          plan = EXCLUDED.plan,
          status = EXCLUDED.status,
          renewal_date = EXCLUDED.renewal_date
      `,
      [`billing-${user.id}`, user.id, normalizedPlan, "active", DEFAULT_RENEWAL_DATE]
    );
  } else {
    const db = await getSqliteDb();
    db.prepare(`
      INSERT INTO billings (id, user_id, plan, status, renewal_date)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        plan = excluded.plan,
        status = excluded.status,
        renewal_date = excluded.renewal_date
    `).run(`billing-${user.id}`, user.id, normalizedPlan, "active", DEFAULT_RENEWAL_DATE);
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
  const user = await getSessionUser(sessionToken);
  if (!user) {
    throw new StoreError("You need to sign in to save campaigns.", 401);
  }

  const backend = await ensureStore();
  const validatedCampaign = validateCampaignInput(campaign);
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
        (id, user_id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `,
      [
        nextCampaign.id,
        user.id,
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
      ]
    );
  } else {
    const db = await getSqliteDb();
    db.prepare(`
      INSERT INTO campaigns
      (id, user_id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nextCampaign.id,
      user.id,
      nextCampaign.type,
      nextCampaign.title,
      nextCampaign.prize,
      nextCampaign.audience,
      nextCampaign.method,
      nextCampaign.status,
      nextCampaign.entries,
      nextCampaign.shareRate,
      nextCampaign.duplicates,
      nextCampaign.endsOn
    );
  }

  return nextCampaign;
}

export async function updateCampaignStatus(campaignId, status, sessionToken) {
  const user = await getSessionUser(sessionToken);
  if (!user) {
    throw new StoreError("You need to sign in to update campaigns.", 401);
  }

  const normalizedId = normalizeText(campaignId, 80);
  const normalizedStatus = VALID_CAMPAIGN_STATUS.has(status) ? status : null;
  if (!normalizedId || !normalizedStatus) {
    throw new StoreError("Invalid campaign update request.", 400);
  }

  const backend = await ensureStore();
  if (backend === "postgres") {
    const pool = getPgPool();
    const result = await pool.query(
      `
        UPDATE campaigns
        SET status = $3
        WHERE id = $1 AND user_id = $2
        RETURNING id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on
      `,
      [normalizedId, user.id, normalizedStatus]
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
    SET status = ?
    WHERE id = ? AND user_id = ?
  `).run(normalizedStatus, normalizedId, user.id);

  const row = db
    .prepare(`
      SELECT id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on
      FROM campaigns
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `)
    .get(normalizedId, user.id);

  if (!row) {
    throw new StoreError("Campaign not found.", 404);
  }

  return mapCampaign(row);
}

export async function getPublicCampaignById(campaignId) {
  const backend = await ensureStore();
  const normalizedId = normalizeText(campaignId, 80);
  if (!normalizedId) {
    return null;
  }

  if (backend === "postgres") {
    const pool = getPgPool();
    const result = await pool.query(
      `
        SELECT id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on
        FROM campaigns
        WHERE id = $1
        LIMIT 1
      `,
      [normalizedId]
    );
    const row = result.rows[0];
    if (!row || row.status !== "live") {
      return null;
    }
    return mapCampaign(row);
  }

  const db = await getSqliteDb();
  const row = db
    .prepare(
      `
      SELECT id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on
      FROM campaigns
      WHERE id = ?
      LIMIT 1
    `
    )
    .get(normalizedId);
  if (!row || row.status !== "live") {
    return null;
  }
  return mapCampaign(row);
}

export async function submitCampaignEntry(campaignId, input) {
  const backend = await ensureStore();
  const normalizedId = normalizeText(campaignId, 80);
  const entry = validateEntrantInput(input);
  const entrantId = `ent-${randomUUID()}`;
  const source = normalizeText(input.source || "direct", 40) || "direct";

  if (backend === "postgres") {
    const pool = getPgPool();
    const campaignResult = await pool.query(
      `
        SELECT id, user_id, status
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
        INSERT INTO entrants (id, campaign_id, user_id, name, email, source)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [entrantId, normalizedId, campaign.user_id, entry.name, entry.email, source]
    );
    await pool.query(`UPDATE campaigns SET entries = entries + 1 WHERE id = $1`, [normalizedId]);
    return { accepted: true, message: "Entry confirmed. Good luck!" };
  }

  const db = await getSqliteDb();
  const campaign = db
    .prepare(`SELECT id, user_id, status FROM campaigns WHERE id = ? LIMIT 1`)
    .get(normalizedId);
  if (!campaign || campaign.status !== "live") {
    throw new StoreError("Campaign is not accepting entries.", 404);
  }

  const duplicate = db
    .prepare(`SELECT id FROM entrants WHERE campaign_id = ? AND email = ? LIMIT 1`)
    .get(normalizedId, entry.email);
  if (duplicate) {
    db.prepare(`UPDATE campaigns SET duplicates = duplicates + 1 WHERE id = ?`).run(normalizedId);
    throw new StoreError("This email has already entered this campaign.", 409);
  }

  db.prepare(`
    INSERT INTO entrants (id, campaign_id, user_id, name, email, source)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(entrantId, normalizedId, campaign.user_id, entry.name, entry.email, source);
  db.prepare(`UPDATE campaigns SET entries = entries + 1 WHERE id = ?`).run(normalizedId);
  return { accepted: true, message: "Entry confirmed. Good luck!" };
}

export async function getCampaignEntrants(campaignId, sessionToken) {
  const user = await getSessionUser(sessionToken);
  if (!user) {
    throw new StoreError("You need to sign in to export entrants.", 401);
  }

  const backend = await ensureStore();
  const normalizedId = normalizeText(campaignId, 80);
  if (!normalizedId) {
    throw new StoreError("Campaign id is required.", 400);
  }

  if (backend === "postgres") {
    const pool = getPgPool();
    const campaignResult = await pool.query(
      `SELECT id, title FROM campaigns WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [normalizedId, user.id]
    );
    const campaign = campaignResult.rows[0];
    if (!campaign) {
      throw new StoreError("Campaign not found.", 404);
    }
    const entrantsResult = await pool.query(
      `
        SELECT id, name, email, source, created_at
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
      })),
    };
  }

  const db = await getSqliteDb();
  const campaign = db
    .prepare(`SELECT id, title FROM campaigns WHERE id = ? AND user_id = ? LIMIT 1`)
    .get(normalizedId, user.id);
  if (!campaign) {
    throw new StoreError("Campaign not found.", 404);
  }
  const entrants = db
    .prepare(
      `
      SELECT id, name, email, source, created_at
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
    }));

  return {
    campaignTitle: campaign.title,
    entrants,
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
  return {
    ok: true,
    backend,
  };
}
