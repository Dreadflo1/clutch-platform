import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __clutchDb?: ReturnType<typeof drizzle>;
};

/**
 * Lazily create the Drizzle client. The check runs at request time (not module
 * import) so `next build` can collect page data without a live DATABASE_URL,
 * and API routes still fail loudly if the env var is missing at runtime.
 */
export function getDb() {
  if (globalForDb.__clutchDb) return globalForDb.__clutchDb;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const db = drizzle(new Pool({ connectionString: databaseUrl }));
  globalForDb.__clutchDb = db;
  return db;
}
