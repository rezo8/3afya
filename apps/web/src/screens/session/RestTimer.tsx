import { useCallback, useEffect, useRef, useState } from "react";

type RestState = { total: number; endsAt: number } | null;

function chime(ac: AudioContext | null) {
  if (!ac) return;
  const t = ac.currentTime;
  [880, 1320].forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const s = t + i * 0.18;
    gain.gain.setValueAtTime(0.0001, s);
    gain.gain.exponentialRampToValueAtTime(0.25, s + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, s + 0.16);
    osc.connect(gain).connect(ac.destination);
    osc.start(s);
    osc.stop(s + 0.18);
  });
}

export function useRestTimer() {
  const [state, setState] = useState<RestState>(null);
  const acRef = useRef<AudioContext | null>(null);

  const start = useCallback((seconds: number) => {
    if (!acRef.current && typeof window !== "undefined" && window.AudioContext) {
      acRef.current = new window.AudioContext();
    }
    void acRef.current?.resume();
    setState({ total: seconds, endsAt: Date.now() + seconds * 1000 });
  }, []);

  const adjust = useCallback((delta: number) => {
    setState((r) => (r ? { total: Math.max(5, r.total + delta), endsAt: Math.max(Date.now(), r.endsAt + delta * 1000) } : r));
  }, []);

  const skip = useCallback(() => setState(null), []);

  const onDone = useCallback(() => {
    chime(acRef.current);
    navigator.vibrate?.([120, 60, 120]);
    setState(null);
  }, []);

  return { state, start, adjust, skip, onDone };
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function RestBar({
  total,
  endsAt,
  onAdjust,
  onSkip,
  onDone,
}: {
  total: number;
  endsAt: number;
  onAdjust: (delta: number) => void;
  onSkip: () => void;
  onDone: () => void;
}) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    const tick = () => {
      const rem = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(rem);
      if (rem <= 0 && !firedRef.current) {
        firedRef.current = true;
        onDone();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt, onDone]);

  const pct = total > 0 ? Math.min(100, ((total - remaining) / total) * 100) : 0;

  return (
    <div className="rest-bar" role="timer" aria-label="Rest timer">
      <div className="rest-fill" style={{ width: `${pct}%` }} />
      <div className="rest-row">
        <button className="rest-adj" onClick={() => onAdjust(-15)} aria-label="Subtract 15 seconds">
          −15
        </button>
        <div className="rest-mid">
          <span className="rest-lbl">Rest</span>
          <span className="rest-time">{fmt(remaining)}</span>
        </div>
        <button className="rest-adj" onClick={() => onAdjust(15)} aria-label="Add 15 seconds">
          +15
        </button>
        <button className="rest-skip" onClick={onSkip}>
          Skip
        </button>
      </div>
    </div>
  );
}
