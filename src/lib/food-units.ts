// Pure module — importable from client and server contexts.
//
// Unidades de los insumos. Antes eran texto libre y "Pza", "pc" y "pza" se
// trataban como unidades distintas; ahora se elige de esta lista y lo que
// llegue escrito a mano se normaliza a la clave canónica.

export const FOOD_UNITS = ["pza", "kg", "g", "l", "ml", "paq", "caja", "bolsa", "botella", "lata"] as const;
export type FoodUnit = (typeof FOOD_UNITS)[number];

export const FOOD_UNIT_LABELS: Record<"es" | "en", Record<FoodUnit, string>> = {
  es: {
    pza: "pza (pieza)",
    kg: "kg (kilogramo)",
    g: "g (gramo)",
    l: "l (litro)",
    ml: "ml (mililitro)",
    paq: "paq (paquete)",
    caja: "caja",
    bolsa: "bolsa",
    botella: "botella",
    lata: "lata",
  },
  en: {
    pza: "pza (piece)",
    kg: "kg (kilogram)",
    g: "g (gram)",
    l: "l (liter)",
    ml: "ml (milliliter)",
    paq: "paq (pack)",
    caja: "caja (box)",
    bolsa: "bolsa (bag)",
    botella: "botella (bottle)",
    lata: "lata (can)",
  },
};

// Formas escritas a mano que significan lo mismo. Se comparan en
// minúsculas, sin acentos, sin espacios ni punto final.
const ALIASES: Record<FoodUnit, string[]> = {
  pza: ["pza", "pzas", "pz", "pzs", "pieza", "piezas", "pc", "pcs", "pieza(s)", "piece", "pieces", "u", "un", "unidad", "unidades", "unit", "units"],
  kg: ["kg", "kgs", "kilo", "kilos", "kilogramo", "kilogramos", "kilogram", "kilograms"],
  g: ["g", "gr", "grs", "gramo", "gramos", "gram", "grams"],
  l: ["l", "lt", "lts", "ltr", "litro", "litros", "liter", "liters", "litre", "litres"],
  ml: ["ml", "mililitro", "mililitros", "milliliter", "milliliters"],
  paq: ["paq", "paqs", "paquete", "paquetes", "pack", "packs", "pqt"],
  caja: ["caja", "cajas", "box", "boxes"],
  bolsa: ["bolsa", "bolsas", "bag", "bags"],
  botella: ["botella", "botellas", "bottle", "bottles"],
  lata: ["lata", "latas", "can", "cans"],
};

const LOOKUP = new Map<string, FoodUnit>(
  (Object.entries(ALIASES) as [FoodUnit, string[]][]).flatMap(([unit, names]) => names.map((n) => [n, unit] as [string, FoodUnit])),
);

function clean(raw: string): string {
  return raw.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase().replace(/\.$/, "").replace(/\s+/g, "");
}

/** La unidad canónica ("Pza", "pc", "piezas" → "pza"), o null si no se reconoce. */
export function normalizeFoodUnit(raw: string): FoodUnit | null {
  return LOOKUP.get(clean(raw)) ?? null;
}

export function isFoodUnit(v: string): v is FoodUnit {
  return (FOOD_UNITS as readonly string[]).includes(v);
}

/** Todas las formas reconocidas por unidad, para la migración de datos existentes. */
export const FOOD_UNIT_ALIASES = ALIASES;
