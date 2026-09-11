# AGR-1231 — Groupes d’équipements à driver commun

Issue : [AGR-1231](https://linear.app/agrid-bms/issue/AGR-1231)

Date : 11 septembre 2026.

Statut : spécification rédigée ; implémentation à réaliser.

## Objectif

Permettre à un opérateur de constituer des groupes nommés d’équipements pour les retrouver et leur appliquer des commandes communes : « Tous les thermostats du bâtiment → ON », « Chambres Est → 25 °C ». Un groupe est un ensemble explicite de devices choisi par l’opérateur, indépendant de leur zone. En première version, tous ses membres utilisent le même driver.

## Décisions validées

- Composition manuelle dans une interface dédiée ; pas de peuplement automatique par critères en V1.
- Compatibilité fondée sur le même `driver_id`, pas seulement sur le type fonctionnel ni sur un nom de driver identique. Le regroupement entre drivers différents pourra être étendu ultérieurement.
- Un équipement peut appartenir à plusieurs groupes.
- Groupes partagés entre les utilisateurs : consultation par les lecteurs, opérateurs et administrateurs ; création, modification, suppression et pilotage par les opérateurs et administrateurs, dans le respect des permissions d’attribut existantes.
- Onglet « Groupes » dans la page Équipements, avec liste, création et fiche de groupe.
- Fiche reprenant la présentation et les contrôles du driver utilisés par la fiche d’un équipement, avec accès aux membres.
- Valeur commune affichée lorsque tous les membres s’accordent ; « Valeurs multiples » sinon, y compris pour les mesures. Pas de moyenne implicite.
- Prévisualisation dans une modale et confirmation systématique avant chaque envoi manuel, quel que soit le nombre de membres.
- Possibilité de décocher des membres uniquement pour l’envoi en cours, sans modifier le groupe.
- Groupes utilisables dans les actions de commande des automatisations dès cette version ; membres résolus au moment de chaque exécution.
- Suppression du groupe sans supprimer ses équipements ; suppression d’un équipement entraînant son retrait des groupes.
- Changement de driver d’un équipement bloqué tant qu’il appartient à un groupe : le retirer d’abord des groupes concernés.
- Suppression d’un groupe référencé par une automatisation bloquée ; les références doivent être retirées avant suppression.
- Erreurs et avertissements explicites : opération concernée, éléments concernés, raison compréhensible et action permettant de résoudre le problème.

## Parcours et comportement

### 1. Créer et gérer les groupes

L’onglet « Groupes » présente le nom, le driver et le nombre de membres. Le bouton « Créer un groupe » ouvre un formulaire dédié : nom obligatoire, description facultative, choix du driver et sélection des équipements compatibles. Recherche et filtres de sélection peuvent aider à constituer la liste, mais les IDs choisis sont enregistrés explicitement.

La fiche donne accès à la modification du nom, de la description et des membres, ainsi qu’à la suppression. La liste des membres permet d’ouvrir chaque équipement. L’ajout ou le retrait d’un membre ne change pas ses autres groupes, sa zone ou ses tags.

Conventions de fonctionnement retenues pour compléter le cadrage :

- Un membre ne figure qu’une fois dans un groupe ; un groupe avec un seul membre est valide.
- Un groupe peut rester vide après retrait ou suppression de ses membres. Afficher « Ce groupe ne contient aucun équipement. Ajoutez des équipements pour le piloter. » ; aucune commande ne peut être envoyée.
- Un groupe conserve son driver de référence. Le formulaire d’édition ne propose pas de changer ce driver en V1.
- Modifier les membres d’un groupe utilisé par des automatisations affiche les automatisations concernées et précise que les prochaines exécutions utiliseront la nouvelle composition.
- Ajouter un membre ne lui applique pas la dernière consigne du groupe. Le groupe ne maintient pas une synchronisation permanente entre ses membres.

### 2. Consulter et piloter un groupe

Réutiliser la même présentation du driver : dispositions, libellés, unités et contrôles. L’en-tête identifie clairement le groupe et son nombre de membres. Les paramètres propres à un équipement, notamment sa configuration de transport, ne deviennent pas des réglages collectifs.

La représentation des valeurs distingue :

- **Valeur commune** : tous les membres ont une valeur connue et identique.
- **Valeurs multiples** : plusieurs valeurs connues différentes ; le détail des membres permet de les consulter.
- **Valeurs partiellement indisponibles** : signaler le nombre de membres sans valeur connue ; ne pas prétendre que la valeur connue est partagée par tout le groupe.
- **Indisponible** : aucune valeur connue.

Les valeurs affichées restent les valeurs remontées par les équipements. Une commande acceptée ne remplace pas artificiellement toutes les valeurs par sa cible.

Les contrôles doivent supporter les états multiples et inconnus sans choisir arbitrairement la valeur du premier membre. Pour un contrôle qui dépend d’un état courant unique, par exemple un bouton d’incrément ou de bascule, proposer un choix explicite de la valeur cible lorsque cet état est mixte ou inconnu. La V1 applique une même valeur absolue aux destinataires ; elle n’ajoute pas d’opération relative calculée séparément pour chaque membre.

Les contraintes et conditions de contrôle dépendant d’autres attributs restent évaluées par équipement. Une vue agrégée ne doit pas rendre une action autorisée sur un membre où elle est interdite.

### 3. Prévisualiser, confirmer et suivre l’envoi

Une action dans la fiche prépare la commande puis ouvre une modale. Aucun envoi ne part avant confirmation, y compris pour un groupe d’un seul membre. Annuler ferme la préparation sans effet sur les équipements.

Réutiliser les composants et comportements d’[AGR-1216 — Revoir la façon de passer des consignes à plusieurs équipements](https://linear.app/agrid-bms/issue/AGR-1216) :

- Nom du groupe, attribut, valeur cible et nombre de destinataires.
- Une ligne par membre avec son nom, sa valeur avant, la valeur après prévue et les éventuels avertissements.
- Membres éligibles sélectionnés initialement ; possibilité de les décocher. Les membres non éligibles restent visibles avec une raison, sans exclusion silencieuse.
- Contraintes connues présentées dans l’aperçu ; validation effective par équipement au moment de l’écriture, conformément à AGR-1216.
- Bouton « Appliquer à N équipements », désactivé lorsque la sélection est vide ou qu’un envoi est déjà en cours.
- La confirmation de cette modale remplace la confirmation supplémentaire au-delà de 10 équipements : ne pas ouvrir deux confirmations successives.
- Suivi des commandes du lot avec états en cours, réussi et en échec, bilan global et accès à l’historique.

Chaque nouvelle préparation repart des membres actuels du groupe ; les exclusions du précédent envoi ne sont pas mémorisées.

La commande manuelle utilise la sélection effectivement prévisualisée et confirmée. Un ajout au groupe pendant l’ouverture de la modale ne doit pas ajouter de destinataire silencieusement. Si un équipement sélectionné a été retiré du groupe, supprimé ou rendu incompatible avant confirmation, actualiser l’aperçu et demander une nouvelle confirmation avant l’envoi.

Un membre en échec ne provoque pas l’annulation des commandes réussies sur les autres. Conserver la sémantique d’exécution par équipement d’AGR-1216 ; pas de transaction globale ni de nouvelle relance automatique dans cette tâche. Distinguer un avertissement avant envoi d’un échec réel d’exécution.

### 4. Utiliser les groupes dans les automatisations

Le formulaire d’action de commande permet de choisir un groupe, l’attribut et la valeur, directement ou via un modèle de commande. Afficher le nom du groupe et indiquer que sa composition sera résolue à chaque exécution.

Enregistrer la référence au groupe, pas une copie des IDs de ses membres. Ajouter un équipement au groupe l’inclut dans les prochaines exécutions ; le retirer l’en exclut. Modifier ou rouvrir une automatisation doit préserver cette référence.

Une exécution résout les membres une fois pour constituer son lot ; les modifications suivantes n’altèrent pas un lot déjà envoyé. Les automatisations s’exécutent sans modale interactive.

Un groupe vide produit un résultat explicite « Aucune commande envoyée : le groupe “Chambres Est” ne contient aucun équipement. ». Une référence inconnue ou invalide produit une erreur explicite. Aucun de ces cas ne doit être interprété comme une sélection de tous les équipements. Les résultats par membre restent consultables via le lot de commandes existant.

Cette tâche couvre le groupe comme destinataire d’une action. Les déclencheurs ou conditions basés sur un état agrégé de groupe et les règles de synchronisation entre équipements restent hors périmètre.

### 5. Suppression, intégrité et messages

Valider l’existence des équipements, leur driver commun et les permissions côté API/service, même si le formulaire limite déjà les choix.

- Supprimer un groupe retire uniquement le groupe et ses appartenances. Les équipements et l’historique des commandes restent disponibles.
- Supprimer un équipement retire ses appartenances. Un groupe devenu vide reste visible.
- Refuser le changement de driver d’un équipement encore membre de groupes et fournir leurs noms et liens.
- Refuser la suppression d’un groupe utilisé par une automatisation, même désactivée, et fournir les automatisations concernées avec leurs liens. Prendre en compte les références indirectes via les modèles de commandes.
- Pour éviter les modèles cassés, signaler également les modèles de commandes encore réutilisables qui ciblent le groupe et demander de modifier ou supprimer ces références avant suppression. Les simples traces historiques de lots exécutés ne bloquent pas la suppression.
- Un driver référencé par un groupe, même vide, ne peut pas être supprimé en laissant ce groupe invalide.

Exemples de messages attendus :

- « Impossible d’ajouter “Thermostat 204” : son driver “B” est différent du driver “A” de ce groupe. Sélectionnez un équipement utilisant le driver “A”. »
- « Impossible de supprimer “Chambres Est” : ce groupe est utilisé par l’automatisation “Confort à 8 h”. Modifiez cette automatisation avant de supprimer le groupe. »
- « Impossible de changer le driver de “Thermostat 204” : cet équipement appartient à “Chambres Est” et “Tous les thermostats”. Retirez-le de ces groupes d’abord. »
- « 18 commandes réussies, 2 en échec », avec le détail de chaque équipement et la raison exploitable, par exemple « Équipement injoignable » ou « Consigne hors de la plage autorisée ».

Les messages sont localisés et proposent des liens lorsque l’utilisateur peut agir. Utiliser des erreurs métier et des informations structurées ; ne jamais afficher des messages d’exception bruts, requêtes SQL, chemins internes ou traces techniques.

## Critères d’acceptation

- [ ] Un opérateur crée un groupe nommé depuis Équipements → Groupes, sélectionne des membres utilisant le même driver et le retrouve après rechargement et redémarrage.
- [ ] L’API refuse l’ajout d’un équipement inconnu ou utilisant un autre driver sans enregistrer une composition partiellement invalide.
- [ ] Un équipement peut appartenir à deux groupes ; le retirer d’un groupe ne change pas l’autre.
- [ ] Un lecteur consulte groupes, membres et valeurs, mais ne peut ni gérer les groupes ni envoyer de commande ; l’API applique ces permissions.
- [ ] La fiche réutilise la présentation du driver ; les valeurs communes, multiples et indisponibles sont distinguées, sans moyenne ni valeur choisie arbitrairement.
- [ ] Une action manuelle ouvre l’aperçu avant → après ; aucune écriture n’a lieu avant confirmation, quel que soit l’effectif du groupe.
- [ ] Décocher un membre l’exclut uniquement de ce lot ; annuler n’envoie rien ; aucune sélection interdit la confirmation.
- [ ] Un membre ajouté après ouverture de l’aperçu ne reçoit pas la commande sans être inclus dans une nouvelle prévisualisation.
- [ ] Le retrait, la suppression ou l’incompatibilité d’un destinataire avant confirmation entraîne une actualisation de l’aperçu et une nouvelle confirmation.
- [ ] Les inéligibilités et contraintes sont expliquées par membre ; un double clic sur la confirmation ne crée pas deux lots.
- [ ] Un échec individuel reste visible sans masquer les réussites des autres membres ; le lot reste accessible dans l’historique.
- [ ] Une automatisation conserve une référence au groupe, y compris après édition ; l’ajout et le retrait de membres modifient les destinataires de la prochaine exécution.
- [ ] Un groupe vide ou une référence invalide ne déclenche aucune commande et ne devient jamais une cible globale.
- [ ] Supprimer un équipement nettoie ses appartenances ; supprimer un groupe libre de références conserve les équipements et l’historique.
- [ ] Le changement de driver d’un membre et la suppression d’un groupe encore référencé sont refusés avec les ressources concernées et l’action corrective.
- [ ] Modifier les membres d’un groupe utilisé par des automatisations avertit de l’effet sur les prochaines exécutions et permet d’identifier ces automatisations.

## Approche technique proposée

Conserver les groupes et leurs appartenances dans `devices_manager`, qui possède déjà les équipements et drivers, avec un stockage encapsulé proposant les mêmes garanties en mémoire et sur le backend persistant ; modèle typé, ID via `models.ids.gen_id()`, nom, description, driver, membres et métadonnées temporelles. Exposer leur gestion par des routes dédiées de `packages/api` et par le SDK TypeScript, puis réutiliser le moteur de présentation des drivers avec un contexte de groupe et les composants de prévisualisation/suivi d’AGR-1216. Étendre le contrat de cible partagé de `packages/models/src/models/targets.py` pour représenter une référence de groupe, et sa résolution dans `CompositeTargetResolver`, afin que commandes et automatisations utilisent le même mécanisme. Le contrôle des références entre groupes, modèles de commandes et automatisations appartient à la couche de composition, via les interfaces des services ; aucune importation latérale d’implémentation ni jointure entre bases de services. Les garde-fous doivent être centralisés et couvrir les chemins API et les exécutions automatiques, avec une cohérence des mutations empêchant les appartenances incompatibles et les références actives pendantes.

Points de mise en œuvre :

- Contrat indicatif : `DevicesFilter.group_id` facultatif, sans changer la signification des cibles existantes. S’il est combiné à d’autres critères, leur sémantique reste une intersection. Ne pas transmettre aveuglément ce nouveau champ aux requêtes qui n’acceptent aujourd’hui que `ids/types/tags`.
- Une cible de groupe inconnue est une erreur ; une cible de groupe vide reste vide. Auditer tous les consommateurs du contrat partagé.
- Le lot manuel conserve les IDs confirmés ; les modèles/automatisations conservent la référence de groupe. L’historique conserve les destinataires réellement exécutés.
- Routes UI proposées : `/devices/groups`, `/devices/groups/new`, `/devices/groups/:id`, `/devices/groups/:id/edit`, en évitant la collision avec `/devices/:id`.
- Formulaires avec react-hook-form et zod ; accès API, calcul des valeurs communes et état de préparation dans des hooks, composants dédiés au rendu.
- Ne pas fabriquer un device physique fictif, un driver synthétique ou un second moteur d’envoi pour représenter le groupe.

## Validation de l’implémentation

Tests unitaires du service et de résolution des cibles, tests de stockage mémoire et intégration persistante, tests de routes avec services simulés, permissions centralisées dans `test_authorization.py`. Couvrir notamment l’homogénéité, les suppressions et références indirectes, les états mixtes/inconnus, la cible vide, les modifications pendant la prévisualisation, la résolution à chaque exécution et les échecs partiels.

Côté UI, tester les parcours critiques de création, de pilotage confirmé avec exclusions et de sélection du groupe dans une automatisation. Régénérer les types SDK ; exécuter les contrôles de qualité du dépôt et viser au moins 90 % de couverture du patch backend.

## Hors périmètre

- Groupes avec plusieurs drivers, groupes imbriqués et composition automatique par filtres.
- Recomposition d’un équipement depuis les points de plusieurs passerelles.
- Moyennes ou historiques agrégés, comparaisons entre groupes.
- Synchronisation permanente des membres, protection métier ou propagation PAC → thermostats.
- Déclencheurs et conditions d’automatisation fondés sur l’état agrégé du groupe.
- Opérations relatives par membre, relance automatique des échecs ou refonte du moteur d’automatisation.
- Modification collective des configurations de transport ou du driver des équipements.

## Références

- [AGR-1216 — Revoir la façon de passer des consignes à plusieurs équipements](https://linear.app/agrid-bms/issue/AGR-1216) : composants de prévisualisation et suivi par équipement.
- [AGR-1220 — Recherche : équipements, groupes et usages](https://linear.app/agrid-bms/issue/AGR-1220) : cette tâche concrétise le périmètre des groupes homogènes de pilotage.
- [AGR-1221 — Idiot proof automatisation](https://linear.app/agrid-bms/issue/AGR-1221) : règles de comportement entre équipements, distinctes du présent périmètre.
- [AGR-1140 — Comparer les équipements par groupes configurables](https://linear.app/agrid-bms/issue/AGR-1140) : usage analytique ultérieur.

## État du cadrage

Décisions fonctionnelles validées avec Bastien dans l’échange de cadrage. Les conventions complémentaires et l’approche technique ci-dessus précisent la proposition d’implémentation ; cette tâche reste à implémenter.
