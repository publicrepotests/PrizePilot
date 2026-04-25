import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

function resolveDatabasePath() {
  const url = process.env.DATABASE_URL || "file:./prisma/dev.db";
  if (!url.startsWith("file:")) {
    throw new Error("Only SQLite file URLs are supported in this local setup.");
  }

  const filePath = url.replace(/^file:/, "");
  return path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);
}

let initialized = false;

export async function ensureSqliteSchema() {
  if (initialized) {
    return;
  }

  const dbPath = resolveDatabasePath();
  await mkdir(path.dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS Organizer (
      id TEXT PRIMARY KEY,
      loggedIn BOOLEAN NOT NULL DEFAULT false,
      organizerName TEXT NOT NULL DEFAULT '',
      businessName TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS Billing (
      id TEXT PRIMARY KEY,
      plan TEXT NOT NULL DEFAULT 'starter',
      status TEXT NOT NULL DEFAULT 'trialing',
      renewalDate TEXT NOT NULL DEFAULT '2026-06-01'
    );

    CREATE TABLE IF NOT EXISTS Campaign (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      prize TEXT NOT NULL,
      audience TEXT NOT NULL,
      method TEXT NOT NULL,
      status TEXT NOT NULL,
      entries INTEGER NOT NULL DEFAULT 0,
      shareRate TEXT NOT NULL DEFAULT '0%',
      duplicates INTEGER NOT NULL DEFAULT 0,
      endsOn TEXT NOT NULL
    );
  `);
  db.close();
  initialized = true;
}
