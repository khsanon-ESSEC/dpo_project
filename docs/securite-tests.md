# Revue de sécurité — Pilotage des projets DPO

Revue menée le 27 octobre 2026 sur la version compilée, lancée en local (base de démonstration), avant la mise en production, en deux passes (la seconde complète et corrige la première, voir « Seconde passe »). Elle **ne remplace pas** la revue externe prévue avec le service de sécurité de la banque (Mandiant) ; elle la prépare.

## Méthode

- **Lecture du code** : toutes les actions serveur (13 fichiers `"use server"`) et toutes les routes d'API (`src/app/api/**`), la couche d'accès (`src/lib/acces.ts`, `regles.ts`, `projets.ts`), la session (`src/lib/auth/session.ts`), les pièces jointes et le connecteur d'IA. Une revue indépendante des autorisations a été menée en parallèle.
- **Analyse des dépendances** : `npm audit`, recherche de secrets dans le dépôt et dans tout l'historique Git.
- **Vérifications fonctionnelles** : la suite de tests (142 après la seconde passe, dont `tests/securite-base.test.ts`) et les trois parcours de bout en bout (gestion, réunions, personnes hors division ; ordinateur et téléphone), qui confirment qu'aucune correction n'a cassé un usage légitime.

Chaque constat est marqué **[vérifié]** (observé directement) ou **[déduction]** (raisonné sur le code, sans exécution dédiée).

## Résultat global

Première passe : un défaut d'autorisation important corrigé, deux points plus faibles renforcés, une dépendance critique mise à jour. Seconde passe : deux défauts sur les rapports ponctuels au conseil, un accès trop large des personnes hors division, une règle des directeurs resserrée et quatre points mineurs, tous corrigés. Après correction, la suite de tests et les parcours passent, et `npm audit` ne signale **aucune** vulnérabilité dans les dépendances de production.

## Corrections apportées

### 1. [Élevé, corrigé] Se confier une tâche sur un projet caché en ouvrait la lecture

**[vérifié]** N'importe quelle personne connectée pouvait se confier une tâche sur **n'importe quel projet** dont elle connaissait l'identifiant, même un projet d'une autre division qu'elle n'avait pas le droit de voir. La tâche la faisait entrer dans l'équipe du projet (`entrerDansLEquipe`), ce qui lui ouvrait ensuite la vue d'ensemble, toutes les tâches, l'équipe, le Gantt et le calendrier du projet. La vérification « à qui puis-je confier une tâche » (`peutAssigner`) répondait « oui » dès qu'on se la confiait à soi-même, sans regarder si l'on avait accès au projet.

**Correction** : avant de rattacher une tâche à un projet, on vérifie désormais que le projet fait partie de ceux que la personne voit déjà (qu'elle le dirige, en est membre, ou relève de sa direction) — le même contrôle que pour les réunions. `src/lib/donnees/gestion.ts` (`creerTacheGeree`, `modifierDefinitionTache`, `projetAccessible`). Un test le verrouille (`tests/externes-base.test.ts`).

### 2. [Faible, corrigé] Étiqueter une ligne de rapport avec le projet d'un autre

**[vérifié]** Une ligne du rapport du vendredi pouvait être étiquetée avec l'identifiant de **n'importe quel** projet, sans vérification. Le chef de ce projet aurait vu cette ligne attribuée à son projet dans sa vue de rapports. Écriture seulement (aucune lecture de données d'autrui), d'où la faible gravité.

**Correction** : l'étiquette de projet d'une ligne est limitée aux projets que l'auteur voit déjà ; sinon la ligne reste sans projet. `src/app/(app)/rapport/actions.ts` (`projetDeLigne`, `changerProjetLigne`, `ajouterLigne`).

### 3. [Modéré, corrigé] Changer son mot de passe ne déconnectait pas les autres appareils

**[vérifié]** Après un changement de mot de passe, les autres sessions ouvertes restaient valides jusqu'à 12 h. En cas de doute sur un appareil ou un vol d'identifiants, changer le mot de passe ne suffisait pas à reprendre la main.

**Correction** : un changement de mot de passe ferme désormais toutes les autres sessions de la personne (l'appareil courant reste connecté). `src/lib/auth/session.ts` (`fermerAutresSessions`), appelé par `src/app/mot-de-passe/actions.ts`. **[vérifié]** en ouvrant deux sessions : après le changement, la seconde est déconnectée.

### 4. [Critique côté bibliothèque, corrigé] Next.js mis à jour

**[vérifié]** `npm audit` signalait trois alertes critiques sur Next.js 16.3.8 (optimisation d'images, actions serveur, `use cache`). Passé à **16.4.3**. Après mise à jour : **aucune vulnérabilité** dans les dépendances de production.

## Points vérifiés conformes

- **[vérifié] Injection SQL** : toutes les requêtes passent par Drizzle (paramétrées). Aucun `sql.raw`, `.unsafe(`, ni concaténation de chaîne dans une requête. Les rares `sql\`…\`` n'utilisent que des noms de colonnes et `now()` / `select 1`, sans donnée saisie.
- **[vérifié] XSS** : rendu par React (échappement par défaut), aucun `dangerouslySetInnerHTML` ni `innerHTML`. Les réponses de l'assistant sont affichées comme texte.
- **[déduction] CSRF** : actions serveur Next.js (contrôle d'origine intégré), cookie `SameSite=Lax`, CSP `form-action 'self'`.
- **[vérifié] Autorisations** : chaque action et chaque route appelle `exigerUtilisateur()` puis vérifie l'objet visé (tâche, projet, rapport, réunion, pièce) via `src/lib/acces.ts`. Une ressource interdite répond « introuvable » sans révéler son existence. L'approbation d'un rapport au conseil exige le rôle exécutif ; seul un exécutif accorde le rôle exécutif ; un administrateur n'obtient aucun accès supplémentaire aux rapports. *Rectification* : la première version de ce rapport affirmait ce point sans réserve ; deux actions des rapports ponctuels au conseil ne vérifiaient pas l'auteur du rapport (voir la seconde passe, point 5).
- **[vérifié] Personnes hors division** : sans accès, aucune session ni alerte ; avec un accès limité, la consultante ne voit que ses tâches et ses projets — ni rapport, ni équipe, ni charge (confirmé par le parcours).
- **[vérifié] Mots de passe et connexion** : Argon2id, 12 caractères minimum, blocage 15 min après 5 échecs ; jeton de session stocké en empreinte SHA-256, cookie `httpOnly` / `SameSite=Lax` / `secure`.
- **[vérifié] Pièces jointes** : formats de bureau seulement, reconnus à l'extension **et** à la signature du fichier ; 10 Mo max ; servies en téléchargement (`Content-Disposition: attachment`, CSP `sandbox`, `nosniff`), jamais affichées ; lisibles seulement par qui peut lire le champ. Stockées en base (pas de chemin de fichier → pas de traversée de répertoire).
- **[vérifié] Redirections** : `retourValide` n'autorise qu'une liste de pages internes ; aucune redirection vers une adresse fournie par l'utilisateur.
- **[vérifié] Assistant d'IA** : désactivé par défaut ; une fois activé, il ne reçoit que ce que la personne a le droit de voir (mêmes filtres d'accès), seulement sur question ; la consigne précise que le contenu des données est une information, jamais une instruction ; la clé reste sur le serveur (`server-only`), jamais dans le navigateur. Limite de 10 questions/minute/personne.
- **[vérifié] Secrets** : aucune clé d'API dans le dépôt ni dans l'historique Git. Les fichiers `.env*` sont ignorés (sauf `.env.example`). La clé du prototype (Gemini) n'a jamais été versionnée ici.
- **[vérifié] En-têtes** : CSP sans ressource externe, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy` restrictive, `poweredByHeader` désactivé.

## Seconde passe : corrections

### 5. [Modéré, corrigé] Rapports ponctuels au conseil modifiables par un autre directeur

**[vérifié]** Un directeur pouvait réécrire l'état d'avancement d'une ligne, ou la retirer, dans le rapport ponctuel en brouillon d'un autre directeur, dès qu'il voyait le projet concerné : la règle « seul son auteur ou un exécutif » n'était appliquée qu'aux actions sur le rapport lui-même. Le retrait d'une ligne ne vérifiait pas non plus que la ligne appartenait au rapport indiqué.

**Correction** : une seule règle, `peutModifierRapportConseil` (`src/lib/regles.ts`), appliquée à toutes les actions des rapports au conseil et à la page (les formulaires ne s'affichent plus pour qui ne peut pas modifier) ; le retrait vérifie l'appartenance de la ligne. Testé (`tests/regles.test.ts`).

### 6. [Modéré, corrigé] Accès limité des personnes hors division trop large

**[vérifié]** Une consultante avec un accès limité voyait l'annuaire complet de la division (noms, postes, équipes) dans « Avec qui » des réunions, ouvrait la fiche de n'importe qui (avec équipe, supérieur, subordonnés), pouvait proposer un projet, et des pages comme Équipe, Charge ou Rapport ne lui étaient pas explicitement fermées. Chef d'un projet d'une autre division, elle en aurait eu les droits de chef (dont la lecture des lignes des rapports du vendredi), alors que c'est le référent DPO qui gère ce projet.

**Correction** :
- `exigerInterne()` (`src/lib/auth/session.ts`) ferme à une personne hors division Équipe (et ses sous-pages), Charge, Rapport, Mes rapports, la proposition de projet et la vue Charge d'un projet ; le rapport au conseil et l'organisation lui sont aussi fermés, même si on lui donnait un rôle par erreur.
- `contactsVisibles()` (`src/lib/acces.ts`) : elle ne voit et ne choisit que les personnes avec qui elle travaille (chef, référent, équipe et personnes chargées de tâches de ses projets, participants de ses réunions, personnes qui lui ont confié une tâche) ; leurs fiches s'ouvrent sans l'organisation interne.
- Elle ne se confie de tâche qu'à elle-même et ne crée pas de nouvelle fiche hors division (ni par une tâche, ni par une réunion).
- Le chef hors division d'un projet ne le dirige pas dans l'application quand il a un référent : c'est le référent qui le gère et lit les lignes.

Testé (`tests/securite-base.test.ts`) et vérifié dans le parcours (chaque page fermée répond « introuvable »).

### 7. [Règle resserrée] Un directeur ne gère que les projets de sa direction

Un directeur pouvait modifier, archiver ou réorganiser tout projet qu'il voyait, y compris celui d'une autre direction où l'un des siens avait une tâche. Désormais, il gère les projets dont le responsable (le référent DPO, sinon le chef) est dans sa direction ; il continue de **voir** les autres. Les exécutifs gèrent tout. `peutGererProjet` (`src/lib/projets.ts`), testé.

### 8. [Faibles, corrigés] Points mineurs

- **Hiérarchie** : une fiche hors division ne peut plus recevoir de rôle interne, ni être nommée supérieur ou chef d'équipe ; son accès s'ouvre seulement depuis sa fiche « Hors division ».
- **Tâche annulée** : elle n'ouvre plus le projet à son ancien titulaire (avant, retirer quelqu'un de l'équipe ne lui fermait pas le projet s'il y gardait une tâche annulée).
- **Assistant** : il ne crée plus de brouillon de rapport pour une personne qui n'en rédige pas (exécutif, hors division).
- **Connexion** : la réponse prend le même temps que l'adresse existe ou non **[vérifié]** (environ 100 ms dans les deux cas) ; on ne peut plus deviner les adresses valides au chronomètre. Après cinq échecs, le message de blocage reste propre aux comptes existants : compromis volontaire pour l'utilisateur.
- **Image Docker** : **[vérifié]** le dossier `.local` (base de l'essai local) en était déjà exclu par `.dockerignore` ; rien à corriger.

## Connexion avec le compte Google de la banque (ajoutée le 27 octobre 2026)

Construite après la revue, avec les mêmes exigences. `src/lib/auth/google.ts`, `src/lib/auth/google-regles.ts`, `src/app/api/auth/google/`.

- **Protocole** : OpenID Connect, flux « code » avec PKCE (S256), `state` et `nonce` aléatoires gardés dans un cookie temporaire (`httpOnly`, 10 minutes, effacé au retour). L'adresse de retour vient d'`APP_URL`, jamais de l'en-tête Host.
- **Jeton d'identité** : signature vérifiée avec les clés publiées par Google (bibliothèque `jose`), émetteur, destinataire (notre identifiant client), expiration, `nonce`, adresse vérifiée par Google. Le compte doit appartenir à l'organisation de la banque : la revendication `hd` **et** le domaine de l'adresse doivent être parmi `GOOGLE_DOMAINE` ; un compte Gmail personnel est refusé.
- **Comptes** : aucun compte n'est créé ; la personne doit exister, être active et, si elle est hors division, avoir un accès ouvert. Chaque connexion et chaque refus sont notés au journal avec la méthode.
- **Messages** : la page de connexion n'affiche que des messages connus, choisis par un code (rien du texte de l'adresse n'est repris).
- **[vérifié]** contre un fournisseur OpenID factice local (même protocole, jetons signés RS256) : connexion d'un compte inscrit ; refus d'un compte personnel, d'un compte de la banque non inscrit, d'une personne hors division sans accès, d'un `state` falsifié, d'un retour sans début ; annulation ; pas de détour par le mot de passe provisoire après Google ; 8 tests unitaires des exigences sur le jeton (`tests/google.test.ts`).
- **[à vérifier]** avec le vrai client OAuth de la banque, une fois créé par l'informatique : l'essai ci-dessus n'a pas pu passer par les serveurs de Google.

## Connexion avec le compte Windows de la banque (Active Directory, ajoutée le 27 octobre 2026)

`src/lib/auth/ad.ts`, `src/lib/auth/ad-regles.ts`, action `seConnecterAD` (`src/app/connexion/actions.ts`).

- **Transport** : LDAPS seulement (une adresse `ldap://` est ignorée), certificat du serveur vérifié (autorité de la banque dans `AD_CA`), TLS 1.2 au moins, délais de connexion et de réponse bornés, plusieurs contrôleurs essayés dans l'ordre.
- **Liaison** : la personne se lie avec son propre identifiant ; aucun compte de service n'est stocké ; le mot de passe n'est ni gardé ni journalisé.
- **Liaison anonyme** : un mot de passe vide n'est **jamais** envoyé. Active Directory accepte une liaison sans mot de passe comme anonyme ; sans ce garde-fou, n'importe qui ouvrirait n'importe quel compte.
- **Injection LDAP** : l'identifiant est limité à lettres, chiffres, point et tirets ; le filtre de recherche est construit par la bibliothèque (`ldapts`), jamais par concaténation.
- **Refus** : identifiant inconnu et mauvais mot de passe ont la même réponse ; compte désactivé, verrouillé, expiré ou au mot de passe à changer : message clair, à partir du code de diagnostic d'AD ; groupe AD facultatif (`AD_GROUPE`, groupes imbriqués acceptés).
- **Verrouillage** : trois échecs par identifiant mettent cet identifiant en attente 15 minutes (`AD_ESSAIS_MAX`), sous le seuil de verrouillage d'AD : l'application ne peut pas servir à verrouiller des comptes Windows. Le compteur est en mémoire (un seul serveur d'application).
- **Comptes** : aucun compte créé ; l'adresse AD doit être celle d'une personne existante et active ; hors division seulement avec un accès ouvert. Connexions et refus au journal, avec la méthode et l'identifiant (jamais le mot de passe).
- **[vérifié]** 9 tests unitaires (`tests/ad.test.ts`) et 11 tests d'intégration contre un annuaire factice en LDAPS (`tests/ad-annuaire.test.ts`, `scripts/essai/annuaire-factice.mjs`) : connexion sous les trois formes d'identifiant ; mauvais mot de passe ; mot de passe vide jamais transmis (l'annuaire factice, comme AD, l'aurait accepté) ; compte désactivé ; mot de passe expiré ; groupe exigé ; UPN sans adresse ; limite d'essais ; bascule vers le second contrôleur ; **certificat d'une autre autorité refusé**, et sans autorité configurée ; LDAP en clair ignoré ; saisie d'injection rejetée sans rien envoyer. Parcours de bout en bout (17 vérifications, ordinateur et téléphone).
- **[à vérifier]** avec l'annuaire réel de la banque : l'annuaire factice se lie par DN (`AD_LIAISON`), alors que la configuration par défaut se lie par UPN, comme Active Directory l'accepte ; la recherche par groupes imbriqués (`LDAP_MATCHING_RULE_IN_CHAIN`) n'existe que dans AD.

## Barre, recherche, rappels par courriel, import, suivi du pilote (ajoutés le 28 octobre 2026)

Construits après la revue, avec les mêmes règles. Vérifiés par lecture du code, tests unitaires et d'intégration, et parcours dans le navigateur ; pas de requêtes forgées.

- **Recherche** (`/api/recherche`, `src/lib/donnees/recherche.ts`) : projets, tâches et personnes filtrés par la couche d'accès (`idsProjetsVisibles`, `peutVoirTache`) ; une personne hors division ne trouve que ses contacts. **[vérifié]** Une cheffe d'équipe qui ne voit pas un projet ne le trouve ni en direct ni sur la page de résultats.
- **Barre** : la saisie est toujours relue par le serveur (l'aperçu n'est qu'une aide). Ajouter une tâche : projets visibles seulement, règle d'assignation de `creerTacheGeree`. Mettre une tâche à jour (`mettreAJourTacheRapide`) : `peutModifierTache`, comme la fiche ; la confier ou la changer de projet passe par `modifierDefinitionTache` (règle d'assignation, projet ouvert et visible) ; tâche annulée refusée. Noter une réunion (`noterReunionRapide`) : `noterReunion`, comme la page Réunions ; hors division, participants limités à ses contacts. **[vérifié]** 18 tests de l'analyse de la saisie ; 58 vérifications de parcours (`#` ne propose pas les tâches d'autrui à une personne hors division ; refus affichés).
- **Retour après connexion** (`suite`, lien d'un courriel) : liste fermée de pages de l'application (`suiteValide`), jamais une adresse externe ; gardée dans le cookie temporaire pour Google, revérifiée au retour. **[vérifié]** `suite=https://…` mène à *Ma semaine*.
- **Rappels par courriel** : le courriel ne contient que le prénom, l'heure limite et un lien (rien du rapport) ; prénom échappé dans le HTML ; adresse d'expédition contrôlée (pas de retour à la ligne : pas d'en-tête injecté) ; TLS obligatoire par défaut, certificat vérifié, jamais de mot de passe SMTP sans TLS ; erreur gardée sans l'adresse du destinataire ; un envoi réservé en base avant de partir (pas de double envoi). `nodemailer` 10.1.7 : les avis de sécurité de 10.1.3 et avant (analyse des adresses) sont corrigés. **[vérifié]** 12 tests et un serveur SMTP factice qui exige STARTTLS (7 courriels, aucun doublon après redémarrage).
- **Import de l'organisation** : administrateurs seulement (page, actions et modèle Excel : 404 sinon) ; rôles jamais importés ; personnes hors division et fiches désactivées jamais modifiées ; boucles de supérieurs refusées ; plan recalculé au moment d'appliquer, en une transaction (verrou consultatif : deux imports ne se mélangent pas). Fichier : 2 Mo au plus, taille décompressée annoncée bornée, 3 000 lignes et 30 colonnes au plus ; seules les valeurs des cellules de la première feuille sont lues (ni formules, ni macros, ni liens). Annuaire : l'administrateur se lie avec son compte (même limite d'essais que la connexion) ; unité d'organisation saisie contrôlée (sous `AD_BASE_DN`, sans caractères de filtre) ; filtres construits par la bibliothèque. **[vérifié]** 16 tests (`tests/import-organisation.test.ts`), 3 tests contre l'annuaire factice, parcours Excel, CSV Windows-1252, classeur LibreOffice, `.xls` refusé, téléphone.
- **Suivi du pilote** : administrateurs et exécutifs ; les écrans ouverts sont notés par jour, écran et personne, sans durée ni contenu, et ne s'affichent qu'en nombres. **[déduction]** La table `consultations` reste une donnée personnelle : à mentionner dans l'information aux employés et à purger après le pilote si la banque le demande.
- **[à vérifier]** avec le relais de courriel et l'annuaire réels de la banque.

### Relecture indépendante (28 octobre 2026) et corrections

Une seconde relecture du code, faite sans voir ce travail, n'a trouvé aucun point grave. Points faibles corrigés **[vérifié par tests]** :

- **Import** : la ligne appliquée est celle que le plan a validée, jamais retrouvée par son numéro (des numéros en double, envoyés à la main par un administrateur, auraient pu appliquer une ligne écartée : personne hors division, supérieur hors division, boucle). Numéros en double renumérotés.
- **Annuaire sans groupe** : une unité d'organisation strictement sous la base est exigée (on n'importe jamais tout l'annuaire de la banque).
- **Personne hors division** : elle ne suit qu'elle-même, quels que soient ses rôles (filet de sécurité) ; elle ne voit plus une tâche qu'elle avait créée une fois confiée à quelqu'un d'autre ; la recherche ne compare plus le nom d'équipe de ses contacts (on ne le devinerait pas).
- **Mot de passe provisoire** : désormais exigé partout (pages, actions, routes d'API), pas seulement dans la mise en page : tant qu'il n'est pas changé, seule la page de changement répond.
- **Suivi du pilote** : seuls les écrans connus sont notés (rien d'inventé ne s'affiche).
- **Barre** : une tâche changée de projet et bloquée dans la même saisie prévient le chef du nouveau projet.
- **[déduction] Reste** : la recherche relit les tâches à chaque frappe (avec un délai de 200 ms) ; acceptable à l'échelle de la division, à surveiller si l'application s'étend.

## Barre étendue, barre unique, formulaires en une ligne, documents de projet (ajoutés le 28 octobre 2026)

Ce qui a été ajouté : la barre en haut de toutes les pages (notes pour le rapport, mise à jour d'un projet, questions, écrans, relance, « Annuler »), la vérification des créneaux de réunion, les formulaires écrits comme la barre (ligne du rapport, actions de réunion, fiche d'une tâche, fiche d'un projet, nouvelle tâche), les liens vers les projets partout, les heures de réunion sur la fiche d'un employé, et les **documents d'un projet**.

**[vérifié]** par lecture du code et par les tests (`tests/barre-base.test.ts`, `tests/documents-base.test.ts`) :

- Chaque action de la barre relit la phrase au serveur et vérifie ses droits (projet visible, chef de projet ou sa direction pour un projet, règles d'assignation pour confier, rapport à soi et en brouillon pour une note) ; l'aperçu de la page n'est jamais pris pour acquis.
- Les champs cachés des formulaires en une ligne (projet d'une ligne de rapport, personne d'une action de réunion) sont vérifiés comme l'étaient les listes déroulantes : projet visible, personne à qui l'on peut confier une tâche.
- « Annuler » : jeton gardé au serveur, réservé à son auteur, utilisable une seule fois (mise à jour atomique), trois minutes au plus (horloge de la base) ; les droits sont revérifiés au moment d'annuler.
- Documents : téléchargement seulement pour qui voit le projet du document (pas d'accès d'un projet à l'autre), toujours en pièce à enregistrer (`attachment`, `nosniff`, CSP `sandbox`, `no-store`) ; formats reconnus au contenu ; dépôt réservé à l'équipe du projet, à la personne qui l'a demandé et à ceux qui le gèrent ; journal du dépôt, du téléchargement et du retrait.
- Vérification des créneaux : l'intitulé d'une réunion n'apparaît qu'à qui y participe aussi ; les personnes interrogées sont filtrées au serveur.
- La barre, chargée sur chaque page, ne reçoit que ce que la personne voyait déjà sur ses pages Semaine et Rechercher (pour une personne hors division : ses tâches, ses contacts, ses projets).

### Relecture indépendante (28 octobre 2026, seconde) et corrections

Une relecture du code faite sans voir ce travail n'a trouvé **aucun point grave** (pas d'accès d'un projet à l'autre, pas d'action sans contrôle de droits). Corrigé **[vérifié par tests]** :

- **[Moyen] « Annuler » laissait la personne dans l'équipe du projet** : confier une tâche y fait entrer la personne ; annuler la tâche l'en fait maintenant ressortir, si c'est bien cette action qui l'y avait fait entrer et si rien d'autre ne l'y retient (autre tâche, chef, référent).
- **[Faible] Supprimer un projet effaçait ses documents** : un projet qui a des documents s'archive désormais au lieu de se supprimer.
- **[Faible] « Annuler » ne vérifiait pas tout** : il refuse désormais une note du rapport retouchée depuis, un jalon déjà avancé, une réunion modifiée ou qui a reçu des actions ; il ne retire plus que les alertes créées par l'action elle-même ; une relance annulée garde sa trace (« relance annulée ») et compte toujours dans la limite d'une relance par heure.
- **[Faible] Documents** : on ne retire plus un document d'un projet archivé ou refusé ; le journal garde de quoi reconnaître un document retiré (nom, taille, empreinte, déposant) ; le fichier n'est chargé qu'après la vérification des droits.
- **[Faible] Titre d'un projet qu'on ne voit pas** : la recherche ne le renvoie plus, et le code d'un tel projet ne le montre plus au survol. **[déduction]** Ailleurs, le nom d'un projet qu'on ne peut pas ouvrir reste affiché en texte quand on voit une de ses tâches (règle d'origine de l'application) ; à confirmer si la banque veut le masquer aussi.

Restent à décider **[à confirmer]** (points de règle, pas des failles) :

- Messages passés dans l'adresse (`?erreur=…`, `?doc=…`) : le texte est échappé (pas d'injection), mais un lien fabriqué peut afficher un message trompeur dans l'application. Remplacer par des codes de message si la revue externe le demande.
- Une personne hors division membre d'un projet lit ses documents, et en dépose si elle est membre de l'équipe.
- Les formats .doc, .xls, .ppt (anciens formats Office) peuvent contenir des macros, et aucun antivirus ne passe sur les fichiers : à brancher sur l'antivirus de la banque, ou à retirer de la liste.
- La page d'un employé et la question « réunions de … » montrent l'intitulé des réunions des personnes suivies (supérieur, direction, exécutifs).
- Les plages occupées (sans intitulé) de toute personne active peuvent être consultées par une personne interne au moment de noter une réunion.

## Recommandations restantes

- **[déduction] Revue externe** : faire réaliser la revue de sécurité selon la politique de la banque (Mandiant) avant la mise en service — c'est elle qui fait foi.
- **[déduction] Dépendances de développement** : `vitest`, `drizzle-kit` et `esbuild` portent des alertes (dont deux critiques), mais **uniquement en développement** : elles ne sont pas installées dans l'image Docker de production (`npm ci --omit=dev`). Les mettre à jour à la prochaine maintenance (changements de version majeure, à tester).
- **[déduction] CSP `unsafe-inline`** : la politique autorise les scripts en ligne, nécessaires au démarrage de Next.js. Une politique à base de « nonce » serait plus stricte ; c'est un compromis connu de Next.js, à réévaluer.
- **[déduction] Blocage par adresse IP** : le blocage après 5 échecs est par compte. Un blocage complémentaire par adresse IP (au niveau du reverse-proxy de la banque) limiterait les attaques réparties sur plusieurs comptes.
