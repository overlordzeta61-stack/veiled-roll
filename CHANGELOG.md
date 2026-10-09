# Journal des modifications

Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [2.1.0] — 2026-10-09

### Modifié

- **Réponse personnelle : le joueur ne voit plus son résultat.** Il lance ses dés normalement, mais son chuchotement affiche « Ton résultat : personnel » à la place du total, avec la mention « Cette réponse t'est réservée : elle est vraie, quel que soit ton dé ». Un mauvais jet ne le fait donc plus douter. Le MJ voit toujours le vrai total (diagnostic, panneau, historique). Même chose pour « Renvoyer » depuis l'historique.
- Dés 3D privés (Dice So Nice) : l'animation est désormais jouée par le MJ une fois la réponse connue, et **pas du tout** pour une réponse personnelle (la face du dé trahirait le résultat).
- Onglet **À faire** repensé :
  - zone **En cours** épinglée en haut : pour chaque jet demandé, progression (« 1/2 »), joueurs ayant lancé et joueurs attendus, réponse personnelle signalée ;
  - **Relancer** renvoie l'invite aux seuls retardataires, **Clore** arrête d'attendre (le jet passe en « Fait » si quelqu'un a répondu, sinon il revient « à faire ») ;
  - jets regroupés par **dossier puis scène** : le nom de la scène et son bouton de modification n'apparaissent qu'une fois ;
  - type de jet affiché sous le libellé, et joueurs ayant une réponse personnelle visibles directement en étiquettes ;
  - **filtre instantané** (jet, scène, dossier, joueur) dès que la liste dépasse six jets ;
  - liste vide : bouton « Nouveau jet voilé » directement proposé.
- Quand le MJ lance le jet à la place d'un joueur (sur son personnage), ce joueur est bien compté comme ayant répondu.
- Nouvelle commande `npm run package` : produit `build/veiled-rolls.zip` prêt à installer.

## [2.0.0] — 2026-10-09

### Ajouté

- **Réponses personnelles** : sur chaque jet, le MJ peut réserver un texte à un joueur précis. Ce joueur le reçoit d'office, quel que soit son total (y compris quand le MJ lance pour son personnage) ; les autres reçoivent la réponse de leur palier. Signalées dans le panneau, le sélecteur de joueurs, la bibliothèque, le diagnostic MJ et l'historique.
- Panneau en trois onglets avec compteurs : **À faire** (jets demandés en tête, avec les joueurs encore attendus), **Faits** (qui a lancé, total, aperçu de la réponse) et **Historique**.
- Actions par jet : modifier, marquer comme fait, remettre à faire.
- Bouton **Nouveau jet voilé** directement dans le panneau.
- Testeur intégré à chaque jet, avec option « en tant que » un joueur.
- Projet source reconstitué (TypeScript, Vite, Vitest) et nouvelle suite de tests.

### Modifié

- **Éditeur sur une seule page**, sans onglets : nom et dossier, puis une carte par jet (type, compétence, paliers, réponses personnelles, test), et les réglages rares repliés dans « Options avancées ». La notion de « branche » disparaît de l'interface.
- Un nouveau jet démarre avec trois paliers pré-remplis (≤ 9, 10–14, ≥ 15) ; les paliers laissés vides sont ignorés à l'enregistrement.
- Libellé automatique (nom de la compétence) si le champ est laissé vide ; dossiers existants proposés à la saisie.
- Participants « joueurs choisis » sélectionnés par cases à cocher ; « Utiliser les pions sélectionnés » pour les modes pions/acteurs.
- **« Nouvelle session » conserve l'historique** : l'état « fait » est désormais stocké à part (migré automatiquement depuis l'historique existant).
- Recherche de la bibliothèque instantanée (elle ne filtrait qu'au clic).
- Schéma de données en version 2 (`personal_responses`) ; les données et exports v1 restent lisibles.
- Feuille de style réécrite et allégée.

### Non testé

- Comme les versions précédentes, pas d'exécution dans une instance Foundry réelle. Les fenêtres et le traitement des jets ont été vérifiés dans Chromium avec un Foundry simulé.

## [1.4.1] — non daté

### Modifié

- Chaque jet propose désormais un bouton **Groupe** et un bouton **Joueur(s)** ; ce dernier ouvre un sélecteur multi-joueurs (le bouton reste présent même sans joueur connecté, au lieu d'afficher un bouton par joueur).
- Boutons placés à droite, sur la même ligne que le libellé du jet : lignes plus fines et liste plus lisible.

## [1.4.0] — non daté

### Modifié

- Panneau centré sur une **liste des jets préparés**, regroupés par **dossier** (le champ que le MJ utilise comme session/chapitre) pour rester lisible à mesure que la campagne grandit ; chaque dossier est repliable et affiche sa progression (faits/total).
- **Changement de couleur** par statut de jet : à faire (neutre), demandé (verdigris), fait (liseré et fond laiton). L'état « fait » persiste **entre les sessions** (dérivé de l'historique conservé).
- Demander un jet **charge automatiquement** son bloc : plus besoin d'activer un bloc au préalable. La liste des blocs séparée disparaît (édition via la Bibliothèque).
- Nouvelle action **« Nouvelle session »** : désactive le filtre, réinitialise les participants et efface l'historique, ce qui remet tous les jets en « à faire ».

## [1.3.0] — non daté

### Modifié

- Design aligné sur Campaign Scriptorium (palette vellum/verdigris/laiton, cartes et puces, coins discrets) pour une continuité entre les deux modules.
- Liste des blocs sans boutons activer/désactiver : on **charge** un bloc en cliquant sa ligne ; il devient la source des demandes.
- Chaque jet préparé affiche un statut **À faire / Demandé / Fait**, avec compte des jets restants ; les jets faits sont estompés.

### Ajouté

- Auto-désactivation : le filtre se coupe seul quand tous les jets demandés ont été répondus (par toutes les cibles). Non vérifié en instance réelle, en particulier avec plusieurs MJ.

## [1.2.0] — non daté

### Modifié

- Panneau recentré sur la **demande de jets**. La demande devient l'action principale : elle déclenche automatiquement un jet voilé du bon type, sans étape d'activation entre deux jets.
- Chaque jet du bloc actif propose désormais un bouton **Groupe** et un bouton par **joueur** connecté (demande individuelle), en un clic.
- La section « État du filtre » est remplacée par un bandeau compact (bloc chargé, nombre de jets traités, actions modifier/réinitialiser/désactiver).
- La confirmation d'envoi nomme les joueurs ciblés.

## [1.1.0] — non daté

### Ajouté

- Le joueur voit désormais son propre total dans le chuchotement (option « Montrer son résultat au joueur »), visible de lui seul et du MJ.
- Teinte de la réponse selon le degré de réussite atteint (rouge → vert), option « Colorer la réponse selon le degré de réussite ».
- Gestion de Dice So Nice par bloc : « Désactivés » ou « Privés (lanceur + MJ) », en remplacement de l'ancienne case unique. Migration automatique des blocs existants.
- Mode « Demander un jet » : depuis le panneau, le MJ envoie une invite de jet aux joueurs (tous ou une sélection), à partir des jets du bloc actif ; le joueur reçoit une boîte de dialogue et son jet suit l'interception normale.
- Colonne « Résultat » dans la liste des participants.

### Non testé

- L'animation privée Dice So Nice et le déclenchement automatique du jet demandé (API dnd5e `rollSkill`/`rollAbilityCheck`/`rollSavingThrow`) n'ont pas été exécutés en instance réelle.

## [1.0.0] — 2026-07-17

### Ajouté

- Interception des jets D&D5e 5.x (compétence, caractéristique, sauvegarde) via les hooks « V2 », avec masquage de la carte publique avant sa création.
- Blocs d'évènement : sélecteurs de jets, branches et paliers de réponse en mode plage exclusive ou seuil cumulatif, dés naturels (1/20), réponse par défaut, choix aléatoire entre réponses de même palier.
- Résolution côté MJ responsable et envoi privé de la réponse narrative au joueur, avec carte de diagnostic MJ.
- Stockage des blocs et de l'historique dans un JournalEntry privé du MJ ; seule une projection publique non sensible du filtre actif est diffusée.
- Routage joueur → MJ par socket, avec élection déterministe du MJ responsable et déduplication des requêtes.
- Politiques de doublons (accepter tout, un par acteur, remplacer le précédent, demander au MJ) et modes de participation (tous, pions/acteurs/utilisateurs sélectionnés).
- Fermeture automatique du filtre (manuelle, après un nombre de jets, quand tous les participants attendus ont joué).
- Interfaces ApplicationV2 : panneau de contrôle, bibliothèque de blocs (recherche, CRUD, import/export) et éditeur de bloc à onglets avec outil de test hors chat.
- Import/export JSON avec neutralisation du HTML dangereux et gestion des conflits (dupliquer, remplacer, ignorer).
- Localisation complète français et anglais ; styles préfixés et compatibles thèmes clair/sombre.
- Garde-fous : sur erreur, le joueur reçoit toujours une note et le MJ est notifié (aucune perte silencieuse).

### Testé

- 42 tests Vitest couvrant la logique métier pure (résolution, validation, participants, doublons, import/export).

### Non testé

- Exécution en instance Foundry live : interception réelle, multijoueur, Dice So Nice et rendu des fenêtres sous Foundry v13 restent à valider sur une vraie table.
