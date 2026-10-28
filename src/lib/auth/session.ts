import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, eq, gt, isNull, lte, ne, or, sql } from "drizzle-orm";
import { hash, verify } from "@node-rs/argon2";
import { db, schema } from "@/db";
import { noter } from "@/lib/journal";

const HEURES = Number(process.env.SESSION_HEURES || 12);
const SECURISE = process.env.COOKIE_SECURISE !== "0";
/** En HTTPS, le préfixe __Host- interdit à un autre site de la banque (sous-domaine voisin) de poser ce cookie. */
const COOKIE = SECURISE ? "__Host-dpo_session" : "dpo_session";
const ESSAIS_MAX = 5;
const BLOCAGE_MINUTES = 15;

export type Utilisateur = {
  id: string;
  prenom: string;
  nom: string;
  poste: string;
  directeur: boolean;
  executif: boolean;
  administrateur: boolean;
  /** Hors division, avec un accès limité à ses tâches et à ses projets. */
  externe?: boolean;
  theme: string;
  doitChangerMotDePasse: boolean;
  /** Comment la session en cours a été ouverte : « mot_de_passe », « google » ou « ad » (compte Windows). */
  connexion?: string;
};

const empreinteJeton = (jeton: string) => createHash("sha256").update(jeton).digest("hex");

export async function hacherMotDePasse(motDePasse: string): Promise<string> {
  return hash(motDePasse, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

/** Règle minimale : 12 caractères, au moins une lettre et un chiffre. */
export function motDePasseAcceptable(m: string): string | null {
  if (m.length < 12) return "Au moins 12 caractères.";
  if (!/[A-Za-zÀ-ÿ]/.test(m) || !/\d/.test(m)) return "Au moins une lettre et un chiffre.";
  return null;
}

async function poserCookie(jeton: string, expire: Date) {
  (await cookies()).set(COOKIE, jeton, { httpOnly: true, sameSite: "lax", secure: SECURISE, path: "/", expires: expire });
}

export type MethodeConnexion = "mot_de_passe" | "google" | "ad";

export async function ouvrirSession(personneId: string, methode: MethodeConnexion = "mot_de_passe") {
  const jeton = randomBytes(32).toString("base64url");
  const expire = new Date(Date.now() + HEURES * 3_600_000);
  const h = await headers();
  await db.insert(schema.sessions).values({
    id: empreinteJeton(jeton),
    personneId,
    expireLe: expire,
    // L'adresse ajoutée par le proxy de la banque (la dernière) : les précédentes viennent du navigateur.
    ip: (h.get("x-forwarded-for") ?? "").split(",").at(-1)?.trim() || null,
    agent: h.get("user-agent")?.slice(0, 300) ?? null,
    methode,
  });
  await poserCookie(jeton, expire);
}

/** Ferme toutes les sessions de la personne sauf celle en cours : après un changement de mot de passe, les autres appareils sont déconnectés. */
export async function fermerAutresSessions(personneId: string) {
  const jeton = (await cookies()).get(COOKIE)?.value;
  const actuelle = jeton ? empreinteJeton(jeton) : "";
  await db.delete(schema.sessions).where(actuelle ? and(eq(schema.sessions.personneId, personneId), ne(schema.sessions.id, actuelle)) : eq(schema.sessions.personneId, personneId));
}

export async function fermerSession() {
  const c = await cookies();
  const jeton = c.get(COOKIE)?.value;
  if (jeton) await db.delete(schema.sessions).where(eq(schema.sessions.id, empreinteJeton(jeton)));
  c.delete(COOKIE);
}

/** Utilisateur connecté, ou null. Une seule lecture par requête. */
export const utilisateurCourant = cache(async (): Promise<Utilisateur | null> => {
  const jeton = (await cookies()).get(COOKIE)?.value;
  if (!jeton) return null;
  const [ligne] = await db
    .select({
      id: schema.personnes.id,
      prenom: schema.personnes.prenom,
      nom: schema.personnes.nom,
      poste: schema.personnes.poste,
      directeur: schema.personnes.directeur,
      executif: schema.personnes.executif,
      administrateur: schema.personnes.administrateur,
      externe: schema.personnes.externe,
      theme: schema.personnes.theme,
      doitChangerMotDePasse: schema.personnes.doitChangerMotDePasse,
      connexion: schema.sessions.methode,
    })
    .from(schema.sessions)
    .innerJoin(schema.personnes, eq(schema.sessions.personneId, schema.personnes.id))
    .where(and(eq(schema.sessions.id, empreinteJeton(jeton)), gt(schema.sessions.expireLe, new Date()), eq(schema.personnes.actif, true)))
    .limit(1);
  return ligne ?? null;
});

/** Mot de passe provisoire à changer : seulement pour une session ouverte par mot de passe (pas Google ni Windows). */
export const doitChangerProvisoire = (u: Utilisateur) => u.doitChangerMotDePasse && (u.connexion ?? "mot_de_passe") === "mot_de_passe";

/**
 * À appeler en tête de chaque page et de chaque action protégée. Avec un mot de passe provisoire, rien d'autre
 * que la page de changement de mot de passe (`provisoireAccepte`) ne répond tant qu'il n'est pas changé.
 */
export async function exigerUtilisateur(o: { provisoireAccepte?: boolean } = {}): Promise<Utilisateur> {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  if (!o.provisoireAccepte && doitChangerProvisoire(u)) redirect("/mot-de-passe");
  return u;
}

/** Pour les routes d'API : l'utilisateur, ou null (non connecté, ou mot de passe provisoire pas encore changé). */
export async function utilisateurActif(): Promise<Utilisateur | null> {
  const u = await utilisateurCourant();
  return u && !doitChangerProvisoire(u) ? u : null;
}

/**
 * Pages et actions réservées à la division : une personne hors division, même avec un accès limité,
 * n'y entre pas (ni équipe, ni charge, ni rapport, ni conseil, ni proposition de projet).
 */
export async function exigerInterne(): Promise<Utilisateur> {
  const u = await exigerUtilisateur();
  if (u.externe) notFound();
  return u;
}

/**
 * Empreinte de leurre : avec une adresse inconnue (ou sans accès), on vérifie quand même un mot de passe,
 * pour que la réponse prenne le même temps et ne révèle pas quelles adresses existent.
 */
let leurre: Promise<string> | null = null;
const empreinteLeurre = () => (leurre ??= hacherMotDePasse(randomBytes(16).toString("hex")));

/**
 * Connexion une fois l'identité vérifiée par l'annuaire de la banque : son compte Google
 * (src/lib/auth/google.ts) ou son compte Windows (src/lib/auth/ad.ts). La personne doit exister avec
 * cette adresse, être active, et, si elle est hors division, avoir un accès ouvert. Aucun compte n'est créé.
 */
export async function connecterIdentiteVerifiee(courriel: string, methode: "google" | "ad", details: Record<string, unknown> = {}): Promise<{ ok: true } | { ok: false }> {
  const [p] = await db.select().from(schema.personnes).where(eq(schema.personnes.courriel, courriel.trim().toLowerCase())).limit(1);
  if (!p || !p.actif || (p.externe && !p.motDePasseHash)) {
    await noter(null, "connexion_refusee", courriel, { methode, ...details });
    return { ok: false };
  }
  await ouvrirSession(p.id, methode);
  await noter(p.id, "connexion", courriel, { methode, ...details });
  return { ok: true };
}

export type ResultatConnexion = { ok: true } | { ok: false; message: string };

/**
 * Réserve un essai AVANT de vérifier le mot de passe, en une seule écriture : des essais lancés en même temps
 * comptent chacun, et le compte se bloque au cinquième (15 minutes). Renvoie false si le compte est bloqué.
 * Un essai réussi remet le compteur à zéro (oublierEssais).
 */
async function reserverEssai(personneId: string): Promise<boolean> {
  const p = schema.personnes;
  const [r] = await db
    .update(p)
    .set({
      echecsConnexion: sql`case when ${p.echecsConnexion} + 1 >= ${ESSAIS_MAX} then 0 else ${p.echecsConnexion} + 1 end`,
      bloqueJusqua: sql`case when ${p.echecsConnexion} + 1 >= ${ESSAIS_MAX} then now() + (${BLOCAGE_MINUTES} * interval '1 minute') else ${p.bloqueJusqua} end`,
    })
    .where(and(eq(p.id, personneId), or(isNull(p.bloqueJusqua), lte(p.bloqueJusqua, sql`now()`))))
    .returning({ id: p.id });
  return !!r;
}

async function oublierEssais(personneId: string) {
  await db.update(schema.personnes).set({ echecsConnexion: 0, bloqueJusqua: null }).where(eq(schema.personnes.id, personneId));
}

/**
 * Vérifie le mot de passe d'une personne, avec la même limite d'essais que la connexion (changement de mot de
 * passe : une session volée ne permet pas de deviner le vrai mot de passe).
 */
export async function verifierMotDePasseDe(personneId: string, motDePasse: string): Promise<"ok" | "faux" | "bloque"> {
  const [p] = await db.select({ hash: schema.personnes.motDePasseHash }).from(schema.personnes).where(eq(schema.personnes.id, personneId));
  if (!p?.hash || !motDePasse) return "faux";
  if (!(await reserverEssai(personneId))) return "bloque";
  if (!(await verify(p.hash, motDePasse).catch(() => false))) return "faux";
  await oublierEssais(personneId);
  return "ok";
}

export async function verifierIdentifiants(courrielSaisi: string, motDePasse: string): Promise<ResultatConnexion> {
  const courriel = courrielSaisi.trim().toLowerCase();
  const refus: ResultatConnexion = { ok: false, message: "Adresse ou mot de passe incorrect." };
  if (!courriel || !motDePasse) return refus;

  const [p] = await db.select().from(schema.personnes).where(eq(schema.personnes.courriel, courriel)).limit(1);
  if (!p || !p.actif || !p.motDePasseHash) {
    await verify(await empreinteLeurre(), motDePasse).catch(() => false);
    await noter(null, "connexion_refusee", courriel);
    return refus;
  }
  if (!(await reserverEssai(p.id))) {
    await noter(p.id, "connexion_refusee", courriel, { bloque: true });
    return { ok: false, message: `Trop d'essais. Réessayez dans ${BLOCAGE_MINUTES} minutes.` };
  }
  const bon = await verify(p.motDePasseHash, motDePasse).catch(() => false);
  if (!bon) {
    await noter(p.id, "connexion_refusee", courriel);
    return refus;
  }
  await oublierEssais(p.id);
  await ouvrirSession(p.id);
  await noter(p.id, "connexion", courriel);
  return { ok: true };
}
