import { defineConfig } from "drizzle-kit";
import path from "path";

const connectionString = (
  process.env.SUPABASE_DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  ""
).trim();

if (!connectionString) {
  throw new Error(
    "No database connection string found. Set DATABASE_URL, POSTGRES_URL_NON_POOLING, or SUPABASE_DATABASE_URL.",
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
