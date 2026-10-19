#!/usr/bin/env python3
"""Find the PX4 serial device path exposed by OrbStack.

Prints one Linux guest path on stdout. Progress and errors go to stderr.
"""

import json
import subprocess
import sys
import time

# USB vendor ids used by PX4, CubePilot, and Holybro flight controllers.
FC_VENDORS = {0x26AC, 0x2DAE, 0x3162}
NAME_HINTS = (
    "px4",
    "pixhawk",
    "holybro",
    "cubepilot",
    "cube orange",
    "cuav",
    "modalai",
    "autopilot",
    "fmu",
)
BAD_CATEGORY = {
    "audio",
    "video",
    "ethernet",
    "billboard",
    "hid",
    "hub",
    "storage",
    "mass-storage",
}


def run(cmd, timeout=20):
    return subprocess.run(
        cmd,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
    )


def orb_serial_ports():
    """Return OrbStack's Linux tty paths, excluding macOS callout ports."""
    listed = run(["orb", "serial", "list"])
    if listed.returncode != 0:
        return []

    ports = []
    for line in listed.stdout.splitlines():
        columns = line.split()
        if len(columns) < 3 or columns[1].lower() != "tty":
            continue
        name, _, path = columns[0], columns[1], columns[-1]
        lowered = name.lower()
        if any(token in lowered for token in ("bluetooth", "debug-console", "incoming-port")):
            continue
        if path.startswith("/dev/tty."):
            ports.append(path)
    return list(dict.fromkeys(ports))


def guest_ports():
    script = r"""
for pattern in /proc/1/root/dev/serial/by-id/* /proc/1/root/dev/ttyACM* /proc/1/root/dev/ttyUSB*; do
  [ -e "$pattern" ] || continue
  echo "$pattern"
done
"""
    listed = run(
        [
            "docker",
            "run",
            "--rm",
            "--privileged",
            "--pid=host",
            "alpine",
            "sh",
            "-c",
            script,
        ],
        timeout=60,
    )
    if listed.returncode != 0:
        return []

    by_id = []
    tty = []
    for line in listed.stdout.splitlines():
        line = line.strip()
        if "/serial/by-id/" in line:
            name = line.rsplit("/", 1)[-1]
            by_id.append(f"/dev/serial/by-id/{name}")
        else:
            name = line.rsplit("/", 1)[-1]
            if name.startswith("ttyACM") or name.startswith("ttyUSB"):
                tty.append(f"/dev/{name}")
    # by-id is stable. tty nodes are the same devices under another name.
    return list(dict.fromkeys(by_id or tty))


def attach_flight_controllers():
    listed = run(["orb", "usb", "list", "-f", "json"])
    if listed.returncode != 0 or not listed.stdout.strip():
        return False
    try:
        payload = json.loads(listed.stdout)
    except json.JSONDecodeError:
        return False

    attached = False
    for dev in payload.get("devices", []):
        category = (dev.get("category") or "").lower()
        if category in BAD_CATEGORY:
            continue
        vendor = dev.get("vendor_id")
        label = f"{dev.get('manufacturer', '')} {dev.get('path', '')}".strip()
        lowered = label.lower()
        if vendor not in FC_VENDORS and not any(hint in lowered for hint in NAME_HINTS):
            continue
        bus_id = dev.get("bus_id")
        if not bus_id:
            continue
        print(
            f"==> Attaching USB device {bus_id} ({label}) to OrbStack",
            file=sys.stderr,
        )
        result = run(["orb", "usb", "attach", str(bus_id)], timeout=30)
        if result.returncode == 0:
            attached = True
        else:
            message = (result.stderr or result.stdout).strip()
            print(f"WARN: orb usb attach {bus_id} failed: {message}", file=sys.stderr)
    if attached:
        time.sleep(2)
    return attached


def pick(paths):
    paths = list(dict.fromkeys(paths))
    if not paths:
        return None

    def score(path):
        name = path.lower()
        if "usbmodem" in name:
            return 100
        if "by-id" in name:
            return 90
        if "ttyacm" in name:
            return 85
        if "ttyusb" in name:
            return 80
        return 50

    best = max(score(path) for path in paths)
    top = [path for path in paths if score(path) == best]
    if len(top) > 1:
        print("ERROR: more than one serial device matched:", file=sys.stderr)
        for path in top:
            print(f"  {path}", file=sys.stderr)
        print("Re-run with --device PATH", file=sys.stderr)
        sys.exit(2)
    return top[0]


def fail():
    print("ERROR: no PX4 serial device found inside OrbStack's Linux VM.", file=sys.stderr)
    print("Plug in the flight controller and retry.", file=sys.stderr)
    print("Check OrbStack's Devices tab or run: orb serial list", file=sys.stderr)
    print(
        "Use the tty path from orb serial list, for example: ./start_backend.sh --hardware --device /dev/tty.usbmodem01",
        file=sys.stderr,
    )
    sys.exit(1)


def main():
    # OrbStack lists a macOS callout path (/dev/cu.*) and a Linux tty path
    # (/dev/tty.*). Compose must map the tty path, not the callout path.
    serial = orb_serial_ports()
    guest = guest_ports() if not serial else []
    if not serial and not guest and attach_flight_controllers():
        serial = orb_serial_ports()
        guest = guest_ports() if not serial else []
    chosen = pick(serial or guest)

    if not chosen:
        fail()
    print(chosen)


if __name__ == "__main__":
    main()
