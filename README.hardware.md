# Real PX4 over USB serial (OrbStack)

`./start_backend.sh` starts PX4 SITL and a UDP XRCE-DDS agent. With `--hardware` it skips SITL, finds the flight controller's OrbStack tty path, maps it into the `px4-ros2` container as `/dev/px4`, and starts the serial XRCE-DDS agent on it.

On the flight controller, `UXRCE_DDS_CFG` must select the same USB or TELEM port, at the same baud (default `921600`).

## How the device reaches the container

OrbStack forwards serial/UART devices and lists both the macOS callout (`/dev/cu.*`) and the tty path (`/dev/tty.*`). Compose must map the tty path. `privileged: true` alone does not map a device into a container.

1. Check OrbStack's serial list:

```bash
orb serial list
```

Use the path from the row whose type is `tty` (for your device, `/dev/tty.usbmodem01`). Do not use its `callout` `/dev/cu.*` path. If the board is listed only by `orb usb list`, attach it with `orb usb attach <id>`, then run `orb serial list` again.

2. Docker gives the container its own `/dev`. `docker-compose.hardware.yml` maps the VM node when the container is created:

```yaml
devices:
  - "${PX4_SERIAL_DEVICE}:/dev/px4:rwm"
```

Inside `px4-ros2` the port is always `/dev/px4`. The DDS window runs:

```bash
MicroXRCEAgent serial --dev /dev/px4 -b 921600
```

The container must be created while the board is plugged in. Docker binds the device node at create time.

## Start

Plug in the flight controller, then:

```bash
./start_backend.sh --hardware
```

`detect_px4_serial.py` reads `orb serial list` and selects the `tty` path, such as `/dev/tty.usbmodem01`. It ignores the macOS `callout` path (`/dev/cu.*`).

- OrbStack `tty` paths such as `/dev/tty.usbmodem01`, `/dev/ttyACM0`, and `/dev/ttyUSB0`
- if none are found, it attempts to attach a detected PX4-family USB device, then searches again

Override the port or baud when detection picks the wrong device:

```bash
./start_backend.sh --hardware --device /dev/tty.usbmodem01 --baud 921600
```

`--device` implies `--hardware`.

The same Compose overlay, without the tmux session:

```bash
PX4_SERIAL_DEVICE=/dev/tty.usbmodem01 PX4_SERIAL_BAUD=921600 \
  docker compose -f docker-compose.yml -f docker-compose.hardware.yml up -d
```

A plain `docker compose up` does not map a serial device.

## Check

```bash
docker exec px4-ros2 ls -l /dev/px4
```

You should see a character device. The agent in the `DDS` tmux window should stay connected to the flight controller.

After unplugging or replugging the board, start again with `--hardware`. The script recreates the container when the host path changed.

If a `px4-stack` tmux session from SITL is still open, stop it before switching modes:

```bash
tmux kill-session -t px4-stack
```
