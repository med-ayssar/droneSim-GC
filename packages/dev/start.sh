#!/usr/bin/env bash
# Start the offboard_mission node.
# Run this inside the px4-ros2 container, from ~/packages/dev, after the
# colcon build in tmux window 2 finishes:
#
#   ./start.sh

set -eo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "${ROOT}/install/setup.bash" ]]; then
  echo "offboard_mission is not built yet. Wait for the colcon build in this window to finish." >&2
  exit 1
fi

# ROS setup scripts read unset variables. Do not use set -u around them.
set +u
source /opt/ros/humble/setup.bash
source /home/drone/Tools/install/px4_msgs/setup.bash
# shellcheck disable=SC1091
source "${ROOT}/install/setup.bash"
set -u

echo "==> ros2 launch offboard_mission offboard_mission.launch.py"
ros2 launch offboard_mission offboard_mission.launch.py
