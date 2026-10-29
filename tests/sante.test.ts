import { describe, expect, it } from "vitest";
import { calculerSante, signalActif, type DonneesSante } from "@/lib/sante";

const AUJ = "2026-10-28";
const base: DonneesSante = { statut: "en_cours", dateFinPrevue: "2027-03-31", livrables: [], taches: [], reports: [], risque: null };
const t = (o: Partial<DonneesSante["taches"][number]> = {}) => ({ statut: "a_faire", echeance: null, creeLe: "2026-10-20", termineeLe: null, bloqueeDepuis: null, ...o });

describe("santé calculée d'un projet", () => {
  it("dans les temps sans rien d'anormal ; pas de santé pour un projet finalisé", () => {
    expect(calculerSante(base, AUJ)).toEqual({ sante: "dans_les_temps", raisons: [] });
    expect(calculerSante({ ...base, statut: "finalise", dateFinPrevue: "2026-01-01" }, AUJ).sante).toBe("dans_les_temps");
  });
  it("en retard : fin prévue dépassée", () => {
    const r = calculerSante({ ...base, dateFinPrevue: "2026-10-15" }, AUJ);
    expect(r.sante).toBe("en_retard");
    expect(r.raisons[0]).toBe("Fin prévue dépassée (15 oct.)");
  });
  it("livrables : à surveiller dès la date passée, en retard au-delà de 30 jours ; un livrable prêt ou validé ne compte pas", () => {
    expect(calculerSante({ ...base, livrables: [{ prevuLe: "2026-10-20", atteint: false }] }, AUJ)).toEqual({ sante: "a_surveiller", raisons: ["1 livrable en retard"] });
    expect(calculerSante({ ...base, livrables: [{ prevuLe: "2026-09-01", atteint: false }, { prevuLe: "2026-10-01", atteint: false }] }, AUJ)).toEqual({ sante: "en_retard", raisons: ["1 livrable en retard de plus de 30 jours"] });
    expect(calculerSante({ ...base, livrables: [{ prevuLe: "2026-09-01", atteint: true }] }, AUJ).sante).toBe("dans_les_temps");
    // Des tâches prévues après la date d'un livrable à venir : il prendra du retard.
    expect(calculerSante({ ...base, livrables: [{ prevuLe: "2026-11-15", atteint: false, tachesApres: 2 }] }, AUJ)).toEqual({ sante: "a_surveiller", raisons: ["2 tâches prévues après la date de son livrable"] });
    expect(calculerSante({ ...base, livrables: [{ prevuLe: "2026-11-15", atteint: true, tachesApres: 2 }] }, AUJ).sante).toBe("dans_les_temps");
  });
  it("tâches : en retard au-delà d'un quart (3 au moins) ; à surveiller pour une tâche en retard de plus d'une semaine", () => {
    const quatre = [t({ echeance: "2026-10-27" }), t({ echeance: "2026-10-26" }), t({ echeance: "2026-10-25" }), t({ echeance: "2026-11-30" }), t({ echeance: "2026-12-01" }), t({ echeance: "2026-12-02" })];
    expect(calculerSante({ ...base, taches: quatre }, AUJ)).toEqual({ sante: "en_retard", raisons: ["3 tâches en retard sur 6"] });
    expect(calculerSante({ ...base, taches: [t({ echeance: "2026-10-27" })] }, AUJ).sante).toBe("dans_les_temps");
    expect(calculerSante({ ...base, taches: [t({ echeance: "2026-10-10" }), t({ echeance: "2026-12-01" })] }, AUJ)).toEqual({ sante: "a_surveiller", raisons: ["1 tâche en retard de plus d'une semaine"] });
    expect(calculerSante({ ...base, taches: [t({ statut: "bloquee", bloqueeDepuis: "2026-10-10" })] }, AUJ).raisons).toEqual(["1 tâche bloquée depuis plus d'une semaine"]);
    expect(calculerSante({ ...base, taches: [t({ statut: "faite", echeance: "2026-10-01", termineeLe: "2026-10-02" })] }, AUJ).sante).toBe("dans_les_temps");
  });
  it("fin repoussée dans les 30 derniers jours", () => {
    expect(calculerSante({ ...base, reports: [{ le: "2026-10-12", avant: "2026-12-01", apres: "2027-03-31" }] }, AUJ).raisons).toEqual(["Fin repoussée le 12 oct."]);
    expect(calculerSante({ ...base, reports: [{ le: "2026-08-12", avant: "2026-12-01", apres: "2027-03-31" }] }, AUJ).sante).toBe("dans_les_temps");
  });
  it("rythme : le reste ne tient pas avant la fin prévue au rythme des quatre dernières semaines", () => {
    // 2 tâches faites en 4 semaines (0,5 par semaine), 10 ouvertes : 20 semaines de travail pour 5 restantes.
    const taches = [
      ...Array.from({ length: 10 }, () => t({ creeLe: "2026-08-01" })),
      t({ statut: "faite", creeLe: "2026-08-01", termineeLe: "2026-10-10" }),
      t({ statut: "faite", creeLe: "2026-08-01", termineeLe: "2026-10-20" }),
    ];
    expect(calculerSante({ ...base, dateFinPrevue: "2026-12-01", taches }, AUJ).raisons).toEqual(["Au rythme actuel : 20 semaines de travail pour 5 semaines restantes"]);
    expect(calculerSante({ ...base, dateFinPrevue: "2027-12-01", taches }, AUJ).sante).toBe("dans_les_temps");
    // Projet tout neuf : pas encore de rythme.
    expect(calculerSante({ ...base, dateFinPrevue: "2026-11-01", taches: [t({ creeLe: "2026-10-20" })] }, AUJ).sante).toBe("dans_les_temps");
    expect(calculerSante({ ...base, taches: [t({ creeLe: "2026-08-01" })] }, AUJ).raisons).toEqual(["Aucune tâche terminée depuis 4 semaines"]);
  });
  it("le risque signalé aggrave, n'améliore jamais, et tombe au bout de 30 jours", () => {
    const risque = { motif: "Retard du prestataire", le: "2026-10-20", par: "Myriam Valcin" };
    expect(calculerSante({ ...base, risque }, AUJ)).toEqual({ sante: "a_surveiller", raisons: ["Risque signalé par Myriam Valcin : Retard du prestataire"] });
    expect(calculerSante({ ...base, dateFinPrevue: "2026-10-01", risque }, AUJ).sante).toBe("en_retard");
    expect(signalActif({ ...risque, le: "2026-09-20" }, AUJ)).toBe(false);
    expect(calculerSante({ ...base, risque: { ...risque, le: "2026-09-20" } }, AUJ).sante).toBe("dans_les_temps");
  });
});
