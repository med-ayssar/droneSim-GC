#!/usr/bin/env bash
# Patch PX4 SITL so Offboard arming works without QGroundControl / RC.
#
# gz_x500 defaults NAV_DLL_ACT=2 (RTL on GCS loss). With no QGC heartbeat
# commander reports: "Arming denied: Resolve system health failures first".
#
# Usage (inside the px4-ros2 container):
#   bash ~/packages/dev/scripts/px4_sitl_allow_offboard.sh
# then restart SITL: cd ~/Tools/PX4-Autopilot && make px4_sitl gz_x500
#
# Already-running SITL (pxh> prompt) — paste:
#   param set NAV_DLL_ACT 0
#   param set NAV_RCL_ACT 0
#   param set COM_RCL_EXCEPT 7
#   param set COM_RC_IN_MODE 4
#   param set COM_ARM_WO_GPS 1

set -euo pipefail

PX4="${PX4_DIR:-${HOME}/Tools/PX4-Autopilot}"
AIR="${PX4}/ROMFS/px4fmu_common/init.d-posix/airframes/4001_gz_x500"
MARKER="# drone-sim offboard sitl"

PARAMS="$(cat <<'EOF'
# drone-sim offboard sitl
param set-default NAV_DLL_ACT 0
param set-default NAV_RCL_ACT 0
param set-default COM_RCL_EXCEPT 7
param set-default COM_RC_IN_MODE 4
param set-default COM_ARM_WO_GPS 1
EOF
)"

RUNTIME="$(cat <<'EOF'
param set NAV_DLL_ACT 0
param set NAV_RCL_ACT 0
param set COM_RCL_EXCEPT 7
param set COM_RC_IN_MODE 4
param set COM_ARM_WO_GPS 1
EOF
)"

if [[ ! -d "${PX4}" ]]; then
  echo "PX4 tree not found at ${PX4}" >&2
  exit 1
fi

if [[ -f "${AIR}" ]]; then
  if grep -q "${MARKER}" "${AIR}"; then
    echo "Already patched: ${AIR}"
  else
    printf '\n%s\n' "${PARAMS}" >> "${AIR}"
    echo "Patched airframe: ${AIR}"
  fi
else
  echo "Airframe not found (ok if PX4 version uses a different name): ${AIR}" >&2
fi

# Sourced on SITL boot when present (no full ROMFS rebuild required next run).
for extras in \
  "${PX4}/build/px4_sitl_default/rootfs/extras.txt" \
  "${PX4}/build/px4_sitl_default/rootfs/fs/microsd/etc/extras.txt"
do
  mkdir -p "$(dirname "${extras}")"
  printf '%s\n' "${RUNTIME}" > "${extras}"
  echo "Wrote ${extras}"
done

echo "Done. Restart SITL (make px4_sitl gz_x500) or, in pxh>, paste:"
echo "${RUNTIME}"
