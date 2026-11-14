import type { Chart } from '../chart/model';
import type { Position } from '../audio/engine';

interface Props {
  chart: Chart;
  playing: boolean;
  position: Position;
  loop: { mode: 'off' | 'visible' | 'range' };
  onPlay: () => void;
  onStop: () => void;
  onTempo: (bpm: number) => void;
  onToggleLoop: () => void;
  onExit: () => void;
}

export function StandBar(props: Props) {
  const { chart, position } = props;
  const bar = props.playing ? position.bar + 1 : 1;
  const beat = props.playing ? Math.floor(position.beat) + 1 : 1;

  return (
    <header className="standbar">
      <div className="stand-title">
        <b>{chart.name || 'Untitled chart'}</b>
        <span>{props.playing ? `Bar ${bar} · beat ${beat}` : 'Stopped'}</span>
      </div>

      <div className="stand-transport">
        <button
          className={`stand-play${props.playing ? ' on' : ''}`}
          onClick={props.playing ? props.onStop : props.onPlay}
          aria-label={props.playing ? 'Stop' : 'Play'}
        >
          {props.playing ? '■' : '▶'}
        </button>

        <div className="stand-tempo">
          <button onClick={() => props.onTempo(Math.max(40, chart.tempo - 5))} aria-label="Tempo down">−</button>
          <b>{chart.tempo}</b>
          <button onClick={() => props.onTempo(Math.min(220, chart.tempo + 5))} aria-label="Tempo up">+</button>
        </div>

        <button
          className={`stand-toggle${props.loop.mode !== 'off' ? ' on' : ''}`}
          onClick={props.onToggleLoop}
        >
          {props.loop.mode === 'range' ? 'A–B' : 'Loop'}
        </button>

        <button className="stand-exit" onClick={props.onExit}>Exit</button>
      </div>
    </header>
  );
}
