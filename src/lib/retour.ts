/** Page où aller après la connexion (lien d'un courriel) : quelques pages de l'application, jamais une adresse externe. */
export function suiteValide(v: unknown): string | null {
  const s = String(v ?? "");
  return /^\/(rapport|reunions|taches\/[0-9a-f-]{36})$/.test(s) ? s : retourValide(s);
}

/**
 * Page où revenir après une action : seulement certaines pages de l'application (jamais une adresse externe),
 * avec au plus une ancre sur la page (« #livrable-… ») ; pour Mes tâches, la vue choisie (et le mois du calendrier).
 */
export function retourValide(v: unknown): string | null {
  const s = String(v ?? "");
  return /^\/(semaine|taches(\?vue=(liste|tableau|calendrier)(&mois=\d{4}-\d{2}-01)?)?|a-faire|charge|projets\/[0-9a-f-]{36}(\/(liste|tableau|gantt|calendrier|charge|livrables\/[0-9a-f-]{36}))?|equipe(\/[0-9a-f-]{36})?)(#[a-z0-9-]{1,80})?$/.test(s) ? s : null;
}
