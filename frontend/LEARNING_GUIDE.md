# How to Build a Tactical Command & Control UI: A Step-by-Step Learning Guide

This guide breaks down the core concepts, mathematical principles, and technical steps you need to learn to build a defense-grade tactical command-and-control (C2) user interface from scratch.

---

## Roadmap Overview

```
Phase 1: React & TypeScript State Management
    │
Phase 2: Tactical Design Tokens & Tailwind CSS
    │
Phase 3: HTML5 2D Canvas & Spatial Coordinate Math
    │
Phase 4: CSS Hardware-Accelerated HUD Instruments & SVG
    │
Phase 5: Real-Time WebSockets & Protobuf Binary Streams
    │
Phase 6: WASD Keyboard Controls & Touch D-Pad Input
```

---

## Step 1: Master React State & High-Frequency Loops

To build a smooth telemetry UI, you need to update state up to 60 times per second without causing performance bottlenecks:

### Key Topics to Learn:
- **React Hooks**: `useState`, `useRef`, `useCallback`, `useEffect`.
- **`useRef` for Mutable Animation Values**: Use `useRef` (e.g. `activeVelRef`, `originRef`) to hold values that change every frame without triggering full React re-renders.
- **`setInterval` or `requestAnimationFrame`**: Create a continuous 20-60 Hz loop for smooth movement prediction and physics integration.

---

## Step 2: Design Tokens & Utility-First Styling (Tailwind CSS)

Tactical UIs rely on dark obsidian backgrounds, high-contrast indicators, monospaced typography, and HUD borders.

### Key Skills to Learn:
- **Tailwind CSS Configuration (`tailwind.config.js`)**: Extend colors with dark obsidian (`#070707`), dark panel cards (`#0e0e0e`), and brass amber (`#c4a574`).
- **Tactical Grid Background**: Create a grid background overlay using CSS linear gradients:
  ```css
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.015) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.015) 1px, transparent 1px);
  background-size: 48px 48px;
  ```
### Creating Tactical HUD Corner Ticks (`::before` / `::after`)

Instead of cluttering your HTML/JSX with extra div tags, use CSS pseudo-elements `::before` and `::after` on a `position: relative` container to render 8px L-shaped corner brackets automatically:

```css
/* Base Panel Container */
.panel {
  position: relative;
  background-color: #0e0e0e;
  border: 1px solid #2a2a2a;
}

/* Pseudo-element base setup */
.panel-tick::before,
.panel-tick::after {
  content: '';
  position: absolute;
  width: 8px;
  height: 8px;
  pointer-events: none;
  z-index: 10;
}

/* Top-Left L-Bracket */
.panel-tick::before {
  top: -1px;
  left: -1px;
  border-top: 1.5px solid #c4a574;  /* Amber / Gold color */
  border-left: 1.5px solid #c4a574;
}

/* Top-Right L-Bracket */
.panel-tick::after {
  top: -1px;
  right: -1px;
  border-top: 1.5px solid #c4a574;
  border-right: 1.5px solid #c4a574;
}
```

### Usage in JSX:
```tsx
<div className="panel panel-tick p-4">
  {/* Panel Content */}
</div>
```

---

## Step 3: HTML5 2D Canvas & Spatial Coordinate Math

The 2D Tactical Map requires spatial math to transform real-world GPS coordinates into screen pixels.

### Key Concepts to Learn:

1. **WGS84 Geodetic to Planar Meters Conversion**:
   - 1 degree of Latitude $\approx 111,139$ meters.
   - 1 degree of Longitude $\approx 111,139 \times \cos(\text{Latitude in Radians})$ meters.
   ```typescript
   const dLat = (lat - originLat) * 111139;
   const dLon = (lon - originLon) * 111139 * Math.cos((originLat * Math.PI) / 180);
   const screenX = centerX + dLon * pxPerMeter;
   const screenY = centerY - dLat * pxPerMeter; // Screen Y is inverted (+y down)
   ```

2. **Heading & Sensor Cone Rotation**:
   - Convert heading degrees to radians: `rad = (headingDeg * Math.PI) / 180`.
   - Use `ctx.translate(assetX, assetY)` and `ctx.rotate(rad)` to orient the drone chevron and radial gradient sensor FOV cone.

3. **Pan & Zoom Controls**:
   - Store pan `offset` `{ x, y }` updated via `onMouseDown` and `onMouseMove`.
   - Store `zoom` scale factor updated via `onWheel` (`deltaY`).

---

## Step 4: CSS 3D Transforms & SVG Instrument Graphics

### 1. Artificial Horizon Sphere (PFD HUD)
- The sphere sky and ground plane rotate dynamically according to vehicle **Roll** and **Pitch**:
  ```css
  style={{
    transform: `translate(-50%, -50%) rotate(${-rollDeg}deg) translateY(${pitchOffsetPx}px)`
  }}
  ```
- Hardware-accelerated by the GPU for smooth 60 FPS flight attitude changes.

### 2. SVG Compass Rose Ring
- Use SVG elements (`<circle>`, `<line>`, `<text>`) wrapped in a `<g transform="rotate(-heading 60 60)">` group to rotate compass tick marks smoothly.

---

## Step 5: WebSockets & Binary Protocol Buffer (Protobuf) Streaming

Real-time telemetry streams from C++/ROS 2 nodes over WebSockets using binary Protocol Buffers (`@bufbuild/protobuf`).

### Key Concepts to Learn:
- **`nats.ws` / WebSocket Connections**: Subscribe to NATS subjects (e.g. `drone.drone01.telemetry`).
- **Binary Protobuf Encoding & Decoding**:
  - `BinaryReader`: Read tag byte, identify field number and wire type, decode string, double, bool, uint64.
  - `BinaryWriter`: Encode request IDs, command enums, velocity submessages (`vx`, `vy`, `vz`, `yawRate`) into compact Uint8Arrays.

---

## Step 6: WASD Keyboard Controls & Touch D-Pad Input

### Key Input Handling Techniques:
- **Keyboard Event Listener**:
  - Listen to `window.addEventListener('keydown')` and `'keyup'`.
  - Map `KeyW`, `KeyA`, `KeyS`, `KeyD`, `KeyQ`, `KeyE`, `KeyR`, `KeyF`, `Space` to direction vectors.
  - Ignore keypresses when typing in input fields (`e.target instanceof HTMLInputElement`).
- **Touch Pointer Events (`onPointerDown` / `setPointerCapture`)**:
  - Capture pointer IDs on touch/mouse press to ensure continuous holding controls even if the pointer moves outside the button bounds.

---

## Recommended Learning Checklist

1. 🟩 **TypeScript & React**: Learn functional components, hooks, and ref management.
2. 🟩 **Tailwind CSS**: Master custom color tokens, flex/grid layouts, and dark UI styling.
3. 🟩 **HTML5 2D Canvas**: Practice drawing grids, lines, circles, gradients, and handling pan/zoom math.
4. 🟩 **SVG & CSS Transforms**: Learn SVG group rotations and GPU-accelerated CSS transforms.
5. 🟩 **Protocol Buffers & WebSockets**: Practice encoding and decoding binary Protobuf messages in JS/TS.
