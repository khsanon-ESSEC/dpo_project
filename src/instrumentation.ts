/**
 * Au démarrage du serveur : la charge prévue de la semaine, notée chaque heure si elle manque, les occurrences des
 * tâches récurrentes et la santé des projets ; et la tournée des
 * rappels du vendredi par courriel, toutes les cinq minutes, si le
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
  const noter = async () => {
    await noterChargesPrevues().catch((e) => console.error("charge prévue :", (e as Error).message));
    // Tâches récurrentes : la prochaine occurrence, quelques jours avant son échéance.
    await genererOccurrences().catch((e) => console.error("tâches récurrentes :", (e as Error).message));
    await recalculerSante().catch((e) => console.error("santé des projets :", (e as Error).message));
  };
  setTimeout(noter, 60_000).unref();
  setInterval(noter, 60 * 60_000).unref();

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
