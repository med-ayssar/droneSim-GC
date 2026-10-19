import { useEffect, useState } from 'react';
import { TelemetryData } from '../services/natsService';
import { ShieldAlert, ShieldCheck, Wifi, WifiOff, Battery, Satellite, LayoutGrid, Map, Gauge } from 'lucide-react';

interface HeaderBarProps {
  droneId: string;
  onSelectDrone: (id: string) => void;
  isConnected: boolean;
  telemetry: TelemetryData;
  viewMode: 'SPLIT' | 'MAP' | 'PFD';
  onViewModeChange: (mode: 'SPLIT' | 'MAP' | 'PFD') => void;
}

export function HeaderBar({
  droneId,
  onSelectDrone,
  isConnected,
  telemetry,
  viewMode,
  onViewModeChange,
}: HeaderBarProps) {
  const [utcTime, setUtcTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toISOString().substring(11, 19) + ' Z');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="flex flex-wrap items-center justify-between border-b border-lattice-line bg-[#070707] px-4 py-2.5 shadow-md">
      {/* Brand & Asset Selection */}
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-2">
          <div className="h-3.5 w-3.5 border-2 border-lattice-amber bg-lattice-amber/20" />
          <span className="font-mono text-xs font-bold tracking-[0.25em] text-lattice-ink">
            LATTICE <span className="text-lattice-amber">OS</span>
          </span>
          <span className="label hidden sm:inline-block">C2 TACTICAL CONSOLE</span>
        </div>

        {/* Asset Selector */}
        <div className="flex items-center gap-1.5 border border-lattice-line bg-[#0e0e0e] px-2 py-1 font-mono text-[11px]">
          <span className="text-lattice-mute">ASSET:</span>
          <select
            value={droneId}
            onChange={(e) => onSelectDrone(e.target.value)}
            className="bg-transparent font-bold text-lattice-amber outline-none cursor-pointer"
          >
            <option value="drone01" className="bg-[#0e0e0e] text-lattice-ink">
              DRONE-01 (ACTIVE)
            </option>
            <option value="drone02" className="bg-[#0e0e0e] text-lattice-ink">
              DRONE-02 (STANDBY)
            </option>
          </select>
        </div>
      </div>

      {/* Center View Mode Switcher */}
      <div className="flex items-center gap-1 font-mono text-[10px] tracking-[0.16em]">
        <button
          type="button"
          onClick={() => onViewModeChange('SPLIT')}
          className={`flex items-center gap-1.5 border px-3 py-1.5 transition-all ${
            viewMode === 'SPLIT'
              ? 'border-lattice-amber bg-lattice-amber/15 text-lattice-amber shadow-lattice-glow font-bold'
              : 'border-lattice-line bg-[#0e0e0e] text-lattice-mute hover:text-lattice-ink'
          }`}
        >
          <LayoutGrid className="h-3.5 w-3.5" /> SPLIT C2
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange('MAP')}
          className={`flex items-center gap-1.5 border px-3 py-1.5 transition-all ${
            viewMode === 'MAP'
              ? 'border-lattice-amber bg-lattice-amber/15 text-lattice-amber shadow-lattice-glow font-bold'
              : 'border-lattice-line bg-[#0e0e0e] text-lattice-mute hover:text-lattice-ink'
          }`}
        >
          <Map className="h-3.5 w-3.5" /> TACTICAL MAP
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange('PFD')}
          className={`flex items-center gap-1.5 border px-3 py-1.5 transition-all ${
            viewMode === 'PFD'
              ? 'border-lattice-amber bg-lattice-amber/15 text-lattice-amber shadow-lattice-glow font-bold'
              : 'border-lattice-line bg-[#0e0e0e] text-lattice-mute hover:text-lattice-ink'
          }`}
        >
          <Gauge className="h-3.5 w-3.5" /> PFD HUD
        </button>
      </div>

      {/* Right System Telemetry Telemetry */}
      <div className="flex items-center gap-5 font-mono text-[11px] uppercase tracking-[0.14em]">
        {/* NATS Link State */}
        <div className="flex items-center gap-1.5">
          {isConnected ? (
            <Wifi className="h-3.5 w-3.5 text-lattice-ok" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-lattice-bad" />
          )}
          <span className={isConnected ? 'text-lattice-ok font-bold' : 'text-lattice-bad font-bold'}>
            {isConnected ? 'LINK 10Hz' : 'OFFLINE'}
          </span>
        </div>

        {/* Arm State */}
        <div className="flex items-center gap-1.5">
          {telemetry.armed ? (
            <ShieldAlert className="h-3.5 w-3.5 text-lattice-bad animate-pulse" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5 text-lattice-amber" />
          )}
          <span
            className={`font-bold px-1.5 py-0.5 text-[10px] border ${
              telemetry.armed
                ? 'border-lattice-bad text-lattice-bad bg-lattice-bad/15 shadow-lattice-red'
                : 'border-lattice-amber text-lattice-amber bg-lattice-amber/10'
            }`}
          >
            {telemetry.armed ? 'ARMED' : 'SAFE'}
          </span>
        </div>

        {/* Mode */}
        <div className="hidden lg:flex items-center gap-1.5">
          <span className="text-lattice-mute">MODE:</span>
          <span className="text-lattice-ink font-bold">{telemetry.flightMode}</span>
        </div>

        {/* Battery */}
        <div className="flex items-center gap-1.5">
          <Battery className="h-3.5 w-3.5 text-lattice-mute" />
          <span className={telemetry.batteryPercentage < 20 ? 'text-lattice-bad font-bold' : 'text-lattice-ink'}>
            {telemetry.batteryPercentage.toFixed(0)}%
          </span>
        </div>

        {/* Satellites */}
        <div className="hidden md:flex items-center gap-1.5">
          <Satellite className="h-3.5 w-3.5 text-lattice-mute" />
          <span className="text-lattice-ink">{telemetry.satellitesVisible} SATS</span>
        </div>

        {/* UTC Clock */}
        <div className="hidden sm:block text-lattice-amber font-bold border-l border-lattice-line pl-4">
          {utcTime}
        </div>
      </div>
    </header>
  );
}
