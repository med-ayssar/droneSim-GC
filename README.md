# drone-sim

PX4 SITL + ROS 2 (Humble) development environment, wired together with Nix.

The stack has four moving parts:

1. **PX4-Autopilot** (git submodule) — the flight stack, run as SITL with Gazebo. Built on the host, *not* by Nix.
2. **Micro XRCE-DDS Agent** — the bridge that turns PX4's uXRCE-DDS traffic into ROS 2 topics. Provided by the Nix flake.
3. **px4_msgs** — the ROS 2 message definitions PX4 publishes/subscribes. Provided by the Nix flake.
4. **px4_offboard_cpp** — our custom C++ node (`dev/src/px4_offboard_cpp`) that arms the drone and commands a takeoff via offboard control.

Everything talks over **UDP port 8888**, PX4's default uXRCE-DDS port.

---

## 1. Install Nix

Install Nix with flakes enabled. The [Determinate Systems installer](https://github.com/DeterminateSystems/nix-installer) turns flakes on by default:

```bash
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install
```

If you use the official installer instead, enable flakes manually:

```bash
mkdir -p ~/.config/nix
echo "experimental-features = nix-command flakes" >> ~/.config/nix/nix.conf
```

Restart your shell afterwards so `nix` is on `PATH`.

> **WSL note:** this repo is developed on WSL2. Run all commands from inside the WSL Linux filesystem (e.g. `~/dev/drone-sim`), not a `/mnt/c` path — Gazebo and the build are far slower over the Windows mount.

---

## 2. Clone and set up PX4-Autopilot

`setup.sh` initializes the PX4 submodule and installs PX4's host build dependencies (Gazebo, OpenCV, empy, kconfiglib, …) using PX4's own OS-specific installer. It builds **SITL only** (no NuttX firmware).

```bash
git clone <this-repo-url> drone-sim
cd drone-sim
./setup.sh
```

This runs `git submodule update --init --recursive services/PX4-Autopilot`, then the matching PX4 installer for your OS (Ubuntu/Linux or macOS). Expect it to take a while and to pull in a lot of apt packages on first run.

---

## 3. Enter the Nix dev shell

The dev shell puts ROS 2 Humble, the DDS agent, `px4_msgs`, `colcon`, and `tmux` on your `PATH`.

```bash
nix develop
```

On entry it prints a short cheat-sheet and defines a `start-agent` alias. It also sets `ROS_DOMAIN_ID=0`.

> Run **every command in the sections below from inside `nix develop`**. Open new terminals with `nix develop` each, or use `tmux` (bundled in the shell) to split panes.

---

## 4. Build PX4 SITL and launch the simulation

From the repo root, inside the dev shell:

```bash
cd services/PX4-Autopilot
make px4_sitl gz_x500
```

Headless (recommended on WSL, no GUI):

```bash
make px4_sitl gz_x500 HEADLESS=1
```

PX4 boots the `x500` quadcopter in Gazebo and automatically starts its `uxrce_dds_client`, which connects to the agent on **UDP 8888**. Leave this running.

---

## 5. Start the Micro XRCE-DDS Agent

In a **second** terminal (also inside `nix develop`), start the agent listening on UDP 8888:

```bash
MicroXRCEAgent udp4 -p 8888
# or the shortcut the dev shell defines:
start-agent
```

Once PX4 and the agent are both up, PX4's topics appear on the ROS 2 graph. Verify from any dev-shell terminal:

```bash
ros2 topic list | grep fmu
```

You should see `/fmu/in/*` (commands into PX4) and `/fmu/out/*` (state out of PX4).

> The `udp4 -p 8888` is the important part — it must match PX4's client port. If the topics never appear, this mismatch is the first thing to check.

---

## 6. Build and run the custom C++ node

Our node lives in the ROS 2 workspace under `dev/`. Build it with `colcon` from the `dev/` directory:

```bash
cd dev
colcon build --packages-select px4_offboard_cpp
source install/setup.bash
```

Then run it in a **third** terminal (dev shell + the `source` above):

```bash
ros2 run px4_offboard_cpp offboard_control
```

What it does (`dev/src/px4_offboard_cpp/src/offboard_control.cpp`):

1. Streams `OffboardControlMode` + `TrajectorySetpoint` at 10 Hz.
2. After 10 setpoints, requests **Offboard** mode and **arms**.
3. Commands a takeoff to 5 m (PX4 uses NED, so `z = -5`).
4. Subscribes to `/fmu/out/vehicle_local_position` and `/fmu/out/vehicle_status` and logs `armed / nav_state / altitude` roughly every 2 s.

Watch the log lines — altitude should climb toward 5.0 m once armed.

### Useful build variants

```bash
# Debug build (full symbols, no optimization)
colcon build --packages-select px4_offboard_cpp --cmake-args -DCMAKE_BUILD_TYPE=Debug

# Address/UB sanitizer build
colcon build --packages-select px4_offboard_cpp --cmake-args -DENABLE_ASAN=ON
```

---

## Quick reference

| Step | Command | Where |
|------|---------|-------|
| Enter env | `nix develop` | repo root |
| PX4 SITL | `cd services/PX4-Autopilot && make px4_sitl gz_x500 HEADLESS=1` | terminal 1 |
| Agent | `start-agent` (`MicroXRCEAgent udp4 -p 8888`) | terminal 2 |
| Build node | `cd dev && colcon build --packages-select px4_offboard_cpp && source install/setup.bash` | terminal 3 |
| Run node | `ros2 run px4_offboard_cpp offboard_control` | terminal 3 |

**Startup order:** PX4 SITL → agent → your node. PX4 and the agent will retry the connection, but the node needs both up before it can see the `/fmu/*` topics.

---

## Troubleshooting

- **No `/fmu/*` topics** — agent not on port 8888, or PX4 SITL not running. Confirm both, then `ros2 topic list`.
- **Node sees no state / never arms** — QoS mismatch. PX4 publishes best-effort; the node already matches this. Make sure `ROS_DOMAIN_ID` is `0` in every terminal (the dev shell sets it).
- **`px4_msgs` not found at build** — you're outside `nix develop`. Re-enter the shell so the flake-provided `px4_msgs` is on the CMake prefix path.
- **Gazebo slow / crashes on WSL** — use `HEADLESS=1`, and work from the native Linux filesystem, not `/mnt/c`.
