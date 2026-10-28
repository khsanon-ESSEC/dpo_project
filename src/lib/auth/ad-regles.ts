/**
 * Connexion avec le compte Windows de la banque (Active Directory) : ce qui se vérifie sans annuaire.
 * Pur (sans base ni réseau), testé dans tests/ad.test.ts. La connexion elle-même : src/lib/auth/ad.ts.
 */

export type RefusAD = "identifiant" | "identifiants" | "expire" | "a_changer" | "verrouille" | "bloque" | "sans_acces" | "indisponible" | "trop";

/** Identifiant Windows : lettres, chiffres, point, tiret, tiret bas (rien qui puisse modifier un filtre ou un DN). */
const SAM = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/**
 * Ce que la personne tape : « jdupont », « UNIBANK\jdupont » ou « jdupont@<domaine AD> ».
 * Renvoie l'identifiant seul (sAMAccountName), ou null si la saisie ne ressemble pas à un identifiant Windows
 * (une adresse courriel d'un autre domaine, des espaces, des caractères de filtre LDAP…).
 */
export function normaliserIdentifiant(saisie: string, domaineAD: string): string | null {
  let s = String(saisie ?? "").trim();
  if (!s || s.length > 200) return null;
  const barre = s.indexOf("\\");
  if (barre >= 0) s = s.slice(barre + 1);
  const arobase = s.indexOf("@");
  if (arobase >= 0) {
    if (s.slice(arobase + 1).toLowerCase() !== domaineAD.trim().toLowerCase()) return null;
    s = s.slice(0, arobase);
  }
  return SAM.test(s) ? s : null;
}

/**
 * Nom utilisé pour la liaison à l'annuaire : par défaut « identifiant@domaine » (UPN) ; l'informatique peut
 * choisir « DOMAINE\{identifiant} » ou un DN (« CN={identifiant},OU=…»). L'identifiant est déjà filtré.
 */
export function nomDeLiaison(identifiant: string, domaineAD: string, format?: string): string {
  const f = format?.trim() || "{identifiant}@{domaine}";
  return f.replaceAll("{identifiant}", identifiant).replaceAll("{domaine}", domaineAD.trim());
}

/**
 * Un mot de passe vide ne doit jamais partir vers l'annuaire : Active Directory accepte une « liaison
 * anonyme » sans mot de passe, ce qui ouvrirait n'importe quel compte.
 */
export function motDePasseADAcceptable(m: unknown): m is string {
  return typeof m === "string" && m.length > 0 && m.length <= 256 && !m.includes("\u0000");
}

/** Code de refus d'Active Directory (« data 52e », « data 533 »…) lu dans le message d'erreur de la liaison. */
export function refusDeLiaison(message: string): RefusAD {
  const code = /data ([0-9a-f]{3})/i.exec(message ?? "")?.[1]?.toLowerCase();
  switch (code) {
    case "532": // mot de passe expiré
    case "701": // compte expiré
      return "expire";
    case "773": // doit changer son mot de passe
      return "a_changer";
    case "775": // compte verrouillé
      return "verrouille";
    case "530": // heures interdites
    case "531": // poste interdit
    case "533": // compte désactivé
      return "bloque";
    default: // 52e (mauvais mot de passe), 525 (inconnu) et le reste : même réponse
      return "identifiants";
  }
}

/** Comparaison de DN sans tenir compte de la casse ni des espaces après les virgules. */
const dnNormal = (dn: string) => dn.trim().toLowerCase().replace(/\s*,\s*/g, ",");

/** Appartenance directe à un groupe (attribut memberOf). */
export function estDansGroupe(memberOf: unknown, groupe: string): boolean {
  const liste = Array.isArray(memberOf) ? memberOf : memberOf ? [memberOf] : [];
  return liste.some((g) => typeof g === "string" && dnNormal(g) === dnNormal(groupe));
}

/** Compte désactivé dans Active Directory (bit ACCOUNTDISABLE de userAccountControl). */
export function compteDesactive(userAccountControl: unknown): boolean {
  const n = Number(Array.isArray(userAccountControl) ? userAccountControl[0] : userAccountControl);
  return Number.isFinite(n) && (n & 2) === 2;
}

/** Messages de la page de connexion. Un identifiant inconnu et un mauvais mot de passe ont la même réponse. */
export const MESSAGES_AD: Record<RefusAD, string> = {
  identifiant: "Tapez votre identifiant Windows (par exemple : jdupont), pas votre adresse courriel.",
  identifiants: "Identifiant ou mot de passe Windows incorrect.",
  expire: "Votre mot de passe Windows a expiré : changez-le sur votre poste, puis réessayez.",
  a_changer: "Vous devez d'abord changer votre mot de passe Windows sur votre poste.",
  verrouille: "Votre compte Windows est verrouillé : réessayez plus tard ou contactez l'informatique.",
  bloque: "Ce compte Windows ne peut pas se connecter pour le moment : contactez l'informatique.",
  sans_acces: "Ce compte Windows n'a pas accès à l'application : demandez à un administrateur de vous ajouter.",
  indisponible: "L'annuaire de la banque ne répond pas. Réessayez dans un moment, ou utilisez une autre méthode.",
  trop: "Trop d'essais avec cet identifiant. Réessayez dans 15 minutes.",
};
