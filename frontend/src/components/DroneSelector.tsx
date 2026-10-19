import React from 'react';
import { Badge } from './ui/Badge';
import { Cpu, Radio } from 'lucide-react';

interface DroneSelectorProps {
  droneId: string;
  isConnected: boolean;
  armed: boolean;
  flightMode: string;
}

export const DroneSelector: React.FC<DroneSelectorProps> = ({
  droneId,
  isConnected,
  armed,
  flightMode,
}) => {
  return (
    <div className="w-full max-w-5xl mx-auto flex items-center justify-between glass-panel px-6 py-4 rounded-3xl border border-white/10 shadow-xl mb-4 font-mono">
      <div className="flex items-center space-x-3">
        <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-2xl border border-cyan-500/20">
          <Cpu className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-wider text-white uppercase">
            PX4 DRONE COCKPIT
          </h1>
          <p className="text-[11px] text-slate-400">
            NATS PROTOBUF BUS
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <Badge variant={armed ? 'success' : 'warning'}>
          {armed ? 'ARMED' : 'DISARMED'} [{flightMode}]
        </Badge>

        <Badge variant={isConnected ? 'success' : 'destructive'}>
          <Radio className={`w-3.5 h-3.5 ${isConnected ? 'animate-pulse' : ''}`} />
          <span>{isConnected ? 'CONNECTED' : 'DISCONNECTED'}</span>
        </Badge>
      </div>
    </div>
  );
};
