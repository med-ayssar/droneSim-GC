# Walkthrough

Get the sim running on a new machine: Rancher Desktop, the `px4-ros2` container, PX4 SITL with Gazebo, the Micro XRCE-DDS agent, and the `offboard_mission` node.

Do these steps in order. Commands run on the host (your WSL distro, or the Mac terminal). The PX4 and DDS processes run inside the container, started for you by `./start_backend.sh`.

## 1. Install git and tmux

Install these before anything else. `git` is how you clone the repo. `tmux` is what `./start_backend.sh` uses to keep PX4, the DDS agent, and a ROS 2 shell open at the same time.

On Windows, install them inside the WSL distro you will use (Ubuntu is the usual choice):

```bash
sudo apt update
sudo apt install -y git tmux
```

On macOS:

```bash
brew install git tmux
```

Check:

```bash
git --version
tmux -V
```

## 2. Install Rancher Desktop

Rancher Desktop provides the Docker engine this project builds with.

1. Download the installer from [rancherdesktop.io](https://rancherdesktop.io/) and run it.
2. On Windows, Rancher Desktop needs WSL 2. In an Administrator PowerShell, if you do not already have a distro:

   ```powershell
   wsl --install -d Ubuntu
   ```

   Reboot if Windows asks. Open Ubuntu once and finish its first-user setup.
3. When Rancher Desktop asks for a container runtime, choose **dockerd (moby)**. This project uses `docker` and `docker compose`. The containerd / nerdctl runtime will not run these commands.
4. You can turn Kubernetes off. This walkthrough does not use it.
5. Wait until the Rancher Desktop status says it is running.

On macOS the same installer works. Pick **dockerd (moby)** there too. There is no WSL step on a Mac.

Confirm the CLI:

```bash
docker version
docker compose version
```

If `docker` inside WSL says permission denied on the socket:

```bash
sudo groupadd docker
sudo adduser "$USER" docker
sudo chown root:docker /var/run/docker.sock
sudo chmod g+w /var/run/docker.sock
newgrp docker
```

## 3. Turn on WSL integration

This step is Windows only.

Rancher Desktop runs the engine in its own WSL distro. Your Ubuntu distro can use `docker` only after integration is enabled.

1. Open Rancher Desktop.
2. Open **Preferences** (gear) → **WSL** → **Integrations**.
3. Enable your Ubuntu distro. Apply, and let it finish.
4. The distro must be WSL 2. If it is missing from the list:

   ```powershell
   wsl --set-version Ubuntu 2
   ```

5. Close the Ubuntu terminal and open it again.

From Ubuntu:

```bash
docker version
docker compose version
```

Both should print a server version, not a connection error.

### Set `networkingMode` to `mirrored`

The compose file uses `network_mode: host`. WSL has to use mirrored networking so Windows `localhost` and the WSL `localhost` are the same address. That is what makes `http://localhost:8443`, QGroundControl, and the PX4 UDP ports reachable from Windows.

On Windows, open `%USERPROFILE%\.wslconfig`. That is `C:\Users\<you>\.wslconfig`, next to your Windows profile. It is not a file inside the Ubuntu home directory.

From PowerShell:

```powershell
notepad $env:USERPROFILE\.wslconfig
```

The file should contain:

```ini
[wsl2]
networkingMode=mirrored
```

If the file already exists, add `networkingMode=mirrored` under the existing `[wsl2]` section. Leave the other keys in that section as they are.

Shut WSL down so the setting is picked up. This stops every distro, including Rancher Desktop. From PowerShell:

```powershell
wsl --shutdown
```

Start Rancher Desktop again, then open Ubuntu. Check the mode from Ubuntu:

```bash
wslinfo --networking-mode
```

The output should be `mirrored`.

## 4. Clone the project

On Windows, clone inside the WSL home directory. A checkout on `/mnt/c/...` makes the `packages` bind mount very slow.

```bash
cd ~
git clone https://github.com/med-ayssar/drone-sim.git
cd drone-sim
```

SSH works too, if your key is loaded:

```bash
git clone git@github.com:med-ayssar/drone-sim.git
```

## 5. Build the image

From the repo root, pick one of these. They build the same image.

Full logs, every Dockerfile line as it runs:

```bash
docker compose build --progress=plain
```

Quieter default progress view:

```bash
docker compose build
```

The first build compiles PX4 and is slow. Later builds use the Docker layer cache.

## 6. Choose where Gazebo is drawn

Gazebo does not start at container boot. It starts later, when PX4 SITL comes up. This setting decides which screen it lands on.

Edit `docker-compose.yml`. The line is:

```yaml
- DISPLAY=:1
```

### Windows (WSL)

Pick one.

**Host desktop.** Gazebo opens on the Windows desktop through WSLg:

```yaml
- DISPLAY=:0
```

Leave the `/tmp/.X11-unix/X0` and `/mnt/wslg` volume mounts as they are. Those are the WSLg sockets.

**Browser.** Gazebo opens inside the KasmVNC desktop:

```yaml
- DISPLAY=:1
```

`:1` is already the default in the file.

### macOS

There is no WSLg, so keep the browser display:

```yaml
- DISPLAY=:1
```

The two WSL mounts in `docker-compose.yml` do not exist on a Mac. Comment them out or `docker compose up` fails on the missing paths:

```yaml
    volumes:
      # - type: bind
      #   source: /tmp/.X11-unix/X0
      #   target: /tmp/wsl-X0
      # - /mnt/wslg:/mnt/wslg:rw

      - ./packages:/home/drone/packages
```

## 7. Start the container

From the repo root, pick one.

Attached, logs in this terminal. Ctrl+C stops the stack, so use a second terminal for the rest of the guide:

```bash
docker compose up
```

Background. This is the one the rest of the guide uses. The terminal stays free:

```bash
docker compose up -d
```

If you change `DISPLAY` after the container already exists, run `docker compose up -d` again so Compose recreates it with the new value.

Check that it stayed up:

```bash
docker compose ps
```

`px4-ros2` should be `Up`.

## 8. Open the screen Gazebo will use

KasmVNC is the desktop server inside the container. It listens on port **8443**.

### `DISPLAY=:1` (browser)

Open:

```
http://localhost:8443
```

You should get an XFCE desktop. Basic auth is disabled. If a login page appears anyway, use username `drone` and password `password`.

Accept a certificate warning if the browser shows one. The desktop is empty until PX4 starts in the next step. Gazebo shows up on this desktop after that.

Open that URL in the Windows browser. Mirrored networking (step 3) is what makes `localhost:8443` on Windows reach the container.

### `DISPLAY=:0` (Windows desktop)

Gazebo is drawn by WSLg on the Windows desktop, on X display `:0`. You do not need the browser for Gazebo. The KasmVNC desktop is still available at `http://localhost:8443` if you want a shell inside the container, but the simulator window will not be in that browser.

## 9. Start PX4, the DDS agent, and the mission build

Run this on the host, in the repo root. It is not a command you type inside the container.

```bash
./start_backend.sh
```

What the script does:

1. If the `px4-ros2` container is not running, it runs `docker compose up --build -d` and waits a few seconds.
2. If a tmux session named `px4-stack` already exists, it attaches to that session and does nothing else.
3. Otherwise it clears leftover processes inside the container, then opens three windows and attaches on the PX4 window.

The cleanup exists because killing tmux does not stop processes that were started with `docker exec`. A second agent cannot bind UDP **8888**, and a second PX4 fails with `PX4 server already running for instance 0` while `/tmp/px4_lock-0` is still there. Before the windows open, the script stops `MicroXRCEAgent`, `px4`, and `gz sim`, then deletes `/tmp/px4_lock-*` and `/tmp/px4-sock-*`.

| Keys | Window | Where the shell is | What starts |
| --- | --- | --- | --- |
| `Ctrl+b` then `0` | PX4 | inside `px4-ros2` | `cd Tools/PX4-Autopilot && make px4_sitl gz_x500` |
| `Ctrl+b` then `1` | DDS | inside `px4-ros2` | `MicroXRCEAgent udp4 -p 8888` |
| `Ctrl+b` then `2` | ROS2 | inside `px4-ros2`, directory `~/packages/dev` | `colcon build --packages-select offboard_mission --symlink-install`, then the same shell stays open |

The first `gz_x500` build can take several minutes. When PX4 is ready, that window prints the `pxh>` prompt and Gazebo opens on the display you chose in step 6.

The DDS window is the Micro XRCE-DDS agent. It bridges PX4 and ROS 2. Leave it running. A healthy agent stays in that pane. It does not return to the host prompt.

The ROS 2 window is `docker exec` into the container, not a one-shot command that exits. The build runs in that shell. When it finishes, the prompt is still inside the container at `~/packages/dev`. `Ctrl+b` then `2` shows the build log. Wait for the prompt before the next step.

To start over, detach with `Ctrl+b` then `d`, then:

```bash
tmux kill-session -t px4-stack
./start_backend.sh
```

That creates a new session, so the cleanup runs again. Attaching to an existing session does not clear old processes and does not rebuild.

## 10. Connect QGroundControl

Install QGroundControl on Windows or macOS, from [qgroundcontrol.com](https://qgroundcontrol.com/). Run it on the host. It is not a process inside the container.

PX4 in this container serves the ground-station MAVLink link on UDP **localhost:18570**. Add that link after the PX4 window shows the `pxh>` prompt.

1. Open QGroundControl.
2. Click the **Q** icon (top left) → **Application Settings** → **Comm Links**.
3. Click **Add**.
4. Set the link:

   | Field | Value |
   | --- | --- |
   | Name | `px4-sitl` |
   | Type | UDP |
   | Port | `18570` |
   | Server address | `127.0.0.1` (localhost) |
   | Automatically Connect on Start | on |

5. If **Server Addresses** is a list, click **Add Server** and enter `127.0.0.1`. The port field above is `18570`, so the link is `localhost:18570`.
6. Save, select the `px4-sitl` link, and click **Connect**.

The vehicle shows up in the top bar when the heartbeat arrives. Mirrored networking (step 3) is what lets QGroundControl on Windows reach `localhost:18570` in WSL.

## 11. Move around in tmux

`Ctrl+b` is the tmux prefix. Press it, release it, then press the second key.

| Keys | Action |
| --- | --- |
| `Ctrl+b` then `0` | PX4 window |
| `Ctrl+b` then `1` | DDS agent window |
| `Ctrl+b` then `2` | ROS 2 window, inside the container at `~/packages/dev` |
| `Ctrl+b` then `n` | next window |
| `Ctrl+b` then `p` | previous window |
| `Ctrl+b` then `w` | window list |
| `Ctrl+b` then `d` | detach. The container processes keep running |

Attach again later with either of these:

```bash
tmux attach -t px4-stack
./start_backend.sh
```

`./start_backend.sh` only reattaches when `px4-stack` is already there.

## 12. Start the offboard mission

Switch to the ROS 2 window with `Ctrl+b` then `2`. You are already inside the container, in `~/packages/dev`. When the `colcon` build has finished and the prompt is back, run:

```bash
./start.sh
```

The script is `packages/dev/start.sh` on the host. The compose file mounts `./packages` at `/home/drone/packages`, so the container sees it as `~/packages/dev/start.sh`. Run it in this container shell. It does not call `docker exec`.

`./start.sh` sources ROS 2 Humble, the `px4_msgs` workspace, and `~/packages/dev/install/setup.bash`, then runs:

```bash
ros2 launch offboard_mission offboard_mission.launch.py
```

That starts the `offboard_mission` node. The node arms, takes off, visits waypoints, returns, and lands. The PX4 window needs the `pxh>` prompt, and the DDS agent needs to still be running. `Ctrl+C` stops the node and returns you to the same container prompt.

If `install/setup.bash` is not there yet, `./start.sh` stops and tells you to wait for the build in this window.

## 13. What healthy looks like, and what to do when a tab exits

| Window | Healthy | Exits immediately when |
| --- | --- | --- |
| PX4 (`Ctrl+b` `0`) | Log ends at the `pxh>` prompt. Gazebo is open on the display from step 6. | `PX4 server already running for instance 0`, then `ninja: build stopped` and `make: *** [Makefile:250: px4_sitl] Error 1`. The pane is back at the host prompt. |
| DDS (`Ctrl+b` `1`) | `MicroXRCEAgent` stays in the foreground. | `bind error` on port `8888`, `errno: 98`, then `server stopped`. The pane is back at the host prompt. |
| ROS 2 (`Ctrl+b` `2`) | `colcon` finishes and the prompt is still `drone@...:~/packages/dev`. | The prompt is the host shell. You are not in the container, so `./start.sh` is the wrong file. |

Both failure texts mean a previous PX4 or agent is still running inside `px4-ros2`. Detach, then:

```bash
tmux kill-session -t px4-stack
./start_backend.sh
```

## Ports

| Port | Use |
| --- | --- |
| `http://localhost:8443` | KasmVNC desktop when `DISPLAY=:1` |
| UDP `18570` | QGroundControl MAVLink, `127.0.0.1` |
| UDP `8888` | Micro XRCE-DDS agent |
| UDP `14540`, `14550`, `14560` | Other MAVLink links published by Compose |

Compose uses `network_mode: host`, so those ports are on the same host as the container. On Windows, mirrored networking (step 3) is what makes `localhost` in the Windows browser and in QGroundControl reach them.
