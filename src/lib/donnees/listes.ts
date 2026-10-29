/**
 * Listes de référence des projets (demandé le 29 octobre 2026) : programmes et divisions, choisis dans une liste
 * à la création et à la modification d'un projet au lieu d'être tapés. Gérées dans Organisation → Listes par les
 * administrateurs et les exécutifs (les mêmes personnes qui gèrent l'organisation).
 * Le projet garde le libellé : renommer une valeur renomme les projets qui la portent ; retirer une valeur la retire
 * des choix proposés, les projets qui la portent la gardent.
 */
import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { noter } from "@/lib/journal";
import { peutAdministrer } from "@/lib/regles";

/** Gèrent les listes : les administrateurs et les exécutifs (comme l'organisation). */
export const peutGererListes = (u: { administrateur: boolean; externe?: boolean }, a: { toutVoir: boolean }) => peutAdministrer(u) || a.toutVoir;

export const GENRES_LISTE = ["programme", "division"] as const;
export type GenreListe = (typeof GENRES_LISTE)[number];
export const estGenreListe = (g: unknown): g is GenreListe => typeof g === "string" && (GENRES_LISTE as readonly string[]).includes(g);

export const LONGUEUR_LIBELLE: Record<GenreListe, number> = { programme: 160, division: 120 };

/** Libellé nettoyé : espaces resserrés, bornes de longueur. */
export function libelleListe(genre: GenreListe, v: unknown): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LONGUEUR_LIBELLE[genre]);
}

const cle = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase("fr");

/** Les valeurs d'un genre (listes courtes : comparées ici, sans dépendre de la collation de la base). */
async function valeursDu(genre: GenreListe) {
  return db.select().from(schema.listesProjet).where(eq(schema.listesProjet.genre, genre));
}
async function trouver(genre: GenreListe, libelle: string, actifSeulement = false) {
  const l = await valeursDu(genre);
  return l.find((x) => cle(x.libelle) === cle(libelle) && (!actifSeulement || x.actif)) ?? null;
}

export type ValeurListe = { id: string; genre: GenreListe; libelle: string; actif: boolean; projets: number };

/** Toutes les valeurs (actives et retirées), avec le nombre de projets qui les portent. */
export async function listesProjet(): Promise<Record<GenreListe, ValeurListe[]>> {
  const lignes = await db.select().from(schema.listesProjet).orderBy(asc(schema.listesProjet.libelle));
  const projets = await db.select({ programme: schema.projets.programme, division: schema.projets.division }).from(schema.projets);
  const compte = (genre: GenreListe, libelle: string) => projets.filter((p) => cle(p[genre]) === cle(libelle)).length;
  const r: Record<GenreListe, ValeurListe[]> = { programme: [], division: [] };
  for (const l of lignes) {
    if (!estGenreListe(l.genre)) continue;
    r[l.genre].push({ id: l.id, genre: l.genre, libelle: l.libelle, actif: l.actif, projets: compte(l.genre, l.libelle) });
  }
  for (const g of GENRES_LISTE) r[g].sort((x, y) => x.libelle.localeCompare(y.libelle, "fr"));
  return r;
}

/** Les choix proposés dans les formulaires (valeurs actives, par ordre alphabétique). */
export async function choixListes(): Promise<Record<GenreListe, string[]>> {
  const l = await listesProjet();
  return { programme: l.programme.filter((v) => v.actif).map((v) => v.libelle), division: l.division.filter((v) => v.actif).map((v) => v.libelle) };
}

/**
 * Contrôle serveur d'une valeur envoyée par un formulaire : vide (aucun programme ; la DPO pour la division), une
 * valeur active de la liste (renvoyée avec la casse de la liste), ou la valeur que le projet porte déjà (inchangée,
 * même retirée de la liste). Toute autre valeur est refusée (null).
 */
export async function valeurDeListe(genre: GenreListe, saisie: unknown, actuelle?: string): Promise<string | null> {
  const v = libelleListe(genre, saisie);
  if (!v) return "";
  if (actuelle !== undefined && cle(v) === cle(actuelle)) return actuelle;
  const l = await trouver(genre, v, true);
  return l ? l.libelle : null;
}

export const MESSAGE_HORS_LISTE: Record<GenreListe, string> = {
  programme: "Choisissez un programme de la liste. S'il manque, un administrateur l'ajoute dans Organisation → Listes.",
  division: "Choisissez une division de la liste. Si elle manque, un administrateur l'ajoute dans Organisation → Listes.",
};

/** Ajouter une valeur (ou remettre une valeur retirée du même nom). */
export async function ajouterValeur(genre: GenreListe, saisie: unknown, parId: string): Promise<{ ok: true; libelle: string } | { erreur: string }> {
  const libelle = libelleListe(genre, saisie);
  if (libelle.length < 2) return { erreur: "Donnez un nom d'au moins deux caractères." };
  const deja = await trouver(genre, libelle);
  if (deja) {
    if (deja.actif) return { erreur: `« ${deja.libelle} » est déjà dans la liste.` };
    await db.update(schema.listesProjet).set({ actif: true }).where(eq(schema.listesProjet.id, deja.id));
    await noter(parId, "liste_valeur_remise", deja.id, { genre, libelle: deja.libelle });
    return { ok: true, libelle: deja.libelle };
  }
  const [n] = await db.insert(schema.listesProjet).values({ genre, libelle, creeParId: parId }).onConflictDoNothing().returning({ id: schema.listesProjet.id });
  if (!n) return { erreur: `« ${libelle} » est déjà dans la liste.` };
  await noter(parId, "liste_valeur_ajoutee", n.id, { genre, libelle });
  return { ok: true, libelle };
}

/** Renommer une valeur : les projets qui portent l'ancien nom prennent le nouveau. */
export async function renommerValeur(id: string, saisie: unknown, parId: string): Promise<{ ok: true } | { erreur: string }> {
  const [v] = await db.select().from(schema.listesProjet).where(eq(schema.listesProjet.id, id));
  if (!v || !estGenreListe(v.genre)) return { erreur: "Valeur introuvable." };
  const genre = v.genre;
  const libelle = libelleListe(genre, saisie);
  if (libelle.length < 2) return { erreur: "Donnez un nom d'au moins deux caractères." };
  if (libelle === v.libelle) return { ok: true };
  const autre = (await valeursDu(genre)).find((x) => x.id !== id && cle(x.libelle) === cle(libelle));
  if (autre) return { erreur: `« ${libelle} » existe déjà dans la liste.` };
  const projets = await db.select({ id: schema.projets.id, programme: schema.projets.programme, division: schema.projets.division }).from(schema.projets);
  const ids = projets.filter((p) => cle(p[genre]) === cle(v.libelle)).map((p) => p.id);
  await db.transaction(async (tx) => {
    await tx.update(schema.listesProjet).set({ libelle }).where(eq(schema.listesProjet.id, id));
    if (ids.length) await tx.update(schema.projets).set(genre === "programme" ? { programme: libelle } : { division: libelle }).where(inArray(schema.projets.id, ids));
  });
  await noter(parId, "liste_valeur_renommee", id, { genre, avant: v.libelle, apres: libelle });
  return { ok: true };
}

/** Retirer une valeur des choix (les projets qui la portent la gardent), ou la remettre. */
export async function changerEtatValeur(id: string, actif: boolean, parId: string): Promise<{ ok: true } | { erreur: string }> {
  const [v] = await db.select().from(schema.listesProjet).where(eq(schema.listesProjet.id, id));
  if (!v || !estGenreListe(v.genre)) return { erreur: "Valeur introuvable." };
  if (v.actif !== actif) await db.update(schema.listesProjet).set({ actif }).where(eq(schema.listesProjet.id, id));
  await noter(parId, actif ? "liste_valeur_remise" : "liste_valeur_retiree", id, { genre: v.genre, libelle: v.libelle });
  return { ok: true };
}

/**
 * Pour l'import en vrac : une valeur inconnue est ajoutée à la liste (l'import est réservé aux administrateurs,
 * qui gèrent les listes). Renvoie le libellé de la liste.
 */
export async function valeurOuAjout(genre: GenreListe, saisie: unknown, parId: string): Promise<string> {
  const v = libelleListe(genre, saisie);
  if (!v) return "";
  const l = await trouver(genre, v);
  if (l) {
    if (!l.actif) await db.update(schema.listesProjet).set({ actif: true }).where(eq(schema.listesProjet.id, l.id));
    return l.libelle;
  }
  const r = await ajouterValeur(genre, v, parId);
  return "ok" in r ? r.libelle : v;
}
