# Plan : MiamPlan — Compagnon culinaire familial

## Vision
App responsive en français centrée sur la santé, le batch cooking et le plaisir de cuisiner guidé. IA = Lovable AI Gateway (Gemini 3 Flash par défaut). Backend = Lovable Cloud. Mode invité supporté (avec bannière "non connecté, données non sauvegardées") + mode connecté (synchro multi-appareils).

## Stack
- TanStack Start + React + Tailwind + shadcn/ui
- Lovable Cloud (auth email/password + Google, base PostgreSQL, RLS)
- Lovable AI Gateway via `createServerFn` (jamais d'appel IA côté client)
- État local (Zustand ou Context + localStorage) pour le mode invité, miroir Supabase pour les comptes connectés
- DnD pour le planning (`@dnd-kit`), `react-markdown` pour les réponses IA

## Architecture des routes (`src/routes/`)
- `index.tsx` — accueil : raccourcis (Frigo, Planning, Chat, Mes recettes), recettes mises en avant
- `onboarding.tsx` — nom famille, nb personnes, appareils, préférences alimentaires
- `recettes.tsx` — bibliothèque + recherche + filtres
- `recettes.$id.tsx` — détail recette + bouton "Mode cuisine" + "J'ai cuisiné"
- `recettes.cuisine.$id.tsx` — mode cuisine plein écran pas à pas
- `generer.tsx` — génération IA (ingrédients / envie / appareil)
- `frigo.tsx` — saisie ingrédients dispo → suggestions IA
- `batch.tsx` — session batch cooking hebdo générée par IA
- `planning.tsx` — calendrier semaine drag & drop + "Suggère ma semaine"
- `courses.tsx` — liste consolidée par catégorie, à cocher
- `mes-recettes.tsx` — favoris + collections personnalisées
- `chat.tsx` — chat IA plein écran (aussi accessible via bouton flottant global)
- `profil.tsx` — famille, appareils, préférences, historique des réalisations
- `auth.tsx` + `reset-password.tsx` — connexion optionnelle
- `api/chat.ts`, `api/generate-recipe.ts`, `api/suggest-from-fridge.ts`, `api/batch-plan.ts`, `api/week-plan.ts` — server routes IA

## Schéma base de données (Lovable Cloud)
- `profiles` (id → auth.users, family_name, household_size)
- `appliances` (user_id, type) — multi
- `dietary_preferences` (user_id, restriction) — multi
- `recipes` (id, owner_id nullable pour communautaire/IA, title, photo_url, cuisine_style, difficulty, prep_time, servings, ingredients jsonb, steps jsonb, appliance, source: 'ai'|'user'|'seed')
- `favorites` (user_id, recipe_id)
- `collections` (id, user_id, name)
- `collection_recipes` (collection_id, recipe_id)
- `cooked_history` (user_id, recipe_id, cooked_at, taste_rating, ease_rating, comment, family_loved)
- `meal_plan` (user_id, date, slot: matin|midi|soir, recipe_id, servings)
- `batch_sessions` (user_id, week_start, plan jsonb)
- `fridge_items` (user_id, name, qty)
- `shopping_list` (user_id, item, category, qty, checked, source)
- `chat_messages` (user_id, thread_id, role, parts jsonb)
- RLS : chaque table scoped par `auth.uid()`

## Logique IA (côté serveur)
Toutes les fonctions IA reçoivent un **contexte famille** : préférences alimentaires, appareils, top 10 recettes bien notées, recettes mal notées à éviter. Système prompt fort :
- Recette = identité culinaire claire (français / oriental / méditerranéen / asiatique / tex-mex…)
- Cohérence ingrédients ↔ style ↔ protéine ↔ sauce ↔ accompagnement
- Adaptation appareil précise (Cookeo : programme + pression + liquide ; Airfryer : temp + temps + secouer ; etc.)
- Output structuré via `Output.object` Zod : `{ title, style, difficulty, prep_time, servings, ingredients[], steps[{ text, timer_minutes?, appliance_settings? }], appliance }`
- Respect strict des exclusions alimentaires (validation post-génération avant retour)

Endpoints IA :
1. **generate-recipe** : depuis ingrédients/envie + appareil choisi
2. **suggest-from-fridge** : 3-5 recettes réalisables depuis ingrédients dispo
3. **batch-plan** : session batch hebdo (bases + ordre optimisé parallèle appareils + réutilisations dans repas semaine)
4. **week-plan** : remplit lundi→dimanche × 3 repas, équilibré
5. **chat** : streaming `useChat`, tool calls pour "sauvegarder recette", "ajouter au planning"

## Mode cuisine pas à pas
Plein écran, swipe/boutons Précédent/Suivant, minuteur par étape (Web Audio pour bip), affichage gros caractères des paramètres appareil (programme, mode, temp, durée, pression). Wake Lock API pour garder l'écran allumé. À la fin → modal de notation (goût ⭐, facilité ⭐, commentaire, "famille adoré ?") → insère dans `cooked_history`.

## Mode invité
- Sans session : bandeau persistant en haut "Mode invité — connectez-vous pour sauvegarder vos données"
- Lecture/écriture dans `localStorage` (même shape que tables)
- À la connexion : proposer la migration des données locales vers le compte

## Design
Tons terreux modernes : terracotta, sauge, crème, charbon doux. Typo : Fraunces (titres) + Inter (corps). Coins arrondis généreux, ombres douces, photos de plats en hero. Mobile-first, navigation bottom bar sur mobile (Accueil / Recettes / Frigo / Planning / Profil), sidebar discrète sur desktop. Bouton flottant Chat IA toujours visible.

## Découpage de livraison (itératif)
Cette app est grande — je vais construire en plusieurs étapes plutôt qu'en un seul gros build :

**Étape 1 — Fondations (ce premier build)**
- Activation Lovable Cloud + schéma DB complet + RLS
- Auth optionnelle (email/Google) + mode invité avec bannière
- Onboarding (famille, appareils, préférences)
- Design system terreux dans `styles.css`
- Layout responsive avec navigation + bouton flottant chat
- Bibliothèque recettes + détail (avec quelques recettes seed)
- Favoris + collections + "Mes recettes"
- Génération IA d'une recette depuis ingrédients/envie + appareil
- Chat IA streaming avec contexte famille

**Étape 2 (prochaine demande)** — Frigo, planning hebdo drag&drop, suggestion semaine IA, liste de courses, batch cooking

**Étape 3 (prochaine demande)** — Mode cuisine plein écran avec minuteurs, notation post-cuisine, historique, boucle de feedback IA, finitions

Je préviendrai à la fin de l'étape 1 ce qu'il reste à construire.

## Détails techniques
- Tous les appels IA passent par `createServerFn` ou server routes `/api/*` ; `LOVABLE_API_KEY` jamais exposée
- Photos de recettes générées par IA via `imagegen` au moment où l'utilisateur sauvegarde une recette IA (sinon placeholder élégant)
- Validation Zod systématique des inputs serveur
- `requireSupabaseAuth` + `attachSupabaseAuth` middleware pour les routes connectées
- Mode invité : fonctions miroir qui lisent/écrivent localStorage au lieu de Supabase, choisies via un hook `useStore()`

Prêt à lancer l'étape 1 dès approbation.
