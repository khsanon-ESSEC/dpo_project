// Lance l'application sur un poste, pour essai, sans installer PostgreSQL :
// une base PostgreSQL 16 embarquée (paquet embedded-postgres) vit dans le dossier .local/.
// Au premier lancement, la base est créée et remplie avec les données de démonstration.
//
// Usage : npm run local            (Ctrl+C pour arrêter)
//         npm run local -- --vraie-date   pour ne pas figer la date au vendredi 30 octobre 2026
//         npm run local -- --reseau       pour l'ouvrir aussi aux appareils du même Wi-Fi (téléphone)
//
// Paramètres facultatifs dans .env.local (même format que .env.example), par exemple IA_FOURNISSEUR.
// Jamais en production : voir README.md, « Installation ».
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, cpSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";
import { VERSION_DONNEES_EXEMPLE } from "./version-donnees.mjs";

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dossierLocal = path.join(racine, ".local");
const dossierBase = path.join(dossierLocal, "postgres");
mkdirSync(dossierLocal, { recursive: true });

const dire = (m) => console.log(`\x1b[36m▸\x1b[0m ${m}`);
const echouer = (m) => {
  console.error(`\x1b[31m✗ ${m}\x1b[0m`);
  process.exit(1);
};

// ---------- Paramètres ----------
function lireEnvLocal() {
  const f = path.join(racine, ".env.local");
  if (!existsSync(f)) return {};
  const vals = {};
  for (const ligne of readFileSync(f, "utf8").split("\n")) {
    const m = ligne.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) vals[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return vals;
}

function portLibre(depart, hote = "127.0.0.1") {
  return new Promise((resolve) => {
    const essayer = (p) => {
      const s = createServer();
      s.once("error", () => essayer(p + 1));
      s.once("listening", () => s.close(() => resolve(p)));
      s.listen(p, hote);
    };
    essayer(depart);
  });
}

const envLocal = lireEnvLocal();
const vraieDate = process.argv.includes("--vraie-date");
// --reseau : l'application écoute aussi sur le réseau local (téléphone sur le même Wi-Fi). La base reste locale.
const reseau = process.argv.includes("--reseau");

/** Adresse IPv4 du poste sur le réseau local (Wi-Fi d'abord), ou null. */
function adresseLocale() {
  const interfaces = networkInterfaces();
  const noms = Object.keys(interfaces).sort((a, b) => Number(b === "en0") - Number(a === "en0"));
  for (const nom of noms) {
    for (const i of interfaces[nom] ?? []) {
      if (i.family === "IPv4" && !i.internal && !i.address.startsWith("169.254.")) return i.address;
    }
  }
  return null;
}
// Ports libres : on part des valeurs par défaut et on avance si un autre programme les occupe déjà.
const portBase = await portLibre(Number(envLocal.PORT_BASE_LOCALE || 54329));
const portApp = await portLibre(Number(envLocal.PORT || 3000), reseau ? "0.0.0.0" : "127.0.0.1");
const MOT_DE_PASSE_BASE = "dpo-local";
const DATABASE_URL = `postgres://dpo:${MOT_DE_PASSE_BASE}@127.0.0.1:${portBase}/dpo`;
const DATE_DEMO = vraieDate ? "" : envLocal.DATE_DEMO ?? "2026-10-30";

// ---------- 1. Base PostgreSQL embarquée ----------
const journalPg = [];
const fichierJournalPg = path.join(dossierLocal, "postgres.log");
function noterPg(m) {
  const texte = String(m ?? "").trim();
  if (!texte) return;
  journalPg.push(texte);
  if (journalPg.length > 200) journalPg.shift();
  try {
    appendFileSync(fichierJournalPg, texte + "\n");
  } catch {
    /* journal facultatif */
  }
}
const derniersMessagesPg = () => journalPg.slice(-25).join("\n");
const pg = new EmbeddedPostgres({
  databaseDir: dossierBase,
  user: "dpo",
  password: MOT_DE_PASSE_BASE,
  port: portBase,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  // TCP sur 127.0.0.1 seulement, sans socket Unix : rien d'exposé hors du poste, pas de conflit dans /tmp.
  postgresFlags: ["-c", "listen_addresses=127.0.0.1", "-c", "unix_socket_directories="],
  // Messages de PostgreSQL : gardés en mémoire et dans .local/postgres.log, affichés en cas d'échec.
  onLog: (m) => noterPg(m),
  onError: (e) => noterPg(e instanceof Error ? e.message : e),
});

let serveur = null;
let arretEnCours = false;
async function arreter(code = 0) {
  if (arretEnCours) return;
  arretEnCours = true;
  dire("Arrêt…");
  if (serveur && serveur.exitCode === null) serveur.kill("SIGTERM");
  try {
    await pg.stop();
  } catch {
    /* déjà arrêtée */
  }
  process.exit(code);
}
for (const s of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(s, () => arreter(0));

if (!existsSync(path.join(dossierBase, "PG_VERSION"))) {
  dire("Création de la base locale (première fois seulement)…");
  try {
    await pg.initialise();
  } catch (e) {
    console.error(derniersMessagesPg());
    echouer(`La base locale n'a pas pu être créée${e?.message ? ` : ${e.message}` : ""}.`);
  }
}
// Une seule application à la fois sur cette base : si elle tourne déjà dans une autre fenêtre, le dire.
const fichierPid = path.join(dossierBase, "postmaster.pid");
if (existsSync(fichierPid)) {
  const pid = Number(readFileSync(fichierPid, "utf8").split("\n")[0]);
  let vivant = false;
  try {
    if (pid > 0) {
      process.kill(pid, 0);
      vivant = true;
    }
  } catch {
    /* processus disparu : PostgreSQL reprendra la base */
  }
  if (vivant) echouer("L'application tourne déjà dans une autre fenêtre du Terminal. Fermez cette fenêtre (bouton rouge, puis « Terminer »), puis relancez.");
}
dire(`Démarrage de PostgreSQL sur le port ${portBase}…`);
try {
  await pg.start();
} catch (e) {
  console.error(derniersMessagesPg());
  echouer(`PostgreSQL n'a pas démarré${e?.message ? ` : ${e.message}` : ""}. Messages ci-dessus, et dans .local/postgres.log.`);
}

const admin = postgres(`postgres://dpo:${MOT_DE_PASSE_BASE}@127.0.0.1:${portBase}/postgres`, { max: 1, onnotice: () => {} });
let [existe] = await admin`select 1 from pg_database where datname = 'dpo'`;
// Données de démonstration d'une version plus ancienne : on repart d'une base neuve.
if (existe) {
  const versionActuelle = await lireVersionDonnees();
  if (versionActuelle !== null && versionActuelle < VERSION_DONNEES_EXEMPLE) {
    dire("Nouvelles données de démonstration : la base locale est recréée.");
    await admin.unsafe("drop database dpo with (force)");
    existe = undefined;
  }
}
if (!existe) await admin.unsafe("create database dpo");
await admin.end();

async function lireVersionDonnees() {
  const c = postgres(`postgres://dpo:${MOT_DE_PASSE_BASE}@127.0.0.1:${portBase}/dpo`, { max: 1, onnotice: () => {} });
  try {
    const [r] = await c`select coalesce((details->>'version')::int, 1) as v from journal where action = 'donnees_exemple' order by id desc limit 1`;
    return r ? r.v : null;
  } catch {
    return null; // base vide ou pas encore migrée
  } finally {
    await c.end();
  }
}

// ---------- 2. Schéma et données de démonstration ----------
const envScripts = { ...process.env, DATABASE_URL, DATE_DEMO };
const lancer = (script) => spawnSync(process.execPath, [path.join(racine, "scripts", script)], { cwd: racine, env: envScripts, stdio: "inherit" }).status;

dire("Mise à jour du schéma…");
if (lancer("migrer.mjs") !== 0) await arreter(1);

const base = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
const [{ n }] = await base`select count(*)::int as n from personnes`;
await base.end();
if (n === 0) {
  dire("Données de démonstration…");
  if (lancer("semer.mjs") !== 0) await arreter(1);
}

// ---------- 3. Application compilée ----------
const standalone = path.join(racine, ".next", "standalone");
const buildId = path.join(racine, ".next", "BUILD_ID");
// Recompiler si rien n'est compilé, ou si le code a changé depuis (après une mise à jour, par exemple).
const plusRecent = () => {
  const reference = statSync(buildId).mtimeMs;
  for (const dossier of ["src", "public"]) {
    for (const f of readdirSync(path.join(racine, dossier), { recursive: true })) {
      if (statSync(path.join(racine, dossier, String(f))).mtimeMs > reference) return true;
    }
  }
  return ["package.json", "next.config.ts"].some((f) => statSync(path.join(racine, f)).mtimeMs > reference);
};
if (!existsSync(path.join(standalone, "server.js")) || !existsSync(buildId) || plusRecent()) {
  dire("Compilation de l'application (quelques minutes)…");
  const r = spawnSync("npm", ["run", "build"], { cwd: racine, stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
  if (r.status !== 0) await arreter(1);
}
// Le serveur autonome a besoin des fichiers publics et statiques à côté de lui.
cpSync(path.join(racine, "public"), path.join(standalone, "public"), { recursive: true });
cpSync(path.join(racine, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });

const adresse = `http://localhost:${portApp}`;
const ipLocale = reseau ? adresseLocale() : null;
const adresseReseau = ipLocale ? `http://${ipLocale}:${portApp}` : null;
if (reseau && !ipLocale) dire("Aucun réseau local trouvé (Wi-Fi coupé ?) : l'application ne sera ouverte que sur ce poste.");
dire(`Démarrage de l'application sur ${adresse}…`);
serveur = spawn(process.execPath, [path.join(standalone, "server.js")], {
  cwd: standalone,
  stdio: ["ignore", "ignore", "inherit"],
  env: {
    ...process.env,
    IA_FOURNISSEUR: "aucun",
    ...envLocal,
    NODE_ENV: "production",
    DATABASE_URL,
    DATE_DEMO,
    PORT: String(portApp),
    HOSTNAME: adresseReseau ? "0.0.0.0" : "127.0.0.1",
    APP_URL: adresseReseau ?? adresse,
    COOKIE_SECURISE: "0",
    APP_TZ: envLocal.APP_TZ || "America/Port-au-Prince",
  },
});
serveur.on("exit", (code, signal) => {
  if (arretEnCours) return;
  if (signal) return arreter(0); // Ctrl+C ou fermeture de la fenêtre
  console.error(`L'application s'est arrêtée (code ${code}).`);
  arreter(code ?? 1);
});

// Attendre que l'application réponde, puis ouvrir le navigateur.
let prete = false;
for (let i = 0; i < 60 && !prete; i++) {
  await new Promise((r) => setTimeout(r, 500));
  prete = await fetch(`${adresse}/api/sante`).then((r) => r.ok).catch(() => false);
}
if (!prete) echouer("L'application ne répond pas. Voir les messages ci-dessus.");

console.log(`
\x1b[32m✓ Pilotage des projets DPO est prêt : ${adresse}\x1b[0m
${DATE_DEMO ? `  Date figée au ${DATE_DEMO} (démonstration). Pour la vraie date : npm run local -- --vraie-date\n` : ""}
  Comptes de démonstration (mot de passe : Demo-DPO-2026)
    daphnee.joseph@demo.dpo.local       chargée de projets
    myriam.valcin@demo.dpo.local        cheffe d'équipe et cheffe de projet
    marc-antoine.louis@demo.dpo.local   directeur (Solutions technologiques)
    nadege.augustin@demo.dpo.local      directrice de la division, administratrice
    frantz.desrosiers@demo.dpo.local    exécutif et administrateur
    jean-robert.noel@demo.dpo.local     analyste et administrateur
    nathalie.celestin@demo.dpo.local    consultante hors division (accès limité)

  Pour arrêter : Ctrl+C dans cette fenêtre (ou fermez-la).
  Pour repartir de zéro : supprimez le dossier .local/postgres, puis relancez.
`);
if (adresseReseau) {
  console.log(`\x1b[32m✓ Sur votre téléphone, connecté au même Wi-Fi : ${adresseReseau}\x1b[0m

  Si le Mac demande d'accepter les connexions entrantes pour « node », répondez « Autoriser ».
  Attention : tant que cette fenêtre est ouverte, toute personne sur ce Wi-Fi peut ouvrir la page
  de connexion, et les comptes de démonstration ont le même mot de passe. À faire chez soi, pas
  sur le Wi-Fi de la banque ni un Wi-Fi public ; fermez la fenêtre quand vous avez fini.
`);
}

if (process.platform === "darwin" && !process.argv.includes("--sans-navigateur")) spawn("open", [adresse], { stdio: "ignore", detached: true }).unref();
else if (process.platform === "win32" && !process.argv.includes("--sans-navigateur")) spawn("cmd", ["/c", "start", "", adresse], { stdio: "ignore", detached: true }).unref();

// Garder le processus en vie tant que l'application tourne.
await new Promise(() => {});
