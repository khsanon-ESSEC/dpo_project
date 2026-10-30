/**
 * Absences (29 octobre 2026), contre la base de démonstration : qui peut en noter, la barre, « Annuler »,
 * l'alerte au supérieur ou à la personne, la charge et la réunion qui l'apprennent.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type * as AccesModule from "@/lib/acces";
import type * as DbModule from "@/db";
import type * as CommandesModule from "@/lib/donnees/commandes";
import type * as AnnulationsModule from "@/lib/donnees/annulations";
import type * as AbsencesModule from "@/lib/donnees/absences";
import type * as ChargeModule from "@/lib/donnees/charge";
import type * as DispoModule from "@/lib/donnees/disponibilites";
import type { Utilisateur } from "@/lib/auth/session";

const URL_TEST = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_TEST)("absences", () => {
  let A: typeof AccesModule;
  let D: typeof DbModule;
  let C: typeof CommandesModule;
  let N: typeof AnnulationsModule;
  let B: typeof AbsencesModule;
  let H: typeof ChargeModule;
  let P: typeof DispoModule;
  const gens = new Map<string, Utilisateur>();
  const qui = (courriel: string) => gens.get(courriel)!;
  const faire = async (courriel: string, saisie: string) => C.executerCommande(qui(courriel), await A.acces(qui(courriel)), { saisie, projetId: "" });
  const absencesDe = async (courriel: string) => D.db.select().from(D.schema.absences).where(eq(D.schema.absences.personneId, qui(courriel).id));
  const alertes = async (courriel: string) => (await D.db.select().from(D.schema.notifications).where(eq(D.schema.notifications.personneId, qui(courriel).id))).filter((n) => n.type === "absence");

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    process.env.DATE_DEMO = "2026-10-30";
    D = await import("@/db");
    A = await import("@/lib/acces");
    C = await import("@/lib/donnees/commandes");
    N = await import("@/lib/donnees/annulations");
    B = await import("@/lib/donnees/absences");
    H = await import("@/lib/donnees/charge");
    P = await import("@/lib/donnees/disponibilites");
    for (const p of await D.db.select().from(D.schema.personnes)) {
      gens.set((p.courriel ?? p.id).split("@")[0], { id: p.id, prenom: p.prenom, nom: p.nom, poste: p.poste, directeur: p.directeur, executif: p.executif, administrateur: p.administrateur, externe: p.externe, theme: p.theme, doitChangerMotDePasse: false });
    }
  });

  afterAll(async () => {
    await D.db.delete(D.schema.absences);
    await globalThis.__pgClient?.end();
  });

  it("pour soi dans la barre : notée, le supérieur prévenu, « Annuler » la retire", async () => {
    const avant = (await alertes("myriam.valcin")).length;
    const r = await faire("fabienne.michel", "en congé du 2/11 au 4/11");
    expect(r).toMatchObject({ ok: true, message: "Absence notée pour vous : congé du lundi 2 au mercredi 4 novembre. Elle compte dans la charge.", lien: "/profil#absences" });
    expect(await absencesDe("fabienne.michel")).toMatchObject([{ debut: "2026-11-02", fin: "2026-11-04", motif: "conge" }]);
    const a = await alertes("myriam.valcin");
    expect(a.length).toBe(avant + 1);
    expect(a.at(-1)?.texte).toBe("Fabienne Michel sera absent(e) du lundi 2 au mercredi 4 novembre (congé).");
    // La charge de la semaine prochaine : trois jours de moins.
    const { lignes } = await H.chargeDesPersonnes([qui("fabienne.michel").id], 2);
    expect(lignes[0].charge.semaines[1]).toMatchObject({ absence: 3, jours: 5 });
    // Déjà couverte : rien de plus.
    expect(await faire("fabienne.michel", "absente le 3/11")).toMatchObject({ ok: true, message: expect.stringMatching(/^Déjà notée/) });
    expect(await N.annulerAction(await A.acces(qui("fabienne.michel")), r.annulation ?? "")).toMatchObject({ ok: true });
    expect(await absencesDe("fabienne.michel")).toEqual([]);
  });

  it("pour une personne qu'on suit : la personne est prévenue ; pas pour une autre", async () => {
    const r = await faire("myriam.valcin", "Joël en formation du 9/11 au 10/11");
    expect(r).toMatchObject({ ok: true, message: expect.stringMatching(/^Absence notée pour Joël Dorval : formation du lundi 9 au mardi 10 novembre/) });
    expect((await alertes("joel.dorval")).at(-1)?.texte).toMatch(/^Myriam Valcin a noté votre absence du lundi 9 au mardi 10 novembre \(formation\)\.$/);
    // Daphnée n'est pas dans l'équipe de Myriam.
    expect(await faire("myriam.valcin", "Daphnée absente du 9/11 au 10/11")).toMatchObject({ message: "Vous ne pouvez noter que vos absences, ou celles des personnes que vous suivez." });
    // Une personne hors division n'en note pas.
    const n = gens.get("nathalie.celestin")!;
    expect(await B.noterAbsence(await A.acces(n), { personneId: n.id, debut: "2026-11-09", fin: "2026-11-09", motif: "conge" })).toMatchObject({ erreur: expect.stringMatching(/division/) });
    // Retirer : Joël lui-même peut le faire.
    const [x] = await absencesDe("joel.dorval");
    expect(await B.retirerAbsence(await A.acces(qui("daphnee.joseph")), x.id)).toMatchObject({ erreur: "Absence introuvable." });
    expect(await B.retirerAbsence(await A.acces(qui("joel.dorval")), x.id)).toMatchObject({ ok: true });
  });

  it("qui note une réunion apprend l'absence, sans le motif", async () => {
    const m = qui("myriam.valcin");
    await B.noterAbsence(await A.acces(m), { personneId: qui("joel.dorval").id, debut: "2026-11-12", fin: "2026-11-12", motif: "mission" });
    const d = await P.disponibilites({ moiId: m.id, personneIds: [qui("joel.dorval").id], jour: "2026-11-12", heure: "", duree: 60 });
    expect(d).toEqual([{ id: qui("joel.dorval").id, nom: "Joël Dorval", moi: false, occupe: [], absent: true }]);
    expect(await P.disponibilites({ moiId: m.id, personneIds: [qui("joel.dorval").id], jour: "2026-11-13", heure: "10:00", duree: 60 })).toEqual([]);
  });
});
