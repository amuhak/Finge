import { useEffect, useRef, useState, type FormEvent } from "react";
import { useStore } from "../store";
import { PipFish } from "./Pip";
import { agent, levels, statusLabel } from "../voice/agent";

const KIND_CLASS: Record<string, string> = {
  user: "you",
  agent: "pip",
  tool: "tool",
  sys: "sys",
};

export function VoicePanel() {
  const log = useStore((s) => s.voiceLog);
  const status = useStore((s) => s.voiceStatus);
  const error = useStore((s) => s.voiceError);
  const micError = useStore((s) => s.voiceMicError);
  const [text, setText] = useState("");
  const [level, setLevel] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      setLevel(Math.min(1, levels.mic * 0.7 + agent.outLevel() * 1.2));
    }, 90);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [log]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    agent.ask(value);
    setText("");
  };

  return (
    <section className={`voice-panel ${status}`} aria-label="Pip voice console">
      <header className="voice-top">
        <PipFish size={78} talk={status === "speaking" ? level * 1.6 : 0} mood={status} />
        <div className="voice-title">
          <strong>Pip</strong>
          <span className={`vs ${status}`} role="status" aria-live="polite" aria-atomic="true">
            {error ?? statusLabel(status)}
          </span>
        </div>
        <button className="icon" onClick={() => agent.stop()} title="End voice session" aria-label="End voice session">
          ✕
        </button>
      </header>

      {error && status === "error" && (
        <p className="voice-hint">
          Check <code>.env</code> for <code>XAI_API_KEY</code>, then restart the server.
        </p>
      )}

      {micError && status !== "error" && <p className="voice-hint warn">{micError}</p>}

      <div className="voice-log" ref={list}>
        {log.length === 0 && <p className="voice-empty">Hi! I'm Pip. Ask me "where are the krill?" out loud, or type below.</p>}
        {log.map((line, index) => (
          <div key={line.key ?? `${line.at}-${index}`} className={`line ${KIND_CLASS[line.kind] ?? "sys"}`}>
                        <span className="what">{line.text}</span>
          </div>
        ))}
      </div>

      <form className="voice-form" onSubmit={submit}>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Type to Pip…"
          aria-label="Type a message to Pip"
        />
        <button className="btn" type="submit">
          Send
        </button>
      </form>
    </section>
  );
}
