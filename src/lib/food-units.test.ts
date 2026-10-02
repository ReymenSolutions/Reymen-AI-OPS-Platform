import { describe, expect, it } from "vitest";
import { FOOD_UNITS, FOOD_UNIT_ALIASES, normalizeFoodUnit } from "./food-units";

describe("normalizeFoodUnit", () => {
  it("treats every way of writing a piece as the same unit", () => {
    for (const raw of ["pza", "Pza", "PZA", "pza.", "pc", "Pcs", "pieza", "Piezas", " pz "]) expect(normalizeFoodUnit(raw)).toBe("pza");
  });

  it("normalizes weights, volumes and containers", () => {
    expect(normalizeFoodUnit("Kilos")).toBe("kg");
    expect(normalizeFoodUnit("gr")).toBe("g");
    expect(normalizeFoodUnit("Lt")).toBe("l");
    expect(normalizeFoodUnit("Mililitros")).toBe("ml");
    expect(normalizeFoodUnit("Paquete")).toBe("paq");
    expect(normalizeFoodUnit("cajas")).toBe("caja");
  });

  it("rejects what isn't a unit (e.g. a quantity typed in the unit field)", () => {
    expect(normalizeFoodUnit("2 pza")).toBeNull();
    expect(normalizeFoodUnit("")).toBeNull();
    expect(normalizeFoodUnit("tazas")).toBeNull();
  });

  it("every canonical unit is its own alias, and no alias belongs to two units", () => {
    const seen = new Set<string>();
    for (const u of FOOD_UNITS) {
      expect(normalizeFoodUnit(u)).toBe(u);
      for (const a of FOOD_UNIT_ALIASES[u]) {
        expect(seen.has(a)).toBe(false);
        seen.add(a);
      }
    }
  });
});
