# NATS Messaging Infrastructure Service

This service provides the NATS messaging broker container for the PX4 Drone Control Platform.

## Ports
- **4222**: NATS TCP client port (used by ROS 2 C++ bridge)
- **9222**: NATS WebSocket port (used by React TypeScript frontend)
- **8222**: NATS HTTP monitoring port

## Authentication
- Operator (Frontend): user `operator`, pass `operator_password`
- ROS 2 Bridge: user `bridge`, pass `bridge_password`
- Admin: user `admin`, pass `admin_password`
