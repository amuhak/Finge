export type ScenarioId = "historical" | "ssp245" | "ssp585";
export type ScenarioChoice = Exclude<ScenarioId, "historical">;

export type SeriesPoint = {
  year: number;
  scenario: ScenarioId;
  density: number;
  hotspot: number;
  uncertainty: number;
  n_hauls: number;
};

export type Region = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  mpa: boolean;
  mpa_name: string | null;
  summary: string;
  ecology: string;
  series: SeriesPoint[];
};

export type DatasetMeta = {
  title: string;
  generated_at: string;
  seed: number;
  years: number[];
  scenarios: { id: ScenarioId; label: string }[];
  caveat: string;
};

export type Dataset = {
  source: "none" | "sample" | "real";
  sample: boolean;
  meta: DatasetMeta | null;
  regions: Region[];
};

export const EMPTY_DATASET: Dataset = { source: "none", sample: false, meta: null, regions: [] };

export const DEFAULT_YEARS = [1990, 2000, 2010, 2020, 2035, 2050];
export const DEFAULT_CAVEAT =
  "No dataset is loaded. Turn on sample data to explore the interface; the numbers are synthetic.";

export function scenarioForYear(year: number, choice: ScenarioChoice): ScenarioId {
  return year <= 2020 ? "historical" : choice;
}

/** The point for a year, falling back to the nearest available year. */
export function pointFor(region: Region, year: number, choice: ScenarioChoice): SeriesPoint | null {
  const scenario = scenarioForYear(year, choice);
  const exact = region.series.find((p) => p.year === year && p.scenario === scenario);
  if (exact) return exact;
  const candidates = region.series.filter((p) => p.scenario === scenario);
  if (!candidates.length) return region.series.at(-1) ?? null;
  return candidates.reduce((best, p) => (Math.abs(p.year - year) < Math.abs(best.year - year) ? p : best));
}

export function seriesFor(region: Region, choice: ScenarioChoice): SeriesPoint[] {
  return region.series.filter((p) => p.scenario === "historical" || p.scenario === choice);
}

export function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function confidenceLabel(uncertainty: number): string {
  if (uncertainty <= 0.18) return "fairly tight";
  if (uncertainty <= 0.3) return "wide";
  return "very wide";
}
