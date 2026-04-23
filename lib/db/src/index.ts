import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10,
});

// CRÍTICO: sin este listener un idle-client error crashea el proceso entero (Node emite 'error' sin handler → uncaught exception)
pool.on("error", (err) => {
  console.error("[pg-pool] idle client error — connection dropped unexpectedly:", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
