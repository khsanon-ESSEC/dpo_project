/**
 * Le guide de l'application (29 octobre 2026) : des fiches courtes, écrites à partir des écrans, auxquelles mène une
 * question posée dans la barre (« comment envoyer mon rapport ? », « où changer le thème ? »). Pas d'IA : un repérage
 * par mots, prévisible, qui ne sort rien de la banque et n'invente aucune procédure. Les fiches tiennent compte de
 * l'écran ouvert et des droits de la personne (mêmes droits que les actions de la barre, src/lib/commandes.ts).
 * Calculs purs : la page, la barre et les tests s'en servent tels quels.
 */
import { cleNom } from "./projets";
import type { Permission } from "./commandes";

/** L'écran d'où l'on pose la question (src/components/Navigation.tsx, ecranDepuisChemin, plus quelques autres). */
export type EcranGuide = "semaine" | "taches" | "rapport" | "equipe" | "projet" | "portefeuille" | "conseil" | "organisation" | "reunions" | "profil";

export type Theme = "Tâches" | "Rapport du vendredi" | "Réunions" | "Projets" | "Équipe" | "Rapport au conseil" | "La barre" | "Compte et téléphone";
export const THEMES: Theme[] = ["Tâches", "Rapport du vendredi", "Réunions", "Projets", "Équipe", "Rapport au conseil", "La barre", "Compte et téléphone"];

export type Fiche = {
  id: string;
  theme: Theme;
  /** Ce que la fiche apprend à faire, à l'infinitif. */
  titre: string;
  /** La question telle qu'on la pose. */
  question: string;
  /** Une ligne : la réponse en bref (montrée dans la barre). */
  resume: string;
  etapes: string[];
  astuce?: string;
  ecrans: EcranGuide[];
  permis: Permission;
  /** Mots et synonymes par lesquels on la cherche. */
  mots: string;
  /** « Le faire maintenant » : un écran, ou une phrase commencée dans la barre. */
  faire?: { libelle: string; lien?: string; barre?: string };
  voirAussi?: string[];
};

/**
 * Typographie française : une espace insécable dans les guillemets et avant « : », « ; », « ? », « ! », « → »,
 * pour qu'un retour à la ligne ne laisse jamais un « seul en bout de ligne.
 */
export function insecables(t: string): string {
  return t.replace(/« /g, "«\u00a0").replace(/ »/g, "\u00a0»").replace(/ ([:;?!→])/g, "\u00a0$1");
}

const BRUTES: Fiche[] = [
  // ---------------------------------------------------------------- Tâches
  {
    id: "ajouter-une-tache",
    theme: "Tâches",
    titre: "Ajouter une tâche en une ligne",
    question: "Comment ajouter une tâche ?",
    resume: "Écrivez-la dans la barre du haut : projet, personne, jour et durée dans la même phrase.",
    etapes: [
      "Cliquez dans la barre en haut de la page, ou appuyez sur « / » depuis n'importe quel écran.",
      "Écrivez la tâche, par exemple « Relire les maquettes /UR @Fabienne vendredi 2h » : « / » choisit le projet, « @ » la personne, puis le jour et la durée.",
      "Vérifiez les étiquettes qui s'affichent sous la barre (projet, personne, échéance, durée), puis appuyez sur Entrée.",
      "Vous vous êtes trompé ? « Annuler » reste proposé vingt secondes.",
    ],
    astuce: "Sans « / » ni « @ », la tâche est pour vous et hors projet. Le formulaire complet reste dans Mes tâches → « Nouvelle tâche ».",
    ecrans: ["taches", "semaine"],
    permis: "tous",
    mots: "ajouter creer nouvelle tache taches todo noter une ligne echeance duree estimation saisir",
    faire: { libelle: "Écrire une tâche dans la barre", barre: "" },
    voirAussi: ["confier-une-tache", "ce-que-sait-faire-la-barre"],
  },
  {
    id: "cocher-une-tache-faite",
    theme: "Tâches",
    titre: "Marquer une tâche comme faite",
    question: "Comment cocher une tâche faite ?",
    resume: "Le rond devant la tâche, dans Mes tâches ; ou « # », la tâche, puis « faite » dans la barre.",
    etapes: [
      "Dans Mes tâches, cliquez sur le rond devant la tâche : il se coche, et la tâche passe dans « Faites ».",
      "Ou dans la barre : tapez « # », choisissez la tâche, écrivez « faite », puis Entrée.",
      "Dans la vue « Tableau » de Mes tâches, glissez la carte dans la colonne « Faite », ou changez son état dans sa liste.",
    ],
    astuce: "Les tâches faites restent visibles jusqu'à la fin de la semaine ; elles préparent le « Fait » de votre rapport du vendredi.",
    ecrans: ["taches", "semaine", "projet"],
    permis: "tous",
    mots: "faite fait terminee terminer finie finir cocher coche case rond termine achevee",
    faire: { libelle: "Ouvrir Mes tâches", lien: "/taches" },
    voirAussi: ["signaler-une-tache-bloquee", "noter-le-temps-passe"],
  },
  {
    id: "mettre-a-jour-une-tache",
    theme: "Tâches",
    titre: "Mettre une tâche à jour : état, date, priorité",
    question: "Comment changer la date ou l'état d'une tâche ?",
    resume: "« # » dans la barre, la tâche, puis ce qui change ; ou la fiche de la tâche.",
    etapes: [
      "Dans la barre : tapez « # », choisissez la tâche, puis écrivez ce qui change : « en cours », « 15/11 » (nouvelle échéance), « priorité haute », « relancer », « @ » pour la confier à quelqu'un d'autre. Entrée.",
      "Ou ouvrez la tâche : « État », « Début », « Échéance », « Temps estimé » et « Où en êtes-vous ? », puis « Enregistrer ».",
      "Le titre, les précisions, le projet, le livrable et la priorité se changent plus bas, dans « La tâche ».",
    ],
    astuce: "La barre vide propose d'elle-même vos tâches en retard et celles du jour, à mettre à jour.",
    ecrans: ["taches", "semaine", "projet"],
    permis: "tous",
    mots: "mettre a jour modifier changer date echeance priorite etat statut reporter decaler deplacer relancer editer",
    faire: { libelle: "Mettre une tâche à jour dans la barre", barre: "#" },
    voirAussi: ["signaler-une-tache-bloquee", "annuler-une-tache"],
  },
  {
    id: "annuler-une-tache",
    theme: "Tâches",
    titre: "Supprimer ou annuler une tâche",
    question: "Comment supprimer une tâche ?",
    resume: "En bas de la fiche de la tâche : « Supprimer » si elle n'a pas d'histoire, sinon « Annuler la tâche ».",
    etapes: [
      "Ouvrez la tâche et descendez en bas de sa fiche.",
      "Une tâche sans histoire (ni mise à jour, ni rapport) peut être supprimée définitivement : « Supprimer ».",
      "Une tâche qui a une histoire s'annule : dites pourquoi, puis « Annuler la tâche » ; elle quitte les listes et la charge, et reste lisible.",
      "Dans la barre : « # », la tâche, puis « annuler : » et la raison.",
    ],
    ecrans: ["taches"],
    permis: "tous",
    mots: "supprimer supprime effacer enlever retirer annuler annulee abandonner erreur doublon",
  },
  {
    id: "signaler-une-tache-bloquee",
    theme: "Tâches",
    titre: "Signaler une tâche bloquée",
    question: "Comment signaler qu'une tâche est bloquée ?",
    resume: "État « Bloquée » sur la tâche, avec ce qui vous arrête ; il remonte dans votre rapport.",
    etapes: [
      "Ouvrez la tâche (depuis Mes tâches), choisissez l'état « Bloquée », écrivez dans « Où en êtes-vous ? » ce qui vous arrête et qui peut vous débloquer, puis « Enregistrer ».",
      "Ou dans la barre : « # », choisissez la tâche, puis « bloquée » suivi de la raison (« bloquée accès de test demandés à la DTI »).",
      "La tâche et sa raison apparaissent dans la partie « Bloqué » de votre rapport du vendredi.",
      "Tant que le blocage n'est pas marqué « Résolu » dans le rapport, il revient de lui-même la semaine suivante.",
    ],
    ecrans: ["taches", "rapport", "semaine"],
    permis: "tous",
    mots: "bloquee bloque bloquer blocage attente coince empeche probleme signaler arrete obstacle",
    faire: { libelle: "Mettre une tâche à jour dans la barre", barre: "#" },
    voirAussi: ["ajouter-une-note-au-rapport"],
  },
  {
    id: "voir-mes-taches-autrement",
    theme: "Tâches",
    titre: "Voir mes tâches en liste, en tableau ou en calendrier",
    question: "Comment voir mes tâches autrement ?",
    resume: "Mes tâches : « Liste », « Tableau » (une colonne par état) ou « Calendrier » (le mois).",
    etapes: [
      "Ouvrez Mes tâches.",
      "Choisissez la vue en haut : « Liste », « Tableau » (une colonne par état) ou « Calendrier » (le mois, avec les échéances).",
      "Dans la liste, les filtres « En retard », « Bloquées », « En cours », « À faire » et « Faites » ne gardent que les tâches de cet état.",
      "« Ma charge · 6 semaines » montre, semaine par semaine, les heures prévues face aux heures disponibles.",
    ],
    ecrans: ["taches", "semaine"],
    permis: "tous",
    mots: "vue vues liste tableau kanban colonnes calendrier mois filtre filtrer trier en cours retard planning voir mes taches",
    faire: { libelle: "Ouvrir Mes tâches", lien: "/taches" },
    voirAussi: ["voir-la-charge-de-l-equipe"],
  },
  {
    id: "confier-une-tache",
    theme: "Tâches",
    titre: "Confier une tâche à quelqu'un",
    question: "Comment confier une tâche à un collègue ?",
    resume: "« @ » et la personne dans la barre, ou « pour Fabienne ».",
    etapes: [
      "En écrivant la tâche dans la barre, ajoutez « @ » et choisissez la personne, ou écrivez « pour Fabienne ».",
      "Pour une tâche existante : « # », choisissez-la, puis « @ » et la personne.",
      "Vous pouvez confier une tâche à vous-même, aux personnes que vous suivez et, sur un projet que vous dirigez (ou pour un livrable dont vous êtes responsable), aux membres de son équipe.",
      "Une tâche confiée hors division (autre département, consultant) reste à suivre par vous : elle apparaît dans « Confiées hors division », dans Mes tâches.",
    ],
    ecrans: ["taches", "projet"],
    permis: "tous",
    mots: "confier assigner attribuer deleguer donner collegue personne quelqu un autre arobase equipe hors division consultant",
    faire: { libelle: "Écrire une tâche dans la barre", barre: "" },
    voirAussi: ["ajouter-une-tache"],
  },
  {
    id: "noter-le-temps-passe",
    theme: "Tâches",
    titre: "Noter le temps passé sur une tâche",
    question: "Comment noter le temps passé ?",
    resume: "Sur la tâche, « Temps passé » ; ou « # », la tâche, puis « passé 1h30 » dans la barre.",
    etapes: [
      "Ouvrez la tâche ; dans « Temps passé », indiquez la durée (« 1h30 », « 45 min », « 2 » pour deux heures) et le jour, puis « Noter ».",
      "Ou dans la barre : « # », la tâche, puis « passé 1h30 ».",
      "Le temps se note jusqu'à 60 jours en arrière.",
    ],
    astuce: "Même approximatif, le temps noté aide à mieux estimer les tâches suivantes.",
    ecrans: ["taches", "projet"],
    permis: "tous",
    mots: "temps passe heures duree noter saisir pointer feuille de temps combien",
    voirAussi: ["cocher-une-tache-faite"],
  },
  {
    id: "repeter-une-tache",
    theme: "Tâches",
    titre: "Faire revenir une tâche chaque semaine ou chaque mois",
    question: "Comment créer une tâche qui revient ?",
    resume: "Sur la tâche, « Répétition » ; ou « répéter chaque lundi » dans la barre.",
    etapes: [
      "Ouvrez la tâche ; dans « Répétition », choisissez le rythme (« Chaque lundi », « Le 15 du mois », « Le dernier jour du mois »…), puis « Répéter ».",
      "Ou dans la barre : « # », la tâche, puis « répéter chaque lundi ».",
      "La tâche est recréée à chaque fois, quelques jours avant son échéance.",
    ],
    ecrans: ["taches"],
    permis: "tous",
    mots: "repeter repetition recurrente revient chaque semaine mois lundi hebdomadaire mensuelle reguliere",
  },
  // ---------------------------------------------------------------- Rapport du vendredi
  {
    id: "preparer-mon-rapport",
    theme: "Rapport du vendredi",
    titre: "Préparer mon rapport du vendredi",
    question: "Comment remplir mon rapport de la semaine ?",
    resume: "Ouvrez Rapport : le brouillon est déjà préparé avec vos tâches ; relisez chaque partie.",
    etapes: [
      "Ouvrez Rapport : le brouillon est déjà préparé avec vos tâches de la semaine (fait, en cours, bloqué, la semaine prochaine). L'heure limite d'envoi s'affiche en tête.",
      "Relisez chaque partie, corrigez ou ajoutez des lignes (« Ajouter »), puis cliquez « À relire » : la partie passe à « Relu ».",
      "Dans « Santé de mes projets », donnez un feu à chaque projet (« Dans les temps », « À surveiller », « En retard ») et dites pourquoi en une phrase.",
      "« La semaine dernière » propose de reconduire ce qui était prévu (« Reconduire », « Tout reconduire »).",
    ],
    astuce: "Les parties marquées « Supérieur seulement » (charge, décision attendue, réunions) ne sont lues que par votre supérieur.",
    ecrans: ["rapport", "semaine"],
    permis: "redige",
    mots: "rapport rapports hebdo hebdomadaire vendredi remplir ecrire rediger preparer brouillon semaine faire mon rapport sante feu",
    faire: { libelle: "Ouvrir mon rapport", lien: "/rapport" },
    voirAussi: ["envoyer-mon-rapport", "ajouter-une-note-au-rapport"],
  },
  {
    id: "envoyer-mon-rapport",
    theme: "Rapport du vendredi",
    titre: "Envoyer mon rapport",
    question: "Comment envoyer mon rapport ?",
    resume: "« Aperçu » pour le relire tel qu'il sera lu, puis « Envoyer à… » en bas du rapport.",
    etapes: [
      "En bas du rapport, « Aperçu » le montre tel que votre supérieur le lira.",
      "Cliquez « Envoyer à… » (son prénom) : le statut passe de « Brouillon · pas encore transmis » à « Transmis le… ».",
      "S'il manque une partie obligatoire, l'application la nomme (« À remplir avant l'envoi : … ») : complétez-la, puis renvoyez.",
      "Depuis la barre : « envoyer mon rapport ».",
    ],
    ecrans: ["rapport", "semaine"],
    permis: "redige",
    mots: "envoyer envoi transmettre transmis soumettre rapport vendredi superieur chef apercu",
    faire: { libelle: "Ouvrir mon rapport", lien: "/rapport" },
    voirAussi: ["reprendre-mon-rapport"],
  },
  {
    id: "reprendre-mon-rapport",
    theme: "Rapport du vendredi",
    titre: "Compléter un rapport déjà envoyé",
    question: "Comment modifier mon rapport après l'avoir envoyé ?",
    resume: "Tant que votre supérieur ne l'a pas ouvert : « Reprendre mon rapport ».",
    etapes: [
      "Ouvrez votre rapport : Rapport → « Mes rapports », ou Ma semaine → « Revoir ».",
      "Tant que votre supérieur ne l'a pas ouvert, la carte « Compléter mon rapport » propose « Reprendre mon rapport » : il redevient un brouillon.",
      "Complétez-le, puis renvoyez-le : votre supérieur le reçoit de nouveau.",
      "Dès qu'il l'a ouvert, le rapport ne se modifie plus : écrivez-lui plutôt dans « Répondre », sous le rapport.",
    ],
    ecrans: ["rapport", "semaine"],
    permis: "redige",
    mots: "modifier corriger reprendre completer changer rapport envoye transmis erreur oublie oubli rajouter apres",
    faire: { libelle: "Ouvrir mes rapports", lien: "/rapports" },
    voirAussi: ["envoyer-mon-rapport"],
  },
  {
    id: "ajouter-une-note-au-rapport",
    theme: "Rapport du vendredi",
    titre: "Noter une décision ou un risque pour mon rapport",
    question: "Comment noter une décision ou un risque pour mon rapport ?",
    resume: "Dans la barre, commencez par « Décision : », « Risque : », « Fait marquant : » ou « La semaine prochaine : ».",
    etapes: [
      "Dans la barre, commencez par « Décision : », « Risque : », « Fait marquant : » ou « La semaine prochaine : », puis écrivez la phrase.",
      "Ajoutez « /UR » (le code du projet) pour la rattacher à un projet.",
      "Entrée : la ligne va dans la partie correspondante de votre rapport du vendredi (Décision ou aide attendue, Risque ou blocage, Fait marquant, La semaine prochaine).",
    ],
    astuce: "Le deux-points compte : « Fait le point avec la DTI » reste une tâche.",
    ecrans: ["rapport", "semaine", "projet"],
    permis: "redige",
    mots: "decision risque blocage fait marquant note noter rapport aide attendue semaine prochaine besoin alerte point d attention",
    faire: { libelle: "Commencer une décision dans la barre", barre: "Décision : " },
    voirAussi: ["preparer-mon-rapport"],
  },
  // ---------------------------------------------------------------- Équipe
  {
    id: "lire-les-rapports-de-l-equipe",
    theme: "Équipe",
    titre: "Lire les rapports de mon équipe et y répondre",
    question: "Comment lire les rapports de mon équipe ?",
    resume: "Équipe → Rapports : qui a transmis, qui n'a pas encore envoyé, et chaque rapport.",
    etapes: [
      "Ouvrez Équipe → Rapports : qui a transmis, qui n'a pas encore envoyé, et le résumé de chacun.",
      "Cliquez une personne pour lire son rapport ; l'icône d'historique ouvre tous ses rapports.",
      "Sous le rapport, « Répondre » : votre message lui arrive dans ses alertes, et vos échanges s'affichent sur le rapport.",
      "Dans la barre : « qui n'a pas envoyé son rapport ? ».",
    ],
    astuce: "Dès que vous ouvrez un rapport, son auteur ne peut plus le reprendre pour le modifier.",
    ecrans: ["equipe", "semaine"],
    permis: "chef",
    mots: "lire voir rapports rapport equipe agents collaborateurs collegue recus manquants envoye repondre reponse commenter chef superieur",
    faire: { libelle: "Ouvrir les rapports de l'équipe", lien: "/equipe/rapports" },
    voirAussi: ["voir-la-charge-de-l-equipe"],
  },
  {
    id: "voir-la-charge-de-l-equipe",
    theme: "Équipe",
    titre: "Voir la charge de mon équipe",
    question: "Comment savoir qui est surchargé ?",
    resume: "Équipe → Charge de travail ; ou « charge de Myriam », « qui est surchargé ? » dans la barre.",
    etapes: [
      "Ouvrez Équipe → Charge de travail : chaque personne, semaine par semaine, avec ses heures prévues face à ses heures disponibles.",
      "Dans la barre : « charge de Myriam » pour une personne, ou « qui est surchargé ? ».",
      "Les réunions comptent dans la charge.",
    ],
    astuce: "Une tâche sans durée estimée compte pour une durée par défaut, et elle est signalée : une estimation rend la charge plus juste.",
    ecrans: ["equipe", "projet"],
    permis: "chef",
    mots: "charge travail equipe surcharge surchargee disponible disponibilite dispo capacite heures libre marge occupee",
    faire: { libelle: "Ouvrir la charge de travail", lien: "/charge" },
  },
  // ---------------------------------------------------------------- Réunions
  {
    id: "noter-une-reunion",
    theme: "Réunions",
    titre: "Noter une réunion",
    question: "Comment noter une réunion ?",
    resume: "Dans la barre : « Réunion comité de pilotage UR jeudi 10h avec Myriam ».",
    etapes: [
      "Dans la barre : « Réunion comité de pilotage UR jeudi 10h avec Myriam » (« @ » pour ajouter des participants) ; l'application signale qui est déjà pris à ce créneau.",
      "Ou Ma semaine → Réunions → « Noter une réunion » : sujet, jour, heure, durée, projet, participants.",
      "Pour une réunion qui revient (comité, point d'équipe), choisissez un rythme dans « Répéter » : toutes les dates sont notées d'un coup, un an au plus.",
      "Le temps passé en réunion compte dans la charge de chacun et dans son rapport (« Mes réunions de la semaine »).",
    ],
    ecrans: ["reunions", "semaine"],
    permis: "tous",
    mots: "reunion reunions comite point rencontre noter planifier participants recurrente inviter agenda",
    faire: { libelle: "Commencer une réunion dans la barre", barre: "Réunion " },
    voirAussi: ["noter-les-decisions-d-une-reunion"],
  },
  {
    id: "noter-les-decisions-d-une-reunion",
    theme: "Réunions",
    titre: "Noter ce qui a été décidé en réunion",
    question: "Comment noter les décisions et les actions d'une réunion ?",
    resume: "Réunions → « Modifier » la réunion : « Notes » et « Actions décidées », qui deviennent des tâches.",
    etapes: [
      "Ouvrez Ma semaine → Réunions, puis « Modifier » sur la réunion (la barre vide propose aussi les réunions du jour à compléter).",
      "« Notes » : ce qui a été dit ou décidé.",
      "« Actions décidées » : une par ligne, écrite comme dans la barre (« Envoyer le compte rendu pour Fabienne vendredi ») ; chacune devient une tâche.",
      "Une décision qui engage un projet se note aussi à son registre : « UR décision prise : … » dans la barre.",
    ],
    astuce: "Seule la personne qui a noté la réunion peut la compléter ; les autres la voient.",
    ecrans: ["reunions"],
    permis: "tous",
    mots: "decision decisions actions compte rendu notes reunion suivi decide registre",
    faire: { libelle: "Ouvrir les réunions", lien: "/reunions" },
  },
  // ---------------------------------------------------------------- Projets
  {
    id: "proposer-un-projet",
    theme: "Projets",
    titre: "Proposer ou créer un projet",
    question: "Comment proposer un projet ?",
    resume: "Projets → « Proposer un projet » ; la direction l'accepte et nomme le chef de projet.",
    etapes: [
      "Ouvrez Projets → « Proposer un projet » : le titre, pourquoi ce projet (le problème, ce que la banque y gagne, qui le demande) et, si vous les avez, les objectifs, la fin souhaitée, le type de solution.",
      "« Envoyer la proposition » : elle part à la direction, qui l'accepte et nomme le chef de projet, ou la refuse en vous disant pourquoi.",
      "Dans la barre : « Nouveau projet : titre : pourquoi ».",
      "Une fois accepté, le projet reçoit son kit de démarrage : livrables, risques et bénéfices proposés au chef de projet.",
    ],
    astuce: "Un exécutif crée le projet directement, déjà validé, et nomme son chef de projet.",
    ecrans: ["portefeuille", "projet"],
    permis: "interne",
    mots: "projet nouveau creer proposer proposition demande idee lancer demarrer initiative",
    faire: { libelle: "Proposer un projet", lien: "/projets/nouveau" },
  },
  {
    id: "ajouter-un-livrable",
    theme: "Projets",
    titre: "Ajouter un livrable à un projet",
    question: "Comment ajouter un livrable ?",
    resume: "Sur la fiche du projet, « + Ajouter un livrable » : nom, date, responsable, phase.",
    etapes: [
      "Sur la fiche du projet, « + Ajouter un livrable » (ou « Nouveau livrable ») : le livrable, la date prévue, le responsable, la phase et ce qui permettra de dire qu'il est atteint.",
      "« Ajouter le livrable » : le responsable est prévenu ; il détermine les tâches qui y mènent.",
      "Dans la barre : « UR nouveau livrable maquettes validées 15/12 pour Daphnée ».",
    ],
    ecrans: ["projet"],
    permis: "gere",
    mots: "livrable livrables ajouter creer jalon responsable phase date prevue",
    faire: { libelle: "Ouvrir les projets", lien: "/projets" },
    voirAussi: ["faire-valider-un-livrable"],
  },
  {
    id: "changer-le-chef-l-equipe-ou-la-fin",
    theme: "Projets",
    titre: "Changer le chef de projet, l'équipe, la fin prévue ou le budget",
    question: "Comment repousser la fin prévue d'un projet ?",
    resume: "« Modifier le projet » sur sa fiche, ou une phrase dans la barre : « UR fin prévue 20/12 : … ».",
    etapes: [
      "Sur la fiche du projet, « Modifier le projet » : chef de projet, équipe, dates, priorité, budget.",
      "Ou dans la barre, avec le code du projet : « UR chef de projet Daphnée Joseph », « UR ajouter Fabienne à l'équipe comme analyste », « UR priorité haute », « UR budget 12,5 M engagé 11,8 M ».",
      "Pour repousser la fin : « UR fin prévue 20/12 : la DTI livre le serveur en retard ». La raison est obligatoire pour une date plus tardive : elle se lit dans les glissements et dans le rapport au conseil.",
    ],
    astuce: "Réservé à qui gère le projet : son chef, son référent DPO, sa direction et les exécutifs.",
    ecrans: ["projet"],
    permis: "gere",
    mots: "modifier projet chef equipe membre ajouter retirer fin prevue repousser reporter decaler date lancement budget priorite sponsor",
    faire: { libelle: "Ouvrir les projets", lien: "/projets" },
    voirAussi: ["tenir-les-risques-et-les-decisions"],
  },
  {
    id: "tenir-les-risques-et-les-decisions",
    theme: "Projets",
    titre: "Tenir le registre des risques et des décisions",
    question: "Comment ajouter un risque à un projet ?",
    resume: "Sur la fiche du projet, « Ajouter un risque », « Noter une décision » ; ou « UR nouveau risque : … ».",
    etapes: [
      "Sur la fiche du projet, partie Risques : « Ajouter un risque », avec sa probabilité et son impact ; critique à partir de 6 (probabilité × impact). « Corriger » le met à jour.",
      "Partie Décisions : « Noter une décision ».",
      "Dans la barre : « UR nouveau risque : retard du prestataire, probable, impact fort », « UR risque prestataire maîtrisé », « UR décision prise : mise en ligne en deux vagues ».",
    ],
    astuce: "Les registres sont tenus par le chef de projet, son référent et qui gère le projet. Un risque critique ouvert met le projet à surveiller.",
    ecrans: ["projet"],
    permis: "registres",
    mots: "risque risques registre ajouter nouveau maitrise clos decision decisions prise noter probabilite impact critique",
    faire: { libelle: "Ouvrir les projets", lien: "/projets" },
  },
  {
    id: "faire-valider-un-livrable",
    theme: "Projets",
    titre: "Déclarer un livrable prêt, puis le valider",
    question: "Comment faire valider un livrable ?",
    resume: "Le responsable le déclare prêt ; le chef de projet le valide ou le renvoie.",
    etapes: [
      "Le responsable du livrable, quand les tâches qui y mènent sont faites : « Déclarer prêt à valider » sur la fiche du projet, ou « UR livrable audit prêt » dans la barre.",
      "Le chef de projet le valide (« UR valider le livrable audit ») ou le renvoie à reprendre en disant pourquoi (« UR renvoyer le livrable audit : compléter le point 6 »).",
      "Un livrable validé compte dans l'avancement du projet (« 7/9 livrables »).",
    ],
    ecrans: ["projet", "taches"],
    permis: "tous",
    mots: "livrable pret valider validation termine accepter renvoyer reprendre declarer responsable",
  },
  {
    id: "voir-un-projet-autrement",
    theme: "Projets",
    titre: "Voir un projet en Gantt, en calendrier ou par charge",
    question: "Où trouver le Gantt d'un projet ?",
    resume: "Sur la fiche du projet, « Plus de vues » : Gantt, calendrier, charge.",
    etapes: [
      "Ouvrez le projet : « Vue d'ensemble », « Liste », « Tableau », et « Plus de vues » pour le Gantt, le calendrier et la charge.",
      "Dans le Gantt, choisissez « Par livrable » ou « Par personne », et l'échelle (jours, semaines, mois).",
      "Dans la barre : « Gantt UR », « calendrier CR ».",
    ],
    ecrans: ["projet", "portefeuille"],
    permis: "tous",
    mots: "gantt calendrier planning chronologie diagramme vue vues projet charge liste tableau plus de vues",
    faire: { libelle: "Ouvrir les projets", lien: "/projets" },
  },
  {
    id: "comprendre-la-sante-d-un-projet",
    theme: "Projets",
    titre: "Comprendre la santé d'un projet",
    question: "Pourquoi un projet est-il « en retard » ou « à surveiller » ?",
    resume: "La fiche du projet donne la santé calculée et ses raisons (livrable en retard, risque critique…).",
    etapes: [
      "Sur la fiche du projet, la santé est « calculée par l'application », avec ses raisons (« 1 livrable en retard de plus de 30 jours », « 1 risque critique ouvert au registre »).",
      "Un risque critique ouvert (probabilité × impact de 6 et plus) met le projet à surveiller.",
      "Dans son rapport du vendredi, chacun donne aussi un feu à ses projets (« Santé de mes projets »).",
      "Dans la barre : « projets à surveiller ? ».",
    ],
    ecrans: ["projet", "portefeuille"],
    permis: "tous",
    mots: "sante retard surveiller pourquoi projet rouge orange feu risque critique calcule raison glissement",
    voirAussi: ["poser-une-question-dans-la-barre"],
  },
  {
    id: "voir-ou-adapter-le-raci",
    theme: "Projets",
    titre: "Voir ou adapter le RACI d'un projet",
    question: "Où voir qui fait quoi sur un projet ?",
    resume: "Sur la fiche du projet, « Qui fait quoi (RACI) ».",
    etapes: [
      "Sur la fiche du projet, ouvrez « Qui fait quoi (RACI) » : pour chaque activité, qui réalise (R), approuve (A), est consulté (C) ou informé (I).",
      "Par défaut, c'est le RACI type de la DPO ; qui gère le projet peut « Adapter pour ce projet ».",
      "Le RACI type se règle dans Organisation → RACI (exécutifs et administrateurs).",
    ],
    ecrans: ["projet", "organisation"],
    permis: "tous",
    mots: "raci qui fait quoi responsable approuve consulte informe roles matrice",
  },
  // ---------------------------------------------------------------- Rapport au conseil
  {
    id: "ecrire-l-etat-pour-le-conseil",
    theme: "Rapport au conseil",
    titre: "Écrire l'état d'avancement pour le rapport au conseil",
    question: "Comment écrire l'état d'avancement de mon projet pour le conseil ?",
    resume: "Sur la fiche du projet, la carte « Rapport au conseil de… » : corrigez le texte proposé, puis « Enregistrer pour le conseil ».",
    etapes: [
      "Sur la fiche de votre projet stratégique, la carte « Rapport au conseil de… » donne la date limite.",
      "Partez du texte proposé (tiré des livrables et des reports de la fin), corrigez-le, puis « Enregistrer pour le conseil ».",
      "Écrivez-le le plus tard possible avant la date limite, pour qu'il dise où en est le projet. Sans votre texte, le rapport garde le texte automatique.",
    ],
    ecrans: ["projet", "conseil"],
    permis: "gere",
    mots: "conseil etat avancement rapport mensuel chef projet texte strategique ecrire",
    faire: { libelle: "Ouvrir les projets", lien: "/projets" },
    voirAussi: ["relire-et-approuver-le-rapport-au-conseil"],
  },
  {
    id: "relire-et-approuver-le-rapport-au-conseil",
    theme: "Rapport au conseil",
    titre: "Relire et approuver le rapport au conseil",
    question: "Comment relire le rapport au conseil ?",
    resume: "Conseil → « Tableau de relecture » pour corriger ; un exécutif l'approuve.",
    etapes: [
      "Ouvrez Conseil → « Rapport du mois » : « Rapport pour le conseil » le montre tel qu'il part.",
      "« Tableau de relecture » : corrigez un état d'avancement, puis « Enregistrer » ; votre version l'emporte sur celle du chef de projet.",
      "Les dates suivent les fiches projet jusqu'à l'approbation.",
      "Un exécutif clique « Approuver le rapport » : dates et états sont figés, et serviront de « dernier rapport » le mois suivant.",
    ],
    astuce: "Un directeur voit les projets stratégiques de sa direction ; un exécutif approuve le rapport complet.",
    ecrans: ["conseil"],
    permis: "conseil",
    mots: "conseil rapport mensuel relire relecture approuver approbation corriger direction executif tableau",
    faire: { libelle: "Ouvrir le rapport au conseil", lien: "/conseil" },
    voirAussi: ["imprimer-le-rapport-au-conseil"],
  },
  {
    id: "imprimer-le-rapport-au-conseil",
    theme: "Rapport au conseil",
    titre: "Imprimer le rapport au conseil ou en faire un PDF",
    question: "Comment imprimer le rapport au conseil ?",
    resume: "« Imprimer ou PDF » : ce qui s'affiche est ce qui s'imprime, en Legal à l'italienne.",
    etapes: [
      "Ouvrez Conseil → « Rapport pour le conseil » : ce qui s'affiche est ce qui s'imprime, en Legal (8,5 × 14 po) à l'italienne, page par page.",
      "« Imprimer ou PDF » ouvre la fenêtre d'impression du navigateur : choisissez l'imprimante, ou l'enregistrement en PDF.",
      "Si le navigateur propose un format de papier, prenez Legal, à l'italienne.",
      "Pour un fichier Word au format du tableau : « Tableau de relecture » → « Fichier Word (tableau) ».",
    ],
    ecrans: ["conseil"],
    permis: "conseil",
    mots: "imprimer impression imprimante pdf legal papier format word exporter telecharger conseil fichier",
    faire: { libelle: "Ouvrir le rapport au conseil", lien: "/conseil" },
  },
  {
    id: "preparer-un-rapport-ponctuel",
    theme: "Rapport au conseil",
    titre: "Préparer un rapport ponctuel au conseil",
    question: "Comment préparer un rapport ponctuel au conseil ?",
    resume: "Conseil → « Rapports ponctuels » → « Nouveau rapport ponctuel ».",
    etapes: [
      "Ouvrez Conseil → « Rapports ponctuels » → « Nouveau rapport ponctuel » : pour une demande ou un événement imprévu.",
      "Donnez le titre, la demande ou l'événement, la période couverte et les projets, puis « Préparer le rapport » : même format que le rapport du mois, préparé à partir des fiches projet et des tâches.",
      "Relisez-le et corrigez les états, puis faites-le approuver.",
      "Dans la barre : « rapport ponctuel : titre : pour le conseil du 15 ».",
    ],
    ecrans: ["conseil"],
    permis: "conseil",
    mots: "ponctuel rapport special conseil point de situation exceptionnel imprevu evenement demande",
    faire: { libelle: "Ouvrir les rapports ponctuels", lien: "/conseil/ponctuels" },
  },
  // ---------------------------------------------------------------- La barre
  {
    id: "ce-que-sait-faire-la-barre",
    theme: "La barre",
    titre: "Ce que sait faire la barre du haut",
    question: "À quoi sert la barre du haut ?",
    resume: "« / » un projet, « @ » une personne, « # » une tâche, « > » toutes les actions.",
    etapes: [
      "La touche « / » met le curseur dans la barre, depuis n'importe quel écran.",
      "Dans la barre : « / » choisit un projet, « @ » une personne, « # » une tâche à mettre à jour.",
      "« > » donne la liste de toutes les actions : créer un projet, assigner un livrable, générer un rapport…",
      "Une question qui finit par « ? » répond tout de suite ; une question qui commence par « comment », « où » ou « pourquoi » ouvre ce guide. Sinon, Entrée cherche dans les projets, les tâches et les personnes.",
    ],
    ecrans: ["semaine", "taches"],
    permis: "tous",
    mots: "barre raccourci raccourcis commande commandes slash arobase diese actions touche clavier chercher recherche",
    faire: { libelle: "Voir toutes les actions", barre: ">" },
  },
  {
    id: "poser-une-question-dans-la-barre",
    theme: "La barre",
    titre: "Poser une question sur les tâches et les projets",
    question: "Comment savoir ce qui est en retard ?",
    resume: "Une question avec « ? » dans la barre : « en retard sur UR ? », « tâches bloquées ? ».",
    etapes: [
      "Écrivez la question dans la barre, avec « ? » : « en retard sur UR ? », « mes échéances de la semaine ? », « tâches bloquées ? », « projets à surveiller ? », « mes réunions aujourd'hui ? ».",
      "La réponse s'affiche pendant que vous écrivez, avec seulement ce que vous avez le droit de voir ; rien n'est modifié.",
      "Cliquez une ligne pour l'ouvrir.",
    ],
    ecrans: ["semaine", "taches", "projet", "equipe"],
    permis: "tous",
    mots: "question questions retard echeance echeances bloquee surcharge projets surveiller reunions qui quoi savoir",
    faire: { libelle: "Poser une question", barre: "en retard ?" },
  },
  // ---------------------------------------------------------------- Compte et téléphone
  {
    id: "changer-le-theme",
    theme: "Compte et téléphone",
    titre: "Changer le thème (clair ou sombre)",
    question: "Comment passer en thème sombre ?",
    resume: "Profil → Apparence → Thème : Automatique, Clair ou Sombre.",
    etapes: [
      "Ouvrez votre profil : vos initiales en bas du menu, sur ordinateur ; « Plus », sur téléphone.",
      "Apparence → Thème : « Automatique » (sombre sur téléphone, clair sur ordinateur), « Clair » ou « Sombre ».",
    ],
    ecrans: ["profil"],
    permis: "tous",
    mots: "theme sombre clair nuit couleur couleurs apparence fond noir mode dark",
    faire: { libelle: "Ouvrir mon profil", lien: "/profil" },
  },
  {
    id: "mot-de-passe",
    theme: "Compte et téléphone",
    titre: "Mot de passe et déconnexion",
    question: "Comment changer mon mot de passe ?",
    resume: "Profil → Sécurité → « Changer mon mot de passe » ; oublié : demandez-en un à l'administrateur.",
    etapes: [
      "Profil → Sécurité → « Changer mon mot de passe ».",
      "Mot de passe oublié : demandez-en un nouveau à l'administrateur de l'application ; vous le changerez à la connexion suivante.",
      "Pour fermer votre session : Profil → « Se déconnecter » (sur téléphone, en bas de « Plus »).",
    ],
    ecrans: ["profil"],
    permis: "tous",
    mots: "mot de passe password oublie changer connexion code acces securite identifiant deconnecter deconnexion sortir quitter session",
    faire: { libelle: "Ouvrir mon profil", lien: "/profil" },
  },
  {
    id: "alertes",
    theme: "Compte et téléphone",
    titre: "Les alertes : ce qui arrive, et où le lire",
    question: "Où voir mes alertes ?",
    resume: "« Alertes » dans le menu (dans « Plus » sur téléphone), avec le nombre de non lues.",
    etapes: [
      "Le nombre d'alertes non lues s'affiche sur « Alertes », dans le menu ; sur téléphone, sur « Plus ».",
      "Ouvrez Alertes : chaque alerte mène à ce qui la concerne.",
      "Vous y recevez ce qui vous concerne : une tâche qu'on vous confie ou qu'on relance, une réunion où l'on vous a noté, une réponse à votre rapport, les rappels du rapport du vendredi, ce qui change sur vos projets.",
    ],
    ecrans: ["semaine"],
    permis: "tous",
    mots: "alerte alertes notification notifications message messages cloche rappel recu non lues",
    faire: { libelle: "Ouvrir les alertes", lien: "/alertes" },
  },
  {
    id: "sur-le-telephone",
    theme: "Compte et téléphone",
    titre: "Utiliser l'application sur le téléphone",
    question: "Comment utiliser l'application sur mon téléphone ?",
    resume: "Le menu passe en bas ; « Plus » mène au reste ; la barre reste en haut.",
    etapes: [
      "Le menu passe en bas de l'écran, cinq entrées ; « Plus » mène à tout le reste (alertes, réunions, bilan, thème…).",
      "La barre reste en haut de chaque page : tâches, réunions, questions s'y écrivent comme sur ordinateur.",
      "Le thème automatique passe en sombre sur téléphone.",
      "Les documents à imprimer, comme le rapport au conseil, se préparent sur ordinateur.",
    ],
    ecrans: ["semaine"],
    permis: "tous",
    mots: "telephone mobile portable smartphone ecran petit tablette",
  },
  {
    id: "pourquoi-je-ne-vois-pas",
    theme: "Compte et téléphone",
    titre: "Ce que je vois, et ce que je ne vois pas",
    question: "Pourquoi je ne vois pas un projet ou un menu ?",
    resume: "Chacun voit ce qui concerne son rôle ; votre profil le dit (« Ce que vous voyez »).",
    etapes: [
      "Chacun voit ce qui concerne son rôle : vos tâches et les projets sur lesquels vous travaillez ; un chef d'équipe voit aussi son équipe ; un directeur, sa direction.",
      "Votre profil le dit, dans « Ce que vous voyez ».",
      "Les menus suivent : Équipe pour les chefs d'équipe et la direction, Conseil pour les directeurs et les exécutifs, Organisation pour les exécutifs et les administrateurs.",
      "S'il vous manque un projet sur lequel vous travaillez, demandez à son chef de projet de vous ajouter à l'équipe.",
    ],
    ecrans: ["profil", "portefeuille"],
    permis: "tous",
    mots: "voir vois acces droits droit menu manque cache absent projet invisible role permission pourquoi pas",
    faire: { libelle: "Ouvrir mon profil", lien: "/profil" },
  },
];

export const FICHES: Fiche[] = BRUTES.map((f) => ({
  ...f,
  titre: insecables(f.titre),
  question: insecables(f.question),
  resume: insecables(f.resume),
  etapes: f.etapes.map(insecables),
  astuce: f.astuce ? insecables(f.astuce) : undefined,
}));

const PAR_ID = new Map(FICHES.map((f) => [f.id, f]));
export const ficheParId = (id: string) => PAR_ID.get(id) ?? null;

// ---------------------------------------------------------------------------
// Une question pour le guide ?
// ---------------------------------------------------------------------------

/** Les débuts de phrase qui demandent un mode d'emploi (texte passé par cleNom : sans accents ni ponctuation). */
const DEBUTS = [
  "comment",
  "ou est",
  "ou sont",
  "ou trouver",
  "ou se trouve",
  "ou voir",
  "ou puis je",
  "ou peut on",
  "ou est ce que",
  "ou je",
  "ou mettre",
  "ou ajouter",
  "ou changer",
  "pourquoi",
  "a quoi sert",
  "a quoi servent",
  "c est quoi",
  "qu est ce que",
  "qu est ce qu",
  "que veut dire",
  "que signifie",
  "que faire",
  "que dois je",
  "est ce que je peux",
  "est ce qu on peut",
  "est il possible",
  "puis je",
  "peut on",
  "je peux",
  "on peut",
  "je voudrais",
  "je veux",
  "j aimerais",
  "je ne peux pas",
  "je n arrive pas",
  "je ne trouve pas",
  "je ne vois pas",
  "je n ai pas",
  "impossible de",
  "guide",
  "faq",
  "mode d emploi",
  "tutoriel",
];

/**
 * « comment envoyer mon rapport ? », « où changer le thème », « aide », « ? » seul : une question pour le guide.
 * Pas « où en est UR ? » (une question sur les données), ni « Aide attendue : … » (une note pour le rapport).
 */
export function estQuestionGuide(saisie: string): boolean {
  const brut = saisie.trim();
  if (brut === "?") return true;
  const n = cleNom(brut);
  if (!n) return false;
  if (/^ou en (est|sont)\b/.test(n) || /^aide attendue\b/.test(n)) return false;
  if (/^aide$/.test(n) || /^aide (sur|pour|a propos)\b/.test(n)) return true;
  return DEBUTS.some((d) => n === d || n.startsWith(`${d} `));
}

// ---------------------------------------------------------------------------
// Trouver les fiches
// ---------------------------------------------------------------------------

const VIDES = new Set(
  "comment ou est sont se puis je peux peut on pourquoi a quoi sert servent c qu ce que veut dire signifie faire fais dois il possible ne pas n arrive ai impossible de d du des le la les l un une mon ma mes me m son sa ses leur leurs votre vos notre nos au aux en et pour par sur dans avec qui quel quelle quels quelles y t elle ils cela ca cette cet aide guide faq mode emploi tutoriel svp merci voudrais veux aimerais estce si tout tous toutes moi".split(" "),
);

const mots = (s: string) => cleNom(s).split(" ").filter((m) => m && !VIDES.has(m));

/** Deux mots proches : identiques, ou un préfixe commun long (« envoie » et « envoyer », « valider » et « validation »). */
function proches(a: string, b: string): number {
  if (a === b) return 1;
  const n = Math.min(a.length, b.length);
  if (n < 4) return 0;
  let p = 0;
  while (p < n && a[p] === b[p]) p++;
  return p >= Math.max(4, n - 2) ? 0.8 : 0;
}

type Index = { fiche: Fiche; titre: string[]; forts: string[]; moyens: string[]; faibles: string[] };
const INDEX: Index[] = FICHES.map((f) => ({
  fiche: f,
  titre: [...new Set([...mots(f.titre), ...mots(f.question)])],
  forts: [...new Set([...mots(f.titre), ...mots(f.question), ...mots(f.mots)])],
  moyens: [...new Set(mots(f.resume))],
  faibles: [...new Set(mots(f.etapes.join(" ")))],
}));

/** La question contient-elle au moins un mot qui cherche quelque chose (pas seulement « aide », « comment ? ») ? */
export const aDesMotsUtiles = (question: string) => mots(question).length > 0;

export type Contexte = { ecran?: EcranGuide | null; permis: (p: Permission) => boolean };
export type Resultat = { fiche: Fiche; score: number };

/**
 * Les fiches qui répondent à la question, de la plus probable à la moins probable, parmi celles que la personne a le
 * droit de voir ; l'écran ouvert départage. Sans mot utile (« aide », « ? »), les fiches de l'écran ouvert.
 */
export function trouverFiches(question: string, c: Contexte, max = 5): Resultat[] {
  const permises = INDEX.filter((i) => c.permis(i.fiche.permis));
  const q = [...new Set(mots(question))];
  if (!q.length) {
    return permises
      .filter((i) => !c.ecran || i.fiche.ecrans.includes(c.ecran))
      .slice(0, max)
      .map((i) => ({ fiche: i.fiche, score: 0 }));
  }
  const meilleur = (m: string, liste: string[]) => liste.reduce((x, y) => Math.max(x, proches(m, y)), 0);
  return permises
    .map((i) => {
      let score = 0;
      let forts = 0;
      for (const m of q) {
        const f = meilleur(m, i.forts);
        if (f) forts++;
        // Un mot du titre ou de la question pèse un peu plus qu'un synonyme.
        score += Math.max(3.5 * meilleur(m, i.titre), 3 * f, 1 * meilleur(m, i.moyens), 0.5 * meilleur(m, i.faibles));
      }
      // Ce qui est demandé couvert en entier : un bonus ; l'écran ouvert départage.
      if (forts === q.length && q.length > 1) score += 1;
      if (score > 0 && c.ecran && i.fiche.ecrans.includes(c.ecran)) score += 1;
      return { fiche: i.fiche, score, forts };
    })
    .filter((r) => r.forts > 0 && r.score >= 2.4)
    .sort((x, y) => y.score - x.score || FICHES.indexOf(x.fiche) - FICHES.indexOf(y.fiche))
    .slice(0, max)
    .map(({ fiche, score }) => ({ fiche, score }));
}

/** L'écran du guide pour un chemin de l'application. */
export function ecranDuChemin(chemin: string): EcranGuide {
  if (chemin.startsWith("/rapport")) return "rapport";
  if (chemin.startsWith("/taches") || chemin.startsWith("/a-faire")) return "taches";
  if (chemin.startsWith("/reunions")) return "reunions";
  if (chemin.startsWith("/equipe") || chemin.startsWith("/charge")) return "equipe";
  if (chemin.startsWith("/projets/")) return "projet";
  if (chemin.startsWith("/projets")) return "portefeuille";
  if (chemin.startsWith("/conseil")) return "conseil";
  if (chemin.startsWith("/organisation") || chemin.startsWith("/pilote")) return "organisation";
  if (chemin.startsWith("/profil") || chemin.startsWith("/plus")) return "profil";
  return "semaine";
}

// ---------------------------------------------------------------------------
// Les questions restées sans réponse (suivi du pilote) : sans nom ni numéro
// ---------------------------------------------------------------------------

const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * La question telle qu'elle sera gardée pour enrichir le guide : sans courriel, sans numéro, sans le nom d'une
 * personne de l'organisation (« [personne] »), 120 caractères au plus. Rien ne relie la question à qui l'a posée.
 */
export function nettoyerQuestion(question: string, noms: string[]): string {
  let t = question.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, 200);
  t = t.replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu, "[courriel]");
  t = t.replace(/\+?\d[\d\s./-]{4,}\d/g, "[numéro]");
  const tries = [...new Set(noms.map((n) => n.trim()).filter((n) => n.length >= 3))].sort((a, b) => b.length - a.length);
  for (const n of tries) t = t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${echapper(n)}(?![\\p{L}\\p{N}])`, "giu"), "[personne]");
  t = t.replace(/(\[personne\][\s-]*)+\[personne\]/g, "[personne]");
  return t.slice(0, 120).trim();
}
