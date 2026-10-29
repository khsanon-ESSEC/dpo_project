import { LIBELLE_PRIORITE, priorite as lirePriorite } from "@/lib/suivi";

/**
 * Après le titre d'une tâche : sa priorité quand elle n'est pas normale (« Haute » en ambre, « Basse » en discret),
 * et « répétée » pour l'occurrence d'une tâche récurrente. Rien pour une tâche faite.
 */
export function EtiquettePriorite({ priorite, faite = false, recurrente = false, debut = false }: { priorite: string | null | undefined; faite?: boolean; recurrente?: boolean; /** En tête d'une ligne (marge à droite plutôt qu'à gauche). */ debut?: boolean }) {
  const p = lirePriorite(priorite);
  if (faite || (p === "normale" && !recurrente)) return null;
  const m = debut ? " etiquette-priorite--debut" : "";
  return (
    <>
      {p !== "normale" ? <span className={`etiquette-priorite etiquette-priorite--${p}${m}`}>{LIBELLE_PRIORITE[p]}</span> : null}
      {recurrente ? (
        <span className={`etiquette-repetee${m}`} title="Tâche récurrente">
          répétée
        </span>
      ) : null}
    </>
  );
}
