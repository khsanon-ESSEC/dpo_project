/** Lecture d'un rapport : chiffres de la semaine, changements depuis la semaine dernière, ordre des parties. */
import { describe, expect, it } from "vitest";
import { changementsDepuis, ecart, nouvellesDecisions, ordreDeLecture, resumerRapport, semainesDepuis, type LigneResume } from "@/lib/lecture-rapport";
import type { Champ } from "@/lib/modeles";

const F: Champ[] = [
  { id: "fait", type: "lignes", libelle: "Fait", rubrique: "fait", parProjet: true },
  { id: "bloque", type: "lignes", libelle: "Bloqué", rubrique: "bloque", parProjet: true },
  { id: "sante", type: "sante", libelle: "Santé" },
  { id: "decision", type: "texte", libelle: "Décision", rubrique: "decision" },
  { id: "charge", type: "charge", libelle: "Ma charge" },
  { id: "reunions", type: "reunions", libelle: "Réunions" },
] as Champ[];

let n = 0;
const ligne = (champId: string, texte: string, o: Partial<LigneResume> = {}): LigneResume => ({ id: `l${++n}`, champId, partie: champId, texte, origines: [], projetId: null, ...o });

describe("semainesDepuis", () => {
  it("compte la semaine en cours comme la première", () => {
    expect(semainesDepuis(null, "2026-10-26")).toBe(1);
    expect(semainesDepuis("2026-10-26", "2026-10-26")).toBe(1);
    expect(semainesDepuis("2026-10-19", "2026-10-26")).toBe(2);
    expect(semainesDepuis("2026-10-12", "2026-10-26")).toBe(3);
  });
});

describe("resumerRapport", () => {
  const semaine = "2026-10-26";
  const m = resumerRapport(
    F,
    [
      ligne("fait", "A"),
      ligne("fait", "B"),
      ligne("fait", "reçu de l'équipe", { origines: ["x"] }),
      ligne("bloque", "Serveur", { depuisSemaine: "2026-10-12", projetCode: "CR" }),
      ligne("bloque", "Accès", {}),
      ligne("bloque", "Droits", { resolu: true }),
    ],
    [
      { champId: "sante", projetId: "p1", valeur: "en_retard", projetCode: "CR", projetTitre: "Credos" },
      { champId: "decision", projetId: null, valeur: "Valider la licence" },
      { champId: "charge", projetId: null, valeur: "lourde", commentaire: "42 h sur 40 h" },
      { champId: "reunions", projetId: null, valeur: JSON.stringify({ minutes: 150, reunions: [{}, {}] }) },
    ],
    semaine,
  );
  it("compte ses propres lignes, sans les éléments reçus ni les blocages résolus", () => {
    expect(m.fait).toBe(2);
    expect(m.bloques).toBe(2);
    expect(m.resolus).toBe(1);
    expect(m.anciens).toEqual([{ texte: "Serveur", semaines: 3, projetCode: "CR" }]);
  });
  it("lit la décision écrite, la charge, les réunions figées et les feux", () => {
    expect(m.decisions).toBe(1);
    expect(m.charge).toEqual({ valeur: "lourde", commentaire: "42 h sur 40 h" });
    expect(m.reunion).toEqual({ minutes: 150, n: 2 });
    expect(m.sante.get("p1")?.valeur).toBe("en_retard");
  });
  it("préfère la liste du brouillon pour l'aperçu", () => {
    const r = resumerRapport(F, [], [], semaine, { minutes: 30, reunions: [] });
    expect(r.reunion).toEqual({ minutes: 30, n: 0 });
  });
  it("laisse vide ce que le modèle n'a pas", () => {
    const r = resumerRapport([F[0]], [], [], semaine);
    expect(r.bloques).toBeNull();
    expect(r.decisions).toBeNull();
    expect(r.reunion).toBeNull();
  });

  it("dit ce qui a changé : feu dégradé, décision nouvelle, blocage qui dure, réunions, charge", () => {
    const p = resumerRapport(
      F,
      [ligne("fait", "X")],
      [
        { champId: "sante", projetId: "p1", valeur: "dans_les_temps", projetCode: "CR", projetTitre: "Credos" },
        { champId: "decision", projetId: null, valeur: "Autre chose" },
        { champId: "charge", projetId: null, valeur: "normale" },
        { champId: "reunions", projetId: null, valeur: JSON.stringify({ minutes: 300, reunions: [] }) },
      ],
      "2026-10-19",
    );
    expect(nouvellesDecisions(m, p)).toBe(1);
    const c = changementsDepuis(m, p);
    expect(c[0]).toMatchObject({ ton: "moins_bien", fort: "Credos" });
    expect(c[0].suite).toContain("En retard");
    expect(c.map((x) => x.fort)).toEqual(expect.arrayContaining(["1 nouvelle décision", "Serveur", "1 blocage résolu", "2 lignes dans « Fait »", "2 h 30 de réunion", "Charge lourde"]));
    // La même décision qu'avant n'est pas nouvelle.
    const meme = { ...p, textesDecision: m.textesDecision };
    expect(nouvellesDecisions(m, meme)).toBe(0);
  });
});

describe("ecart", () => {
  it("écrit l'écart avec la semaine dernière", () => {
    expect(ecart(4, 2)).toBe("+2 par rapport à la semaine dernière");
    expect(ecart(1, 3)).toBe("−2 par rapport à la semaine dernière");
    expect(ecart(2, 2)).toBe("comme la semaine dernière");
    expect(ecart(2, null)).toBeNull();
  });
});

describe("ordreDeLecture", () => {
  it("met les décisions puis les blocages en tête, s'ils ont du contenu", () => {
    const ids = ordreDeLecture(F, (c) => c.id !== "decision").map((c) => c.id);
    expect(ids).toEqual(["bloque", "fait", "sante", "decision", "charge", "reunions"]);
    expect(ordreDeLecture(F).map((c) => c.id).slice(0, 2)).toEqual(["decision", "bloque"]);
  });
  it("garde l'ordre d'un modèle à intertitres", () => {
    const g = [{ id: "t", type: "intertitre", libelle: "Mon travail" }, ...F] as Champ[];
    expect(ordreDeLecture(g).map((c) => c.id)).toEqual(g.map((c) => c.id));
  });
});
