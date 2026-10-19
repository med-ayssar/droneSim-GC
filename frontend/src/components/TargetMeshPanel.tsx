import { Radar, ShieldAlert, Crosshair, Navigation, CheckCircle2 } from 'lucide-react';

export interface TargetDetection {
  id: string;
  type: 'VEHICLE' | 'AIRCRAFT' | 'SENSOR' | 'STRUCTURE';
  lat: number;
  lon: number;
  distanceM: number;
  bearingDeg: number;
  threatLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence: number; // 0.0 to 1.0
  speedMs?: number;
}

interface TargetMeshPanelProps {
  targets: TargetDetection[];
  selectedTargetId: string | null;
  onSelectTarget: (id: string | null) => void;
  onTargetAction?: (action: 'INTERCEPT' | 'TRACK' | 'RECON', targetId: string) => void;
}

export function TargetMeshPanel({
  targets,
  selectedTargetId,
  onSelectTarget,
  onTargetAction,
}: TargetMeshPanelProps) {
  return (
    <div className="panel panel-tick flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className="label flex items-center gap-1.5">
          <Radar className="h-3.5 w-3.5 text-lattice-amber" />
          Sensor mesh · target tracks
        </span>
        <span className="font-mono text-[10px] text-lattice-amber">
          {targets.length} ACTIVE
        </span>
      </div>

      <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
        {targets.length === 0 ? (
          <div className="flex h-24 items-center justify-center border border-dashed border-lattice-line font-mono text-[11px] text-lattice-mute">
            No contacts detected in radar sweep
          </div>
        ) : (
          targets.map((tgt) => {
            const isSelected = tgt.id === selectedTargetId;
            const threatColor =
              tgt.threatLevel === 'HIGH'
                ? 'text-lattice-bad border-lattice-bad/40 bg-lattice-bad/10'
                : tgt.threatLevel === 'MEDIUM'
                ? 'text-lattice-amber border-lattice-amber/40 bg-lattice-amber/10'
                : 'text-lattice-ok border-lattice-ok/40 bg-lattice-ok/10';

            return (
              <div
                key={tgt.id}
                onClick={() => onSelectTarget(isSelected ? null : tgt.id)}
                className={`group relative flex flex-col gap-2 border p-2.5 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-lattice-amber bg-lattice-amber/10 shadow-lattice-glow'
                    : 'border-lattice-line bg-[#0e0e0e] hover:border-lattice-mute'
                }`}
              >
                {/* Header row */}
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="font-bold tracking-wider text-lattice-ink">{tgt.id}</span>
                    <span className="text-[9px] uppercase tracking-widest text-lattice-mute">
                      {tgt.type}
                    </span>
                  </div>
                  <span className={`px-1.5 py-0.5 text-[9px] font-bold border uppercase ${threatColor}`}>
                    {tgt.threatLevel}
                  </span>
                </div>

                {/* Metrics row */}
                <div className="grid grid-cols-3 gap-1 font-mono text-[10px]">
                  <div>
                    <span className="text-lattice-mute block">DIST</span>
                    <span className="text-lattice-ink font-bold">{tgt.distanceM.toFixed(0)} m</span>
                  </div>
                  <div>
                    <span className="text-lattice-mute block">BEARING</span>
                    <span className="text-lattice-ink font-bold">{tgt.bearingDeg.toFixed(0)}°</span>
                  </div>
                  <div>
                    <span className="text-lattice-mute block">CONFIDENCE</span>
                    <span className="text-lattice-amber font-bold">
                      {(tgt.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                {/* Actions row when selected */}
                {isSelected && (
                  <div className="flex items-center gap-2 pt-1 border-t border-lattice-line mt-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTargetAction?.('INTERCEPT', tgt.id);
                      }}
                      className="cmd-btn cmd-btn-bad flex-1 py-1 text-[10px] flex items-center justify-center gap-1"
                    >
                      <Crosshair className="h-3 w-3" /> Intercept
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTargetAction?.('RECON', tgt.id);
                      }}
                      className="cmd-btn flex-1 py-1 text-[10px] flex items-center justify-center gap-1"
                    >
                      <Navigation className="h-3 w-3" /> Track Orbit
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
