// Données de DÉMONSTRATION seulement : ajoute un an d'activité passée (tâches terminées, réunions notées)
// avant les données d'exemple, pour que le bilan sur 6 mois ou sur un exercice ait quelque chose à montrer.
// Usage : DATABASE_URL=... node scripts/semer-historique.mjs
// Ne fait rien sur une base qui n'est pas celle de démonstration, ni deux fois. Exclu de l'image Docker.
import postgres from "postgres";
import { randomUUID } from "node:crypto";

const MARQUE = "[historique de démonstration]";
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manque.");
  process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: () => {} });
const fin = async (message, code = 0) => {
  if (message) console.log(message);
  await sql.end();
  process.exit(code);
};

// Seulement la base de démonstration (adresses @demo.dpo.local), et une seule fois.
const [{ demo }] = await sql`select count(*)::int as demo from personnes where courriel like '%@demo.dpo.local'`;
if (!demo) await fin("Pas une base de démonstration : historique non ajouté.");
const [{ deja }] = await sql`select count(*)::int as deja from taches where description = ${MARQUE}`;
const messages = [];

const jour = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const lundi = (iso) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return jour(iso, -((d.getUTCDay() + 6) % 7));
};

// Tirages reproductibles (même historique à chaque fois).
let graine = 20261028;
const hasard = () => {
  graine = (graine * 1103515245 + 12345) % 2147483648;
  return graine / 2147483648;
};
const entre = (a, b) => a + Math.floor(hasard() * (b - a + 1));
const parmi = (l) => l[Math.floor(hasard() * l.length)];


async function activite() {
  // L'historique s'arrête la veille des premières données d'exemple.
  const [{ debut }] = await sql`
    select least((select min(terminee_le)::date from taches where statut = 'faite'), (select min(jour) from reunions))::text as debut`;
  if (!debut) return;

  const TITRES = [
    "Revue du cahier des charges",
    "Mise à jour du tableau de bord",
    "Préparation du comité de projet",
    "Tests de recette",
    "Note de synthèse pour la direction",
    "Formation des utilisateurs",
    "Analyse des écarts",
    "Compte rendu de réunion",
    "Cartographie du processus",
    "Mise à jour de la procédure",
    "Relecture des spécifications",
    "Suivi des anomalies",
    "Plan de communication",
    "Atelier avec le métier",
  ];
  const REUNIONS = ["Point d'équipe", "Comité de suivi", "Atelier de cadrage", "Revue des priorités", "Point avec le métier"];

  const gens = await sql`
    select id, equipe_id, directeur from personnes
    where actif and not externe and not executif and courriel like '%@demo.dpo.local'`;
  const premierLundi = lundi(jour(debut, -7 * 56));
  const dernierJour = jour(debut, -1);

  const taches = [];
  const reunions = [];
  const participants = [];
  let semaine = 0;
  for (let l = premierLundi; l <= dernierJour; l = jour(l, 7), semaine++) {
    // Un rythme qui varie dans l'année (fêtes de fin d'année, été plus calme) et d'une semaine à l'autre.
    const mois = Number(l.slice(5, 7));
    const saison = mois === 12 || mois === 1 ? 0.6 : mois === 7 || mois === 8 ? 0.8 : 1;
    const progression = 0.85 + 0.3 * (semaine / 56);
    for (const [k, p] of gens.entries()) {
      // Le même rythme que les données d'exemple (une tâche et demie par personne et par semaine environ).
      const base = p.directeur ? 1 : 1 + (k % 3) * 0.5;
      const n = Math.max(0, Math.round(base * saison * progression + entre(-1, 1)));
      for (let i = 0; i < n; i++) {
        const termine = jour(l, entre(0, 4));
        if (termine > dernierJour) continue;
        const estimation = hasard() < 0.2 ? null : parmi([3, 4, 6, 6, 8]);
        // Environ une tâche sur cinq finie après son échéance.
        const echeance = hasard() < 0.85 ? jour(termine, entre(0, 3)) : jour(termine, -entre(1, 4));
        taches.push({
          id: randomUUID(),
          titre: parmi(TITRES),
          assigne_id: p.id,
          statut: "faite",
          debut: jour(termine, -entre(1, 5)),
          echeance,
          estimation_heures: estimation,
          description: MARQUE,
          cree_par_id: p.id,
          cree_le: `${jour(termine, -7)}T13:00:00Z`,
          maj_le: `${termine}T19:00:00Z`,
          terminee_le: `${termine}T19:00:00Z`,
        });
      }
    }
    // Réunions : une à trois par équipe et par semaine.
    const equipes = [...new Set(gens.map((p) => p.equipe_id).filter(Boolean))];
    for (const e of equipes) {
      const membres = gens.filter((p) => p.equipe_id === e);
      for (let i = 0, n = entre(1, 3); i < n; i++) {
        const j = jour(l, entre(0, 4));
        if (j > dernierJour) continue;
        const id = randomUUID();
        reunions.push({ id, titre: parmi(REUNIONS), jour: j, heure: parmi(["09:00", "10:30", "14:00", "15:30"]), duree_minutes: parmi([30, 45, 60, 60, 90]), notes: MARQUE, notee_par_id: membres[0].id, cree_le: `${j}T12:00:00Z` });
        for (const m of membres) participants.push({ reunion_id: id, personne_id: m.id });
      }
    }
  }

  await sql.begin(async (tx) => {
    for (let i = 0; i < taches.length; i += 500) await tx`insert into taches ${tx(taches.slice(i, i + 500))}`;
    for (let i = 0; i < reunions.length; i += 500) await tx`insert into reunions ${tx(reunions.slice(i, i + 500))}`;
    for (let i = 0; i < participants.length; i += 1000) await tx`insert into participants_reunion ${tx(participants.slice(i, i + 1000))}`;
  });
  messages.push(`Historique de démonstration : ${taches.length} tâches terminées et ${reunions.length} réunions, du ${premierLundi} au ${dernierJour}.`);
}

// Reports de la date de fin des projets (une fois) : de la fin initiale à la fin prévue, en une à quatre fois.
async function reports() {
  const [{ n }] = await sql`select count(*)::int as n from reports_fin_projet`;
  if (n) return;
  const projets = await sql`
    select id, chef_projet_id, date_entree::text as entree, date_fin_initiale::text as initiale, date_fin_prevue::text as prevue
    from projets where date_fin_initiale is not null and date_fin_prevue > date_fin_initiale and date_entree is not null order by code`;
  const lignes = [];
  for (const p of projets) {
    const jours = (new Date(`${p.prevue}T12:00:00Z`) - new Date(`${p.initiale}T12:00:00Z`)) / 86400000;
    // Un report par trimestre de retard environ (de un à quatre).
    const etapes = Math.max(1, Math.min(4, Math.round(jours / 90) + entre(0, 1)));
    let avant = p.initiale;
    let dernier = p.entree;
    for (let k = 1; k <= etapes; k++) {
      const apres = k === etapes ? p.prevue : jour(p.initiale, Math.round((jours * k) / etapes));
      // Décidé un peu avant la date qu'on repousse, jamais avant l'entrée du projet ni après aujourd'hui.
      let le = jour(avant, -entre(10, 40));
      if (le <= dernier) le = jour(dernier, 7);
      const auj = process.env.DATE_DEMO || new Date().toISOString().slice(0, 10);
      if (le > auj) le = jour(auj, -7 * (etapes - k + 1));
      dernier = le;
      lignes.push({ projet_id: p.id, avant, apres, par_id: p.chef_projet_id, cree_le: `${le}T15:00:00Z` });
      avant = apres;
    }
  }
  if (lignes.length) await sql`insert into reports_fin_projet ${sql(lignes)}`;
  messages.push(`Reports de date de fin : ${lignes.length}, sur ${projets.length} projets.`);
}

if (!deja) await activite();
await reports();
await fin(messages.join("\n"));
