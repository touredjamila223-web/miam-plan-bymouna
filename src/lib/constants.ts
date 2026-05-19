export const APPLIANCES = [
  { id: "cookeo", label: "Cookeo Smart Wifi" },
  { id: "monsieur-cuisine", label: "Monsieur Cuisine Smart" },
  { id: "airfryer", label: "Airfryer" },
  { id: "cocotte-minute", label: "Cocotte-minute" },
  { id: "four", label: "Four traditionnel" },
  { id: "poele", label: "Poêle" },
  { id: "casserole", label: "Casserole" },
  { id: "plancha", label: "Plancha" },
  { id: "robot-patissier", label: "Robot pâtissier" },
  { id: "mixeur", label: "Mixeur / Blender" },
] as const;

// Guide d'utilisation précis pour chaque appareil : modes et intensités réels.
// Sert de référence STRICTE à l'IA pour rédiger les `appliance_settings` de chaque étape.
export const APPLIANCE_GUIDE: Record<string, string> = {
  cookeo:
    "Cookeo Smart Wifi — Programmes OFFICIELS (jamais inventer d'autres noms) : « Rissolage » (couvercle ouvert, équivalent saisie/dorure), « Mijotage » (couvercle ouvert, sans pression), « Cuisson sous pression » (couvercle fermé verrouillé, valve fermée, ≥ 250 ml de liquide obligatoire), « Cuisson vapeur » (panier vapeur + 200 ml d'eau), « Réchauffage », « Maintien au chaud », « Manuel ». Pour Rissolage, Mijotage et Cuisson sous pression, préciser TOUJOURS l'intensité parmi **doux**, **moyen** ou **fort** + la durée en minutes + l'état du couvercle. Exemples valides : « Rissolage intensité moyen 5 min, couvercle ouvert », « Cuisson sous pression intensité fort 15 min, couvercle fermé verrouillé », « Mijotage intensité doux 25 min, couvercle ouvert ». INTERDIT : « Dorer », « Pression » seul, ou tout libellé non officiel.",
  "monsieur-cuisine":
    "Monsieur Cuisine Smart (Lidl) — Programmes/modes : Pétrissage (icône épi), Mijotage, Vapeur Varoma, Sauté, Sous-vide, Fermentation, ou Manuel. Réglages à préciser à CHAQUE étape : **mode** + **vitesse 1 à 10** (1-3 mijotage, 4-6 mélange, 7-10 mixage, ou Turbo) + **température en °C** (37–130 °C par paliers de 5 °C, ou « Varoma » pour la vapeur) + **durée** + **sens des pales** (normal ou **inverse** pour préserver les morceaux). Exemples : « Mode Sauté, vitesse 1 sens inverse, 120 °C, 8 min », « Vapeur Varoma, vitesse 2, 20 min », « Pétrissage 3 min ».",
  airfryer:
    "Airfryer — Plage 80 à 200 °C (cuisson efficace en général entre 160 et 200 °C). Toujours préciser **température (°C)** + **durée (min)** + « secouer le panier à mi-cuisson » si pertinent + préchauffage 3 min si nécessaire. Pas d'huile ou très peu (1 c. à c.). Ex : « 180 °C, 15 min, secouer à 8 min, préchauffé 3 min ».",
  "cocotte-minute":
    "Cocotte-minute — Séquence : saisir à découvert sur feu vif (7-8/9), fermer, monter en pression (jusqu'au sifflement de la soupape), baisser à feu doux (3-4/9) et compter la durée SOUS pression. Préciser feu (1-9) + durée sous pression + libération vapeur (rapide sous l'eau / naturelle). Ex : « Feu 7 pour saisir 4 min, puis pression feu 3 pendant 20 min, libération naturelle ».",
  four:
    "Four traditionnel — Modes : Chaleur tournante, Chaleur statique (sole + voûte), Gril, Sole seule. Plage 50-250 °C. Toujours préciser : préchauffage (température et durée) + **mode** + **température (°C)** + **position de la grille** (bas/milieu/haut) + **durée**. Ex : « Préchauffer chaleur tournante 200 °C, enfourner grille au milieu, 25 min ».",
  poele:
    "Poêle — Intensité feu : vif 8-9/9, moyen 5-6/9, doux 3-4/9. Préciser **intensité chiffrée** + **matière grasse** + **couvercle (ouvert/fermé)** + **durée par face** si saisie. Ex : « Feu vif 8/9, 1 c. à s. d'huile, sans couvercle, 3 min par face » ou « Feu moyen 5/9, couvert, 12 min ».",
  casserole:
    "Casserole — Intensité feu (1-9) : mijoter 3-4 couvert, frémir 4-5, réduire 6-7 découvert, bouillir 8-9. Préciser **intensité chiffrée** + **couvercle** + **durée**. Ex : « Feu 4/9, couvercle entrouvert, 30 min », « Feu 7/9 découvert pour réduire 8 min ».",
  plancha:
    "Plancha — Température 180-280 °C. Préciser **température (°C)** + **durée par face** + matière grasse éventuelle. Ex : « Plancha 250 °C, 3 min par face, filet d'huile ».",
  "robot-patissier":
    "Robot pâtissier — Accessoires : **Feuille** (mélanger crèmes/pâtes molles), **Fouet** (monter/foisonner blancs/crème), **Crochet** (pétrir pâtes levées). Vitesses 1 à 10 (1-2 incorporer, 4 mélanger, 6-8 monter, 10 rare). Préciser **accessoire** + **vitesse** + **durée**. Ex : « Crochet, vitesse 2, 8 min », « Fouet, vitesse 8, jusqu'à bec d'oiseau (3-4 min) ».",
  mixeur:
    "Mixeur / Blender — Vitesses 1 à 10 (ou **Pulse** par à-coups). Préciser **vitesse** + **durée** + texture cible. Ex : « Vitesse 8, 45 sec, jusqu'à texture lisse », « Pulse x5 pour hacher grossièrement ».",
};

export const DIETARY_RESTRICTIONS = [
  { id: "sans-porc", label: "Sans porc" },
  { id: "sans-fruits-de-mer", label: "Sans fruits de mer" },
  { id: "sans-gluten", label: "Sans gluten" },
  { id: "sans-lactose", label: "Sans lactose" },
  { id: "vegetarien", label: "Végétarien" },
  { id: "vegetalien", label: "Végétalien" },
  { id: "sans-noix", label: "Sans noix" },
  { id: "sans-alcool", label: "Sans alcool" },
  { id: "sans-oeuf", label: "Sans œuf" },
  { id: "halal", label: "Halal" },
] as const;

export const CUISINE_STYLES = [
  "français",
  "italien",
  "méditerranéen",
  "oriental",
  "asiatique",
  "indien",
  "tex-mex",
  "japonais",
  "libanais",
] as const;

export const PROTEINS = [
  "poulet",
  "dinde",
  "veau",
  "boeuf",
  "agneau",
  "porc",
  "canard",
  "lapin",
  "poisson",
  "fruits de mer",
  "oeufs",
  "tofu",
  "légumineuses",
  "fromage",
  "végétarien",
] as const;

export const COURSE_TYPES = [
  { id: "plat", label: "Plat principal" },
  { id: "entree", label: "Entrée" },
  { id: "soupe", label: "Soupe" },
  { id: "dessert", label: "Dessert" },
] as const;

export type CourseTypeId = (typeof COURSE_TYPES)[number]["id"];

export type AppRecipe = {
  id?: string;
  title: string;
  description?: string;
  cuisine_style?: string;
  difficulty?: string;
  prep_time?: number;
  servings?: number;
  appliance?: string;
  photo_url?: string;
  ingredients: { name: string; qty: string }[];
  steps: { text: string; timer_minutes?: number; appliance_settings?: string }[];
  source?: string;
};