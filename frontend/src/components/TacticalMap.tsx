import { useEffect, useRef, useState, useCallback } from 'react';
import { TelemetryData } from '../services/natsService';
import { TargetDetection } from './TargetMeshPanel';
import { Maximize2, Minimize2, RotateCcw, Eye, Layers, Crosshair } from 'lucide-react';

interface TacticalMapProps {
  telemetry: TelemetryData;
  targets: TargetDetection[];
  selectedTargetId: string | null;
  onSelectTarget: (id: string | null) => void;
}

export function TacticalMap({ telemetry, targets, selectedTargetId, onSelectTarget }: TacticalMapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [zoom, setZoom] = useState<number>(1.0); // meters per 100px scaling
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showMesh, setShowMesh] = useState<boolean>(true);
  const [trail, setTrail] = useState<Array<{ lat: number; lon: number }>>([]);

  // Store origin reference point (first telemetry lat/lon)
  const originRef = useRef<{ lat: number; lon: number }>({
    lat: telemetry.latitude !== 0 ? telemetry.latitude : 50.1109,
    lon: telemetry.longitude !== 0 ? telemetry.longitude : 8.6821,
  });

  // Auto-sync origin reference to live asset coordinates when PX4 connects
  useEffect(() => {
    if (telemetry.latitude !== 0 && telemetry.longitude !== 0) {
      if (
        Math.abs(originRef.current.lat - telemetry.latitude) > 0.05 ||
        Math.abs(originRef.current.lon - telemetry.longitude) > 0.05
      ) {
        originRef.current = { lat: telemetry.latitude, lon: telemetry.longitude };
        setOffset({ x: 0, y: 0 });
      }
    }
  }, [telemetry.latitude, telemetry.longitude]);

  // Keep breadcrumb trail updated
  useEffect(() => {
    if (telemetry.latitude === 0 && telemetry.longitude === 0) return;
    setTrail((prev) => {
      const last = prev[prev.length - 1];
      if (last && Math.abs(last.lat - telemetry.latitude) < 0.000001 && Math.abs(last.lon - telemetry.longitude) < 0.000001) {
        return prev;
      }
      return [...prev.slice(-100), { lat: telemetry.latitude, lon: telemetry.longitude }];
    });
  }, [telemetry.latitude, telemetry.longitude]);

  // Recenter map view to current asset location
  const handleRecenter = useCallback(() => {
    if (telemetry.latitude !== 0 && telemetry.longitude !== 0) {
      originRef.current = { lat: telemetry.latitude, lon: telemetry.longitude };
    }
    setOffset({ x: 0, y: 0 });
    setZoom(1.0);
  }, [telemetry.latitude, telemetry.longitude]);

  // Convert WGS84 Lat/Lon to local planar meters offset relative to origin
  const latLonToMeters = useCallback((lat: number, lon: number) => {
    const origin = originRef.current;
    const dLat = (lat - origin.lat) * 111139; // meters per degree latitude
    const dLon = (lon - origin.lon) * 111139 * Math.cos((origin.lat * Math.PI) / 180);
    return { x: dLon, y: -dLat }; // Screen coords: +y is down, so invert dLat
  }, []);

  // Handle canvas mouse dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((prev) => Math.max(0.3, Math.min(5.0, prev * (e.deltaY < 0 ? 1.15 : 0.85))));
  };

  // Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle device pixel ratio for crisp rendering
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const centerX = width / 2 + offset.x;
    const centerY = height / 2 + offset.y;
    const pxPerMeter = 3.0 * zoom;

    // 1. Clear & Background
    ctx.fillStyle = '#070707';
    ctx.fillRect(0, 0, width, height);

    // 2. Render Tactical Grid
    if (showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      const gridSizePx = 50 * zoom;

      const startX = (centerX % gridSizePx) - gridSizePx;
      for (let x = startX; x < width; x += gridSizePx) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      const startY = (centerY % gridSizePx) - gridSizePx;
      for (let y = startY; y < height; y += gridSizePx) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Origin Center Crosshair
      ctx.strokeStyle = 'rgba(196, 165, 116, 0.15)';
      ctx.beginPath();
      ctx.moveTo(centerX - 12, centerY);
      ctx.lineTo(centerX + 12, centerY);
      ctx.moveTo(centerX, centerY - 12);
      ctx.lineTo(centerX, centerY + 12);
      ctx.stroke();
    }

    // 3. Radar Distance Rings (50m, 100m, 200m)
    const assetPos = latLonToMeters(telemetry.latitude, telemetry.longitude);
    const assetX = centerX + assetPos.x * pxPerMeter;
    const assetY = centerY + assetPos.y * pxPerMeter;

    [50, 100, 200].forEach((radiusMeters) => {
      const rPx = radiusMeters * pxPerMeter;
      ctx.strokeStyle = 'rgba(196, 165, 116, 0.12)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(assetX, assetY, rPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(122, 118, 108, 0.5)';
      ctx.font = '9px IBM Plex Mono';
      ctx.fillText(`${radiusMeters}m`, assetX + 4, assetY - rPx + 10);
    });

    // 4. Breadcrumb Trail
    if (trail.length > 1) {
      ctx.strokeStyle = 'rgba(196, 165, 116, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();

      trail.forEach((pt, idx) => {
        const m = latLonToMeters(pt.lat, pt.lon);
        const scrX = centerX + m.x * pxPerMeter;
        const scrY = centerY + m.y * pxPerMeter;
        if (idx === 0) ctx.moveTo(scrX, scrY);
        else ctx.lineTo(scrX, scrY);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 5. Render Target Mesh Detections
    if (showMesh) {
      targets.forEach((tgt) => {
        const m = latLonToMeters(tgt.lat, tgt.lon);
        const tgtX = centerX + m.x * pxPerMeter;
        const tgtY = centerY + m.y * pxPerMeter;

        const isSelected = tgt.id === selectedTargetId;

        // Bearing line from Drone to Target
        ctx.strokeStyle = isSelected ? 'rgba(196, 165, 116, 0.6)' : 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = isSelected ? 1.5 : 1;
        ctx.setLineDash(isSelected ? [] : [2, 4]);
        ctx.beginPath();
        ctx.moveTo(assetX, assetY);
        ctx.lineTo(tgtX, tgtY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Target Symbol
        const color =
          tgt.threatLevel === 'HIGH' ? '#b85c4a' : tgt.threatLevel === 'MEDIUM' ? '#c4a574' : '#7d9a6a';

        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = isSelected ? 2 : 1;

        if (tgt.type === 'AIRCRAFT') {
          // Diamond symbol
          ctx.beginPath();
          ctx.moveTo(tgtX, tgtY - 7);
          ctx.lineTo(tgtX + 7, tgtY);
          ctx.lineTo(tgtX, tgtY + 7);
          ctx.lineTo(tgtX - 7, tgtY);
          ctx.closePath();
          ctx.stroke();
        } else {
          // Square symbol
          ctx.strokeRect(tgtX - 6, tgtY - 6, 12, 12);
        }

        if (isSelected) {
          ctx.strokeStyle = '#c4a574';
          ctx.beginPath();
          ctx.arc(tgtX, tgtY, 12, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Label
        ctx.fillStyle = '#e8e4d9';
        ctx.font = '10px IBM Plex Mono';
        ctx.fillText(tgt.id, tgtX + 10, tgtY - 2);
        ctx.fillStyle = '#7a766c';
        ctx.font = '9px IBM Plex Mono';
        ctx.fillText(`${tgt.distanceM.toFixed(0)}m · ${(tgt.confidence * 100).toFixed(0)}%`, tgtX + 10, tgtY + 8);
      });
    }

    // 6. Render Drone Asset Marker & Sensor Cone
    const headingRad = (telemetry.headingDeg * Math.PI) / 180;

    // Sensor Field of View Cone
    ctx.save();
    ctx.translate(assetX, assetY);
    ctx.rotate(headingRad);

    const fovGradient = ctx.createRadialGradient(0, 0, 5, 0, 0, 110 * pxPerMeter);
    fovGradient.addColorStop(0, 'rgba(196, 165, 116, 0.22)');
    fovGradient.addColorStop(1, 'rgba(196, 165, 116, 0.0)');

    ctx.fillStyle = fovGradient;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 110 * pxPerMeter, -Math.PI / 6 - Math.PI / 2, Math.PI / 6 - Math.PI / 2);
    ctx.closePath();
    ctx.fill();

    // Aircraft Icon Chevron
    ctx.strokeStyle = '#c4a574';
    ctx.fillStyle = '#141414';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(8, 10);
    ctx.lineTo(0, 5);
    ctx.lineTo(-8, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // Asset Callout Tag
    ctx.fillStyle = '#c4a574';
    ctx.font = '10px IBM Plex Mono';
    ctx.fillText(`${telemetry.droneId.toUpperCase()}`, assetX + 14, assetY - 4);
    ctx.fillStyle = '#e8e4d9';
    ctx.font = '9px IBM Plex Mono';
    ctx.fillText(`ALT: ${telemetry.altitudeM.toFixed(1)}m`, assetX + 14, assetY + 8);
  }, [telemetry, targets, selectedTargetId, zoom, offset, showGrid, showMesh, trail, latLonToMeters]);

  return (
    <div
      ref={containerRef}
      className="panel panel-tick panel-tick-bottom relative flex h-full min-h-[380px] w-full flex-col overflow-hidden bg-[#070707]"
    >
      {/* Canvas Layer */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className="h-full w-full cursor-grab active:cursor-grabbing"
      />

      {/* Top Map Bar */}
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
        <span className="label bg-[#070707]/90 px-2 py-1 border border-lattice-line">
          TACTICAL GRID 2D
        </span>
        <span className="font-mono text-[10px] text-lattice-amber bg-[#070707]/90 px-2 py-1 border border-lattice-line">
          ZOOM {(1 / zoom).toFixed(1)}x
        </span>
      </div>

      {/* Map Interactive Controls */}
      <div className="absolute right-3 top-3 flex flex-col gap-1.5 bg-[#0e0e0e]/90 border border-lattice-line p-1">
        <button
          type="button"
          onClick={() => setZoom((prev) => Math.min(5.0, prev * 1.2))}
          title="Zoom In"
          className="cmd-btn p-1.5 text-center flex items-center justify-center"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setZoom((prev) => Math.max(0.3, prev * 0.8))}
          title="Zoom Out"
          className="cmd-btn p-1.5 text-center flex items-center justify-center"
        >
          <Minimize2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleRecenter}
          title="Center Asset"
          className="cmd-btn p-1.5 text-center flex items-center justify-center"
        >
          <Crosshair className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setShowGrid((prev) => !prev)}
          title="Toggle Grid Lines"
          className={`cmd-btn p-1.5 flex items-center justify-center ${showGrid ? 'cmd-btn-active' : ''}`}
        >
          <Layers className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setShowMesh((prev) => !prev)}
          title="Toggle Target Detections"
          className={`cmd-btn p-1.5 flex items-center justify-center ${showMesh ? 'cmd-btn-active' : ''}`}
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Bottom Map Status Readouts */}
      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-4 bg-[#0e0e0e]/90 px-3 py-1.5 border border-lattice-line font-mono text-[10px] text-lattice-mute">
        <span>ORIGIN: {originRef.current.lat.toFixed(5)}°N, {originRef.current.lon.toFixed(5)}°E</span>
        <span>NET MESH: {targets.length} TRACKS</span>
      </div>
    </div>
  );
}
