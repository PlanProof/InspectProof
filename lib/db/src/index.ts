import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Priority order:
// 1. SUPABASE_DATABASE_URL  — custom/manual Supabase URL
// 2. POSTGRES_URL_NON_POOLING — injected automatically by Vercel's Supabase integration (direct connection, required for Drizzle ORM)
// 3. DATABASE_URL             — Replit managed PostgreSQL (local dev)
const connectionString =
  process.env.SUPABASE_DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "No database connection string found. Set DATABASE_URL, POSTGRES_URL_NON_POOLING, or SUPABASE_DATABASE_URL.",
  );
}

const isSupabase =
  !!process.env.SUPABASE_DATABASE_URL ||
  !!process.env.POSTGRES_URL_NON_POOLING;

export const pool = new Pool({
  connectionString,
  ...(isSupabase ? { ssl: { rejectUnauthorized: false } } : {}),
});

export const db = drizzle(pool, { schema });

export * from "./schema";
