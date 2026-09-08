# PX4 Drone Control Platform

A modular, strongly-typed, real-time drone control platform built on top of **PX4 Autopilot**, **ROS 2 (C++)**, **NATS messaging**, **Protocol Buffers v3**, and **React + TypeScript**.

```text
                       drone-protobuf
                       (Git Submodule)
                             │
                ┌────────────┼────────────┐
                │            │            │
                ▼            ▼            ▼
             frontend    services     ROS 2 Node
         (Git Submodule)(Git Submodule)(packages/px4_nats_bridge)
                │            │            │
                │            │            │
                └────────────┼────────────┘
                             │
                             ▼
                         NATS Server (services/nats)
                             │
               Protobuf Over NATS (TCP 4222 / WS 9222)
                             │
                             ▼
                        ROS 2 C++ (px4_nats_bridge)
                             │
                          px4_msgs
                             │
                             ▼
                        PX4 Autopilot (SITL / Hardware)
```

---

## 1. Architecture Overview

- **Zero REST / Zero gRPC / Zero RPC**: All command and telemetry communication flows strictly over NATS pub/sub using binary Protocol Buffers payloads.
- **Git Submodules**: Independent modular repositories (`protobuf/`, `services/`, `frontend/`) orchestrated by the main `drone-sim` root repository.
- **Single Source of Truth**: Protobuf definitions in `protobuf/` serve as the sole source of truth for message schemas in both TypeScript and C++.
- **State-Aware Operator UX**: UI control buttons (ARM, DISARM, TAKEOFF, LAND, RTL, HOLD, OFFBOARD) dynamically enable/disable based on live vehicle state transitions.
- **3-Layer Flight Safety**:
  1. Frontend UX state machine validation
  2. ROS 2 C++ Bridge parameter & bounds validator
  3. Authoritative PX4 onboard safety failsafes

---

## 2. Repository Structure

```text
drone-sim/
│
├── .gitmodules
├── docker-compose.yml
├── .env.example
├── README.md
├── start_backend.sh
│
├── protobuf/                 ← Git submodule (drone-protobuf)
│   ├── proto/drone/v1/
│   │   ├── common.proto
│   │   ├── command.proto
│   │   ├── telemetry.proto
│   │   └── state.proto
│   ├── generated/
│   │   ├── cpp/
│   │   └── typescript/
│   ├── buf.yaml
│   └── buf.gen.yaml
│
├── services/                 ← Git submodule (drone-services)
│   └── nats/
│       ├── nats.conf
│       └── Dockerfile
│
├── frontend/                 ← Git submodule (drone-frontend)
│   ├── src/
│   │   ├── components/
│   │   │   ├── DroneSelector.tsx
│   │   │   ├── TelemetryDisplay.tsx
│   │   │   ├── ControlPanel.tsx
│   │   │   └── CommandLog.tsx
│   │   ├── services/natsService.ts
│   │   └── App.tsx
│   ├── package.json
│   └── Dockerfile
│
└── packages/
    └── px4_nats_bridge/      ← ROS 2 C++ Bridge Node
        ├── CMakeLists.txt
        ├── package.xml
        ├── include/px4_nats_bridge/
        └── src/
```

---

## 3. How to Build & Run Everything

### Step 1: Submodule Initialization

Fetch and sync all Git submodules (`protobuf/`, `services/`, `frontend/`):

```bash
git submodule update --init --recursive
```

---

### Step 2: Protobuf Contract Code Generation

Re-generate Protobuf C++ headers and TypeScript artifacts (if proto definitions are updated):

```bash
# Using protoc
protoc --proto_path=protobuf/proto --cpp_out=protobuf/generated/cpp protobuf/proto/drone/v1/*.proto

# Or using Buf
cd protobuf
npx @bufbuild/buf generate
```

---

### Step 3: Run Full System via Docker Compose (Recommended)

Launch NATS messaging broker, the React Operator Dashboard, and the PX4/ROS 2 development container in the background:

```bash
docker compose up --build -d
```

Check running containers:
```bash
docker compose ps
```

View live container logs:
```bash
docker compose logs -f
```

Then start PX4 SITL, the Micro XRCE-DDS Agent, and the NATS bridge in the prepared tmux session:

```bash
./start_backend.sh
```

The bridge window builds and runs `px4_nats_bridge_node`; it publishes binary Protobuf telemetry and command results to NATS while accepting binary Protobuf commands from the dashboard.

---

### Step 4: Access Ports & Web Interfaces

- **React Operator Dashboard**: [http://localhost:3000](http://localhost:3000)
- **NATS WebSockets (Frontend Transport)**: `ws://localhost:9222`
- **NATS TCP Client Port (ROS 2 Bridge)**: `localhost:4222`
- **NATS HTTP Monitoring Dashboard**: [http://localhost:8222](http://localhost:8222)
- **PX4 Kasm/VNC Virtual Desktop**: [https://localhost:8443](https://localhost:8443)

---

### Step 5: Manual Local Development (Optional)

#### A. Run Frontend UI Locally
```bash
cd frontend
npm install
npm run dev
# Dashboard opens on http://localhost:3000
```

#### B. Build & Run ROS 2 C++ Bridge Locally
Inside a ROS 2 Humble/Iron environment with `px4_msgs` sourced:

```bash
# Build the bridge package
colcon build --packages-select px4_nats_bridge
source install/setup.bash

# Run the bridge node
ros2 run px4_nats_bridge px4_nats_bridge_node --ros-args -p nats_host:=localhost -p drone_id:=drone01
```

#### C. Run PX4 SITL Simulator & Micro XRCE-DDS Agent
Inside the `px4-ros2` container or PX4 development host:

```bash
# Terminal 1: Start Micro XRCE-DDS Agent
MicroXRCEAgent udp4 -p 8888

# Terminal 2: Start PX4 Gazebo SITL
cd ~/Tools/PX4-Autopilot && make px4_sitl gz_x500
```

Alternatively, use the convenience launcher:
```bash
./start_backend.sh
```

---

## 4. Subject Hierarchy & NATS Topics

| Channel / Topic | Direction | Payload Schema | Description |
|---|---|---|---|
| `drone.<drone_id>.command` | React → ROS 2 | `DroneCommand` (Protobuf) | Dispatches ARM, DISARM, TAKEOFF, LAND, RTL, HOLD, OFFBOARD commands |
| `drone.<drone_id>.command.result` | ROS 2 → React | `CommandResult` (Protobuf) | Correlated command execution status (`RECEIVED` → `ACCEPTED` → `EXECUTED` / `FAILED` / `REJECTED`) |
| `drone.<drone_id>.telemetry` | ROS 2 → React | `DroneTelemetry` (Protobuf) | Live 10 Hz vehicle telemetry stream (Position, Altitude, Battery, Mode, GPS, Heading) |

---

## 5. Security & Access Control

NATS permissions are configured in [`services/nats/nats.conf`](file:///Users/ayssar.mb/Desktop/dev/projects/drone-sim/services/nats/nats.conf):

- **Operator User** (`user: operator`): Allowed to publish `drone.*.command` and subscribe to `drone.*.telemetry`, `drone.*.command.result`, `drone.*.event`, `drone.*.status`.
- **Bridge User** (`user: bridge`): Allowed to subscribe to `drone.*.command` and publish `drone.*.telemetry`, `drone.*.command.result`, `drone.*.event`, `drone.*.status`.
