/**
 * Connexion avec le compte Windows de la banque (Active Directory), en LDAPS.
 *
 * - Activée seulement si AD_URL (ldaps://…), AD_DOMAINE et AD_BASE_DN sont renseignés.
 * - Chiffrée et vérifiée : seulement ldaps://, certificat du serveur contrôlé (autorité de la banque dans
 *   AD_CA si elle n'est pas dans le magasin du système), TLS 1.2 au moins. Jamais de LDAP en clair.
 * - La personne se lie à l'annuaire avec son propre identifiant et mot de passe : aucun compte de service
 *   n'est stocké. Le mot de passe n'est ni gardé ni écrit dans le journal.
 * - Garde-fous : mot de passe vide refusé (liaison anonyme), identifiant filtré, filtre de recherche
 *   construit par la bibliothèque (échappement), compte désactivé refusé, groupe AD facultatif (AD_GROUPE),
 *   nombre d'essais par identifiant limité (AD_ESSAIS_MAX, 3 par défaut, sous le seuil de verrouillage d'AD).
 * - Aucun compte n'est créé : l'adresse (mail, sinon userPrincipalName) doit être celle d'une personne
 *   existante et active de l'application.
 */
import "server-only";
import { readFileSync } from "node:fs";
import { AndFilter, Client, EqualityFilter, ExtensibleFilter, InvalidCredentialsError } from "ldapts";
import { compteDesactive, estDansGroupe, motDePasseADAcceptable, nomDeLiaison, normaliserIdentifiant, refusDeLiaison, type RefusAD } from "@/lib/auth/ad-regles";

const urls = () =>
  (process.env.AD_URL ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter((u) => u.toLowerCase().startsWith("ldaps://"));

export function adActive(): boolean {
  return urls().length > 0 && !!process.env.AD_DOMAINE?.trim() && !!process.env.AD_BASE_DN?.trim();
}

let ca: Buffer | undefined | null = null;
function autorite(): Buffer | undefined {
  if (ca === null) ca = process.env.AD_CA ? readFileSync(process.env.AD_CA) : undefined;
  return ca;
}

// ---------- Essais par identifiant (en mémoire : un seul serveur d'application) ----------
const FENETRE = 15 * 60_000;
const echecs = new Map<string, number[]>();
const essaisMax = () => Math.max(1, Number(process.env.AD_ESSAIS_MAX) || 3);
const recents = (cle: string) => (echecs.get(cle) ?? []).filter((t) => Date.now() - t < FENETRE);
function noterEchec(cle: string) {
  echecs.set(cle, [...recents(cle), Date.now()]);
}

/** Valeur d'un attribut, quel que soit la casse de son nom (les noms d'attributs LDAP ne la distinguent pas). */
const attribut = (e: Record<string, unknown>, nom: string): unknown => e[Object.keys(e).find((k) => k.toLowerCase() === nom.toLowerCase()) ?? nom];
const texte = (v: unknown): string => (Array.isArray(v) ? texte(v[0]) : Buffer.isBuffer(v) ? v.toString("utf8") : typeof v === "string" ? v : "");

/** Vérifie l'identifiant et le mot de passe Windows ; renvoie l'adresse de la personne dans l'annuaire. */
export async function verifierAD(saisie: string, motDePasse: unknown): Promise<{ ok: true; courriel: string; identifiant: string } | { ok: false; refus: RefusAD; identifiant: string | null }> {
  const domaine = process.env.AD_DOMAINE!.trim();
  const identifiant = normaliserIdentifiant(saisie, domaine);
  if (!identifiant) return { ok: false, refus: "identifiant", identifiant: null };
  if (!motDePasseADAcceptable(motDePasse)) return { ok: false, refus: "identifiants", identifiant };
  const cle = identifiant.toLowerCase();
  if (recents(cle).length >= essaisMax()) return { ok: false, refus: "trop", identifiant };

  for (const url of urls()) {
    const client = new Client({
      url,
      timeout: 8000,
      connectTimeout: 5000,
      strictDN: false,
      tlsOptions: { ca: autorite(), minVersion: "TLSv1.2", rejectUnauthorized: true },
    });
    try {
      try {
        await client.bind(nomDeLiaison(identifiant, domaine, process.env.AD_LIAISON), motDePasse);
      } catch (e) {
        if (e instanceof InvalidCredentialsError) {
          noterEchec(cle);
          return { ok: false, refus: refusDeLiaison(e.message), identifiant };
        }
        throw e; // serveur injoignable ou autre : on essaie le suivant
      }
      const { searchEntries } = await client.search(process.env.AD_BASE_DN!, {
        scope: "sub",
        filter: new AndFilter({ filters: [new EqualityFilter({ attribute: "objectClass", value: "user" }), new EqualityFilter({ attribute: "sAMAccountName", value: identifiant })] }),
        attributes: ["mail", "userPrincipalName", "memberOf", "userAccountControl"],
        sizeLimit: 2,
      });
      if (searchEntries.length !== 1) return { ok: false, refus: "sans_acces", identifiant };
      const e = searchEntries[0];
      if (compteDesactive(attribut(e, "userAccountControl"))) return { ok: false, refus: "bloque", identifiant };
      const groupe = process.env.AD_GROUPE?.trim();
      if (groupe && !estDansGroupe(attribut(e, "memberOf"), groupe) && !(await dansGroupeImbrique(client, e.dn, groupe))) return { ok: false, refus: "sans_acces", identifiant };
      const courriel = (texte(attribut(e, "mail")) || texte(attribut(e, "userPrincipalName"))).trim().toLowerCase();
      if (!courriel) return { ok: false, refus: "sans_acces", identifiant };
      echecs.delete(cle);
      return { ok: true, courriel, identifiant };
    } catch (e) {
      console.error(`annuaire ${url} :`, (e as Error).message);
    } finally {
      await client.unbind().catch(() => {});
    }
  }
  return { ok: false, refus: "indisponible", identifiant };
}

/** Appartenance par des groupes imbriqués (règle LDAP_MATCHING_RULE_IN_CHAIN, propre à Active Directory). */
async function dansGroupeImbrique(client: Client, dn: string, groupe: string): Promise<boolean> {
  try {
    const { searchEntries } = await client.search(dn, {
      scope: "base",
      filter: new ExtensibleFilter({ rule: "1.2.840.113556.1.4.1941", matchType: "memberOf", value: groupe }),
      attributes: ["dn"],
    });
    return searchEntries.length === 1;
  } catch {
    return false;
  }
}
