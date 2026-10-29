/**
 * Noms des périodes du bilan (« octobre 2026 », « août à octobre 2026 », « Exercice 2025-2026 »,
 * « 8 semaines jusqu'au 30 oct. »), partagés par le bilan de l'équipe et la fiche d'une personne.
 */
import { dateCourte, moisAnnee } from "./dates";
import { nomExercice, type Periode, type PlanBilan } from "./bilan";

const moisSeul = new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "UTC" });
const versDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
export const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** « à septembre », « aux 8 semaines d'avant », « à l'exercice 2024-2025 » : la préposition accordée. */
export function aLa(t: string): string {
  if (t.startsWith("les ")) return `aux ${t.slice(4)}`;
  if (t.startsWith("le ")) return `au ${t.slice(3)}`;
  return `à ${t}`;
}

/** « octobre 2026 », « août à octobre 2026 », « novembre 2025 à avril 2026 ». */
export function plage(p: Periode): string {
  if (p.debut.slice(0, 7) === p.fin.slice(0, 7)) return moisAnnee(p.debut);
  const memeAnnee = p.debut.slice(0, 4) === p.fin.slice(0, 4);
  return `${memeAnnee ? moisSeul.format(versDate(p.debut)) : moisAnnee(p.debut)} à ${moisAnnee(p.fin)}`;
}

/** Les noms des deux périodes, pour la légende, le bandeau et la navigation. */
export function nomsDesPeriodes(plan: PlanBilan, debutExercice: number): { actuel: string; avant: string; avantCourt: string } {
  if (plan.vue === "semaine") {
    return {
      actuel: plan.enCours ? "Cette semaine" : `Semaine du ${dateCourte(plan.cle)}`,
      avant: `Semaine du ${dateCourte(plan.avant)}`,
      avantCourt: plan.enCours ? "la semaine dernière" : `la semaine du ${dateCourte(plan.avant)}`,
    };
  }
  if (plan.vue === "exercice") {
    const a = Number(plan.cle);
    return { actuel: `Exercice ${nomExercice(a, debutExercice)}`, avant: `Exercice ${nomExercice(a - 1, debutExercice)}`, avantCourt: `l'exercice ${nomExercice(a - 1, debutExercice)}` };
  }
  if (plan.vue === "mois") return { actuel: majuscule(plage(plan.actuel)), avant: majuscule(plage(plan.precedent)), avantCourt: moisSeul.format(versDate(plan.precedent.debut)) };
  const n = plan.vue === "3m" ? 3 : 6;
  return { actuel: majuscule(plage({ ...plan.actuel, fin: `${plan.cle}-01` })), avant: `Les ${n} mois d'avant`, avantCourt: plage({ ...plan.precedent, fin: `${plan.precedent.cle}-01` }) };
}

const moisCourt = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });

/** Les libellés de chaque point de l'axe (« semaine du 7 sept. » / « 7 sept. », « septembre 2026 » / « sept. »). */
export function etiquettesAxe(plan: PlanBilan): { libelle: string; court: string; libelleAvant?: string }[] {
  const semaine = plan.vue === "semaine";
  return plan.axe.map((cle, k) => {
    const av = plan.serieAvant?.[k];
    return {
      libelle: semaine ? `semaine du ${dateCourte(cle)}` : moisAnnee(`${cle}-01`),
      court: semaine ? dateCourte(cle) : moisCourt.format(versDate(`${cle}-01`)),
      libelleAvant: av ? moisAnnee(av.debut) : undefined,
    };
  });
}

/** Libellé d'une ligne de tableau : « Sem. du 7 sept. » ou « Septembre 2026 ». */
export function libelleLigne(plan: PlanBilan, cle: string): string {
  return plan.vue === "semaine" ? `Sem. du ${dateCourte(cle)}` : majuscule(moisAnnee(`${cle}-01`));
}
