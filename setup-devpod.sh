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

# Create workspace directory
mkdir -p "$WORKSPACE_NAME"
cd "$WORKSPACE_NAME"

# Create devcontainer config
mkdir -p .devcontainer

cat >.devcontainer/devcontainer.json <<EOF
{
  "name": "$WORKSPACE_NAME",
  "image": "$IMAGE",

  "workspaceMount": "source=${localWorkspaceFolder},target=/workspace,type=bind",


  "customizations": {
    "vscode": {
      "extensions": [
        "ms-vscode.cpptools",
        "ms-vscode.cpptools-extension-pack",
        "vadimcn.vscode-lldb"
        "twxs.cmake",
        "ms-vscode.cmake-tools",

        "ms-python.python",
        "golang.go"
      ]
    }
  },

  "remoteUser": "root"
}
EOF

echo "Starting DevPod..."

devpod up . \
  --provider "$PROVIDER" \
  --id "$WORKSPACE_NAME"

echo ""
echo "Done!"
echo ""
echo "Open with VS Code:"
echo "  devpod code ."
echo ""
echo "SSH into workspace:"
echo "  devpod ssh ."
