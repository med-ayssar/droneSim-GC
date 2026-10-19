import { TelemetryData } from '../services/natsService';
import { cardinal, headingDeg, radToDeg, wrap360 } from '../lib/attitude';
import { Compass, Activity, Navigation } from 'lucide-react';

interface FlightInstrumentsProps {
  telemetry: TelemetryData;
}

export function FlightInstruments({ telemetry }: FlightInstrumentsProps) {
  const pitch = radToDeg(telemetry.pitch);
  const roll = radToDeg(telemetry.roll);
  const yaw = radToDeg(telemetry.yaw);
  const hdg = headingDeg(telemetry.headingDeg, telemetry.yaw);
  const pitchOffset = Math.max(-90, Math.min(90, pitch * 2.8));

  return (
    <div className="panel panel-tick flex h-full min-h-[420px] flex-col p-4">
      {/* Header readouts */}
      <div className="mb-4 flex items-center justify-between border-b border-lattice-line pb-2 font-mono text-[11px]">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-lattice-amber" />
          <span className="label">Primary Flight Display (PFD)</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-lattice-mute">HEADING:</span>
          <span className="font-bold text-lattice-amber">
            {hdg.toFixed(0).padStart(3, '0')}° {cardinal(hdg)}
          </span>
        </div>
      </div>

      {/* Main HUD Gauge Array */}
      <div className="flex flex-1 items-center justify-around gap-4 py-2">
        {/* Left: Compass Rose Gauge */}
        <CompassRose heading={hdg} />

        {/* Center: Artificial Horizon Sphere */}
        <div className="relative h-64 w-64 sm:h-72 sm:w-72 overflow-hidden rounded-full border-2 border-lattice-line bg-[#050505] shadow-[0_0_25px_rgba(0,0,0,0.9)]">
          {/* Rotating Horizon Plane */}
          <div
            className="absolute left-1/2 top-1/2 h-[240%] w-[240%] -translate-x-1/2 -translate-y-1/2 transition-transform duration-75 ease-linear"
            style={{
              transform: `translate(-50%, -50%) rotate(${-roll}deg) translateY(${pitchOffset}px)`,
            }}
          >
            <div className="flex h-full w-full flex-col">
              {/* Sky Half */}
              <div className="relative h-1/2 w-full bg-gradient-to-b from-[#1b3a54] to-[#2c5b80] border-b border-[#e8e4d9]/70">
                <Ladder side="sky" />
              </div>
              {/* Ground Half */}
              <div className="relative h-1/2 w-full bg-gradient-to-b from-[#5c442a] to-[#2e1d0f]">
                <Ladder side="ground" />
              </div>
            </div>
          </div>

          {/* Fixed Aircraft Crosshair Overlay */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {/* Center dot */}
            <div className="h-2 w-2 rounded-full bg-lattice-amber border border-black" />
            {/* Horizontal wing reference line */}
            <div className="absolute h-[2px] w-32 bg-lattice-amber/90 shadow-[0_0_8px_#c4a574]" />
            {/* Left Wing reticle */}
            <div className="absolute left-[20%] h-3 w-3 border-b-2 border-l-2 border-lattice-amber -mt-2" />
            {/* Right Wing reticle */}
            <div className="absolute right-[20%] h-3 w-3 border-b-2 border-r-2 border-lattice-amber -mt-2" />
          </div>

          {/* Roll angle pointer at top */}
          <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 font-mono text-[10px] text-lattice-amber font-bold bg-[#070707]/80 px-2 py-0.5 rounded border border-lattice-line">
            ROLL {roll.toFixed(1)}°
          </div>

          {/* Pitch angle pointer at bottom */}
          <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 font-mono text-[10px] text-lattice-ink font-bold bg-[#070707]/80 px-2 py-0.5 rounded border border-lattice-line">
            ALT {telemetry.altitudeM.toFixed(1)}m
          </div>
        </div>

        {/* Right: Altitude Tape Gauge */}
        <AltitudeTape altitudeM={telemetry.altitudeM} />
      </div>

      {/* Telemetry Readouts Grid */}
      <div className="mt-4 grid grid-cols-3 gap-px border border-lattice-line bg-lattice-line sm:grid-cols-6 font-mono text-xs">
        <Metric label="Roll" value={`${roll.toFixed(1)}°`} />
        <Metric label="Pitch" value={`${pitch.toFixed(1)}°`} />
        <Metric label="Yaw" value={`${yaw.toFixed(1)}°`} />
        <Metric label="Hdg" value={`${hdg.toFixed(0)}° ${cardinal(hdg)}`} />
        <Metric label="Alt AMSL" value={`${telemetry.altitudeM.toFixed(1)} m`} />
        <Metric
          label="GNSS Fix"
          value={telemetry.gpsAvailable ? `${telemetry.satellitesVisible} SATS` : 'NO LOCK'}
          highlight={telemetry.gpsAvailable}
        />
      </div>
    </div>
  );
}

function Ladder({ side }: { side: 'sky' | 'ground' }) {
  const marks = side === 'sky' ? [20, 10] : [10, 20];
  return (
    <div
      className={`absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-5 font-mono text-[9px] text-white/80 font-bold ${
        side === 'sky' ? 'bottom-6' : 'top-6'
      }`}
    >
      {marks.map((m) => (
        <div key={m} className="flex items-center gap-2">
          <span className="w-8 border-t border-white/70" />
          <span>
            {side === 'sky' ? '+' : '-'}
            {m}°
          </span>
          <span className="w-8 border-t border-white/70" />
        </div>
      ))}
    </div>
  );
}

function CompassRose({ heading }: { heading: number }) {
  const ticks = Array.from({ length: 36 }, (_, i) => i * 10);
  return (
    <div className="hidden w-28 shrink-0 flex-col items-center lg:flex font-mono">
      <span className="label mb-2">Compass Rose</span>
      <svg viewBox="0 0 120 120" className="h-28 w-28">
        <circle cx="60" cy="60" r="54" fill="#070707" stroke="#2a2a2a" strokeWidth="1.5" />
        <g transform={`rotate(${-heading} 60 60)`}>
          {ticks.map((deg) => {
            const major = deg % 90 === 0;
            const r1 = major ? 40 : 46;
            const rad = ((deg - 90) * Math.PI) / 180;
            const x1 = 60 + r1 * Math.cos(rad);
            const y1 = 60 + r1 * Math.sin(rad);
            const x2 = 60 + 54 * Math.cos(rad);
            const y2 = 60 + 54 * Math.sin(rad);
            return (
              <line
                key={deg}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={major ? '#c4a574' : '#7a766c'}
                strokeWidth={major ? 1.5 : 0.8}
              />
            );
          })}
          <text x="60" y="22" textAnchor="middle" fill="#c4a574" fontSize="10" fontWeight="bold" fontFamily="IBM Plex Mono">
            N
          </text>
          <text x="102" y="64" textAnchor="middle" fill="#7a766c" fontSize="8" fontFamily="IBM Plex Mono">
            E
          </text>
          <text x="60" y="108" textAnchor="middle" fill="#7a766c" fontSize="8" fontFamily="IBM Plex Mono">
            S
          </text>
          <text x="18" y="64" textAnchor="middle" fill="#7a766c" fontSize="8" fontFamily="IBM Plex Mono">
            W
          </text>
        </g>
        <polygon points="60,8 55,18 65,18" fill="#c4a574" />
        <circle cx="60" cy="60" r="2.5" fill="#c4a574" />
      </svg>
      <span className="value mt-1 text-xs font-bold text-lattice-amber">
        {wrap360(heading).toFixed(0)}° {cardinal(heading)}
      </span>
    </div>
  );
}

function AltitudeTape({ altitudeM }: { altitudeM: number }) {
  const center = Math.round(altitudeM);
  const marks = Array.from({ length: 9 }, (_, i) => center + 4 - i);
  return (
    <div className="flex h-64 w-16 flex-col items-center sm:h-72 font-mono">
      <span className="label mb-2">Altitude</span>
      <div className="relative flex-1 w-full overflow-hidden border border-lattice-line bg-[#0a0a0a]">
        <div className="absolute inset-0 flex flex-col justify-between py-2 font-mono text-[10px] text-lattice-mute">
          {marks.map((m) => (
            <div key={m} className="flex items-center justify-between px-1">
              <span className="h-px w-2 bg-lattice-line" />
              <span>{m}</span>
            </div>
          ))}
        </div>
        <div className="absolute left-0 right-0 top-1/2 flex -translate-y-1/2 items-center justify-center border-y border-lattice-amber bg-[#14110c] py-1 shadow-lattice-glow">
          <span className="value text-xs font-bold text-lattice-amber">{altitudeM.toFixed(1)}m</span>
        </div>
      </div>
      <span className="label mt-1">AMSL</span>
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-lattice-panel px-3 py-2">
      <div className="label mb-0.5">{label}</div>
      <div className={`value text-xs font-bold ${highlight ? 'text-lattice-ok' : 'text-lattice-ink'}`}>
        {value}
      </div>
    </div>
  );
}
