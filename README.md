# Pilotage des projets — Division des Projets Organisationnels

Application web de suivi des projets de la DPO (UNIBANK) :

- **La barre**, une seule, en haut de toutes les pages (touche `/` pour y mettre le curseur) : on écrit, l'application comprend. Une phrase qui est clairement une action s'exécute avec Entrée ; sinon, Entrée cherche (la page de résultats complets), et la liste propose « Ajouter la tâche ». Juste après chaque action, « Annuler » reste proposé vingt secondes. Le menu n'a donc pas d'entrée « Rechercher ».
  - **`>` : tout ce que la barre sait faire**, en liste, avec un exemple pour chaque action ; on tape un mot (« livrable », « projet », « rapport », « charge ») pour filtrer, on choisit, la phrase se commence (le projet d'abord, s'il en faut un) et l'exemple reste affiché.
  - Ajouter une tâche en une ligne : « Relire maquettes /unib @fab vendredi 2h priorité haute » (`/` un projet, `@` une personne, une date, des heures, une priorité), ou avec des mots : « … pour Fabienne projet retail vendredi ».
  - Mettre une tâche à jour : `#` choisit une tâche (les siennes, celles de son équipe, celles qu'on a confiées, celles de ses projets), puis « faite », « en cours », « bloquée attente de la DTI », une date, une durée, « priorité haute », « passé 1h30 » (le temps passé), « répéter chaque lundi » (ou « chaque mois le 15 »), « arrêter la répétition », « annuler : motif », une note, « relancer » (une alerte à la personne), ou `@` pour la confier à quelqu'un d'autre. Sans rien écrire, Entrée l'ouvre.
  - Créer un projet : « Nouveau projet : Portail fournisseurs : les achats veulent suivre leurs factures » (le pourquoi après le deux-points ; « code PF », « chef Daphnée », « fin 30/06/2027 », « stratégique » facultatifs). Une directrice ou un exécutif qui nomme le chef crée le projet directement, en cours ; un exécutif doit nommer le chef (la barre le lui demande) ; sinon, c'est une demande, et la direction est prévenue.
  - Les livrables (le code du projet en tête, ou `/`) : « UR nouveau livrable maquettes validées 15/12 pour Daphnée », « UR assigner le livrable audit à Daphnée », « UR livrable audit 20/11 », « UR livrable audit prêt », « UR valider le livrable audit », « UR renvoyer le livrable audit : compléter le point 6 ». Un livrable se désigne par quelques mots de son nom ; si plusieurs correspondent, la barre demande de préciser.
  - Le reste d'un projet : « UR ajouter Fabienne à l'équipe comme analyste », « UR retirer Ricardo de l'équipe », « UR chef de projet Daphnée », « UR sponsor Frantz Desrosiers », « UR priorité haute », « UR budget 12,5 M engagé 11,8 M », « UR décision prise : mise en ligne en deux vagues (comité de pilotage) », « UR nouveau risque : retard du prestataire, probable, impact fort », « UR risque prestataire maîtrisé », « UR terminer la phase », « UR phases types », « UR nouvelle phase pilote du 2/11 au 30/11 », « UR clôturer : en ligne pour tous les clients, objectifs atteints » (sans bilan : le formulaire de clôture s'ouvre), « UR rouvrir ».
  - Les rapports : « générer un rapport » propose le choix ; « envoyer mon rapport », « mon rapport de la semaine », « rapport au conseil » (ou « … en Word »), « rapport ponctuel : point sur UNIBANKOnline : pour le conseil du 15 ».
  - La charge d'une personne : « charge de Myriam » (avec ou sans « ? ») : ses heures prévues cette semaine, la suivante et celle d'après, si on la suit.
  - Chaque action applique les mêmes règles que l'écran correspondant (qui gère le projet, qui est dans l'équipe…) : l'aperçu dit avant l'envoi ce qui est réservé, et le bouton reste gris. La plupart se défont avec « Annuler ».
  - Noter une réunion : « Réunion comité de pilotage /unib avec Fabienne et Daphnée jeudi 10h 1h30 ». Avant d'enregistrer, la barre signale qui est déjà pris à ce créneau (vous compris) ; la réunion se note quand même, et les participants déjà pris en sont avertis.
  - Une note pour le rapport du vendredi : « Décision : … », « Risque : … », « Fait marquant : … », « Semaine prochaine : … ».
  - Mettre un projet à jour (chef de projet) : « /UR risque : retard du prestataire », « /UR livrable validation métier 15/11 », « /UR fin prévue 20/12 ».
  - Poser une question : « en retard sur UR ? », « mes échéances de la semaine ? », « qui est surchargé ? », « qui n'a pas envoyé son rapport ? ».
  - Chercher : projets, tâches, personnes et écrans (« Gantt UR », « charge de Myriam »), seulement parmi ce que chacun voit déjà. Barre vide : ce qui compte aujourd'hui (tâches en retard ou du jour, réunions du jour, projets ouverts récemment).
- **Formulaires écrits comme la barre** : une ligne du rapport (« Validation métier faite UR », « … projet retail », ou `/` pour le projet : plus de liste « Sans projet ») ; les actions décidées en réunion (« Envoyer le compte rendu pour Fabienne vendredi ») ; le titre d'une nouvelle tâche remplit le projet, la personne, l'échéance et le temps estimé ; la fiche d'une tâche et celle d'un projet ont une ligne « En une ligne » en tête, le formulaire complet reste dessous.
- **Ma semaine** : la journée d'aujourd'hui (tâches faites, échéances, réunions) et la frise de la semaine ; un clic sur un jour montre ce qui s'est passé ce jour-là ; les flèches remontent aux semaines précédentes.
- **Mes tâches** (entrée du menu, juste après Semaine ; adresse `/taches`, l'ancienne `/a-faire` y mène) : « Nouvelle tâche » en tête, puis **ma charge** des six semaines à venir (heures prévues sur heures disponibles, une jauge par semaine, le détail sur sa fiche) et trois vues au choix : **Liste** (filtres en retard, bloquées, en cours, à faire, faites ; la case de chaque tâche montre son état et se coche quand elle est faite), **Tableau** (une colonne par état, on glisse une carte ou on choisit son état) et **Calendrier** (mes échéances du mois, faites comprises, et mes livrables ; dessous, les tâches sans échéance). À côté : les livrables dont on est responsable, et les tâches qu'on a confiées à des personnes hors division, pour les suivre. Les chiffres de « Ma semaine » mènent à la liste, filtrée.
- **L'état d'une tâche se voit partout de la même façon** : cercle vide à faire, à moitié plein en cours, barre ambre bloquée, coche verte faite, anneau rouge en retard (listes, tableau, calendrier, Gantt, fiche du projet, fiche d'une personne, Équipe, recherche, réunions, enchaînement des tâches). L'état est toujours dit en mots aux lecteurs d'écran.
- **Reprendre son rapport envoyé** : tant que son supérieur ne l'a pas ouvert, l'auteur peut reprendre le rapport de la semaine (« Compléter mon rapport », sur le rapport envoyé) ; il redevient un brouillon, qu'on complète ou corrige avant de le renvoyer. Le supérieur ne reçoit l'alerte qu'au nouvel envoi. Une fois ouvert par le supérieur, quand un échange a commencé dessous, ou quand le supérieur a déjà envoyé son propre rapport (qui le reprend), le rapport est figé : on écrit dessous (« Répondre »).
- **Rapport au conseil, tel qu'il part** (vue par défaut de *Conseil*) : ce qui s'affiche est ce qui s'imprime, en feuilles Legal (8,5 × 14 po) à l'italienne numérotées (« Imprimer ou PDF ») ; sur un portable, la feuille est réduite pour tenir dans la largeur, sans changer la mise en page. La première feuille fait la synthèse : chiffres du mois (projets suivis, santé, fins repoussées ce mois, prochain lancement), **l'essentiel de chaque projet en une ligne** (fin prévue et glissement, livrable en retard ou prochain livrable, risque critique, lancement proche), et le calendrier de livraison (barre de l'entrée à la fin prévue, couleur de la santé ; retard sur la fin initiale hachuré ; fin au dernier rapport ; lancement ; aujourd'hui). Puis le détail : une bande par projet sur toute la largeur (projet et santé │ état d'avancement et objectifs │ livrables et risque critique │ dates), 3 à 4 par feuille. Les projets vont du plus préoccupant au moins préoccupant. À l'approbation, la santé, les livrables et le risque critique sont figés avec le rapport. Le **tableau de relecture** (second onglet) reste l'endroit où l'on corrige les états d'avancement ; le fichier Word en sort, au format du tableau.
- **Réunions** : chacun note les réunions auxquelles il a participé (sujet, jour, heure, durée, projet, participants, notes). Une seule personne la note : elle compte pour chaque participant, qui est prévenu et peut s'en retirer. Le temps en réunion apparaît dans sa semaine, dans son rapport du vendredi (pour son supérieur direct), dans la charge (il réduit le temps disponible) et dans le bilan. Les **actions décidées** en réunion deviennent des tâches (pour qui, pour quand), rattachées à la réunion. Sous la semaine, **le temps en réunion** sur la période choisie, comparé à la période d'avant : par semaine ou par mois, et par projet, pour soi et, pour un chef, pour l'équipe qu'il suit (en heures-personnes : une réunion compte pour chaque participant).
- **Mon bilan** : son activité sur la période choisie (semaine, mois, 3 ou 6 mois, exercice), comparée à la période d'avant : tâches terminées, heures livrées, charge réalisée (et prévue), terminées à temps, temps en réunion, rapports envoyés.
- **Rapport de la semaine** : un formulaire configuré par les administrateurs (modèles de rapport), préparé à partir des tâches, relu et envoyé au supérieur. Chaque chef de projet reçoit les lignes et les feux de son projet.
  - **Il se prépare seul au fil de la semaine** : à chaque ouverture, le brouillon reprend ce qui a changé dans les tâches (terminées, en cours, bloquées). Ce que la personne a retiré ne revient pas.
  - **La semaine dernière** : un panneau reprend ce qui était prévu et en cours (« Fait », « En cours », « Reconduire », « Tout reconduire ») et les commentaires écrits (« Reprendre »). Un blocage ou une décision attendue **non marqué « Résolu » revient de lui-même** la semaine suivante, avec son ancienneté (« 2ᵉ semaine »). « Résolu » garde la ligne dans le rapport, marquée résolue ; un blocage lié à une tâche débloque aussi la tâche (annulable).
  - **Une page allégée** : une colonne de parties compactes (petit compteur, témoin « Relu »), le code projet d'une ligne se change d'un clic, « + Ajouter » ouvre la ligne de saisie ; charge, réunions et pièces jointes tiennent sur une ligne ; « Qui lit quoi » est replié. Au téléphone, « Aperçu » et « Envoyer » restent au pied de l'écran.
  - **Aperçu** : le rapport tel que le supérieur le lira, avant l'envoi.
  - **Lecture** : quelques chiffres « en un coup d'œil » (fait, bloqué, décisions attendues, temps en réunion, charge), ce qui demande une réponse en premier, l'ancienneté des blocages, la tendance des feux, et « Depuis la semaine dernière » ; « Envoyé à l'heure », « Lu par » (la première ouverture par le destinataire), « Répondre » (un mot entre l'auteur et son supérieur, reçu en alerte) et « Imprimer ou PDF ».
- **Rapport de chef** : le chef d'équipe et le directeur gardent leur propre rapport (« Mon travail »), suivi d'une partie préremplie à partir des rapports qu'ils reçoivent (« Mon équipe », « Ma division ») : à décider, synthèse par projet, santé des projets, charge, fait, la semaine prochaine. Un seul envoi. Les exécutifs ne rédigent pas de rapport : ils lisent ceux de tout le monde.
- **Heures du rapport** : chaque modèle fixe quand le rapport est prêt à relire (le brouillon est alors complété avec les tâches de la semaine), quand un rappel part, et l'heure limite ; le chef apprend ensuite quels rapports manquent. Si le courriel est configuré, « prêt à relire » et le rappel arrivent aussi **par courriel**, avec un lien direct vers le rapport.
- **Pièces jointes** dans le rapport (PDF, images, Word, Excel, PowerPoint, CSV, texte ; 10 Mo par fichier), lues selon la règle du champ.
- **Documents du projet** : cahier des charges, spécification technique, compte rendu de réunion, autre document ; la catégorie se propose d'après le nom du fichier (« CDC… », « Spec… », « CR… ») et se change d'un clic. Mêmes formats et même vérification que les pièces jointes, 100 documents au plus par projet. Les lit qui voit le projet ; en ajoute l'équipe du projet, la personne qui l'a demandé et ceux qui le gèrent ; en retire qui l'a déposé ou qui gère le projet.
- **Modèles de rapport** (administrateurs) : champs à choisir ou à glisser, ordre, propriétés de chaque champ, affectation aux équipes et aux personnes, versions.
- **Mes rapports** : tous les rapports déjà envoyés, semaine par semaine, avec passage d'une semaine à l'autre.
- **Mon équipe** : en un coup d'œil, les rapports reçus (une pastille par personne), la charge prévue des deux semaines (combien de personnes surchargées, chargées, normales, libres) et les tâches de la semaine de toute l'équipe ; puis une carte par personne (rapport, barre de ses tâches, jauges de charge, réunions, projets), les blocages et la relance ; la fiche de chacun montre sa charge, ses tâches et ses réunions de la semaine (heures et liste) ; un directeur ou un exécutif y voit toute la structure sous lui, regroupée par équipe ; l'historique des rapports de l'équipe (par semaine ou par personne) ; la charge de travail ; le **bilan de l'équipe**, mois contre mois, personne par personne (les exécutifs le voient pour toute la banque).
- **Projets** : portefeuille, fiches projet, **livrables** (voir plus bas), glissement des dates. En tête du portefeuille, la **santé des projets** (dans les temps, à surveiller, en retard), **calculée par l'application** (voir plus bas), avec les projets à regarder et pourquoi, et la **fin prévue comparée à la fin initiale**, du plus grand retard au plus petit. Sur la fiche, la **courbe d'avancement** (tâches terminées et tâches au total, sur la période choisie) et l'**historique des reports** de la fin prévue (quand, de quelle date à quelle date). Chacun peut **proposer un projet** ; un directeur ou un exécutif l'accepte (en nommant le chef de projet) ou la refuse avec un motif. Le chef de projet établit l'**équipe du projet** (le rôle de chacun se tape : les rôles déjà donnés sont proposés, un rôle nouveau s'ajoute à la liste à l'enregistrement) et modifie la fiche (titre, code, dates, statut, livrables) ; il peut **signaler un risque** que les données ne montrent pas. Un projet qui a une histoire s'**archive** ; seul un projet vide (une erreur) se supprime.
- **Tâches** : créer, renommer, préciser, changer de projet, **confier** à quelqu'un (à soi-même, aux personnes qu'on suit, et, sur un projet qu'on dirige, aux membres de son équipe projet ; à une personne hors division, voir plus bas) ; les deux personnes sont prévenues. Une tâche commencée s'**annule** avec un motif (et se rétablit) ; seule une tâche sans histoire se supprime.
- **Noms cliquables** : partout, le nom d'une personne ouvre sa fiche (poste, équipe, supérieur, projets). Pour qui suit la personne (et pour soi), la même fiche montre aussi sa charge des semaines à venir, ses tâches ouvertes, ses réunions de la semaine, un lien vers ses rapports, et son **évolution** : tâches terminées, heures livrées, charge réalisée (et prévue), terminées à temps, temps en réunion et rapports envoyés, sur une semaine, un mois, 3 ou 6 mois ou un exercice, comparés à la période d'avant (la personne n'est comparée qu'à elle-même) ; le nom ou le code d'un projet (« UR ») ouvre le projet, quand on a le droit de le voir, y compris dans une rangée qui mène à une tâche.
- **Rapports au conseil** : le rapport mensuel des projets stratégiques, au format du tableau Word de la banque (avec le logo) ; et des **rapports ponctuels**, faits à tout moment pour une demande ou un événement imprévu : un titre, la demande, les projets choisis, la période couverte. Un exécutif les approuve ; ils ne changent pas les dates du rapport mensuel. **Rapports soumis** : tous les rapports déjà faits (mensuels et ponctuels), par année, avec leur état et le fichier Word ; le rapport mensuel se feuillette d'un mois à l'autre.
- **Vues d'un projet** : vue d'ensemble, liste, tableau (colonnes par état, avec glisser-déposer) ; derrière « Plus de vues » : Gantt (jours, semaines ou mois), calendrier des échéances, charge de l'équipe du projet. Le portefeuille a aussi une chronologie de tous les projets.
- **Charge de travail** : les heures de tâches prévues pour chaque personne, semaine par semaine, comparées à ses heures disponibles ; repère qui est chargé ou surchargé, et l'indique au moment de confier une tâche. **À venir** : vue **Carte** (huit semaines d'un coup d'œil, une case colorée par personne et par semaine) ou vue **Détail** (le tableau des heures). **Semaine, mois, 3 ou 6 mois, exercice** : la **charge réalisée** de chacun, période par période, et la **charge prévue** notée chaque lundi (voir plus bas).
- **Personnes hors division** : collègues d'autres départements, consultants, prestataires. Ils peuvent participer à une réunion, recevoir une tâche, entrer dans l'équipe d'un projet ou diriger un projet d'une autre division. Chacun peut en ajouter un au moment où il en a besoin (nom et département ou société) ; aucune adresse n'est demandée.
- **Projets d'autres divisions** : un projet porté par une autre division, sur lequel la DPO travaille, garde son chef de projet (hors division) et reçoit un **référent DPO**, qui le gère dans l'application.
- **Organisation** : personnes, équipes, supérieurs, rôles et heures disponibles par semaine ; les personnes hors division (fiche, accès limité, fusion des doublons). **Importer** l'organisation depuis Excel (le modèle contient l'organisation actuelle) ou depuis Active Directory : on voit d'abord ce qui changerait, puis on importe.
- **Suivi du pilote** (administrateurs, exécutifs) : rapports envoyés et à l'heure, tâches mises à jour avant vendredi, écrans réellement ouverts, courriels de rappel, avec leurs courbes sur la période choisie ; en nombres agrégés seulement, personne n'y est suivi individuellement.
- **Chiffres cliquables** : en tête des écrans, un chiffre qui compte une liste y mène (tâches en retard ou faites de l'équipe, mes tâches bloquées, projets en retard, personnes surchargées, réunions de la semaine, rapports soumis…). Les moyennes et les pourcentages restent de simples chiffres.
- **Listes où l'on tape** : pour choisir une personne (chef de projet, équipe du projet, « Pour » d'une tâche, responsable d'équipe, supérieur, affectation d'un modèle, historique des rapports), on tape quelques lettres du nom ou du poste, sans se soucier des accents ; flèches et Entrée au clavier.
- **Assistant** (facultatif) : un bouton flottant sur chaque écran, branché sur le fournisseur d'IA choisi par la banque.

Application multipage (chaque écran est une page rendue par le serveur), en français, avec thème clair et sombre. Elle fonctionne sur ordinateur et sur téléphone. Sur téléphone, la barre du bas a cinq entrées (Semaine, Mes tâches, Rapport, Équipe ou Projets, Plus) ; « Plus » mène à tout le reste.

---

## Qui voit quoi

| Rôle | Comment on l'obtient | Ce qu'il voit |
|---|---|---|
| Chacun | — | Ses tâches, son rapport de la semaine, ses réunions, son bilan, les projets sur lesquels il travaille (dont ceux de son équipe projet) ; la fiche de chacun (poste, équipe, supérieur, projets visibles) |
| Supérieur (chef d'équipe) | Automatique : des personnes lui envoient leur rapport | Les tâches et les rapports de ses subordonnés directs |
| Chef de projet | Automatique : désigné sur la fiche projet | Tout son projet, qu'il gère (fiche, livrables, équipe projet, archivage) ; dans les rapports de la semaine, **seulement** les lignes et les feux de son projet, dans les champs ouverts à tous |
| Directeur | Interrupteur dans *Organisation* (seul un exécutif peut le donner) | Les projets, tâches et rapports des membres de **sa direction** (toutes les personnes placées sous lui, à tous les niveaux) ; décide des demandes de projet qu'il voit ; **gère** (fiche, équipe, archivage) les projets dont le chef ou le référent est dans sa direction, pas ceux d'une autre direction où travaillent les siens ; les projets stratégiques de sa direction dans le rapport au conseil |
| Exécutif | Interrupteur dans *Organisation* (seul un exécutif peut le donner) | **Tout** ; approuve les rapports au conseil. Ne rédige pas de rapport de la semaine |
| Administrateur | Interrupteur dans *Organisation* | Gère les personnes, les équipes, les supérieurs, les accès et les **modèles de rapport**. Ne donne **aucun** accès supplémentaire aux rapports ni aux tâches : un administrateur qui n'est pas exécutif ne peut pas se nommer supérieur ou chef d'équipe de quelqu'un (ni rien qui lui ferait suivre de nouvelles personnes, import compris), ne change ni son propre supérieur ni son équipe, ne touche pas à la fiche d'un exécutif et ne donne pas de mot de passe provisoire à un exécutif ou à un directeur |

| Référent DPO | Désigné sur la fiche d'un projet d'une autre division | Les droits du chef de projet sur ce projet ; reçoit les lignes et les feux du projet dans les rapports de la semaine |
| Personne hors division | Ajoutée par n'importe qui, au besoin | Par défaut, **aucun accès** : une simple fiche. Un administrateur peut lui ouvrir un **accès limité** (adresse et mot de passe provisoire) : ses tâches (elle ne s'en confie qu'à elle-même), ses réunions, les projets où elle intervient, les fiches des personnes avec qui elle travaille ; ni rapport, ni équipe, ni charge, ni annuaire de la division. Chef d'un projet d'une autre division, elle ne le gère pas ici : c'est le référent DPO |

Les rôles se cumulent. Chaque personne a **un seul** supérieur. Si le poste de responsable d'une équipe est vacant, les rapports remontent au niveau suivant. Une personne dont le supérieur change (fiche, responsable d'équipe ou import) en reçoit une alerte. Un brouillon de rapport n'est visible que par son auteur. Il reste toujours au moins un administrateur.

Dans un rapport, chaque champ a sa règle de lecture, choisie dans le modèle : « tous ses lecteurs » (supérieur, direction, chefs de projet pour leurs lignes), « supérieur et direction » (pas les chefs de projet), ou « son supérieur seulement » (ni la direction, ni les exécutifs, ni les chefs de projet). Un élément reçu à titre privé reste au chef ; il ne remonte que s'il le décide, et la charge ressentie ne remonte qu'en nombres.

Ces règles sont écrites dans `src/lib/regles.ts` et `src/lib/modeles.ts`, et vérifiées par les tests (`tests/`).

---

## Modèles de rapport

Écran *Organisation → Modèles de rapport*, réservé aux administrateurs.

- **Un modèle** est la liste des champs que la personne remplit, dans l'ordre. Types : lignes par projet, santé des projets (Dans les temps, À surveiller, En retard), charge de la semaine (Légère, Normale, Lourde, Trop lourde), réunions de la semaine (reprises du journal des réunions, figées à l'envoi ; « son supérieur seulement » par défaut), texte court ou long, choix, échelle, nombre, date, pièce jointe, intertitre, note ; pour les modèles de chef : « Mon travail », « Repris des rapports reçus » et « Synthèse par projet ».
- **Heures de la semaine** : prêt à relire (vendredi 10 h par défaut), rappel (14 h), à envoyer avant (17 h). Les alertes sont créées à l'ouverture d'une page, une fois par semaine : aucune tâche planifiée à installer.
- **Synthèse par projet** (rapport de chef) : quelques phrases par projet, préparées à partir de ce que l'équipe a envoyé (ou des synthèses des chefs d'équipe), à relire ; l'assistant peut les rédiger. Seul ce que les lecteurs du champ pouvaient déjà lire y entre.
- **Décision ou aide attendue** : des propositions sont faites à partir des tâches bloquées et des échéances dépassées ; l'assistant peut les formuler.
- **Propriétés d'un champ** : libellé, aide, obligatoire, rubrique (fait, en cours, bloqué, prévu, décision attendue, autre), préremplissage (tâches, feu de la semaine dernière, niveau de charge calculé), marquage par projet, qui le voit.
- **Qui remplit quoi** : l'affectation nominative d'abord ; sinon, pour une personne qui reçoit des rapports, le modèle des chefs d'équipe ; sinon celui de son équipe ; sinon le modèle par défaut. Le modèle par défaut reprend les quatre parties d'avant les modèles.
- **Versions** : toute modification prépare une nouvelle version, publiée d'un clic. Un rapport garde une copie du formulaire avec lequel il a été rempli ; on le relit toujours tel qu'il a été envoyé.
- **Rapport de chef** : « Mon travail » est remplacé par le formulaire de son équipe ; la partie équipe reprend les rapports reçus. Le chef garde, retire ou reformule chaque élément, choisit ce qui remonte, et peut changer le feu proposé (le plus préoccupant de l'équipe). Sans chef d'équipe, les rapports vont directement au niveau suivant.

---

## Charge de travail : comment elle est calculée

- Chaque tâche peut avoir un **début** et un **temps estimé** (en heures). Sans estimation, elle compte pour 4 heures, et l'écran le signale.
- Les heures sont réparties sur les jours ouvrés (lundi à vendredi) entre le début et l'échéance. Sans début, la tâche commence assez tôt pour tenir à 8 heures par jour.
- Rien n'est placé dans le passé : une tâche en retard est à rattraper tout de suite ; cette semaine, seules les heures des jours qui restent sont disponibles.
- Les tâches bloquées ne comptent pas tant qu'elles le restent (elles attendent quelqu'un d'autre).
- Chaque personne a ses **heures disponibles par semaine** (40 par défaut), réglées dans *Organisation*. Les **réunions notées** (passées ou prévues) en sont retirées : cette semaine, celles des jours qui restent ; les semaines suivantes, toutes.
- Niveaux : jusqu'à 85 % des heures disponibles, charge normale ; de 85 à 100 %, chargée ; au-delà, surchargée.

L'écran *Charge* est ouvert aux chefs d'équipe, directeurs et exécutifs, pour les personnes qu'ils suivent. Dans la vue *Charge* d'un projet, le chef de projet voit les heures de chacun sur son projet et seulement le **niveau** de charge totale des personnes qu'il ne suit pas, sans le détail de leurs autres projets.

Ces règles sont écrites dans `src/lib/charge.ts` et vérifiées par les tests.

**Sur une période passée** (le même sélecteur que le bilan) :

- **Charge réalisée** : les heures estimées de chaque tâche terminée, réparties à parts égales sur les jours ouvrés de son début à sa fin (sans début : assez tôt pour tenir à 8 heures par jour), rapportées aux heures disponibles moins les réunions notées. C'est une estimation à partir des tâches, pas un relevé du temps passé ; une tâche encore ouverte n'y compte pas.
- **Charge prévue** : chaque lundi (ou au premier passage de la semaine), l'application note la charge à venir de la semaine de chacun (table `charges_prevues`) ; le serveur s'en charge toutes les heures, sans tâche planifiée à installer. On compare ainsi le prévu au réalisé, à partir de la première semaine notée : avant, la charge prévue n'est pas connue.

## Livrables : comment ils fonctionnent

- Un projet se découpe en **livrables** (par exemple « Modèle conceptuel validé ») : un nom, une date prévue, un **responsable**, et, si l'on veut, ce qui sera vérifié pour le valider. Le chef de projet les gère sur leur propre page, comme les tâches (29 octobre 2026) : *Gérer les livrables* (`/projets/…/livrables` : modifier, ordonner, retirer) et *Nouveau livrable* (`/projets/…/livrables/nouveau`, avec « Ajouter et en saisir un autre »), depuis la fiche du projet ; *Modifier le projet* y renvoie. Les « indicateurs vérifiables » d'avant sont devenus des livrables.
- **Le responsable détermine les tâches** qui mènent à son livrable (« Ajouter une tâche » sous le livrable, ou le champ *Livrable* d'une tâche). Il peut **confier les tâches de son livrable** à l'équipe du projet (chef, référent, membres, y compris hors division), même aux personnes qu'il ne suit pas. Nommé responsable, il entre dans l'équipe du projet et reçoit une alerte ; ses livrables apparaissent dans *À faire*.
- **Avancement** : les tâches faites sur les tâches du livrable. Une tâche prévue **après la date de son livrable** est signalée (dans le formulaire, sur la tâche, sur la fiche du projet et dans le Gantt) : le livrable prendra du retard. Des tâches peuvent rester **hors livrable** ; elles sont comptées sur la fiche du projet.
- **Prêt à valider** : le responsable le déclare ; le chef de projet (ou qui gère le projet) est prévenu, puis le **valide** ou le **renvoie à reprendre** avec une remarque. Un livrable validé peut se rouvrir.
- Le **Gantt** se regroupe par livrable (avec la date de chaque livrable) ou par personne ; la liste des tâches se regroupe ou se filtre par livrable ; le calendrier montre les dates des livrables ; le rapport au conseil cite les livrables validés et le prochain attendu ; la santé du projet en tient compte.
- Dans la barre : « /UR livrable modèle conceptuel validé 20/11 » ajoute un livrable daté (« jalon » est compris aussi).

## Reports, décisions et dépendances

- **Motif des reports** : repousser la fin prévue d'un projet (fiche, *Modifier le projet*, ou la barre : « /UR fin prévue 20/12 : le prestataire livre en retard ») demande de dire pourquoi. Le motif se lit dans l'historique des reports de la fiche, il est repris dans l'état d'avancement préparé pour le rapport au conseil et transmis à l'assistant. Avancer la date ne demande rien.
- **Registre des décisions** : sur la fiche du projet, ce qui a été décidé, quand, par quelle instance (comité de pilotage, direction… : les instances déjà notées sont proposées) et pourquoi. Seuls le chef de projet, le référent DPO, le directeur qui suit le chef et les exécutifs notent, corrigent ou retirent une décision ; l'équipe du projet lit le registre (29 octobre 2026). Une décision se note une fois prise (pas de date future). Les décisions récentes sont transmises à l'assistant pour le rapport au conseil.
- **Dépendances entre tâches** : sur la fiche d'une tâche, *Enchaînement* : les tâches du même projet qu'elle attend, et celles qu'elle débloque. Pas de boucle ; dix précédentes au plus. Tant qu'une précédente n'est pas faite, la tâche l'affiche (et le Gantt aussi) ; une tâche prévue pour commencer avant la fin de sa précédente est signalée. Quand la dernière précédente est faite, la personne de la tâche suivante reçoit une alerte : elle peut commencer.

## Phases, risques et temps passé

- **Phases** : les grandes étapes du projet, dans l'ordre (*Modifier le projet*, section *Phases*). Un clic propose les phases types — Cadrage, Conception, Réalisation, Validation métier, Déploiement, Clôture — réparties de l'entrée à la fin prévue du projet ; on les renomme, les date, les déplace ou en ajoute. La fiche montre la frise et la phase en cours (la première pas terminée dont le début est passé) ; le portefeuille l'affiche sur chaque carte, le Gantt sur une ligne à part. Un livrable peut être rattaché à sa phase. Seuls ceux qui gèrent le projet organisent les phases et les terminent.
- **Registre des risques** : sur la fiche du projet, ce qui pourrait l'empêcher d'aboutir. Chaque risque a une probabilité et un impact (faible, moyen, fort, notés 1 à 3) ; leur produit donne la criticité : critique à partir de 6, modéré de 3 à 4, faible en dessous. Une matrice 3 × 3 montre où sont les risques ouverts. On note qui le suit, la réponse prévue et la prochaine revue ; un risque se marque *maîtrisé*, *clos* ou se rouvre. Seuls le chef de projet, le référent DPO, le directeur qui suit le chef et les exécutifs ajoutent, modifient, marquent ou retirent un risque ; l'équipe du projet, y compris la personne qui suit un risque, lit le registre (29 octobre 2026). La personne désignée pour suivre un risque reçoit une alerte.
- **Temps passé** : sur la fiche d'une tâche, la personne (ou qui peut modifier la tâche) note le temps réellement passé : « 1h30 », « 45 min », « 2 » (heures), un jour des 60 derniers, une note facultative. La carte compare au temps estimé et le dit quand il est dépassé ; la fiche du projet totalise le temps noté sur ses tâches. La charge de travail reste calculée sur les estimations : le temps passé sert à mieux estimer.

## Clôture, sponsor, budget, priorité, tâches récurrentes

- **Clôturer un projet** : sur sa fiche, *Clôturer le projet* (ceux qui gèrent le projet). On y écrit le bilan (ce qui a été livré, ce qui ne l'a pas été), on dit si les objectifs sont atteints, en partie ou pas, et les leçons apprises. Ce qui reste ouvert (tâches, livrables, risques, phases) est signalé sans empêcher la clôture. Le projet passe « finalisé », ne reçoit plus de tâches ; l'équipe et le sponsor sont prévenus ; le bilan reste sur la fiche. Un projet clôturé se rouvre d'un clic. « Finalisé » ne se choisit plus dans *Modifier le projet* : c'est la clôture qui y mène.
- **Sponsor métier** : la personne qui porte le besoin côté métier (*Modifier le projet*), de la division ou d'ailleurs. Elle voit le projet sans le gérer, est prévenue quand on la nomme et quand le projet est clôturé.
- **Budget** : montant prévu, montant engagé à ce jour, devise (gourdes ou dollars), une note. Seuls ceux qui gèrent le projet le voient et le tiennent. La part engagée passe en ambre à 90 % et en rouge au-delà de 100 %. On écrit les montants comme on les dit : « 2 500 000 », « 2,5 M », « 800 k ». Le budget n'entre pas dans la santé calculée.
- **Priorité** : haute, normale ou basse, pour un projet (*Modifier le projet*) et pour une tâche (sa fiche, ou à la création). « Haute » se voit sur la carte du projet, sur la ligne de la tâche ; dans « Mes tâches », à état égal, une tâche prioritaire passe devant ; la liste des tâches d'un projet se trie par priorité.
- **Tâches récurrentes** : sur la fiche d'une tâche, *Répétition* : chaque semaine (du lundi au vendredi) ou chaque mois (le 1er, le 5… ou le dernier jour). La tâche est la première occurrence ; les suivantes sont créées quelques jours avant leur échéance (6 jours pour une tâche hebdomadaire, 10 pour une mensuelle), pour la même personne, avec le même projet et le même livrable. Une échéance qui tombe un week-end passe au vendredi. Une occurrence manquée (serveur arrêté) n'est pas recréée ; la répétition s'arrête d'elle-même si la personne n'est plus active ou si le projet est clôturé.

## Ajouts du 29 octobre 2026

- **Programmes et divisions** : choisis dans une liste à la création et à la modification d'un projet (contrôlé au serveur). Les listes se gèrent dans *Organisation → Listes* (administrateurs et exécutifs) : ajouter, renommer (les projets suivent), retirer (les projets gardent leur valeur). Code : `src/lib/donnees/listes.ts`.
- **Page d'un livrable** : le titre d'un livrable ouvre sa page (état, date, responsable, phase, critère, tâches qui y mènent, histoire, actions). Mêmes droits que la fiche du projet.
- **Fiche d'une personne, par projet** : sur quatre semaines, les tâches ouvertes et faites, les heures estimées qui restent, le temps passé noté et les réunions de chaque projet, avec la dernière activité ; « Rien depuis 14 j » signale un projet aux tâches ouvertes sans aucune activité depuis deux semaines. Pour soi et pour qui suit la personne. Code : `src/lib/donnees/par-projet.ts`.
- **Réunions récurrentes** : chaque jour ouvré, chaque semaine, toutes les deux semaines ou chaque mois, jusqu'à une date (un an et 260 réunions au plus) ; toutes les dates sont notées d'un coup ; on modifie ou on supprime celle-ci ou celle-ci et les suivantes. Code : `src/lib/recurrence-reunion.ts`.
- **Comparer deux rapports au conseil** (*Conseil → Comparer*) : les projets alignés, ce qui a changé de l'un à l'autre (fin, lancement, état d'avancement, projet ajouté ou retiré). Lecture seule. Code : `src/lib/comparaison-conseil.ts`.
- **Import en vrac** (*Organisation → Importer*) : personnes et équipes (administrateurs), projets et tâches (exécutifs). Un modèle Excel à télécharger (la feuille à remplir, puis « Mode d'emploi »), le fichier rempli à déposer, un aperçu (ce qui serait créé, lignes à corriger), puis l'import ; rien n'est écrit tant qu'une ligne est en erreur, et un code de projet déjà pris est refusé (réimporter le même fichier ne crée rien deux fois). Dates en JJ/MM/AAAA. Code : `src/lib/import-projets.ts`, `src/lib/donnees/import-projets.ts`.
- **Fiche de projet** (bouton « Fiche de projet » sur la fiche d'un projet) : une synthèse au format d'une note de cadrage — faits clés, description, objectifs et bénéfices, équipe et RACI, calendrier (reports, phases), livrables, avancement, risques ouverts, décisions, budget (pour qui gère le projet), clôture, documents. « Imprimer ou enregistrer en PDF » (A4, par le navigateur) ou « Télécharger en Word ». Code : `src/lib/donnees/fiche-projet.ts` (contenu), `src/app/(app)/projets/[id]/fiche/page.tsx` (page), `src/lib/fiche-word.ts` (Word).
- **Objectifs et bénéfices attendus** : sur la page *Modifier le projet* ; un bénéfice peut porter un indicateur, une valeur de départ et une cible, puis la valeur constatée (notée sur la fiche, aussi après la clôture). Une demande de projet peut donner ses objectifs (un par ligne). À la clôture, chaque objectif se dit atteint, en partie ou pas ; le bilan d'ensemble en est tiré. Les objectifs paraissent aussi sous la description du projet dans le rapport au conseil (page et Word). Code : `src/lib/objectifs.ts`, `src/lib/donnees/objectifs.ts`.
- **RACI** : le RACI type de la DPO (*Organisation → RACI*, repris de la note de cadrage) vaut pour tous les projets ; la fiche l'affiche avec les noms (sponsor, chef de projet, équipe). Un projet qui s'en écarte l'adapte (*Modifier le projet → RACI*) et peut y revenir. Code : `src/lib/raci.ts`, `src/lib/donnees/raci.ts`.
- **Comparer deux rapports au conseil** : une colonne par mois (le plus ancien en beige, le plus récent en bleu), ce qui a bougé dit en clair (« Fin repoussée de 4 sem. »), un état d'avancement resté le même marqué « Inchangé ».
- **Documents** : nouvelle catégorie « Note de cadrage » (reconnue au nom du fichier).
- **Données de démonstration** : version 10 (objectifs et bénéfices sur UR, UC et la messagerie) ; l'essai local recrée sa base au prochain lancement.
- **Rôle d'un membre de l'équipe** : il se change sur la fiche du projet (bouton « Rôle » de la ligne), sans retirer la personne de l'équipe ; le changement est au journal. Après un ajout, le formulaire « Ajouter à l'équipe » repart vide.
- **Vérification de l'enregistrement** (29 octobre 2026) : un parcours passe par les écrans comme un utilisateur, puis relit la base, pour le registre des risques (création, maîtrisé, rouvert, modifié, retiré, journal), les décisions, le budget (montants « 9,5 M », devise), le report de la fin avec motif et le lancement, le signal de risque, l'équipe (ajout, rôle, retrait), les phases, les livrables (création, prêt, validé), la fiche du projet (programme pris dans la liste, priorité, sponsor), les documents (dépôt, octets identiques au téléchargement, retrait, journal), les tâches (création, statut, temps passé, répétition, dépendance, faite), une réunion récurrente, la clôture et la réouverture, une demande de projet acceptée et les listes. 52 contrôles, tous passés.

## Santé d'un projet : comment elle est calculée

Le chef de projet ne choisit plus la santé : l'application la calcule à partir des données du projet, l'enregistre avec ses raisons en clair, et la recalcule à chaque changement, à l'ouverture du portefeuille ou de la fiche, et toutes les heures.

- **En retard**, si la fin prévue est dépassée ; ou si un livrable ni prêt ni validé a plus de 30 jours de retard ; ou si au moins le quart des tâches ouvertes à échéance sont en retard (3 au moins).
- **À surveiller**, si la fin prévue a été repoussée dans les 30 derniers jours ; ou si un livrable ni prêt ni validé a dépassé sa date ; ou si des tâches d'un livrable sont prévues après sa date ; ou si un risque critique est ouvert au registre ; ou si une phase a dépassé sa fin prévue sans être terminée ; ou si une tâche a plus d'une semaine de retard ou est bloquée depuis plus d'une semaine ; ou si, au rythme des quatre dernières semaines, les tâches ouvertes ne seront pas finies avant la fin prévue.
- **Risque signalé** : le chef de projet (ou qui gère le projet) peut signaler un risque que les données ne montrent pas (« retard du prestataire ») ; le projet passe alors au moins à « à surveiller ». Un signal ne peut qu'aggraver la santé, jamais l'améliorer, et il tombe de lui-même après 30 jours. On le signale aussi dans la barre (« /UR risque : … ») ; on le retire d'un clic sur la fiche.
- **Dans les temps**, sinon. Un projet continu n'a pas de fin prévue à tenir ; un projet finalisé, une demande ou un refus n'ont pas de santé à suivre.

Les seuils sont écrits dans `src/lib/sante.ts` (`SEUILS_SANTE`) et vérifiés par les tests.

## Bilan : ce qu'il mesure

- **Tâches terminées** et **heures livrées** : les tâches marquées faites dans la période, avec leur temps estimé (4 heures pour une tâche sans estimation).
- **Terminées à temps** : parmi les tâches terminées qui avaient une échéance, la part terminée au plus tard ce jour-là.
- **En réunion** et **part du temps** : les réunions notées, rapportées aux heures disponibles de la période (jusqu'à aujourd'hui pour la période en cours).
- **Rapports** : les rapports du vendredi envoyés, sur ceux attendus (une semaine compte à partir de son vendredi ; rien n'est attendu d'un exécutif, ni avant le premier rapport envoyé dans l'application).
- **Charge réalisée**, et **prévue** quand elle a été notée : voir « Charge de travail ».
- **Le même sélecteur de période partout** où l'application montre de l'activité : *Mon bilan*, *Équipe → Bilan*, la fiche d'une personne, *Charge* (en plus de « À venir »), les réunions en chiffres, l'avancement d'un projet, le suivi du pilote. La période choisie est gardée (préférence du navigateur, `dpo_periode`) et s'applique aux autres pages ; la *Charge* s'ouvre toujours sur « À venir ».
  - **Semaine** : la semaine comparée à la précédente, avec la courbe des huit semaines qui y mènent ;
  - **Mois** : le mois comparé au mois d'avant, avec la courbe des six mois qui y mènent ;
  - **3 mois**, **6 mois** : la fenêtre comparée à celle d'avant, mois par mois (la période d'avant en pointillé) ;
  - **Exercice** : l'exercice comparé au précédent, sur ses douze mois. L'exercice commence en octobre par défaut (`EXERCICE_DEBUT_MOIS`).
  - Une période en cours se compare **à la même date** (du lundi au mercredi contre du lundi au mercredi de la semaine d'avant ; du 1er au 30 octobre contre du 1er au 30 septembre ; un exercice entamé contre les mêmes mois de l'exercice d'avant). Avant les premières données de l'application, rien n'est comparé.
  - Chiffres clés, une courbe par mesure, la jauge des rapports, le tableau mois par mois ; pour chaque personne, ses chiffres et sa propre courbe : chacun n'est comparé qu'à lui-même, jamais rangé parmi les autres.

Ces chiffres décrivent ce qui est enregistré dans l'application ; ils ne mesurent ni la qualité du travail ni ce qui n'est pas noté. L'écran le rappelle. Règles : `src/lib/bilan.ts`, testées.

## Graphiques : d'où viennent les chiffres

- Tous les graphiques sont dessinés par le serveur (sans script dans le navigateur). Les valeurs sont toujours écrites (étiquettes, chiffres, tableaux) : la couleur seule ne porte jamais l'information. Les courbes et les colonnes montrent aussi chaque valeur au survol, au toucher et au clavier.
- **Reports de la fin prévue** : chaque changement de la date de fin d'un projet (fiche du projet ou barre, « /UR fin prévue 20/12 ») est gardé dans la table `reports_fin_projet` ; « Annuler » le retire. Les reports faits avant cette version ne sont pas connus un à un : seul l'écart entre la fin initiale et la fin prévue l'est.
- **Avancement d'un projet** : à la fin de chaque semaine ou de chaque mois de la période choisie, les tâches créées jusque-là et celles terminées (les tâches annulées ne comptent pas) ; et les tâches terminées pendant la période, comparées à la période d'avant.
- **Réunions en chiffres** et **charge** : mêmes règles que la semaine, le rapport et la charge ; un projet qu'on ne voit pas compte dans « Autres projets », sans son nom.
- **Suivi du pilote** : une semaine d'avant les premières données de l'application n'a pas de valeur (pas un zéro). Sur un mois ou plus, les parts se calculent sur l'ensemble des semaines de la période (rapports attendus, rédacteurs), et « ont ouvert l'application » compte les personnes distinctes de la période.

## Grands écrans

Les pages occupent toute la largeur de la fenêtre, avec la même marge des deux côtés (variable `--largeur-page` dans `src/app/globals.css`). Les grilles ajoutent des colonnes quand la place le permet ; les paragraphes restent limités à une largeur lisible. La fiche d'un projet passe en trois colonnes quand sa zone principale dépasse 1 800 px (requête de conteneur `@container`), soit une fenêtre d’environ 2 000 px de large ; en dessous, la mise en page reste celle d'un portable.

## Personnes hors division et projets d'autres divisions

- **Ajouter quelqu'un** : dans « Avec qui » d'une réunion (« + Quelqu'un d'autre, hors division »), dans « Pour » d'une tâche (« Quelqu'un d'autre, hors division… »), dans l'équipe d'un projet ou comme chef de projet. On donne son nom et son département ou sa société. Une fiche déjà connue (même nom, même organisation, sans tenir compte des accents ni des majuscules) est reprise plutôt que recréée.
- **Confier une tâche** à une personne hors division : seulement le chef de projet (ou le référent DPO), sur son projet ; ni hors projet, ni sur le projet d'un autre, y compris pour la direction et les exécutifs. Celui qui confie la tâche la voit et la suit dans *Mes tâches*, « Confiées hors division ».
- **Ce qu'elles ne font pas** : pas de supérieur ni d'équipe, pas de rapport du vendredi ; elles n'entrent ni dans la charge, ni dans le bilan, ni dans *Mon équipe*. Sans accès, elles ne reçoivent pas d'alerte.
- **Organisation → Hors division** : liste avec le nombre de tâches et les projets de chacun ; modifier la fiche, ouvrir ou fermer un accès limité (administrateurs), **fusionner** deux fiches de la même personne (les tâches, réunions et projets passent sur celle qu'on garde).
- **État d'avancement écrit par le chef de projet** (29 octobre 2026) : sur la fiche de chaque projet stratégique de la DPO, la carte « Rapport au conseil de … » : le chef de projet (ou le référent DPO, sa direction, les exécutifs) écrit l'état d'avancement qui paraîtra au rapport mensuel, en partant d'un texte automatique. Il l'écrit le plus tard possible : jusqu'au jour limite, 5 jours ouvrables avant le dernier jeudi du mois (le jeudi d'avant), au soir ; ensuite il est figé. Le rapport le reprend tant qu'il est un brouillon ; s'il n'est pas écrit, le rapport garde le texte automatique, signalé. Les exécutifs relisent, corrigent (leur version l'emporte, le chef le voit) et approuvent ; le rapport part avant le dernier jeudi. Rappels (alertes, tournée horaire) : aux chefs le vendredi de la semaine d'avant le jour limite, relance la veille à ceux qui n'ont rien écrit ; le lendemain du jour limite, « prêt à valider » aux exécutifs. Calendrier : `src/lib/calendrier-conseil.ts` ; les jours fériés ne sont pas pris en compte. Après le dernier jeudi, la carte passe au mois suivant ; /conseil permet d'ouvrir le rapport en préparation.
- **Fiche de projet de la DPO** (29 octobre 2026) : à la proposition, à la création et dans *Modifier le projet*, les cases de la fiche de cadrage : type de solution (amélioration de produit, amélioration de processus / procédures, nouveau produit, nouveau processus), informations déjà disponibles (techniques, organisationnelles, financières), spécialisations de la DPO impliquées (Études, Planification et Conception ; Solutions Technologiques ; Déploiement & Formation). Elles se lisent avant de décider d'une demande, et dans la fiche exportée.
- **Kit de démarrage** (29 octobre 2026) : une fois le projet accepté, sa fiche propose, à qui gère le projet, un kit tiré de ces cases (règles, sans IA : `src/lib/kit.ts`, à valider par la DPO) : les phases types réparties sur la durée, des livrables (chacun dans sa phase, daté de la fin de la phase, avec ce qui le valide), des risques (probabilité, impact, réponse), des bénéfices attendus (avec leur indicateur) et le responsable de l'équipe d'une spécialisation cochée. Chaque élément dit pourquoi il est proposé ; on décoche ce qui ne convient pas, puis « Ajouter au projet » (livrables et risques confiés au chef de projet, une seule alerte), ou « Ne pas utiliser le kit ». La page du kit (`/projets/…/kit`) reste ouverte : elle ne repropose pas ce que le projet a déjà.
- **Projet créé par un exécutif** (29 octobre 2026) : pour un exécutif, « Proposer un projet » devient « Créer un projet ». Il nomme le chef de projet (et un référent DPO si le chef est hors division), le statut de départ et la date d'entrée ; le projet naît validé, sans demande à accepter ni alerte à la direction. Le chef et le référent sont prévenus.
- **Projet d'une autre division** : la fiche porte le nom de la division et son chef de projet. Un chef de projet hors division demande un **référent DPO** ; c'est lui qui gère le projet et lit les lignes du projet dans les rapports. Un tel projet n'entre pas dans le rapport mensuel au conseil ; on peut le choisir pour un rapport ponctuel.

Règles : `src/lib/projets.ts` (qui confie quoi à qui), `src/lib/donnees/externes.ts` ; tests `tests/projets.test.ts` et `tests/externes-base.test.ts`.

## Installation (service informatique)

### Avec Docker Compose (recommandé)

Prérequis : Docker 24 ou plus récent avec le plugin Compose, et un proxy HTTPS de la banque devant l'application.

```bash
# 1. Paramètres
cp .env.example .env
#    Renseigner au minimum : POSTGRES_PASSWORD, APP_URL. Laisser COOKIE_SECURISE=1 et DATE_DEMO vide.

# 2. Construction et démarrage (la base est mise à jour automatiquement au démarrage)
docker compose up -d --build

# 3. Premier administrateur (le mot de passe provisoire s'affiche une seule fois)
docker compose exec app node scripts/creer-utilisateur.mjs \
  --courriel=prenom.nom@unibankhaiti.com --prenom=Prénom --nom=Nom \
  --poste="Directeur de la division" --administrateur --executif

# 4. Vérification
curl -s http://localhost:3000/api/sante     # → {"etat":"ok"}
```

L'application écoute en HTTP sur le port 3000. Le proxy HTTPS de la banque doit la publier à l'adresse indiquée dans `APP_URL`. La base PostgreSQL n'est pas exposée hors de Docker.

Le premier administrateur crée ensuite les équipes et les personnes depuis l'écran **Organisation** ; chaque nouvelle personne reçoit un mot de passe provisoire à changer à sa première connexion.

### Sans Docker (base PostgreSQL existante)

Prérequis : Node.js 22, PostgreSQL 14 ou plus récent, une base et un utilisateur dédiés.

```bash
npm ci
npm run build
cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
export DATABASE_URL=postgres://dpo:...@serveur:5432/dpo   # et les autres variables de .env.example
node scripts/migrer.mjs
node scripts/creer-utilisateur.mjs --courriel=... --prenom=... --nom=... --administrateur --executif
cd .next/standalone && PORT=3000 node server.js
```

Lancer le serveur par un gestionnaire de services (systemd, par exemple) pour qu'il redémarre seul.

### Paramètres (`.env`)

| Variable | Rôle |
|---|---|
| `POSTGRES_PASSWORD` | Mot de passe de la base (Docker Compose) |
| `DATABASE_URL` | Adresse de la base (sans Docker Compose) |
| `APP_URL` | Adresse publique, en HTTPS |
| `SESSION_HEURES` | Durée d'une session avant déconnexion (12 par défaut) |
| `COOKIE_SECURISE` | `1` en production (cookies réservés à HTTPS) ; `0` seulement pour un essai local |
| `APP_TZ` | Fuseau horaire de la division (`America/Port-au-Prince`) |
| `EXERCICE_DEBUT_MOIS` | Mois où commence l'exercice, de 1 à 12 (10 : octobre, par défaut) |
| `DATE_DEMO` | Démonstration seulement : fige « aujourd'hui ». **Vide en production** |
| `HEURE_DEMO` | Démonstration seulement : fige l'heure (« HH:MM ») pour les heures du rapport. **Vide en production** |
| `IA_FOURNISSEUR` | `aucun`, `openai-compatible` ou `anthropic` |
| `IA_URL`, `IA_CLE`, `IA_MODELE`, `IA_DELAI` | Connexion au fournisseur d'IA (voir plus bas) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_DOMAINE` | Connexion avec le compte Google de la banque (voir plus bas). Sans elles, connexion par mot de passe seulement |
| `AD_URL`, `AD_DOMAINE`, `AD_BASE_DN`, `AD_CA`, `AD_GROUPE`, `AD_LIAISON`, `AD_ESSAIS_MAX`, `AD_FENETRE_MINUTES` | Connexion avec le compte Windows de la banque (Active Directory, voir plus bas) |
| `SMTP_HOTE`, `SMTP_PORT`, `SMTP_TLS`, `SMTP_UTILISATEUR`, `SMTP_MOT_DE_PASSE`, `SMTP_EXPEDITEUR`, `SMTP_CA` | Rappels du vendredi par courriel (voir plus bas). Sans eux, aucun courriel |
| `RAPPELS_INTERVALLE_MINUTES` | Fréquence de la tournée des rappels (5 minutes par défaut) |

### Mise à jour

```bash
git pull
docker compose up -d --build     # les migrations s'appliquent au démarrage
```

Mise à jour vers les modèles de rapport (migration `0002`) : les rapports déjà envoyés gardent leurs quatre parties ; le modèle par défaut « Rapport du vendredi » est créé au premier besoin avec ces quatre parties. Rien n'est perdu.

Migration `0010` (rapport reconduit, « Lu par », « Répondre ») : ajouts seulement (colonnes des lignes de rapport, du rapport, table des échanges, deux index uniques partiels). Rien n'est perdu.

Migration `0003` (rapports ponctuels, heures du rapport, pièces jointes) : ajouts seulement. Les pièces jointes sont stockées dans la base (elles sont donc dans la sauvegarde) ; si un proxy inverse précède l'application, lui permettre des requêtes de 12 Mo (`client_max_body_size 12m` pour nginx).

### Sauvegardes

La base contient tout (personnes, tâches, rapports, historique des projets, journal). Exemple de sauvegarde quotidienne :

```bash
docker compose exec -T base pg_dump -U dpo -Fc dpo > sauvegarde-dpo-$(date +%F).dump
```

Restauration dans une base vide :

```bash
docker compose exec -T base pg_restore -U dpo -d dpo --clean --if-exists < sauvegarde-dpo-AAAA-MM-JJ.dump
```

Conserver les sauvegardes hors du serveur, et tester une restauration au moins une fois avant la mise en service.

---

## Sécurité

- Mots de passe hachés avec Argon2id ; 12 caractères minimum, avec au moins une lettre et un chiffre.
- Blocage de 15 minutes après 5 essais manqués.
- Sessions stockées en base sous forme d'empreinte ; cookie `httpOnly`, `SameSite=Lax`, réservé à HTTPS.
- Désactiver une personne ferme immédiatement ses sessions ; changer son mot de passe déconnecte ses autres appareils.
- On ne rattache une tâche qu'à un projet qu'on a le droit de voir : un projet caché ne s'ouvre pas en s'y confiant une tâche. Une tâche annulée n'ouvre plus le projet.
- La connexion répond dans le même temps que l'adresse existe ou non (on ne peut pas deviner les adresses valides).
- Chaque lecture passe par la couche d'accès (`src/lib/acces.ts`) : une page inaccessible répond « introuvable », sans dire si elle existe.
- En-têtes de sécurité stricts (CSP sans ressource externe, interdiction d'affichage dans un cadre). Polices, logos et scripts sont servis par l'application elle-même.
- Journal des actions sensibles (connexions, changements de rôles, envois, approbations, pièces déposées et téléchargées) dans la table `journal`.
- Pièces jointes : formats de bureau seulement, reconnus à l'extension **et** au contenu ; toujours servies en téléchargement (jamais affichées dans la page), seulement à qui peut lire le champ. Les documents d'un projet suivent les mêmes règles, et ne se téléchargent que pour qui voit le projet (journal : dépôt, téléchargement, retrait).
- « Annuler » après une action de la barre : un jeton gardé au serveur, valable trois minutes, une seule fois, pour la seule personne qui a agi ; l'annulation est refusée si la tâche ou le projet a changé entre-temps.
- Le conteneur tourne avec un utilisateur sans privilèges.
- La recherche et la barre ne proposent que ce que la personne voit déjà (mêmes règles que les pages) ; mettre à jour ou confier une tâche depuis la barre suit les mêmes règles que sa fiche. Chaque action de la barre relit la phrase au serveur et applique ses propres règles : l'aperçu dans la page n'est jamais pris pour acquis. La vérification des créneaux ne montre l'intitulé d'une réunion qu'à qui y participe aussi.
- Après la connexion, l'application ne renvoie que vers quelques pages connues d'elle-même (lien d'un courriel), jamais vers une autre adresse.
- Suivi du pilote : les écrans ouverts sont notés « telle personne, tel écran, tel jour », sans durée ni contenu, et ne s'affichent qu'en nombres.
- Import de l'organisation : administrateurs seulement ; rôles jamais importés ; tout ou rien ; fichier lu sans exécuter ni suivre quoi que ce soit (valeurs des cellules seulement), taille limitée.

**Avant la mise en production** : revue de sécurité selon la politique de la banque, sauvegardes testées, `DATE_DEMO` vide, `COOKIE_SECURISE=1`, aucune donnée de démonstration. Une première revue interne (injections, autorisations, session, pièces jointes, assistant, dépendances) est consignée dans `docs/securite-tests.md` ; elle prépare la revue externe, elle ne la remplace pas.

### Assistant et données

L'assistant est désactivé par défaut (`IA_FOURNISSEUR=aucun`) ; les brouillons de rapport sont alors préparés par des règles simples. Une fois activé, il reçoit **uniquement** ce que la personne connectée a le droit de voir, et seulement quand elle pose une question. La clé reste sur le serveur.

- `openai-compatible` : OpenAI, Azure OpenAI ou un modèle hébergé par la banque (vLLM, Ollama…). `IA_URL` est l'adresse de base de l'API (`…/v1`).
- `anthropic` : API Claude ; `IA_URL` peut rester vide.

Choisir le fournisseur avec la Direction des risques et la conformité : les données des projets quittent le serveur dès qu'un fournisseur externe est utilisé.

### Connexion avec le compte Google de la banque

Le bouton « Continuer avec le compte Google UNIBANK » s'active quand `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` et `GOOGLE_DOMAINE` sont renseignés. Pour l'informatique :

1. Dans la console Google Cloud, sur un projet de l'organisation Google Workspace de la banque : écran de consentement OAuth de type **Interne** (seuls les comptes de la banque), puis un identifiant client OAuth de type **Application Web**.
2. Adresse de redirection autorisée : `<APP_URL>/api/auth/google/retour` (par exemple `https://pilotage.dpo.unibank.local/api/auth/google/retour`). Elle doit correspondre exactement à `APP_URL` : la connexion Google ne fonctionne qu'à cette adresse.
3. Mettre l’identifiant et le secret dans `.env`, avec `GOOGLE_DOMAINE=unibankhaiti.com` (le domaine Workspace de la banque ; plusieurs, séparés par des virgules), puis redémarrer.
4. Le serveur doit pouvoir joindre `accounts.google.com`, `oauth2.googleapis.com` et `www.googleapis.com` en HTTPS.

Ce que l'application vérifie : flux OpenID Connect avec PKCE, état et nonce ; jeton d'identité signé par Google (clés publiées), destiné à cette application, non expiré ; adresse vérifiée ; compte de l'organisation de la banque (revendication `hd` **et** domaine de l'adresse parmi `GOOGLE_DOMAINE`). Un compte Gmail personnel est refusé.

**Aucun compte n'est créé par Google** : la personne doit déjà exister dans *Organisation*, active, avec la même adresse. Une personne hors division ne se connecte avec Google que si son accès est ouvert. La connexion par mot de passe reste possible (personnes hors division sans compte Google, secours) ; un mot de passe provisoire n'est demandé à changer qu'à la connexion par mot de passe. Chaque connexion est notée au journal avec sa méthode.

### Connexion avec le compte Windows de la banque (Active Directory)

Quand `AD_URL`, `AD_DOMAINE` et `AD_BASE_DN` sont renseignés, la page de connexion propose d'abord « Compte Windows » : la personne tape son identifiant Windows (`jdupont`, `UNIBANK\jdupont` ou `jdupont@<AD_DOMAINE>`) et le mot de passe de sa session Windows. L'onglet « Mot de passe de l'application » reste disponible (personnes hors division, secours) ; Google aussi, s'il est activé. Pour l'informatique :

1. **LDAPS seulement** : `AD_URL=ldaps://dc1.unibank.local:636,ldaps://dc2.unibank.local:636` (l'application n'utilise jamais LDAP en clair ; une adresse `ldap://` est ignorée). Les contrôleurs sont essayés dans l'ordre.
2. **Certificat** : si l'autorité qui signe les certificats des contrôleurs de domaine est interne à la banque, fournir son certificat (PEM) et l'indiquer dans `AD_CA`. Avec Docker, monter le fichier en lecture seule (exemple commenté dans `docker-compose.yml`). Le certificat est toujours vérifié.
3. **Domaine et base** : `AD_DOMAINE=unibank.local` (suffixe des noms d'utilisateur), `AD_BASE_DN=DC=unibank,DC=local`. Si la banque préfère `UNIBANK\identifiant`, mettre `AD_LIAISON=UNIBANK\{identifiant}`.
4. **Groupe** (recommandé) : créer un groupe AD, par exemple `App-Pilotage-DPO`, et l'indiquer en DN complet dans `AD_GROUPE` ; seuls ses membres (même par des groupes imbriqués) peuvent se connecter.
5. **Verrouillage** : `AD_ESSAIS_MAX` (3 par défaut) met un identifiant en attente `AD_FENETRE_MINUTES` (15 par défaut) après trois échecs ; le garder sous le seuil de verrouillage d'AD, et la fenêtre au moins aussi longue que la sienne, pour que l'application ne verrouille jamais un compte Windows. Chaque essai est compté avant d'interroger l'annuaire : des essais lancés en même temps ne dépassent pas la limite.

Ce que fait l'application : la personne se lie à l'annuaire avec **son propre** identifiant et mot de passe (aucun compte de service n'est stocké) ; le mot de passe n'est ni gardé ni écrit au journal ; un mot de passe vide n'est jamais envoyé (AD accepterait une liaison anonyme) ; l'identifiant est filtré et la recherche construite par la bibliothèque (pas d'injection LDAP) ; un compte désactivé, verrouillé ou au mot de passe expiré est refusé avec un message clair ; un identifiant inconnu et un mauvais mot de passe ont la même réponse.

**La connexion ne crée aucun compte** : l'adresse du compte AD (`mail`, sinon `userPrincipalName`) doit être celle d'une personne existante et active dans *Organisation* (ajoutée une à une, ou par l'import ci-dessous). Une personne hors division ne se connecte ainsi que si son accès est ouvert. Le mot de passe provisoire de l'application n'est demandé qu'à la connexion par mot de passe.

### Rappels du vendredi par courriel

Quand `SMTP_HOTE`, `SMTP_EXPEDITEUR` et `APP_URL` sont renseignés, chaque personne qui rédige un rapport reçoit au plus deux courriels par semaine : « votre rapport est prêt à relire » à l'heure prévue par son modèle de rapport, puis un rappel à l'heure de rappel si le rapport n'est pas parti. Rien la nuit (entre 20 h et 7 h, le courriel attend le matin) ; rien si le rapport est parti ; un modèle sans heure de rappel n'envoie que le premier. Le courriel ne contient **rien du rapport** : un lien vers la page du rapport (après la connexion, si besoin).

Pour l'informatique :

1. Un relais SMTP de la banque (Exchange, Microsoft 365, Google Workspace) et une adresse d'expédition, par exemple `SMTP_EXPEDITEUR=Pilotage des projets <pilotage@unibankhaiti.com>`.
2. `SMTP_TLS=starttls` (par défaut, port 587 : passage obligatoire en TLS), `implicite` (port 465), ou `aucun` pour un relais interne sans compte. Un mot de passe ne passe jamais en clair : avec `SMTP_UTILISATEUR`, le TLS est obligatoire. TLS 1.2 au moins ; le certificat du serveur est toujours vérifié (`SMTP_CA` pour une autorité interne).
3. Rien d'autre à installer : la tournée tourne dans l'application, toutes les cinq minutes. Chaque envoi est réservé en base (table `envois_courriel`) : un courriel ne part qu'une fois, même avec plusieurs copies de l'application. Un envoi manqué est retenté vingt minutes plus tard ; le *Suivi du pilote* montre les envois et les erreurs de la semaine.

### Importer l'organisation (administrateurs)

*Organisation › Importer* ajoute les personnes qui manquent et met à jour poste, équipe (créée si besoin) et supérieur. On voit d'abord ce qui changerait (ajouts, avant → après, équipes créées), puis on importe. Les rôles (directeur, exécutif, administrateur) ne s'importent jamais ; personne n'est désactivé ni supprimé ; une personne absente du fichier reste telle quelle.

- **Excel ou CSV** : partir du modèle (*Télécharger le modèle Excel*), qui contient déjà l'organisation actuelle : une ligne par personne, reconnue par son courriel ; une case vide ne change rien. Le moindre problème (adresse illisible, doublon, supérieur introuvable, boucle de supérieurs…) est signalé avec son numéro de ligne, et rien n'est importé tant qu'il reste. CSV d'Excel en français accepté (point-virgule).
- **Active Directory** (si la connexion Windows est configurée) : l'administrateur lit l'annuaire avec son propre compte Windows (rien n'est gardé) ; on lit les comptes actifs du groupe `AD_GROUPE` (groupes imbriqués compris), ou d'une unité d'organisation indiquée sous `AD_BASE_DN` ; poste (`title`), service (`department`, facultatif) et supérieur (`manager`). Les comptes qu'on ne peut pas importer (personne hors division, nom manquant…) sont laissés de côté et listés. Le résultat se télécharge aussi en Excel, pour le retoucher avant de l'importer.
- Les personnes ajoutées n'ont pas de mot de passe : elles se connectent avec leur compte Google ou Windows de la banque ; sinon, un administrateur leur donne un mot de passe provisoire depuis leur fiche.

---

## Essai sur un poste (sans Docker ni PostgreSQL)

Pour essayer l'application sur un ordinateur, avec les données de démonstration :

- **Mac** : double-cliquer sur `lancer-sur-mac.command` dans le Finder. La première fois, il installe Node.js 22 si besoin (via nvm s'il est présent, sinon une copie rangée dans le dossier), les dépendances et une base PostgreSQL embarquée, compile l'application (quelques minutes) puis l'ouvre dans le navigateur. Les fois suivantes, il démarre en quelques secondes.
- **Sur le téléphone** : double-cliquer plutôt sur `lancer-sur-mac-telephone.command`. L'application s'ouvre aussi aux appareils du même Wi-Fi, et la fenêtre affiche l'adresse à taper sur le téléphone (par exemple `http://192.168.1.23:3000`). Le Mac peut demander d'autoriser les connexions entrantes pour « node ». Tant que la fenêtre est ouverte, toute personne sur ce Wi-Fi peut ouvrir la page de connexion : à faire chez soi, pas sur un Wi-Fi partagé. Une seule fenêtre à la fois : fermer d'abord l'autre.
- **Autre système**, avec Node.js 22 : `npm ci` puis `npm run local` (ou `npm run local -- --reseau` pour le téléphone).

Tout reste dans le dossier `.local/` du projet : la base, le journal du lancement (`.local/lancement.log`). Ctrl+C dans la fenêtre arrête l'application et la base. Pour repartir de données neuves : supprimer `.local/postgres` et relancer. L'application vit à la date du jour (les données de démonstration sont créées autour de la semaine en cours) ; `npm run local -- --date-demo` fige la date au vendredi 30 octobre 2026. Pour essayer l'assistant, mettre les paramètres `IA_…` dans un fichier `.env.local`.

## Démonstration

Sur une base **vide** et jamais en production :

```bash
DATE_DEMO=2026-10-30 node scripts/semer.mjs
node scripts/semer-historique.mjs   # facultatif : un an d'activité passée (bilan sur 6 mois ou un exercice), des reports de la fin des projets et la charge prévue de chaque semaine
```

Le lanceur du Mac ajoute cet historique tout seul, une fois. Le script ne touche qu'une base de démonstration (adresses `@demo.dpo.local`) et n'est pas copié dans l'image Docker.

Personnes fictives (mot de passe commun `Demo-DPO-2026`) :

| Adresse | Rôles |
|---|---|
| `daphnee.joseph@demo.dpo.local` | Chargée de projets |
| `marc-antoine.louis@demo.dpo.local` | Directeur (sa direction : Solutions technologiques) ; son rapport reprend celui de son équipe |
| `nadege.augustin@demo.dpo.local` | Directrice de la division et administratrice |
| `frantz.desrosiers@demo.dpo.local` | Exécutif et administrateur |
| `jean-robert.noel@demo.dpo.local` | Analyste et administrateur (modèles de rapport) |
| `wesner.bazile@demo.dpo.local` | Référent DPO du projet « Ouverture de compte en ligne » (Division Réseau et succursales) |
| `nathalie.celestin@demo.dpo.local` | Consultante hors division (Cabinet Atlas Conseil), avec un accès limité |

---

## Développement

```bash
npm ci
cp .env.example .env          # DATABASE_URL vers une base locale, COOKIE_SECURISE=0, DATE_DEMO=2026-10-30
npm run db:migrate && npm run db:seed
npm run dev                   # http://localhost:3000
npm run typecheck
TEST_DATABASE_URL=postgres://dpo:dpo@localhost:5432/dpo_test npm test
```

Les tests de règles tournent sans base. Les tests d'accès vident puis remplissent la base `TEST_DATABASE_URL` : ne jamais la faire pointer vers une base réelle.

Connexion Windows : les tests contre un annuaire en LDAPS ne tournent que si `AD_TEST_URL` est renseigné, avec l'annuaire factice de `scripts/essai/annuaire-factice.mjs` (préparation en tête du fichier) : `AD_TEST_URL=ldaps://127.0.0.1:6360 AD_TEST_CA=…/ac.pem AD_TEST_AUTRE_CA=…/autre-ac.pem npm test`. Connexion Google : `scripts/essai/google-factice.mjs` permet d'essayer le parcours complet sans Google.

Après une modification de `src/db/schema.ts` : `npm run db:generate`, puis vérifier la migration produite dans `drizzle/`.

### Organisation du code

```
src/app/(app)/      écrans (une page par route), avec leurs actions serveur
src/app/api/        assistant, export Word du rapport au conseil, santé
src/components/     navigation, assistant, cases à cocher, thème ; Courbes.tsx, Colonnes.tsx, Graphiques.tsx : graphiques
src/db/             schéma de la base (Drizzle)
src/lib/regles.ts   qui voit quoi (sans base, testé)
src/lib/acces.ts    couche d'accès utilisée par toutes les pages
src/lib/charge.ts   calcul de la charge de travail (sans base, testé)
src/lib/modeles.ts  modèles de rapport : champs, validation, dépliage, visibilité (sans base, testé)
src/lib/projets.ts  gestion des projets et des tâches : qui assigne, gère, décide ; supprimer ou archiver (sans base, testé)
src/lib/bilan.ts    bilan d'activité par période (sans base, testé)
src/lib/donnees/    lectures et écritures par domaine (graphiques.ts, reports-fin.ts : données des graphiques)
src/lib/ia.ts       connecteur d'IA interchangeable
src/lib/auth/       session, mots de passe, connexion Google et Windows (google-regles.ts, ad-regles.ts : sans base, testés)
scripts/essai/      fournisseur Google et annuaire AD factices, pour les essais seulement (exclus de l'image Docker)
scripts/            migration, création d'utilisateur, données de démonstration (semer.mjs, exclu de l'image Docker)
drizzle/            migrations SQL
```

Pile : Next.js 16, React 19, TypeScript, PostgreSQL, Drizzle ORM, Argon2, jose (jetons Google), ldapts (Active Directory), docx.
