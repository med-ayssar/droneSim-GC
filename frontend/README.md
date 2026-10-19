# Frontend Submodule — PX4 Operator Dashboard

React + TypeScript + Vite dashboard for operator control over NATS & Protobuf.

## Features
- State-aware vehicle control buttons (ARM, DISARM, TAKEOFF, LAND, RTL, HOLD, OFFBOARD)
- Real-time telemetry monitoring (Connection status, Armed state, Flight mode, Battery %, GPS 3D fix, Lat/Lon/Alt, Heading)
- NATS WebSocket pub/sub over port `9222` with binary Protobuf serialization
- Multi-drone selector (`drone01`, `drone02`, etc.)

## Development
```bash
npm install
npm run dev
```
