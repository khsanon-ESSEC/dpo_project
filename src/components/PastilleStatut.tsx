/**
 * Repère visuel de l'état d'une tâche (demandé le 29 octobre 2026) : cercle vide à faire, demi-cercle en cours,
 * barre ambre bloquée, coche faite ; un anneau rouge pour une tâche ouverte en retard. Le nom de l'état est
 * toujours donné aux lecteurs d'écran (la forme et la couleur ne portent jamais seules l'information).
 * Le même repère partout où l'on parle de tâches ; `petite` pour les puces du calendrier.
 */
export const LIBELLE_STATUT_TACHE: Record<string, string> = { a_faire: "À faire", en_cours: "En cours", bloquee: "Bloquée", faite: "Faite" };

/** « En cours, en retard » : l'état dit en mots, pour les lecteurs d'écran et les infobulles. */
export function etatEnMots(statut: string, retard = false): string {
  const etat = statut in LIBELLE_STATUT_TACHE ? statut : "a_faire";
  return `${LIBELLE_STATUT_TACHE[etat]}${retard && etat !== "faite" && etat !== "bloquee" ? ", en retard" : ""}`;
}

export function PastilleStatut({ statut, retard = false, petite = false }: { statut: string; retard?: boolean; petite?: boolean }) {
  const etat = statut in LIBELLE_STATUT_TACHE ? statut : "a_faire";
  const enRetard = retard && etat !== "faite" && etat !== "bloquee";
  const mots = etatEnMots(etat, enRetard);
  return (
    <span className={`pastille-statut pastille-statut--${etat}${enRetard ? " pastille-statut--retard" : ""}${petite ? " pastille-statut--petite" : ""}`} role="img" aria-label={mots} title={mots}>
      {etat === "faite" ? (
        <svg viewBox="0 0 16 16" width={petite ? 8 : 10} height={petite ? 8 : 10} aria-hidden="true">
          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
  );
}
