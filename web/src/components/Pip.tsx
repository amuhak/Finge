/**
 * Pip, a mackerel icefish: long pale body, faint bars, a dark spiny first dorsal fin,
 * a duck-bill snout and a big eye. Flat colours only. `talk` (0–1) opens the jaw.
 */
export function PipFish({
  size = 64,
  talk = 0,
  mood = "idle",
}: {
  size?: number;
  talk?: number;
  mood?: "idle" | "listening" | "thinking" | "speaking" | "connecting" | "error" | "off";
}) {
  const jaw = Math.min(1, Math.max(0, talk)) * 16;
  return (
    <svg
      className={`pipfish ${mood}`}
      viewBox="0 0 128 64"
      width={size}
      height={(size * 64) / 128}
      role="img"
      aria-label="Pip the mackerel icefish"
    >
      <g className="pip-swim">
        <g className="pip-tail">
          <path d="M26 32 L6 16 L12 32 L6 48 Z" fill="#7fb0d6" stroke="#356a96" strokeWidth="2" strokeLinejoin="round" />
        </g>
        {/* first dorsal: dark and spiny */}
        <path d="M50 19 L54 5 L58 14 L62 4 L66 14 L70 8 L72 18 Z" fill="#2f4f6f" strokeLinejoin="round" />
        {/* second dorsal and anal fin */}
        <path d="M72 18 Q86 9 98 20 Z" fill="#9cc6e6" stroke="#356a96" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M56 45 Q74 57 92 44 Z" fill="#9cc6e6" stroke="#356a96" strokeWidth="1.6" strokeLinejoin="round" />
        {/* open mouth behind the jaw */}
        <path d="M104 34 L122 31 L122 40 Z" fill="#c4475a" />
        {/* lower jaw */}
        <g style={{ transform: `rotate(${jaw}deg)`, transformOrigin: "104px 35px", transition: "transform 80ms linear" }}>
          <path d="M102 35 L123 35 Q118 41 104 40 Z" fill="#e6f1fa" stroke="#356a96" strokeWidth="2" strokeLinejoin="round" />
        </g>
        {/* body with the long flat snout */}
        <path
          d="M24 32 Q30 18 58 17 Q90 16 106 26 L124 29 Q125 33 122 35 L104 35 Q92 47 58 47 Q30 46 24 32 Z"
          fill="#e6f1fa"
          stroke="#356a96"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        {/* faint icefish bars */}
        <path d="M44 22 L42 43 M56 19 L55 46 M68 19 L67 46 M80 20 L80 44" stroke="#a9c8e2" strokeWidth="3" strokeLinecap="round" />
        {/* pectoral fin */}
        <path className="pip-fin" d="M80 33 Q70 30 66 38 Q74 40 80 36 Z" fill="#9cc6e6" stroke="#356a96" strokeWidth="1.6" strokeLinejoin="round" />
        {/* cheek and eye */}
        <circle cx="96" cy="35" r="3.2" fill="#ffb3a7" />
        <circle cx="98" cy="25" r="7" fill="#ffffff" stroke="#356a96" strokeWidth="2" />
        <circle className="pip-pupil" cx="99.5" cy="25.5" r="3.8" fill="#16324f" />
        <circle cx="101" cy="23.6" r="1.3" fill="#ffffff" />
      </g>
      {mood === "speaking" && (
        <g className="pip-bubbles" fill="none" stroke="#5aa9d6" strokeWidth="1.6">
          <circle cx="124" cy="22" r="2.4" />
          <circle cx="120" cy="12" r="1.6" />
        </g>
      )}
    </svg>
  );
}
