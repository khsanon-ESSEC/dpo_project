// Remplit une base VIDE avec des données d'exemple (personnes fictives, projets réels de la DPO).
// Usage : DATABASE_URL=... node scripts/semer.mjs [--mot-de-passe=XXXX]
// Refuse de tourner si la base contient déjà des personnes : ne jamais l'utiliser en production.
import postgres from "postgres";
import { hash } from "@node-rs/argon2";
import { createHash, randomUUID } from "node:crypto";
import { VERSION_DONNEES_EXEMPLE } from "./version-donnees.mjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manque.");
  process.exit(1);
}
const argMdp = process.argv.find((a) => a.startsWith("--mot-de-passe="));
const motDePasse = argMdp ? argMdp.split("=")[1] : "Demo-DPO-2026";

const sql = postgres(url, { max: 1, onnotice: () => {} });
const [{ n }] = await sql`select count(*)::int as n from personnes`;
if (n > 0) {
  console.error("La base contient déjà des personnes : rien n'a été modifié.");
  await sql.end();
  process.exit(1);
}

// ---------- Dates relatives à la semaine en cours (ou à DATE_DEMO, voir .env.example) ----------
const auj = process.env.DATE_DEMO ? new Date(`${process.env.DATE_DEMO}T12:00:00Z`) : new Date();
const lundi = new Date(Date.UTC(auj.getUTCFullYear(), auj.getUTCMonth(), auj.getUTCDate()));
lundi.setUTCDate(lundi.getUTCDate() - ((lundi.getUTCDay() + 6) % 7));
const jour = (decalage) => {
  const d = new Date(lundi);
  d.setUTCDate(d.getUTCDate() + decalage);
  return d.toISOString().slice(0, 10);
};
const moment = (decalage, heure) => `${jour(decalage)}T${String(heure).padStart(2, "0")}:00:00-04:00`;
/** Un PDF d'une page, en texte simple (pièces jointes de démonstration). */
function pdfSimple(titre, lignes) {
  const esc = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[()\\]/g, (c) => `\\${c}`);
  const flux = [`BT /F1 16 Tf 72 760 Td (${esc(titre)}) Tj ET`, ...lignes.map((l, i) => `BT /F1 11 Tf 72 ${720 - i * 18} Td (${esc(l)}) Tj ET`)].join("\n");
  const objets = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(flux)} >>\nstream\n${flux}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const positions = [];
  objets.forEach((o, i) => {
    positions.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${positions.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

const premierDuMois = (decalageMois) => {
  const d = new Date(Date.UTC(auj.getUTCFullYear(), auj.getUTCMonth() + decalageMois, 1));
  return d.toISOString().slice(0, 10);
};

const empreinte = await hash(motDePasse, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

// ---------- Équipes et personnes (noms fictifs) ----------
const E = Object.fromEntries(["dir", "st", "po", "om"].map((k) => [k, randomUUID()]));
const P = {};
// [clé, prénom, nom, poste, équipe, supérieur, rôles réglés à la main]
// Exemple de cumul : Jean-Robert Noël, analyste, est aussi administrateur de l'application.
// Frantz Desrosiers (exécutif et administrateur : lui seul peut donner le rôle Exécutif) voit tout ; Nadège Augustin voit toute la division ; Marc-Antoine Louis, sa seule équipe.
const gens = [
  ["ex", "Frantz", "Desrosiers", "Vice-président exécutif", null, null, ["executif", "administrateur"]],
  ["na", "Nadège", "Augustin", "Directrice de la division", "dir", "ex", ["directeur", "administrateur"]],
  ["ml", "Marc-Antoine", "Louis", "Directeur Solutions technologiques", "st", "na", ["directeur"]],
  ["mv", "Myriam", "Valcin", "Cheffe d'équipe, Projets organisationnels", "po", "na", []],
  ["dj", "Daphnée", "Joseph", "Chargée de projets organisationnels", "st", "ml", []],
  ["lp", "Ludovic", "Pierre", "Chargé de projets", "st", "ml", []],
  ["re", "Ricardo", "Étienne", "Développeur", "st", "ml", []],
  ["wb", "Wesner", "Bazile", "Chargé de projets", "st", "ml", []],
  ["jn", "Jean-Robert", "Noël", "Analyste", "st", "ml", ["administrateur"]],
  ["sc", "Sophonie", "Charles", "Analyste", "st", "ml", []],
  ["fm", "Fabienne", "Michel", "Analyste", "po", "mv", []],
  ["jd", "Joël", "Dorval", "Analyste", "po", "mv", []],
  ["gp", "Guerline", "Paul", "Analyste de processus", "om", null, []],
  ["tl", "Thierry", "Lamy", "Analyste de processus", "om", null, []],
];
for (const [k] of gens) P[k] = randomUUID();
const sansAccent = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z-]/g, "");

await sql.begin(async (tx) => {
  for (const [k, nom] of [["dir", "Direction de la division"], ["st", "Solutions technologiques"], ["po", "Projets organisationnels"], ["om", "Organisation et méthodes"]]) {
    await tx`insert into equipes (id, nom, equipe_parente_id) values (${E[k]}, ${nom}, ${k === "dir" ? null : E.dir})`;
  }
  for (const [k, prenom, nom, poste, eq, , roles] of gens) {
    await tx`insert into personnes (id, prenom, nom, courriel, poste, equipe_id, directeur, executif, administrateur, capacite_heures, mot_de_passe_hash, doit_changer_mot_de_passe)
      values (${P[k]}, ${prenom}, ${nom}, ${`${sansAccent(prenom)}.${sansAccent(nom)}@demo.dpo.local`}, ${poste}, ${eq ? E[eq] : null},
              ${roles.includes("directeur")}, ${roles.includes("executif")}, ${roles.includes("administrateur")}, ${["sc", "jn"].includes(k) ? 32 : 40}, ${empreinte}, false)`;
  }
  for (const [k, , , , , sup] of gens) {
    if (sup) await tx`update personnes set superieur_id = ${P[sup]} where id = ${P[k]}`;
  }
  // Responsables d'équipe. « Organisation et méthodes » : poste vacant.
  for (const [eq, chef] of [["dir", "na"], ["st", "ml"], ["po", "mv"]]) {
    await tx`update equipes set chef_id = ${P[chef]} where id = ${E[eq]}`;
  }

  // ---------- Personnes hors division (autres départements, consultants ; noms fictifs) ----------
  // Sans équipe ni supérieur ici. Nathalie Célestin a un accès limité (ses tâches, ses projets).
  for (const [k, prenom, nom, organisation, poste, courriel] of [
    ["pd", "Patrick", "Dorsainvil", "DTI", "Ingénieur réseau", null],
    ["nc", "Nathalie", "Célestin", "Cabinet Atlas Conseil", "Consultante sécurité", "nathalie.celestin@demo.dpo.local"],
    ["ms", "Mireille", "Saint-Fort", "Division Réseau et succursales", "Directrice des opérations du Réseau", null],
  ]) {
    P[k] = randomUUID();
    await tx`insert into personnes (id, prenom, nom, courriel, poste, externe, organisation, capacite_heures, mot_de_passe_hash, doit_changer_mot_de_passe)
      values (${P[k]}, ${prenom}, ${nom}, ${courriel}, ${poste}, true, ${organisation}, 0, ${courriel ? empreinte : null}, false)`;
  }

  // ---------- Projets (titres et indicateurs : documents de la DPO ; dates d'octobre : exemple) ----------
  const projets = [
    {
      k: "UR", titre: "Nouvelle version UNIBANKOnline Retail", strat: true, pm: "mv", sante: "en_retard",
      description: "La nouvelle plateforme propose une meilleure présentation des fonctionnalités et permettra aux clients d'accéder plus facilement aux services de banque en ligne.",
      entree: "2024-06-25", initiale: "2025-07-31", fin: "2026-11-26", lancement: "2026-12-10",
      ind: [["Conception graphique réalisée", "atteint"], ["Modèle conceptuel validé", "atteint"], ["Consultant pour le développement sélectionné et contrat signé", "atteint"], ["Application développée", "atteint"], ["Planification de la stratégie commerciale", "atteint"], ["Audit de sécurité effectué et passé", "en_cours", -38], ["Plan de lancement finalisé et approuvé", "atteint"], ["Plan de communication approuvé", "atteint"], ["Application mise en ligne", "a_venir"]],
      dernier: { fin: "2026-10-29", lancement: "2026-11-12", etat: "Un déploiement en mode « Early adopter » a été effectué le 15 avril 2026. Plus de 2000 clients l'utilisent actuellement. Le déploiement a dû être suspendu afin de procéder à certains renforcements de la sécurité du système face aux nouvelles menaces de cyberattaques." },
    },
    {
      k: "CE", titre: "Compte d'épargne sans livret", strat: true, pm: "wb", sante: "a_surveiller",
      description: "Permettre aux succursales d'offrir aux nouveaux déposants un compte d'épargne sans livret, et aux détenteurs de la carte de débit UNIBANK de ne plus utiliser de livret.",
      entree: "2023-05-13", initiale: "2025-09-26", fin: "2026-11-26", lancement: "2026-12-10",
      ind: [["Concept du nouveau produit validé", "atteint"], ["Exigences de développement informatique définies", "atteint"], ["Stratégie d'implémentation mise en place", "atteint"], ["Formations réalisées", "en_cours", -9], ["Plan de communication défini", "a_venir"]],
      dernier: { fin: "2026-11-26", lancement: "2026-12-10", etat: "Les phases de conception et d'implémentation ont été achevées. Le produit a été présenté aux responsables du réseau. Des séances de travail sont en cours avec le Réseau en vue de planifier une phase pilote." },
    },
    {
      k: "UC", titre: "Nouvelle version UNIBANKOnline Corporate", strat: true, pm: "ml", sante: "dans_les_temps",
      description: "La nouvelle version vise à offrir une meilleure expérience aux utilisateurs avec une interface plus conviviale et avec plus de fonctionnalités.",
      entree: "2024-12-19", initiale: "2025-12-19", fin: "2026-12-18", lancement: "2027-02-27",
      ind: [["Maquettes graphiques validées", "atteint"], ["Architecture du système validée", "atteint"], ["Développeurs affectés", "atteint"], ["Développement terminé", "en_cours", 21], ["Tests utilisateurs réalisés", "a_venir"], ["Audit de sécurité passé", "a_venir"], ["Formation des chargés de clientèle", "a_venir"], ["Plan de communication approuvé", "a_venir"], ["Application mise en ligne", "a_venir"]],
      dernier: { fin: "2026-12-18", lancement: "2027-02-27", etat: "Les phases de conception des maquettes graphiques, de l'architecture du système ainsi que le développement sont en cours." },
    },
    {
      k: "UN", titre: "Refonte Uninet", strat: false, pm: "lp", sante: "a_surveiller",
      description: "Refonte du portail intranet Uninet.", entree: "2025-03-03", initiale: "2026-12-31", fin: "2027-01-15", lancement: null,
      ind: [["Refonte graphique", "atteint"], ["Refonte de la base de données", "atteint"], ["Intégration avec TMS", "en_cours", 25], ["Migration des données existantes", "a_venir"], ["Statistiques (rapports et tableau de bord Uninet)", "a_venir"]],
    },
    {
      k: "CR", titre: "Refonte Credos", strat: false, pm: "wb", sante: "dans_les_temps",
      description: "Nouvelle version de l'application de suivi des dossiers de crédit.", entree: "2025-06-02", initiale: "2026-12-04", fin: "2026-12-04", lancement: null,
      ind: [["Besoins validés avec le Crédit", "atteint"], ["Maquettes validées", "atteint"], ["Développement terminé", "atteint"], ["Validation métier réalisée", "en_cours", 14], ["Mise en production", "a_venir"], ["Formation des utilisateurs", "a_venir"]],
    },
    {
      k: "PR", titre: "Plateforme de recrutement", strat: false, pm: "dj", sante: "dans_les_temps",
      description: "Plateforme de dépôt et de suivi des candidatures.", entree: "2026-05-04", initiale: "2027-01-29", fin: "2027-01-29", lancement: null,
      ind: [["Cahier des charges validé", "en_cours", 7], ["Maquettes du formulaire de candidature", "atteint"], ["Choix de la solution", "atteint"], ["Développement terminé", "a_venir"], ["Tests avec la DRH", "a_venir"], ["Mise en ligne", "a_venir"]],
    },
    {
      k: "AE", titre: "Système d'archivage électronique", strat: false, pm: "fm", sante: "dans_les_temps", statut: "continu",
      description: "Numérisation, indexation et classement des archives.", entree: "2015-11-02", initiale: "2016-05-31", fin: null, lancement: null,
      ind: [["Existant analysé", "atteint"], ["Solution adaptée retenue", "atteint"], ["Rapport d'évaluation des solutions présenté", "atteint"], ["Archives physiques transférées", "en_cours"]],
    },
  ];
  // Un projet d'une autre division : la cheffe de projet est au Réseau ; Wesner Bazile en est le référent à la DPO.
  projets.push({
    k: "OC", titre: "Ouverture de compte en ligne", strat: true, pm: "ms", referent: "wb", division: "Division Réseau et succursales", sante: "a_surveiller",
    description: "Permettre aux nouveaux clients d'ouvrir un compte depuis le site, avec une vérification d'identité à distance.", entree: "2026-09-01", initiale: "2027-03-31", fin: "2027-03-31", lancement: null,
    ind: [["Parcours client validé", "en_cours", -12], ["Pièces justificatives définies par type de client", "a_venir"], ["Pilote dans trois succursales", "a_venir"]],
  });
  const PJ = {};
  for (const p of projets) {
    PJ[p.k] = randomUUID();
    await tx`insert into projets (id, code, titre, description, programme, strategique, statut, sante, chef_projet_id, referent_id, division, date_entree, date_fin_initiale, date_fin_prevue, date_lancement_prevue)
      values (${PJ[p.k]}, ${p.k}, ${p.titre}, ${p.description}, ${p.strat ? "Amélioration de l'expérience client" : ""}, ${p.strat}, ${p.statut ?? "en_cours"}, ${p.sante}, ${P[p.pm]}, ${p.referent ? P[p.referent] : null}, ${p.division ?? ""}, ${p.entree}, ${p.initiale}, ${p.fin}, ${p.lancement})`;
    let i = 0;
    for (const [libelle, etat, prevu] of p.ind) {
      i += 1;
      // Une date prévue (en jours depuis aujourd'hui) sur quelques jalons : la santé calculée en tient compte.
      await tx`insert into indicateurs (projet_id, ordre, libelle, etat, prevu_le) values (${PJ[p.k]}, ${i}, ${libelle}, ${etat}, ${prevu === undefined ? null : jour(prevu)})`;
    }
    if (p.dernier) {
      await tx`insert into historique_projet (projet_id, mois, date_fin_prevue, date_lancement_prevue, etat_avancement)
        values (${PJ[p.k]}, ${premierDuMois(-1)}, ${p.dernier.fin}, ${p.dernier.lancement}, ${p.dernier.etat})`;
    }
  }

  // ---------- Tâches ----------
  // Aujourd'hui (démonstration) : vendredi = jour(4). Les jours 5-6, 12-13, 19-20… sont des week-ends.
  // h = temps estimé en heures ; debut = début prévu. Une tâche sans h compte pour 4 h dans la charge.
  const tache = async (qui, pj, titre, statut = "a_faire", echeance = null, evenements = [], blocage = null, { debut = null, h = null } = {}) => {
    const id = randomUUID();
    const creee = debut && debut < jour(-14) ? `${debut}T09:00:00-04:00` : moment(-14, 9);
    await tx`insert into taches (id, projet_id, titre, assigne_id, statut, debut, echeance, estimation_heures, blocage, cree_par_id, cree_le, terminee_le)
      values (${id}, ${pj ? PJ[pj] : null}, ${titre}, ${P[qui]}, ${statut}, ${debut}, ${echeance}, ${h}, ${blocage}, ${P[qui]}, ${creee}, ${statut === "faite" ? moment(evenements.at(-1)?.[0] ?? 0, 16) : null})`;
    for (const [j, type, avant, apres, note] of evenements) {
      await tx`insert into evenements_tache (tache_id, auteur_id, type, avant, apres, note, cree_le) values (${id}, ${P[qui]}, ${type}, ${avant}, ${apres}, ${note ?? null}, ${moment(j, 10 + Math.abs(j % 6))})`;
    }
    return id;
  };
  const fait = (j) => [[j, "statut", "en_cours", "faite"]];

  // Daphnée Joseph : 8 tâches cette semaine (3 faites, 2 en retard, 1 bloquée, 2 à faire) et beaucoup de travail à venir : surchargée.
  await tache("dj", "PR", "Maquettes du formulaire de candidature", "faite", jour(1), [[0, "statut", "a_faire", "en_cours"], [1, "statut", "en_cours", "faite"]], null, { debut: jour(0), h: 10 });
  await tache("dj", "UR", "Points 1 et 2 de l'audit de sécurité", "faite", jour(2), [[1, "statut", "en_cours", "faite"]], null, { debut: jour(1), h: 8 });
  await tache("dj", "PR", "Revue du cahier des charges avec la DRH", "faite", jour(3), [[3, "statut", "a_faire", "faite"]], null, { h: 3 });
  const T = {};
  T.audit3 = await tache("dj", "UR", "Point 3 de l'audit de sécurité", "en_cours", jour(2), [[2, "statut", "a_faire", "en_cours"]], null, { debut: jour(2), h: 6 });
  T.accueil = await tache("dj", "UN", "Maquettes de l'accueil", "en_cours", jour(3), [[0, "statut", "a_faire", "en_cours"], [3, "note", null, null, "Aux trois quarts"]], null, { debut: jour(0), h: 10 });
  T.acces = await tache("dj", "UN", "Accès de test DTI", "bloquee", jour(2), [[-3, "statut", "en_cours", "bloquee", "Identifiants demandés à la DTI"], [3, "note", null, null, "Relance faite"]], "Identifiants de test demandés à la DTI le 23 octobre ; relance faite jeudi.", { h: 2 });
  T.cdc = await tache("dj", "PR", "Cahier des charges, version 1", "a_faire", jour(4), [], null, { h: 6 });
  await tache("dj", "PR", "Fiches de poste", "a_faire", jour(7), [], null, { h: 8 });
  await tache("dj", "PR", "Ateliers avec les utilisateurs de la DRH", "a_faire", jour(10), [], null, { debut: jour(8), h: 16 });
  await tache("dj", "PR", "Maquettes des écrans de suivi des candidatures", "a_faire", jour(11), [], null, { debut: jour(9), h: 12 });
  await tache("dj", "PR", "Démonstration à la DRH", "a_faire", jour(11), [], null, { h: 6 });
  await tache("dj", "UR", "Validation métier des correctifs de l'audit", "a_faire", jour(16), [], null, { debut: jour(14), h: 12 });
  await tache("dj", "UN", "Charte graphique de l'intranet", "a_faire", jour(18), [], null, { debut: jour(15), h: 10 });
  await tache("dj", "UR", "Préparation de l'audit de sécurité", "faite", jour(-8), fait(-8), null, { debut: jour(-14), h: 16 });

  // Ricardo Étienne : développement, charge normale.
  await tache("re", "UR", "Tests du module de virements", "faite", jour(3), [[3, "statut", "en_cours", "faite"]], null, { debut: jour(-4), h: 16 });
  await tache("re", "UR", "Correctifs du module de virements", "a_faire", jour(7), [], null, { h: 12 });
  await tache("re", "PR", "Environnement de développement", "faite", jour(2), [[2, "statut", "en_cours", "faite"]], null, { debut: jour(1), h: 8 });
  await tache("re", "UR", "Correctifs de sécurité (points 4 à 6)", "a_faire", jour(11), [], null, { debut: jour(8), h: 24 });
  await tache("re", "PR", "Développement du formulaire de candidature", "a_faire", jour(25), [], null, { debut: jour(14), h: 50 });
  await tache("re", "UR", "Mise en ligne d'UNIBANKOnline Retail", "a_faire", jour(31), [], null, { debut: jour(30), h: 12 });
  await tache("re", "UR", "Module de virements", "faite", jour(-5), fait(-5), null, { debut: jour(-25), h: 80 });

  // Ludovic Pierre : chargé dans deux semaines.
  await tache("lp", "CR", "Serveur de test", "bloquee", jour(1), [[0, "statut", "a_faire", "bloquee", "En attente de la DTI"]], "Serveur de test demandé à la DTI lundi.", { h: 4 });
  await tache("lp", "UN", "Plan de migration des données", "en_cours", jour(4), [[1, "statut", "a_faire", "en_cours"]], null, { debut: jour(1), h: 6 });
  await tache("lp", "UN", "Migration des contenus de l'intranet", "a_faire", jour(18), [], null, { debut: jour(7), h: 40 });
  await tache("lp", "CR", "Validation métier de Credos", "a_faire", jour(25), [], null, { debut: jour(14), h: 30 });
  await tache("lp", "UN", "Formation des contributeurs", "a_faire", jour(30), [], null, { debut: jour(28), h: 12 });
  await tache("lp", "UN", "Point hebdomadaire avec la DTI", "a_faire", jour(9));

  // Sophonie Charles : 32 h par semaine.
  await tache("sc", "PR", "Signature de la DRH sur le cahier des charges", "bloquee", jour(2), [[2, "statut", "en_cours", "bloquee", "Signature attendue"]], "Signature de la DRH attendue depuis mercredi.", { h: 1 });
  await tache("sc", "CE", "Supports de formation du Réseau", "en_cours", jour(4), [[1, "statut", "a_faire", "en_cours"]], null, { debut: jour(0), h: 6 });
  await tache("sc", "CE", "Sessions de formation du Réseau", "a_faire", jour(18), [], null, { debut: jour(7), h: 60 });
  await tache("sc", null, "Glossaire des produits du Réseau");

  // Jean-Robert Noël : 32 h par semaine.
  await tache("jn", "UC", "Spécifications du module de paie", "en_cours", jour(4), [[0, "statut", "a_faire", "en_cours"]], null, { debut: jour(0), h: 5 });
  await tache("jn", "CR", "Jeux de données de test", "faite", jour(3), [[3, "statut", "en_cours", "faite"]], null, { h: 6 });
  await tache("jn", "UC", "Spécifications des virements de masse", "a_faire", jour(11), [], null, { debut: jour(7), h: 16 });
  await tache("jn", "UC", "Tests d'intégration du module de paie", "a_faire", jour(22), [], null, { debut: jour(14), h: 24 });
  await tache("jn", "UC", "Maquettes graphiques des écrans de paie", "faite", jour(-10), fait(-10), null, { debut: jour(-21), h: 30 });

  // Wesner Bazile : surchargé la semaine prochaine.
  await tache("wb", "CE", "Planning de la phase pilote", "faite", jour(3), [[3, "statut", "en_cours", "faite"]], null, { debut: jour(0), h: 12 });
  await tache("wb", "CR", "Validation métier avec le Crédit", "en_cours", jour(4), [[2, "statut", "a_faire", "en_cours"]], null, { debut: jour(2), h: 4 });
  await tache("wb", "CE", "Lancement de la phase pilote", "a_faire", jour(18), [], null, { debut: jour(7), h: 50 });
  await tache("wb", "CR", "Rédaction des procédures Credos", "a_faire", jour(11), [], null, { debut: jour(8), h: 20 });
  await tache("wb", "CE", "Bilan de la phase pilote", "a_faire", jour(32), [], null, { debut: jour(28), h: 16 });

  // Myriam Valcin (cheffe du projet UR) et son équipe.
  await tache("mv", "UR", "Date du nouveau passage d'audit", "a_faire", jour(4), [], null, { h: 2 });
  await tache("mv", "UR", "Plan de lancement révisé", "a_faire", jour(9), [], null, { debut: jour(7), h: 10 });
  await tache("mv", "UR", "Communication aux clients « Early adopters »", "a_faire", jour(25), [], null, { debut: jour(21), h: 12 });
  await tache("fm", "AE", "Transfert des archives du 2e étage", "en_cours", jour(18), [[-7, "statut", "a_faire", "en_cours"]], null, { debut: jour(-7), h: 60 });
  await tache("fm", "AE", "Indexation des dossiers de crédit 2019", "a_faire", jour(32), [], null, { debut: jour(21), h: 40 });
  await tache("jd", "AE", "Numérisation des registres", "a_faire", jour(11), [], null, { debut: jour(7), h: 12 });

  // Marc-Antoine Louis (chef du projet UC).
  await tache("ml", "UC", "Revue d'architecture avec le prestataire", "a_faire", jour(8), [], null, { h: 4 });

  // ---------- Tâches confiées hors division (suivies par la personne qui les a confiées) ----------
  const tacheConfiee = async (par, qui, pj, titre, statut, echeance, h) => {
    const id = randomUUID();
    await tx`insert into taches (id, projet_id, titre, assigne_id, statut, echeance, estimation_heures, cree_par_id, cree_le)
      values (${id}, ${pj ? PJ[pj] : null}, ${titre}, ${P[qui]}, ${statut}, ${jour(echeance)}, ${h}, ${P[par]}, ${moment(-6, 10)})`;
    await tx`insert into evenements_tache (tache_id, auteur_id, type, cree_le) values (${id}, ${P[par]}, 'creation', ${moment(-6, 10)})`;
  };
  await tacheConfiee("mv", "pd", "UR", "Ouvrir les flux du pare-feu pour l'environnement de test", "a_faire", 6, 4);
  await tacheConfiee("mv", "nc", "UR", "Contre-audit de sécurité (points 4 à 6)", "en_cours", 12, 24);
  await tacheConfiee("dj", "pd", "PR", "Accès VPN pour le prestataire de la plateforme", "a_faire", 3, 2);
  // Projet OC (Réseau) : des membres de la DPO y travaillent.
  await tache("sc", "OC", "Parcours d'ouverture de compte : maquettes", "en_cours", jour(8), [[2, "statut", "a_faire", "en_cours"]], null, { debut: jour(2), h: 12 });
  await tache("jd", "OC", "Pièces justificatives par type de client", "a_faire", jour(11), [], null, { debut: jour(8), h: 6 });
  await tache("wb", "OC", "Compte rendu du comité de suivi", "faite", jour(2), [[2, "statut", "a_faire", "faite"]], null, { h: 1 });

  // ---------- Tâches terminées des semaines passées (pour le bilan semaine sur semaine) ----------
  // Tirage déterministe : mêmes données à chaque semis.
  let graine = 7;
  const hasard = () => ((graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648);
  const TRAVAUX = {
    UR: ["Compte rendu du comité", "Correctifs de la validation métier", "Tests de non-régression", "Mise à jour du plan de lancement", "Revue des écrans avec le métier"],
    UN: ["Gabarits de pages", "Migration d'une rubrique", "Revue des contenus", "Tests d'accessibilité"],
    PR: ["Revue du cahier des charges", "Maquette d'un écran", "Atelier avec la DRH", "Compte rendu d'atelier"],
    CE: ["Support de formation", "Point avec une succursale", "Fiche produit révisée"],
    CR: ["Scénarios de validation métier", "Validation métier d'un module", "Procédure révisée"],
    UC: ["Spécification d'un écran", "Revue d'architecture", "Jeu de données de test"],
    AE: ["Lot d'archives indexé", "Registre numérisé", "Contrôle qualité d'un lot"],
  };
  const quiFaitQuoi = { dj: ["PR", "UR", "UN"], re: ["UR", "PR"], lp: ["UN", "CR"], wb: ["CE", "CR"], jn: ["UC", "CR"], sc: ["CE", "PR"], fm: ["AE"], jd: ["AE"], mv: ["UR"], ml: ["UC"] };
  for (let w = -7; w <= -1; w++) {
    for (const [qui, pjs] of Object.entries(quiFaitQuoi)) {
      const n = 1 + Math.floor(hasard() * (qui === "ml" || qui === "mv" ? 2 : 4)) + (qui === "dj" && w < -3 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const pj = pjs[Math.floor(hasard() * pjs.length)];
        const j = 7 * w + Math.floor(hasard() * 5);
        const retard = hasard() < 0.22;
        const echeance = jour(retard ? j - 1 - Math.floor(hasard() * 3) : j + Math.floor(hasard() * 3));
        const titre = TRAVAUX[pj][Math.floor(hasard() * TRAVAUX[pj].length)];
        await tache(qui, pj, titre, "faite", echeance, fait(j), null, { debut: jour(j - 2), h: [2, 3, 4, 6, 8][Math.floor(hasard() * 5)] });
      }
    }
  }

  // ---------- Journal des réunions (huit semaines, et une de la semaine prochaine) ----------
  // [titre, qui note, participants, jour dans la semaine (0 = lundi), heure, minutes, projet, semaines]
  const toutes = [-7, -6, -5, -4, -3, -2, -1, 0];
  const recurrentes = [
    ["Point hebdomadaire Solutions technologiques", "ml", ["ml", "dj", "lp", "re", "wb", "jn", "sc"], 0, "09:00", 60, null, toutes],
    ["Point de l'équipe Projets organisationnels", "mv", ["mv", "fm", "jd"], 0, "10:30", 45, null, toutes],
    ["Comité de pilotage UNIBANKOnline Retail", "mv", ["mv", "dj", "re", "na"], 2, "14:00", 90, "UR", [...toutes, 1]],
    ["Revue du portefeuille", "na", ["na", "ml", "mv", "ex"], 3, "10:00", 120, null, [-6, -4, -2, 0]],
    ["Point Credos avec le Crédit", "wb", ["wb", "lp", "jn"], 1, "10:30", 60, "CR", [-5, -4, -3, -2, -1, 0]],
    ["Atelier avec la DRH : plateforme de recrutement", "dj", ["dj", "sc", "re"], 3, "15:00", 120, "PR", [-3, -2, -1, 0, 1]],
    ["Formation du Réseau : compte sans livret", "sc", ["sc", "wb"], 2, "09:00", 180, "CE", [-2, 0]],
  ];
  const ponctuelles = [
    ["Démonstration d'UNIBANKOnline au Réseau", "mv", ["mv", "dj", "re", "na", "ex"], -2, 4, "11:00", 60, "UR", "Retours positifs ; demande d'un guide pour les clients."],
    ["Atelier sécurité avec la DTI", "dj", ["dj", "re", "ml", "pd", "nc"], 0, 1, "09:30", 120, "UR", "Points 1 à 3 de l'audit revus ; le point 3 reste ouvert."],
    ["Comité de suivi : ouverture de compte en ligne", "wb", ["wb", "sc", "jd", "ms"], 0, 2, "10:00", 60, "OC", "Maquettes du parcours présentées au Réseau ; liste des pièces à finaliser."],
    ["Entretien avec le prestataire du Corporate", "ml", ["ml", "jn"], -1, 2, "16:00", 60, "UC", ""],
    ["Comité de direction", "ex", ["ex", "na"], 0, 0, "15:00", 120, null, ""],
    ["Préparation du lancement pilote", "wb", ["wb", "sc", "mv"], 0, 3, "11:00", 45, "CE", ""],
  ];
  const reunion = async (titre, qui, avec, j, heure, minutes, pj, notes = "") => {
    const id = randomUUID();
    await tx`insert into reunions (id, titre, jour, heure, duree_minutes, projet_id, notes, notee_par_id, cree_le)
      values (${id}, ${titre}, ${jour(j)}, ${heure}, ${minutes}, ${pj ? PJ[pj] : null}, ${notes}, ${P[qui]}, ${moment(Math.min(j, 4), 18)})`;
    for (const k of new Set([qui, ...avec])) await tx`insert into participants_reunion (reunion_id, personne_id) values (${id}, ${P[k]})`;
  };
  for (const [titre, qui, avec, d, heure, minutes, pj, semaines] of recurrentes) for (const w of semaines) await reunion(titre, qui, avec, 7 * w + d, heure, minutes, pj);
  for (const [titre, qui, avec, w, d, heure, minutes, pj, notes] of ponctuelles) await reunion(titre, qui, avec, 7 * w + d, heure, minutes, pj, notes);

  // ---------- Équipes projet (établies par chaque chef de projet) ----------
  // Les personnes qui ont des tâches sur le projet, avec un rôle pour quelques-unes ; Joël rejoint UR sans tâche encore.
  const roles = { "UR:re": "Développeur", "UR:dj": "Audit de sécurité", "CE:sc": "Formation du Réseau", "UC:jn": "Analyste fonctionnel", "PR:re": "Développeur", "CR:jn": "Validation métier", "UR:pd": "Réseau (DTI)", "UR:nc": "Contre-audit de sécurité", "OC:sc": "Parcours client", "OC:jd": "Pièces justificatives" };
  const membres = await tx`select distinct t.projet_id, t.assigne_id from taches t join projets p on p.id = t.projet_id
    where p.chef_projet_id is distinct from t.assigne_id and p.referent_id is distinct from t.assigne_id`;
  const cleDe = Object.fromEntries([...Object.entries(PJ).map(([k, v]) => [v, k]), ...Object.entries(P).map(([k, v]) => [v, k])]);
  for (const m of membres) {
    const pr = projets.find((x) => PJ[x.k] === m.projet_id);
    const chef = pr?.referent ?? pr?.pm;
    await tx`insert into membres_projet (projet_id, personne_id, role, ajoute_par_id, ajoute_le)
      values (${m.projet_id}, ${m.assigne_id}, ${roles[`${cleDe[m.projet_id]}:${cleDe[m.assigne_id]}`] ?? ""}, ${chef ? P[chef] : null}, ${moment(-30, 9)})`;
  }
  await tx`insert into membres_projet (projet_id, personne_id, role, ajoute_par_id, ajoute_le) values (${PJ.UR}, ${P.jd}, ${"Communication clients"}, ${P.mv}, ${moment(-2, 11)})`;

  // ---------- Demandes de projet ----------
  // Une proposition de Joël Dorval, en attente de la direction ; une autre, de Sophonie Charles, refusée par Marc-Antoine Louis.
  await tx`insert into projets (id, code, titre, description, programme, strategique, statut, sante, chef_projet_id, date_entree, date_fin_initiale, date_fin_prevue, demande_par_id, demande_le, justification)
    values (${randomUUID()}, ${"TD"}, ${"Tableau de bord des délais de traitement"}, ${"Suivre, par succursale, le temps entre le dépôt d'un dossier et sa réponse."},
            ${""}, ${false}, ${"requete"}, ${"dans_les_temps"}, ${P.mv}, ${jour(0)}, ${jour(90)}, ${jour(90)}, ${P.jd}, ${moment(-1, 15)},
            ${"Les succursales demandent souvent où en est un dossier. Les délais ne sont mesurés nulle part ; un tableau de bord simple permettrait de repérer les blocages et de répondre aux clients."})`;
  await tx`insert into projets (id, code, titre, description, programme, strategique, statut, sante, chef_projet_id, date_entree, date_fin_initiale, date_fin_prevue, demande_par_id, demande_le, justification, decision_par_id, decision_le, motif_decision)
    values (${randomUUID()}, ${"GL"}, ${"Glossaire interactif des produits"}, ${"Un glossaire des produits du Réseau, consultable dans Uninet."},
            ${""}, ${false}, ${"refuse"}, ${"dans_les_temps"}, ${null}, ${jour(-10)}, ${null}, ${null}, ${P.sc}, ${moment(-10, 10)},
            ${"Les nouveaux employés du Réseau cherchent souvent la définition d'un produit."}, ${P.ml}, ${moment(-8, 14)},
            ${"Bonne idée, mais elle trouve sa place dans la refonte d'Uninet (UN) : à proposer à Ludovic comme fonctionnalité."})`;

  // ---------- Un projet terminé et archivé ----------
  const ancien = randomUUID();
  await tx`insert into projets (id, code, titre, description, programme, strategique, statut, sante, chef_projet_id, date_entree, date_fin_initiale, date_fin_prevue, archive_le, archive_par_id)
    values (${ancien}, ${"MS"}, ${"Migration de la messagerie"}, ${"Passage de toute la banque à la nouvelle messagerie."}, ${""}, ${false}, ${"finalise"}, ${"dans_les_temps"}, ${P.ml},
            ${"2025-09-01"}, ${"2026-03-31"}, ${"2026-04-30"}, ${moment(-60, 10)}, ${P.ml})`;
  await tx`insert into indicateurs (projet_id, ordre, libelle, etat, atteint_le) values (${ancien}, 1, ${"Boîtes migrées"}, ${"atteint"}, ${"2026-04-24"}), (${ancien}, 2, ${"Utilisateurs formés"}, ${"atteint"}, ${"2026-04-30"})`;

  // ---------- Modèles de rapport (configurés par les administrateurs) ----------
  // Mêmes formes que src/lib/modeles.ts. Le modèle par défaut reprend les quatre parties d'origine.
  const L = (id, libelle, rubrique, aide) => ({ id, type: "lignes", libelle, ...(aide ? { aide } : {}), rubrique, prerempli: true, parProjet: true, visibilite: "tous" });
  const SANTE = { id: "sante", type: "sante", libelle: "Santé de mes projets", aide: "Un feu par projet sur lequel vous avez des tâches.", obligatoire: true, prerempli: true, visibilite: "tous" };
  const QUATRE = [L("fait", "Fait", "fait"), L("en_cours", "En cours", "en_cours"), L("bloque", "Bloqué", "bloque"), L("prochaine", "La semaine prochaine", "prochaine")];
  const DEFAUT_V2 = [{ ...QUATRE[0], obligatoire: true }, QUATRE[1], QUATRE[2], SANTE, QUATRE[3]];
  // Le journal des réunions, repris dans le rapport : seul le supérieur direct en voit le détail.
  const REUNIONS = { id: "reunions", type: "reunions", libelle: "Mes réunions de la semaine", aide: "Reprises de votre journal des réunions ; ajoutez celles qui manquent avant d'envoyer.", visibilite: "superieur" };
  const DEFAUT_V3 = [...DEFAUT_V2, REUNIONS];
  const ST_V2 = [
    { ...QUATRE[0], obligatoire: true },
    QUATRE[1],
    L("bloque", "Bloqué", "bloque", "Ce qui vous arrête, et depuis quand."),
    SANTE,
    QUATRE[3],
    { id: "charge", type: "charge", libelle: "Ma charge", aide: "Proposée d'après vos tâches de la semaine prochaine ; corrigez-la si ce n'est pas votre ressenti.", obligatoire: true, prerempli: true, visibilite: "superieur" },
    { id: "decision", type: "texte", libelle: "Décision ou aide attendue", aide: "Une phrase : ce qu'il vous faut, et de qui.", rubrique: "decision", visibilite: "superieur" },
    REUNIONS,
    { id: "pieces", type: "piece_jointe", libelle: "Pièces jointes", aide: "Un compte rendu, une capture, un tableau : 10 Mo au plus par fichier.", visibilite: "tous" },
  ];
  const reprise = (id, libelle, r, aide) => ({ id, type: "reprise", libelle, ...(aide ? { aide } : {}), reprise: r, visibilite: "tous" });
  const CHEF_V1 = [
    { id: "mon_travail", type: "mon_travail", libelle: "Mon travail", aide: "Le formulaire de votre équipe, préparé à partir de vos propres tâches." },
    { id: "mon_equipe", type: "intertitre", libelle: "Mon équipe", aide: "Préparé à partir des rapports reçus. Vous gardez, retirez ou reformulez ; rien ne part sans vous." },
    reprise("a_decider", "À décider ou débloquer", "a_decider", "Repris des blocages et des décisions attendues. « Remonter » met l'élément en tête du rapport de votre supérieur."),
    { id: "synthese", type: "synthese", libelle: "Synthèse par projet", aide: "Proposée à partir des rapports reçus ; relisez-la, reformulez-la ou faites-la rédiger par l'assistant.", visibilite: "direction" },
    reprise("sante_equipe", "Santé des projets de l'équipe", "sante", "Le feu le plus préoccupant de l'équipe est proposé pour chaque projet ; vous pouvez le changer."),
    reprise("charge_equipe", "Charge de l'équipe", "charge"),
    reprise("fait_equipe", "Fait cette semaine", "fait"),
    reprise("prochaine_equipe", "La semaine prochaine", "prochaine"),
  ];
  const DIVISION_V1 = [
    { id: "mon_travail", type: "mon_travail", libelle: "Mon travail", aide: "Le formulaire de votre équipe, préparé à partir de vos propres tâches." },
    { id: "ma_division", type: "intertitre", libelle: "Ma division", aide: "Préparée à partir des rapports des chefs d'équipe, et de ceux des personnes sans chef d'équipe." },
    reprise("a_decider", "À décider", "a_decider", "Ce que les chefs d'équipe ont choisi de remonter, et les blocages des personnes sans chef d'équipe."),
    { id: "synthese", type: "synthese", libelle: "Synthèse de la division par projet", aide: "Les synthèses des chefs d'équipe, et ce qu'ont envoyé les personnes sans chef d'équipe.", visibilite: "direction" },
    reprise("sante_equipe", "Santé des projets de la division", "sante"),
    reprise("charge_equipe", "Charge de la division", "charge"),
    reprise("fait_equipe", "Fait cette semaine", "fait"),
    reprise("prochaine_equipe", "La semaine prochaine", "prochaine"),
  ];
  const deplier = (chef, individuel) =>
    chef.flatMap((c) =>
      c.type === "mon_travail"
        ? [{ id: c.id, type: "intertitre", libelle: c.libelle, aide: c.aide, partie: "travail" }, ...individuel.map((f) => ({ ...f, partie: "travail" }))]
        : [{ ...c, partie: "equipe" }],
    );
  const M = { defaut: randomUUID(), st: randomUUID(), chef: randomUUID(), division: randomUUID() };
  const V = { defaut1: randomUUID(), defaut2: randomUUID(), defaut3: randomUUID(), st1: randomUUID(), st2: randomUUID(), chef1: randomUUID(), division1: randomUUID() };
  await tx`insert into modeles_rapport (id, nom, description, genre, par_defaut, pour_chefs) values
    (${M.defaut}, 'Rapport du vendredi', 'Le modèle de toute personne sans autre modèle.', 'individuel', true, false),
    (${M.st}, 'Solutions technologiques', 'Avec la charge ressentie et les décisions attendues.', 'individuel', false, false),
    (${M.chef}, 'Rapport de chef d''équipe', 'Son travail, puis la synthèse préremplie de son équipe.', 'chef', false, true),
    (${M.division}, 'Rapport de la division', 'Son travail, puis la synthèse de la division.', 'chef', false, false)`;
  const version = (id, modele, numero, champs, statut, note, jourPublie) =>
    tx`insert into versions_modele (id, modele_id, numero, champs, statut, note, creee_par_id, publiee_le, publiee_par_id)
      values (${id}, ${modele}, ${numero}, ${sql.json(champs)}, ${statut}, ${note}, ${P.jn}, ${`${jourPublie}T09:00:00-04:00`}, ${P.jn})`;
  await version(V.defaut1, M.defaut, 1, QUATRE, "archivee", "Les quatre parties d'origine.", "2026-01-12");
  await version(V.defaut2, M.defaut, 2, DEFAUT_V2, "archivee", "Ajoute « Santé de mes projets ».", "2026-10-05");
  await version(V.defaut3, M.defaut, 3, DEFAUT_V3, "publiee", "Ajoute « Mes réunions de la semaine » (supérieur seulement).", jour(0));
  await version(V.st1, M.st, 1, DEFAUT_V2, "archivee", "Comme le modèle par défaut.", "2026-10-05");
  await version(V.st2, M.st, 2, ST_V2, "publiee", "Ajoute « Ma charge », « Décision ou aide attendue », « Mes réunions de la semaine » et les pièces jointes.", jour(0));
  // Solutions technologiques : rapport attendu plus tôt le vendredi.
  await tx`update modeles_rapport set horaires = ${sql.json({ pret: { jour: 5, heure: "09:00" }, rappel: { jour: 5, heure: "13:00" }, limite: { jour: 5, heure: "16:00" } })} where id = ${M.st}`;
  await version(V.chef1, M.chef, 1, CHEF_V1, "publiee", "Son travail, puis son équipe : à décider, santé, charge, fait, la semaine prochaine.", jour(0));
  await version(V.division1, M.division, 1, DIVISION_V1, "publiee", "Son travail, puis sa division.", jour(0));
  await tx`insert into affectations_modele (modele_id, equipe_id) values (${M.st}, ${E.st})`;
  await tx`insert into affectations_modele (modele_id, personne_id) values (${M.division}, ${P.na})`;

  // ---------- Rapports déjà envoyés cette semaine ----------
  // [type, champ, projet, texte] ; ["feu", projet, valeur, phrase] ; ["charge", valeur, propose, calcul] ; ["texte", champ, valeur]
  const rapport = async (qui, dest, heure, formulaire, versionId, contenu) => {
    const id = randomUUID();
    await tx`insert into rapports_hebdo (id, auteur_id, semaine, statut, destinataire_id, envoye_le, parties_relues, version_modele_id, formulaire)
      values (${id}, ${P[qui]}, ${jour(0)}, 'envoye', ${P[dest]}, ${moment(4, heure)}, ${tx.array(formulaire.filter((c) => !["intertitre", "note"].includes(c.type)).map((c) => c.id))}, ${versionId}, ${sql.json(formulaire)})`;
    const lignes = {};
    let o = 0;
    for (const x of contenu) {
      if (x[0] === "ligne") {
        const [, champ, pj, texte, extra = {}] = x;
        o += 1;
        const c = formulaire.find((f) => f.id === champ);
        const lid = randomUUID();
        lignes[extra.cle ?? lid] = lid;
        await tx`insert into lignes_rapport (id, rapport_id, champ_id, partie, texte, projet_id, ordre, origines, auteurs_origine, remonte, visibilite, depuis_semaine)
          values (${lid}, ${id}, ${champ}, ${extra.partie ?? (c.rubrique && c.rubrique !== "autre" ? c.rubrique : null)}, ${texte}, ${pj ? PJ[pj] : null}, ${o},
                  ${`{${(extra.origines ?? []).join(",")}}`}::text[], ${`{${(extra.auteurs ?? []).map((k) => P[k]).join(",")}}`}::uuid[], ${extra.remonte ?? false}, ${extra.visibilite ?? null}, ${extra.depuis ?? null})`;
      } else if (x[0] === "feu") {
        const [, pj, valeur, phrase = "", champ = "sante", propose = valeur] = x;
        await tx`insert into reponses_rapport (rapport_id, champ_id, projet_id, valeur, commentaire, propose) values (${id}, ${champ}, ${PJ[pj]}, ${valeur}, ${phrase}, ${propose})`;
      } else if (x[0] === "charge") {
        const [, valeur, propose, calcul, champ = "charge"] = x;
        await tx`insert into reponses_rapport (rapport_id, champ_id, valeur, commentaire, propose) values (${id}, ${champ}, ${valeur}, ${calcul}, ${propose})`;
      } else if (x[0] === "texte") {
        const [, champ, valeur] = x;
        await tx`insert into reponses_rapport (rapport_id, champ_id, valeur) values (${id}, ${champ}, ${valeur})`;
      } else if (x[0] === "synthese") {
        const [, pj, valeur, champ = "synthese"] = x;
        await tx`insert into reponses_rapport (rapport_id, champ_id, projet_id, valeur, propose) values (${id}, ${champ}, ${PJ[pj]}, ${valeur}, ${valeur})`;
      } else if (x[0] === "piece") {
        const [, champ, nom, contenu] = x;
        const empreinte = createHash("sha256").update(contenu).digest("hex");
        await tx`insert into pieces_jointes (rapport_id, champ_id, nom, type, taille, empreinte, contenu, depose_par_id, cree_le)
          values (${id}, ${champ}, ${nom}, 'application/pdf', ${contenu.length}, ${empreinte}, ${contenu}, ${P[qui]}, ${moment(4, heure - 1)})`;
      }
    }
    return { id, lignes };
  };
  // Solutions technologiques : trois rapports reçus par Marc-Antoine sur six (Daphnée, Sophonie et lui-même pas encore).
  await rapport("re", "ml", 11, ST_V2, V.st2, [
    ["ligne", "fait", "UR", "Tests du module de virements"],
    ["ligne", "fait", "PR", "Environnement de développement"],
    ["ligne", "prochaine", "UR", "Correctifs du module de virements, lundi"],
    ["feu", "UR", "dans_les_temps"],
    ["feu", "PR", "dans_les_temps"],
    ["charge", "normale", "normale", "30 h sur 40 h"],
  ]);
  await rapport("lp", "ml", 9, ST_V2, V.st2, [
    ["ligne", "en_cours", "UN", "Plan de migration des données"],
    // Un blocage qui dure : signalé il y a deux semaines, reconduit depuis.
    ["ligne", "bloque", "CR", "Serveur de test demandé à la DTI lundi", { depuis: jour(-14) }],
    ["ligne", "prochaine", "UN", "Valider le plan de migration avec la DTI"],
    ["feu", "UN", "a_surveiller", "Plan de migration à valider avec la DTI", "sante", "a_surveiller"],
    ["feu", "CR", "en_retard", "Le serveur de test n'est toujours pas là", "sante", "dans_les_temps"],
    ["charge", "trop_lourde", "normale", "24 h sur 40 h"],
    ["texte", "decision", "Valider le report de la validation métier de Credos au 13 novembre"],
    ["piece", "pieces", "Demande-serveur-test-Credos.pdf", pdfSimple("Demande de serveur de test - Credos", ["Demande adressée à la DTI le lundi.", "Serveur attendu pour la validation métier du module de garanties.", "Sans serveur, la validation métier passe au 13 novembre."])],
  ]);
  await rapport("wb", "ml", 8, ST_V2, V.st2, [
    ["ligne", "fait", "CE", "Planning de la phase pilote"],
    ["ligne", "en_cours", "CR", "Validation métier avec le Crédit"],
    ["ligne", "bloque", "CE", "Date de la phase pilote : le Réseau n'a pas répondu"],
    ["ligne", "prochaine", "CE", "Présenter le planning au Réseau"],
    ["feu", "CE", "a_surveiller", "Date de la phase pilote à obtenir du Réseau"],
    ["feu", "CR", "dans_les_temps"],
    ["charge", "lourde", "trop_lourde", "45 h sur 40 h"],
  ]);
  await rapport("jn", "ml", 12, ST_V2, V.st2, [
    ["ligne", "fait", "CR", "Jeux de données de test"],
    ["ligne", "en_cours", "UC", "Spécifications du module de paie"],
    ["ligne", "prochaine", "UC", "Spécifications des virements de masse"],
    ["feu", "UC", "dans_les_temps"],
    ["feu", "CR", "dans_les_temps"],
    ["charge", "legere", "normale", "16 h sur 32 h"],
  ]);
  // Projets organisationnels : Fabienne et Joël ont envoyé ; Myriam a envoyé son rapport de cheffe d'équipe à Nadège.
  const fm = await rapport("fm", "mv", 10, DEFAUT_V2, V.defaut2, [
    ["ligne", "fait", "AE", "Archives du 2e étage : 60 % transférées", { cle: "fait" }],
    ["ligne", "prochaine", "AE", "Poursuivre le transfert du 2e étage", { cle: "prochaine" }],
    ["feu", "AE", "dans_les_temps"],
  ]);
  const jd = await rapport("jd", "mv", 9, DEFAUT_V2, V.defaut2, [
    ["ligne", "fait", "AE", "Numérisation des registres 2017", { cle: "fait" }],
    ["ligne", "bloque", "AE", "Scanner du 3e étage en panne depuis mercredi", { cle: "bloque" }],
    ["ligne", "prochaine", "AE", "Registres 2018", { cle: "prochaine" }],
    ["feu", "AE", "a_surveiller", "Scanner en panne : la numérisation est arrêtée"],
  ]);
  const MV = deplier(CHEF_V1, DEFAUT_V2);
  const chargePO = JSON.stringify({ calcule: { libre: 0, normale: 2, chargee: 0, surchargee: 0 }, ressenti: { legere: 0, normale: 0, lourde: 0, trop_lourde: 0, aucun: 2 } });
  await rapport("mv", "na", 14, MV, V.chef1, [
    ["ligne", "fait", "UR", "Comité de projet UNIBANKOnline Retail"],
    ["ligne", "en_cours", "UR", "Plan de lancement révisé"],
    ["ligne", "prochaine", "UR", "Plan de lancement révisé : version pour la direction"],
    ["feu", "UR", "a_surveiller", "Audit de sécurité à repasser avant le lancement"],
    ["ligne", "a_decider", "AE", "Scanner du 3e étage en panne depuis mercredi", { partie: "bloque", origines: [`l:${jd.lignes.bloque}`], auteurs: ["jd"], remonte: true }],
    ["ligne", "fait_equipe", "AE", "Archives du 2e étage : 60 % transférées", { partie: "fait", origines: [`l:${fm.lignes.fait}`], auteurs: ["fm"] }],
    ["ligne", "fait_equipe", "AE", "Numérisation des registres 2017", { partie: "fait", origines: [`l:${jd.lignes.fait}`], auteurs: ["jd"] }],
    ["ligne", "prochaine_equipe", "AE", "Poursuivre le transfert du 2e étage", { partie: "prochaine", origines: [`l:${fm.lignes.prochaine}`], auteurs: ["fm"] }],
    ["ligne", "prochaine_equipe", "AE", "Registres 2018", { partie: "prochaine", origines: [`l:${jd.lignes.prochaine}`], auteurs: ["jd"] }],
    ["feu", "AE", "a_surveiller", "FM : dans les temps · JD : à surveiller", "sante_equipe", "a_surveiller"],
    ["feu", "UR", "a_surveiller", "MV : à surveiller", "sante_equipe", "a_surveiller"],
    ["charge", chargePO, null, "2 personne(s)", "charge_equipe"],
    ["synthese", "AE", "Le transfert du 2e étage atteint 60 % et les registres 2017 sont numérisés. La numérisation est arrêtée depuis mercredi : le scanner du 3e étage est en panne."],
    ["synthese", "UR", "Le plan de lancement révisé est en cours. L'audit de sécurité est à repasser avant le lancement."],
  ]);
  // Organisation et méthodes : pas de chef d'équipe, les rapports vont directement à Nadège.
  await rapport("gp", "na", 13, DEFAUT_V2, V.defaut2, [
    ["ligne", "en_cours", null, "Procédure d'ouverture de compte, version 2"],
    ["ligne", "bloque", null, "Validation de la procédure : en attente de la Conformité depuis deux semaines"],
    ["ligne", "prochaine", null, "Procédure d'ouverture de compte : présentation au Réseau"],
  ]);
  await rapport("tl", "na", 15, DEFAUT_V2, V.defaut2, [
    ["ligne", "fait", null, "Cartographie des processus du Crédit : première partie"],
    ["ligne", "prochaine", null, "Cartographie : ateliers avec le Crédit"],
  ]);

  // ---------- Historique : rapports des six semaines précédentes ----------
  // [texte, projet] par partie. Chaque semaine prend quelques lignes, en tournant dans la liste.
  const RESERVES = {
    dj: {
      fait: [["Atelier de cadrage avec la DRH", "PR"], ["Maquettes de la page d'accueil, première version", "UN"], ["Revue des exigences de sécurité avec l'auditeur", "UR"], ["Comparatif des plateformes de recrutement", "PR"], ["Compte rendu du comité de projet", "UR"], ["Parcours du candidat dessiné", "PR"]],
      en_cours: [["Cahier des charges de la plateforme de recrutement", "PR"], ["Préparation de l'audit de sécurité", "UR"], ["Maquettes de l'intranet", "UN"]],
      bloque: [["Accès à l'environnement de test : demande en attente à la DTI", "UN"]],
      prochaine: [["Finaliser le parcours du candidat", "PR"], ["Présenter les maquettes à la DRH", "PR"], ["Préparer l'audit de sécurité", "UR"]],
    },
    re: {
      fait: [["Écrans de saisie du module de virements", "UR"], ["Correction des anomalies de la validation métier", "UR"], ["Revue de code avec le prestataire", "UR"], ["Tests unitaires du module de virements", "UR"], ["Intégration continue en place", "PR"]],
      en_cours: [["Module de virements", "UR"], ["Environnement de développement de la plateforme", "PR"]],
      bloque: [],
      prochaine: [["Terminer les tests du module de virements", "UR"], ["Démarrer le formulaire de candidature", "PR"]],
    },
    lp: {
      fait: [["Inventaire des contenus de l'intranet", "UN"], ["Réunion de cadrage avec la DTI", "UN"], ["Plan de migration, première version", "UN"], ["Validation métier du module de garanties", "CR"]],
      en_cours: [["Plan de migration des données", "UN"], ["Spécifications de la recherche dans l'intranet", "UN"]],
      bloque: [["Serveur de test Credos : demande en cours à la DTI", "CR"]],
      prochaine: [["Valider le plan de migration", "UN"], ["Préparer la validation métier de Credos", "CR"]],
    },
    wb: {
      fait: [["Présentation du produit aux responsables du Réseau", "CE"], ["Planning de la phase pilote, version de travail", "CE"], ["Validation des écrans Credos avec le Crédit", "CR"], ["Choix des succursales pilotes", "CE"]],
      en_cours: [["Planning de la phase pilote", "CE"], ["Procédures Credos", "CR"]],
      bloque: [],
      prochaine: [["Valider les succursales pilotes", "CE"], ["Rédiger les procédures Credos", "CR"]],
    },
    sc: {
      fait: [["Supports de formation, module 1", "CE"], ["Glossaire des produits, première version", null], ["Questionnaire de satisfaction des formations", "CE"]],
      en_cours: [["Supports de formation du Réseau", "CE"]],
      bloque: [["Cahier des charges : signature de la DRH attendue", "PR"]],
      prochaine: [["Supports de formation, module 2", "CE"]],
    },
    jn: {
      fait: [["Spécifications des virements de masse, première partie", "UC"], ["Jeux de données de test", "CR"], ["Maquettes des écrans de paie validées", "UC"]],
      en_cours: [["Spécifications du module de paie", "UC"]],
      bloque: [],
      prochaine: [["Spécifications du module de paie, suite", "UC"]],
    },
    mv: {
      fait: [["Point d'avancement avec le prestataire", "UR"], ["Comité de projet UNIBANKOnline Retail", "UR"], ["Plan de communication validé", "UR"]],
      en_cours: [["Plan de lancement révisé", "UR"]],
      bloque: [["Nouvelle date d'audit : réponse de l'auditeur attendue", "UR"]],
      prochaine: [["Fixer la date du nouveau passage d'audit", "UR"]],
    },
    fm: {
      fait: [["Archives du 1er étage transférées", "AE"], ["Indexation des dossiers de 2018", "AE"]],
      en_cours: [["Transfert des archives du 2e étage", "AE"]],
      bloque: [],
      prochaine: [["Poursuivre le transfert du 2e étage", "AE"]],
    },
    jd: {
      fait: [["Numérisation des registres 2015 et 2016", "AE"]],
      en_cours: [["Numérisation des registres 2017", "AE"]],
      bloque: [],
      prochaine: [["Registres 2018", "AE"]],
    },
    ml: {
      fait: [["Comité de direction Solutions technologiques", null], ["Revue d'architecture UNIBANKOnline Corporate", "UC"], ["Arbitrage des priorités de l'équipe", null]],
      en_cours: [["Recrutement d'un développeur", null]],
      bloque: [],
      prochaine: [["Revue d'architecture avec le prestataire", "UC"]],
    },
    na: {
      fait: [["Revue du portefeuille avec les chefs de projet", null], ["Préparation du rapport au conseil", null], ["Point budgétaire avec la Finance", null]],
      en_cours: [["Plan annuel de la division", null]],
      bloque: [],
      prochaine: [["Rapport au conseil du mois", null]],
    },
  };
  const SUP = Object.fromEntries(gens.map(([k, , , , , sup]) => [k, sup]));
  SUP.gp = "na"; SUP.tl = "na"; // équipe sans responsable : les rapports remontent à la directrice
  // Semaines sans rapport, pour que l'historique ressemble à la réalité.
  const MANQUE = new Set(["lp:3", "sc:2", "jd:4", "tl:5", "re:6"]);
  const prendre = (liste, debut, n) => (liste.length ? Array.from({ length: Math.min(n, liste.length) }, (_, i) => liste[(debut + i) % liste.length]) : []);
  for (let w = 1; w <= 6; w++) {
    const lundiW = jour(-7 * w);
    for (const [qui, R] of Object.entries(RESERVES)) {
      if (MANQUE.has(`${qui}:${w}`)) continue;
      const id = randomUUID();
      const heureEnvoi = 13 + ((w * 7 + [...qui].reduce((x, c) => x + c.charCodeAt(0), 0)) % 5);
      await tx`insert into rapports_hebdo (id, auteur_id, semaine, statut, destinataire_id, envoye_le, parties_relues, cree_le)
        values (${id}, ${P[qui]}, ${lundiW}, 'envoye', ${SUP[qui] ? P[SUP[qui]] : null}, ${moment(4 - 7 * w, heureEnvoi)}, ${tx.array(["fait", "en_cours", "bloque", "prochaine"])}, ${moment(-7 * w, 9)})`;
      let lignes = [
        ...prendre(R.fait, w, 2 + (w % 2)).map(([t, pj]) => ["fait", t, pj, null]),
        ...prendre(R.en_cours, w, 1 + (w % 2)).map(([t, pj]) => ["en_cours", t, pj, null]),
        ...(w % 2 === 0 ? prendre(R.bloque, w, 1) : []).map(([t, pj]) => ["bloque", t, pj, null]),
        ...prendre(R.prochaine, w, 2).map(([t, pj]) => ["prochaine", t, pj, null]),
      ];
      // La semaine dernière de Daphnée : ce qu'elle avait prévu, à reprendre dans son rapport de cette semaine.
      if (qui === "dj" && w === 1) {
        lignes = [
          ["fait", "Préparation de l'audit de sécurité", "UR", null],
          ["fait", "Revue des exigences de sécurité avec l'auditeur", "UR", null],
          ["en_cours", "Maquettes de l'accueil, la moitié des écrans", "UN", T.accueil],
          ["prochaine", "Point 3 de l'audit de sécurité", "UR", T.audit3],
          ["prochaine", "Maquettes de l'accueil", "UN", T.accueil],
          ["prochaine", "Cahier des charges, version 1", "PR", T.cdc],
          ["prochaine", "Préparer l'atelier avec les utilisateurs de la DRH", "PR", null],
          ["prochaine", "Relancer la DTI pour les accès de test", "UN", null],
        ];
      }
      // La semaine dernière de Daphnée : son accès de test était déjà bloqué (il revient, « 2ᵉ semaine »).
      if (qui === "dj" && w === 1) lignes.push(["bloque", "Accès de test DTI : identifiants demandés à la DTI", "UN", T.acces]);
      // La semaine dernière de Ludovic : le serveur de test déjà bloqué, et ses feux (la tendance se lit cette semaine).
      if (qui === "lp" && w === 1) {
        lignes.push(["bloque", "Serveur de test Credos : relance faite à la DTI", "CR", null, jour(-14)]);
        await tx`update rapports_hebdo set formulaire = ${sql.json(DEFAUT_V2)}, version_modele_id = ${V.st1} where id = ${id}`;
        await tx`insert into reponses_rapport (rapport_id, champ_id, projet_id, valeur, commentaire, propose) values (${id}, 'sante', ${PJ.CR}, 'dans_les_temps', '', 'dans_les_temps'), (${id}, 'sante', ${PJ.UN}, 'a_surveiller', 'Plan de migration à valider avec la DTI', 'a_surveiller')`;
      }
      let o = 0;
      for (const [partie, texte, pj, tacheId, depuis = null] of lignes) {
        o += 1;
        await tx`insert into lignes_rapport (rapport_id, champ_id, partie, texte, projet_id, tache_id, ordre, depuis_semaine) values (${id}, ${partie}, ${partie}, ${texte}, ${pj ? PJ[pj] : null}, ${tacheId}, ${o}, ${depuis})`;
      }
    }
  }

  // ---------- Réunions figées dans les rapports déjà envoyés (comme à l'envoi) ----------
  const envoyes = await tx`select id, auteur_id, semaine, formulaire from rapports_hebdo where statut = 'envoye'`;
  for (const r of envoyes) {
    const champs = (r.formulaire ?? []).filter((c) => c.type === "reunions");
    if (!champs.length) continue;
    const lundi = typeof r.semaine === "string" ? r.semaine : r.semaine.toISOString().slice(0, 10);
    const liste = await tx`select r.titre, r.jour::text as jour, r.heure, r.duree_minutes, p.code,
        (select count(*)::int from participants_reunion x where x.reunion_id = r.id) as n
      from reunions r join participants_reunion pr on pr.reunion_id = r.id left join projets p on p.id = r.projet_id
      where pr.personne_id = ${r.auteur_id} and r.jour between ${lundi}::date and ${lundi}::date + 6 order by r.jour, r.heure`;
    const valeur = { minutes: liste.reduce((s, x) => s + x.duree_minutes, 0), reunions: liste.map((x) => ({ titre: x.titre, jour: x.jour, heure: x.heure, minutes: x.duree_minutes, projet: x.code, avec: x.n - 1 })) };
    for (const c of champs) await tx`insert into reponses_rapport (rapport_id, champ_id, valeur, commentaire) values (${r.id}, ${c.id}, ${JSON.stringify(valeur)}, ${`${liste.length} réunion(s)`})`;
  }

  // ---------- Un rapport ponctuel au conseil, la semaine dernière (préparé par Nadège, approuvé par Frantz) ----------
  const RP = randomUUID();
  await tx`insert into rapports_conseil (id, genre, titre, objet, date_rapport, depuis, cree_par_id, statut, approuve_par_id, approuve_le, cree_le)
    values (${RP}, 'ponctuel', 'Point de situation après la panne du réseau du 21 octobre',
            'Demande du président du conseil : effets de la panne de vingt heures sur les projets des services en ligne.',
            ${jour(-4)}, ${premierDuMois(0)}, ${P.na}, 'approuve', ${P.ex}, ${moment(-4, 17)}, ${moment(-4, 10)})`;
  const ETATS_PONCTUEL = {
    UR: "La panne a interrompu deux jours de tests du module de virements ; ils reprennent cette semaine. L'audit de sécurité reste la condition du lancement.",
    UC: "Aucun effet sur le calendrier : l'environnement de développement n'était pas touché. Le développement se poursuit.",
    CE: "La présentation au Réseau est reportée d'une semaine ; la date de la phase pilote n'est pas encore fixée.",
  };
  let ordreP = 0;
  for (const k of ["UR", "UC", "CE"]) {
    const pr = projets.find((x) => x.k === k);
    ordreP += 1;
    await tx`insert into lignes_conseil (rapport_id, projet_id, ordre, etat_avancement, date_fin_dernier_rapport, nouvelle_date_fin, date_lancement)
      values (${RP}, ${PJ[k]}, ${ordreP}, ${ETATS_PONCTUEL[k]}, ${pr.dernier?.fin ?? null}, ${pr.fin}, ${pr.lancement})`;
  }

  await tx`insert into journal (action, objet, details) values ('donnees_exemple', 'base', ${sql.json({ personnes: gens.length, projets: projets.length, version: VERSION_DONNEES_EXEMPLE })})`;
});

console.log(`Données d'exemple créées : ${gens.length} personnes.`);
console.log(`Connexion : prenom.nom@demo.dpo.local, par exemple :`);
console.log(`  daphnee.joseph@demo.dpo.local       chargée de projets (ses tâches, son rapport)`);
console.log(`  marc-antoine.louis@demo.dpo.local   directeur (sa direction : Solutions technologiques)`);
console.log(`  nadege.augustin@demo.dpo.local      directrice et administratrice (toute la division)`);
console.log(`  frantz.desrosiers@demo.dpo.local    exécutif et administrateur (voit tout, approuve le rapport au conseil)`);
console.log(`  jean-robert.noel@demo.dpo.local     analyste et administrateur`);
console.log(`  nathalie.celestin@demo.dpo.local    consultante hors division (accès limité : ses tâches, ses projets)`);
console.log(`Mot de passe commun de démonstration : ${motDePasse}`);
await sql.end();
