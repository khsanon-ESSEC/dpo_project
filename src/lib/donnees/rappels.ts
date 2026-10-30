/**
 * Alertes liées aux heures du rapport, créées au passage (à l'ouverture d'une page) plutôt que par
 * une tâche planifiée : rien à installer chez l'informatique, et chacune n'est créée qu'une fois
 * par semaine grâce à sa clé (notifications.cle).
 * - « prêt à relire » : le brouillon est complété avec les tâches de la semaine ;
 * - « rappel » : le rapport n'est pas encore parti ;
 * - après l'heure limite, le chef d'équipe apprend quels rapports manquent.
 */
import "server-only";
import { and, eq, inArray, like } from "drizzle-orm";
import { db, schema } from "@/db";
import { joursOuvresAbsents } from "@/lib/absences";
import { ajouterJours, maintenantLocal } from "@/lib/dates";
import { absencesDe, plages } from "@/lib/donnees/absences";
import { formulairePour, horairesDuRapport } from "@/lib/donnees/modeles";
import { chargerOrganisation } from "@/lib/organisation";
import { etapeRapport, HORAIRES_PAR_DEFAUT, texteMoment, type EtapeRapport } from "@/lib/modeles";
import { nomComplet, subordonnesDirects } from "@/lib/regles";
import { semaineCourante } from "@/lib/donnees/rapport";

const RANG: Record<EtapeRapport, number> = { en_preparation: 0, pret: 1, rappel: 2, en_retard: 3 };

/** `redige` : la personne rédige un rapport (les exécutifs non : ils n'ont que le retard de leur équipe). */
export async function rappelsDuMoment(personneId: string, redige = true) {
  const semaine = semaineCourante();
  const [rapport] = await db
    .select({ id: schema.rapportsHebdo.id, statut: schema.rapportsHebdo.statut, versionModeleId: schema.rapportsHebdo.versionModeleId })
    .from(schema.rapportsHebdo)
    .where(and(eq(schema.rapportsHebdo.auteurId, personneId), eq(schema.rapportsHebdo.semaine, semaine)))
    .limit(1);
  const horaires = rapport ? await horairesDuRapport(rapport) : ((await formulairePour(personneId)).modele?.horaires ?? HORAIRES_PAR_DEFAUT);
  const etape = etapeRapport(horaires, semaine, maintenantLocal());
  if (etape === "en_preparation") return;
  const deja = new Set(
    (await db.select({ cle: schema.notifications.cle }).from(schema.notifications).where(and(eq(schema.notifications.personneId, personneId), like(schema.notifications.cle, `%:${semaine}`)))).map((x) => x.cle),
  );
  const nouvelles: (typeof schema.notifications.$inferInsert)[] = [];
  const envoye = !redige || rapport?.statut === "envoye";
  if (!envoye && !deja.has(`rapport_pret:${semaine}`) && RANG[etape] < RANG.rappel) {
    nouvelles.push({ personneId, type: "rapport_pret", cle: `rapport_pret:${semaine}`, lien: "/rapport", texte: `Votre rapport de la semaine est prêt à relire${horaires.limite ? ` ; à envoyer avant ${texteMoment(horaires.limite, semaine)}` : ""}.` });
  }
  if (!envoye && RANG[etape] >= RANG.rappel && !deja.has(`rapport_rappel:${semaine}`)) {
    nouvelles.push({
      personneId,
      type: "rapport_rappel",
      cle: `rapport_rappel:${semaine}`,
      lien: "/rapport",
      texte: etape === "en_retard" ? "Votre rapport de la semaine n'est pas encore parti." : `Rappel : votre rapport est à envoyer avant ${texteMoment(horaires.limite!, semaine)}.`,
    });
  }
  // Après l'heure limite : le chef d'équipe apprend quels rapports manquent.
  if (etape === "en_retard" && !deja.has(`equipe_retard:${semaine}`)) {
    const org = await chargerOrganisation();
    const equipe = subordonnesDirects(org, personneId);
    if (equipe.length) {
      const recus = new Set(
        (
          await db
            .select({ auteurId: schema.rapportsHebdo.auteurId })
            .from(schema.rapportsHebdo)
            .where(and(inArray(schema.rapportsHebdo.auteurId, equipe.map((p) => p.id)), eq(schema.rapportsHebdo.semaine, semaine), eq(schema.rapportsHebdo.statut, "envoye")))
        ).map((x) => x.auteurId),
      );
      // Absent(e) toute la semaine : aucun rapport n'est attendu.
      const absences = await absencesDe(
        equipe.map((p) => p.id),
        semaine,
        ajouterJours(semaine, 4),
      );
      const manquent = equipe.filter((p) => !recus.has(p.id) && joursOuvresAbsents(plages(absences.get(p.id)), semaine, ajouterJours(semaine, 4)) < 5);
      if (manquent.length) {
        nouvelles.push({
          personneId,
          type: "equipe_retard",
          cle: `equipe_retard:${semaine}`,
          lien: "/equipe",
          texte: `${manquent.length} rapport${manquent.length > 1 ? "s" : ""} de votre équipe ${manquent.length > 1 ? "ne sont" : "n'est"} pas arrivé${manquent.length > 1 ? "s" : ""} : ${manquent.map(nomComplet).join(", ")}.`,
        });
      }
    }
  }
  if (nouvelles.length) await db.insert(schema.notifications).values(nouvelles).onConflictDoNothing();
}
