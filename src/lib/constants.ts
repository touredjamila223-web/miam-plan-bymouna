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
    "Cookeo Smart Wifi — Modes : Dorer (sans couvercle, équivalent feu vif), Mijoter (sans pression, doux), Cuisson sous pression (couvercle fermé, valve fermée), Cuisson vapeur (panier + 200 ml d'eau), Réchauffer, Maintien au chaud. Toujours préciser le mode exact + durée en minutes. Ex : « Mode Dorer 5 min », « Mode Pression 12 min », « Mode Mijoter 25 min couvercle ouvert ».",
  "monsieur-cuisine":
    "Monsieur Cuisine Smart — Réglages : Température 37 à 130 °C (par paliers de 5 °C, 130 °C = ébullition rapide, ✱ Varoma pour la vapeur), Vitesse 1 à 10 (1-3 mijotage, 4-6 mélange, 7-10 mixage), Sens de rotation inverse pour préserver les morceaux, Mode Pétrissage (icône épi), Mode Sous Vide. Toujours préciser Température + Vitesse + Durée + (Sens inverse si besoin). Ex : « 100 °C / vitesse 1 / 15 min / sens inverse ».",
  airfryer:
    "Airfryer — Plage 80 à 200 °C. Toujours préciser Température (°C) + Durée (min) + secouer à mi-cuisson si pertinent. Pas d'huile ou très peu (1 c. à c.). Ex : « 180 °C / 15 min, secouer à 8 min ».",
  "cocotte-minute":
    "Cocotte-minute — Étapes : faire revenir à découvert sur feu vif 7-8, puis fermer, monter en pression (sifflement), baisser à feu 3-4 et compter la durée sous pression. Toujours préciser feu (1-9) + durée sous pression. Ex : « Feu 7 pour saisir 4 min, puis pression feu 3 pendant 20 min ».",
  four:
    "Four traditionnel — Modes : Chaleur tournante, Chaleur statique (sole + voûte), Gril, Sole seule. Plage 50-250 °C. Préciser Mode + Température + Position de la grille (bas/milieu/haut) + Durée. Ex : « Chaleur tournante 200 °C, grille au milieu, 25 min ».",
  poele:
    "Poêle — Feu 1 (très doux) à 9 (très vif). Préciser feu + couvercle (ouvert/fermé) + durée. Ex : « Feu 7, sans couvercle, 5 min de chaque côté ».",
  casserole:
    "Casserole — Feu 1 à 9. Préciser feu + couvercle + durée. Pour mijoter : feu 3-4 couvert. Pour réduire : feu 6-7 à découvert. Ex : « Feu 4, couvercle entrouvert, 30 min ».",
  plancha:
    "Plancha — Température 200-280 °C. Préciser température + durée par face. Ex : « Plancha 250 °C, 3 min par face ».",
  "robot-patissier":
    "Robot pâtissier — Accessoires : Feuille (mélanger), Fouet (monter/foisonner), Crochet (pétrir). Vitesses 1 à 10 (1-2 incorporer, 4 mélanger, 6-8 monter, 10 rare). Préciser Accessoire + Vitesse + Durée. Ex : « Crochet, vitesse 2, 8 min ».",
  mixeur:
    "Mixeur / Blender — Vitesses 1 à 10 (ou Pulse). Préciser Vitesse + Durée. Ex : « Vitesse 8, 45 sec, par à-coups ».",
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