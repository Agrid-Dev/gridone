# AGR-1198 — Validation de l’implémentation locale

> Rapport historique de la campagne du 9 septembre 2026. Les commits, nombres de
> tests et étapes restantes décrivent ce point de contrôle ; ils ne constituent
> pas un état de livraison actualisé après les correctifs suivants. Les essais
> matériels non documentés ici ne sont pas présumés réalisés.

**État :** É2–É5 implémentées et vérifiées localement ; qualification matérielle É6
non réalisée. L’[ADR](driver-defined-device-ui.md) reste une proposition. Ce rapport
complète l’[inventaire firmware](driver-defined-device-ui-annex-a.md) et les
[résultats des spikes](driver-defined-device-ui-annex-b.md) sans transformer une
hypothèse firmware en observation matérielle.

**Date de la campagne :** 9 septembre 2026. Les résultats ci-dessous concernent la
branche `feat/AGR-1198`, avant publication ou ouverture d’une PR. Les journaux
éphémères de la session servent de traces complémentaires ; les nombres, méthodes
et limites nécessaires à l’évaluation sont conservés dans ce document.

## 1. Implémentation livrée

| Unité                          | Référence  | Comportement vérifié                                                                                                                                                                          |
| ------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| É2-A, lecteur de paquets       | `d6d79846` | YAML et ZIP bornés, corpus de 91 archives hostiles, normalisation des images, assemblage sous révision de contenu.                                                                            |
| É2-B et É3, stockage et API    | `ed083308` | Ressources mémoire/YAML/PostgreSQL, migration 0008, activation conditionnelle, import/export, projections de présentation, ressources authentifiées, schéma et événements complets de device. |
| SDK et CLI                     | `6d93d6b0` | `drivers.installPackage/exportPackage/getPresentation`, projection et ressources des devices, endpoint de schéma, blobs authentifiés, `gridone drivers validate/pack`.                        |
| É4, branchement de la page     | `c5616827` | Résolution présentation → supervision/contrôle standard → panes, SDK injecté, conservation du runtime des commandes pendant les replis, diagnostics et filtres de groupe.                     |
| Accessibilité et permissions   | `b4012e3c` | Gardes de touches de face, contraste des écarts et défilement mobile du tableau.                                                                                                              |
| É5, authoring et compatibilité | `42c0fa24` | Import YAML/ZIP, export ZIP, diagnostics localisés, remplacement conditionnel sur `/drivers/:id/edit`, locales, fixture YAML/TypeScript commune.                                              |

Les derniers correctifs sont `9a7a4bab` (sérialisation HTTP sans valeurs
optionnelles nulles), `cdf00d22` (conservation de la communication pour une
présentation seule) et `4e3bee60` (radios natives, contraste et entête accessible).
Les gates finales ci-dessous incluent ces correctifs.

Le contrat d’auteur public est décrit dans la
[référence des présentations](../src/reference/device-presentations.md), notamment
« Packaging and import ». Les noms de capacités et widgets demeurent génériques ;
les exemples thermostat et pompe sont des données de fixture.

### Activation et cohérence

Les ressources normalisées sont publiées sous une révision immuable avant la
mise à jour du driver. Le stockage applique un compare-and-swap sur le snapshot
durable du driver ; `expected_revision` compare le jeton public de présentation,
qui comprend le document, les contrats d’attributs et les ressources.
`Driver.presentation_revision` est un pointeur de ressources en lecture seule,
distinct de ce jeton public et absent lorsque le paquet n’a pas de ressources.

En YAML, les fichiers temporaires sont synchronisés puis remplacés atomiquement ;
la séquence utilise `fsync` et `F_FULLFSYNC` sur Darwin. En PostgreSQL, la
publication des ressources est transactionnelle, puis la mise à jour conditionnelle
du driver est durable avant sa publication en mémoire. La même connexion verrouillée
sert à la publication, au CAS et au nettoyage : l’installation ne reprend pas une
seconde connexion susceptible d’épuiser le pool.

Le verrou couvre aussi le transfert de synchronisation et l’émission des mises à
jour complètes des devices. Un ancien `stop_sync` suspendu ne peut pas reprogrammer
une ancienne révision après une nouvelle installation. Les ressources courantes et
précédentes sont conservées, les plus anciennes élaguées après activation.

Une installation purement visuelle conserve les instances de devices, attributs,
télémétrie, tâches de synchronisation et attentes de commande. Le contrat du driver
est comparé exhaustivement, hors présentation, pointeur de ressources et timestamps
serveur. Le nouveau driver est affecté aux instances seulement après CAS ; les
mises à jour complètes sont émises sans arrêt/redémarrage. Tout autre changement
conserve la reconstruction et le transfert de synchronisation sous verrou.

Les réponses HTTP de présentation omettent les champs optionnels absents du
modèle (`visible_when`, `blocked_when`, `group`, `formatter`, etc.) ; leurs valeurs
par défaut Python `None` ne deviennent pas des `null` incompatibles avec le
renderer. Deux tests traversent réellement la sérialisation HTTP des routes
driver/device, avec une instance Pydantic complète.

## 2. Gates et couverture

| Vérification                                                                                    | Résultat                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend, `pytest packages/devices_manager packages/api packages/models -m "not integration" -q` | **3 453 réussis**, 157 désélectionnés, 12 avertissements ; 38,51 s lors du dernier run sans instrumentation.                                                                                         |
| Qualité Python                                                                                  | `ruff check .`, `ruff format --check .` : 691 fichiers conformes ; `lint-imports` : 6 contrats conservés ; `ty check` : conforme.                                                                    |
| PostgreSQL réel                                                                                 | **48 réussis**, migration 0008 comprise, sur une base jetable dédiée dans `timescale/timescaledb:latest-pg16` ; 6,28 s. Conteneur supprimé après les essais ; aucune base de développement utilisée. |
| SDK                                                                                             | Génération des types sans diff OpenAPI/TypeScript, type-check, **200 tests réussis** dans 18 fichiers, build ESM/CJS/DTS ; tous relancés après les derniers correctifs.                              |
| CLI                                                                                             | **5 tests réussis** : YAML valide, erreur localisée, pack/export relisible, refus de symlink et de fichier non admis.                                                                                |
| UI ciblée                                                                                       | **505 tests réussis dans 52 fichiers**, couvrant présentations, authoring des drivers, pages devices et composants standards ; format, ESLint et TypeScript conformes.                               |
| Hooks du dépôt                                                                                  | `prek run --all-files` conforme après les unités locales.                                                                                                                                            |

La mesure de couverture complète, via `coverage run --source=devices_manager,api`
puis les mêmes suites backend, donne **91,85 %** des lignes exécutables. La
couverture du patch des sources backend est de **647/686 lignes, soit 94,31 %** :
lignes ajoutées/modifiées dans les sources API et devices-manager, plus tous les
fichiers source nouveaux, depuis `d6d79846`, croisées avec les lignes exécutées ou
manquantes de Coverage.py. Le run instrumenté a exécuté les mêmes **3 453 tests**
en 48,75 s. Cette mesure porte sur les lignes ; elle ne revendique pas une
couverture exhaustive des branches.

La collecte YAML inclut le dépôt voisin `gridone-setup` lorsqu’il est présent. Le
déplacement du manifeste pilote et la fusion de son document de présentation ont
retiré deux YAML plats, soit quatre cas (parseurs Python et C). Deux tests nouveaux
(sync concurrente et événement complet) ont donné 3 441 cas ; la collecte récursive
des `driver.yaml` de paquets a rétabli deux cas, soit **3 443**. Aucun test de refus
n’a été supprimé pour obtenir ce résultat. Un checkout sans le dépôt voisin a un
nombre de cas différent. Les deux régressions de sérialisation HTTP puis les huit
cas de conservation de synchronisation portent ensuite le total final à **3 453**.

La suite UI globale avait 21 échecs connus sous Node 25 dans
`TimeRangeSelect.spec.tsx` et `periodPreference.spec.ts`. Les 505 succès annoncés
sont ceux du périmètre ciblé ; ils ne sont pas présentés comme une suite UI globale
sans échec.

## 3. Gardes vérifiées par mutation

Chaque campagne commence par une base verte. Pour chaque mutation ci-dessous, le
même nombre total de tests a réellement été exécuté et des assertions ont échoué ;
un échec de collecte, un run vide ou le seul code de sortie ne comptent pas comme
preuve. Les sources ont été restaurées après chaque mutation.

| Campagne É2-B                                    | Base | Résultat après retrait/inversion de la garde |
| ------------------------------------------------ | ---- | -------------------------------------------- |
| Ressources écrites après activation              | 42   | 1 échec / 41 succès                          |
| Registre publié avant persistance                | 42   | 1 / 41                                       |
| `expected_revision` ignorée                      | 42   | 2 / 40                                       |
| Plafond de flux ignoré                           | 42   | 1 / 41                                       |
| CAS mémoire ignoré                               | 42   | 2 / 40                                       |
| Intégrité de ressource ignorée                   | 42   | 1 / 41                                       |
| Résultat CAS PostgreSQL ignoré                   | 42   | 2 / 40                                       |
| Transfert de synchronisation déplacé hors verrou | 14   | 1 / 13                                       |

La campagne É3 a fait échouer les gardes de révision (3/11), validation de
configuration (1/11), activation du device (1/11), ressources manquantes (3/9) et
`nosniff` (1/9). Les dénominateurs sont les totaux réellement exécutés pour chaque
sous-suite.

Pour É4, six mutations ont chacune exécuté **37 tests** : priorité de résolution
(7 échecs), écriture en vol (2), durée de vie du runtime (1), permission (2),
rafraîchissement (3), filtre de groupe (1). Le retrait de la garde d’activation
d’une touche de face a produit **1 échec / 12 succès** ; la fixture de parité
YAML/TypeScript altérée a produit **1 échec sur 1 test**.

É5 compte dix mutations de **23 tests chacune** : fichier requis (2 échecs), ID
requis (1), YAML requis (1), purge du fichier après changement de source (1),
transmission de `expectedRevision` (2), attente de révision (1), conflit 409 (2),
interdiction de soumettre pendant le conflit (2), maintien du conflit si la recharge
échoue (1), refus d’afficher comme diagnostic d’auteur une erreur interne 500 (1).

Une campagne complémentaire sur la conservation de la synchronisation exécute
**20 tests par mutation** : redémarrage forcé (2 échecs), réutilisation forcée malgré
changement de contrat (8), pointeur live non publié (3), publication avant CAS (4),
metadata ignorées (1), champs de communication ignorés (5), événement complet
supprimé (4). Les sources sont restaurées. Les deux mutations de sérialisation
HTTP exécutent chacune **2 tests : 1 échec / 1 succès**, puis une base restaurée à
2 succès.

### Crash de processus et portée de la preuve

Quatre tests YAML lancent un interpréteur neuf et le terminent par `os._exit(77)`
après chaque frontière de publication : fichier image, manifeste, dossier de
révision, pointeur du driver. Un nouveau stockage relit soit l’ancien driver
complet, soit le nouveau complet ; la ressource précédente reste lisible et une
nouvelle tentative aboutit. Ces essais prouvent l’ordre visible des opérations
après un crash de processus. Ils ne simulent pas une coupure d’alimentation : la
garantie de durabilité repose sur la séquence de synchronisation des fichiers et
des répertoires. Les 30 essais aléatoires `kill -9` cités dans l’annexe B sont ceux
du spike, pas une seconde batterie prétendument exécutée sur l’implémentation finale.

## 4. Performance de rendu après WebSocket

Le banc utilise un **build Vite de production** et un vrai transport WebSocket
local, alimenté par une télémétrie synthétique : **300 attributs, dont 150 mesures
visibles**, dix mises à jour de chauffe puis **100 échantillons**. Chaque échantillon
vérifie les 150 valeurs rendues.

La mesure démarre à `performance.now()` dans le callback de réception du message et
se termine au deuxième `requestAnimationFrame` suivant le commit DOM observé. Elle
comprend donc le traitement local et le délai de frames après mise à jour du DOM ;
ce n’est ni un chronométrage interne de React seul ni une mesure électrique du
rafraîchissement de l’écran.

| Machine / navigateur         | Valeur                                        |
| ---------------------------- | --------------------------------------------- |
| Machine de référence         | Apple M5 Pro, 24 GiB de mémoire, macOS 26.5.1 |
| Navigateur                   | Chrome 152                                    |
| Viewport                     | 1 440 × 1 440 pixels CSS                      |
| Médiane                      | **16,4 ms**                                   |
| p95                          | **17,7 ms**                                   |
| Maximum                      | **18,1 ms**                                   |
| Objectif ADR §15, critère 10 | p95 < 100 ms : **atteint sur ce banc local**  |

Aucun broker MQTTS, thermostat physique, aller-retour de commande ou écho firmware
n’entre dans cette mesure. Elle ne préjuge pas des latences réseau, des machines
moins puissantes, des onglets bridés en arrière-plan ou de toutes les compositions
permises par le dialecte. Le banc et ses données synthétiques ne constituent pas
un mode essai livré dans le produit. Le banc a été fermé, son serveur local arrêté
et le viewport restauré après la campagne.

## 5. Accessibilité et CSP : observations partielles

L’examen manuel initial du build de production, avant conversion de certains
contrôles en radios natives, a constaté :

- 16 boutons de présentation, tous nommés ; aucune image sans attribut `alt` ;
- contrôle mobile à **375 × 812 pixels CSS** : une largeur document de 510 pixels
  a révélé un texte `sr-only` absolu hors contenant positionné ; après ajout d’un
  contenant relatif, document et body mesurent **375 pixels**, le tableau défile
  intérieurement (**487 pixels dans 277 pixels**) et la plus petite cible de face
  mesure **59,15 pixels** ;
- activation au clavier par Entrée d’une touche de face, avec commande confirmée
  dans le banc ; verrou local exposé par `aria-disabled="true"` ;
- permission viewer propagée aux touches de face : état désactivé et aucune
  écriture ; la garde utilise les droits d’écriture et la capacité d’action du runtime ;
- correction générique des textes d’écart sur fond blanc : `emerald-600` et
  `amber-600` donnaient respectivement 3,77:1 et 3,19:1 ; les variantes 700 donnent
  **5,48:1 et 5,02:1** dans cette configuration.

Un audit **axe-core 4.13.0**, installé temporairement dans `/tmp` sans dépendance
ajoutée au dépôt, a ensuite détecté deux défauts supplémentaires : contraste des
libellés de radios à 4,39:1 et entête de tableau vide. Les corrections génériques
utilisent `text-foreground/80`, un intitulé « Paramètre » masqué visuellement et des
radios natives. La navigation par flèche droite a été vérifiée dans le navigateur
avec une commande `mode=cool` dans le banc, ainsi que par test automatisé.

| Audit final ciblé sur le build de production | Violations | Règles réussies | Résultats incomplets |
| -------------------------------------------- | ---------- | --------------- | -------------------- |
| Desktop 1 440 × 1 440, thème clair           | 0          | 30              | 0                    |
| Desktop 1 440 × 1 440, thème sombre          | 0          | 30              | 0                    |
| Mobile 320 × 812, thème clair                | 0          | 31              | 1 (`color-contrast`) |
| Mobile 320 × 812, thème sombre               | 0          | 31              | 1 (`color-contrast`) |

Le résultat mobile incomplet concerne six cellules masquées par le défilement du
tableau ; leurs couleurs passent le contrôle desktop. Le document ne déborde pas
les 320 pixels CSS et la plus petite cible de face mesure **47,4 pixels**.
La mutation remplaçant les radios par des checkboxes produit **3 échecs / 5 succès**,
puis **8 succès** après restauration.

Ces observations couvrent la présentation du banc, pas toutes les pages, états,
technologies d’assistance ou le zoom à 400 %. L’absence de violations détectées
n’est pas une certification d’accessibilité ; les résultats incomplets mobiles
restent explicitement consignés.

Aucune erreur ou alerte CSP n’a été observée sur le banc local. Le parcours produit
complet, les anciens `image_src`, les polices et les déploiements avec API séparée
n’ont pas été intégralement audités. La CSP demeure **Report-Only** ; ce constat ne
justifie pas sa promotion en politique obligatoire.

## 6. Porte matérielle et travail restant

Les **dix vérifications de l’annexe A §6 restent à exécuter**. L’accès à l’instance
reliée au broker MQTTS et au thermostat du bureau manque encore. Les résultats des
spikes, les tests avec transports simulés et le WebSocket synthétique ne remplacent
aucun de ces dix résultats.

Le dépôt `gridone-setup` livre le paquet pilote dans
`src/services/fixtures/drivers/agrid_thermostat_mqtts/` et l’installation par
`PUT /drivers/{id}/package`. Les fichiers `docs/pilot-validation.md` et
`src/seed/inventory.py` fournissent le protocole et la collecte, au commit
`0fe40451725d3face899f93bc4ab2eeb2e2d3947`, avec **121 tests réussis** et un dépôt
propre après commit.

Le collecteur distingue le snapshot API en cache (`GET` seuls) de la lecture active
via l’option `--refresh` et les routes de rafraîchissement des attributs. Il
n’exécute aucune commande d’écriture. Les épreuves de clamp, de type JSON MQTT,
double écho, verrous, modes, capteurs et changements spontanés restent des essais
matériels séparés, accompagnés des valeurs initiales, captures brutes, heures et
restaurations. Une lecture active pendant l’observation de publications spontanées
invaliderait cette observation.

Avant d’accepter l’ADR et de clore la fonctionnalité, joindre les dix verdicts
matériels, les résultats d’accessibilité restants et la décision CSP fondée sur le
parcours complet. Le changelog Unreleased et les notes de suivi sont livrés ;
l’acceptation de l’ADR et la publication restent en attente. Aucun push,
PR, bump de version ou tag n’est impliqué par ce rapport.

## 7. Changelog sans publication

Le changelog a été généré avec Commitizen **4.18.0**, après le dernier commit de code
`4e3bee60`, via `cz changelog --incremental --unreleased-version Unreleased`.
La section Unreleased regroupe les commits conventionnels depuis `v0.226.0`.
Cette commande ne déclenche pas le hook de bump : version 0.226.0 conservée,
aucun tag, commit automatique, push ou PR. Une ancienne référence locale
`backup/pre-scrub-AGR-1010` ne correspondant pas au format des tags a produit un
avertissement ; la génération a réussi et le contenu a été vérifié.

## 8. Suivi partagé

Le commentaire de suivi a été publié dans
[Linear AGR-1198](https://linear.app/agrid-bms/issue/AGR-1198/thermostat-ui-driver)
après vérification du workspace Agrid, sans changer le statut du ticket.
La [note Notion](https://app.notion.com/p/3d6e7a2bcfa3811bb11ad4e4b68e3cf0?pvs=204),
créée sous la page Gridone et relue après création, reprend les commits, résultats
et limites. Le dernier `prek run --all-files` est conforme sur tous les hooks.
