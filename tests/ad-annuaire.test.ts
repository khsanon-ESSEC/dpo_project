/**
 * Connexion Windows contre un annuaire factice en LDAPS (scripts/essai/annuaire-factice.mjs).
 * Lancer avec AD_TEST_URL=ldaps://127.0.0.1:6360 AD_TEST_CA=…/ac.pem AD_TEST_AUTRE_CA=…/autre-ac.pem npm test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "ldapts";

const URL_TEST = process.env.AD_TEST_URL;
const GROUPE = "CN=App-Pilotage-DPO,OU=Groupes,DC=demo,DC=local";

describe.skipIf(!URL_TEST)("connexion Windows contre un annuaire en LDAPS", () => {
  const avant = { ...process.env };
  const charger = async (env: Record<string, string | undefined> = {}) => {
    vi.resetModules(); // le module garde l'autorité de certification et les essais en mémoire
    Object.assign(process.env, {
      AD_URL: URL_TEST,
      AD_DOMAINE: "demo.local",
      AD_BASE_DN: "dc=demo,dc=local",
      AD_LIAISON: "uid={identifiant},ou=personnes,dc=demo,dc=local",
      AD_CA: process.env.AD_TEST_CA,
      AD_GROUPE: GROUPE,
      AD_ESSAIS_MAX: "3",
      ...env,
    });
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
    return import("@/lib/auth/ad");
  };
  /** Liaisons reçues par l'annuaire factice (sans les mots de passe). */
  const liaisonsRecues = async (): Promise<{ id: string; vide: boolean }[]> => {
    const c = new Client({ url: URL_TEST!, tlsOptions: { ca: (await import("node:fs")).readFileSync(process.env.AD_TEST_CA!) } });
    try {
      const { searchEntries } = await c.search("cn=journal", { scope: "base" });
      return JSON.parse(String(searchEntries[0].liaisons));
    } finally {
      await c.unbind();
    }
  };

  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    for (const k of Object.keys(process.env)) if (!(k in avant)) delete process.env[k];
    Object.assign(process.env, avant);
  });

  it("connecte avec l'identifiant et le mot de passe Windows, sous ses trois formes", async () => {
    const AD = await charger();
    expect(AD.adActive()).toBe(true);
    for (const saisie of ["naugustin", "UNIBANK\\naugustin", "naugustin@demo.local"]) {
      expect(await AD.verifierAD(saisie, "Windows-Nadege-1")).toEqual({ ok: true, courriel: "nadege.augustin@demo.dpo.local", identifiant: "naugustin" });
    }
  });

  it("refuse un mauvais mot de passe, et répond pareil pour un identifiant inconnu", async () => {
    const AD = await charger();
    expect(await AD.verifierAD("naugustin", "faux")).toMatchObject({ ok: false, refus: "identifiants" });
    expect(await AD.verifierAD("personne-inexistante", "faux")).toMatchObject({ ok: false, refus: "identifiants" });
  });

  it("n'envoie jamais un mot de passe vide à l'annuaire (qui l'accepterait en anonyme)", async () => {
    const AD = await charger();
    expect(await AD.verifierAD("jrnoel", "")).toMatchObject({ ok: false, refus: "identifiants" });
    expect((await liaisonsRecues()).some((l) => l.id === "jrnoel" && l.vide)).toBe(false);
  });

  it("refuse un compte désactivé ou un mot de passe expiré, avec le bon message", async () => {
    const AD = await charger();
    expect(await AD.verifierAD("desactive", "Windows-Desactive-1")).toMatchObject({ ok: false, refus: "bloque" });
    expect(await AD.verifierAD("expire", "Windows-Expire-1")).toMatchObject({ ok: false, refus: "expire" });
  });

  it("exige le groupe AD quand il est configuré", async () => {
    expect(await (await charger()).verifierAD("djoseph", "Windows-Daphnee-1")).toMatchObject({ ok: false, refus: "sans_acces" });
    expect(await (await charger({ AD_GROUPE: undefined })).verifierAD("djoseph", "Windows-Daphnee-1")).toMatchObject({ ok: true, courriel: "daphnee.joseph@demo.dpo.local" });
  });

  it("prend l'UPN quand le compte n'a pas d'adresse courriel", async () => {
    expect(await (await charger()).verifierAD("sansmail", "Windows-SansMail-1")).toMatchObject({ ok: true, courriel: "sansmail@demo.local" });
  });

  it("limite les essais par identifiant, même avec le bon mot de passe ensuite", async () => {
    const AD = await charger();
    for (let i = 0; i < 3; i++) expect(await AD.verifierAD("inconnu", "faux")).toMatchObject({ refus: "identifiants" });
    expect(await AD.verifierAD("inconnu", "Windows-Inconnu-1")).toMatchObject({ ok: false, refus: "trop" });
    // Un autre identifiant n'est pas touché.
    expect(await AD.verifierAD("naugustin", "Windows-Nadege-1")).toMatchObject({ ok: true });
  });

  it("passe au serveur suivant quand le premier ne répond pas", async () => {
    const AD = await charger({ AD_URL: `ldaps://127.0.0.1:6399,${URL_TEST}` });
    expect(await AD.verifierAD("naugustin", "Windows-Nadege-1")).toMatchObject({ ok: true });
  });

  it("refuse un serveur dont le certificat n'est pas signé par l'autorité de la banque", async () => {
    expect(await (await charger({ AD_CA: process.env.AD_TEST_AUTRE_CA })).verifierAD("naugustin", "Windows-Nadege-1")).toMatchObject({ ok: false, refus: "indisponible" });
    expect(await (await charger({ AD_CA: undefined })).verifierAD("naugustin", "Windows-Nadege-1")).toMatchObject({ ok: false, refus: "indisponible" });
  });

  it("n'utilise jamais de LDAP en clair", async () => {
    const AD = await charger({ AD_URL: "ldap://127.0.0.1:389" });
    expect(AD.adActive()).toBe(false);
  });

  it("rejette une saisie qui ressemble à une injection, sans rien envoyer", async () => {
    const AD = await charger();
    const n = (await liaisonsRecues()).length;
    expect(await AD.verifierAD("*)(uid=*", "x")).toMatchObject({ ok: false, refus: "identifiant" });
    expect((await liaisonsRecues()).length).toBe(n);
  });

  describe("lire l'annuaire pour importer l'organisation", () => {
    it("membres actifs du groupe (groupes imbriqués compris), avec poste, service et supérieur ; comptes désactivés exclus", async () => {
      const ad = await charger();
      const r = await ad.lireAnnuaire("jrnoel", "Windows-JeanRobert-1", { equipeDepuisService: true });
      if (!r.ok) throw new Error(r.refus);
      const parCourriel = new Map(r.lignes.map((l) => [l.courriel, l]));
      expect(parCourriel.has("daphnee.joseph@demo.dpo.local")).toBe(false); // pas dans le groupe
      expect(parCourriel.has("desactive@demo.dpo.local")).toBe(false); // compte désactivé
      expect(parCourriel.get("rose.cadet@demo.dpo.local")).toMatchObject({ prenom: "Rose", nom: "Cadet", poste: "Chargée de projets", equipe: "Projets organisationnels", superieur: "jean-robert.noel@demo.dpo.local" });
      expect(parCourriel.get("jean-robert.noel@demo.dpo.local")).toMatchObject({ superieur: "nadege.augustin@demo.dpo.local" });
    });
    it("sans le service comme équipe ; une unité d'organisation hors de la base est refusée ; mauvais mot de passe refusé", async () => {
      const ad = await charger();
      const r = await ad.lireAnnuaire("jrnoel", "Windows-JeanRobert-1", { equipeDepuisService: false });
      expect(r.ok && r.lignes.every((l) => l.equipe === "")).toBe(true);
      expect(await ad.lireAnnuaire("jrnoel", "Windows-JeanRobert-1", { ou: "ou=x,dc=autre,dc=local", equipeDepuisService: true })).toEqual({ ok: false, refus: "perimetre" });
      expect(await ad.lireAnnuaire("jrnoel", "faux", { equipeDepuisService: true })).toEqual({ ok: false, refus: "identifiants" });
      expect(await ad.lireAnnuaire("jrnoel", "", { equipeDepuisService: true })).toEqual({ ok: false, refus: "identifiants" });
    });
    it("sans groupe AD_GROUPE, une unité d'organisation est obligatoire", async () => {
      const ad = await charger({ AD_GROUPE: undefined });
      expect(await ad.lireAnnuaire("jrnoel", "Windows-JeanRobert-1", { equipeDepuisService: true })).toEqual({ ok: false, refus: "perimetre" });
      const r = await ad.lireAnnuaire("jrnoel", "Windows-JeanRobert-1", { ou: "ou=personnes,dc=demo,dc=local", equipeDepuisService: true });
      expect(r.ok && r.lignes.some((l) => l.courriel === "daphnee.joseph@demo.dpo.local")).toBe(true);
    });
  });
});
