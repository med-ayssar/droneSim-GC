#!/usr/bin/env bash
set -euo pipefail

# Configuration
WORKSPACE_NAME="${1:-droneSimDev}"
IMAGE="${2:-px4-ros2}"
PROVIDER="${3:-docker}"

echo "Setting up DevPod workspace..."
echo "Workspace: $WORKSPACE_NAME"
echo "Image:     $IMAGE"
echo "Provider:  $PROVIDER"

# Check devpod
if ! command -v devpod >/dev/null 2>&1; then
  echo "DevPod not installed."
  echo "Install from https://devpod.sh"
  exit 1
fi

# Check provider
if ! devpod provider ls | grep -q "$PROVIDER"; then
  echo "Adding provider: $PROVIDER"
  devpod provider add "$PROVIDER"
fi

echo "Starting DevPod..."

devpod --debug up . \
  --provider "$PROVIDER" \
  --id "drone"

echo ""
echo "Done!"
echo ""
echo "Open with VS Code:"
echo "  devpod code ."
echo ""
echo "SSH into workspace:"
echo "  devpod ssh ."
