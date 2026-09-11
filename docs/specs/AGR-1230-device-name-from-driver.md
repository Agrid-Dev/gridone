# AGR-1230 — Initialiser le nom d’un appareil depuis un attribut du driver

Issue : [Le thermostat_name doit pré-remplir le name du thermostat](https://linear.app/agrid-bms/issue/AGR-1230/le-thermostat-name-doit-pre-remplir-le-name-du-thermostat)

Statut : spécification proposée, implémentation à réaliser.

Date : 11 septembre 2026.

## Objectif

Lorsqu’un thermostat possède déjà un nom dans `Thermostat_Name`, utiliser ce nom pour initialiser son identité dans Gridone. Par exemple, un appareil découvert avec la MAC `A0F2628ED028` doit devenir « Ch 02 » dès que Gridone lit cette valeur sur le thermostat.

La fonctionnalité doit être générique : le driver déclare l’attribut source et le service applique la règle pour tout équipement et tout protocole compatible. Le code Python et React ne doit contenir aucune condition liée à un fabricant ou au nom `thermostat_name`.

## Comportement retenu pour cette proposition

- Initialiser le nom une seule fois, à partir de la première valeur exploitable.
- Donner la priorité à un nom choisi par l’utilisateur, à la création ou ultérieurement.
- Conserver le nom Gridone après cette initialisation, même si le nom sur l’équipement change.
- Appliquer le mécanisme aux nouveaux appareils et aux appareils existants dont le nom est vide. Pour les anciens noms non vides, prévoir une reprise explicite, car leur origine n’est pas enregistrée.

Ces choix précisent la proposition discutée ; aucune synchronisation permanente ou bidirectionnelle n’est prévue dans cette version.

## État actuel

- Le driver de référence dans `gridone-setup/src/services/fixtures/drivers/agrid_thermostat_mqtts/driver.yaml` expose déjà l’attribut chaîne `thermostat_name`. Il lit et écrit la variable `Thermostat_Name` et contient le codec d’extraction du message MQTT.
- Le firmware définit cette variable comme un nom libre, vide par défaut.
- `DiscoveryHandler.try_parsing_name()` construit le nom à partir des valeurs de configuration : ici, la MAC. Les attributs présents dans le message de découverte sont également décodés et transmis au nouvel appareil.
- `DeviceCreate` autorise un nom vide. Le formulaire d’identité reprend `device.name` et renvoie actuellement le nom même lors d’une modification d’un autre champ.
- Le stockage conserve le nom, mais aucune information permettant de distinguer un nom généré d’un nom personnalisé.
- Le driver thermostat possède un groupe `full_refresh` qui demande `READ_DATA` avec `data: ALL`, au démarrage de la synchronisation puis toutes les heures. Le nom peut donc arriver après la découverte.

## Contrat du driver

Ajouter un bloc facultatif au niveau racine du YAML :

```yaml
identity:
  name:
    attribute: thermostat_name
```

`identity.name.attribute` référence le nom d’un attribut déclaré dans le même driver. Le bloc signifie « cet attribut fournit le nom initial de l’appareil ». Le comportement d’initialisation unique est fixe dans cette version ; aucun paramètre de synchronisation n’est ajouté.

À l’import, à la création et à la mise à jour du driver :

- Valider ce bloc avec des modèles typés et l’inclure dans le schéma JSON, les exports YAML et les conversions du driver.
- Vérifier que la référence désigne un attribut existant, lisible et de type `str`.
- Rejeter une référence inconnue ou incompatible avant d’activer le driver.
- Préserver la validité de la référence lors d’un renommage d’attribut ; empêcher sa suppression tant que la référence n’est pas retirée ou remplacée dans la même opération.
- Sans déclaration `identity.name`, conserver le comportement actuel.

Réutiliser la convention existante des références `{ attribute: ... }` si elle convient. Ne pas ajouter un second codec ou un JSONPath dans `identity` : l’attribut fournit déjà la valeur décodée.

Le nom reste une métadonnée de l’appareil. Il ne doit pas être ajouté dans `discovery.field_getters`, qui produit la configuration servant notamment à identifier les appareils et éviter les doublons.

## Règles d’initialisation

Le service applique la règle suivante lorsqu’une valeur source est disponible :

1. Vérifier que l’appareil attend encore l’initialisation de son nom et que son driver déclare une source.
2. Vérifier que la valeur est une chaîne ; retirer les espaces en début et en fin avec `strip()`.
3. Ignorer une valeur absente, vide après normalisation ou incompatible avec les validations communes du nom. Ne pas convertir un nombre, une liste ou `null` en texte.
4. Enregistrer le nom normalisé et clôturer l’initialisation dans une même mutation durable.

Les espaces intérieurs, accents et la casse sont conservés. Ne pas appliquer au nom Gridone une limite spécifique au firmware thermostat.

| Situation                                                       | Résultat attendu                                                           |
| --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Création avec un nom non vide fourni par l’utilisateur ou l’API | Conserver ce nom ; initialisation automatique désactivée.                  |
| Création sans nom, valeur source déjà disponible                | Enregistrer immédiatement la valeur source valide.                         |
| Création sans nom, source inconnue                              | Conserver le comportement de secours actuel et attendre une valeur valide. |
| Découverte avec nom généré depuis la configuration              | Ce nom reste provisoire ; il ne bloque pas l’initialisation.               |
| Valeur source vide ou invalide                                  | Garder le nom courant et rester en attente.                                |
| Première valeur valide reçue ultérieurement                     | Remplacer le nom provisoire, puis clôturer l’initialisation.               |
| Valeur source modifiée après initialisation                     | Garder le nom Gridone.                                                     |
| Renommage explicite avant réception de la source                | Le choix de l’utilisateur clôture l’initialisation et reste prioritaire.   |
| Modification du réseau, de la configuration ou du driver        | Ne pas réinitialiser un nom déjà choisi ou initialisé.                     |

Le nom n’est pas un identifiant unique. Deux appareils peuvent recevoir le même nom sans être fusionnés ; leurs IDs et leurs configurations restent inchangés.

## État durable et concurrence

Ajouter au modèle de domaine et à ses représentations persistées un état interne `name_initialization_pending: bool`. Cet état n’est pas modifiable directement par l’API publique.

- Nouvel appareil : `true` en l’absence de nom non vide explicitement fourni, y compris lorsque la découverte génère un nom de secours ; `false` sinon.
- Initialisation réussie : passage à `false` avec le nouveau nom.
- Mise à jour explicite du champ `name` avec une chaîne : passage à `false`, même si la valeur est identique au nom courant ou volontairement vide. Effacer le nom ne réactive pas l’initialisation.
- Champ `name` absent ou `null` dans une mise à jour : conserver la sémantique actuelle d’absence de renommage et ne pas modifier cet état.
- Absence de source dans le driver : aucune initialisation n’est exécutée, même si l’état est en attente.

L’état doit survivre à la sauvegarde, au redémarrage et à la reconstruction d’un appareil après modification de son driver ou de son transport. Il ne doit jamais être déduit en continu d’une égalité entre le nom et la MAC.

La mutation automatique doit vérifier que l’initialisation est toujours en attente au moment d’appliquer l’écriture. La coordonner avec les renommages manuels afin qu’une lecture retardée ne puisse pas écraser un choix utilisateur. Mettre à jour `updated_at` lors de l’initialisation effective ; les messages suivants ne provoquent pas de nouvelles écritures du nom.

En cas d’échec de persistance, ne pas considérer l’initialisation comme terminée. Une nouvelle observation de la même valeur doit permettre une nouvelle tentative : ne pas dépendre exclusivement d’un événement « valeur différente ».

## Réception des données et architecture

Le mécanisme appartient à `devices_manager`, au niveau du traitement de l’identité de l’appareil et de ses mises à jour d’attributs. Le contrôleur HTTP et le frontend utilisent le résultat enregistré.

Couvrir les deux chemins suivants avec la même logique :

- Une valeur initiale déjà décodée, notamment lors de la découverte, avant la première sauvegarde.
- Une valeur reçue après l’enregistrement, par lecture ou message entrant, ainsi qu’une valeur restaurée pour un appareil encore en attente.

Ne pas limiter le traitement au callback de découverte : celui-ci ignore les appareils déjà connus. Ne pas réutiliser aveuglément `update_device()` pour chaque réception : son chemin actuel arrête et redémarre la synchronisation.

Le driver reste responsable de sa stratégie d’acquisition. Pour le thermostat, vérifier que la réponse au `READ_DATA ALL` existant alimente bien `thermostat_name`, y compris si la première trame de découverte ne contient pas le nom. Aucun polling supplémentaire n’est requis si ce chemin fonctionne. Pour les autres drivers, documenter que la source doit être alimentée par leur stratégie de lecture ou de réception existante.

Une absence de réponse ne bloque ni la création ni la découverte. L’appareil conserve son nom de secours jusqu’à une observation valide ; aucun délai maximal de nommage n’est garanti pour un équipement injoignable.

Le stockage encapsule la persistance et les migrations. Le service ne référence aucune table ou technologie de stockage. Les backends mémoire, YAML et PostgreSQL doivent présenter les mêmes règles.

## API et interface

- Conserver les champs publics `Device.name`, `DeviceCreate.name` et `DeviceUpdate.name` et les routes existantes.
- Le nom calculé est enregistré côté serveur et utilisé partout : identité, listes, recherche et détails. Il ne s’agit pas d’un simple placeholder du formulaire.
- La réponse de création peut encore contenir le nom de secours si la lecture est asynchrone ; les lectures suivantes renvoient le nom initialisé.
- Dans le formulaire d’édition, envoyer `name` seulement lorsque l’utilisateur l’a modifié. Enregistrer un autre champ ne doit pas transformer le nom provisoire en choix explicite ni écraser une initialisation récente avec une ancienne valeur du formulaire.
- À la réception d’une donnée appareil actualisée, mettre à jour le champ nom uniquement s’il n’a pas été modifié localement. Préserver toute saisie en cours et réutiliser les mécanismes de rafraîchissement existants.
- La création manuelle peut être enregistrée sans nom pour bénéficier de l’initialisation. Le libellé et la validation du formulaire doivent refléter cette possibilité déjà offerte par l’API.
- Renommer dans « Identité » ne déclenche aucune commande vers l’équipement. L’écriture de l’attribut `thermostat_name` garde son fonctionnement propre.

## Reprise des appareils existants

À la migration des enregistrements dépourvus du nouvel état :

- Nom vide après `strip()` : initialisation en attente ; elle s’exécute lorsque le driver déclare une source et qu’une valeur exploitable est disponible.
- Nom non vide : initialisation désactivée par défaut, pour préserver les noms déjà en place.

Un ancien nom égal à la MAC n’est pas une preuve de génération automatique. La reprise de ces noms se fait par une opération explicite sur une sélection vérifiée, avec affichage de l’ID, du nom courant et du nom proposé. Ne pas faire de renommage global implicite au déploiement.

La création d’un outil de reprise en masse est hors périmètre de cette version. Les appareils concernés peuvent être renommés via les opérations existantes après vérification des valeurs sources.

## Plan d’implémentation

1. Ajouter le contrat `identity.name` aux modèles de driver, ses validations et sa conservation dans les imports, exports et modifications d’attributs. Mettre à jour la documentation du schéma.
2. Ajouter l’état durable au modèle appareil, aux conversions et aux backends de stockage ; migrer les anciens enregistrements selon les règles ci-dessus.
3. Introduire la mutation générique d’initialisation, commune aux valeurs initiales et aux observations ultérieures, avec persistance et priorité aux renommages explicites.
4. Adapter le formulaire et les types générés concernés pour conserver l’intention utilisateur et accepter une création sans nom.
5. Ajouter `identity.name.attribute: thermostat_name` au driver dans le dépôt `gridone-setup`, puis vérifier le scénario de lecture complète. Déployer le support Gridone avant le nouveau driver.

## Critères d’acceptation et validation

| Scénario                                                     | Vérification                                                                                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Découverte avec `Thermostat_Name = "Ch 02"`                  | Le nom enregistré est « Ch 02 ».                                                                                             |
| Première trame sans nom, réponse ultérieure contenant le nom | La MAC est remplacée sans redécouverte ni création d’un doublon.                                                             |
| Source absente, vide, blanche ou d’un mauvais type           | Le nom courant et l’attente sont conservés ; aucune erreur ne bloque l’appareil.                                             |
| Valeur `"  Ch 02  "`                                         | Le nom devient « Ch 02 ».                                                                                                    |
| Création manuelle sans nom, puis lecture valide              | Même résultat que pour une découverte.                                                                                       |
| Nom explicitement fourni à la création                       | Aucune valeur reçue ne le remplace.                                                                                          |
| Renommage pendant une lecture en cours                       | Le nom choisi par l’utilisateur reste le résultat final en mémoire et en stockage.                                           |
| Mise à jour source après initialisation                      | Aucun changement de nom ni nouvelle écriture de l’identité.                                                                  |
| Redémarrage avant ou après initialisation                    | L’attente reprend ou reste clôturée, conformément à l’état persisté.                                                         |
| Échec de persistance puis réception de la même valeur        | L’initialisation peut aboutir sans changement de la valeur source.                                                           |
| Driver sans `identity` ou référence invalide                 | Compatibilité conservée dans le premier cas ; validation rejetée dans le second.                                             |
| Modification du driver, export puis réimport                 | Déclaration conservée, références valides, état de l’appareil préservé.                                                      |
| Ancien appareil au nom vide ou personnalisé                  | Le premier est éligible ; le second reste inchangé.                                                                          |
| Formulaire ouvert pendant l’initialisation                   | Champ intact actualisé avec les données reçues ; saisie en cours préservée ; sauvegarde d’un autre champ sans renvoi du nom. |
| Deux appareils annoncent le même nom                         | Deux appareils distincts sont conservés.                                                                                     |

Prévoir des tests unitaires paramétrés pour la normalisation, les transitions, les références du driver et les chemins de découverte. Tester la persistance et la concurrence avec les backends concernés, ainsi qu’une intégration MQTT couvrant la réception tardive du nom. Les tests UI ciblent la création sans nom, l’envoi des seuls changements de nom et la préservation des saisies.

Lors de l’implémentation, exécuter les outils de qualité du dépôt et les suites pertinentes : `prek run --all-files`, tests backend, puis lint, formatage, type-check et tests UI pour les changements frontend. Ce document ne constitue pas une validation matérielle du thermostat.

## Titre de commit suggéré pour l’implémentation

`feat(devices): initialize device names from driver attributes`
