import { useCallback, useEffect, useRef, useState } from 'react';
import { CommandPanel } from './components/CommandPanel';
import { FlightInstruments } from './components/FlightInstruments';
import { HeaderBar } from './components/HeaderBar';
import { StatusBar } from './components/StatusBar';
import { VectorControl } from './components/VectorControl';
import { TacticalMap } from './components/TacticalMap';
import { TargetMeshPanel, TargetDetection } from './components/TargetMeshPanel';
import { CommandResultData, CommandType, natsService, TelemetryData } from './services/natsService';

const initialTelemetry: TelemetryData = {
  droneId: 'drone01',
  timestampMs: Date.now(),
  connected: false,
  armed: false,
  flightMode: 'DISARMED',
  latitude: 50.1109,
  longitude: 8.6821,
  altitudeM: 0,
  roll: 0,
  pitch: 0,
  yaw: 0,
  batteryPercentage: 98,
  gpsAvailable: true,
  satellitesVisible: 14,
  headingDeg: 45,
};

// Default simulated target detections in the mesh network
const initialTargets: TargetDetection[] = [
  {
    id: 'TRK-4091',
    type: 'VEHICLE',
    lat: 50.1118,
    lon: 8.6835,
    distanceM: 145,
    bearingDeg: 35,
    threatLevel: 'HIGH',
    confidence: 0.94,
    speedMs: 8.5,
  },
  {
    id: 'TRK-4092',
    type: 'AIRCRAFT',
    lat: 50.1125,
    lon: 8.6805,
    distanceM: 210,
    bearingDeg: 310,
    threatLevel: 'MEDIUM',
    confidence: 0.88,
    speedMs: 18.0,
  },
  {
    id: 'TRK-4093',
    type: 'SENSOR',
    lat: 50.1095,
    lon: 8.6842,
    distanceM: 180,
    bearingDeg: 140,
    threatLevel: 'LOW',
    confidence: 0.99,
  },
];

export default function App() {
  const [droneId, setDroneId] = useState<string>('drone01');
  const [viewMode, setViewMode] = useState<'SPLIT' | 'MAP' | 'PFD'>('SPLIT');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [telemetry, setTelemetry] = useState<TelemetryData>({ ...initialTelemetry, droneId });
  const [logs, setLogs] = useState<CommandResultData[]>([]);
  const [speedMs, setSpeedMs] = useState<number>(3.0);
  const [targetHeightM, setTargetHeightM] = useState<number>(10.0);
  const [targets, setTargets] = useState<TargetDetection[]>(initialTargets);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  const commandTimeoutRef = useRef<number | null>(null);

  // Dynamically position sensor mesh targets relative to active drone telemetry
  useEffect(() => {
    if (telemetry.latitude !== 0 && telemetry.longitude !== 0) {
      const lat = telemetry.latitude;
      const lon = telemetry.longitude;
      setTargets([
        {
          id: 'TRK-4091',
          type: 'VEHICLE',
          lat: lat + 0.001,
          lon: lon + 0.0008,
          distanceM: 145,
          bearingDeg: 35,
          threatLevel: 'HIGH',
          confidence: 0.94,
          speedMs: 8.5,
        },
        {
          id: 'TRK-4092',
          type: 'AIRCRAFT',
          lat: lat + 0.0014,
          lon: lon - 0.0012,
          distanceM: 210,
          bearingDeg: 310,
          threatLevel: 'MEDIUM',
          confidence: 0.88,
          speedMs: 18.0,
        },
        {
          id: 'TRK-4093',
          type: 'SENSOR',
          lat: lat - 0.0011,
          lon: lon + 0.0015,
          distanceM: 180,
          bearingDeg: 140,
          threatLevel: 'LOW',
          confidence: 0.99,
        },
      ]);
    }
  }, [telemetry.latitude, telemetry.longitude]);

  // Initialize NATS connection and subscriptions
  useEffect(() => {
    let mounted = true;

    async function initNats() {
      const ok = await natsService.connect();
      if (!mounted) return;
      setIsConnected(ok);
      if (!ok) return;

      const unsubscribeTelemetry = natsService.subscribeTelemetry(droneId, (data) => {
        if (mounted) {
          setTelemetry(data);
        }
      });
      const unsubscribeResults = natsService.subscribeCommandResult(droneId, (res) => {
        if (!mounted) return;
        setLogs((prev) => [res, ...prev.slice(0, 19)]);
        if (res.status === 'EXECUTED' || res.status === 'FAILED' || res.status === 'REJECTED') {
          if (commandTimeoutRef.current !== null) window.clearTimeout(commandTimeoutRef.current);
          commandTimeoutRef.current = null;
          setIsSending(false);
        }
      });

      return () => {
        unsubscribeTelemetry();
        unsubscribeResults();
      };
    }

    let unsubscribe: (() => void) | undefined;
    initNats().then((cleanup) => {
      unsubscribe = cleanup;
    });
    return () => {
      mounted = false;
      unsubscribe?.();
      if (commandTimeoutRef.current !== null) window.clearTimeout(commandTimeoutRef.current);
      natsService.disconnect();
    };
  }, [droneId]);

  const pushLog = (requestId: string, message: string) => {
    setLogs((prev) => [
      {
        requestId,
        droneId,
        status: 'RECEIVED',
        message,
        timestampMs: Date.now(),
      },
      ...prev.slice(0, 19),
    ]);
  };

  const handleSendCommand = async (commandType: CommandType, takeoffAltitude?: number) => {
    if (!natsService.isConnected()) {
      pushLog('req_offline_' + Date.now(), `Cannot dispatch ${commandType}: NATS link is offline`);
      return;
    }
    setIsSending(true);

    try {
      const reqId = await natsService.sendCommand(droneId, commandType, takeoffAltitude ?? targetHeightM);
      pushLog(reqId, `Sent ${commandType}; awaiting ROS 2 bridge`);
      commandTimeoutRef.current = window.setTimeout(() => {
        setIsSending(false);
        pushLog(reqId, `${commandType} result timed out; check ROS 2 bridge link`);
      }, 5000);
    } catch (err) {
      pushLog('req_error_' + Date.now(), `Failed to dispatch ${commandType}`);
      setIsSending(false);
    }
  };

  const handleSendVelocity = useCallback(
    async (vx: number, vy: number, vz: number, yawRate: number) => {
      try {
        await natsService.sendCommand(droneId, 'SET_VELOCITY', 10, { vx, vy, vz, yawRate });
      } catch {
        // The pad remains disabled unless ROS telemetry reports an offboard vehicle.
      }
    },
    [droneId]
  );

  const handleTargetAction = (action: 'INTERCEPT' | 'TRACK' | 'RECON', targetId: string) => {
    pushLog('cmd_tgt_' + Date.now(), `Initiated ${action} on contact ${targetId}`);
    if (action === 'INTERCEPT') {
      handleSendCommand('OFFBOARD');
    }
  };

  const canControlVector = isConnected && telemetry.connected && telemetry.armed && telemetry.flightMode === 'OFFBOARD';

  return (
    <div className="flex h-full min-h-screen flex-col bg-[#070707] text-[#e8e4d9]">
      {/* Top Lattice OS Navigation Header */}
      <HeaderBar
        droneId={droneId}
        onSelectDrone={setDroneId}
        isConnected={isConnected}
        telemetry={telemetry}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {/* Main Content Area */}
      <main className="flex-1 p-3 overflow-y-auto">
        {viewMode === 'SPLIT' && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)_300px] h-full">
            {/* Left Column: Commands & Target Mesh */}
            <div className="flex flex-col gap-3">
              <CommandPanel
                telemetry={telemetry}
                onSendCommand={handleSendCommand}
                isSending={isSending}
                takeoffAltM={targetHeightM}
                selectedTargetId={selectedTargetId}
              />
              <TargetMeshPanel
                targets={targets}
                selectedTargetId={selectedTargetId}
                onSelectTarget={setSelectedTargetId}
                onTargetAction={handleTargetAction}
              />
            </div>

            {/* Center Column: Tactical Map & Primary Flight Display */}
            <div className="flex flex-col gap-3">
              <div className="h-[360px] sm:h-[400px]">
                <TacticalMap
                  telemetry={telemetry}
                  targets={targets}
                  selectedTargetId={selectedTargetId}
                  onSelectTarget={setSelectedTargetId}
                />
              </div>
              <FlightInstruments telemetry={telemetry} />
            </div>

            {/* Right Column: Direct Vector Controls */}
            <div className="flex flex-col gap-3">
              <VectorControl
                onSendVelocity={handleSendVelocity}
                canControl={canControlVector}
                speedMs={speedMs}
                onSpeedChange={setSpeedMs}
                targetHeightM={targetHeightM}
                onHeightChange={setTargetHeightM}
                onGotoAltitude={() => handleSendCommand('TAKEOFF', targetHeightM)}
              />
            </div>
          </div>
        )}

        {viewMode === 'MAP' && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px] h-[calc(100vh-100px)]">
            <div className="h-full">
              <TacticalMap
                telemetry={telemetry}
                targets={targets}
                selectedTargetId={selectedTargetId}
                onSelectTarget={setSelectedTargetId}
              />
            </div>
            <div className="flex flex-col gap-3 overflow-y-auto">
              <CommandPanel
                telemetry={telemetry}
                onSendCommand={handleSendCommand}
                isSending={isSending}
                takeoffAltM={targetHeightM}
                selectedTargetId={selectedTargetId}
              />
              <TargetMeshPanel
                targets={targets}
                selectedTargetId={selectedTargetId}
                onSelectTarget={setSelectedTargetId}
                onTargetAction={handleTargetAction}
              />
              <VectorControl
                onSendVelocity={handleSendVelocity}
                canControl={canControlVector}
                speedMs={speedMs}
                onSpeedChange={setSpeedMs}
                targetHeightM={targetHeightM}
                onHeightChange={setTargetHeightM}
                onGotoAltitude={() => handleSendCommand('TAKEOFF', targetHeightM)}
              />
            </div>
          </div>
        )}

        {viewMode === 'PFD' && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px] h-[calc(100vh-100px)]">
            <div className="h-full">
              <FlightInstruments telemetry={telemetry} />
            </div>
            <div className="flex flex-col gap-3 overflow-y-auto">
              <CommandPanel
                telemetry={telemetry}
                onSendCommand={handleSendCommand}
                isSending={isSending}
                takeoffAltM={targetHeightM}
                selectedTargetId={selectedTargetId}
              />
              <VectorControl
                onSendVelocity={handleSendVelocity}
                canControl={canControlVector}
                speedMs={speedMs}
                onSpeedChange={setSpeedMs}
                targetHeightM={targetHeightM}
                onHeightChange={setTargetHeightM}
                onGotoAltitude={() => handleSendCommand('TAKEOFF', targetHeightM)}
              />
            </div>
          </div>
        )}
      </main>

      {/* Bottom Terminal Audit Log & Geodetic Status Footer */}
      <StatusBar logs={logs} telemetry={telemetry} />
    </div>
  );
}
