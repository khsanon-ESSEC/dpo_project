// Applique les migrations SQL du dossier drizzle/ à la base indiquée par DATABASE_URL.
// Sans effet si la base est déjà à jour. Lancé au démarrage du conteneur.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manque.");
  process.exit(1);
}

const dossier = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle");
const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: dossier });
  console.log("Base à jour.");
} catch (e) {
  console.error("Échec de la migration :", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
