import { HIGH_UNCERTAINTY } from "./types";

/** Plain-language readings of the three numbers, plus the stepped map colours. */

export function krillWord(density: number): string {
  if (density >= 0.66) return "Lots of krill";
  if (density >= 0.4) return "Some krill";
  if (density >= 0.2) return "Few krill";
  return "Very few krill";
}

export function chanceWord(hotspot: number): string {
  if (hotspot >= 0.6) return "Likely a hotspot";
  if (hotspot >= 0.35) return "Maybe a hotspot";
  return "Unlikely a hotspot";
}

export function sureWord(uncertainty: number): string {
  if (uncertainty < 0.18) return "Fairly sure";
  if (uncertainty < HIGH_UNCERTAINTY) return "Unsure";
  return "Very unsure";
}

/** Four flat steps, light to strong — no gradient. Colours live in CSS so dark mode can remap them. */
export const HOTSPOT_STEPS = [
  { min: 0, color: "var(--hot-0)", label: "under 25%" },
  { min: 0.25, color: "var(--hot-1)", label: "25–45%" },
  { min: 0.45, color: "var(--hot-2)", label: "45–60%" },
  { min: 0.6, color: "var(--hot-3)", label: "60%+" },
];

export function hotspotColor(hotspot: number): string {
  let color = HOTSPOT_STEPS[0].color;
  for (const step of HOTSPOT_STEPS) if (hotspot >= step.min) color = step.color;
  return color;
}

export function scenarioName(year: number, scenario: string): string {
  if (year <= 2020) return "observed era";
  return scenario === "ssp585" ? "high-emissions scenario" : "middle-road scenario";
}
