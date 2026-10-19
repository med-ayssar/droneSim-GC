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

# A previous docker exec keeps running after tmux is killed. A second
# MicroXRCEAgent then dies with "bind error" on UDP 8888, and make px4_sitl
# fails with "PX4 server already running for instance 0".
echo "==> Clearing leftover PX4 and DDS processes..."
docker exec "$CONTAINER" pkill -x MicroXRCEAgent || true
docker exec "$CONTAINER" pkill -x px4 || true
docker exec "$CONTAINER" pkill -f "gz sim" || true
sleep 1
docker exec "$CONTAINER" pkill -9 -x MicroXRCEAgent || true
docker exec "$CONTAINER" pkill -9 -x px4 || true
docker exec "$CONTAINER" pkill -9 -f "gz sim" || true
docker exec "$CONTAINER" bash -c 'rm -f /tmp/px4_lock-* /tmp/px4-sock-*'

# Window 1: PX4
tmux new-session -d -s "$SESSION" -n "PX4"
tmux send-keys -t "$SESSION:PX4" "docker exec -it $CONTAINER bash -c 'cd Tools/PX4-Autopilot && exec make px4_sitl gz_x500'" C-m

# Window 2: DDS
tmux new-window -t "$SESSION" -n "DDS"
tmux send-keys -t "$SESSION:DDS" "docker exec -it $CONTAINER  bash -c 'MicroXRCEAgent udp4 -p 8888'" C-m

# Window 3: ROS2. Stay inside the container after the offboard_mission build.
tmux new-window -t "$SESSION" -n "ROS2" -c "$ROOT"
tmux send-keys -t "$SESSION:ROS2" "docker exec -it --workdir /home/drone/packages/dev $CONTAINER bash" C-m
sleep 2
tmux send-keys -t "$SESSION:ROS2" "source /opt/ros/humble/setup.bash && source /home/drone/Tools/install/px4_msgs/setup.bash && colcon build --packages-select offboard_mission --symlink-install" C-m

# --------------------------------------------------
# Attach to session (defaulting to PX4 window)
# --------------------------------------------------
tmux select-window -t "$SESSION:PX4"
exec tmux attach -t "$SESSION"
