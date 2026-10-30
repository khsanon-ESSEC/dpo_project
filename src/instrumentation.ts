/**
 * Au démarrage du serveur : la charge prévue de la semaine, notée chaque heure si elle manque, les occurrences des
 * tâches récurrentes et la santé des projets ; et la tournée des
 * rappels du vendredi (et du courriel du lundi) par courriel, toutes les cinq minutes, si le
 * courriel est configuré (SMTP_HOTE, SMTP_EXPEDITEUR, APP_URL). Rien à installer chez l'informatique : pas de
 * tâche planifiée séparée. Plusieurs copies de l'application peuvent tourner : chaque envoi est réservé en base.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Toutes les heures : la charge prévue de la semaine (notée une fois par semaine, le lundi ou au premier passage),
  // et la santé calculée des projets (une fin prévue se dépasse aussi sans que personne ne touche au projet).
  const { noterChargesPrevues } = await import("@/lib/donnees/charge");
  const { recalculerSante } = await import("@/lib/donnees/sante");
  const { genererOccurrences } = await import("@/lib/donnees/recurrence");
  const { rappelsConseil } = await import("@/lib/donnees/avancement-conseil");
  const noter = async () => {
    // Rapport mensuel au conseil : rappels aux chefs de projet, puis « prêt à valider » aux exécutifs (29 octobre 2026).
    await rappelsConseil().catch((e) => console.error("rappels du rapport au conseil :", (e as Error).message));
    await noterChargesPrevues().catch((e) => console.error("charge prévue :", (e as Error).message));
    // Tâches récurrentes : la prochaine occurrence, quelques jours avant son échéance.
    await genererOccurrences().catch((e) => console.error("tâches récurrentes :", (e as Error).message));
    await recalculerSante().catch((e) => console.error("santé des projets :", (e as Error).message));
  };
  setTimeout(noter, 60_000).unref();
  setInterval(noter, 60 * 60_000).unref();

  const { courrielActif } = await import("@/lib/courriel");
  if (!courrielActif()) return;
  const { tourneeLundi, tourneeRappels } = await import("@/lib/donnees/courriels");
  let enCours = false;
  const tournee = async () => {
    if (enCours) return;
    enCours = true;
    try {
      await tourneeRappels();
    } catch (e) {
      console.error("courriel : tournée des rappels :", (e as Error).message);
    }
    try {
      // Le lundi matin, pour qui l'a demandé dans son profil (29 octobre 2026).
      await tourneeLundi();
    } catch (e) {
      console.error("courriel : courriel du lundi :", (e as Error).message);
    } finally {
      enCours = false;
    }
  };
  const minutes = Math.min(60, Math.max(1, Number(process.env.RAPPELS_INTERVALLE_MINUTES) || 5));
  setTimeout(tournee, 30_000).unref();
  setInterval(tournee, minutes * 60_000).unref();
  console.log(`courriel : rappels du vendredi et courriel du lundi actifs (toutes les ${minutes} min)`);
}
