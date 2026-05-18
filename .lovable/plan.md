## Objectif

Faire en sorte que l'onglet Batch cooking soit basé sur ton planning de la semaine (pas des recettes aléatoires), et ajouter un mode cuisine pour t'accompagner pendant la session du dimanche.

## Ce qui change concrètement

### 1. La génération de la session batch part de ton planning

Aujourd'hui : l'IA invente 5 repas pour la semaine, sans rapport avec ton planning.

Après : tu choisis une semaine, l'app récupère **les dîners déjà planifiés cette semaine-là** (ainsi que les éventuels entrées/soupes/desserts ajoutés). L'IA te propose alors :

- les **bases à préparer en avance** (légumes rôtis, céréales, protéines marinées, sauces) communes à ces repas précis ;
- une **organisation en blocs de temps** (0-30 min, 30-60 min…) pour mener plusieurs préparations en parallèle avec tes appareils ;
- pour chaque repas planifié, les **étapes rapides de finition** le jour J (réchauffer, assembler, dresser).

Si la semaine a moins de 3 dîners planifiés, un message t'invite à compléter le planning d'abord.

### 2. La sauvegarde ne crée plus de nouvelles recettes

Aujourd'hui : "Tout sauvegarder" créait 5 nouvelles recettes "batch" et les ajoutait au planning, ce qui doublonnait avec tes vraies recettes.

Après : les recettes du planning restent celles que tu connais. La sauvegarde sert juste à :

- ajouter les **bases du batch à ta liste de courses** ;
- garder en mémoire la session pour pouvoir y revenir / lancer le mode cuisine.

### 3. Nouveau mode cuisine pour le batch

Un bouton "Démarrer la session" lance un mode plein écran similaire au mode cuisine des recettes :

- progression bloc de temps par bloc de temps (étape 1/4, 2/4…) ;
- cases à cocher pour chaque tâche du bloc (ex : "Enfourner les légumes", "Mettre le riz au cookeo") ;
- minuteur réglable par bloc (par défaut la durée du bloc) avec son de fin et écran qui reste allumé ;
- rappel en bas d'écran des repas que cette session permet de préparer.

## Détails techniques

- `generateBatch` : prend en entrée `{ week_start }`, lit `meal_plan` + recettes liées (tous slots), construit un prompt qui liste précisément les repas à couvrir et leurs ingrédients principaux, demande à l'IA un plan batch ciblé sur **ces** repas. Le schéma `meals[]` référence les recettes existantes par `recipe_id` au lieu d'inventer des titres.
- `saveBatchSession` : ne crée plus de recettes ; insère seulement les `bases` dans `shopping_list` (catégorie auto), et ne touche pas à `meal_plan`.
- Mode cuisine batch : nouvelle route `src/routes/batch.cuisine.tsx` qui reçoit la session via state local (passée depuis `/batch`), réutilise la même logique de minuteur / wake lock / beep que `recettes.cuisine.$id.tsx`.
- `src/routes/batch.tsx` : sélecteur de semaine + bouton "Générer", affichage des bases / blocs parallèles / repas couverts (avec lien vers la recette), bouton "Ajouter les bases aux courses", bouton "Démarrer la session" qui ouvre le mode cuisine.

## Hors périmètre

- Pas de changement au planning hebdomadaire lui-même ni à la liste de courses.
- Pas de persistance de la session batch en base (elle reste en mémoire le temps de la cuisiner) — peut être ajoutée plus tard si tu veux retrouver l'historique.