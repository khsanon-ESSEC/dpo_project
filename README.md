# Pilotage des projets — Division des Projets Organisationnels

Application web de suivi des projets de la DPO (UNIBANK) :

- **Ma semaine** : les tâches de chacun, cochées au fil de la semaine. Un clic sur un jour de la frise montre ce qui s'est passé ce jour-là (tâches, échéances, réunions) ; les flèches remontent aux semaines précédentes.
- **Réunions** : chacun note les réunions auxquelles il a participé (sujet, jour, heure, durée, projet, participants, notes). Une seule personne la note : elle compte pour chaque participant, qui est prévenu et peut s'en retirer. Le temps en réunion apparaît dans sa semaine, dans son rapport du vendredi (pour son supérieur direct), dans la charge (il réduit le temps disponible) et dans le bilan.
- **Mon bilan** : la semaine comparée à la précédente, et les huit dernières semaines (tâches terminées, heures livrées, terminées à temps, temps en réunion, rapport envoyé).
- **Rapport de la semaine** : un formulaire configuré par les administrateurs (modèles de rapport), préparé à partir des tâches, relu et envoyé au supérieur. Chaque chef de projet reçoit les lignes et les feux de son projet. Ce qui était prévu la semaine précédente se reprend en un clic (fait, en cours, reporté).
- **Rapport de chef** : le chef d'équipe et le directeur gardent leur propre rapport (« Mon travail »), suivi d'une partie préremplie à partir des rapports qu'ils reçoivent (« Mon équipe », « Ma division ») : à décider, synthèse par projet, santé des projets, charge, fait, la semaine prochaine. Un seul envoi. Les exécutifs ne rédigent pas de rapport : ils lisent ceux de tout le monde.
- **Heures du rapport** : chaque modèle fixe quand le rapport est prêt à relire (le brouillon est alors complété avec les tâches de la semaine), quand un rappel part, et l'heure limite ; le chef apprend ensuite quels rapports manquent.
- **Pièces jointes** dans le rapport (PDF, images, Word, Excel, PowerPoint, CSV, texte ; 10 Mo par fichier), lues selon la règle du champ.
- **Modèles de rapport** (administrateurs) : champs à choisir ou à glisser, ordre, propriétés de chaque champ, affectation aux équipes et aux personnes, versions.
- **Mes rapports** : tous les rapports déjà envoyés, semaine par semaine, avec passage d'une semaine à l'autre.
- **Mon équipe** : qui a envoyé son rapport, les blocages, les retards, le temps en réunion de la semaine, avec relance ; un directeur ou un exécutif y voit toute la structure sous lui, regroupée par équipe ; l'historique des rapports de l'équipe (par semaine ou par personne) ; la charge de travail ; le **bilan de l'équipe**, mois contre mois, personne par personne (les exécutifs le voient pour toute la banque).
- **Projets** : portefeuille, fiches projet, indicateurs vérifiables, glissement des dates. Chacun peut **proposer un projet** ; un directeur ou un exécutif l'accepte (en nommant le chef de projet) ou la refuse avec un motif. Le chef de projet établit l'**équipe du projet** et modifie la fiche (titre, code, dates, statut, indicateurs). Un projet qui a une histoire s'**archive** ; seul un projet vide (une erreur) se supprime.
- **Tâches** : créer, renommer, préciser, changer de projet, **confier** à quelqu'un (à soi-même, aux personnes qu'on suit, et, sur un projet qu'on dirige, aux membres de son équipe projet) ; les deux personnes sont prévenues. Une tâche commencée s'**annule** avec un motif (et se rétablit) ; seule une tâche sans histoire se supprime.
- **Noms cliquables** : partout, le nom d'une personne ouvre sa fiche (poste, équipe, supérieur, projets), le nom d'un projet ouvre le projet, quand on a le droit de le voir.
- **Rapports au conseil** : le rapport mensuel des projets stratégiques, au format du tableau Word de la banque (avec le logo) ; et des **rapports ponctuels**, faits à tout moment pour une demande ou un événement imprévu : un titre, la demande, les projets choisis, la période couverte. Un exécutif les approuve ; ils ne changent pas les dates du rapport mensuel.
- **Vues d'un projet** : vue d'ensemble, liste, tableau (colonnes par état, avec glisser-déposer), Gantt (jours, semaines ou mois), calendrier des échéances, charge de l'équipe du projet. Le portefeuille a aussi une chronologie de tous les projets.
- **Charge de travail** : les heures de tâches prévues pour chaque personne, semaine par semaine, comparées à ses heures disponibles ; repère qui est chargé ou surchargé, et l'indique au moment de confier une tâche.
- **Organisation** : personnes, équipes, supérieurs, rôles et heures disponibles par semaine.
- **Assistant** (facultatif) : un bouton flottant sur chaque écran, branché sur le fournisseur d'IA choisi par la banque.

Application multipage (chaque écran est une page rendue par le serveur), en français, avec thème clair et sombre. Elle fonctionne sur ordinateur et sur téléphone. Sur téléphone, la barre du bas a quatre entrées (Semaine, Rapport, Équipe ou Projets, Plus) ; « Plus » mène à tout le reste.

---

## Qui voit quoi

| Rôle | Comment on l'obtient | Ce qu'il voit |
|---|---|---|
| Chacun | — | Ses tâches, son rapport de la semaine, ses réunions, son bilan, les projets sur lesquels il travaille (dont ceux de son équipe projet) ; la fiche de chacun (poste, équipe, supérieur, projets visibles) |
| Supérieur (chef d'équipe) | Automatique : des personnes lui envoient leur rapport | Les tâches et les rapports de ses subordonnés directs |
| Chef de projet | Automatique : désigné sur la fiche projet | Tout son projet, qu'il gère (fiche, indicateurs, équipe projet, archivage) ; dans les rapports de la semaine, **seulement** les lignes et les feux de son projet, dans les champs ouverts à tous |
| Directeur | Interrupteur dans *Organisation* | Les projets, tâches et rapports des membres de **sa direction** (toutes les personnes placées sous lui, à tous les niveaux) ; décide des demandes de projet qu'il voit ; les projets stratégiques de sa direction dans le rapport au conseil |
| Exécutif | Interrupteur dans *Organisation* (seul un exécutif peut le donner) | **Tout** ; approuve les rapports au conseil. Ne rédige pas de rapport de la semaine |
| Administrateur | Interrupteur dans *Organisation* | Gère les personnes, les équipes, les supérieurs, les accès et les **modèles de rapport**. Ne donne **aucun** accès supplémentaire aux rapports ni aux tâches |

Les rôles se cumulent. Chaque personne a **un seul** supérieur. Si le poste de responsable d'une équipe est vacant, les rapports remontent au niveau suivant. Un brouillon de rapport n'est visible que par son auteur. Il reste toujours au moins un administrateur.

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

## Bilan : ce qu'il mesure

- **Tâches terminées** et **heures livrées** : les tâches marquées faites dans la période, avec leur temps estimé (4 heures pour une tâche sans estimation).
- **Terminées à temps** : parmi les tâches terminées qui avaient une échéance, la part terminée au plus tard ce jour-là.
- **En réunion** et **part du temps** : les réunions notées, rapportées aux heures disponibles de la période (jusqu'à aujourd'hui pour la période en cours).
- **Rapports** : les rapports du vendredi envoyés, sur ceux attendus (une semaine compte à partir de son vendredi ; rien n'est attendu d'un exécutif).
- L'employé compare **semaine contre semaine** (*Semaine → Mon bilan*) ; le chef d'équipe, le directeur et l'exécutif comparent leur équipe **mois contre mois** (*Équipe → Bilan*), et ouvrent le détail par semaine de chaque personne.

Ces chiffres décrivent ce qui est enregistré dans l'application ; ils ne mesurent ni la qualité du travail ni ce qui n'est pas noté. L'écran le rappelle. Règles : `src/lib/bilan.ts`, testées.

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
| `DATE_DEMO` | Démonstration seulement : fige « aujourd'hui ». **Vide en production** |
| `HEURE_DEMO` | Démonstration seulement : fige l'heure (« HH:MM ») pour les heures du rapport. **Vide en production** |
| `IA_FOURNISSEUR` | `aucun`, `openai-compatible` ou `anthropic` |
| `IA_URL`, `IA_CLE`, `IA_MODELE`, `IA_DELAI` | Connexion au fournisseur d'IA (voir plus bas) |

### Mise à jour

```bash
git pull
docker compose up -d --build     # les migrations s'appliquent au démarrage
```

Mise à jour vers les modèles de rapport (migration `0002`) : les rapports déjà envoyés gardent leurs quatre parties ; le modèle par défaut « Rapport du vendredi » est créé au premier besoin avec ces quatre parties. Rien n'est perdu.

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
- Désactiver une personne ferme immédiatement ses sessions.
- Chaque lecture passe par la couche d'accès (`src/lib/acces.ts`) : une page inaccessible répond « introuvable », sans dire si elle existe.
- En-têtes de sécurité stricts (CSP sans ressource externe, interdiction d'affichage dans un cadre). Polices, logos et scripts sont servis par l'application elle-même.
- Journal des actions sensibles (connexions, changements de rôles, envois, approbations, pièces déposées et téléchargées) dans la table `journal`.
- Pièces jointes : formats de bureau seulement, reconnus à l'extension **et** au contenu ; toujours servies en téléchargement (jamais affichées dans la page), seulement à qui peut lire le champ.
- Le conteneur tourne avec un utilisateur sans privilèges.

**Avant la mise en production** : revue de sécurité selon la politique de la banque, sauvegardes testées, `DATE_DEMO` vide, `COOKIE_SECURISE=1`, aucune donnée de démonstration.

### Assistant et données

L'assistant est désactivé par défaut (`IA_FOURNISSEUR=aucun`) ; les brouillons de rapport sont alors préparés par des règles simples. Une fois activé, il reçoit **uniquement** ce que la personne connectée a le droit de voir, et seulement quand elle pose une question. La clé reste sur le serveur.

- `openai-compatible` : OpenAI, Azure OpenAI ou un modèle hébergé par la banque (vLLM, Ollama…). `IA_URL` est l'adresse de base de l'API (`…/v1`).
- `anthropic` : API Claude ; `IA_URL` peut rester vide.

Choisir le fournisseur avec la Direction des risques et la conformité : les données des projets quittent le serveur dès qu'un fournisseur externe est utilisé.

---

## Essai sur un poste (sans Docker ni PostgreSQL)

Pour essayer l'application sur un ordinateur, avec les données de démonstration :

- **Mac** : double-cliquer sur `lancer-sur-mac.command` dans le Finder. La première fois, il installe Node.js 22 si besoin (via nvm s'il est présent, sinon une copie rangée dans le dossier), les dépendances et une base PostgreSQL embarquée, compile l'application (quelques minutes) puis l'ouvre dans le navigateur. Les fois suivantes, il démarre en quelques secondes.
- **Autre système**, avec Node.js 22 : `npm ci` puis `npm run local`.

Tout reste dans le dossier `.local/` du projet : la base, le journal du lancement (`.local/lancement.log`). Ctrl+C dans la fenêtre arrête l'application et la base. Pour repartir de données neuves : supprimer `.local/postgres` et relancer. La date est figée au vendredi 30 octobre 2026 pour que la démonstration ait du sens ; `npm run local -- --vraie-date` utilise la date du jour. Pour essayer l'assistant, mettre les paramètres `IA_…` dans un fichier `.env.local`.

## Démonstration

Sur une base **vide** et jamais en production :

```bash
DATE_DEMO=2026-10-30 node scripts/semer.mjs
```

Personnes fictives (mot de passe commun `Demo-DPO-2026`) :

| Adresse | Rôles |
|---|---|
| `daphnee.joseph@demo.dpo.local` | Chargée de projets |
| `marc-antoine.louis@demo.dpo.local` | Directeur (sa direction : Solutions technologiques) ; son rapport reprend celui de son équipe |
| `nadege.augustin@demo.dpo.local` | Directrice de la division et administratrice |
| `frantz.desrosiers@demo.dpo.local` | Exécutif et administrateur |
| `jean-robert.noel@demo.dpo.local` | Analyste et administrateur (modèles de rapport) |

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

Après une modification de `src/db/schema.ts` : `npm run db:generate`, puis vérifier la migration produite dans `drizzle/`.

### Organisation du code

```
src/app/(app)/      écrans (une page par route), avec leurs actions serveur
src/app/api/        assistant, export Word du rapport au conseil, santé
src/components/     navigation, assistant, cases à cocher, thème
src/db/             schéma de la base (Drizzle)
src/lib/regles.ts   qui voit quoi (sans base, testé)
src/lib/acces.ts    couche d'accès utilisée par toutes les pages
src/lib/charge.ts   calcul de la charge de travail (sans base, testé)
src/lib/modeles.ts  modèles de rapport : champs, validation, dépliage, visibilité (sans base, testé)
src/lib/projets.ts  gestion des projets et des tâches : qui assigne, gère, décide ; supprimer ou archiver (sans base, testé)
src/lib/bilan.ts    bilan d'activité par période (sans base, testé)
src/lib/donnees/    lectures et écritures par domaine
src/lib/ia.ts       connecteur d'IA interchangeable
scripts/            migration, création d'utilisateur, données de démonstration
drizzle/            migrations SQL
```

Pile : Next.js 16, React 19, TypeScript, PostgreSQL, Drizzle ORM, Argon2, docx.

### Prévu

- Connexion avec le compte Google de la banque (le bouton est déjà en place, désactivé).
