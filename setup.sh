#!/usr/bin/env bash
# Update the PX4-Autopilot submodule and install its host build dependencies
# (Gazebo, OpenCV, kconfiglib, empy, ...) using PX4's own OS-specific installer.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "==> Updating PX4-Autopilot submodule (recursive)..."
git submodule update --init --recursive PX4-Autopilot

if [ ! -f "PX4-Autopilot/Tools/setup/ubuntu.sh" ]; then
  echo "ERROR: PX4-Autopilot is not populated - is it a registered submodule?" >&2
  exit 1
fi

OS="$(uname -s)"
case "$OS" in
  Linux)
    echo "==> Detected Linux - running PX4 Ubuntu setup (SITL only, no NuttX)..."
    bash ./PX4-Autopilot/Tools/setup/ubuntu.sh --no-nuttx
    ;;
  Darwin)
    echo "==> Detected macOS - running PX4 macOS setup..."
    bash ./PX4-Autopilot/Tools/setup/macos.sh
    ;;
  *)
    echo "ERROR: Unsupported OS '$OS' (expected Linux or Darwin)." >&2
    exit 1
    ;;
esac

echo ""
echo "==> PX4 host dependencies installed."
echo "    Build + run SITL:  cd PX4-Autopilot && make px4_sitl gz_x500"
echo "    (headless on WSL:   make px4_sitl gz_x500 HEADLESS=1)"
