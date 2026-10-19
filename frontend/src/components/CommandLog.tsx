import React from 'react';
import { CommandResultData } from '../services/natsService';
import { Terminal, CheckCircle2, Clock, AlertTriangle, XCircle } from 'lucide-react';

interface CommandLogProps {
  logs: CommandResultData[];
}

export const CommandLog: React.FC<CommandLogProps> = ({ logs }) => {
  const latestLog = logs[0];

  return (
    <div className="w-full max-w-5xl mx-auto glass-panel px-5 py-3 rounded-2xl border border-white/10 text-xs font-mono flex items-center justify-between text-slate-300">
      <div className="flex items-center space-x-3 truncate">
        <Terminal className="w-4 h-4 text-cyan-400 flex-shrink-0" />
        {latestLog ? (
          <span className="truncate">
            <strong className="text-cyan-400">[{new Date(latestLog.timestampMs).toLocaleTimeString()}]</strong>{' '}
            <span className="text-slate-200">{latestLog.requestId}:</span> {latestLog.message}
          </span>
        ) : (
          <span className="text-slate-500">System Ready — Listening for drone telemetry & commands</span>
        )}
      </div>

      {latestLog && (
        <span
          className={`font-bold px-2 py-0.5 rounded text-[11px] uppercase flex-shrink-0 ${
            latestLog.status === 'EXECUTED'
              ? 'bg-emerald-500/20 text-emerald-400'
              : latestLog.status === 'FAILED' || latestLog.status === 'REJECTED'
              ? 'bg-rose-500/20 text-rose-400'
              : 'bg-cyan-500/20 text-cyan-400'
          }`}
        >
          {latestLog.status}
        </span>
      )}
    </div>
  );
};
