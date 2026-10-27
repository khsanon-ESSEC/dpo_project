import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Pendant la compilation, la base n'est pas interrogée : l'adresse peut manquer.
const enCompilation = process.env.NEXT_PHASE === "phase-production-build";
const url = process.env.DATABASE_URL ?? (enCompilation ? "postgres://compilation@localhost/compilation" : undefined);
if (!url) throw new Error("DATABASE_URL manque : voir .env.example");

declare global {
  // Réutilise la connexion entre les rechargements en développement.
  var __pgClient: ReturnType<typeof postgres> | undefined;
}

const client = globalThis.__pgClient ?? postgres(url, { max: 10, idle_timeout: 30 });
if (process.env.NODE_ENV !== "production") globalThis.__pgClient = client;

export const db = drizzle(client, { schema });
export type Db = typeof db;
export { schema };
