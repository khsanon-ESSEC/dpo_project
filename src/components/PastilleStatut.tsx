/**
 * Repère visuel de l'état d'une tâche (demandé le 29 octobre 2026) : cercle vide à faire, demi-cercle en cours,
 * barre ambre bloquée, coche faite ; un anneau rouge pour une tâche ouverte en retard. Le nom de l'état est
 * toujours donné aux lecteurs d'écran (la forme et la couleur ne portent jamais seules l'information).
 */
const LIBELLE: Record<string, string> = { a_faire: "À faire", en_cours: "En cours", bloquee: "Bloquée", faite: "Faite" };

export function PastilleStatut({ statut, retard = false }: { statut: string; retard?: boolean }) {
  const etat = statut in LIBELLE ? statut : "a_faire";
  const enRetard = retard && etat !== "faite";
  return (
    <span className={`pastille-statut pastille-statut--${etat}${enRetard ? " pastille-statut--retard" : ""}`} role="img" aria-label={`${LIBELLE[etat]}${enRetard ? ", en retard" : ""}`} title={`${LIBELLE[etat]}${enRetard ? ", en retard" : ""}`}>
      {etat === "faite" ? (
        <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
  );
}
