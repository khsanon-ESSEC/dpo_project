/**
 * Importer l'organisation (Excel, CSV ou Active Directory) : ce qui change, avant d'appliquer. Pur (sans base),
 * testé dans tests/import-organisation.test.ts.
 *
 * Règles :
 * - une ligne par personne, reconnue par son adresse courriel ; une case vide ne change rien ;
 * - on importe prénom, nom, poste, équipe (créée si elle n'existe pas) et supérieur (son adresse) ;
 * - les rôles (directeur, exécutif, administrateur) ne s'importent jamais ; personne n'est désactivé, ni
 *   supprimé : une personne absente du fichier reste telle quelle ;
 * - une personne hors division ou une fiche désactivée ne se modifie pas par un import ;
 * - fichier : la moindre erreur bloque l'import (rien n'est fait à moitié) : le fichier se corrige, puis on
 *   recommence ;
 * - annuaire : on ne corrige pas l'annuaire depuis l'application ; les comptes qui ne peuvent pas être
 *   importés (personne hors division, nom manquant…) sont laissés de côté et listés, le reste s'importe.
 */
import { cleNom } from "@/lib/projets";

export type LigneImport = { ligne: number; prenom: string; nom: string; courriel: string; poste: string; equipe: string; superieur: string };

export type Existant = {
  personnes: { id: string; prenom: string; nom: string; courriel: string | null; poste: string; equipeId: string | null; superieurId: string | null; externe: boolean; actif: boolean }[];
  equipes: { id: string; nom: string }[];
};

export type Changement = { champ: "prénom" | "nom" | "poste" | "équipe" | "supérieur"; avant: string; apres: string };

export type Plan = {
  creer: LigneImport[];
  modifier: { ligne: number; id: string; courriel: string; nom: string; changements: Changement[]; donnees: LigneImport }[];
  inchanges: number;
  equipesNouvelles: string[];
  erreurs: { ligne: number; message: string }[];
  /** Annuaire seulement : comptes laissés de côté (au lieu de bloquer l'import), avec la raison. */
  ignores: { ligne: number; courriel: string; message: string }[];
  /** Personnes actives de la division absentes du fichier : elles restent telles quelles. */
  absents: number;
};

const COLONNES: Record<keyof Omit<LigneImport, "ligne">, string[]> = {
  prenom: ["prenom", "prenoms", "first name", "firstname", "given name", "givenname"],
  nom: ["nom", "nom de famille", "last name", "lastname", "surname", "sn"],
  courriel: ["courriel", "adresse courriel", "email", "e mail", "mail", "adresse electronique", "adresse"],
  poste: ["poste", "fonction", "titre", "title", "job title"],
  equipe: ["equipe", "service", "departement", "department", "unite", "team"],
  superieur: ["superieur", "superieur courriel", "courriel du superieur", "responsable", "manager", "manager email", "n 1", "n+1"],
};

export const ENTETES = ["Prénom", "Nom", "Courriel", "Poste", "Équipe", "Supérieur (courriel)"];

/** Lignes d'un tableau (la ligne d'en-têtes est cherchée dans les cinq premières). */
export function lireLignes(tableau: string[][]): { lignes: LigneImport[] } | { erreur: string } {
  const cle = (s: string) => cleNom(s).replace(/\s+/g, " ");
  let entete = -1;
  let carte: Partial<Record<keyof Omit<LigneImport, "ligne">, number>> = {};
  for (let i = 0; i < Math.min(5, tableau.length) && entete < 0; i++) {
    const c: typeof carte = {};
    tableau[i].forEach((v, j) => {
      const k = cle(v);
      for (const [champ, noms] of Object.entries(COLONNES) as [keyof typeof COLONNES, string[]][]) {
        if (c[champ] === undefined && noms.includes(k)) c[champ] = j;
      }
    });
    if (c.courriel !== undefined) {
      entete = i;
      carte = c;
    }
  }
  if (entete < 0) return { erreur: `Colonne « Courriel » introuvable. Première ligne attendue : ${ENTETES.join(", ")}.` };
  const lignes: LigneImport[] = [];
  for (let i = entete + 1; i < tableau.length; i++) {
    const l = tableau[i] ?? [];
    // NFC : un « é » écrit en deux caractères (fichiers venus d'un Mac) devient le même « é » que partout ailleurs.
    const v = (champ: keyof typeof COLONNES) => (carte[champ] !== undefined ? String(l[carte[champ]!] ?? "").normalize("NFC").replace(/\s+/g, " ").trim() : "");
    const ligne = { ligne: i + 1, prenom: v("prenom"), nom: v("nom"), courriel: v("courriel").toLowerCase(), poste: v("poste"), equipe: v("equipe"), superieur: v("superieur").toLowerCase() };
    if (!ligne.prenom && !ligne.nom && !ligne.courriel && !ligne.poste && !ligne.equipe && !ligne.superieur) continue;
    lignes.push(ligne);
  }
  if (!lignes.length) return { erreur: "Aucune personne dans le fichier (après la ligne d'en-têtes)." };
  if (lignes.length > 2000) return { erreur: "2 000 personnes au plus par import." };
  return { lignes };
}

const COURRIEL = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const LONGUEURS = { prenom: 100, nom: 100, poste: 150, equipe: 100 } as const;

export function planifierImport(lignes: LigneImport[], existant: Existant, o: { laisserDeCote?: boolean } = {}): Plan {
  // Un numéro de ligne par ligne : sinon, renumérotées (les erreurs et les écarts se repèrent par numéro).
  if (new Set(lignes.map((l) => l.ligne)).size !== lignes.length) lignes = lignes.map((l, i) => ({ ...l, ligne: i + 1 }));
  if (!o.laisserDeCote) return planStrict(lignes, existant);
  // Retirer les lignes en erreur, puis recommencer : un compte écarté peut en entraîner un autre (son supérieur).
  const ignores: Plan["ignores"] = [];
  let restantes = lignes;
  for (let tour = 0; tour < 20; tour++) {
    const p = planStrict(restantes, existant);
    if (!p.erreurs.length) return { ...p, ignores: ignores.sort((a, b) => a.ligne - b.ligne), absents: planStrict(lignes, existant).absents };
    const enErreur = new Set(p.erreurs.map((e) => e.ligne));
    for (const e of p.erreurs) ignores.push({ ligne: e.ligne, courriel: restantes.find((l) => l.ligne === e.ligne)?.courriel ?? "", message: e.message });
    restantes = restantes.filter((l) => !enErreur.has(l.ligne));
  }
  return { ...planStrict(restantes, existant), ignores };
}

function planStrict(lignes: LigneImport[], existant: Existant): Plan {
  const erreurs: Plan["erreurs"] = [];
  const parCourriel = new Map(existant.personnes.filter((p) => p.courriel).map((p) => [p.courriel!.toLowerCase(), p]));
  const parId = new Map(existant.personnes.map((p) => [p.id, p]));
  const equipeDe = new Map(existant.equipes.map((e) => [cleNom(e.nom), e]));
  const nomEquipe = new Map(existant.equipes.map((e) => [e.id, e.nom]));
  const vus = new Map<string, number>();
  const valides: LigneImport[] = [];

  for (const l of lignes) {
    const err = (message: string) => erreurs.push({ ligne: l.ligne, message });
    if (!l.courriel) {
      err("Adresse courriel manquante.");
      continue;
    }
    if (!COURRIEL.test(l.courriel) || l.courriel.length > 200) {
      err(`Adresse courriel illisible : « ${l.courriel.slice(0, 80)} ».`);
      continue;
    }
    if (vus.has(l.courriel)) {
      err(`${l.courriel} figure déjà ligne ${vus.get(l.courriel)}.`);
      continue;
    }
    vus.set(l.courriel, l.ligne);
    const p = parCourriel.get(l.courriel);
    if (p?.externe) {
      err(`${l.courriel} est une personne hors division : elle se gère dans Organisation, pas par un import.`);
      continue;
    }
    if (p && !p.actif) {
      err(`La fiche de ${l.courriel} est désactivée : réactivez-la d'abord dans Organisation.`);
      continue;
    }
    if (!p && (!l.prenom || !l.nom)) {
      err(`Prénom et nom obligatoires pour une nouvelle personne (${l.courriel}).`);
      continue;
    }
    const trop = (Object.keys(LONGUEURS) as (keyof typeof LONGUEURS)[]).find((k) => l[k].length > LONGUEURS[k]);
    if (trop) {
      err(`${trop === "prenom" ? "Prénom" : trop === "nom" ? "Nom" : trop === "poste" ? "Poste" : "Équipe"} trop long (${LONGUEURS[trop]} caractères au plus).`);
      continue;
    }
    if (l.superieur) {
      if (l.superieur === l.courriel) {
        err("Une personne ne peut pas être son propre supérieur.");
        continue;
      }
      const s = parCourriel.get(l.superieur);
      const dansFichier = lignes.some((x) => x.courriel === l.superieur);
      if (!dansFichier && !s) {
        err(`Supérieur introuvable : ${l.superieur} n'est ni dans le fichier ni dans l'application.`);
        continue;
      }
      if (s?.externe) {
        err(`Le supérieur ${l.superieur} est une personne hors division.`);
        continue;
      }
      if (!dansFichier && s && !s.actif) {
        err(`Le supérieur ${l.superieur} a une fiche désactivée.`);
        continue;
      }
    }
    valides.push(l);
  }

  // Boucles de supérieurs, avec l'organisation telle qu'elle serait après l'import.
  const superieurFinal = new Map<string, string | null>();
  for (const p of existant.personnes) if (p.courriel) superieurFinal.set(p.courriel.toLowerCase(), p.superieurId ? (parId.get(p.superieurId)?.courriel?.toLowerCase() ?? null) : null);
  for (const l of valides) if (l.superieur) superieurFinal.set(l.courriel, l.superieur);
  else if (!superieurFinal.has(l.courriel)) superieurFinal.set(l.courriel, null);
  for (const l of valides) {
    const chemin = new Set<string>([l.courriel]);
    let c = superieurFinal.get(l.courriel) ?? null;
    while (c) {
      if (chemin.has(c)) {
        erreurs.push({ ligne: l.ligne, message: `Boucle de supérieurs : ${[...chemin].join(" → ")} → ${c}.` });
        break;
      }
      chemin.add(c);
      c = superieurFinal.get(c) ?? null;
    }
  }

  const creer: LigneImport[] = [];
  const modifier: Plan["modifier"] = [];
  let inchanges = 0;
  const nouvelles = new Map<string, string>();
  for (const l of valides) {
    if (l.equipe && !equipeDe.has(cleNom(l.equipe)) && !nouvelles.has(cleNom(l.equipe))) nouvelles.set(cleNom(l.equipe), l.equipe);
    const p = parCourriel.get(l.courriel);
    if (!p) {
      creer.push(l);
      continue;
    }
    const changements: Changement[] = [];
    if (l.prenom && l.prenom !== p.prenom) changements.push({ champ: "prénom", avant: p.prenom, apres: l.prenom });
    if (l.nom && l.nom !== p.nom) changements.push({ champ: "nom", avant: p.nom, apres: l.nom });
    if (l.poste && l.poste !== p.poste) changements.push({ champ: "poste", avant: p.poste, apres: l.poste });
    const equipeActuelle = p.equipeId ? (nomEquipe.get(p.equipeId) ?? "") : "";
    if (l.equipe && cleNom(l.equipe) !== cleNom(equipeActuelle)) changements.push({ champ: "équipe", avant: equipeActuelle, apres: equipeDe.get(cleNom(l.equipe))?.nom ?? l.equipe });
    const supActuel = p.superieurId ? (parId.get(p.superieurId)?.courriel?.toLowerCase() ?? "") : "";
    if (l.superieur && l.superieur !== supActuel) changements.push({ champ: "supérieur", avant: supActuel, apres: l.superieur });
    if (changements.length) modifier.push({ ligne: l.ligne, id: p.id, courriel: l.courriel, nom: `${p.prenom} ${p.nom}`, changements, donnees: l });
    else inchanges += 1;
  }
  const dansFichier = new Set(lignes.map((l) => l.courriel));
  const absents = existant.personnes.filter((p) => p.actif && !p.externe && p.courriel && !dansFichier.has(p.courriel.toLowerCase())).length;
  return { creer, modifier, inchanges, equipesNouvelles: [...nouvelles.values()], erreurs: erreurs.sort((a, b) => a.ligne - b.ligne), ignores: [], absents };
}
