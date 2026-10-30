/** Absences et congés (29 octobre 2026) : la phrase de la barre, la charge, le bilan. */
import { describe, expect, it } from "vitest";
import { analyserAbsence, erreurAbsence, joursOuvresAbsents, texteAbsence } from "@/lib/absences";
import { chargeDUnePersonne, repartition, type TacheCharge } from "@/lib/charge";
import { analyserCommande, type ContexteCommande } from "@/lib/commandes";
import { mesurer } from "@/lib/bilan";
import { phraseOccupe } from "@/lib/creneaux";

// Jeudi 29 octobre 2026.
const JOUR = "2026-10-29";
const personnes = [
  { id: "moi", nom: "Karl-Henry Sanon" },
  { id: "my", nom: "Myriam Valcin" },
  { id: "fa", nom: "Fabienne Michel" },
];
const o = { personnes, moiId: "moi" };
const plage = (s: string) => analyserAbsence(s, JOUR, o)?.plage ?? null;

describe("une absence écrite dans la barre", () => {
  it("les périodes courantes", () => {
    expect(plage("absent du 2/11 au 6/11")).toEqual({ debut: "2026-11-02", fin: "2026-11-06" });
    expect(plage("absente du 2 au 6 novembre")).toEqual({ debut: "2026-11-02", fin: "2026-11-06" });
    expect(plage("en congé du 30 novembre au 2 décembre")).toEqual({ debut: "2026-11-30", fin: "2026-12-02" });
    expect(plage("absent du 30 au 2 décembre")).toEqual({ debut: "2026-11-30", fin: "2026-12-02" });
    expect(plage("congé 2/11-6/11")).toEqual({ debut: "2026-11-02", fin: "2026-11-06" });
    expect(plage("en congé du lundi au mercredi")).toEqual({ debut: "2026-11-02", fin: "2026-11-04" });
    expect(plage("en congé la semaine prochaine")).toEqual({ debut: "2026-11-02", fin: "2026-11-06" });
    expect(plage("absent cette semaine")).toEqual({ debut: JOUR, fin: "2026-10-30" });
    expect(plage("absent jusqu'au 4/11")).toEqual({ debut: JOUR, fin: "2026-11-04" });
    expect(plage("en congé du 28/12 au 3/1")).toEqual({ debut: "2026-12-28", fin: "2027-01-03" });
    expect(plage("absent du lundi 2/11 au vendredi 6/11")).toEqual({ debut: "2026-11-02", fin: "2026-11-06" });
    expect(plage("absente mardi 3 novembre")).toEqual({ debut: "2026-11-03", fin: "2026-11-03" });
  });
  it("une journée", () => {
    expect(plage("en formation jeudi")).toEqual({ debut: JOUR, fin: JOUR });
    expect(plage("absent demain")).toEqual({ debut: "2026-10-30", fin: "2026-10-30" });
    expect(plage("absente après-demain")).toEqual({ debut: "2026-10-31", fin: "2026-10-31" }); // un samedi : aucun jour ouvré
    expect(analyserAbsence("absente après-demain", JOUR, o)?.manque).toMatch(/week-end/);
    expect(plage("absent le 12/11")).toEqual({ debut: "2026-11-12", fin: "2026-11-12" });
    expect(plage("absent hier")).toEqual({ debut: "2026-10-28", fin: "2026-10-28" });
  });
  it("une absence passée récente reste cette année (pour corriger le bilan)", () => {
    expect(plage("absent du 26/10 au 27/10")).toEqual({ debut: "2026-10-26", fin: "2026-10-27" });
  });
  it("le motif", () => {
    expect(analyserAbsence("en congé demain", JOUR, o)?.motif).toBe("conge");
    expect(analyserAbsence("en formation demain", JOUR, o)?.motif).toBe("formation");
    expect(analyserAbsence("en mission du 2/11 au 4/11", JOUR, o)?.motif).toBe("mission");
    expect(analyserAbsence("absent demain", JOUR, o)?.motif).toBe("absence");
    expect(analyserAbsence("absent du 2/11 au 4/11 (formation)", JOUR, o)?.motif).toBe("formation");
  });
  it("pour quelqu'un d'autre", () => {
    expect(analyserAbsence("Myriam absente du 2/11 au 6/11", JOUR, o)?.personne?.id).toBe("my");
    expect(analyserAbsence("Myriam Valcin sera en congé la semaine prochaine", JOUR, o)?.personne?.id).toBe("my");
    expect(analyserAbsence("absence de Fabienne demain", JOUR, o)?.personne?.id).toBe("fa");
    expect(analyserAbsence("je suis absent demain", JOUR, o)?.personne).toBeNull();
    expect(analyserAbsence("absent demain", JOUR, o)?.personne).toBeNull();
  });
  it("ce qui n'est pas une absence reste une tâche", () => {
    for (const s of ["Congé de Myriam : préparer la passation vendredi", "Absence de compte rendu à relancer", "Préparer la formation Excel jeudi", "Pierre absent demain", "Relire les maquettes UR vendredi 2h"])
      expect(analyserAbsence(s, JOUR, o), s).toBeNull();
  });
  it("il manque la date, ou elle ne va pas", () => {
    expect(analyserAbsence("absent", JOUR, o)?.manque).toMatch(/Dites quand/);
    expect(analyserAbsence("absent du 6/11 au 2/11", JOUR, o)?.manque).toBeTruthy();
    expect(erreurAbsence({ debut: "2026-07-01", fin: "2026-07-02" }, JOUR)).toMatch(/Trop ancienne/);
    expect(erreurAbsence({ debut: "2026-11-02", fin: "2028-01-01" }, JOUR)).toMatch(/un an au plus/);
  });
  it("le texte", () => {
    expect(texteAbsence({ debut: "2026-11-02", fin: "2026-11-02" })).toBe("le lundi 2 novembre");
    expect(texteAbsence({ debut: "2026-11-02", fin: "2026-11-06" })).toBe("du lundi 2 au vendredi 6 novembre");
    expect(texteAbsence({ debut: "2026-11-30", fin: "2026-12-02" })).toBe("du lundi 30 novembre au mercredi 2 décembre");
  });
});

describe("la barre en fait une action", () => {
  const ctx: ContexteCommande = { projets: [{ id: "ur", code: "UR", titre: "Unibank Retail" }], personnes, livrables: [], phases: [], risques: [], aujourdhui: JOUR, moiId: "moi" };
  it("une absence reconnue, avec ce qu'elle fera", () => {
    const r = analyserCommande("absent du 2/11 au 6/11", ctx);
    expect(r?.commande).toEqual({ type: "absence", personneId: null, debut: "2026-11-02", fin: "2026-11-06", motif: "absence" });
    expect(r?.resume).toBe("Noter une absence pour vous : absence du lundi 2 au vendredi 6 novembre");
    expect(analyserCommande("Myriam en congé la semaine prochaine", ctx)?.commande).toMatchObject({ personneId: "my", motif: "conge" });
  });
  it("incomplète : rien n'est envoyé, on dit ce qui manque", () => {
    const r = analyserCommande("en congé", ctx);
    expect(r?.commande).toBeNull();
    expect(r?.manque).toMatch(/Dites quand/);
  });
  it("une tâche reste une tâche", () => {
    expect(analyserCommande("Préparer la formation Excel jeudi", ctx)?.commande?.type).not.toBe("absence");
  });
});

describe("la charge tient compte des absences", () => {
  const t = (x: Partial<TacheCharge>): TacheCharge => ({ id: "t", assigneId: "p", statut: "a_faire", debut: null, echeance: null, estimationHeures: null, ...x });
  const conge = [{ debut: "2026-11-04", fin: "2026-11-06" }]; // mercredi → vendredi
  it("les jours d'absence sortent des heures disponibles", () => {
    const c = chargeDUnePersonne([], ["2026-11-02", "2026-11-09"], 40, JOUR, [], conge);
    expect(c.semaines[0]).toMatchObject({ capacite: 16, absence: 3, jours: 5 });
    expect(c.semaines[1]).toMatchObject({ capacite: 40, absence: 0 });
  });
  it("une semaine entière d'absence : plus d'heures disponibles", () => {
    const c = chargeDUnePersonne([], ["2026-11-02"], 40, JOUR, [], [{ debut: "2026-11-02", fin: "2026-11-06" }]);
    expect(c.semaines[0]).toMatchObject({ capacite: 0, absence: 5, niveau: "libre" });
  });
  it("une réunion un jour d'absence ne compte pas", () => {
    const c = chargeDUnePersonne([], ["2026-11-02"], 40, JOUR, [{ jour: "2026-11-05", heures: 2 }, { jour: "2026-11-02", heures: 1 }], conge);
    expect(c.semaines[0]).toMatchObject({ capacite: 15, reunions: 1 });
  });
  it("les tâches ne sont pas placées les jours d'absence", () => {
    const r = repartition(t({ debut: "2026-11-02", echeance: "2026-11-06", estimationHeures: 10 }), JOUR, conge);
    expect(r.map((x) => x.jour)).toEqual(["2026-11-02", "2026-11-03"]);
    expect(r[0].heures).toBe(5);
  });
  it("une tâche tout entière pendant l'absence se fait avant, sinon après", () => {
    expect(repartition(t({ debut: "2026-11-05", echeance: "2026-11-05", estimationHeures: 4 }), JOUR, conge)).toEqual([{ jour: "2026-11-03", heures: 4 }]);
    expect(repartition(t({ echeance: "2026-10-30", estimationHeures: 4 }), JOUR, [{ debut: "2026-10-29", fin: "2026-10-30" }])).toEqual([{ jour: "2026-11-02", heures: 4 }]);
  });
  it("en retard : à rattraper au premier jour de présence", () => {
    expect(repartition(t({ echeance: "2026-10-20", estimationHeures: 3 }), JOUR, [{ debut: JOUR, fin: "2026-11-03" }])).toEqual([{ jour: "2026-11-04", heures: 3 }]);
  });
  it("le bilan retire les jours d'absence des heures de travail", () => {
    const m = mesurer({ debut: "2026-10-19", fin: "2026-10-23", libelle: "" } as never, { terminees: [], minutesReunion: 0, capaciteHebdo: 40, rapportsEnvoyes: 0, rapportsAttendus: 0, absences: [{ debut: "2026-10-22", fin: "2026-10-23" }] }, JOUR);
    expect(m.capaciteHeures).toBe(24);
    expect(joursOuvresAbsents([{ debut: "2026-10-22", fin: "2026-10-26" }], "2026-10-19", "2026-10-25")).toBe(2);
  });
});

describe("qui note une réunion apprend l'absence", () => {
  it("sans le motif", () => {
    expect(phraseOccupe({ id: "my", nom: "Myriam Valcin", moi: false, occupe: [], absent: true })).toBe("Myriam Valcin est absent(e) ce jour-là");
    expect(phraseOccupe({ id: "moi", nom: "", moi: true, occupe: [], absent: true })).toBe("Vous êtes absent(e) ce jour-là");
  });
});
