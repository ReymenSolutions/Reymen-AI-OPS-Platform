// Pure module — importable from client and server contexts.
//
// Diccionarios de traducción por área (Food, SmartCard, plantillas, ...)
// para no seguir inflando el diccionario general de i18n.ts. Mismo idioma
// ("es" | "en") y la misma cookie que el resto de la app. El tipo obliga a
// que cada clave en español tenga su traducción al inglés con la misma
// forma: texto fijo, o una función cuando lleva valores (p. ej. un número).

import type { Lang } from "./i18n";

type Entry = string | ((...args: never[]) => string);

export type DictShape<T extends Record<string, Entry>> = {
  [K in keyof T]: T[K] extends (...args: infer A) => string ? (...args: A) => string : string;
};

export function defineDict<T extends Record<string, Entry>>(dict: { es: T; en: DictShape<T> }) {
  return dict as unknown as { es: DictShape<T>; en: DictShape<T> };
}

export type DictOf<D extends { es: unknown }> = D["es"];

export function pickDict<D extends { es: unknown; en: unknown }>(dict: D, lang: Lang): D["es"] {
  return (lang === "en" ? dict.en : dict.es) as D["es"];
}
