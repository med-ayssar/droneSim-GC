#!/usr/bin/env bash

set -euo pipefail

SESSION="px4-stack"
IMAGE="drone-sim-px4-ros2:latest"
IMAGE="drone-sim_devcontainer-px4-ros2:latest"
IMAGE="dev-px4-ros2:latest"
CONTAINER="px4-ros2"
CONTAINER_SERIAL="/dev/px4"
DEFAULT_BAUD="921600"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

HARDWARE=0
BAUD="$DEFAULT_BAUD"
BAUD_SET=0
DEVICE=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [--hardware] [--device PATH] [--baud RATE]

  default       PX4 SITL (gz_x500) and MicroXRCEAgent udp4 -p 8888
  --hardware    Real PX4 on a USB serial port. Detects the device, adds it
                to Compose, and starts MicroXRCEAgent on serial.
  --device PATH Host serial node. Skips detection and implies --hardware.
                Use the OrbStack tty path, e.g. /dev/tty.usbmodem01.
  --baud RATE   Agent baud rate (default ${DEFAULT_BAUD})

On the flight controller, UXRCE_DDS_CFG must select the same USB or TELEM
port, at the same baud.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --hardware)
      HARDWARE=1
      shift
      ;;
    --device)
      if [[ $# -lt 2 ]]; then
        echo "ERROR: --device needs a path"
        usage
        exit 1
      fi
      DEVICE="$2"
      HARDWARE=1
      shift 2
      ;;
    --baud)
      if [[ $# -lt 2 ]]; then
        echo "ERROR: --baud needs a number"
        usage
        exit 1
      fi
      BAUD="$2"
      BAUD_SET=1
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if ! [[ "$BAUD" =~ ^[0-9]+$ ]]; then
  echo "ERROR: --baud must be an integer (got '${BAUD}')"
  exit 1
fi

if [[ "$BAUD_SET" == 1 && "$HARDWARE" != 1 ]]; then
  echo "ERROR: --baud is only used with --hardware"
  exit 1
fi

DETECT_SERIAL="${ROOT}/detect_px4_serial.py"

if [[ "$HARDWARE" == 1 ]]; then
  if [[ -z "$DEVICE" ]]; then
    echo "==> Looking for a PX4 serial device..."
    DEVICE="$(python3 "$DETECT_SERIAL")"
  fi
  if ! [[ "$DEVICE" =~ ^/dev/[A-Za-z0-9._+/-]+$ ]]; then
    echo "ERROR: serial device path is not usable: ${DEVICE}"
    exit 1
  fi
  if [[ "$DEVICE" == /dev/cu.* ]]; then
    echo "ERROR: ${DEVICE} is the macOS callout path. Use the tty path from 'orb serial list', such as /dev/tty.usbmodem01."
    exit 1
  fi
  export PX4_SERIAL_DEVICE="$DEVICE"
  export PX4_SERIAL_BAUD="$BAUD"
  echo "==> Hardware PX4 serial: ${PX4_SERIAL_DEVICE} (${PX4_SERIAL_BAUD} baud) -> ${CONTAINER_SERIAL}"
  echo "==> Flight controller UXRCE_DDS_CFG must use this port at ${PX4_SERIAL_BAUD} baud."
fi

compose() {
  (
    cd "$ROOT"
    if [[ "$HARDWARE" == 1 ]]; then
      docker compose -f docker-compose.yml -f docker-compose.hardware.yml "$@"
    else
      docker compose "$@"
    fi
  )
}

echo "==> Checking Docker container..."

# --------------------------------------------------
# Check if container is running
# --------------------------------------------------
RUNNING=$(docker ps \
  --filter "name=^${CONTAINER}$" \
  --filter "ancestor=${IMAGE}" \
  --format "{{.Names}}")

if [[ -z "$RUNNING" ]]; then
  echo "==> Container not running. Starting Docker compose..."
  compose up --build -d

  echo "==> Waiting for container startup..."
  sleep 5
elif [[ "$HARDWARE" == 1 ]]; then
  HOST_DEV="$(docker exec "$CONTAINER" printenv PX4_SERIAL_HOST_DEVICE 2>/dev/null || true)"
  if [[ "$HOST_DEV" != "$PX4_SERIAL_DEVICE" ]]; then
    echo "==> Recreating container with serial device ${PX4_SERIAL_DEVICE}..."
    compose up -d --force-recreate
    echo "==> Waiting for container startup..."
    sleep 5
  else
    echo "==> Container already running with ${PX4_SERIAL_DEVICE}"
  fi
else
  echo "==> Container already running: $RUNNING"
fi

# --------------------------------------------------
# Verify container is running
# --------------------------------------------------
if ! docker ps --format "{{.Names}}" | grep -q "^${CONTAINER}$"; then
  echo "ERROR: Container $CONTAINER is not running."
  exit 1
fi

if [[ "$HARDWARE" == 1 ]]; then
  if ! docker exec "$CONTAINER" test -c "$CONTAINER_SERIAL"; then
    echo "ERROR: ${CONTAINER_SERIAL} is missing inside ${CONTAINER}."
    echo "The host device was ${PX4_SERIAL_DEVICE}."
    exit 1
  fi
fi

# --------------------------------------------------
# Attach to existing tmux session if active
# --------------------------------------------------
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "==> Existing tmux session found. Attaching..."
  echo "    If this session was started in the other mode, run: tmux kill-session -t ${SESSION}"
  exec tmux attach -t "$SESSION"
fi

# --------------------------------------------------
# Create new tmux session with 3 windows
# --------------------------------------------------
if [[ "$HARDWARE" == 1 ]]; then
  echo "==> Creating tmux session (hardware serial agent)..."

  # Window 1: shell. Firmware is already running on the flight controller.
  tmux new-session -d -s "$SESSION" -n "PX4"
  tmux send-keys -t "$SESSION:PX4" "docker exec -it $CONTAINER bash -lc 'echo \"Hardware mode: PX4 firmware is on the flight controller (${CONTAINER_SERIAL}). SITL is not started.\"; exec bash'" C-m

  # Window 2: DDS agent on the serial device mapped by Compose.
  tmux new-window -t "$SESSION" -n "DDS"
  tmux send-keys -t "$SESSION:DDS" "docker exec -it $CONTAINER bash -lc 'if [ ! -w ${CONTAINER_SERIAL} ]; then sudo chmod a+rw ${CONTAINER_SERIAL}; fi; exec MicroXRCEAgent serial --dev ${CONTAINER_SERIAL} -b ${BAUD}'" C-m
else
  echo "==> Creating tmux session with 3 interactive container shells..."

  # Window 1: PX4
  tmux new-session -d -s "$SESSION" -n "PX4"
  tmux send-keys -t "$SESSION:PX4" "docker exec -it $CONTAINER bash -c 'cd Tools/PX4-Autopilot && exec make px4_sitl gz_x500'" C-m

  # Window 2: DDS
  tmux new-window -t "$SESSION" -n "DDS"
  tmux send-keys -t "$SESSION:DDS" "docker exec -it $CONTAINER  bash -c 'MicroXRCEAgent udp4 -p 8888'" C-m
fi

# Window 3: ROS2
tmux new-window -t "$SESSION" -n "ROS2"
tmux send-keys -t "$SESSION:ROS2" "docker exec -it $CONTAINER bash" C-m

# --------------------------------------------------
# Attach to session (defaulting to PX4 window)
# --------------------------------------------------
tmux select-window -t "$SESSION:PX4"
exec tmux attach -t "$SESSION"
