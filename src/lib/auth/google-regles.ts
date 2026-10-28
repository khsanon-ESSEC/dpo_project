/**
 * Connexion avec le compte Google de la banque : ce qu'on exige du jeton d'identité, une fois sa
 * signature, son émetteur, son destinataire et sa date vérifiés (src/lib/auth/google.ts).
 * Pur (sans base ni réseau), testé dans tests/google.test.ts.
 */

export type RefusGoogle = "nonce" | "courriel" | "domaine";

/** Domaines acceptés (GOOGLE_DOMAINE, séparés par des virgules), en minuscules. */
export function domainesDe(valeur: string | undefined): string[] {
  return (valeur ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Le jeton doit répondre à notre demande (même nonce), porter une adresse vérifiée par Google, et venir
 * d'un compte de l'organisation Google de la banque : la revendication `hd` (domaine Workspace) et le
 * domaine de l'adresse doivent tous deux être parmi les domaines acceptés. Un compte Gmail personnel n'a
 * pas de `hd` : il est refusé.
 */
export function verifierRevendications(
  r: Record<string, unknown>,
  attendu: { nonce: string; domaines: string[] },
): { ok: true; courriel: string } | { ok: false; refus: RefusGoogle } {
  if (!attendu.nonce || r.nonce !== attendu.nonce) return { ok: false, refus: "nonce" };
  const courriel = typeof r.email === "string" ? r.email.trim().toLowerCase() : "";
  if (!courriel || r.email_verified !== true || !/^[^@\s]+@[^@\s]+$/.test(courriel)) return { ok: false, refus: "courriel" };
  const hd = typeof r.hd === "string" ? r.hd.trim().toLowerCase() : "";
  const domaineAdresse = courriel.split("@")[1];
  if (!attendu.domaines.length || !hd || !attendu.domaines.includes(hd) || !attendu.domaines.includes(domaineAdresse)) return { ok: false, refus: "domaine" };
  return { ok: true, courriel };
}

/** Messages de la page de connexion, par code (jamais un texte venu de l'adresse de la page). */
export const MESSAGES_GOOGLE: Record<string, string> = {
  indisponible: "La connexion avec Google n'est pas activée sur ce serveur.",
  annule: "Connexion avec Google annulée.",
  domaine: "Utilisez votre compte Google de la banque.",
  sans_acces: "Ce compte Google n'a pas accès à l'application : demandez à un administrateur de vous ajouter.",
  echec: "La connexion avec Google n'a pas abouti. Réessayez.",
};
