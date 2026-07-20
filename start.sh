#!/usr/bin/env bash
# Launch the full stack in a 3-pane tmux session:
#   pane 0  PX4 SITL + Gazebo        (host toolchain, built by ./setup.sh)
#   pane 1  Micro XRCE-DDS Agent      (inside the Nix dev shell, UDP 8888)
#   pane 2  custom C++ node           (nix: colcon build + ros2 run)
#
# Usage:
#   ./start.sh              # Gazebo GUI
#   HEADLESS=1 ./start.sh   # headless Gazebo (recommended on WSL)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

SESSION="drone-sim"

# --- Ensure tmux is available -------------------------------------------------
# The dev shell ships tmux, but this script runs on the host before entering it.
# If tmux is missing, re-exec ourselves inside a throwaway Nix shell that provides
# it (this repo already requires Nix). Fall back to a clear error otherwise.
if ! command -v tmux >/dev/null 2>&1; then
  if command -v nix >/dev/null 2>&1; then
    echo "==> tmux not found - relaunching inside 'nix shell nixpkgs#tmux'..."
    exec nix shell nixpkgs#tmux --command "$0" "$@"
  fi
  echo "ERROR: tmux is not installed and Nix is unavailable to provide it." >&2
  echo "       Install tmux (e.g. 'sudo apt install tmux') and re-run." >&2
  exit 1
fi

# --- Reuse an existing session instead of stacking duplicates -----------------
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "==> Session '$SESSION' already running - attaching."
  exec tmux attach -t "$SESSION"
fi

# --- Build the PX4 make command (optionally headless) -------------------------
PX4_CMD="make px4_sitl gz_x500"
if [ "${HEADLESS:-0}" = "1" ]; then
  PX4_CMD="$PX4_CMD HEADLESS=1"
fi

# --- Create the layout, capturing pane IDs so send-keys is order-independent --
p0="$(tmux new-session -d -s "$SESSION" -c "$ROOT" -P -F '#{pane_id}')"
p1="$(tmux split-window -h -t "$p0" -c "$ROOT" -P -F '#{pane_id}')"
p2="$(tmux split-window -v -t "$p1" -c "$ROOT" -P -F '#{pane_id}')"
tmux select-layout -t "$SESSION" tiled

# pane 0: PX4 SITL + Gazebo (host shell - uses deps from ./setup.sh, NOT Nix)
tmux send-keys -t "$p0" \
  "cd services/PX4-Autopilot && $PX4_CMD" C-m

# pane 1: DDS agent inside the Nix dev shell, bound to PX4's default UDP port
tmux send-keys -t "$p1" \
  "nix develop \"$ROOT\" --command MicroXRCEAgent udp4 -p 8888" C-m

# pane 2: build + run our C++ node inside the Nix dev shell
tmux send-keys -t "$p2" \
  "cd dev && nix develop \"$ROOT\" --command bash -c 'export ROS_DOMAIN_ID=0; colcon build --packages-select px4_offboard_cpp && source install/setup.bash && ros2 run px4_offboard_cpp offboard_control'" C-m

tmux select-pane -t "$p0"
exec tmux attach -t "$SESSION"
