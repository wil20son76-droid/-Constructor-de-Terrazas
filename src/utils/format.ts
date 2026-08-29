export function formatMm(valueMm: number): string {
  return `${Math.round(valueMm).toLocaleString("sv-SE")} mm`;
}

export function formatM2(valueM2: number): string {
  return `${valueM2.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
}

export function formatMeters(valueM: number): string {
  return `${valueM.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}

export function formatSek(value: number): string {
  return `${Math.round(value).toLocaleString("sv-SE")} kr`;
}
