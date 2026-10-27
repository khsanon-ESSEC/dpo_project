/**
 * Propositions préparées sans IA (règles simples), que l'assistant peut ensuite reformuler :
 * - la synthèse d'un projet dans un rapport de chef, à partir des éléments reçus de l'équipe ;
 * - les décisions ou l'aide à demander, à partir des blocages et des échéances dépassées.
 * Pur : aucune base de données, testé dans tests/suggestions.test.ts.
 */
import { dateCourte, ecartJours } from "./dates";

export type ElementSynthese = { rubrique: string | null; texte: string };

const TITRES: [string, string][] = [
  ["fait", "Fait"],
  ["en_cours", "En cours"],
  ["a_decider", "À décider ou débloquer"],
  ["prochaine", "Ensuite"],
];

const sansPoint = (t: string) => t.trim().replace(/[.;\s]+$/, "");
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Rubrique d'un élément pour la synthèse (bloqué et décision vont ensemble). */
export function rubriqueSynthese(r: string | null): string | null {
  if (r === "bloque" || r === "decision") return "a_decider";
  if (r === "fait" || r === "en_cours" || r === "prochaine") return r;
  return null;
}

/**
 * Synthèse d'un projet : les synthèses déjà faites par les chefs d'équipe si elles existent,
 * sinon « Fait : … En cours : … À décider ou débloquer : … Ensuite : … » (trois éléments au plus par rubrique).
 */
export function syntheseParRegles(elements: ElementSynthese[], recues: { qui: string; texte: string }[] = []): string {
  const deChefs = recues.filter((r) => r.texte.trim());
  if (deChefs.length) return deChefs.map((r) => `${r.qui} : ${r.texte.trim()}`).join("\n").slice(0, 1500);
  const parRubrique = new Map<string, string[]>();
  for (const e of elements) {
    const r = rubriqueSynthese(e.rubrique);
    if (!r || !e.texte.trim()) continue;
    const l = parRubrique.get(r) ?? [];
    if (!l.some((x) => norm(x) === norm(e.texte))) l.push(sansPoint(e.texte));
    parRubrique.set(r, l);
  }
  const phrases: string[] = [];
  for (const [r, titre] of TITRES) {
    const l = parRubrique.get(r);
    if (!l?.length) continue;
    const vus = l.slice(0, 3).join(" ; ");
    phrases.push(`${titre} : ${vus}${l.length > 3 ? ` (et ${l.length - 3} autre${l.length > 4 ? "s" : ""})` : ""}.`);
  }
  return phrases.join(" ").slice(0, 1500);
}

export type TacheSuggestion = { titre: string; statut: string; blocage: string | null; echeance: string | null; projetCode?: string | null };

/**
 * Ce qu'on peut demander à son supérieur : débloquer les tâches bloquées, arbitrer les échéances
 * dépassées. Les lignes « Bloqué » du rapport qui ne viennent pas d'une tâche s'ajoutent. Sans doublon.
 */
export function suggestionsDecision(taches: TacheSuggestion[], lignesBloquees: string[], jour: string, deja: string[] = []): string[] {
  const sortie: string[] = [];
  const vus = new Set(deja.map(norm));
  const ajouter = (t: string) => {
    const k = norm(t);
    if (!k || vus.has(k)) return;
    vus.add(k);
    sortie.push(t);
  };
  const prefixe = (t: TacheSuggestion) => (t.projetCode ? `${t.projetCode} · ` : "");
  for (const t of taches.filter((x) => x.statut === "bloquee")) {
    ajouter(`${prefixe(t)}Débloquer « ${sansPoint(t.titre)} »${t.blocage ? ` : ${sansPoint(t.blocage)}` : ""}.`);
  }
  const titresBloques = new Set(taches.filter((x) => x.statut === "bloquee").map((x) => norm(x.titre)));
  for (const l of lignesBloquees) {
    // Une ligne « Bloqué » préparée à partir d'une tâche commence par son titre : déjà proposée ci-dessus.
    if ([...titresBloques].some((t) => norm(l).startsWith(t))) continue;
    ajouter(`Débloquer : ${sansPoint(l)}.`);
  }
  const depassees = taches
    .filter((x) => x.statut !== "faite" && x.statut !== "bloquee" && x.echeance && x.echeance < jour)
    .sort((a, b) => (a.echeance! < b.echeance! ? -1 : 1));
  for (const t of depassees.slice(0, 3)) {
    const retard = ecartJours(t.echeance!, jour);
    ajouter(`${prefixe(t)}Arbitrer l'échéance de « ${sansPoint(t.titre)} » : prévue le ${dateCourte(t.echeance)}, ${retard} jour${retard > 1 ? "s" : ""} de retard.`);
  }
  return sortie.slice(0, 6);
}
