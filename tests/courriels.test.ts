/**
 * Rappels du vendredi par courriel : règles pures, puis la tournée contre la base de démonstration
 * (TEST_DATABASE_URL), avec un expéditeur factice qui garde les courriels au lieu de les envoyer.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { courrielDu, lireConfigSmtp, messageRappel } from "@/lib/courriel-regles";
import { HORAIRES_PAR_DEFAUT } from "@/lib/modeles";
import type * as CourrielsModule from "@/lib/donnees/courriels";
import type * as DbModule from "@/db";
import type { Courriel } from "@/lib/courriel";

const rien = new Set<string>();
const midi = 12 * 60;

describe("quand envoyer un rappel", () => {
  it("prêt à relire, puis le rappel ; jamais deux fois", () => {
    expect(courrielDu("en_preparation", { rapportEnvoye: false, avecRappel: true, deja: rien, minutes: midi })).toBeNull();
    expect(courrielDu("pret", { rapportEnvoye: false, avecRappel: true, deja: rien, minutes: midi })).toBe("rapport_pret");
    expect(courrielDu("pret", { rapportEnvoye: false, avecRappel: true, deja: new Set(["rapport_pret"]), minutes: midi })).toBeNull();
    expect(courrielDu("rappel", { rapportEnvoye: false, avecRappel: true, deja: new Set(["rapport_pret"]), minutes: midi })).toBe("rapport_rappel");
    expect(courrielDu("rappel", { rapportEnvoye: false, avecRappel: true, deja: new Set(["rapport_pret", "rapport_rappel"]), minutes: midi })).toBeNull();
  });
  it("si les deux sont dus au même passage, seul le rappel part", () => {
    expect(courrielDu("rappel", { rapportEnvoye: false, avecRappel: true, deja: rien, minutes: midi })).toBe("rapport_rappel");
    expect(courrielDu("en_retard", { rapportEnvoye: false, avecRappel: true, deja: rien, minutes: midi })).toBe("rapport_rappel");
  });
  it("rien si le rapport est parti, la nuit, ou sans heure de rappel après l'heure limite", () => {
    expect(courrielDu("rappel", { rapportEnvoye: true, avecRappel: true, deja: rien, minutes: midi })).toBeNull();
    expect(courrielDu("pret", { rapportEnvoye: false, avecRappel: true, deja: rien, minutes: 6 * 60 + 59 })).toBeNull();
    expect(courrielDu("pret", { rapportEnvoye: false, avecRappel: true, deja: rien, minutes: 20 * 60 })).toBeNull();
    expect(courrielDu("en_retard", { rapportEnvoye: false, avecRappel: false, deja: rien, minutes: midi })).toBeNull();
    expect(courrielDu("pret", { rapportEnvoye: false, avecRappel: false, deja: rien, minutes: midi })).toBe("rapport_pret");
  });
});

describe("ce que dit le courriel", () => {
  const lien = "https://pilotage.unibank.local/connexion?suite=/rapport";
  it("un lien vers le rapport, l'heure limite, rien du contenu du rapport", () => {
    const m = messageRappel("rapport_rappel", { prenom: "Daphnée", semaine: "2026-10-26", horaires: HORAIRES_PAR_DEFAUT, enRetard: false, lien });
    expect(m.sujet).toBe("Rappel : votre rapport est à envoyer avant vendredi 30 oct. à 17 h");
    expect(m.texte).toContain(`Ouvrir mon rapport : ${lien}`);
    expect(m.texte).toMatch(/^Bonjour Daphnée,/);
    expect(m.html).toContain(`href="${lien}"`);
  });
  it("le prénom est échappé dans le HTML", () => {
    const m = messageRappel("rapport_pret", { prenom: "<b>x</b>", semaine: "2026-10-26", horaires: HORAIRES_PAR_DEFAUT, enRetard: false, lien });
    expect(m.html).not.toContain("<b>x</b>");
    expect(m.html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
  it("après l'heure limite : « n'est pas encore parti »", () => {
    expect(messageRappel("rapport_rappel", { prenom: "A", semaine: "2026-10-26", horaires: HORAIRES_PAR_DEFAUT, enRetard: true, lien }).sujet).toBe("Votre rapport de la semaine n'est pas encore parti");
  });
});

describe("configuration SMTP", () => {
  it("sans SMTP_HOTE : pas de courriel", () => {
    expect(lireConfigSmtp({})).toBeNull();
  });
  it("STARTTLS sur 587 par défaut ; expéditeur obligatoire", () => {
    expect(lireConfigSmtp({ SMTP_HOTE: "smtp.unibank.local", SMTP_EXPEDITEUR: "Pilotage <pilotage@unibankhaiti.com>" })).toEqual({
      config: { hote: "smtp.unibank.local", port: 587, tls: "starttls", utilisateur: null, motDePasse: null, expediteur: "Pilotage <pilotage@unibankhaiti.com>", ca: null },
    });
    expect(lireConfigSmtp({ SMTP_HOTE: "smtp.unibank.local" })).toHaveProperty("erreur");
    expect(lireConfigSmtp({ SMTP_HOTE: "h", SMTP_EXPEDITEUR: "a@b.c\nBcc: x@y.z" })).toHaveProperty("erreur");
  });
  it("jamais de mot de passe sans TLS", () => {
    expect(lireConfigSmtp({ SMTP_HOTE: "h", SMTP_EXPEDITEUR: "a@b.c", SMTP_TLS: "aucun", SMTP_UTILISATEUR: "u", SMTP_MOT_DE_PASSE: "p" })).toHaveProperty("erreur");
    expect(lireConfigSmtp({ SMTP_HOTE: "h", SMTP_EXPEDITEUR: "a@b.c", SMTP_TLS: "implicite" })).toMatchObject({ config: { port: 465, tls: "implicite" } });
  });
});

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("tournée des rappels (base de démonstration)", () => {
  let C: typeof CourrielsModule;
  let D: typeof DbModule;
  let boite: Courriel[] = [];
  let enPanne = new Set<string>();
  const envoyer = async (c: Courriel) => {
    if (enPanne.has(c.a)) throw new Error(`550 boîte ${c.a} indisponible`);
    boite.push(c);
  };
  const jour = "2026-10-30";
  const a = (h: number, m = 0) => ({ jour, minutes: h * 60 + m });

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    D = await import("@/db");
    C = await import("@/lib/donnees/courriels");
  });
  afterAll(async () => {
    await D.db.delete(D.schema.envoisCourriel);
    await globalThis.__pgClient?.end();
  });

  it("avant l'heure « prêt » : rien", async () => {
    expect(await C.tourneeRappels({ envoyer, maintenant: a(8, 30), lien: "L" })).toEqual({ envoyes: 0, erreurs: 0 });
    expect(boite).toHaveLength(0);
  });

  it("à l'heure « prêt » : un courriel par rédacteur dont le rapport n'est pas parti, une seule fois", async () => {
    // Données d'exemple : quatre rédacteurs n'ont pas encore envoyé leur rapport (les autres, si).
    const r = await C.tourneeRappels({ envoyer, maintenant: a(10, 30), lien: "L" });
    expect(r).toEqual({ envoyes: 4, erreurs: 0 });
    const adresses = boite.map((c) => c.a);
    expect(adresses.sort()).toEqual(["daphnee.joseph", "marc-antoine.louis", "nadege.augustin", "sophonie.charles"].map((x) => `${x}@demo.dpo.local`));
    expect(boite.every((c) => c.sujet === "Votre rapport de la semaine est prêt à relire")).toBe(true);
    // Exécutif (ne rédige pas), personne hors division, rapport déjà envoyé : rien.
    expect(adresses).not.toContain("frantz.desrosiers@demo.dpo.local");
    expect(adresses).not.toContain("nathalie.celestin@demo.dpo.local");
    expect(adresses).not.toContain("fabienne.michel@demo.dpo.local");
    expect(adresses).toContain("daphnee.joseph@demo.dpo.local");
    expect(boite.every((c) => c.texte.includes("Ouvrir mon rapport : L"))).toBe(true);
    const n = boite.length;
    expect(await C.tourneeRappels({ envoyer, maintenant: a(10, 35), lien: "L" })).toEqual({ envoyes: 0, erreurs: 0 });
    expect(boite).toHaveLength(n);
  });

  it("à l'heure du rappel : seulement si le rapport n'est toujours pas parti ; un envoi manqué est retenté plus tard", async () => {
    const avant = boite.length;
    // Deux boîtes indisponibles parmi celles qui ont reçu « prêt à relire » (pas Daphnée).
    const pannes = boite.map((c) => c.a).filter((x) => x !== "daphnee.joseph@demo.dpo.local").slice(0, 2);
    boite = [];
    // Daphnée envoie son rapport entre-temps.
    const [daphnee] = await D.db.select({ id: D.schema.personnes.id }).from(D.schema.personnes).where(sql`${D.schema.personnes.courriel} = 'daphnee.joseph@demo.dpo.local'`);
    await D.db
      .update(D.schema.rapportsHebdo)
      .set({ statut: "envoye", envoyeLe: new Date() })
      .where(sql`${D.schema.rapportsHebdo.auteurId} = ${daphnee.id} and ${D.schema.rapportsHebdo.semaine} = '2026-10-26'`);
    const [rapport] = await D.db.select({ id: D.schema.rapportsHebdo.id }).from(D.schema.rapportsHebdo).where(sql`${D.schema.rapportsHebdo.auteurId} = ${daphnee.id} and ${D.schema.rapportsHebdo.semaine} = '2026-10-26'`);
    if (!rapport) await D.db.insert(D.schema.rapportsHebdo).values({ auteurId: daphnee.id, semaine: "2026-10-26", statut: "envoye", envoyeLe: new Date() });
    enPanne = new Set(pannes);
    const r = await C.tourneeRappels({ envoyer, maintenant: a(14, 10), lien: "L" });
    expect(boite.map((c) => c.a)).not.toContain("daphnee.joseph@demo.dpo.local");
    expect(boite.every((c) => c.sujet.startsWith("Rappel : votre rapport est à envoyer avant vendredi 30 oct."))).toBe(true);
    expect(r.envoyes + r.erreurs).toBeLessThan(avant);
    expect(r.erreurs).toBe(2);
    const manques = await D.db.select().from(D.schema.envoisCourriel).where(sql`${D.schema.envoisCourriel.erreur} <> ''`);
    expect(manques.length).toBe(2);
    // L'erreur est gardée sans l'adresse.
    expect(manques.every((m) => !m.erreur.includes("@demo.dpo.local"))).toBe(true);

    // Tout de suite : pas de nouvel essai. Vingt minutes plus tard (horloge reculée en base) : nouvel essai.
    enPanne = new Set();
    expect((await C.tourneeRappels({ envoyer, maintenant: a(14, 15), lien: "L" })).envoyes).toBe(0);
    await D.db.update(D.schema.envoisCourriel).set({ envoyeLe: new Date(Date.now() - 30 * 60_000) }).where(sql`${D.schema.envoisCourriel.erreur} <> ''`);
    boite = [];
    expect((await C.tourneeRappels({ envoyer, maintenant: a(14, 40), lien: "L" })).envoyes).toBe(2);
    expect(boite.map((c) => c.a).sort()).toEqual([...pannes].sort());
    expect((await D.db.select().from(D.schema.envoisCourriel).where(sql`${D.schema.envoisCourriel.erreur} <> ''`)).length).toBe(0);
  });
});
