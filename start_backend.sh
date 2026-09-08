#!/usr/bin/env bash

set -euo pipefail

SESSION="px4-stack"
IMAGE="drone-sim-px4-ros2:latest"
IMAGE="drone-sim_devcontainer-px4-ros2:latest"
IMAGE="dev-px4-ros2:latest"
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
# Verify container is running
# --------------------------------------------------
if ! docker ps --format "{{.Names}}" | grep -q "^${CONTAINER}$"; then
  echo "ERROR: Container $CONTAINER is not running."
  exit 1
fi

# --------------------------------------------------
# Attach to existing tmux session if active
# --------------------------------------------------
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "==> Existing tmux session found. Attaching..."
  exec tmux attach -t "$SESSION"
fi

# --------------------------------------------------
# Create new tmux session with 3 windows
# --------------------------------------------------
echo "==> Creating tmux session with 3 interactive container shells..."

# Window 1: PX4
tmux new-session -d -s "$SESSION" -n "PX4"
tmux send-keys -t "$SESSION:PX4" "docker exec -it $CONTAINER bash -c 'cd Tools/PX4-Autopilot && exec make px4_sitl gz_x500'" C-m

# Window 2: DDS
tmux new-window -t "$SESSION" -n "DDS"
tmux send-keys -t "$SESSION:DDS" "docker exec -it $CONTAINER  bash -c 'MicroXRCEAgent udp4 -p 8888'" C-m

# Window 3: ROS 2 NATS bridge. It is rebuilt from the mounted workspace so
# frontend/bridge changes are picked up on every backend launch.
tmux new-window -t "$SESSION" -n "ROS2"
tmux send-keys -t "$SESSION:ROS2" "docker exec -it $CONTAINER bash -lc 'source /opt/ros/humble/setup.bash && source /home/drone/Tools/install/px4_msgs/setup.bash && cd /home/drone/packages && colcon build --packages-select px4_nats_bridge && source install/setup.bash && exec ros2 run px4_nats_bridge px4_nats_bridge_node'" C-m

# --------------------------------------------------
# Attach to session (defaulting to PX4 window)
# --------------------------------------------------
tmux select-window -t "$SESSION:PX4"
exec tmux attach -t "$SESSION"
