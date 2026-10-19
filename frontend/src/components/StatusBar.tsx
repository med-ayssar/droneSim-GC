import { CommandResultData, TelemetryData } from '../services/natsService';
import { Terminal, Activity, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

interface StatusBarProps {
  logs: CommandResultData[];
  telemetry: TelemetryData;
}

export function StatusBar({ logs, telemetry }: StatusBarProps) {
  const latest = logs[0];

  return (
    <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-lattice-line bg-[#070707] px-4 py-2 font-mono text-[11px] text-lattice-ink">
      {/* Terminal Command Log Line */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5 truncate">
        <Terminal className="h-3.5 w-3.5 shrink-0 text-lattice-amber" />
        {latest ? (
          <div className="flex items-center gap-2 truncate">
            <span className="text-lattice-amber font-bold">
              [{new Date(latest.timestampMs).toLocaleTimeString()}]
            </span>
            <span className="text-lattice-mute truncate">{latest.requestId}:</span>
            <span className="text-lattice-ink font-semibold truncate">{latest.message}</span>
          </div>
        ) : (
          <span className="text-lattice-mute">LATTICE SYSTEM READY · LISTENING FOR NATS TELEMETRY</span>
        )}
      </div>

      {/* Geodetic Coordinates & Status Badges */}
      <div className="flex shrink-0 items-center gap-5 uppercase tracking-[0.14em] text-lattice-mute">
        <div className="hidden sm:flex items-center gap-3">
          <span>LAT <strong className="text-lattice-ink font-mono">{telemetry.latitude.toFixed(5)}°N</strong></span>
          <span>LON <strong className="text-lattice-ink font-mono">{telemetry.longitude.toFixed(5)}°E</strong></span>
          <span>ALT <strong className="text-lattice-amber font-mono">{telemetry.altitudeM.toFixed(1)}m</strong></span>
        </div>

        {latest && (
          <span
            className={`font-bold px-2 py-0.5 text-[10px] uppercase border ${
              latest.status === 'FAILED' || latest.status === 'REJECTED'
                ? 'border-lattice-bad text-lattice-bad bg-lattice-bad/15 shadow-lattice-red'
                : latest.status === 'EXECUTED'
                ? 'border-lattice-ok text-lattice-ok bg-lattice-ok/15'
                : 'border-lattice-amber text-lattice-amber bg-lattice-amber/15 shadow-lattice-glow'
            }`}
          >
            {latest.status}
          </span>
        )}

        <div className={`flex items-center gap-1.5 text-[10px] ${telemetry.connected ? 'text-lattice-ok' : 'text-lattice-bad'}`}>
          <span className={`h-2 w-2 rounded-full ${telemetry.connected ? 'bg-lattice-ok animate-ping' : 'bg-lattice-bad'}`} />
          <span>{telemetry.connected ? 'PX4 LIVE' : 'PX4 OFFLINE'}</span>
        </div>
      </div>
    </footer>
  );
}
