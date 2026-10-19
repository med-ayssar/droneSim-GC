import { useState } from 'react';
import { CommandType, TelemetryData } from '../services/natsService';
import { ShieldAlert, Power, PlaneTakeoff, PlaneLanding, Home, Pause, Compass, AlertTriangle } from 'lucide-react';

interface CommandPanelProps {
  telemetry: TelemetryData;
  onSendCommand: (type: CommandType, takeoffAlt?: number) => void;
  isSending: boolean;
  takeoffAltM: number;
  selectedTargetId?: string | null;
}

export function CommandPanel({
  telemetry,
  onSendCommand,
  isSending,
  takeoffAltM,
  selectedTargetId,
}: CommandPanelProps) {
  const [showArmConfirm, setShowArmConfirm] = useState<boolean>(false);

  const isArmed = telemetry.armed;
  const isAirborne =
    telemetry.flightMode === 'TAKEOFF' ||
    telemetry.flightMode === 'OFFBOARD' ||
    telemetry.flightMode === 'POSCTL' ||
    telemetry.flightMode === 'HOLD' ||
    telemetry.altitudeM > 1.0;

  const live = telemetry.connected;
  const canArm = !isArmed && live;
  const canDisarm = isArmed && !isAirborne && live;
  const canTakeoff = isArmed && !isAirborne && live;
  const canLand = isAirborne && live;
  const canRtl = isArmed && live;
  const canHold = isAirborne && live;
  const canOffboard = isArmed && live;

  const handleArmToggle = () => {
    if (isArmed) {
      onSendCommand('DISARM');
    } else {
      setShowArmConfirm(true);
    }
  };

  const confirmArm = () => {
    setShowArmConfirm(false);
    onSendCommand('ARM');
  };

  return (
    <div className="panel panel-tick flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className="label">Vehicle commands</span>
        <span className="font-mono text-[10px] text-lattice-amber">
          {isArmed ? 'VEHICLE LIVE' : 'SAFETY LOCKED'}
        </span>
      </div>

      {/* Safety Arm / Disarm Trigger */}
      {showArmConfirm ? (
        <div className="flex flex-col gap-2 border border-lattice-bad bg-lattice-bad/15 p-3 animate-pulse">
          <div className="flex items-center gap-2 font-mono text-[11px] text-lattice-bad font-bold uppercase">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Confirm Arming Propulsion?
          </div>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button
              type="button"
              onClick={confirmArm}
              className="cmd-btn cmd-btn-bad py-2 bg-lattice-bad text-white font-bold text-center"
            >
              CONFIRM ARM
            </button>
            <button
              type="button"
              onClick={() => setShowArmConfirm(false)}
              className="cmd-btn py-2 text-center"
            >
              CANCEL
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={(!canArm && !canDisarm) || isSending}
          onClick={handleArmToggle}
          className={`cmd-btn flex items-center justify-center gap-2 py-3 text-xs font-bold transition-all ${
            isArmed
              ? 'cmd-btn-bad border-lattice-bad text-lattice-bad bg-lattice-bad/15 shadow-lattice-red'
              : 'cmd-btn-ok border-lattice-ok text-lattice-ok bg-lattice-ok/10'
          }`}
        >
          <Power className="h-4 w-4" />
          {isArmed ? 'DISARM VEHICLE' : 'ARM VEHICLE'}
        </button>
      )}

      {/* Primary Flight Commands Grid */}
      <div className="grid grid-cols-2 gap-2 mt-1">
        <Btn
          icon={<PlaneTakeoff className="h-3.5 w-3.5" />}
          label={`TAKEOFF ${takeoffAltM.toFixed(0)}m`}
          disabled={!canTakeoff || isSending}
          className="col-span-2 cmd-btn-active"
          onClick={() => onSendCommand('TAKEOFF', takeoffAltM)}
        />

        <Btn
          icon={<PlaneLanding className="h-3.5 w-3.5" />}
          label="LAND"
          disabled={!canLand || isSending}
          onClick={() => onSendCommand('LAND')}
        />

        <Btn
          icon={<Home className="h-3.5 w-3.5" />}
          label="RTL"
          disabled={!canRtl || isSending}
          onClick={() => onSendCommand('RTL')}
        />

        <Btn
          icon={<Pause className="h-3.5 w-3.5" />}
          label="HOLD / HOVER"
          disabled={!canHold || isSending}
          onClick={() => onSendCommand('HOLD')}
        />

        <Btn
          icon={<Compass className="h-3.5 w-3.5" />}
          label="OFFBOARD"
          disabled={!canOffboard || isSending}
          onClick={() => onSendCommand('OFFBOARD')}
        />
      </div>

      {/* Target Engagement Context Banner */}
      {selectedTargetId && (
        <div className="border border-lattice-amber/40 bg-lattice-amber/10 p-2.5 flex items-center justify-between font-mono text-[10px]">
          <span className="text-lattice-ink">TARGET LOCKED: <strong className="text-lattice-amber">{selectedTargetId}</strong></span>
          <button
            type="button"
            onClick={() => onSendCommand('OFFBOARD')}
            className="cmd-btn py-1 px-2 text-[9px] text-lattice-amber border-lattice-amber"
          >
            EXECUTE INTERCEPT
          </button>
        </div>
      )}
    </div>
  );
}

function Btn({
  label,
  icon,
  disabled,
  onClick,
  className = '',
}: {
  label: string;
  icon?: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`cmd-btn flex items-center justify-center gap-1.5 ${className}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
