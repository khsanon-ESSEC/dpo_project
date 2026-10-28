# Revue de sécurité — Pilotage des projets DPO

Revue menée le 27 octobre 2026 sur la version compilée, lancée en local (base de démonstration), avant la mise en production. Elle **ne remplace pas** la revue externe prévue avec le service de sécurité de la banque (Mandiant) ; elle la prépare.

## Méthode

- **Lecture du code** : toutes les actions serveur (13 fichiers `"use server"`) et toutes les routes d'API (`src/app/api/**`), la couche d'accès (`src/lib/acces.ts`, `regles.ts`, `projets.ts`), la session (`src/lib/auth/session.ts`), les pièces jointes et le connecteur d'IA. Une revue indépendante des autorisations a été menée en parallèle.
- **Analyse des dépendances** : `npm audit`, recherche de secrets dans le dépôt et dans tout l'historique Git.
- **Vérifications fonctionnelles** : la suite de tests (133, dont un nouveau test de sécurité) et le parcours de bout en bout (ordinateur et téléphone), qui confirment qu'aucune correction n'a cassé un usage légitime.

Chaque constat est marqué **[vérifié]** (observé directement) ou **[déduction]** (raisonné sur le code, sans exécution dédiée).

## Résultat global

Un défaut d'autorisation important a été trouvé et corrigé ; deux points plus faibles ont été renforcés ; une dépendance critique a été mise à jour. Après correction, la suite de tests et les parcours passent, et `npm audit` ne signale **aucune** vulnérabilité dans les dépendances de production.

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
- **[vérifié] Autorisations** : chaque action et chaque route appelle `exigerUtilisateur()` puis vérifie l'objet visé (tâche, projet, rapport, réunion, pièce) via `src/lib/acces.ts`. Une ressource interdite répond « introuvable » sans révéler son existence. L'approbation d'un rapport au conseil exige le rôle exécutif ; seul un exécutif accorde le rôle exécutif ; un administrateur n'obtient aucun accès supplémentaire aux rapports.
- **[vérifié] Personnes hors division** : sans accès, aucune session ni alerte ; avec un accès limité, la consultante ne voit que ses tâches et ses projets — ni rapport, ni équipe, ni charge (confirmé par le parcours).
- **[vérifié] Mots de passe et connexion** : Argon2id, 12 caractères minimum, blocage 15 min après 5 échecs ; jeton de session stocké en empreinte SHA-256, cookie `httpOnly` / `SameSite=Lax` / `secure`.
- **[vérifié] Pièces jointes** : formats de bureau seulement, reconnus à l'extension **et** à la signature du fichier ; 10 Mo max ; servies en téléchargement (`Content-Disposition: attachment`, CSP `sandbox`, `nosniff`), jamais affichées ; lisibles seulement par qui peut lire le champ. Stockées en base (pas de chemin de fichier → pas de traversée de répertoire).
- **[vérifié] Redirections** : `retourValide` n'autorise qu'une liste de pages internes ; aucune redirection vers une adresse fournie par l'utilisateur.
- **[vérifié] Assistant d'IA** : désactivé par défaut ; une fois activé, il ne reçoit que ce que la personne a le droit de voir (mêmes filtres d'accès), seulement sur question ; la consigne précise que le contenu des données est une information, jamais une instruction ; la clé reste sur le serveur (`server-only`), jamais dans le navigateur. Limite de 10 questions/minute/personne.
- **[vérifié] Secrets** : aucune clé d'API dans le dépôt ni dans l'historique Git. Les fichiers `.env*` sont ignorés (sauf `.env.example`). La clé du prototype (Gemini) n'a jamais été versionnée ici.
- **[vérifié] En-têtes** : CSP sans ressource externe, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy` restrictive, `poweredByHeader` désactivé.

## Recommandations restantes

- **[déduction] Revue externe** : faire réaliser la revue de sécurité selon la politique de la banque (Mandiant) avant la mise en service — c'est elle qui fait foi.
- **[déduction] Dépendances de développement** : `vitest`, `drizzle-kit` et `esbuild` portent des alertes (dont deux critiques), mais **uniquement en développement** : elles ne sont pas installées dans l'image Docker de production (`npm ci --omit=dev`). Les mettre à jour à la prochaine maintenance (changements de version majeure, à tester).
- **[déduction] CSP `unsafe-inline`** : la politique autorise les scripts en ligne, nécessaires au démarrage de Next.js. Une politique à base de « nonce » serait plus stricte ; c'est un compromis connu de Next.js, à réévaluer.
- **[déduction] Blocage par adresse IP** : le blocage après 5 échecs est par compte. Un blocage complémentaire par adresse IP (au niveau du reverse-proxy de la banque) limiterait les attaques réparties sur plusieurs comptes.
