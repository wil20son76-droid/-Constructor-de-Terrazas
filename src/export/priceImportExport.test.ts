import { describe, expect, it } from "vitest";
import type { Material } from "../types";
import { materialsToPriceCsv, parseCsvRows, parsePriceCsv } from "./priceCsv";

function makeMaterial(id: string, overrides: Partial<Material> = {}): Material {
  return {
    id,
    category: "regel",
    name: id,
    nameSv: id,
    widthMm: 45,
    thicknessMm: 120,
    wastePercent: 10,
    priceModel: { price: 26, priceUnit: "kr/m", vatMode: "exkl", active: true },
    ...overrides,
  };
}

describe("materialsToPriceCsv / parseCsvRows round trip", () => {
  it("exports one row per material plus one row per stock variant", () => {
    const materials = [
      makeMaterial("m1"),
      makeMaterial("m2", {
        priceModel: {
          price: 26,
          priceUnit: "kr/m",
          vatMode: "exkl",
          active: true,
          stockVariants: [
            { id: "v1", lengthMm: 3600, price: 79, priceUnit: "kr/st" },
            { id: "v2", lengthMm: 4200, price: 92, priceUnit: "kr/st" },
          ],
        },
      }),
    ];
    const csv = materialsToPriceCsv(materials);
    const rows = parseCsvRows(csv);
    // header + 1 base row for m1 + (1 base row + 2 variant rows) for m2
    expect(rows).toHaveLength(1 + 1 + 3);
    expect(rows[0]).toEqual([
      "materialId",
      "name",
      "dimension",
      "stockLengthMm",
      "price",
      "priceUnit",
      "supplier",
      "sku",
      "vatIncluded",
      "lastUpdated",
    ]);
  });
});

describe("parsePriceCsv", () => {
  it("updates an existing material's base price by materialId", () => {
    const library = [makeMaterial("m1")];
    const csv = materialsToPriceCsv(library)
      .split("\n")
      .map((line, i) => (i === 1 ? line.replace(";26;", ";999;") : line))
      .join("\n");
    const result = parsePriceCsv(csv, library);
    expect(result.errors).toEqual([]);
    expect(result.updatedCount).toBe(1);
    expect(result.materials.find((m) => m.id === "m1")?.priceModel?.price).toBe(999);
  });

  it("adds/updates a stock variant when stockLengthMm is present", () => {
    const library = [makeMaterial("m1")];
    const csv = [
      "materialId;name;dimension;stockLengthMm;price;priceUnit;supplier;sku;vatIncluded;lastUpdated",
      "m1;Regel;45x120;4200;92;kr/st;Beijer;REG-45120;Nej;2026-08-01",
    ].join("\n");
    const result = parsePriceCsv(csv, library);
    expect(result.errors).toEqual([]);
    const updated = result.materials.find((m) => m.id === "m1")!;
    expect(updated.priceModel?.stockVariants).toEqual([{ id: expect.any(String), lengthMm: 4200, price: 92, priceUnit: "kr/st", vatMode: "exkl", supplier: "Beijer", sku: "REG-45120" }]);
    // The material's base price model is otherwise untouched.
    expect(updated.priceModel?.price).toBe(26);
  });

  it("reports an unknown materialId as an error and does NOT create a new material or break the library", () => {
    const library = [makeMaterial("m1")];
    const csv = ["materialId;name;dimension;stockLengthMm;price;priceUnit;supplier;sku;vatIncluded;lastUpdated", "ghost;Ghost;;;99;kr/st;;;Nej;"].join("\n");
    const result = parsePriceCsv(csv, library);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/okänt material-id/);
    expect(result.materials).toEqual(library); // unchanged
    expect(result.materials).toHaveLength(1); // no new material added
  });

  it("skips a row with an invalid price (never crashes, never applies NaN)", () => {
    const library = [makeMaterial("m1")];
    const csv = ["materialId;name;dimension;stockLengthMm;price;priceUnit;supplier;sku;vatIncluded;lastUpdated", "m1;Regel;;;abc;kr/m;;;Nej;"].join("\n");
    const result = parsePriceCsv(csv, library);
    expect(result.errors).toHaveLength(1);
    expect(result.materials.find((m) => m.id === "m1")?.priceModel?.price).toBe(26); // unchanged
  });

  it("skips a row with an unknown priceUnit", () => {
    const library = [makeMaterial("m1")];
    const csv = ["materialId;name;dimension;stockLengthMm;price;priceUnit;supplier;sku;vatIncluded;lastUpdated", "m1;Regel;;;50;kr/banan;;;Nej;"].join("\n");
    const result = parsePriceCsv(csv, library);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/okänd prisenhet/);
  });

  it("parses vatIncluded=Ja as inkl. moms", () => {
    const library = [makeMaterial("m1")];
    const csv = ["materialId;name;dimension;stockLengthMm;price;priceUnit;supplier;sku;vatIncluded;lastUpdated", "m1;Regel;;;100;kr/m;;;Ja;"].join("\n");
    const result = parsePriceCsv(csv, library);
    expect(result.materials.find((m) => m.id === "m1")?.priceModel?.vatMode).toBe("inkl");
  });

  it("handles a semicolon inside a quoted field without breaking column alignment", () => {
    const library = [makeMaterial("m1")];
    const csv = [
      "materialId;name;dimension;stockLengthMm;price;priceUnit;supplier;sku;vatIncluded;lastUpdated",
      'm1;"Regel; premium";;;50;kr/m;"Beijer; Sverige";;Nej;',
    ].join("\n");
    const result = parsePriceCsv(csv, library);
    expect(result.errors).toEqual([]);
    expect(result.materials.find((m) => m.id === "m1")?.priceModel?.price).toBe(50);
    expect(result.materials.find((m) => m.id === "m1")?.priceModel?.supplier).toBe("Beijer; Sverige");
  });
});
