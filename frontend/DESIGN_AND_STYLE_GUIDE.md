# Anduril Lattice UI Design & Style Guide

This document explains the design inspiration, aesthetic style tokens, and layout structure of the **Anduril Lattice Operating System Interface** built for the drone simulator frontend.

---

## 1. Design Inspiration & Aesthetic Origin

The UI design is inspired directly by **Anduril Industries' Lattice OS** — an AI-powered command and control (C2) operating system built for autonomous vehicle swarms, counter-UAS systems, and tactical telemetry.

### Visual Design Tokens:

1. **Obsidian Palette & Grid Texture (`#070707` Base)**:
   - Deep dark matte background styled with a subtle `48px x 48px` tactical grid line overlay.

2. **Brass / Gold Tactical Amber (`#c4a574`)**:
   - The signature accent color used for crosshairs, active buttons, HUD reticles, and key data highlights.

3. **Corner Bracket Ticks (`.panel-tick` and `.panel-tick-bottom`)**:
   - Panels feature 1.5px brass corner brackets that frame panels like military head-up displays (HUDs).

4. **Monospaced High-Density Data (`IBM Plex Mono`)**:
   - All telemetry values and labels use uppercase monospaced text with wide letter tracking (`tracking-[0.22em]`), giving operators clear, rapid readability without visual clutter.

---

## 2. Overall UI Layout Diagram

```
+-----------------------------------------------------------------------------------+
|  LATTICE OS | ASSET: DRONE-01 | VIEW: [SPLIT | MAP | PFD] | LINK: 10Hz | ARMED | UTC  |
+------------------------------------+----------------------------------------------+
|  COMMANDS          | TARGET MESH   | 2D TACTICAL MAP CANVAS                       |
|  - ARM / DISARM    | - TRK-4091    | - WGS84 Reference Grid                       |
|  - TAKEOFF 10m     | - TRK-4092    | - Drone Position & Sensor FOV Cone           |
|  - LAND / RTL      | - TRK-4093    | - Radar Distance Rings (50m, 100m, 200m)     |
|                    |               +----------------------------------------------+
|                    |               | PRIMARY FLIGHT DISPLAY (PFD HUD)             |
|                    |               | - Artificial Horizon Sphere (Sky/Ground)     |
|                    |               | - Compass Rose & Altitude Tape               |
+------------------------------------+----------------------------------------------+
| VECTOR FLIGHT CONTROLLER (WASD / D-PAD) | CRUISE SPEED & ALTITUDE SLIDERS         |
+-----------------------------------------------------------------------------------+
| TERMINAL LOG: [19:50:00] Dispatched ARM | WGS84 LAT: 47.3979° LON: 8.5461° ALT: 0.2m   |
+-----------------------------------------------------------------------------------+
```

---

## 3. UI Component Breakdown

### 1. Header Bar (`HeaderBar.tsx`)
- **Asset Switcher**: Toggle between `DRONE-01 (ACTIVE)` and `DRONE-02 (STANDBY)`.
- **View Mode Switcher**:
  - `SPLIT C2` (Default operational layout)
  - `TACTICAL MAP` (Expanded 2D grid view)
  - `PFD HUD` (Primary flight instruments view)
- **System Badges**: Connection status, Safety Arm state, Battery %, Satellites count, and live UTC clock.

### 2. Tactical 2D Grid Map (`TacticalMap.tsx`)
- **HTML5 Canvas Renderer**:
  - Renders live asset position chevrons and sensor field-of-view (FOV) cones.
  - Draws breadcrumb flight trails.
  - Displays concentric radar distance rings (50m, 100m, 200m).
  - Plots AI target mesh contacts with threat level colors (`HIGH`, `MEDIUM`, `LOW`).
  - Interactive map tools: Zoom in/out, Recenter asset, Toggle Grid, Toggle Target Mesh.

### 3. Primary Flight Display HUD (`FlightInstruments.tsx`)
- **Artificial Horizon Sphere**: Rotating gradient sphere (Sky/Ground) with roll index and pitch ladder lines (+/- 10°, +/- 20°).
- **Compass Rose**: Rotating 360° heading ring.
- **Altitude Tape**: Vertical tape showing barometric altitude AMSL.
- **Attitude Metrics Grid**: Live Roll, Pitch, Yaw, Heading, Altitude, and Satellite Fix.

### 4. Sensor Target Mesh (`TargetMeshPanel.tsx`)
- Active threat contacts detected by the sensor mesh.
- Displays contact classification (`VEHICLE`, `AIRCRAFT`, `SENSOR`), threat level, confidence %, distance, bearing, and track lock actions (**INTERCEPT** or **TRACK ORBIT**).

### 5. Vehicle Commands (`CommandPanel.tsx`)
- **Two-Step Safety Arming**: Confirms propulsion activation to prevent accidental motor spin-up.
- **Flight Actions**: `TAKEOFF`, `LAND`, `RTL`, `HOLD`, `OFFBOARD`.

### 6. Vector Flight Controller (`VectorControl.tsx`)
- **Directional D-Pad & Keyboard Controls**:
  - `W` / `S`: Pitch forward / backward
  - `A` / `D`: Roll left / right
  - `Q` / `E`: Rotate yaw left / right
  - `R` / `F`: Climb / descend altitude
  - `Space`: Hover / stop
- **Sliders & Presets**: Adjust cruise speed (1 to 15 m/s) and target altitude (2 to 50 m).

---

## 4. Rendering Architecture: DOM Tree vs. Canvas

The application uses a **Hybrid Rendering Strategy** combining React DOM components with HTML5 2D Canvas graphics:

```
+-----------------------------------------------------------------------------------+
|                            REACT DOM TREE (HTML5 / Tailwind)                      |
|                                                                                   |
|  +------------------+  +-------------------+  +--------------------------------+  |
|  | HeaderBar        |  | CommandPanel      |  | VectorControl                  |  |
|  | (React / HTML)   |  | (Buttons / Modals)|  | (React / Range Inputs / WASD)  |  |
|  +------------------+  +-------------------+  +--------------------------------+  |
|  | TargetMeshPanel  |  | StatusBar         |  | FlightInstruments (PFD)        |  |
|  | (React List)     |  | (Terminal Logs)   |  | (CSS Rotations & SVG Rose)     |  |
|  +------------------+  +-------------------+  +--------------------------------+  |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |                       HTML5 2D CANVAS API (TacticalMap)                      |  |
|  |  - WGS84 Grid Lines   - Vehicle FOV Sensor Cone   - Breadcrumb Trail         |  |
|  |  - Radar Distance Rings (50m, 100m, 200m)       - Target Mesh Contacts Node   |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

### 1. HTML5 DOM Tree (React Components)
Used for user controls, buttons, text readouts, and UI cards:
- **HeaderBar**, **CommandPanel**, **VectorControl**, **TargetMeshPanel**, **StatusBar**: Built entirely with React JSX, HTML5 elements (`<button>`, `<select>`, `<input type="range">`), and Tailwind CSS layout utilities (`flex`, `grid`).
- **Primary Flight Display (PFD HUD)**:
  - **Artificial Horizon Sphere**: Built with **DOM elements + CSS Transforms**. The sky and ground gradients rotate smoothly using CSS `transform: rotate(${-roll}deg) translateY(${pitchOffset}px)`.
  - **Compass Rose**: Built with **SVG Graphics** (`<svg>`, `<g transform="rotate(...)">`, `<line>`), giving crisp vector scaling at any screen resolution.

### 2. HTML5 2D Canvas API (`TacticalMap.tsx`)
Used for spatial, high-performance 2D map graphics:
- Built using **HTML5 2D Canvas API** (`<canvas>` element with `canvas.getContext('2d')`).
- Draws WGS84 grid lines, drone position chevron, heading FOV radial gradient cone, breadcrumb trails, radar distance rings, and threat contact nodes at 60 FPS.
- Provides smooth mouse dragging (pan) and wheel scrolling (zoom) using vector planar transformation math.

---

## 5. Summary Table

| UI Module | Rendering Tech | Rationale |
| :--- | :--- | :--- |
| **Tactical Grid Map** | HTML5 2D Canvas API | High performance 60 FPS drawing for grid lines, trail points, radar rings & FOV cone. |
| **Primary Flight Display** | CSS Transforms + SVG | Hardware-accelerated CSS rotation for artificial horizon + crisp SVG compass vector graphics. |
| **Commands & Vectors** | React DOM + Tailwind | Accessible buttons, WASD key listeners, range sliders, and active press states. |
| **Target Mesh List** | React DOM | Responsive scrollable track list with threat badges and target lock action triggers. |
| **Header & Terminal** | React DOM | Sharp monospaced text, live clock, status badges, and expandable audit log terminal. |

