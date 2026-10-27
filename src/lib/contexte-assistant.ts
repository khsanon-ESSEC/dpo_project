/** Données données à l'assistant : uniquement ce que la personne voit à l'écran ou a le droit de voir. */
import "server-only";
import { aujourdhui, dateLongue, echeanceRelative } from "@/lib/dates";
import { acces, auteursLignesVisibles, exigerProjetVisible } from "@/lib/acces";
import type { Utilisateur } from "@/lib/auth/session";
import { monEquipe } from "@/lib/donnees/equipe";
import { ficheProjet, portefeuille } from "@/lib/donnees/projets";
import { lignesDuProjetCetteSemaine, lignesDuRapport, obtenirOuCreerRapport, PARTIES } from "@/lib/donnees/rapport";
import { tachesDe } from "@/lib/donnees/semaine";

const STATUT: Record<string, string> = { a_faire: "à faire", en_cours: "en cours", bloquee: "bloquée", faite: "faite" };
const SANTE: Record<string, string> = { dans_les_temps: "dans les temps", a_surveiller: "à surveiller", en_retard: "en retard" };

export async function contexteAssistant(u: Utilisateur, ecran: string, chemin: string): Promise<string> {
  const a = await acces(u);
  const jour = aujourdhui();
  const blocs: string[] = [`Aujourd'hui : ${dateLongue(jour)}. Personne : ${u.prenom} ${u.nom} (${u.poste}).`];

  const mesTaches = async () => {
    const t = await tachesDe([u.id]);
    blocs.push(
      "Mes tâches :\n" +
        t.map((x) => `- ${x.titre} [${x.projetTitre ?? "hors projet"}] : ${STATUT[x.statut]}${x.echeance ? `, échéance ${dateLongue(x.echeance)} (${echeanceRelative(x.echeance, jour).texte})` : ""}`).join("\n"),
    );
  };

  if (ecran === "semaine" || ecran === "rapport") {
    await mesTaches();
    const r = await obtenirOuCreerRapport(u.id);
    const lignes = await lignesDuRapport(r.id);
    blocs.push(
      `Mon rapport du vendredi (${r.statut === "envoye" ? "envoyé" : "brouillon"}) :\n` +
        PARTIES.map((p) => `${p.libelle} : ${lignes.filter((l) => l.partie === p.id).map((l) => l.texte + (l.projetCode ? ` [${l.projetCode}]` : "")).join(" ; ") || "rien"}`).join("\n"),
    );
  }

  if (ecran === "equipe" && a.equipeDirecte.length) {
    const e = await monEquipe(a);
    blocs.push(
      `Mon équipe (${e.personnes.length} personnes, ${e.recus} rapports reçus) :\n` +
        e.personnes.map((p) => `- ${p.nom} : rapport ${p.rapport ? "reçu" : "non reçu"}, ${p.faites}/${p.total} tâches faites, ${p.retard} en retard, ${p.bloquees} bloquée(s)`).join("\n") +
        (e.blocages.length ? "\nBlocages :\n" + e.blocages.map((b) => `- ${b.titre} (${b.qui}, ${b.projet ?? "hors projet"})`).join("\n") : ""),
    );
  }

  const id = chemin.match(/^\/projets\/([0-9a-f-]{36})/)?.[1];
  if (ecran === "projet" && id) {
    await exigerProjetVisible(a, id);
    const f = await ficheProjet(id);
    blocs.push(
      `Projet : ${f.projet.titre}${f.projet.strategique ? " (stratégique)" : ""}, ${SANTE[f.projet.sante]}. Chef de projet : ${f.chef?.nom ?? "aucun"}.\n` +
        `Fin prévue : ${dateLongue(f.projet.dateFinPrevue)} ; au dernier rapport au conseil : ${dateLongue(f.dernier?.dateFinPrevue)}.\n` +
        `Indicateurs vérifiables :\n${f.indicateurs.map((i) => `- ${i.ordre}. ${i.libelle} : ${i.etat === "atteint" ? "atteint" : i.etat === "en_cours" ? "en cours" : "à venir"}`).join("\n")}\n` +
        `Tâches : ${f.compte.faite} faites, ${f.compte.en_cours} en cours, ${f.compte.a_faire} à faire, ${f.compte.bloquee} bloquées.\n` +
        `Tâches à surveiller :\n${f.urgentes.map((t) => `- ${t.titre} (${STATUT[t.statut]}${t.echeance ? `, ${echeanceRelative(t.echeance, jour).texte}` : ""})`).join("\n")}`,
    );
    const auteurs = auteursLignesVisibles(a, id);
    if (auteurs) {
      const r = await lignesDuProjetCetteSemaine(id, auteurs);
      blocs.push("Rapports du vendredi sur ce projet :\n" + (r.map((g) => `- ${g.auteur} : ${g.lignes.map((l) => `${l.partie} — ${l.texte}`).join(" ; ")}`).join("\n") || "aucun"));
    }
  }

  if (ecran === "portefeuille" || ecran === "conseil") {
    const p = await portefeuille(a);
    blocs.push(
      "Projets visibles :\n" +
        p
          .map(
            (x) =>
              `- ${x.titre}${x.strategique ? " (stratégique)" : ""} : ${SANTE[x.sante]}, ${x.atteints}/${x.totalIndicateurs} indicateurs, fin prévue ${dateLongue(x.dateFinPrevue)}` +
              (x.ancienneFin && x.ancienneFin !== x.dateFinPrevue ? ` (au dernier rapport : ${dateLongue(x.ancienneFin)})` : ""),
          )
          .join("\n"),
    );
  }

  if (blocs.length === 1) await mesTaches();
  return blocs.join("\n\n").slice(0, 12_000);
}
