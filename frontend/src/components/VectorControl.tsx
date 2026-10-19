import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Octagon,
  RotateCcw,
  RotateCw,
  Gauge,
  Sliders,
} from 'lucide-react';

type Dir = 'FORWARD' | 'BACKWARD' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'YAW_LEFT' | 'YAW_RIGHT' | 'STOP';

interface VectorControlProps {
  onSendVelocity: (vx: number, vy: number, vz: number, yawRate: number) => void;
  canControl: boolean;
  speedMs: number;
  onSpeedChange: (speed: number) => void;
  targetHeightM: number;
  onHeightChange: (alt: number) => void;
  onGotoAltitude: () => void;
}

export function VectorControl({
  onSendVelocity,
  canControl,
  speedMs,
  onSpeedChange,
  targetHeightM,
  onHeightChange,
  onGotoAltitude,
}: VectorControlProps) {
  const [held, setHeld] = useState<Dir | null>(null);
  const heldRef = useRef<Dir | null>(null);
  const speedRef = useRef(speedMs);

  useEffect(() => {
    speedRef.current = speedMs;
  }, [speedMs]);

  const vectorFor = useCallback((dir: Dir): [number, number, number, number] => {
    const s = speedRef.current;
    switch (dir) {
      case 'FORWARD':
        return [s, 0, 0, 0];
      case 'BACKWARD':
        return [-s, 0, 0, 0];
      case 'RIGHT':
        return [0, s, 0, 0];
      case 'LEFT':
        return [0, -s, 0, 0];
      case 'UP':
        return [0, 0, -s, 0]; // NED frame: -z is up
      case 'DOWN':
        return [0, 0, s, 0]; // NED frame: +z is down
      case 'YAW_LEFT':
        return [0, 0, 0, -0.5];
      case 'YAW_RIGHT':
        return [0, 0, 0, 0.5];
      default:
        return [0, 0, 0, 0];
    }
  }, []);

  const stop = useCallback(() => {
    heldRef.current = null;
    setHeld(null);
    onSendVelocity(0, 0, 0, 0);
  }, [onSendVelocity]);

  const start = useCallback(
    (dir: Dir) => {
      if (!canControl) return;
      heldRef.current = dir;
      setHeld(dir);
      onSendVelocity(...vectorFor(dir));
    },
    [canControl, onSendVelocity, vectorFor]
  );

  // Send periodic stream when holding button/key
  useEffect(() => {
    if (!held) return;
    const id = window.setInterval(() => {
      const dir = heldRef.current;
      if (!dir || dir === 'STOP') return;
      onSendVelocity(...vectorFor(dir));
    }, 150);
    return () => window.clearInterval(id);
  }, [held, onSendVelocity, vectorFor]);

  // Keyboard controls listener (WASD + QERF + Space)
  useEffect(() => {
    const keyMap: Record<string, Dir> = {
      KeyW: 'FORWARD',
      KeyS: 'BACKWARD',
      KeyA: 'LEFT',
      KeyD: 'RIGHT',
      KeyQ: 'YAW_LEFT',
      KeyE: 'YAW_RIGHT',
      KeyR: 'UP',
      KeyF: 'DOWN',
      Space: 'STOP',
    };

    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      // Don't trigger when user is typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      const dir = keyMap[e.code];
      if (!dir) return;
      e.preventDefault();
      if (dir === 'STOP') stop();
      else start(dir);
    };

    const up = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const dir = keyMap[e.code];
      if (!dir || dir === 'STOP') return;
      if (heldRef.current === dir) stop();
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [start, stop]);

  const bind = (dir: Dir) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      start(dir);
    },
    onPointerUp: () => stop(),
    onPointerCancel: () => stop(),
  });

  return (
    <div className="panel panel-tick flex flex-col gap-5 p-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-lattice-line pb-2">
        <span className="label flex items-center gap-1.5">
          <Sliders className="h-3.5 w-3.5 text-lattice-amber" />
          Direction · Vector Flight
        </span>
        <span className="font-mono text-[10px] text-lattice-amber">
          {canControl ? 'HOTKEYS ACTIVE (WASD)' : 'ARM TO FLY'}
        </span>
      </div>

      {/* Direct D-Pad Grid (3x3) */}
      <div className="grid grid-cols-3 gap-2">
        <Pad held={held === 'YAW_LEFT'} disabled={!canControl} keyHint="Q" {...bind('YAW_LEFT')} title="Yaw left (Q)">
          <RotateCcw className="h-4 w-4" />
        </Pad>
        <Pad held={held === 'FORWARD'} disabled={!canControl} keyHint="W" {...bind('FORWARD')} title="Forward (W)">
          <ArrowUp className="h-5 w-5" />
        </Pad>
        <Pad held={held === 'YAW_RIGHT'} disabled={!canControl} keyHint="E" {...bind('YAW_RIGHT')} title="Yaw right (E)">
          <RotateCw className="h-4 w-4" />
        </Pad>
        <Pad held={held === 'LEFT'} disabled={!canControl} keyHint="A" {...bind('LEFT')} title="Left (A)">
          <ArrowLeft className="h-5 w-5" />
        </Pad>
        <Pad held={held === 'STOP'} disabled={!canControl} keyHint="SPC" onPointerDown={() => stop()} title="Stop / Hover (Space)">
          <Octagon className="h-4 w-4 text-lattice-bad" />
        </Pad>
        <Pad held={held === 'RIGHT'} disabled={!canControl} keyHint="D" {...bind('RIGHT')} title="Right (D)">
          <ArrowRight className="h-5 w-5" />
        </Pad>
        <Pad held={held === 'DOWN'} disabled={!canControl} keyHint="F" {...bind('DOWN')} title="Descend (F)">
          <ChevronDown className="h-5 w-5 text-lattice-amber" />
        </Pad>
        <Pad held={held === 'BACKWARD'} disabled={!canControl} keyHint="S" {...bind('BACKWARD')} title="Back (S)">
          <ArrowDown className="h-5 w-5" />
        </Pad>
        <Pad held={held === 'UP'} disabled={!canControl} keyHint="R" {...bind('UP')} title="Climb (R)">
          <ChevronUp className="h-5 w-5 text-lattice-ok" />
        </Pad>
      </div>

      {/* Speed Controls */}
      <div className="border-t border-lattice-line pt-3 font-mono">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="label flex items-center gap-1">
            <Gauge className="h-3 w-3 text-lattice-mute" /> CRUISE SPEED
          </span>
          <span className="value text-xs text-lattice-amber font-bold">
            {speedMs.toFixed(1)} m/s
            <span className="ml-2 text-lattice-mute font-normal">{(speedMs * 3.6).toFixed(0)} km/h</span>
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={15}
          step={0.5}
          value={speedMs}
          onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
          className="w-full"
        />
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {[
            { label: 'SLOW 2m/s', val: 2 },
            { label: 'MED 5m/s', val: 5 },
            { label: 'FAST 10m/s', val: 10 },
          ].map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => onSpeedChange(p.val)}
              className={`cmd-btn py-1 text-[10px] ${speedMs === p.val ? 'cmd-btn-active' : ''}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Target Altitude Controls */}
      <div className="border-t border-lattice-line pt-3 font-mono">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="label">TARGET ALTITUDE</span>
          <span className="value text-xs font-bold text-lattice-ink">{targetHeightM.toFixed(0)} m</span>
        </div>
        <input
          type="range"
          min={2}
          max={50}
          step={1}
          value={targetHeightM}
          onChange={(e) => onHeightChange(parseFloat(e.target.value))}
          className="w-full"
        />
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {[2, 5, 10, 20].map((alt) => (
            <button
              key={alt}
              type="button"
              onClick={() => onHeightChange(alt)}
              className={`cmd-btn py-1 text-[10px] ${targetHeightM === alt ? 'cmd-btn-active' : ''}`}
            >
              {alt}m
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!canControl}
          onClick={onGotoAltitude}
          className="cmd-btn cmd-btn-active mt-2.5 w-full py-2 text-xs font-bold"
        >
          SET ALTITUDE TO {targetHeightM}m
        </button>
      </div>
    </div>
  );
}

function Pad({
  children,
  held,
  disabled,
  keyHint,
  title,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
}: {
  children: ReactNode;
  held: boolean;
  disabled: boolean;
  keyHint: string;
  title: string;
  onPointerDown?: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: () => void;
  onPointerCancel?: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={`pad-btn relative aspect-square touch-none flex flex-col items-center justify-center ${
        held ? 'pad-btn-held' : ''
      }`}
    >
      {children}
      <span className="absolute bottom-1 right-1.5 font-mono text-[8px] font-bold text-lattice-mute opacity-60">
        {keyHint}
      </span>
    </button>
  );
}
