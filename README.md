# Jets voilés (Veiled Rolls)

Module Foundry VTT pour le système **D&D5e** (Foundry v13, D&D5e 5.x). Le MJ « voile » certains jets de compétence, de caractéristique ou de sauvegarde. D&D5e calcule le jet normalement, mais la carte de chat publique n'est jamais créée. À la place, chaque joueur reçoit en **chuchotement privé** une réponse narrative préparée à l'avance, choisie selon son total.

**Usage typique.** Pour la scène du couloir piégé, le MJ prépare un jet de Perception avec trois paliers : « tu ne remarques rien », « une dalle sonne creux », « tu vois nettement le mécanisme ». Il ajoute une **réponse personnelle** pour Alice : « tu reconnais la marque de la guilde des voleurs de ta jeunesse ». Il demande ensuite le jet au groupe. Chaque joueur lance, et la table ne voit aucun chiffre. Chacun reçoit discrètement le texte de son palier, sauf Alice qui reçoit d'office sa réponse personnelle, quel que soit son total.

---

## Utilisation

Le module s'ouvre par le **bouton masque** placé à gauche de la barre de macros (MJ uniquement), par l'outil « Jets voilés » des contrôles de scène, ou par macro (voir [API](#api)).

### 1. Préparer un jet voilé : une seule page

Dans le panneau, cliquer sur **Nouveau jet voilé**. Tout tient sur une page, de haut en bas :

1. **Nom de la scène** et **dossier** (par ex. « Session 3 »). Le dossier sert à regrouper les jets dans le panneau, et les dossiers existants sont proposés à la saisie.
2. **Une carte par jet** :
   - le **type** (compétence, caractéristique, sauvegarde) et la **compétence / caractéristique**, choisis dans une liste. Le libellé affiché est automatique, mais on peut le remplacer (par ex. « Intuition (aubergiste) ») ;
   - les **réponses selon le résultat**. Trois paliers sont pré-remplis (≤ 9, 10–14, ≥ 15) : il suffit de taper les textes. Un palier laissé vide est ignoré à l'enregistrement. Plusieurs lignes dans un palier donnent plusieurs variantes, dont une est tirée au hasard. Un palier peut aussi être réservé au 1 ou au 20 naturel ;
   - les **réponses personnelles** (facultatives) : un joueur et un texte (voir ci-dessous) ;
   - un **testeur intégré** : saisir un total et, au besoin, « en tant que » tel joueur pour voir exactement ce qui serait envoyé, sans rien publier.
3. **Ajouter un autre jet à cette scène** si la scène appelle plusieurs jets (Perception *et* Investigation, par exemple). Chaque carte peut être dupliquée ou supprimée.
4. **Options avancées**, repliées par défaut. On y trouve le mode de résolution (plage exclusive ou seuil cumulatif), l'affichage du total au joueur, la couleur selon la réussite, les dés 3D, la réponse par défaut, les participants concernés, la politique de doublons, la fermeture automatique et une note MJ.

**Enregistrer** range le jet dans la liste « À faire ». **Enregistrer et activer** active aussi le filtre tout de suite.

### 2. Réponses personnelles

Une réponse personnelle associe **un joueur** à **un texte**. Quand ce joueur fait le jet :

- il reçoit ce texte **d'office**, quel que soit son total (même sur un 1) ;
- il lance son dé comme tout le monde, donc rien ne trahit à la table qu'il a reçu un traitement particulier ;
- **il ne voit pas son résultat** : à la place du total, son chuchotement affiche « ✦ Ton résultat : personnel — Cette réponse t'est réservée : elle est vraie, quel que soit ton dé ». Un mauvais jet ne peut donc pas le faire douter de son intuition. Si les dés 3D privés sont activés, l'animation n'est pas jouée pour lui (la face du dé trahirait le résultat) ;
- tous les autres joueurs reçoivent normalement la réponse de leur palier (avec leur total, si l'option est active) ;
- le MJ voit toujours le vrai total : diagnostic privé, panneau et historique ;
- la réponse le suit aussi lorsque le MJ lance le jet à sa place, sur un personnage dont il est propriétaire.

Un jet peut ne comporter **que** des réponses personnelles. Les autres joueurs reçoivent alors la réponse par défaut, si elle est configurée. Dans le panneau, les joueurs concernés apparaissent en étiquettes violettes sous le jet. Le sélecteur de joueurs et la zone « En cours » les signalent par une icône d'espion, et l'historique marque ces réponses d'une étiquette « Personnelle ».

### 3. Demander le jet : au groupe ou à certains joueurs

Chaque jet du panneau propose deux boutons :

- **Groupe** : tous les joueurs connectés reçoivent l'invite ;
- **Joueur(s)** : une fenêtre permet de cocher un ou plusieurs joueurs. Ceux qui ont une réponse personnelle sur ce jet y sont signalés.

Le joueur reçoit une boîte de dialogue « Le MJ te demande un jet de… ». Son jet est ensuite intercepté et voilé automatiquement. Demander un jet **active son filtre de lui-même**, sans étape d'activation préalable. Un joueur peut aussi lancer le jet directement depuis sa fiche pendant que le filtre est actif.

### 4. Suivre ce qui reste à faire et ce qui a été fait

Le panneau est découpé en trois onglets, chacun avec un compteur :

| Onglet | Contenu |
|---|---|
| **À faire** | En haut, la zone **En cours** (voir ci-dessous). En dessous, les jets à jouer, regroupés par **dossier** (repliable) puis par **scène** : le nom de la scène et son bouton ✎ n'apparaissent qu'une fois. Chaque jet montre son type et, en étiquettes violettes, les joueurs qui ont une réponse personnelle. Un bouton ✓ le marque fait à la main. Au-delà de six jets, un **filtre** instantané (jet, scène, dossier, joueur) apparaît. |
| **Faits** | Jets joués (liseré laiton), avec leur date et, pour chacun, **qui a lancé, son total et un aperçu de la réponse reçue**. On peut le redemander, ou le **remettre à faire** (↺). |
| **Historique** | Tous les jets traités, du plus récent au plus ancien : acteur, joueur, jet, total (visible du MJ seul), réponse, et étiquette « Personnelle » ou « Réponse par défaut » le cas échéant. Actions **Renvoyer** et **Copier**. |

**La zone « En cours »** regroupe les jets demandés et pas encore terminés. Pour chacun, elle affiche :

- une barre de progression et un compteur (« 1/2 ») ;
- une pastille par joueur : ✓ s'il a lancé, ⌛ s'il est attendu, et l'icône d'espion s'il a une réponse personnelle ;
- **Relancer**, qui renvoie l'invite aux seuls retardataires sans perdre les réponses déjà reçues ;
- **Clore**, qui arrête d'attendre : le jet passe en « Fait » si quelqu'un a répondu, sinon il revient « à faire ».

Un jet passe en « Fait » dès la première réponse envoyée. Quand tous les joueurs attendus ont répondu (ou que la dernière demande est close), le filtre se désactive de lui-même. Si le MJ lance à la place d'un joueur, sur son personnage, ce joueur est compté comme ayant répondu.

**Nouvelle session** désactive le filtre et remet tous les jets en « À faire ». **L'historique est conservé** : il ne s'efface que par le bouton « Vider l'historique » de l'onglet Historique, et sa taille est plafonnée par un réglage du module.

### 5. Bibliothèque

La **Bibliothèque** liste toutes les scènes préparées, avec une recherche instantanée sur le nom, le dossier et les libellés. Elle permet de modifier, dupliquer, supprimer et activer une scène, ainsi que d'**exporter et importer** au format JSON. À l'import, en cas de conflit d'identifiant, on choisit de dupliquer, remplacer ou ignorer.

---

## Ce qui a été testé, et ce qui ne l'a pas été

**Tests automatisés (Vitest, 37 tests, `npm test`).** Ils couvrent toute la logique métier pure :

- résolution des paliers (plage exclusive, seuil cumulatif, dés naturels, tirage au hasard, réponse par défaut, couleur) ;
- **réponses personnelles** (priorité sur les paliers, ordre des candidats, entrées vides ignorées, jet sans palier) ;
- validation ;
- conversion entre une scène et ses cartes de jet dans l'éditeur ;
- import/export (y compris la neutralisation du HTML dangereux et la lecture des fichiers v1) ;
- politique de doublons, participants, migration de l'état « fait ».

**Vérifié dans Chromium avec un Foundry simulé.** Les vraies fenêtres (code et gabarits du module) ont été rendues dans un navigateur, avec les objets globaux de Foundry remplacés par des simulations. Le parcours testé :

- saisie dans l'éditeur une page, ajout et suppression de cartes, de paliers et de réponses personnelles ;
- conservation de la saisie entre deux rendus, testeur intégré, enregistrement ;
- demande au groupe, zone « En cours » (progression, joueurs attendus, Relancer, Clore) ;
- traitement des jets : réponse de palier pour Bob, réponse personnelle pour Alice même sur 25 (avec « personnel » à la place de son total), et aussi quand le MJ lance pour elle ;
- passage en « Fait », désactivation automatique, retour en « À faire » sans perte d'historique.

Ce banc d'essai ne fait pas partie du dépôt.

**Non testé en conditions réelles.** Le module n'a **pas** été exécuté dans une instance Foundry. Les points suivants restent donc à valider sur une vraie table avant tout usage sérieux :

- l'interception effective des hooks D&D5e 5.x ;
- le routage joueur → MJ par socket en multijoueur ;
- Dice So Nice (l'animation privée est maintenant déclenchée par le MJ, à partir du jet sérialisé) ;
- le rendu exact sous ApplicationV2 de Foundry v13 ;
- le déclenchement automatique du jet demandé.

---

## Fonctionnement technique

### Hooks retenus

Le module s'appuie sur les hooks « V2 » de D&D5e :

- **Pré-jet** : `dnd5e.preRollSkillV2`, `dnd5e.preRollAbilityCheckV2` et `dnd5e.preRollSavingThrowV2`, de signature `(config, dialog, message)`. Le module y positionne `message.create = false` : la carte de chat publique n'est jamais créée. Le résultat n'est donc pas affiché puis masqué, il est intercepté *avant* publication.
- **Post-jet** : `dnd5e.rollSkillV2`, `dnd5e.rollAbilityCheckV2` et `dnd5e.rollSavingThrowV2`, de signature `(rolls, data)`. Le total est lu sur `rolls[0].total`.

`preRollAbilityCheckV2` se déclenche aussi pour les compétences et les outils. Le gestionnaire de caractéristique « cède la main » lorsqu'il reconnaît une config de compétence ou d'outil. Tout accès aux structures internes de D&D5e est confiné dans `src/adapters/dnd5e-roll-adapter.ts`, avec des accès défensifs : en cas de doute, le jet se déroule normalement plutôt que de risquer une exception.

### Stockage et confidentialité

Foundry diffuse **tout réglage de portée `world` à tous les clients**. Pour que les joueurs ne reçoivent jamais de donnée secrète :

- les **scènes** (paliers, réponses, réponses personnelles), l'**historique** et l'**état « fait »** sont conservés dans un **JournalEntry privé du MJ** (« Jets voilés — données privées », permission `NONE` pour tous). Les joueurs n'y ont aucun accès ;
- seule une **projection publique non sensible** du filtre actif (les jets couverts et le mode de participation, **sans** réponses ni seuils) est placée dans un réglage `world`. Elle permet au client d'un joueur de décider localement de masquer la carte publique de son jet. Les réponses personnelles, et même le fait qu'un joueur en possède une, n'y figurent jamais.

### Routage et autorité

Le client qui lance le jet effectue l'interception : masquage de la carte et marquage du jet. Le résultat est transmis par socket au **seul MJ responsable**, élu de façon déterministe via `game.users.activeGM`, avec un repli. Lui seul résout la réponse (paliers ou réponse personnelle) et l'envoie. Les identifiants de requête sont dédupliqués. Le principe est le **fail-safe** : en cas d'erreur, le joueur reçoit toujours une note et le MJ est notifié.

Pour une réponse personnelle, le MJ cherche d'abord l'utilisateur qui a lancé le jet, puis les propriétaires du personnage. Le chuchotement part vers le lanceur (et vers les MJ si l'option est active) et affiche « personnel » au lieu du total. Un message de diagnostic séparé, réservé aux MJ, indique le vrai total et « Réponse personnelle ».

Avec les dés 3D privés, le client du joueur joint son jet sérialisé (`Roll#toJSON`) au contexte transmis. Le MJ responsable joue l'animation (lanceur + MJ) une fois la réponse résolue, puis envoie le chuchotement. Pour une réponse personnelle, il n'y a pas d'animation.

### Format des données

Le schéma de stockage et d'export passe en **version 2**, qui ajoute `personal_responses` (une liste `{ user_id, response }`) à chaque branche de réponses. Les scènes et fichiers de la version 1 se lisent sans conversion. Un fichier v2 n'est pas importable dans une version 1.x du module. L'éditeur présente une carte par jet, mais le format stocké reste « sélecteurs → branches → paliers ». Une ancienne scène dont deux jets partageaient la même branche est séparée en deux cartes indépendantes au premier enregistrement.

Les identifiants de joueurs étant propres à chaque monde, les réponses personnelles d'une scène exportée puis importée dans un **autre monde** pointeront vers des joueurs inexistants. Il faut alors les réattribuer dans l'éditeur.

---

## Installation

Le module n'est pas encore publié via un manifeste. Il s'installe manuellement :

1. Décompresser `veiled-rolls.zip` dans le dossier `Data/modules/` de Foundry. On obtient `Data/modules/veiled-rolls/module.json`.
2. Redémarrer Foundry (ou revenir à l'écran de configuration), puis activer « Jets voilés » dans un monde utilisant le système D&D5e.

Le zip se fabrique avec `npm run package` (résultat : `build/veiled-rolls.zip`). Sans outils, on peut aussi copier à la main `module.json`, `dist/`, `lang/`, `styles/` et `templates/` dans `Data/modules/veiled-rolls/` : le dossier `dist/` est versionné, aucune compilation n'est nécessaire.

## Développement

Le code source TypeScript est dans `src/`, et `dist/module.js` en est le bundle (Vite, format ES, non minifié, avec source map).

```bash
npm install
npm run typecheck   # TypeScript strict
npm test            # Vitest
npm run build       # régénère dist/module.js
npm run check       # les trois à la suite
npm run package     # build/veiled-rolls.zip prêt à installer
```

Après toute modification de `src/`, relancer `npm run build` et committer `dist/` avec le reste.

```
src/
  main.ts                    hooks Foundry, bouton de barre de macros, API
  types.ts                   formes de données partagées
  adapters/                  accès aux structures D&D5e (seul point de contact)
  controllers/               activation du filtre, interception des jets
  services/                  logique pure (résolution, validation, cartes de
                             l'éditeur, import/export) et stockage privé
  apps/                      fenêtres : panneau, éditeur une page, bibliothèque
templates/                   gabarits Handlebars
lang/                        fr.json, en.json (aucun texte codé en dur)
styles/                      veiled-rolls.css (palette Campaign Scriptorium)
tests/                       tests Vitest de la logique pure
```

## API

L'API est exposée sur `game.modules.get("veiled-rolls").api`. Toutes les méthodes sont réservées au MJ et renvoient des copies :

- `openControlPanel()` ouvre le panneau ;
- `openBlockLibrary()` ouvre la bibliothèque ;
- `activate(blockId)` valide puis active une scène et renvoie l'état du filtre ;
- `disable()` désactive le filtre ;
- `getActiveState()` renvoie une copie de l'état du filtre ;
- `getBlocks()` renvoie des copies de toutes les scènes.

Exemple de macro : `game.modules.get("veiled-rolls").api.openControlPanel();`

## Réglages

Deux réglages réservés au MJ : signaler les jets inattendus (un participant lance un jet non couvert par le filtre actif) et la taille maximale de l'historique.
