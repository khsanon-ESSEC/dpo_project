import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, eq, gt, ne } from "drizzle-orm";
import { hash, verify } from "@node-rs/argon2";
import { db, schema } from "@/db";
import { noter } from "@/lib/journal";

const COOKIE = "dpo_session";
const HEURES = Number(process.env.SESSION_HEURES || 12);
const SECURISE = process.env.COOKIE_SECURISE !== "0";
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
    ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
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

/** À appeler en tête de chaque page et de chaque action protégée. */
export async function exigerUtilisateur(): Promise<Utilisateur> {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  return u;
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
  if (p.bloqueJusqua && p.bloqueJusqua > new Date()) {
    return { ok: false, message: `Trop d'essais. Réessayez dans ${BLOCAGE_MINUTES} minutes.` };
  }
  const bon = await verify(p.motDePasseHash, motDePasse).catch(() => false);
  if (!bon) {
    const echecs = p.echecsConnexion + 1;
    await db
      .update(schema.personnes)
      .set({
        echecsConnexion: echecs >= ESSAIS_MAX ? 0 : echecs,
        bloqueJusqua: echecs >= ESSAIS_MAX ? new Date(Date.now() + BLOCAGE_MINUTES * 60_000) : null,
      })
      .where(eq(schema.personnes.id, p.id));
    await noter(p.id, "connexion_refusee", courriel, { echecs });
    return refus;
  }
  await db.update(schema.personnes).set({ echecsConnexion: 0, bloqueJusqua: null }).where(eq(schema.personnes.id, p.id));
  await ouvrirSession(p.id);
  await noter(p.id, "connexion", courriel);
  return { ok: true };
}
