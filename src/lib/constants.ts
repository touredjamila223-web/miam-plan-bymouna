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
  "boeuf",
  "agneau",
  "porc",
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