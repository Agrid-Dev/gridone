# Brouillons des issues de coexistence des UI

Suite proposée pour [AGR-1597](https://linear.app/agrid-bms/issue/AGR-1597/handle-multiple-uis-with-gridone), liée à la [proposition de décision](multiple-uis-research.md) et à l’[audit](multiple-uis-contract-audit.md).

**Statut : brouillons à adapter après validation de l’équipe.** Les identifiants B0–B6 sont internes à ce document ; aucune issue d’implémentation n’a été créée dans Linear. Les durées 90/30 jours sont celles de la proposition, à confirmer en B0. Les responsables ci-dessous désignent des fonctions, sans attribuer un travail à une personne sans accord.

## B0 Valider la politique et établir le parc de référence

**Problème :** les commits consultés et les anciennes notes de terrain ne donnent pas l’état actuel des box. Une politique de compatibilité sans ce relevé pourrait exclure un site existant.

**Responsables proposés :** exploitation, responsable API et responsable UI hôtelière. **Dépendance :** aucune. **Priorité proposée :** haute.

**Résultat attendu :** décision datée et inventaire de déploiement servant d’entrée aux autres issues.

Critères d’acceptation :

- Pour chacun des quatre sites déclarés, consigner activation effective, origine, release/build backend, build UI attribué, contraintes d’accès et date du relevé ; ajouter les autres sites concernés par le produit.
- Relever les drivers/contrats d’appareils déterminants et les rôles des parcours à supporter, sans exporter de secrets.
- Choisir les deux références backend initiales et les combinaisons candidates ; ne déclarer aucune qualification sur la seule présence d’un numéro de version.
- Charles et l’équipe valident la distribution par site, le maintien de l’UI généraliste, les fenêtres de support, le responsable de publication et les exceptions datées.
- Consigner l’accord ou le désaccord pour chaque arbitrage du dossier. AGR-1597 reste en attente de décision jusqu’à cette étape.

## B1 Déclarer le contrat API et distribuer un SDK traçable

**Problème :** `/health.version`, les flags et la version `0.1.0` du package ne décrivent pas les garanties requises par une UI indépendante.

**Responsable proposé :** API/SDK. **Dépendance :** B0. **Priorité proposée :** haute.

**Résultat attendu :** métadonnées additives de contrat dans `/health`, capacités documentées et artefact SDK immuable produit par la release Gridone.

Critères d’acceptation :

- Préserver `status`, `version`, `flags` et les clients existants ; exposer identité de build, révision de contrat et capacités vérifiables, séparées des flags de configuration.
- Définir les capacités nécessaires aux lectures, commandes/preview, write states, automatisations, scopes et WebSocket ; aucune convention de fabricant ou de site dans leur définition.
- Régénérer les types et typer les messages WS consommés ; détecter en CI une divergence entre le schéma généré et celui commité.
- Publier l’archive SDK avec tag/commit source et checksum ; une UI peut reconstruire son dépendancier depuis l’artefact épinglé sans chercher « la dernière version ».
- Documenter les règles d’ajout, de rupture, de dépréciation et le retrait après la fenêtre de support.
- Définir le manifeste UI et le format du catalogue des combinaisons qualifiées, sans ajouter un service métier ou une migration de données pour ces métadonnées.

## B2 Aligner les parcours hôteliers sur les contrats supportés

**Problème :** l’UI utilise des données récentes derrière les types de `v0.246.0`, une logique de permissions fondée sur les noms de rôles et un ancien repli de preview.

**Responsable proposé :** UI hôtelière, avec revue API. **Dépendances :** B0, B1. **Priorité proposée :** haute.

**Résultat attendu :** un build de transition dont tous les parcours critiques suivent le contrat annoncé.

Critères d’acceptation :

- Épingler le SDK qualifié et remplacer les casts de contrat par des types ou adaptateurs explicites limités aux versions retenues en B0.
- Traiter `branches`, les statuts d’exécution et la timezone ; vérifier la compatibilité avant toute suppression/recréation d’automatisation existante.
- Utiliser les permissions effectives ; un rôle inconnu ne reçoit pas implicitement toutes les actions UI. Conserver les restrictions métier d’écran convenues en B0.
- Traiter `reasons`, avertissement UI, consentement d’operating rules et confirmation matérielle selon leurs sens distincts ; couvrir unitaire, lot et modification de menu.
- Appliquer les états de compatibilité du dossier au démarrage, retour au premier plan, reconnexion et mutation après une vérification vieille de plus de 60 secondes. Absence de métadonnées ancienne traitée par la seule liste qualifiée.
- Invalider le cache de capacités du driver lors d’une modification détectée ; désactiver seulement les usages non compatibles, sans afficher une donnée périmée comme actuelle.
- Ne jamais rejouer une mutation suite à un rechargement ou une erreur réseau ; préserver ou annuler explicitement les intentions en cours avant activation d’une nouvelle UI.

## B3 Choisir une release hôtelière par site

**Problème :** le répertoire `live/` et les workflows actuels imposent un frontend commun, y compris au rollback.

**Responsable proposé :** exploitation/frontend infrastructure. **Dépendances :** B0, format de manifeste B1. **Priorité proposée :** haute.

**Résultat attendu :** publication immuable puis promotion ou rollback explicite d’un site, sans rebuild.

Critères d’acceptation :

- Séparer construction/publication de l’artefact et attribution aux sites ; le push `main` ne promeut plus automatiquement tout le parc.
- Vérifier l’archive et sa qualification avant attribution ; journaliser ancien build, nouveau build, site, acteur et date, avec protection contre les promotions concurrentes contradictoires.
- Conserver le routage API du site, les cookies host-only, le rejet des hosts inconnus et la séparation API/statique, y compris sur chemins normalisés.
- Servir HTML, worker et ressources cohérents ; isoler les contenus de releases dans le cache et conserver les ressources des anciens onglets, y compris les fichiers publics non hashés.
- Garder la même identité et portée PWA lors d’une promotion ; rendre le manifeste de compatibilité accessible avec revalidation, hors cache applicatif périmé.
- Démontrer dans les essais B4 qu’un rollback du site A laisse B inchangé et conserve l’accès à l’UI généraliste ; respecter la rétention minimale et toutes les références encore actives.

## B4 Qualifier les combinaisons UI SDK et Gridone

**Problème :** les contrats simulés hôteliers et l’acceptation d’une release Gridone ne vérifient pas leurs combinaisons croisées.

**Responsables proposés :** mainteneurs des deux dépôts. **Dépendances :** B0 pour la matrice ; B1–B3 pour la qualification finale. Les scénarios de régression peuvent être préparés avant leur livraison. **Priorité proposée :** haute.

**Résultat attendu :** CI consommateur exécutée contre des images identifiées par digest et des artefacts UI/SDK exacts.

Critères d’acceptation :

- Reprendre la matrice de scénarios du dossier : auth/refresh, permissions, lectures, commandes/refus/retours partiels, états réels, automatisations, WS/reconnexion, PWA et rollback.
- Tester UI candidate sur toutes les références backend supportées ; backend candidat avec UI attribuées, versions de repli et builds encore couverts par la fenêtre navigateur.
- Combiner vérifications de contrats HTTP/WS et parcours navigateur sur builds de production, avec reverse proxy représentatif ; utiliser des simulateurs pour toutes les écritures.
- Injecter les régressions observées : payload `action/branches`, nouveaux statuts, `reason/reasons`, rôle personnalisé, scopes et changement de driver. Les tests doivent échouer si ces incompatibilités sont réintroduites.
- Conserver chaque résultat avec identities UI, SDK, backend, fixture de driver et protocole testé ; une suite absente ou ignorée ne qualifie pas une combinaison.
- Bloquer la promotion si une combinaison requise échoue. Distinguer les tests unitaires de contrat existants de ces nouvelles preuves, et appliquer les quality gates habituels aux futurs changements de code.

## B5 Diagnostiquer les versions réellement actives

**Problème :** une UI ouverte ou installée peut rester ancienne après la publication, et le numéro de package seul n’identifie pas son code.

**Responsables proposés :** UI et exploitation, avec API. **Dépendances :** B1, B2, B3. **Priorité proposée :** normale, requise avant rollout général.

**Résultat attendu :** diagnostic copiable par le support et suivi des attributions/clients actifs.

Critères d’acceptation :

- Afficher build UI exécuté et attribué, provenance SDK, version/build backend, contrat, capacités manquantes, état WS et date du dernier contrôle.
- Permettre de corréler les erreurs à ces identités sans enregistrer JWT, cookies ni sous-protocole bearer. Les identités déclarées par le client ne donnent aucun droit.
- Distinguer une incompatibilité, un refus métier, un défaut de permission et une panne réseau dans le support et les signaux de suivi.
- Signaler les builds retirés approchant la fin de support et les sites sans inventaire récent ; l’absence de télémétrie ne prouve pas l’absence d’ancien client.
- Couvrir par test un ancien onglet/PWA qui refuse l’update et le cas d’une version inconnue.

## B6 Organiser la transition et les retours arrière

**Problème :** les bundles historiques n’ont aucun garde de compatibilité, et les migrations backend peuvent interdire le downgrade.

**Responsable proposé :** exploitation avec API et UI. **Dépendances :** B0–B5. **Priorité proposée :** haute avant première promotion générale.

**Résultat attendu :** procédure applicable site par site avec pilote, conditions de passage et solution de repli connue.

Critères d’acceptation :

- Livrer d’abord le build de transition sur les backends compatibles ; vérifier que les anciens contrats restent servis pendant leur fenêtre. Ne pas supposer qu’un nouveau manifeste arrête un ancien bundle.
- Définir le site pilote, la fenêtre d’observation et les critères de passage avec l’exploitation avant lancement ; vérifier les parcours critiques et l’absence de régression de refus métier.
- Préparer pour chaque promotion le couple de repli frontend/backend et vérifier que le stockage navigateur reste lisible par l’UI de repli.
- Examiner les migrations inverse/forward et les données : documenter explicitement le refus des arbres conditionnels et la perte de métadonnées de la migration 0006 ; prévoir sauvegarde/restauration lorsque nécessaire, sans l’automatiser implicitement.
- Préserver l’accès support généraliste, informer des interruptions backend et traiter le sort des commandes/automatisations en cours ; aucune promesse de zéro interruption sans preuve.
- Faire un exercice de promotion/rollback sur l’environnement de test, sans action sur les équipements réels. Une panne réseau ne déclenche pas automatiquement un downgrade.
- Publier le relevé des combinaisons qualifiées et consigner la décision de promotion ou de maintien de version pour chaque site.
