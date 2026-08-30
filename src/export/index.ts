/**
 * Export helpers: CSV / JSON serialisation and browser download/print
 * triggers. These are the only functions in the app allowed to touch
 * `document`/`Blob` for file I/O — calculation modules stay pure.
 */
import type { BomLine, Project, Quotation } from "../types";

function csvEscape(value: string | number | undefined): string {
  const str = String(value ?? "");
  if (/[",\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function toCsv(headers: string[], rows: (string | number | undefined)[][]): string {
  const lines = [headers.map(csvEscape).join(";"), ...rows.map((row) => row.map(csvEscape).join(";"))];
  return lines.join("\n");
}

export function bomToCsv(bom: BomLine[]): string {
  const headers = [
    "Grupp",
    "Material",
    "Dimension",
    "Teknisk antal",
    "Teknisk löpmeter",
    "Enhet",
    "Pris/enhet (SEK)",
    "Teknisk kostnad (SEK)",
    "Spill (%)",
    "Inköpsantal",
    "Inköpt löpmeter",
    "Inköpsplan",
    "Inköpstotal (SEK)",
    "Kund tillhandahåller",
  ];
  const rows = bom.map((l) => [
    l.group,
    l.materialName,
    l.dimension,
    l.technicalQuantity,
    l.technicalLinearMeters?.toFixed(2),
    l.unit,
    l.pricePerUnit.toFixed(2),
    l.technicalCost.toFixed(2),
    l.wastePercent.toFixed(1),
    l.purchaseQuantity,
    l.purchaseLinearMeters?.toFixed(2),
    l.purchaseBreakdown?.map((g) => `${g.count}x${(g.lengthMm / 1000).toFixed(1)}m`).join("+"),
    l.purchaseTotal.toFixed(2),
    l.suppliedByClient ? "Ja" : "Nej",
  ]);
  return toCsv(headers, rows);
}

export function shoppingListToCsv(bom: BomLine[]): string {
  const headers = ["Material", "Dimension", "Inköpsantal", "Enhet", "Pris/enhet (SEK)", "Totalt (SEK)"];
  const rows = bom
    .filter((l) => !l.suppliedByClient)
    .map((l) => [l.materialName, l.dimension, l.purchaseQuantity, l.unit, l.pricePerUnit.toFixed(2), l.purchaseTotal.toFixed(2)]);
  return toCsv(headers, rows);
}

export function projectToJson(project: Project): string {
  return JSON.stringify(project, null, 2);
}

export function quotationToJson(quotation: Quotation): string {
  return JSON.stringify(quotation, null, 2);
}

export function downloadTextFile(filename: string, content: string, mimeType = "text/plain;charset=utf-8"): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function downloadCsv(filename: string, csv: string): void {
  downloadTextFile(filename, `﻿${csv}`, "text/csv;charset=utf-8");
}

export function downloadJson(filename: string, json: string): void {
  downloadTextFile(filename, json, "application/json;charset=utf-8");
}

/** Opens the browser print dialog — used for PDF export of the material
 * list, shopping list, quotation and plan print views (print CSS hides
 * everything but the `.print-area` content). */
export function printCurrentView(): void {
  window.print();
}
