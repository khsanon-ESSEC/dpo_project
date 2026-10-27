// Remplit une base VIDE avec des données d'exemple (personnes fictives, projets réels de la DPO).
// Usage : DATABASE_URL=... node scripts/semer.mjs [--mot-de-passe=XXXX]
// Refuse de tourner si la base contient déjà des personnes : ne jamais l'utiliser en production.
import postgres from "postgres";
import { hash } from "@node-rs/argon2";
import { randomUUID } from "node:crypto";

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
const premierDuMois = (decalageMois) => {
  const d = new Date(Date.UTC(auj.getUTCFullYear(), auj.getUTCMonth() + decalageMois, 1));
  return d.toISOString().slice(0, 10);
};

const empreinte = await hash(motDePasse, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

// ---------- Équipes et personnes (noms fictifs) ----------
const E = Object.fromEntries(["dir", "st", "po", "om", "ca"].map((k) => [k, randomUUID()]));
const P = {};
// [clé, prénom, nom, poste, équipe, supérieur, rôles réglés à la main]
// Exemple de cumul : Jean-Robert Noël, analyste, est aussi administrateur de l'application.
// Frantz Desrosiers (exécutif et administrateur : lui seul peut donner le rôle Exécutif) voit tout ; Nadège Augustin voit toute la division ; Marc-Antoine Louis, sa seule équipe.
const gens = [
  ["ex", "Frantz", "Desrosiers", "Vice-président exécutif", null, null, ["executif", "administrateur"]],
  ["na", "Nadège", "Augustin", "Directrice de la division", "dir", "ex", ["directeur", "administrateur"]],
  ["ml", "Marc-Antoine", "Louis", "Directeur Solutions technologiques", "st", "na", ["directeur"]],
  ["mv", "Myriam", "Valcin", "Cheffe d'équipe, Projets organisationnels", "po", "na", []],
  ["ej", "Évelyne", "Jean", "Cheffe du centre d'appels", "ca", "na", []],
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
  ["rp", "Rose-Marie", "Pierre", "Opératrice", "ca", "ej", []],
  ["ps", "Patrick", "Simon", "Opérateur", "ca", "ej", []],
  ["nl", "Nadia", "Laguerre", "Opératrice", "ca", "ej", []],
];
for (const [k] of gens) P[k] = randomUUID();
const sansAccent = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z-]/g, "");

await sql.begin(async (tx) => {
  for (const [k, nom] of [["dir", "Direction de la division"], ["st", "Solutions technologiques"], ["po", "Projets organisationnels"], ["om", "Organisation et méthodes"], ["ca", "Centre d'appels"]]) {
    await tx`insert into equipes (id, nom, equipe_parente_id) values (${E[k]}, ${nom}, ${k === "dir" ? null : E.dir})`;
  }
  for (const [k, prenom, nom, poste, eq, , roles] of gens) {
    await tx`insert into personnes (id, prenom, nom, courriel, poste, equipe_id, directeur, executif, administrateur, mot_de_passe_hash, doit_changer_mot_de_passe)
      values (${P[k]}, ${prenom}, ${nom}, ${`${sansAccent(prenom)}.${sansAccent(nom)}@demo.dpo.local`}, ${poste}, ${eq ? E[eq] : null},
              ${roles.includes("directeur")}, ${roles.includes("executif")}, ${roles.includes("administrateur")}, ${empreinte}, false)`;
  }
  for (const [k, , , , , sup] of gens) {
    if (sup) await tx`update personnes set superieur_id = ${P[sup]} where id = ${P[k]}`;
  }
  // Responsables d'équipe. « Organisation et méthodes » : poste vacant.
  for (const [eq, chef] of [["dir", "na"], ["st", "ml"], ["po", "mv"], ["ca", "ej"]]) {
    await tx`update equipes set chef_id = ${P[chef]} where id = ${E[eq]}`;
  }

  // ---------- Projets (titres et indicateurs : documents de la DPO ; dates d'octobre : exemple) ----------
  const projets = [
    {
      k: "UR", titre: "Nouvelle version UNIBANKOnline Retail", strat: true, pm: "mv", sante: "en_retard",
      description: "La nouvelle plateforme propose une meilleure présentation des fonctionnalités et permettra aux clients d'accéder plus facilement aux services de banque en ligne.",
      entree: "2024-06-25", initiale: "2025-07-31", fin: "2026-11-26", lancement: "2026-12-10",
      ind: [["Conception graphique réalisée", "atteint"], ["Modèle conceptuel validé", "atteint"], ["Consultant pour le développement sélectionné et contrat signé", "atteint"], ["Application développée", "atteint"], ["Planification de la stratégie commerciale", "atteint"], ["Audit de sécurité effectué et passé", "en_cours"], ["Plan de lancement finalisé et approuvé", "atteint"], ["Plan de communication approuvé", "atteint"], ["Application mise en ligne", "a_venir"]],
      dernier: { fin: "2026-10-29", lancement: "2026-11-12", etat: "Un déploiement en mode « Early adopter » a été effectué le 15 avril 2026. Plus de 2000 clients l'utilisent actuellement. Le déploiement a dû être suspendu afin de procéder à certains renforcements de la sécurité du système face aux nouvelles menaces de cyberattaques." },
    },
    {
      k: "CE", titre: "Compte d'épargne sans livret", strat: true, pm: "wb", sante: "a_surveiller",
      description: "Permettre aux succursales d'offrir aux nouveaux déposants un compte d'épargne sans livret, et aux détenteurs de la carte de débit UNIBANK de ne plus utiliser de livret.",
      entree: "2023-05-13", initiale: "2025-09-26", fin: "2026-11-26", lancement: "2026-12-10",
      ind: [["Concept du nouveau produit validé", "atteint"], ["Exigences de développement informatique définies", "atteint"], ["Stratégie d'implémentation mise en place", "atteint"], ["Formations réalisées", "en_cours"], ["Plan de communication défini", "a_venir"]],
      dernier: { fin: "2026-11-26", lancement: "2026-12-10", etat: "Les phases de conception et d'implémentation ont été achevées. Le produit a été présenté aux responsables du réseau. Des séances de travail sont en cours avec le Réseau en vue de planifier une phase pilote." },
    },
    {
      k: "UC", titre: "Nouvelle version UNIBANKOnline Corporate", strat: true, pm: "ml", sante: "dans_les_temps",
      description: "La nouvelle version vise à offrir une meilleure expérience aux utilisateurs avec une interface plus conviviale et avec plus de fonctionnalités.",
      entree: "2024-12-19", initiale: "2025-12-19", fin: "2026-12-18", lancement: "2027-02-27",
      ind: [["Maquettes graphiques validées", "atteint"], ["Architecture du système validée", "atteint"], ["Développeurs affectés", "atteint"], ["Développement terminé", "en_cours"], ["Tests utilisateurs réalisés", "a_venir"], ["Audit de sécurité passé", "a_venir"], ["Formation des chargés de clientèle", "a_venir"], ["Plan de communication approuvé", "a_venir"], ["Application mise en ligne", "a_venir"]],
      dernier: { fin: "2026-12-18", lancement: "2027-02-27", etat: "Les phases de conception des maquettes graphiques, de l'architecture du système ainsi que le développement sont en cours." },
    },
    {
      k: "UN", titre: "Refonte Uninet", strat: false, pm: "lp", sante: "a_surveiller",
      description: "Refonte du portail intranet Uninet.", entree: "2025-03-03", initiale: "2026-12-31", fin: "2027-01-15", lancement: null,
      ind: [["Refonte graphique", "atteint"], ["Refonte de la base de données", "atteint"], ["Intégration avec TMS", "en_cours"], ["Migration des données existantes", "a_venir"], ["Statistiques (rapports et tableau de bord Uninet)", "a_venir"]],
    },
    {
      k: "CR", titre: "Refonte Credos", strat: false, pm: "wb", sante: "dans_les_temps",
      description: "Nouvelle version de l'application de suivi des dossiers de crédit.", entree: "2025-06-02", initiale: "2026-12-04", fin: "2026-12-04", lancement: null,
      ind: [["Besoins validés avec le Crédit", "atteint"], ["Maquettes validées", "atteint"], ["Développement terminé", "atteint"], ["Recette réalisée", "en_cours"], ["Mise en production", "a_venir"], ["Formation des utilisateurs", "a_venir"]],
    },
    {
      k: "PR", titre: "Plateforme de recrutement", strat: false, pm: "dj", sante: "dans_les_temps",
      description: "Plateforme de dépôt et de suivi des candidatures.", entree: "2026-05-04", initiale: "2027-01-29", fin: "2027-01-29", lancement: null,
      ind: [["Cahier des charges validé", "en_cours"], ["Maquettes du formulaire de candidature", "atteint"], ["Choix de la solution", "atteint"], ["Développement terminé", "a_venir"], ["Tests avec la DRH", "a_venir"], ["Mise en ligne", "a_venir"]],
    },
    {
      k: "AE", titre: "Système d'archivage électronique", strat: false, pm: "fm", sante: "dans_les_temps", statut: "continu",
      description: "Numérisation, indexation et classement des archives.", entree: "2015-11-02", initiale: "2016-05-31", fin: null, lancement: null,
      ind: [["Existant analysé", "atteint"], ["Solution adaptée retenue", "atteint"], ["Rapport d'évaluation des solutions présenté", "atteint"], ["Archives physiques transférées", "en_cours"]],
    },
  ];
  const PJ = {};
  for (const p of projets) {
    PJ[p.k] = randomUUID();
    await tx`insert into projets (id, code, titre, description, programme, strategique, statut, sante, chef_projet_id, date_entree, date_fin_initiale, date_fin_prevue, date_lancement_prevue)
      values (${PJ[p.k]}, ${p.k}, ${p.titre}, ${p.description}, ${p.strat ? "Amélioration de l'expérience client" : ""}, ${p.strat}, ${p.statut ?? "en_cours"}, ${p.sante}, ${P[p.pm]}, ${p.entree}, ${p.initiale}, ${p.fin}, ${p.lancement})`;
    let i = 0;
    for (const [libelle, etat] of p.ind) {
      i += 1;
      await tx`insert into indicateurs (projet_id, ordre, libelle, etat) values (${PJ[p.k]}, ${i}, ${libelle}, ${etat})`;
    }
    if (p.dernier) {
      await tx`insert into historique_projet (projet_id, mois, date_fin_prevue, date_lancement_prevue, etat_avancement)
        values (${PJ[p.k]}, ${premierDuMois(-1)}, ${p.dernier.fin}, ${p.dernier.lancement}, ${p.dernier.etat})`;
    }
  }

  // ---------- Tâches de la semaine ----------
  const tache = async (qui, pj, titre, statut, echeance, evenements = [], blocage = null) => {
    const id = randomUUID();
    await tx`insert into taches (id, projet_id, titre, assigne_id, statut, echeance, blocage, cree_par_id, cree_le, terminee_le)
      values (${id}, ${pj ? PJ[pj] : null}, ${titre}, ${P[qui]}, ${statut}, ${echeance}, ${blocage}, ${P[qui]}, ${moment(-14, 9)}, ${statut === "faite" ? moment(evenements.at(-1)?.[0] ?? 0, 16) : null})`;
    for (const [j, type, avant, apres, note] of evenements) {
      await tx`insert into evenements_tache (tache_id, auteur_id, type, avant, apres, note, cree_le) values (${id}, ${P[qui]}, ${type}, ${avant}, ${apres}, ${note ?? null}, ${moment(j, 10 + j)})`;
    }
    return id;
  };
  // Daphnée Joseph : 8 tâches, 3 faites, 2 en retard, 1 bloquée, 2 à faire
  await tache("dj", "PR", "Maquettes du formulaire de candidature", "faite", jour(1), [[0, "statut", "a_faire", "en_cours"], [1, "statut", "en_cours", "faite"]]);
  await tache("dj", "UR", "Points 1 et 2 de l'audit de sécurité", "faite", jour(2), [[1, "statut", "en_cours", "faite"]]);
  await tache("dj", "PR", "Revue du cahier des charges avec la DRH", "faite", jour(3), [[3, "statut", "a_faire", "faite"]]);
  await tache("dj", "UR", "Point 3 de l'audit de sécurité", "en_cours", jour(2), [[2, "statut", "a_faire", "en_cours"]]);
  await tache("dj", "UN", "Maquettes de l'accueil", "en_cours", jour(3), [[0, "statut", "a_faire", "en_cours"], [3, "note", null, null, "Aux trois quarts"]]);
  await tache("dj", "UN", "Accès de test DTI", "bloquee", jour(2), [[1, "statut", "en_cours", "bloquee", "Identifiants demandés à la DTI"], [3, "note", null, null, "Relance faite"]], "Identifiants de test demandés à la DTI mardi ; relance faite jeudi.");
  await tache("dj", "PR", "Cahier des charges, version 1", "a_faire", jour(4));
  await tache("dj", "PR", "Fiches de poste", "a_faire", jour(7));
  // Les autres
  await tache("re", "UR", "Tests du module de virements", "faite", jour(3), [[3, "statut", "en_cours", "faite"]]);
  await tache("re", "UR", "Correctifs du module de virements", "a_faire", jour(7));
  await tache("re", "PR", "Environnement de développement", "faite", jour(2), [[2, "statut", "en_cours", "faite"]]);
  await tache("lp", "CR", "Serveur de recette", "bloquee", jour(1), [[0, "statut", "a_faire", "bloquee", "En attente de la DTI"]], "Serveur de recette demandé à la DTI lundi.");
  await tache("lp", "UN", "Plan de migration des données", "en_cours", jour(4), [[1, "statut", "a_faire", "en_cours"]]);
  await tache("sc", "PR", "Signature de la DRH sur le cahier des charges", "bloquee", jour(2), [[2, "statut", "en_cours", "bloquee", "Signature attendue"]], "Signature de la DRH attendue depuis mercredi.");
  await tache("sc", "CE", "Supports de formation du Réseau", "en_cours", jour(4), [[1, "statut", "a_faire", "en_cours"]]);
  await tache("jn", "UC", "Spécifications du module de paie", "en_cours", jour(4), [[0, "statut", "a_faire", "en_cours"]]);
  await tache("jn", "CR", "Jeux de données de recette", "faite", jour(3), [[3, "statut", "en_cours", "faite"]]);
  await tache("wb", "CE", "Planning de la phase pilote", "faite", jour(3), [[3, "statut", "en_cours", "faite"]]);
  await tache("wb", "CR", "Validation de la recette avec le Crédit", "en_cours", jour(4), [[2, "statut", "a_faire", "en_cours"]]);
  await tache("mv", "UR", "Date du nouveau passage d'audit", "a_faire", jour(4));

  // ---------- Rapports déjà envoyés cette semaine ----------
  const rapport = async (qui, heure, lignes) => {
    const id = randomUUID();
    await tx`insert into rapports_hebdo (id, auteur_id, semaine, statut, destinataire_id, envoye_le, parties_relues)
      values (${id}, ${P[qui]}, ${jour(0)}, 'envoye', ${P.ml}, ${moment(4, heure)}, ${tx.array(["fait", "en_cours", "bloque", "prochaine"])})`;
    let o = 0;
    for (const [partie, pj, texte] of lignes) {
      o += 1;
      await tx`insert into lignes_rapport (rapport_id, partie, texte, projet_id, ordre) values (${id}, ${partie}, ${texte}, ${pj ? PJ[pj] : null}, ${o})`;
    }
  };
  await rapport("re", 11, [["fait", "UR", "Tests du module de virements"], ["fait", "PR", "Environnement de développement"], ["prochaine", "UR", "Correctifs du module de virements, lundi"]]);
  await rapport("lp", 9, [["en_cours", "UN", "Plan de migration des données"], ["bloque", "CR", "Serveur de recette demandé à la DTI lundi"], ["prochaine", "UN", "Valider le plan de migration avec la DTI"]]);
  await rapport("wb", 8, [["fait", "CE", "Planning de la phase pilote"], ["en_cours", "CR", "Validation de la recette avec le Crédit"], ["prochaine", "CE", "Présenter le planning au Réseau"]]);

  await tx`insert into journal (action, objet, details) values ('donnees_exemple', 'base', ${sql.json({ personnes: gens.length, projets: projets.length })})`;
});

console.log(`Données d'exemple créées : ${gens.length} personnes.`);
console.log(`Connexion : prenom.nom@demo.dpo.local, par exemple :`);
console.log(`  daphnee.joseph@demo.dpo.local       chargée de projets (ses tâches, son rapport)`);
console.log(`  marc-antoine.louis@demo.dpo.local   directeur (sa direction : Solutions technologiques)`);
console.log(`  nadege.augustin@demo.dpo.local      directrice et administratrice (toute la division)`);
console.log(`  frantz.desrosiers@demo.dpo.local    exécutif et administrateur (voit tout, approuve le rapport au conseil)`);
console.log(`  jean-robert.noel@demo.dpo.local     analyste et administrateur`);
console.log(`Mot de passe commun de démonstration : ${motDePasse}`);
await sql.end();
