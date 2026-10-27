/**
 * Avant les tests d'accès : base de test vidée, migrée et remplie avec les données d'exemple.
 * Elle est désignée par TEST_DATABASE_URL (jamais DATABASE_URL, pour ne pas toucher une vraie base).
 * Sans TEST_DATABASE_URL, seuls les tests de règles pures tournent.
 */
import { execFileSync } from "node:child_process";
import postgres from "postgres";

export default async function preparer() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await sql.end();
  const env = { ...process.env, DATABASE_URL: url, DATE_DEMO: "2026-10-30" };
  execFileSync("node", ["scripts/migrer.mjs"], { env, stdio: "ignore" });
  execFileSync("node", ["scripts/semer.mjs"], { env, stdio: "ignore" });
}
