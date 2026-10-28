/**
 * Connexion avec le compte Google de la banque (OpenID Connect, flux « code » avec PKCE).
 *
 * - Activée seulement si GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET et GOOGLE_DOMAINE sont renseignés.
 * - L'adresse de retour est construite à partir d'APP_URL (jamais de l'en-tête Host).
 * - Le jeton d'identité est vérifié : signature (clés publiées par Google), émetteur, destinataire,
 *   date, nonce, adresse vérifiée, domaine de la banque (src/lib/auth/google-regles.ts).
 * - Aucun compte n'est créé : la personne doit déjà exister dans Organisation, active, avec cette adresse.
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { domainesDe, verifierRevendications, type RefusGoogle } from "@/lib/auth/google-regles";

const EMETTEUR_GOOGLE = "https://accounts.google.com";

/**
 * Cookie temporaire (10 minutes) qui garde l'état, le nonce et le vérificateur PKCE jusqu'au retour de Google.
 * En HTTPS, le préfixe __Host- empêche un site voisin de la banque d'en poser un à sa place.
 */
export const COOKIE_GOOGLE = process.env.COOKIE_SECURISE !== "0" ? "__Host-dpo_google" : "dpo_google";

export function googleActive(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET && domainesDe(process.env.GOOGLE_DOMAINE).length > 0;
}

/** Émetteur OpenID : Google, sauf pour les essais avec un fournisseur factice (GOOGLE_EMETTEUR). */
const emetteur = () => (process.env.GOOGLE_EMETTEUR || EMETTEUR_GOOGLE).replace(/\/$/, "");
export const adresseRetour = () => `${(process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")}/api/auth/google/retour`;

type Decouverte = { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string };
let decouverte: { valeur: Decouverte; jusqua: number } | null = null;
let cles: { uri: string; jeu: ReturnType<typeof createRemoteJWKSet> } | null = null;

/** Adresses du fournisseur, lues dans son document de découverte (gardé une heure). */
async function fournisseur(): Promise<Decouverte> {
  if (decouverte && decouverte.jusqua > Date.now()) return decouverte.valeur;
  const rep = await fetch(`${emetteur()}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10_000) });
  if (!rep.ok) throw new Error(`découverte OpenID : ${rep.status}`);
  const d = (await rep.json()) as Decouverte;
  if (!d.authorization_endpoint || !d.token_endpoint || !d.jwks_uri || !d.issuer) throw new Error("découverte OpenID incomplète");
  decouverte = { valeur: d, jusqua: Date.now() + 3_600_000 };
  return d;
}

const base64url = (b: Buffer) => b.toString("base64url");

/** Début : l'adresse de Google à ouvrir, et ce qu'il faut garder (dans un cookie) pour vérifier le retour. */
export async function debutConnexion(): Promise<{ url: string; garde: { etat: string; nonce: string; verificateur: string } }> {
  const f = await fournisseur();
  const garde = { etat: base64url(randomBytes(24)), nonce: base64url(randomBytes(24)), verificateur: base64url(randomBytes(48)) };
  const defi = base64url(createHash("sha256").update(garde.verificateur).digest());
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: adresseRetour(),
    response_type: "code",
    scope: "openid email profile",
    state: garde.etat,
    nonce: garde.nonce,
    code_challenge: defi,
    code_challenge_method: "S256",
    // Indication seulement : le domaine est vérifié dans le jeton, au retour.
    hd: domainesDe(process.env.GOOGLE_DOMAINE)[0],
    prompt: "select_account",
  });
  return { url: `${f.authorization_endpoint}?${params}`, garde };
}

/** Retour : échange le code contre le jeton d'identité, le vérifie, et renvoie l'adresse de la personne. */
export async function finConnexion(code: string, garde: { nonce: string; verificateur: string }): Promise<{ ok: true; courriel: string } | { ok: false; refus: RefusGoogle | "echec" }> {
  const f = await fournisseur();
  const rep = await fetch(f.token_endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: adresseRetour(),
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code_verifier: garde.verificateur,
    }),
  });
  if (!rep.ok) return { ok: false, refus: "echec" };
  const { id_token } = (await rep.json()) as { id_token?: string };
  if (!id_token) return { ok: false, refus: "echec" };
  if (!cles || cles.uri !== f.jwks_uri) cles = { uri: f.jwks_uri, jeu: createRemoteJWKSet(new URL(f.jwks_uri)) };
  try {
    // Google signe avec « https://accounts.google.com » ou « accounts.google.com ».
    const emetteurs = f.issuer === EMETTEUR_GOOGLE ? [EMETTEUR_GOOGLE, "accounts.google.com"] : [f.issuer];
    const { payload } = await jwtVerify(id_token, cles.jeu, { issuer: emetteurs, audience: process.env.GOOGLE_CLIENT_ID!, algorithms: ["RS256"], clockTolerance: 60 });
    return verifierRevendications(payload as Record<string, unknown>, { nonce: garde.nonce, domaines: domainesDe(process.env.GOOGLE_DOMAINE) });
  } catch {
    return { ok: false, refus: "echec" };
  }
}
