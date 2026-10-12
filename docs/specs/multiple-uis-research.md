# Coexistence et compatibilité des interfaces Gridone

**AGR-1597 — Proposition de décision, à valider avec Charles et l’équipe.**

Date : 8 octobre 2026. Référence : [recherche AGR-1597](https://linear.app/agrid-bms/issue/AGR-1597/handle-multiple-uis-with-gridone).

**Recommandation : conserver l’UI généraliste dans la distribution Gridone et l’UI hôtelière dans son dépôt et son hébergement central, avec une version explicitement sélectionnée par site.** Garantir les usages par une matrice de combinaisons testées, complétée par des capacités déclarées par l’API. La version du SDK indique sa provenance ; elle ne garantit pas la compatibilité de l’application.

La contrainte confirmée par Bastien est qu’un accès par Internet convient lorsque la box Gridone est joignable. Cette étude documentaire ne modifie aucun déploiement et ne certifie aucune combinaison en production. Les preuves détaillées sont dans l’[audit des contrats](multiple-uis-contract-audit.md), et les suites proposées dans les [brouillons d’issues](multiple-uis-backlog.md).

## État des lieux

| Élément             | État observé dans les sources                                                                                                              | Conséquence                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Gridone             | Checkout `51546eeec497efcf6da64955adf0b013435a1f6c`, version `0.307.0`. Image contenant API, SDK consommé lors du build et UI généraliste. | La publication embarquée synchronise ces composants, mais un ancien onglet peut survivre à la mise à jour.               |
| UI hôtelière        | Checkout `33145c048f1e322254c8161e5076a9f5c8f6f484`. Archive `gridone-sdk-v0.246.0.tgz`, package UI et package SDK nommés `0.1.0`.         | L’identité utile est le commit/build et la provenance de l’archive, pas seulement `package.json.version`.                |
| Hébergement central | S3 sert un répertoire commun `live/`. Un sous-domaine choisit l’origine API ; la publication et le rollback remplacent le frontend commun. | Un rollback hôtellerie concerne tous les sites de cette distribution.                                                    |
| Parc déclaré        | Quatre sites dans `infra/sites.auto.tfvars`.                                                                                               | Une déclaration Terraform ne prouve ni son application ni la version courante des box.                                   |
| Compatibilité       | Tests de contrats hôteliers sur client et WebSocket simulés ; acceptation Gridone sur image réelle avec SDK de la révision construite.     | Ces dispositifs ne constituent pas une matrice entre releases hôtellerie et releases backend.                            |
| Clients persistants | PWA avec mise à jour proposée, assets historiques conservés, paramètres locaux au navigateur.                                              | La version publiée et celle réellement exécutée peuvent différer ; un rollback ne réécrit pas les données du navigateur. |

Sources : [image Gridone][g-docker], [manifeste hôtellerie][h-package], [publication et rollback][h-deploy], [sites déclarés][h-sites], [acceptation Gridone][g-tests], [tests de contrat hôteliers][h-contract].

### Écarts qui influencent la décision

1. **Automatisations : rupture du format.** Le contrat `v0.246.0` exige `action` ; le contrat courant exige `branches`. L’UI hôtelière construit déjà `branches` avec un cast vers l’ancien type et sait lire les deux formes simples. Son archive SDK ne décrit donc plus toutes ses dépendances réelles. Une note du 30 septembre rapporte une page blanche sur ce changement, corrigée depuis dans le chemin de lecture ; cette note n’est pas une mesure actuelle du parc. [Comparaison et sources dans l’audit](multiple-uis-contract-audit.md#évolution-depuis-v02460).
2. **Pilotage : évolution du sens des réponses.** Le preview remplace `reason` par `reasons` et expose les contraintes dynamiques, avertissements et consentements. Le repli hôtellerie vers le preview lit encore `reason`. Les commandes hôtelières passent directement par le dispatch ; l’UI généraliste utilise le parcours de preview et confirmation. Une réponse HTTP correcte ne prouve pas que les deux UI présentent les mêmes garanties à l’opérateur.
3. **Permissions : rôle et autorisation divergent.** L’API expose des rôles personnalisés et sépare `devices:command` de `devices:write`. L’UI hôtelière décide principalement selon le nom du rôle, avec un accès UI complet par défaut pour les rôles inconnus. Ce filtrage d’écran ne remplace pas l’autorisation serveur.
4. **Rollback backend : contrainte de données.** La migration inverse des arbres d’automatisation refuse les arbres conditionnels ou multiples ; même dans les cas convertibles, elle abandonne des métadonnées récentes. Revenir à une ancienne image exige un examen de la base. [Migration inverse][g-rollback].

## Comparaison des approches

### Distribution

| Approche                                    | Maintenance et accès                                                                                                                                      | Mise à jour et retour arrière                                                                                         | Appréciation                                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Embarquer toutes les UI avec Gridone        | Un paquet par installation, accès local possible selon réseau/proxy ; chaque nouvelle UI entre dans le build Gridone.                                     | Paire de livraison facile à identifier, mais correction UI couplée à la box ; anciens navigateurs toujours à traiter. | Utile pour une exigence locale forte ; cette exigence n’est pas posée pour l’hôtellerie. |
| Déployer chaque UI séparément par site      | Contrôle indépendant, y compris hébergement local ; davantage d’instances, supervision et configurations.                                                 | Publication et rollback ciblés, au prix d’un parc supplémentaire à maintenir.                                         | Option de repli pour un site ayant une contrainte spécifique.                            |
| Hébergement central avec sélection par site | Réutilise le dispositif hôtellerie ; un artefact commun peut servir plusieurs sites, chacun gardant sa version. Accès dépendant du réseau jusqu’à la box. | Promotion progressive et rollback ciblé ; routage des versions et cohérence du cache à ajouter.                       | **Recommandé** compte tenu de l’existant et de la contrainte Internet acceptée.          |

Les options concernent la distribution, pas la frontière d’autorisation. L’API reste responsable des permissions dans tous les cas. Conserver l’UI généraliste à l’URL actuelle de la box pour administration/support, avec les permissions adaptées ; ne pas intégrer les UI dans un même runtime, iframe ou service métier. Des dépôts séparés conviennent aux cycles distincts, sans empêcher de partager le SDK.

Les sous-domaines par site conservent leurs cookies et données locales. Les sessions hôtellerie et généraliste sur des origines différentes restent distinctes : aucun SSO implicite. Ne pas attribuer un hostname existant à un autre client. L’accès LAN de l’UI généraliste dépend de la configuration nginx et du proxy ; sa présence dans l’image ne garantit pas à elle seule une URL accessible sur le LAN. [Topologies Gridone][g-deploy], [routage hôtellerie][h-deploy].

### Compatibilité

| Approche                             | Avantage                                | Limite                                                                                                                                          | Choix                                                                                                      |
| ------------------------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Alignement strict UI = SDK = backend | Paire de référence facile à construire. | Oblige à multiplier les UI pour le parc et ne règle pas les onglets anciens. Le code hôtellerie actuel dépasse déjà sa version SDK.             | Conserver comme référence de l’UI embarquée, pas comme règle générale.                                     |
| Plage de versions backend            | Décalage de mises à jour explicite.     | Une plage numérique serait trompeuse sans règles de contrat et preuves. Les releases `0.x` inspectées comportent des changements incompatibles. | Ensemble explicite de versions/builds qualifiés ; plage seulement si chaque évolution respecte le contrat. |
| Détection de capacités               | Autorise un repli par fonctionnalité.   | Ne démontre ni le comportement réel, ni les permissions, ni la compatibilité des drivers.                                                       | Complément nécessaire aux tests et à la sélection par site.                                                |

**Choix proposé : combinaisons qualifiées + capacités + attribution par site.** Éviter les adaptations silencieuses après une erreur de mutation et les comparaisons de version dispersées dans les composants. Centraliser les éventuels adaptateurs de contrat à la frontière API de l’UI.

## Politique cible proposée

### Publications et durée de support

Les durées suivantes sont des valeurs de départ à arbitrer, pas une promesse existante ni une mesure du besoin terrain.

- **Backend : deux références de support**, active et précédente. Maintenir la précédente au moins **90 jours après la promotion de sa remplaçante**. Une référence est une release explicitement choisie ; elle ne change pas à chaque release `0.x`. Ne pas ouvrir une troisième référence avant la fin de transition de la plus ancienne. Chaque correctif accepté a son propre build qualifié.
- **UI : version choisie par site et dernière version de repli compatible.** Une UI encore attribuée à un site reste dans la matrice de support. Pour les navigateurs, conserver les contrats des builds retirés de ce site pendant **30 jours**, puis demander leur mise à jour avant toute nouvelle mutation. Inclure dans les validations les builds de cette fenêtre, pas uniquement la dernière release publiée.
- **Artefacts : conservation minimale de 90 jours après la dernière attribution**, prolongée tant qu’un artefact sert un site, un rollback autorisé ou un client supporté. Cela inclut les ressources non hashées d’une release et son service worker, pas seulement les bundles JS.
- **SDK : livraison immuable issue de Gridone**, avec tag, commit source et checksum. Le maintien initial de l’archive vendue dans le dépôt suffit ; publier sur npm n’est pas requis. Produire et vérifier l’artefact dans la chaîne de release Gridone ; l’UI référence explicitement cet artefact.

La première liste de versions supportées reste à qualifier. `0.307.0` est un candidat de référence documentaire, pas une combinaison homologuée. `v0.246.0` ne doit pas être annoncé comme minimum du frontend hôtellerie actuel : son écriture d’automatisations utilise déjà le nouveau format. Les versions réellement installées conditionnent la transition initiale.

### Contrats et interfaces à faire évoluer

Étendre de façon additive la réponse publique existante `GET /health` : une identité de build backend, une révision du contrat et une liste de capacités documentées. Conserver `status`, `version` et `flags`. Les flags actuels viennent de `GRIDONE_FEATURE_*` et ne sont pas une preuve de capacité : ne pas les réinterpréter comme un contrat stable. Une capacité doit correspondre à un comportement implémenté et vérifié, sans dépendre d’un nom de site ou d’un fabricant. [Health][g-health], [flags][g-flags].

Associer à chaque build UI un manifeste contenant son identité, l’artefact SDK exact, les capacités obligatoires et optionnelles, et les combinaisons qualifiées. Le catalogue d’exploitation associe chaque site à son origine backend et à son build UI. La compatibilité des drivers reste évaluée par appareil ; les permissions viennent de `/auth/me` et des contrôles serveur.

Le SDK doit typer ce contrat et les messages WebSocket consommés ; les casts présents dans l’UI hôtelière constituent une dette de transition à retirer. Un identifiant UI/build transmis pour diagnostic est informatif, jamais une autorisation.

Pendant une fenêtre de support, les ajouts de champs optionnels restent tolérés ; supprimer un champ, modifier un champ obligatoire, ajouter un statut ayant un effet métier, changer une permission ou le sens d’un événement exige une revue de compatibilité. Prévoir adaptation ou nouveau contrat, annoncer la dépréciation, conserver l’ancien comportement pendant la fenêtre convenue, puis vérifier l’absence de site encore attribué avant retrait. Une simple régénération TypeScript ne valide pas ce processus.

### Comportement selon l’état de compatibilité

| Situation                                            | Comportement cible                                                                                                                                             |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Combinaison qualifiée, capacités présentes           | Activer les fonctions autorisées par le compte et par le contrat de l’appareil.                                                                                |
| Capacité optionnelle absente                         | Masquer/désactiver la fonction concernée avec une explication ; conserver les parcours qualifiés.                                                              |
| Contrat inconnu ou capacité critique manquante       | Bloquer les mutations concernées. Autoriser seulement les lectures dont le contrat est qualifié ; sinon afficher un état d’incompatibilité et l’accès support. |
| `/health` sans métadonnées nouvelles                 | Utiliser une correspondance explicite avec une ancienne release qualifiée ; une version absente ou inconnue ne vaut pas acceptation.                           |
| Box inaccessible ou mesures périmées                 | Signaler indisponibilité/fraîcheur, ne pas présenter le cache comme une mesure actuelle, ne pas mettre en file des commandes à rejouer.                        |
| Mise à jour disponible                               | Proposer l’activation ; conserver les intentions locales jusqu’à annulation ou traitement, sans rejouer une commande après rechargement.                       |
| Commande acceptée mais état réel non confirmé        | Afficher l’état en attente/inconnu et relire l’historique/la mesure ; ne pas assimiler acceptation HTTP et application matérielle.                             |
| Refus métier, 403 ou 404 dans un périmètre restreint | Présenter le refus selon son contrat ; ne pas le transformer automatiquement en diagnostic de version incompatible.                                            |

Recontrôler le contrat au démarrage, au retour au premier plan, après reconnexion API/WebSocket et avant une mutation si la dernière vérification date de plus de 60 secondes. La vérification côté UI limite les erreurs d’usage ; elle ne fournit ni verrou distribué ni protection contre un client arbitraire. L’API conserve sa validation et l’exploitation contrôle les changements backend.

**Limite de transition : les anciens bundles ne contiennent pas ce garde de compatibilité.** Une politique nouvelle ne peut pas leur imposer rétroactivement un comportement. Livrer d’abord une UI de transition sur un backend compatible, respecter la fenêtre des anciens clients et ne pas autoriser une rupture backend tant que leurs contrats doivent rester servis. Si un retrait urgent impose de bloquer des clients historiques, prévoir séparément un contrôle serveur/proxy ciblé et sa migration ; ne pas présenter un simple contrôle frontend comme cette garantie.

### Distribution par site et rollback

Publier les fichiers d’une release de manière immuable, vérifier le manifeste, puis modifier l’attribution du site. Séparer publication d’un artefact et promotion vers des sites : un push sur `main` ne doit plus promouvoir automatiquement tous les sites. Démarrer avec un site pilote désigné par l’exploitation, puis une promotion explicite des autres sites dont la combinaison est qualifiée.

Le routage doit servir un ensemble cohérent HTML, service worker et ressources. Prévoir des URL de ressources liées à la release pour les fichiers non hashés ; conserver l’identité de l’app/PWA et son périmètre par site. Un onglet d’une ancienne release doit continuer à résoudre ses propres ressources après changement d’attribution. La clé de cache des contenus variables doit distinguer les releases. Une réécriture CloudFront ne change pas le comportement de cache déjà sélectionné : conserver la séparation API/statique et vérifier les chemins normalisés. [Clé de cache CloudFront][aws-cache], [réécriture des URI][aws-uri].

Le rollback frontend choisit une release archivée **encore compatible avec le backend et les données navigateur actuels**, sans reconstruire les anciennes sources. La propagation à tous les navigateurs n’est pas instantanée : le service worker actif peut conserver l’ancienne application. [Cycle de vie des service workers][mdn-sw].

Le rollback backend nécessite une procédure propre : compatibilité des données, migrations inverses admises ou restauration préparée, fenêtre d’indisponibilité et effets sur les automatisations. Aucun rollback automatique sur une simple panne réseau. Ne pas promettre une mise à jour backend sans interruption avec le conteneur unique actuel.

## Validation future et responsabilités

| Scénario à couvrir                                                      | Critère attendu                                                                                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nouvelle UI sur les deux références backend                             | Parcours qualifiés exécutables ; capacités manquantes traitées sans requête de mutation invalide.                                                            |
| Nouveau backend avec UI attribuées, replis et anciens clients supportés | Aucune régression de contrat ; promotion refusée si une combinaison requise échoue.                                                                          |
| Login, reload, expiration et logout                                     | Refresh/retry maîtrisé, session restaurée, refus définitif géré ; cookies et WebSocket vérifiés via le proxy réel.                                           |
| Permissions et deux sites ouverts                                       | Viewer sans écriture, rôles personnalisés conformes, scopes cohérents HTTP/WS ; aucune donnée ni session réutilisée entre sites.                             |
| Commandes unitaires et groupées                                         | Bornes, preview, avertissement UI, consentement métier, refus partiel, erreur et timeout distingués ; aucune double écriture après reconnexion/rechargement. |
| Automatisations et horloge                                              | Lecture/écriture selon le contrat, nouveaux statuts explicites, timezone du bâtiment, aucune suppression préalable sur contrat inconnu.                      |
| WebSocket interrompu puis repris                                        | Réauthentification, resynchronisation HTTP, révisions obsolètes ignorées et fraîcheur des valeurs correcte.                                                  |
| Ancien onglet/PWA après promotion                                       | Ressources encore disponibles, proposition d’update cohérente, aucun replay et diagnostic du build réellement actif.                                         |
| Rollback UI du site A                                                   | Site B inchangé, assets et stockage local compatibles, origine API conservée.                                                                                |
| Rollback backend                                                        | Base et migrations évaluées ; un arbre incompatible interdit le downgrade plutôt que d’être perdu silencieusement.                                           |

Les commandes de ces essais seront exécutées sur des simulateurs ou une installation de test dédiée. Les vérifications de production restent sans commande vers les équipements. Les tests de déploiement non authentifiés actuels restent utiles ; ils ne remplacent pas ces parcours. Aucun de ces essais n’a été exécuté pour cette étude.

Responsabilités proposées : le responsable API/SDK décrit les évolutions et garantit les contrats backend ; le responsable de chaque UI fournit ses contrats consommateurs et valide ses parcours ; l’exploitation tient l’inventaire du parc, choisit les promotions et prépare les replis. Une release backend nécessite la validation des consommateurs encore supportés, une release UI celle de ses backends cibles. Ces rôles ne présument pas de l’accord personnel de Charles ou d’un membre de l’équipe.

## Arbitrages à valider pour clore AGR-1597

| Incertitude du ticket          | Réponse préparée                                                                                                  | Validation restante                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| UI disponibles et utilisateurs | UI hôtelière pour l’usage quotidien, généraliste conservée pour administration/support ; permissions serveur.     | Charles/équipe : confirmer les parcours et les rôles attendus.                        |
| Décalage de versions et durée  | Deux références backend, 90 jours de transition ; clients retirés supportés 30 jours.                             | Exploitation : inventaire daté, rythme de maintenance et faisabilité de ces fenêtres. |
| Garanties actuelles            | Audit des contrats, différences prouvées et limites des tests consignés.                                          | Aucune combinaison déclarée homologuée avant les essais futurs.                       |
| Vérification des parcours      | Matrice ci-dessus et backlog de CI consommateur.                                                                  | Équipe : accepter le coût et désigner les mainteneurs.                                |
| Accès et disponibilité         | Internet acceptable lorsque la box est joignable ; UI généraliste préservée ; indisponibilité backend explicitée. | Exploitation : confirmer les accès support et fenêtres de maintenance de chaque site. |
| Diagnostic                     | Identités UI/SDK/backend, capacités et attribution par site.                                                      | Équipe : adopter le contrat et désigner le responsable du catalogue.                  |

La fiche de validation doit consigner le nom des validateurs, la date, les options retenues, les durées ajustées et les exceptions avec échéance. **Cette validation n’a pas eu lieu dans cette étude ; AGR-1597 ne doit pas être déclaré décidé ou terminé à ce titre.** Les issues jointes sont des brouillons dépendant de cet arbitrage.

[g-docker]: https://github.com/Agrid-Dev/gridone/blob/51546eeec497efcf6da64955adf0b013435a1f6c/docker/Dockerfile
[g-deploy]: https://github.com/Agrid-Dev/gridone/blob/51546eeec497efcf6da64955adf0b013435a1f6c/docker/README.md
[g-tests]: https://github.com/Agrid-Dev/gridone/blob/51546eeec497efcf6da64955adf0b013435a1f6c/tests/acceptance/README.md
[g-health]: https://github.com/Agrid-Dev/gridone/blob/51546eeec497efcf6da64955adf0b013435a1f6c/packages/api/src/api/routes/health_router.py
[g-flags]: https://github.com/Agrid-Dev/gridone/blob/51546eeec497efcf6da64955adf0b013435a1f6c/packages/api/src/api/features.py
[g-rollback]: https://github.com/Agrid-Dev/gridone/blob/51546eeec497efcf6da64955adf0b013435a1f6c/packages/automations/src/automations/storage/postgres/migrations/0006.automations-decision-tree.rollback.sql
[h-package]: https://github.com/Agrid-Dev/gridone-charles/blob/33145c048f1e322254c8161e5076a9f5c8f6f484/package.json
[h-sites]: https://github.com/Agrid-Dev/gridone-charles/blob/33145c048f1e322254c8161e5076a9f5c8f6f484/infra/sites.auto.tfvars
[h-deploy]: https://github.com/Agrid-Dev/gridone-charles/blob/33145c048f1e322254c8161e5076a9f5c8f6f484/docs/deployment.md
[h-contract]: https://github.com/Agrid-Dev/gridone-charles/blob/33145c048f1e322254c8161e5076a9f5c8f6f484/src/test/contract/gridone.contract.spec.tsx
[aws-cache]: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-the-cache-key.html
[aws-uri]: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-event-structure.html
[mdn-sw]: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers
