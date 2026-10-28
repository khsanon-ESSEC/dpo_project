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
  if (plan.vue === "semaines") {
    const n = plan.serie.length;
    return {
      actuel: plan.enCours ? `Ces ${n} semaines` : `${n} semaines jusqu'au ${dateCourte(plan.serie[n - 1].fin)}`,
      avant: `Les ${n} semaines d'avant`,
      avantCourt: `les ${n} semaines d'avant`,
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
