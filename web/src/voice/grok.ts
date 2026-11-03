// xAI Grok realtime voice transport (OpenAI-realtime style events).
// Ported from hackgt-26/web/src/voice/transports.ts; Gemini removed.
// The backend mints a short-lived client secret, so this file never sees the API key.

export type ToolDef = {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
};

export type ToolCall = { id: string; name: string; args: Record<string, unknown> };

export type Handlers = {
  audio(b64: string): void;
  agentText(text: string, key: string): void; // full text so far for this reply
  userText(text: string, key: string): void; // full text so far for this user turn
  toolCalls(calls: ToolCall[]): void;
  userSpeaking(): void; // barge-in: stop playback
  userStopped(): void;
  replying(): void;
  turnDone(): void;
  closed(reason: string | null): void; // null: we closed it
  error(msg: string): void;
};

export type Session = {
  model: string;
  voice: string;
  instructions: string;
  tools: ToolDef[];
  token: string;
};

export class GrokTransport {
  private ws: WebSocket | null = null;
  private h!: Handlers;
  private closing = false;
  private ready: () => void = () => {};
  private responding = false;
  private needResponse = false; // tool outputs sent, model hasn't been asked to continue
  private outstanding = 0; // tool calls still running
  private texts: Record<string, string> = {};

  open(s: Session, h: Handlers): Promise<void> {
    this.h = h;
    return this.connect(
      `wss://api.x.ai/v1/realtime?model=${encodeURIComponent(s.model)}`,
      [`xai-client-secret.${s.token}`],
      () => {
        this.send({
          type: "session.update",
          session: {
            voice: s.voice,
            instructions: s.instructions,
            turn_detection: { type: "server_vad" },
            audio: {
              input: { format: { type: "audio/pcm", rate: 24000 } },
              output: { format: { type: "audio/pcm", rate: 24000 } },
            },
            tools: s.tools.map((t) => ({ type: "function", ...t })),
          },
        });
        this.ready();
      },
      (e) => this.onEvent(e),
    );
  }

  audio(b64: string) {
    this.send({ type: "input_audio_buffer.append", audio: b64 });
  }

  text(t: string) {
    this.send({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text: t }] },
    });
    this.send({ type: "response.create" });
  }

  toolResults(results: { id: string; name: string; output: unknown }[]) {
    for (const r of results) {
      this.send({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: r.id, output: JSON.stringify(r.output) },
      });
    }
    this.outstanding -= results.length;
    this.maybeContinue();
  }

  close() {
    this.closing = true;
    this.ws?.close();
  }

  private connect(
    url: string,
    protocols: string[] | undefined,
    onOpen: () => void,
    onMsg: (m: Record<string, any>) => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url, protocols);
      this.ws = ws;
      let up = false;
      this.ready = () => {
        up = true;
        resolve();
      };
      ws.onopen = onOpen;
      ws.onmessage = async (ev) => {
        const raw = typeof ev.data === "string" ? ev.data : await (ev.data as Blob).text();
        onMsg(JSON.parse(raw));
      };
      ws.onclose = (ev) => {
        const why = `Voice connection closed (${ev.code}${ev.reason ? ": " + ev.reason : ""})`;
        if (!up) reject(new Error(why));
        else this.h.closed(this.closing ? null : why);
        this.ws = null;
      };
    });
  }

  private send(m: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  private maybeContinue() {
    if (this.needResponse && !this.responding && this.outstanding <= 0) {
      this.needResponse = false;
      this.send({ type: "response.create" });
    }
  }

  private onEvent(e: Record<string, any>) {
    const h = this.h;
    switch (e.type) {
      case "input_audio_buffer.speech_started":
        h.userSpeaking();
        break;
      case "input_audio_buffer.speech_stopped":
        h.userStopped();
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (e.transcript) h.userText(e.transcript, `u-${e.item_id}`);
        break;
      case "response.created":
        this.responding = true;
        h.replying();
        break;
      case "response.output_audio.delta":
      case "response.audio.delta":
        h.audio(e.delta);
        break;
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta": {
        const key = `a-${e.response_id ?? e.item_id}`;
        this.texts[key] = (this.texts[key] ?? "") + e.delta;
        h.agentText(this.texts[key], key);
        break;
      }
      case "response.function_call_arguments.done": {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(e.arguments || "{}");
        } catch {
          /* leave empty */
        }
        this.needResponse = true;
        this.outstanding++;
        h.toolCalls([{ id: e.call_id, name: e.name, args }]);
        break;
      }
      case "response.done":
        this.responding = false;
        if (this.needResponse) this.maybeContinue();
        else h.turnDone();
        break;
      case "error":
        h.error(e.error?.message ?? JSON.stringify(e).slice(0, 200));
        break;
    }
  }
}
