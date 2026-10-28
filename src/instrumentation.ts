/**
 * Au démarrage du serveur : la tournée des rappels du vendredi par courriel, toutes les cinq minutes, si le
 * courriel est configuré (SMTP_HOTE, SMTP_EXPEDITEUR, APP_URL). Rien à installer chez l'informatique : pas de
 * tâche planifiée séparée. Plusieurs copies de l'application peuvent tourner : chaque envoi est réservé en base.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { courrielActif } = await import("@/lib/courriel");
  if (!courrielActif()) return;
  const { tourneeRappels } = await import("@/lib/donnees/courriels");
  let enCours = false;
  const tournee = async () => {
    if (enCours) return;
    enCours = true;
    try {
      await tourneeRappels();
    } catch (e) {
      console.error("courriel : tournée des rappels :", (e as Error).message);
    } finally {
      enCours = false;
    }
  };
  const minutes = Math.min(60, Math.max(1, Number(process.env.RAPPELS_INTERVALLE_MINUTES) || 5));
  setTimeout(tournee, 30_000).unref();
  setInterval(tournee, minutes * 60_000).unref();
  console.log(`courriel : rappels du vendredi actifs (toutes les ${minutes} min)`);
}
