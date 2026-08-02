#!/usr/bin/env bash

set -euo pipefail

SESSION="px4-stack"
IMAGE="drone-sim-px4-ros2:latest"
CONTAINER="px4-ros2"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Checking Docker container..."

# --------------------------------------------------
# Check if container is running
# --------------------------------------------------

RUNNING=$(docker ps \
  --filter "name=^${CONTAINER}$" \
  --filter "ancestor=${IMAGE}" \
  --format "{{.Names}}")

if [ -z "$RUNNING" ]; then

  echo "==> Container not running. Starting Docker compose..."

  cd "$ROOT"

  docker compose up --build -d

  echo "==> Waiting for container startup..."

  sleep 5

else
  echo "==> Container already running: $RUNNING"
fi

# --------------------------------------------------
# Check container exists
# --------------------------------------------------

if ! docker ps --format "{{.Names}}" | grep -q "^${CONTAINER}$"; then
  echo "ERROR: Container $CONTAINER is not running"
  exit 1
fi

# --------------------------------------------------
# Kill old tmux session
# --------------------------------------------------

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "==> Existing tmux session found"
  exec tmux attach -t "$SESSION"
fi

# --------------------------------------------------
# Create tmux windows
# --------------------------------------------------

tmux new-session \
  -d \
  -s "$SESSION" \
  -n "PX4"

# --------------------------------------------------
# Window 0: PX4 SITL
# --------------------------------------------------

tmux send-keys \
  -t "$SESSION:PX4" \
  "docker exec -it $CONTAINER bash -c 'cd /home/px4/PX4-Autopilot && bash" \
  C-m

# --------------------------------------------------
# Window 1: DDS Agent
# --------------------------------------------------

tmux new-window \
  -t "$SESSION" \
  -n "DDS"

tmux send-keys \
  -t "$SESSION:DDS" \
  "docker exec -it $CONTAINER bash -c 'MicroXRCEAgent udp4 -p 8888' && bash" \
  C-m

# --------------------------------------------------
# Window 2: ROS2 Build + Node
# --------------------------------------------------

tmux new-window \
  -t "$SESSION" \
  -n "ROS2"

tmux send-keys \
  -t "$SESSION:ROS2" \
  "docker exec -it $CONTAINER bash -c 'source /opt/ros/humble/setup.bash && cd /workspace/ros_ws && colcon build --symlink-install --event-handlers console_direct+ && source install/setup.bash && ros2 run px4_offboard_cpp offboard_control'" \
  C-m

# --------------------------------------------------
# Window 3: Debug shell
# --------------------------------------------------

tmux new-window \
  -t "$SESSION" \
  -n "SHELL"

tmux send-keys \
  -t "$SESSION:SHELL" \
  "docker exec -it $CONTAINER bash" \
  C-m

# --------------------------------------------------
# Attach
# --------------------------------------------------

tmux select-window -t "$SESSION:PX4"

exec tmux attach -t "$SESSION"
