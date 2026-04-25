import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Pool } from "pg";

const defaultData = {
  organizer: {
    id: "org-demo",
    loggedIn: false,
    organizerName: "",
    businessName: "",
    email: "",
  },
  billing: {
    id: "billing-demo",
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
  return path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);
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
    entries: Number(row.entries),
    shareRate: row.share_rate ?? row.shareRate,
    duplicates: Number(row.duplicates),
    endsOn: row.ends_on ?? row.endsOn,
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
    CREATE TABLE IF NOT EXISTS organizers (
      id TEXT PRIMARY KEY,
      logged_in INTEGER NOT NULL DEFAULT 0,
      organizer_name TEXT NOT NULL DEFAULT '',
      business_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS billings (
      id TEXT PRIMARY KEY,
      plan TEXT NOT NULL DEFAULT 'starter',
      status TEXT NOT NULL DEFAULT 'trialing',
      renewal_date TEXT NOT NULL DEFAULT '2026-06-01'
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
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
  `);

  db.prepare(`
    INSERT OR IGNORE INTO organizers (id, logged_in, organizer_name, business_name, email)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    defaultData.organizer.id,
    0,
    defaultData.organizer.organizerName,
    defaultData.organizer.businessName,
    defaultData.organizer.email
  );

  db.prepare(`
    INSERT OR IGNORE INTO billings (id, plan, status, renewal_date)
    VALUES (?, ?, ?, ?)
  `).run(
    defaultData.billing.id,
    defaultData.billing.plan,
    defaultData.billing.status,
    defaultData.billing.renewalDate
  );

  const insertCampaign = db.prepare(`
    INSERT OR IGNORE INTO campaigns
    (id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  defaultData.campaigns.forEach((campaign) => {
    insertCampaign.run(
      campaign.id,
      campaign.type,
      campaign.title,
      campaign.prize,
      campaign.audience,
      campaign.method,
      campaign.status,
      campaign.entries,
      campaign.shareRate,
      campaign.duplicates,
      campaign.endsOn
    );
  });

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
    CREATE TABLE IF NOT EXISTS organizers (
      id TEXT PRIMARY KEY,
      logged_in BOOLEAN NOT NULL DEFAULT false,
      organizer_name TEXT NOT NULL DEFAULT '',
      business_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS billings (
      id TEXT PRIMARY KEY,
      plan TEXT NOT NULL DEFAULT 'starter',
      status TEXT NOT NULL DEFAULT 'trialing',
      renewal_date TEXT NOT NULL DEFAULT '2026-06-01'
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
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
  `);

  await pool.query(
    `
      INSERT INTO organizers (id, logged_in, organizer_name, business_name, email)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO NOTHING
    `,
    [
      defaultData.organizer.id,
      false,
      defaultData.organizer.organizerName,
      defaultData.organizer.businessName,
      defaultData.organizer.email,
    ]
  );

  await pool.query(
    `
      INSERT INTO billings (id, plan, status, renewal_date)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO NOTHING
    `,
    [
      defaultData.billing.id,
      defaultData.billing.plan,
      defaultData.billing.status,
      defaultData.billing.renewalDate,
    ]
  );

  for (const campaign of defaultData.campaigns) {
    await pool.query(
      `
        INSERT INTO campaigns
        (id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        campaign.id,
        campaign.type,
        campaign.title,
        campaign.prize,
        campaign.audience,
        campaign.method,
        campaign.status,
        campaign.entries,
        campaign.shareRate,
        campaign.duplicates,
        campaign.endsOn,
      ]
    );
  }

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

async function readSqliteState() {
  const db = await getSqliteDb();
  const organizer = db
    .prepare(`
      SELECT id, logged_in, organizer_name, business_name, email
      FROM organizers
      WHERE id = ?
    `)
    .get(defaultData.organizer.id);
  const billing = db
    .prepare(`
      SELECT id, plan, status, renewal_date
      FROM billings
      WHERE id = ?
    `)
    .get(defaultData.billing.id);
  const campaigns = db
    .prepare(`
      SELECT id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on
      FROM campaigns
      ORDER BY id DESC
    `)
    .all();

  return {
    session: {
      loggedIn: Boolean(organizer?.logged_in),
      organizerName: organizer?.organizer_name || "",
      businessName: organizer?.business_name || "",
      email: organizer?.email || "",
    },
    billing: {
      id: billing?.id || defaultData.billing.id,
      plan: billing?.plan || defaultData.billing.plan,
      status: billing?.status || defaultData.billing.status,
      renewalDate: billing?.renewal_date || defaultData.billing.renewalDate,
    },
    campaigns: campaigns.map(mapCampaign),
  };
}

async function readPostgresState() {
  const pool = getPgPool();
  const [organizerResult, billingResult, campaignResult] = await Promise.all([
    pool.query(
      `
        SELECT id, logged_in, organizer_name, business_name, email
        FROM organizers
        WHERE id = $1
      `,
      [defaultData.organizer.id]
    ),
    pool.query(
      `
        SELECT id, plan, status, renewal_date
        FROM billings
        WHERE id = $1
      `,
      [defaultData.billing.id]
    ),
    pool.query(`
      SELECT id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on
      FROM campaigns
      ORDER BY id DESC
    `),
  ]);

  const organizer = organizerResult.rows[0];
  const billing = billingResult.rows[0];

  return {
    session: {
      loggedIn: Boolean(organizer?.logged_in),
      organizerName: organizer?.organizer_name || "",
      businessName: organizer?.business_name || "",
      email: organizer?.email || "",
    },
    billing: {
      id: billing?.id || defaultData.billing.id,
      plan: billing?.plan || defaultData.billing.plan,
      status: billing?.status || defaultData.billing.status,
      renewalDate: billing?.renewal_date || defaultData.billing.renewalDate,
    },
    campaigns: campaignResult.rows.map(mapCampaign),
  };
}

export async function getPublicState() {
  const backend = await ensureStore();
  return backend === "postgres" ? readPostgresState() : readSqliteState();
}

export async function saveOrganizer(session) {
  const backend = await ensureStore();

  if (backend === "postgres") {
    const pool = getPgPool();
    await pool.query(
      `
        INSERT INTO organizers (id, logged_in, organizer_name, business_name, email)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET
          logged_in = EXCLUDED.logged_in,
          organizer_name = EXCLUDED.organizer_name,
          business_name = EXCLUDED.business_name,
          email = EXCLUDED.email
      `,
      [
        defaultData.organizer.id,
        true,
        session.organizerName || "",
        session.businessName || "",
        session.email || "",
      ]
    );
  } else {
    const db = await getSqliteDb();
    db.prepare(`
      INSERT INTO organizers (id, logged_in, organizer_name, business_name, email)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        logged_in = excluded.logged_in,
        organizer_name = excluded.organizer_name,
        business_name = excluded.business_name,
        email = excluded.email
    `).run(
      defaultData.organizer.id,
      1,
      session.organizerName || "",
      session.businessName || "",
      session.email || ""
    );
  }

  return getPublicState();
}

export async function clearOrganizer() {
  const backend = await ensureStore();

  if (backend === "postgres") {
    const pool = getPgPool();
    await pool.query(
      `
        UPDATE organizers
        SET logged_in = $2, organizer_name = $3, business_name = $4, email = $5
        WHERE id = $1
      `,
      [
        defaultData.organizer.id,
        false,
        defaultData.organizer.organizerName,
        defaultData.organizer.businessName,
        defaultData.organizer.email,
      ]
    );
  } else {
    const db = await getSqliteDb();
    db.prepare(`
      UPDATE organizers
      SET logged_in = ?, organizer_name = ?, business_name = ?, email = ?
      WHERE id = ?
    `).run(
      0,
      defaultData.organizer.organizerName,
      defaultData.organizer.businessName,
      defaultData.organizer.email,
      defaultData.organizer.id
    );
  }

  return getPublicState();
}

export async function saveBilling(plan) {
  const backend = await ensureStore();

  if (backend === "postgres") {
    const pool = getPgPool();
    await pool.query(
      `
        INSERT INTO billings (id, plan, status, renewal_date)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET
          plan = EXCLUDED.plan,
          status = EXCLUDED.status
      `,
      [defaultData.billing.id, plan, "active", defaultData.billing.renewalDate]
    );
  } else {
    const db = await getSqliteDb();
    db.prepare(`
      INSERT INTO billings (id, plan, status, renewal_date)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        plan = excluded.plan,
        status = excluded.status,
        renewal_date = excluded.renewal_date
    `).run(
      defaultData.billing.id,
      plan,
      "active",
      defaultData.billing.renewalDate
    );
  }

  return getPublicState();
}

export async function saveCampaign(campaign) {
  const backend = await ensureStore();
  const nextCampaign = {
    id: campaign.id || `cmp-${Date.now()}`,
    entries: 0,
    shareRate: "0%",
    duplicates: 0,
    status: "draft",
    ...campaign,
  };

  if (backend === "postgres") {
    const pool = getPgPool();
    await pool.query(
      `
        INSERT INTO campaigns
        (id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        nextCampaign.id,
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
      (id, type, title, prize, audience, method, status, entries, share_rate, duplicates, ends_on)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nextCampaign.id,
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
