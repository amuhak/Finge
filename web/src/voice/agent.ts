// Pip — a mackerel icefish narrating the FishCast console.
// The backend mints a short-lived xAI token; audio goes browser <-> xAI directly.
// Tools run here: data tools read the loaded dataset, UI tools drive the store.
import { fetchConfig, fetchVoiceToken } from "../api";
import { logVoice, useStore, type VoiceStatus } from "../store";
import { confidenceLabel, pointFor, type Region, type ScenarioChoice, type ScenarioId } from "../types";
import { GrokTransport, type Handlers, type ToolCall, type ToolDef } from "./grok";

export const levels = { mic: 0, out: 0 };

const INSTRUCTIONS = `You are Pip, a mackerel icefish (Champsocephalus gunnari) living on the Southern Ocean shelf, talking to a visitor at a Grok hackathon demo. Krill are your food: where the krill go is where you can live.

You are the voice of the FishCast console — a world map of Antarctic krill density and hotspot probability built from a research model. You are a character, but you never invent data.

How to talk:
- First person, warm, a little dry and understated. One or two short sentences. No lists unless asked.
- Call tools silently. Never say "let me check", "one moment" or "I'll open that".
- NEVER state a number you did not get from a tool. If there is no dataset, say so and tell them to press "Turn on sample data".
- If the data is sample data, say once, briefly, that these are synthetic numbers for the demo. Do not repeat it every turn.
- The model has no demonstrated climate-only skill. Treat 2035 and 2050 as scenarios, not predictions, and say so when it matters. Never invent population sizes, dates or percentages.
- When asked "what does this mean?", what it means for the future, or what it means for fish and marine life: call explain_region, then give one concrete possibility and what it could mean for krill predators — hedged ("could", "may"), with the uncertainty named.
- You may explain general food-web dependencies (icefish, penguins, seals and whales eat krill), but never specific figures you were not given.
- To show a place, call focus_map. To change the year, call set_year. If they ask about "here" or "this", use the selected region.
- If asked whether krill are fish: no, they are crustaceans — your dinner.
- If the visitor says hi, greet them in one sentence and offer one thing to try.
- When they are done ("bye", "that's all", "stop listening"), call end_session.`;

const regionParam = {
  region: { type: "string", description: 'Region name, e.g. "South Georgia", "Ross Sea", or a region id' },
};

const TOOLS: ToolDef[] = [
  {
    name: "get_hotspots",
    description: "Rank the krill regions by hotspot probability for a year. Use for 'where are the krill'.",
    parameters: {
      type: "object",
      properties: {
        year: { type: "number", description: "Year to look at; defaults to the year on screen" },
        scenario: { type: "string", enum: ["ssp245", "ssp585"], description: "Future scenario; defaults to the one on screen" },
        limit: { type: "number", description: "How many regions, default 6" },
      },
    },
  },
  {
    name: "get_region",
    description: "One region's krill density, hotspot probability, uncertainty and MPA status.",
    parameters: { type: "object", properties: { ...regionParam }, required: ["region"] },
  },
  {
    name: "compare_years",
    description: "How one region's krill density and hotspot probability changed between two years.",
    parameters: {
      type: "object",
      properties: {
        ...regionParam,
        from_year: { type: "number" },
        to_year: { type: "number" },
      },
      required: ["region", "from_year", "to_year"],
    },
  },
  {
    name: "explain_region",
    description:
      "Everything needed to explain a region: its ecology, the series, the MPA status and the caveat. Use for 'what does this mean' and questions about fish or marine life.",
    parameters: { type: "object", properties: { ...regionParam }, required: ["region"] },
  },
  {
    name: "focus_map",
    description: "Move the map to a region, to the Southern Ocean, or back to the whole world.",
    parameters: {
      type: "object",
      properties: {
        region: { type: "string", description: "Region to focus; omit to reset" },
        area: { type: "string", enum: ["world", "southern_ocean"], description: "Where to look when no region is given" },
      },
    },
  },
  {
    name: "set_year",
    description: "Change the year and/or scenario shown on the map and timeline.",
    parameters: {
      type: "object",
      properties: {
        year: { type: "number" },
        scenario: { type: "string", enum: ["ssp245", "ssp585"] },
      },
      required: ["year"],
    },
  },
  {
    name: "end_session",
    description: 'End the voice session and turn the microphone off when the visitor is done.',
    parameters: { type: "object", properties: {} },
  },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function regions(): Region[] {
  return useStore.getState().dataset.regions;
}

function findRegion(ref: unknown): Region | null {
  const wanted = normalize(String(ref ?? ""));
  if (!wanted) return null;
  const list = regions();
  return (
    list.find((r) => normalize(r.id) === wanted) ??
    list.find((r) => normalize(r.name) === wanted) ??
    list.find((r) => normalize(r.name).includes(wanted) || wanted.includes(normalize(r.name))) ??
    list.find((r) => normalize(r.name).split(" ").some((word) => word.length > 3 && wanted.includes(word))) ??
    null
  );
}

function chosenScenario(a: Record<string, unknown>, year: number): ScenarioId {
  const raw = String(a.scenario ?? "");
  if (year > 2020) return raw === "ssp585" ? "ssp585" : "ssp245";
  return "historical";
}

function yearFrom(a: Record<string, unknown>, fallback: number): number {
  const value = Number(a.year);
  if (!Number.isFinite(value)) return fallback;
  const years = useStore.getState().dataset.meta?.years;
  if (!years?.length) return Math.round(value);
  return years.reduce((best, y) => (Math.abs(y - value) < Math.abs(best - value) ? y : best));
}

function brief(region: Region, year: number, scenario: ScenarioId) {
  const point = pointFor(region, year, scenario === "historical" ? "ssp245" : (scenario as ScenarioChoice));
  return {
    region: region.name,
    id: region.id,
    year,
    scenario,
    density: point?.density ?? null,
    hotspot: point?.hotspot ?? null,
    uncertainty: point?.uncertainty ?? null,
    uncertainty_words: point ? confidenceLabel(point.uncertainty) : null,
    mpa: region.mpa,
    mpa_name: region.mpa_name,
    coordinates: { lat: region.lat, lon: region.lon },
  };
}

async function runTool(name: string, a: Record<string, unknown>): Promise<unknown> {
  const state = useStore.getState();
  const dataset = state.dataset;
  const empty = dataset.regions.length === 0;

  if (name !== "end_session" && empty && !["focus_map", "set_year"].includes(name)) {
    return {
      error: "No dataset is loaded. Ask the visitor to press 'Turn on sample data'.",
    };
  }

  switch (name) {
    case "get_hotspots": {
      if (!dataset.regions.length) return { error: "No dataset is loaded." };
      const year = yearFrom(a, state.year);
      const scenario = chosenScenario(a, year);
      const limit = Math.max(1, Math.min(14, Number(a.limit) || 6));
      const ranked = dataset.regions
        .map((region) => ({ region, point: pointFor(region, year, scenario === "historical" ? "ssp245" : (scenario as ScenarioChoice)) }))
        .filter((row) => row.point)
        .sort((x, y) => (y.point?.hotspot ?? 0) - (x.point?.hotspot ?? 0))
        .slice(0, limit)
        .map(({ region, point }) => ({
          region: region.name,
          id: region.id,
          hotspot: point?.hotspot ?? null,
          density: point?.density ?? null,
          uncertainty: point?.uncertainty ?? null,
          mpa: region.mpa,
        }));
      return {
        year,
        scenario,
        sample: dataset.sample,
        caveat: dataset.meta?.caveat ?? null,
        hotspots: ranked,
      };
    }

    case "get_region":
    case "explain_region": {
      const region = findRegion(a.region);
      if (!region) return { error: `No region "${a.region}". Known: ${regions().map((r) => r.name).join(", ")}` };
      const year = yearFrom(a, state.year);
      const scenario = chosenScenario(a, year);
      if (name === "get_region") return { ...brief(region, year, scenario), sample: dataset.sample };
      return {
        ...brief(region, year, scenario),
        summary: region.summary,
        ecology: region.ecology,
        history: region.series
          .filter((p) => p.scenario === "historical")
          .map((p) => ({ year: p.year, density: p.density, hotspot: p.hotspot, uncertainty: p.uncertainty })),
        future: region.series
          .filter((p) => p.scenario !== "historical")
          .map((p) => ({ year: p.year, scenario: p.scenario, density: p.density, hotspot: p.hotspot, uncertainty: p.uncertainty })),
        sample: dataset.sample,
        caveat: dataset.meta?.caveat ?? null,
        n_hauls: region.series[0]?.n_hauls ?? null,
      };
    }

    case "compare_years": {
      const region = findRegion(a.region);
      if (!region) return { error: `No region "${a.region}".` };
      const fromYear = yearFrom({ year: a.from_year }, 1990);
      const toYear = yearFrom({ year: a.to_year }, state.year);
      const pa = pointFor(region, fromYear, chosenScenario(a, fromYear) as ScenarioChoice);
      const pb = pointFor(region, toYear, chosenScenario(a, toYear) as ScenarioChoice);
      if (!pa || !pb) return { error: "No data for those years." };
      const pct = (x: number, y: number) => (x === 0 ? null : Math.round(((y - x) / x) * 1000) / 10);
      return {
        region: region.name,
        from: { year: fromYear, density: pa.density, hotspot: pa.hotspot, uncertainty: pa.uncertainty },
        to: { year: toYear, density: pb.density, hotspot: pb.hotspot, uncertainty: pb.uncertainty },
        change: {
          density_pct: pct(pa.density, pb.density),
          hotspot_points: Math.round((pb.hotspot - pa.hotspot) * 1000) / 10,
        },
        sample: dataset.sample,
      };
    }

    case "focus_map": {
      if (a.region != null && String(a.region).trim()) {
        const region = findRegion(a.region);
        if (!region) return { error: `No region "${a.region}".` };
        state.select(region.id);
        state.focusOn(region.id);
        return { ok: true, showing: region.name };
      }
      const area = String(a.area ?? "world");
      state.select(null);
      state.focusOn(area === "southern_ocean" ? "southern_ocean" : null);
      return { ok: true, showing: area };
    }

    case "set_year": {
      if (!dataset.regions.length) return { error: "No dataset is loaded." };
      const year = yearFrom(a, state.year);
      state.setYear(year);
      const scenario = String(a.scenario ?? "");
      if (year > 2020 && (scenario === "ssp245" || scenario === "ssp585")) state.setScenario(scenario);
      return { ok: true, year: useStore.getState().year, scenario: useStore.getState().scenario };
    }

    case "end_session":
      return { ok: true, instruction: "Say a short goodbye. The session closes when you finish speaking." };
  }
  return { error: `Unknown tool ${name}` };
}

function b64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

class FishAgent {
  private transport: GrokTransport | null = null;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private playHead = 0;
  private responding = false;
  private ending = 0;
  private spokeSinceEnd = false;
  private pendingTexts: string[] = [];
  private opened = false;
  private gen = 0;

  async start() {
    const set = useStore.setState;
    const gen = ++this.gen;
    this.opened = false;
    set({ voiceOpen: true, voiceStatus: "connecting", voiceError: null, voiceMicError: null });
    try {
      const cfg = await fetchConfig();
      const grok = cfg.voice_providers.grok;
      if (!grok.available) throw new Error("No xAI key: put XAI_API_KEY=... in .env and restart the server.");
      const { value: token } = await fetchVoiceToken();

      const ctx = new AudioContext();
      this.ctx = ctx;
      await ctx.audioWorklet.addModule("/pcm-worklet.js");
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.connect(ctx.destination);

      const transport = new GrokTransport();
      this.transport = transport;
      await transport.open(
        { model: grok.model, voice: grok.voice, instructions: INSTRUCTIONS, tools: TOOLS, token },
        this.handlers(gen),
      );
      if (gen !== this.gen) return transport.close();
      this.opened = true;

      set({ voiceStatus: "listening" });
      const opener = this.pendingTexts.shift() ?? "Hi Pip.";
      logVoice("user", opener);
      transport.text(opener);

      // The microphone is optional: a denied prompt or no device still leaves a
      // live session, so typed questions keep working.
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (gen !== this.gen) return this.teardown();
        const mic = ctx.createMediaStreamSource(this.stream);
        const capture = new AudioWorkletNode(ctx, "pcm-capture");
        const mute = ctx.createGain();
        mute.gain.value = 0;
        mic.connect(capture).connect(mute).connect(ctx.destination);
        capture.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
          levels.mic = event.data.level;
          if (this.transport === transport) transport.audio(b64(event.data.pcm));
        };
      } catch {
        if (gen !== this.gen) return;
        set({ voiceMicError: "Microphone unavailable — type to Pip below." });
        logVoice("sys", "Microphone unavailable; typed messages still work.");
      }
    } catch (error) {
      if (gen !== this.gen) return;
      set({ voiceStatus: "error", voiceError: error instanceof Error ? error.message : String(error) });
      this.teardown();
    }
  }

  stop() {
    this.gen++;
    clearTimeout(this.ending);
    this.ending = 0;
    this.pendingTexts = [];
    this.transport?.close();
    this.teardown();
    useStore.setState({ voiceStatus: "off", voiceOpen: false, voiceMicError: null });
  }

  /** Type instead of talking — also how the region panel asks about a place. */
  ask(text: string) {
    const clean = text.trim();
    if (!clean) return;
    if (this.transport && this.opened) {
      logVoice("user", clean);
      this.stopPlayback();
      this.transport.text(clean);
      return;
    }
    this.pendingTexts.push(clean);
    const state = useStore.getState();
    if (!state.voiceOpen || state.voiceStatus === "error") void this.start();
  }

  sendText(text: string) {
    this.ask(text);
  }

  outLevel(): number {
    if (!this.analyser) return 0;
    const data = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const value of data) sum += ((value - 128) / 128) ** 2;
    return Math.sqrt(sum / data.length);
  }

  /** Ask queued questions one at a time, once the previous answer is quiet. */
  private flushQueue() {
    if (!this.transport || !this.opened || this.responding || this.sources.length || !this.pendingTexts.length) return;
    const next = this.pendingTexts.shift();
    if (!next) return;
    logVoice("user", next);
    this.transport.text(next);
  }

  private handlers(gen: number): Handlers {
    const set = useStore.setState;
    const live = () => gen === this.gen;
    return {
      audio: (delta) => {
        if (!live()) return;
        if (this.ending) this.spokeSinceEnd = true;
        this.play(delta);
      },
      agentText: (text, key) => {
        if (live()) logVoice("agent", text, key);
      },
      userText: (text, key) => {
        if (live()) logVoice("user", text, key);
      },
      userSpeaking: () => {
        if (!live()) return;
        this.stopPlayback();
        set({ voiceStatus: "listening" });
      },
      userStopped: () => {
        if (live()) set({ voiceStatus: "thinking" });
      },
      replying: () => {
        if (live()) this.responding = true;
      },
      toolCalls: (calls: ToolCall[]) => {
        if (!live()) return;
        for (const call of calls) {
          const args = Object.entries(call.args)
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(" ");
          logVoice("tool", `${call.name}${args ? ` · ${args}` : ""}`);
          if (call.name === "end_session" && !this.ending) {
            this.ending = window.setTimeout(() => this.stop(), 12000);
          }
        }
        Promise.all(calls.map((call) => runTool(call.name, call.args).catch((error) => ({ error: String(error) })))).then(
          (outputs) => {
            if (live()) {
              this.transport?.toolResults(calls.map((call, index) => ({ id: call.id, name: call.name, output: outputs[index] })));
            }
          },
        );
      },
      turnDone: () => {
        if (!live()) return;
        this.responding = false;
        if (this.ending && this.spokeSinceEnd) {
          const quiet = () => {
            if (!live()) return;
            if (this.sources.length) window.setTimeout(quiet, 100);
            else this.stop();
          };
          quiet();
          return;
        }
        if (!this.sources.length) set({ voiceStatus: "listening" });
        this.flushQueue();
      },
      closed: (reason) => {
        if (!live()) return;
        if (reason) set({ voiceStatus: "error", voiceError: reason });
        this.teardown();
      },
      error: (message) => {
        if (live()) logVoice("sys", message);
      },
    };
  }

  private teardown() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.analyser = null;
    this.sources = [];
    this.transport = null;
    this.opened = false;
    this.responding = false;
    this.spokeSinceEnd = false;
    clearTimeout(this.ending);
    this.ending = 0;
    levels.mic = 0;
    levels.out = 0;
  }

  private play(data: string) {
    const ctx = this.ctx;
    if (!ctx || !this.analyser) return;
    const binary = atob(data);
    const count = binary.length >> 1;
    if (!count) return;
    const buffer = ctx.createBuffer(1, count, 24000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < count; i++) {
      const value = binary.charCodeAt(2 * i) | (binary.charCodeAt(2 * i + 1) << 8);
      channel[i] = (value >= 0x8000 ? value - 0x10000 : value) / 32768;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.analyser);
    const at = Math.max(ctx.currentTime + 0.03, this.playHead);
    source.start(at);
    this.playHead = at + buffer.duration;
    this.sources.push(source);
    useStore.setState({ voiceStatus: "speaking" });
    source.onended = () => {
      this.sources = this.sources.filter((item) => item !== source);
      if (!this.sources.length && !this.responding) {
        useStore.setState({ voiceStatus: "listening" });
        this.flushQueue();
      }
    };
  }

  private stopPlayback() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
    this.playHead = 0;
  }
}

export const agent = new FishAgent();

export function statusLabel(status: VoiceStatus): string {
  switch (status) {
    case "off":
      return "Pip is asleep";
    case "connecting":
      return "Pip is surfacing…";
    case "listening":
      return "Pip is listening";
    case "thinking":
      return "Pip is thinking";
    case "speaking":
      return "Pip is talking";
    case "error":
      return "Pip lost the current";
  }
}
