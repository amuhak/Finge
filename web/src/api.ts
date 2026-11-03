import type { Dataset } from "./types";

export type GrokVoiceConfig = {
  available: boolean;
  label: string;
  model: string;
  voice: string;
};

export type Config = {
  voice_providers: { grok: GrokVoiceConfig };
  sample_available: boolean;
  real_available: boolean;
  sample_enabled: boolean;
};

async function json<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { detail?: string };
  if (!response.ok) throw new Error(body.detail ?? response.statusText);
  return body;
}

export async function fetchConfig(): Promise<Config> {
  return json<Config>(await fetch("/api/config"));
}

export async function fetchDataset(source: "auto" | "sample" | "none"): Promise<Dataset> {
  return json<Dataset>(await fetch(`/api/dataset?source=${source}`));
}

export async function fetchVoiceToken(): Promise<{ value: string }> {
  return json<{ value: string }>(await fetch("/api/voice/token", { method: "POST" }));
}
