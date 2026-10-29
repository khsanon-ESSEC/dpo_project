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

## Rapport reconduit, aperçu, lecture, « Lu par » et « Répondre » (ajoutés le 28 octobre 2026)

- Le brouillon se complète à chaque ouverture (tâches de la semaine, blocages et décisions non résolus de la semaine dernière). Deux ouvertures au même moment n'ajoutent pas deux fois la même ligne (deux index uniques partiels, écritures sans effet en cas de doublon) **[vérifié par tests]**.
- Une ligne reconduite ou reprise reste dans son champ s'il existe encore, sinon dans un champ de la même rubrique **au moins aussi fermé** (une ligne « supérieur seulement » ne devient pas lisible par la direction ou un chef de projet) ; sa visibilité propre est copiée ; son projet n'est gardé que si l'auteur le voit encore **[vérifié par tests]**.
- Toutes les actions du brouillon (reprendre, tout reconduire, résolu, annuler résolu, reprendre un commentaire) passent par la vérification d'origine : le brouillon de la personne connectée, encore non envoyé ; on ne reprend que ses propres lignes ; rubrique et champ sont validés.
- **Aperçu** : il montre ce que lit le supérieur (sans les éléments retirés ni ce qui reste à l'auteur), avec le même filtre que la lecture.
- **Comparaison avec la semaine dernière** (chiffres, tendance des feux, « Depuis la semaine dernière ») : seulement pour qui lit le rapport en entier, sur le rapport précédent **tel que ce lecteur peut le lire** (la direction ne voit pas les champs réservés au supérieur) ; rien pour un chef de projet **[vérifié par tests]**.
- **« Lu par »** : seule la première ouverture par le destinataire du rapport est notée **[vérifié par tests]**.
- **« Répondre »** : un échange entre l'auteur et son supérieur seulement (ni la direction, ni les exécutifs, ni les chefs de projet : les mots peuvent porter sur des champs réservés). Texte de 1000 caractères au plus, échappé à l'affichage ; alertes à l'auteur, au destinataire et à ceux qui ont écrit, s'ils peuvent encore lire le rapport ; journal de chaque mot **[vérifié par tests]**.
- « Résolu » sur un blocage lié à une tâche débloque la tâche seulement si la personne peut la modifier ; « annuler » la rebloque avec son texte, seulement si rien n'a bougé depuis.

### Relecture indépendante (28 octobre 2026, troisième) et corrections

Une relecture faite sans voir ce travail n'a trouvé **aucune faille d'accès** (pas de lecture ni d'écriture du brouillon d'un autre). Corrigé :

- **[Élevé] Un blocage résolu restait traité comme ouvert ailleurs** (repris « à décider » chez le chef, dans la synthèse par projet, sur la fiche du projet, dans les propositions de décision et les comptes) : il en est retiré partout.
- **[Moyen] Reconduire pouvait ouvrir une ligne réservée** quand un modèle a deux champs de la même rubrique : corrigé comme dit plus haut **[vérifié par tests]**.
- **[Moyen] « Résolu » sur un blocage de tâche** : l'annulation rebloque la tâche ; une tâche bloquée de nouveau la même semaine a sa nouvelle ligne.
- **[Moyen-faible] Doublons à l'ouverture simultanée** : index uniques **[vérifié par tests]**.
- **[Faible]** alertes « Répondre » limitées à qui peut encore lire ; pastille « Envoyé en retard » cachée à un chef de projet ; texte gardé si l'envoi d'une réponse échoue ; ancienneté affichée seulement pour les blocages et décisions ; décisions remontées comptées comme nouvelles ; un blocage de tâche encore bloquée se reconduit même si le champ n'est pas prérempli.

Restent à décider **[à confirmer]** : « Répondre » est fermé à la direction ; à ouvrir si la banque le souhaite (avec le risque dit plus haut). « Lu par » est visible de l'auteur : à confirmer avec la DRH si un accusé de lecture pose question.

## Test complet du 28 octobre 2026 (quatrième passe)

Demandé avant la mise en service : tout faire tourner, chercher les bogues et les failles. Méthode : exploration automatique de l'application, relecture indépendante du code (sécurité web et autorisations), tests et parcours ; pas de requêtes forgées.

- **Exploration** **[vérifié]** : 614 pages ouvertes avec sept profils (exécutif, directrice de la division, directeur, cheffe d'équipe, employée, administrateur non exécutif, consultante hors division), sur ordinateur et téléphone : aucune erreur serveur, aucune erreur dans la page, aucun débordement. Chaque adresse trouvée par un profil a été rouverte avec les six autres : aucun accès inattendu (chaque page ouverte s'explique par la règle : son propre rapport, sa propre fiche, un projet dont on est membre, une tâche qu'on porte).
- **Dépendances** **[vérifié]** : `npm audit --omit=dev` ne signale aucune vulnérabilité.
- **En-têtes** **[vérifié]** : CSP, `nosniff`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` présents ; HSTS ajouté (voir plus bas).
- **Tests et parcours** **[vérifié]** : 297 tests (dont 15 nouveaux : limite d'essais simultanés, annuaire, garde-fous de l'administrateur, fiche hors division, origine des requêtes), vérification des types, compilation de production ; parcours dans le navigateur (rapport, formulaires, réunions, liens, gestion, barre, personnes hors division, recherche, modèles, import, tableau, tri, pièces jointes, rappels par courriel, connexions Windows et Google, refus d'un administrateur dans *Organisation*) : tous passent, après mise à jour de trois parcours écrits pour l'ancienne mise en page.

### Corrigé **[vérifié par tests]** sauf mention

- **[Élevé] Un administrateur pouvait s'ouvrir le travail des autres.** Le rôle ne doit donner aucun accès aux rapports ni aux tâches, mais un administrateur pouvait se nommer supérieur ou responsable d'équipe de quelqu'un (et lire ses rapports, passés compris), se donner le rôle Directeur, ou donner un mot de passe provisoire à un exécutif et entrer dans son compte. Désormais, pour un administrateur qui n'est pas exécutif : tout changement qui lui ferait suivre une personne de plus est refusé (fiche, responsable d'équipe, import) ; il ne change ni son propre supérieur ni son équipe ; le rôle Directeur se donne et se retire par un exécutif, comme le rôle Exécutif ; la fiche d'un exécutif se modifie par un exécutif ; un mot de passe provisoire pour un exécutif ou un directeur se donne par un exécutif. Toute personne dont le supérieur change en reçoit une alerte (qui peut lire ses rapports n'a plus de raison de changer à son insu).
- **[Moyen] Essais de mot de passe en parallèle.** Le compteur d'échecs était lu puis écrit : des essais envoyés en même temps passaient tous. Chaque essai est maintenant réservé avant la vérification, en une seule écriture en base : huit essais simultanés donnent cinq vérifications et trois refus d'office. Même limite pour le mot de passe actuel demandé au changement de mot de passe (une session volée ne sert plus à le deviner). Un échec n'efface jamais un blocage en cours.
- **[Moyen] Même défaut pour le compte Windows.** L'essai est réservé avant d'interroger l'annuaire (trois mots de passe au plus partent vers AD, même envoyés en même temps), rendu si aucun contrôleur n'a répondu ; fenêtre réglable (`AD_FENETRE_MINUTES`, 15 par défaut). Lié par UPN, le compte lu après la liaison est cherché aussi par cet UPN : si un autre compte porte le même identifiant Windows, deux comptes sont trouvés et l'accès est refusé.
- **[Moyen] Fiche hors division réactivée avec son ancien accès.** Taper le nom d'une personne hors division désactivée la réactivait, mot de passe compris. Désactiver une fiche ferme maintenant son accès, et une fiche réactivée revient sans accès (un administrateur le rouvre).
- **[Moyen] Rapport mensuel au conseil** : un directeur pouvait rédiger la ligne d'un projet d'une autre direction (qu'il voit parce que les siens y travaillent). Seul qui gère le projet la rédige ; les autres lignes s'affichent en lecture. Le mois demandé dans l'adresse est vérifié (un vrai mois, de 2020 au mois prochain) : on ne crée plus de rapport pour un mois inventé.
- **[Faible] Feu d'un projet qu'on ne voit pas** : une réponse « santé » ou son commentaire ne s'enregistrent que sur un projet que l'auteur voit. **[déduction]**
- **[Faible] Visibilité d'une ligne reconduite** : une ligne qui garde sa propre visibilité (« supérieur seulement ») dans un champ ouvert n'apparaît plus sur la fiche du projet, et ne remonte plus dans les listes du rapport du chef. Les feux et la charge d'un champ réservé au supérieur ne passent plus dans un champ plus ouvert du rapport du chef. **[déduction]**
- **[Faible] Charge d'un projet** : le niveau de charge tous projets confondus de chaque membre n'est plus montré qu'à qui gère le projet ou suit la personne ; un simple membre voit les heures prévues sur ce projet. **[déduction]**
- **[Faible] Tâche annulée** : on ne la coche plus et on ne la déplace plus sur le tableau sans la rétablir. **[déduction]**
- **[Faible] Requêtes venues d'un autre site** : les deux routes POST écrites à la main (assistant, modèle Excel de l'import) refusent une requête qui ne vient pas d'une page de l'application (les actions serveur de Next.js le faisaient déjà). Le lien « Retour » de la fiche d'une personne n'accepte que l'adresse de l'application (un chemin `//autre-site` en faisait un lien externe).
- **[Faible] Cookies et HTTPS** : en HTTPS, cookies de session et de connexion Google préfixés `__Host-` (un autre site de la banque ne peut pas en poser un à leur place) ; en-tête HSTS (un an). L'adresse IP gardée avec la session est celle ajoutée par le proxy (la dernière de `X-Forwarded-For`).
- **[Faible] Assistant** : les données de la personne (titres de tâches, lignes de rapport) passent dans le message, plus dans les consignes, qui gardent seules l'autorité.
- **Image Docker** : le script de données de démonstration (`semer.mjs`, avec son mot de passe commun) n'y est plus copié.

### Restent à décider **[à confirmer]**

- Le rôle Directeur réservé aux exécutifs : à confirmer avec la direction (un administrateur non exécutif ne peut plus le donner).
- Alerte « votre supérieur a changé » : envoyée aussi lors d'un import ; un premier import en enverra beaucoup.
- L'adresse IP gardée suppose un proxy devant l'application ; sans proxy, elle est celle que le navigateur annonce. Ne pas exposer le port 3000 directement en production (le lanceur du Mac l'ouvre sur le réseau local pour l'essai sur téléphone : à réserver à un réseau de confiance).
- Image de base Docker (`node:22-bookworm-slim`) : la figer par son empreinte (`@sha256:…`) et la mettre à jour à date fixe.
- Mot de passe provisoire : il n'expire pas tant qu'il n'a pas servi (il doit être changé à la première connexion). Lui donner une durée de vie (par exemple sept jours) demande une colonne de plus : à décider avec la banque.

## Graphiques (28 octobre 2026)

Nouvelles lectures de données, vérifiées à la lecture du code et par des tests contre la base de démonstration (`tests/graphiques-base.test.ts`) **[vérifié par tests]** sauf mention :

- **Reports de la fin prévue** (nouvelle table `reports_fin_projet`) : écrits seulement par les deux chemins qui changent déjà la date (fiche du projet, barre), après leurs contrôles ; lus sur la fiche d'un projet que la personne voit déjà. « Annuler » retire le report qu'il avait noté.
- **Portefeuille** : santé et glissements calculés sur les projets du portefeuille de la personne, rien de plus. **[déduction]**
- **Réunions en chiffres** : pour soi, ses propres réunions ; pour l'équipe, seulement les personnes que l'on suit déjà (mêmes règles que Équipe et Bilan), en heures totales, sans intitulé ni participants. Un projet que la personne ne voit pas est compté dans « Autres projets », sans son nom ni son code. **[déduction]**
- **Suivi du pilote** : nombres agrégés par semaine, réservé aux administrateurs et aux exécutifs, comme avant. **[déduction]**
- **Charge en carte** : mêmes personnes et mêmes chiffres que le tableau de la charge, présentés autrement. **[déduction]**
- **Sélecteur de période** (même jour) : la période vient de l'adresse (vérifiée : une des cinq vues, une date ou un mois valide, jamais dans le futur) ou d'un cookie de préférence `dpo_periode`, sans donnée personnelle, relu contre la même liste ; il ne change aucun droit. **[vérifié par tests]**
- **Charge réalisée et prévue** : calculées pour les mêmes personnes que la charge à venir (celles qu'on suit). La table `charges_prevues` n'est écrite que par le serveur (tournée horaire, ouverture de la page Charge), jamais à partir d'une saisie. **[vérifié par tests]**
- **Fiche d'une personne** (même jour) : la charge, les tâches, les réunions et l'évolution n'y paraissent que pour soi-même ou pour qui suit la personne (même règle que l'ancienne page, qui y renvoie désormais) ; jamais pour une personne hors division, ni pour un visiteur hors division. Vérifié par un parcours avec cinq profils (directrice, chargée de projets, directeur d'une autre direction, exécutif, consultante hors division), paramètres d'adresse compris. **[vérifié par parcours]**

## Santé calculée, rapports soumis, listes où l'on tape (28 octobre 2026, soir)

- **Santé calculée** : la santé d'un projet n'est plus une saisie. Le seul apport du chef de projet est le **signal de risque**, accepté seulement de qui gère le projet (même contrôle `exigerGestion` que l'ancienne saisie, sur la fiche comme dans la barre) ; le motif est raccourci à 300 caractères ; un signal ne peut qu'aggraver la santé calculée, jamais l'améliorer, et tombe après 30 jours. « Annuler » remet le signal d'avant. **[vérifié par tests]**
- **Rapports soumis** (*Conseil*) : même accès que le reste du conseil (`exigerAccesConseil` : directeurs et exécutifs, jamais une personne hors division) ; un rapport n'y paraît que s'il touche un projet que la personne voit (ou qu'elle l'a créé), et seuls les codes de ces projets sont montrés. Un mois passé sans rapport s'affiche vide : la navigation ne crée plus de rapport. **[déduction]**
- **Rôles proposés** : à qui gère un projet, la saisie du rôle propose les rôles déjà donnés dans toutes les équipes projet (« Développeur », « Analyste fonctionnel »), sans nom de personne ni de projet. **[Faible]** C'est un choix : ces libellés ne disent rien de qui fait quoi. **[déduction]**
- **Listes où l'on tape** : elles proposent les mêmes personnes qu'avant et envoient le même identifiant ; tous les contrôles restent côté serveur (qui peut être chef, recevoir une tâche, entrer dans une équipe). Taper un nom ne fait aucune recherche au serveur. **[déduction]**

## Livrables et chiffres cliquables (28 octobre 2026, nuit)

- **Délégation par livrable** : la règle d'assignation (`peutAssigner`, src/lib/projets.ts) s'élargit d'un seul cas : le responsable d'un livrable confie une tâche **rattachée à ce livrable** à l'équipe du projet (chef, référent, membres). Rien d'autre ne change : sans le livrable, ou hors de l'équipe, c'est refusé ; une nouvelle fiche hors division reste réservée au chef du projet. Le livrable choisi doit appartenir au projet de la tâche (contrôle serveur). **[vérifié par tests]**
- **Valider, renvoyer, rouvrir** : réservés à qui gère le projet ; « prêt à valider » au responsable et à qui gère le projet ; l'action vérifie aussi que le livrable est bien celui du projet de l'adresse. **[vérifié par tests]**
- **Page de retour** : `retourValide` accepte désormais une ancre sur la page (`#livrable-…`, lettres, chiffres et tirets seulement) ; toujours aucune adresse externe ni paramètre. **[vérifié par tests]**
- **Listes derrière les chiffres** (Équipe : tâches en retard, faites cette semaine) : mêmes personnes que la page (celles qu'on suit) ; un projet qu'on ne voit pas reste en texte, sans lien. **[déduction]**

## Reports, décisions, dépendances (28 octobre 2026, nuit)

- **Motif des reports** : exigé côté serveur sur les trois chemins qui changent la fin prévue (fiche, *Modifier le projet*, barre), raccourci à 300 caractères, affiché comme texte. **[vérifié par tests]**
- **Registre des décisions** : noter est réservé à l'équipe du projet et à ceux qui le gèrent, sur un projet en cours que la personne voit ; corriger et retirer, à l'auteur et à ceux qui gèrent ; la décision est vérifiée comme appartenant au projet de l'adresse. **[vérifié par tests]**
- **Dépendances** : ajoutées ou retirées seulement par qui peut modifier la tâche (mêmes règles que la tâche), entre deux tâches du même projet que la personne voit ; boucles refusées ; dix précédentes au plus. Les titres proposés sont ceux des tâches du projet, déjà visibles dans sa liste. **[vérifié par tests]**
- **Alerte « vous pouvez commencer »** : envoyée seulement à la personne de la tâche suivante, quand plus aucune précédente n'est ouverte. **[vérifié par tests]**

## Phases, risques, temps passé (28 octobre 2026, nuit)

- **Registre des risques** : noter, modifier et changer le statut sont réservés à l'équipe du projet et à ceux qui le gèrent, sur un projet en cours que la personne voit ; retirer, à l'auteur et à ceux qui gèrent ; le risque est vérifié comme appartenant au projet de l'adresse. Probabilité, impact et statut inconnus sont ramenés à des valeurs connues ; textes raccourcis (200 et 1 000 caractères), affichés comme texte. **[vérifié par tests]**
- **Phases** : ajoutées, modifiées, déplacées, terminées ou retirées seulement par ceux qui gèrent le projet ; dates cohérentes exigées (la fin suit le début). **[vérifié par tests]**
- **Temps passé** : noté seulement par qui peut modifier la tâche (mêmes règles que la tâche), compté pour la personne de la tâche ; pas de date future ni de plus de 60 jours ; durée de 5 minutes à 24 heures ; retiré par son auteur ou qui peut modifier la tâche. **[vérifié par tests]**

## Clôture, sponsor, budget, priorité, tâches récurrentes (28 octobre 2026, nuit)

- **Clôture et réouverture** : réservées à ceux qui gèrent le projet, sur un projet que la personne voit ; date de clôture contrôlée (pas future, pas avant l'entrée du projet, au plus un an en arrière) ; un projet clôturé ne reçoit plus de tâches. Le statut « finalisé » ne s'obtient plus par le formulaire de modification. **[vérifié par tests]**
- **Budget** : lu et modifié seulement par ceux qui gèrent le projet (la carte n'est pas envoyée aux autres) ; montants bornés (0 à 10¹³), devise limitée à HTG et USD, note raccourcie et affichée comme texte. **[vérifié par tests]**
- **Sponsor métier** : il voit le projet qu'il porte (ajouté aux projets visibles), sans droit de gestion ; une personne hors division sans accès n'est pas prévenue. **[vérifié par tests]**
- **Tâches récurrentes** : créer ou arrêter une répétition demande de pouvoir modifier la tâche (ou d'avoir créé la règle, pour l'arrêter) ; les occurrences sont créées par le serveur pour la même personne et le même projet que la tâche d'origine, et une seule fois même si plusieurs copies de l'application tournent (réservation en base). **[vérifié par tests]**

## Tout faire depuis la barre (29 octobre 2026)

- **Mêmes règles que les écrans** : chaque action de la barre (src/lib/donnees/commandes.ts) relit la phrase au serveur, avec les seules données que la personne voit (projets visibles, personnes, livrables, phases et risques de ces projets), puis passe par la fonction de l'écran correspondant, avec ses contrôles (gérer le projet, être dans l'équipe, être responsable du livrable, rédiger un rapport, préparer le conseil). Le choix d'un projet par `/` est vérifié contre les projets visibles. **[vérifié par tests]**
- **Créer un projet** : réservé à la division ; l'acceptation directe (avec un chef) seulement pour une directrice ou un exécutif, sinon la demande suit le circuit habituel. **[vérifié par tests]**
- **« Annuler »** : nouveaux jetons pour les actions sur un projet (livrable, équipe, décision, risque, phase, sponsor, chef, priorité, budget, clôture, projet créé) ; même garde qu'avant (trois minutes, une fois, la seule personne qui a agi, refusé si l'élément a changé). **[vérifié par tests]**
- **Envoyer son rapport** depuis la barre : mêmes contrôles que le bouton (champs obligatoires remplis, brouillon de la personne). **[déduction]** : vérifié dans le navigateur, pas dans les tests de base (il changerait les rapports dont d'autres tests ont besoin).

## Recommandations restantes

- **[déduction] Revue externe** : faire réaliser la revue de sécurité selon la politique de la banque (Mandiant) avant la mise en service — c'est elle qui fait foi.
- **[déduction] Dépendances de développement** : `vitest`, `drizzle-kit` et `esbuild` portent des alertes (dont deux critiques), mais **uniquement en développement** : elles ne sont pas installées dans l'image Docker de production (`npm ci --omit=dev`). Les mettre à jour à la prochaine maintenance (changements de version majeure, à tester).
- **[déduction] CSP `unsafe-inline`** : la politique autorise les scripts en ligne, nécessaires au démarrage de Next.js. Une politique à base de « nonce » serait plus stricte ; c'est un compromis connu de Next.js, à réévaluer.
- **[déduction] Blocage par adresse IP** : le blocage après 5 échecs est par compte. Un blocage complémentaire par adresse IP (au niveau du reverse-proxy de la banque) limiterait les attaques réparties sur plusieurs comptes.
