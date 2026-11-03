import { create } from "zustand";
import { fetchDataset } from "./api";
import { DEFAULT_YEARS, EMPTY_DATASET, scenarioForYear, type Dataset, type ScenarioChoice } from "./types";

export type VoiceStatus = "off" | "connecting" | "listening" | "thinking" | "speaking" | "error";
export type VoiceKind = "user" | "agent" | "tool" | "sys";
/** What Pip is pointing at: drives the chart card and the map pulse. */
export type Highlight =
  | { kind: "hotspots"; ids: string[]; year: number }
  | { kind: "region"; id: string; years: number[] }
  | { kind: "compare"; id: string; years: [number, number] };

export type VoiceLine = { kind: VoiceKind; text: string; key?: string; at: number };

type Store = {
  dataset: Dataset;
  loading: boolean;
  error: string | null;
  sampleRequested: boolean;

  year: number;
  scenario: ScenarioChoice;
  selected: string | null;
  /** null = whole world, otherwise a region id. */
  focus: string | null;

  highlight: Highlight | null;
  setHighlight: (highlight: Highlight | null) => void;

  voiceOpen: boolean;
  voiceStatus: VoiceStatus;
  voiceError: string | null;
  /** Set when the session opened but the microphone was denied or missing. */
  voiceMicError: string | null;
  voiceLog: VoiceLine[];

  load: (source: "auto" | "sample") => Promise<void>;
  setYear: (year: number) => void;
  setScenario: (scenario: ScenarioChoice) => void;
  select: (id: string | null) => void;
  focusOn: (id: string | null) => void;
  setVoice: (patch: Partial<Pick<Store, "voiceOpen" | "voiceStatus" | "voiceError">>) => void;
  log: (kind: VoiceKind, text: string, key?: string) => void;
  clearLog: () => void;
};

const SCENARIO_KEY = "fishcast.scenario";

function savedScenario(): ScenarioChoice {
  return localStorage.getItem(SCENARIO_KEY) === "ssp585" ? "ssp585" : "ssp245";
}

export const useStore = create<Store>((set, get) => ({
  dataset: EMPTY_DATASET,
  loading: false,
  error: null,
  sampleRequested: false,

  year: 2020,
  scenario: savedScenario(),
  selected: null,
  focus: null,

  highlight: null,
  setHighlight: (highlight) => set({ highlight }),

  voiceOpen: false,
  voiceStatus: "off",
  voiceError: null,
  voiceMicError: null,
  voiceLog: [],

  load: async (source) => {
    set({ loading: true, error: null, sampleRequested: source === "sample" });
    try {
      const dataset = await fetchDataset(source);
      const years = dataset.meta?.years?.length ? dataset.meta.years : DEFAULT_YEARS;
      const year = get().year;
      set({
        dataset,
        loading: false,
        // Keep the chosen year if the new dataset has it; otherwise land on 2020.
        year: years.includes(year) ? year : 2020,
        selected: null,
        focus: null,
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
        dataset: EMPTY_DATASET,
      });
    }
  },

  setYear: (year) => {
    const meta = get().dataset.meta;
    const years = meta?.years?.length ? meta.years : DEFAULT_YEARS;
    const nearest = years.reduce((best, y) => (Math.abs(y - year) < Math.abs(best - year) ? y : best));
    set({ year: nearest });
  },

  setScenario: (scenario) => {
    localStorage.setItem(SCENARIO_KEY, scenario);
    set({ scenario });
  },

  select: (selected) => set({ selected, highlight: null }),

  focusOn: (focus) => set({ focus, selected: focus ?? get().selected }),

  setVoice: (patch) => set(patch),

  log: (kind, text, key) => {
    if (!text) return;
    set((state) => {
      const lines = [...state.voiceLog];
      const index = key ? lines.findIndex((line) => line.key === key) : -1;
      if (index >= 0) lines[index] = { ...lines[index], text };
      else lines.push({ kind, text, key, at: Date.now() });
      return { voiceLog: lines.slice(-80) };
    });
  },

  clearLog: () => set({ voiceLog: [] }),
}));

export function logVoice(kind: VoiceKind, text: string, key?: string) {
  useStore.getState().log(kind, text, key);
}

export function effectiveScenario(): ScenarioChoice {
  return useStore.getState().scenario;
}

export function currentScenarioId() {
  const state = useStore.getState();
  return scenarioForYear(state.year, state.scenario);
}
