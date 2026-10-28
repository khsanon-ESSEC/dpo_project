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
 *   nombre d'essais par identifiant limité (AD_ESSAIS_MAX, 3 par défaut, sous le seuil de verrouillage d'AD,
 *   sur AD_FENETRE_MINUTES, 15 par défaut), compte lu après la liaison = celui de la liaison.
 * - Aucun compte n'est créé : l'adresse (mail, sinon userPrincipalName) doit être celle d'une personne
 *   existante et active de l'application.
 */
import "server-only";
import { readFileSync } from "node:fs";
import { AndFilter, Client, EqualityFilter, ExtensibleFilter, InvalidCredentialsError, NotFilter, OrFilter, type Filter } from "ldapts";
import { compteDesactive, dnDans, estDansGroupe, ligneDepuisAnnuaire, motDePasseADAcceptable, nomDeLiaison, normaliserIdentifiant, refusDeLiaison, type RefusAD } from "@/lib/auth/ad-regles";
import type { LigneImport } from "@/lib/import-organisation";

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
// Un essai est réservé AVANT d'interroger l'annuaire : dix essais envoyés en même temps n'en font pas passer
// dix. Il est rendu si aucun serveur n'a répondu, gardé si le mot de passe est faux, tout est effacé s'il est bon.
// La fenêtre (AD_FENETRE_MINUTES) doit rester au moins aussi longue que celle du verrouillage d'AD.
const fenetre = () => Math.max(1, Number(process.env.AD_FENETRE_MINUTES) || 15) * 60_000;
const essais = new Map<string, number[]>();
const essaisMax = () => Math.max(1, Number(process.env.AD_ESSAIS_MAX) || 3);
const recents = (cle: string) => (essais.get(cle) ?? []).filter((t) => Date.now() - t < fenetre());
let suivant = 0;
/** Réserve un essai ; null si l'identifiant a atteint sa limite. Le jeton sert à rendre l'essai. */
function reserverEssai(cle: string): number | null {
  const r = recents(cle);
  if (r.length >= essaisMax()) return null;
  // Un jeton unique (l'heure, décalée si deux essais tombent sur la même milliseconde).
  const t = (suivant = Math.max(Date.now(), suivant + 1));
  essais.set(cle, [...r, t]);
  return t;
}
function rendreEssai(cle: string, jeton: number) {
  const r = (essais.get(cle) ?? []).filter((t) => t !== jeton);
  if (r.length) essais.set(cle, r);
  else essais.delete(cle);
}

/**
 * Le compte à lire après la liaison : celui de la liaison elle-même. Liée par UPN (« id@domaine »), on cherche
 * aussi cet UPN ; si un autre compte porte le même identifiant Windows, on trouve deux comptes et on refuse.
 */
export function filtreDuCompte(identifiant: string, liaison: string): Filter {
  const sam = new EqualityFilter({ attribute: "sAMAccountName", value: identifiant });
  const parUPN = liaison.includes("@") && !liaison.includes("=");
  return new AndFilter({
    filters: [new EqualityFilter({ attribute: "objectClass", value: "user" }), parUPN ? new OrFilter({ filters: [sam, new EqualityFilter({ attribute: "userPrincipalName", value: liaison })] }) : sam],
  });
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
  const jeton = reserverEssai(cle);
  if (jeton === null) return { ok: false, refus: "trop", identifiant };
  const liaison = nomDeLiaison(identifiant, domaine, process.env.AD_LIAISON);

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
        await client.bind(liaison, motDePasse);
      } catch (e) {
        // Mot de passe faux : l'essai reste compté.
        if (e instanceof InvalidCredentialsError) return { ok: false, refus: refusDeLiaison(e.message), identifiant };
        throw e; // serveur injoignable ou autre : on essaie le suivant
      }
      essais.delete(cle);
      const { searchEntries } = await client.search(process.env.AD_BASE_DN!, {
        scope: "sub",
        filter: filtreDuCompte(identifiant, liaison),
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
      return { ok: true, courriel, identifiant };
    } catch (e) {
      console.error(`annuaire ${url} :`, (e as Error).message);
    } finally {
      await client.unbind().catch(() => {});
    }
  }
  // Aucun serveur n'a répondu : l'essai ne compte pas.
  rendreEssai(cle, jeton);
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

// ---------------------------------------------------------------------------
// Importer l'organisation depuis l'annuaire (administrateurs)
// ---------------------------------------------------------------------------

export type RefusLecture = RefusAD | "perimetre";

/**
 * Lit les comptes de l'annuaire pour l'import : l'administrateur se lie avec SON compte Windows (rien n'est
 * gardé), on lit les membres du groupe AD_GROUPE (groupes imbriqués compris) ou d'une unité d'organisation
 * indiquée, comptes désactivés exclus. Le supérieur vient de l'attribut « manager ».
 */
export async function lireAnnuaire(
  saisie: string,
  motDePasse: unknown,
  o: { ou?: string; equipeDepuisService: boolean },
): Promise<{ ok: true; lignes: LigneImport[]; sansAdresse: number } | { ok: false; refus: RefusLecture }> {
  const domaine = process.env.AD_DOMAINE!.trim();
  const base = process.env.AD_BASE_DN!.trim();
  const groupe = process.env.AD_GROUPE?.trim() || null;
  const ou = (o.ou ?? "").trim();
  if (ou && !dnDans(ou, base)) return { ok: false, refus: "perimetre" };
  // Sans groupe de l'application : une unité d'organisation sous la base, jamais tout l'annuaire de la banque.
  if (!groupe && (!ou || dnDans(base, ou))) return { ok: false, refus: "perimetre" };
  const identifiant = normaliserIdentifiant(saisie, domaine);
  if (!identifiant) return { ok: false, refus: "identifiant" };
  if (!motDePasseADAcceptable(motDePasse)) return { ok: false, refus: "identifiants" };
  const cle = identifiant.toLowerCase();
  const jeton = reserverEssai(cle);
  if (jeton === null) return { ok: false, refus: "trop" };

  const filtres: Filter[] = [
    new EqualityFilter({ attribute: "objectClass", value: "user" }),
    new EqualityFilter({ attribute: "objectCategory", value: "person" }),
    // Comptes désactivés exclus (bit 2 de userAccountControl, règle LDAP_MATCHING_RULE_BIT_AND).
    new NotFilter({ filter: new ExtensibleFilter({ rule: "1.2.840.113556.1.4.803", matchType: "userAccountControl", value: "2" }) }),
  ];
  if (groupe) filtres.push(new ExtensibleFilter({ rule: "1.2.840.113556.1.4.1941", matchType: "memberOf", value: groupe }));

  for (const url of urls()) {
    const client = new Client({ url, timeout: 20000, connectTimeout: 5000, strictDN: false, tlsOptions: { ca: autorite(), minVersion: "TLSv1.2", rejectUnauthorized: true } });
    try {
      try {
        await client.bind(nomDeLiaison(identifiant, domaine, process.env.AD_LIAISON), motDePasse);
      } catch (e) {
        if (e instanceof InvalidCredentialsError) return { ok: false, refus: refusDeLiaison(e.message) };
        throw e;
      }
      essais.delete(cle);
      const ATTRIBUTS = ["givenName", "sn", "displayName", "mail", "userPrincipalName", "title", "department", "manager", "userAccountControl"];
      const { searchEntries } = await client.search(ou || base, { scope: "sub", filter: new AndFilter({ filters: filtres }), attributes: ATTRIBUTS, paged: { pageSize: 500 }, sizeLimit: 3000 });
      const entrees = searchEntries.filter((e) => !compteDesactive(attribut(e, "userAccountControl")));
      const lire = (e: Record<string, unknown>) => Object.fromEntries(ATTRIBUTS.map((a) => [a, texte(attribut(e, a)).trim()]));
      const parDn = new Map(entrees.map((e) => [e.dn.toLowerCase().replace(/\s*,\s*/g, ","), lire(e)]));
      // Supérieurs hors du groupe : lus un par un (au plus 200), pour connaître leur adresse.
      const manquants = [...new Set(entrees.map((e) => lire(e).manager).filter((m) => m && !parDn.has(m.toLowerCase().replace(/\s*,\s*/g, ","))))].slice(0, 200);
      for (const dn of manquants) {
        try {
          const r = await client.search(dn, { scope: "base", filter: new EqualityFilter({ attribute: "objectClass", value: "user" }), attributes: ATTRIBUTS });
          if (r.searchEntries[0]) parDn.set(dn.toLowerCase().replace(/\s*,\s*/g, ","), lire(r.searchEntries[0]));
        } catch {
          // supérieur illisible : la case reste vide
        }
      }
      let sansAdresse = 0;
      const lignes: LigneImport[] = [];
      entrees.forEach((e, i) => {
        const l = ligneDepuisAnnuaire(lire(e), (dn) => parDn.get(dn.toLowerCase().replace(/\s*,\s*/g, ",")) ?? null, i + 1, o.equipeDepuisService);
        if (l) lignes.push(l);
        else sansAdresse += 1;
      });
      return { ok: true, lignes, sansAdresse };
    } catch (e) {
      console.error(`annuaire ${url} :`, (e as Error).message);
    } finally {
      await client.unbind().catch(() => {});
    }
  }
  rendreEssai(cle, jeton);
  return { ok: false, refus: "indisponible" };
}
