# Jets voilés (Veiled Rolls)

Module Foundry VTT pour le système **D&D5e**. Il permet au MJ de « voiler » certains jets — compétence, caractéristique ou sauvegarde. Le jet est calculé normalement par D&D5e, mais son résultat et sa carte de chat publique sont masqués côté joueur ; à la place, une **réponse narrative préparée à l'avance** est chuchotée en privé au joueur en fonction du total obtenu.

L'usage typique : le MJ prépare, pour une scène, plusieurs paliers de réponse à un jet de Perception (« tu ne remarques rien », « une dalle sonne creux », « tu vois nettement le mécanisme »). Il active le filtre ; quand les joueurs lancent leur Perception, chacun reçoit discrètement la description correspondant à *son* total, sans que la table voie le chiffre.

## Ce qui a été testé, et ce qui ne l'a pas été

Par honnêteté, la distinction est importante.

**Couvert par des tests automatisés (Vitest, 42 tests).** Toute la logique métier pure : résolution des réponses selon les paliers (plage exclusive et seuil cumulatif, dés naturels, choix aléatoire à palier égal, réponse par défaut), validation des blocs, correspondance des participants, politique de doublons, et import/export (y compris la neutralisation du HTML dangereux). Le projet compile en TypeScript strict et le bundle se construit sans erreur.

**Non testé en conditions réelles.** Le module n'a **pas** été exécuté dans une instance Foundry live. Ne sont donc pas vérifiés par l'exécution : l'interception réelle des hooks D&D5e 5.x, le comportement en multijoueur (routage joueur → MJ responsable via socket), l'interaction avec Dice So Nice, et le rendu concret des fenêtres ApplicationV2 sous Foundry v13. Ces parties suivent la documentation et les conventions connues, mais doivent être validées sur une vraie table avant tout usage sérieux. Le bouton de contrôle de scène, en particulier, dépend d'une structure de hook qui a changé entre versions de Foundry ; le code gère les deux formes de façon défensive mais cela reste à confirmer.

## Fonctionnement technique

### Hooks retenus

Le module s'appuie sur les hooks « V2 » de D&D5e, introduits par la refonte des jets :

- **Pré-jet** : `dnd5e.preRollSkillV2`, `dnd5e.preRollAbilityCheckV2`, `dnd5e.preRollSavingThrowV2`, de signature `(config, dialog, message)`. Positionner `message.create = false` dans ce hook empêche la création de la carte de chat publique — c'est le point clé qui garantit que le résultat n'est jamais affiché puis masqué, mais bel et bien intercepté *avant* publication.
- **Post-jet** : `dnd5e.rollSkillV2`, `dnd5e.rollAbilityCheckV2`, `dnd5e.rollSavingThrowV2`, de signature `(rolls, data)`. Le total est lu sur `rolls[0].total`.

À noter : `preRollAbilityCheckV2` se déclenche aussi pour les compétences et les outils. Le gestionnaire de caractéristique « cède la main » lorsqu'il détecte une config de compétence/outil, pour éviter un double traitement. Tout accès aux structures internes de D&D5e est confiné dans un unique adaptateur (`src/adapters/dnd5e-roll-adapter.ts`), avec des accès défensifs et des repli : en cas de doute, le jet se déroule normalement plutôt que de risquer une exception.

### Choix de stockage (sécurité)

Foundry diffuse **tout réglage de portée `world` à tous les clients connectés**. Stocker les blocs complets — qui contiennent les seuils et les réponses secrètes — dans un réglage `world` les divulguerait aux joueurs. Le module respecte donc la règle « les joueurs ne reçoivent jamais de donnée secrète » ainsi :

- Les **blocs d'évènement et l'historique** sont conservés dans un **JournalEntry privé du MJ** (permissions `NONE` pour tous). Les joueurs n'y ont aucun accès.
- Seule une **projection publique non sensible** du filtre actif (les sélecteurs et la liste des participants, **sans** les réponses ni les seuils) est placée dans un réglage `world`. Elle sert uniquement à ce que le client d'un joueur puisse décider, localement, de masquer la carte publique de son jet avant qu'elle ne soit créée.

### Routage et autorité

Le client qui lance le jet effectue l'interception (masquage de la carte, marquage du jet). Le résultat est ensuite transmis par socket au **seul MJ responsable** (élu de façon déterministe via `game.users.activeGM`, avec repli), qui est le seul à résoudre la réponse et à l'envoyer. Les identifiants de requête sont dédupliqués pour qu'un jet soit traité exactement une fois, même avec plusieurs MJ connectés. En cas d'erreur, le principe est le **fail-safe** : le joueur reçoit toujours une note et le MJ est notifié — jamais de perte silencieuse.

## Installation

Le module n'est pas publié sur un dépôt distant : il s'installe manuellement.

1. Construire le module : `npm install` puis `npm run build` (produit `dist/module.js`).
2. Empaqueter : `npm run package` (produit `build/veiled-rolls/` et `build/veiled-rolls.zip`).
3. Décompresser le dossier `veiled-rolls/` dans le répertoire `Data/modules/` de Foundry, ou pointer un manifeste local vers `module.json`.
4. Activer le module dans un monde utilisant le système D&D5e.

## Commandes npm

- `npm run build` — vérifie les types (strict) puis construit le bundle ESM.
- `npm run typecheck` — vérification TypeScript seule.
- `npm test` — lance la suite de tests Vitest.
- `npm run coverage` — tests avec couverture.
- `npm run package` — assemble le dossier et le zip installables.

## API

Une fois prête, l'API est exposée sur `game.modules.get("veiled-rolls").api`. Toutes les méthodes sont réservées au MJ et renvoient des copies (jamais de référence interne, jamais de donnée secrète accessible à un joueur) :

- `openControlPanel()` — ouvre le panneau de contrôle.
- `openBlockLibrary()` — ouvre la bibliothèque de blocs.
- `activate(blockId)` — valide puis active un bloc ; renvoie l'état du filtre.
- `disable()` — désactive le filtre ; renvoie l'état.
- `getActiveState()` — copie de l'état courant du filtre.
- `getBlocks()` — copies de tous les blocs.

Exemple de macro : `game.modules.get("veiled-rolls").api.openControlPanel();`

## Réglages

Deux réglages configurables (MJ) : le signalement optionnel des jets inattendus (un participant concerné lance un jet non couvert par le filtre) et la taille maximale de l'historique privé.

## Notes de conception

Aucun texte d'interface n'est codé en dur : tout passe par `game.i18n` avec des clés préfixées `VEILED_ROLLS.*` (fichiers `lang/fr.json` et `lang/en.json`). Les styles sont préfixés `veiled-rolls`, utilisent les variables CSS de Foundry (thèmes clair/sombre) et n'emploient pas `!important`. Le HTML des réponses est neutralisé à l'import et à la validation. Le TypeScript est strict, `any` n'étant toléré qu'à la frontière avec les globales Foundry (fichier `src/foundry-shim.d.ts`).

## Résultat au joueur et couleur (v1.1)

Deux options par bloc, dans l'onglet Options de l'éditeur. « Montrer son résultat au joueur » ajoute le total au chuchotement — visible du seul lanceur et du MJ, jamais de la table. « Colorer la réponse selon le degré de réussite » teinte la réponse du rouge au vert selon le palier atteint (relativement aux paliers que tu définis, pas à un DD absolu ; un bloc à palier unique n'est pas coloré).

## Dice So Nice (v1.1)

Réglage par bloc : « Désactivés » (aucune animation, comportement d'origine) ou « Privés » (animation 3D visible du lanceur et des MJ uniquement, jamais des autres joueurs). Les blocs plus anciens sont migrés automatiquement. Non vérifié en instance réelle.

## Demander un jet (v1.1)

Quand un bloc est actif, le panneau affiche une section « Demander un jet ». Le MJ choisit éventuellement des joueurs cibles (aucune sélection = tous), puis clique sur l'un des jets du bloc actif. Chaque joueur ciblé reçoit une boîte de dialogue l'invitant à lancer ; son jet suit ensuite l'interception habituelle et reste voilé. Le déclenchement s'appuie sur l'API dnd5e de la fiche (compétence, caractéristique, sauvegarde), avec repli si la méthode diffère ; non vérifié en instance réelle.
