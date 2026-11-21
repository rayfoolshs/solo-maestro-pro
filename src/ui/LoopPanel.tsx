export interface LoopState {
  mode: 'off' | 'visible' | 'range';
  from: number;
  to: number;
}

interface Props {
  loop: LoopState;
  onChange: (loop: LoopState) => void;
}

const MODES = [
  { id: 'off', label: 'Off', title: 'Play through without looping' },
  { id: 'visible', label: 'Visible', title: 'Loop all the bars on screen' },
  { id: 'range', label: 'A–B', title: 'Loop an A–B range' },
] as const;

/** Transport loop controls, in the left rail directly under the mixer. */
export function LoopPanel({ loop, onChange }: Props) {
  const from = Math.min(loop.from, loop.to);
  const to = Math.max(loop.from, loop.to);
  const status = loop.mode === 'range' ? `A–B ${from}–${to}` : loop.mode === 'visible' ? 'Visible bars' : 'Off';

  const setFrom = (value: number) =>
    onChange({ ...loop, mode: 'range', from: Math.max(1, Math.min(64, value)) });
  const setTo = (value: number) =>
    onChange({ ...loop, mode: 'range', to: Math.max(1, Math.min(64, value)) });

  return (
    <section className="card loopcard">
      <div className="mixhead">
        <div className="ttl">Loop</div>
        <div className="spacer" />
        <span className={`loopstate${loop.mode === 'off' ? '' : ' on'}`}>{status}</span>
      </div>

      <div className="seg loopseg" role="group" aria-label="Loop mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={loop.mode === m.id ? 'on' : ''}
            title={m.title}
            aria-pressed={loop.mode === m.id}
            onClick={() => onChange({ ...loop, mode: m.id })}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="loopab">
        <label>
          A
          <span className="tstep">
            <button onClick={() => setFrom(loop.from - 1)} aria-label="Loop start back a bar">−</button>
            <b>{loop.from}</b>
            <button onClick={() => setFrom(loop.from + 1)} aria-label="Loop start forward a bar">+</button>
          </span>
        </label>
        <label>
          B
          <span className="tstep">
            <button onClick={() => setTo(loop.to - 1)} aria-label="Loop end back a bar">−</button>
            <b>{loop.to}</b>
            <button onClick={() => setTo(loop.to + 1)} aria-label="Loop end forward a bar">+</button>
          </span>
        </label>
      </div>
    </section>
  );
}
