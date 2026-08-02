# =============================================================================
# STAGE 1: Base ROS 2 + Desktop + KasmVNC
# =============================================================================

FROM ros:humble-ros-base-jammy AS base-env

ENV DEBIAN_FRONTEND=noninteractive
ENV ROS_DISTRO=humble
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV DISPLAY=:1

SHELL ["/bin/bash", "-o", "pipefail", "-c"]


RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        git \
        wget \
        sudo \
        build-essential \
        cmake \
        ninja-build \
        ccache \
        gnupg \
        lsb-release \
        python3-colcon-common-extensions \
        python3-pip \
        python3-setuptools \
        python3-wheel \
        python3.10-venv \
        xfce4 \
        xfce4-terminal \
        dbus-x11 \
        x11-xserver-utils \
        xterm \
        mesa-utils \
        libgl1-mesa-dri \
        libgl1-mesa-glx \
        ssl-cert \
    && rm -rf /var/lib/apt/lists/*



# =============================================================================
# Install Gazebo Harmonic
# =============================================================================

RUN wget https://packages.osrfoundation.org/gazebo.gpg \
        -O /usr/share/keyrings/pkgs-osrf-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/pkgs-osrf-archive-keyring.gpg] \
        http://packages.osrfoundation.org/gazebo/ubuntu-stable \
        $(lsb_release -cs) main" \
        > /etc/apt/sources.list.d/gazebo-stable.list \
    && apt-get update \
    && apt-get install -y gz-harmonic \
    && rm -rf /var/lib/apt/lists/*



# =============================================================================
# Install KasmVNC
# =============================================================================

RUN KASM_ARCH=$( \
        if [ "$(uname -m)" = "aarch64" ]; then \
            echo "arm64"; \
        else \
            echo "amd64"; \
        fi \
    ) \
    && wget \
      https://github.com/kasmtech/KasmVNC/releases/download/v1.3.1/kasmvncserver_jammy_1.3.1_${KASM_ARCH}.deb \
      -O /tmp/kasmvnc.deb \
    && apt-get update \
    && apt-get install -y /tmp/kasmvnc.deb \
    && rm -f /tmp/kasmvnc.deb \
    && rm -rf /var/lib/apt/lists/*



# =============================================================================
# PX4 User
# =============================================================================

ARG USERNAME=px4
ARG USER_UID=1000
ARG USER_GID=$USER_UID


RUN groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m $USERNAME \
    && echo "$USERNAME ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME \
    && usermod -aG sudo,ssl-cert,dialout $USERNAME



RUN mkdir -p /home/$USERNAME/.vnc \
    && chown -R $USERNAME:$USERNAME /home/$USERNAME/.vnc



# =============================================================================
# Clone repositories
# =============================================================================

FROM base-env AS repo-cloner


USER px4

WORKDIR /home/px4


RUN git clone \
    --recursive \
    --depth 1 \
    https://github.com/PX4/PX4-Autopilot.git \
    /home/px4/PX4-Autopilot


RUN mkdir -p /home/px4/ros2_ws/src \
    && git clone \
    https://github.com/PX4/px4_msgs.git \
    /home/px4/ros2_ws/src/px4_msgs



RUN git clone \
    -b v2.4.3 \
    https://github.com/eProsima/Micro-XRCE-DDS-Agent.git \
    /tmp/Micro-XRCE-DDS-Agent



# =============================================================================
# Dependencies
# =============================================================================

FROM base-env AS deps


RUN apt-get update && apt-get install -y --no-install-recommends \
        libasio-dev \
        libtinyxml2-dev \
        libssl-dev \
        libopencv-dev \
        ros-humble-rmw-fastrtps-cpp \
        ros-humble-rosidl-default-generators \
        ros-humble-rosidl-default-runtime \
        python3-lark \
    && pip3 install \
        empy==3.3.4 \
        pyros-genmsg \
        lark \
    && rm -rf /var/lib/apt/lists/*

 USER root

# Dependencies required by the AppImage
# ===================ge==========================================================
# Build Micro XRCE DDS Agent
# =============================================================================

FROM deps AS build-dds


COPY --from=repo-cloner \
     /tmp/Micro-XRCE-DDS-Agent \
     /tmp/Micro-XRCE-DDS-Agent


WORKDIR /tmp/Micro-XRCE-DDS-Agent/build


RUN cmake .. \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX=/usr/local \
    && make -j$(nproc) \
    && make install



# =============================================================================
# Build PX4
# =============================================================================

FROM deps AS build-px4


USER px4


COPY --chown=px4:px4 \
     --from=repo-cloner \
     /home/px4/PX4-Autopilot \
     /home/px4/PX4-Autopilot


WORKDIR /home/px4/PX4-Autopilot


RUN python3 -m venv .venv \
    && source .venv/bin/activate \
    && pip install -r Tools/setup/requirements.txt \
    && make px4_sitl_default



# =============================================================================
# Final Image
# =============================================================================

FROM deps AS final


USER root


COPY --from=build-dds \
     /usr/local \
     /usr/local


RUN ldconfig



COPY --chown=px4:px4 \
     --from=build-px4 \
     /home/px4/PX4-Autopilot \
     /home/px4/PX4-Autopilot


COPY --chown=px4:px4 \
     --from=repo-cloner \
     /home/px4/ros2_ws \
     /home/px4/ros2_ws



# =============================================================================
# KasmVNC desktop startup
# =============================================================================

USER root
RUN apt-get update && apt-get install -y --no-install-recommends expect \
    && rm -rf /var/lib/apt/lists/*
# -------------------------------------------------
# 1. Create KasmVNC user + config (non-interactive)
# -------------------------------------------------
RUN cat > /tmp/create_kasm_user.exp <<'EOF'
#!/usr/bin/expect -f

spawn su - px4 -c "vncpasswd -u px4 -w -r"

expect "Password:"
send "px4px4\r"

expect "Verify:"
send "px4px4\r"

expect eof
EOF

RUN chmod +x /tmp/create_kasm_user.exp && \
    /tmp/create_kasm_user.exp && \
    rm /tmp/create_kasm_user.exp

RUN mkdir -p /home/px4/.vnc && \
    cat <<'EOF' > /home/px4/.vnc/kasmvnc.yaml
network:
  protocol: http
  websocket_port: 8443
  ssl:
    require_ssl: false

logging:
  level: 30
desktop:
  resolution:
    width: 1600
    height: 900

EOF

RUN chown -R px4:px4 /home/px4/.vnc
# -------------------------------------------------
# 2. xstartup for XFCE
# -------------------------------------------------
RUN cat <<'EOF' > /home/px4/.vnc/xstartup
#!/bin/bash
export DISPLAY=:1
export XDG_CURRENT_DESKTOP=XFCE
export XDG_SESSION_DESKTOP=XFCE
unset SESSION_MANAGER
unset DBUS_SESSION_BUS_ADDRESS
exec dbus-launch --exit-with-session startxfce4
EOF

RUN chmod +x /home/px4/.vnc/xstartup && \
    chown -R px4:px4 /home/px4/.vnc

# -------------------------------------------------
# 3. Entrypoint (completely non-interactive)
# -------------------------------------------------
RUN cat <<'EOF' > /usr/local/bin/entrypoint.sh
#!/bin/bash
set -e

export DISPLAY=:1
export HOME=/home/px4

# Create .Xauthority if missing
touch /home/px4/.Xauthority
chmod 600 /home/px4/.Xauthority


# Clean old locks
rm -f /tmp/.X1-lock
rm -rf /tmp/.X11-unix/X1
mkdir -p /tmp/.X11-unix
chmod 1777 /tmp/.X11-unix

# Start KasmVNC
kasmvncserver :1 \
    -select-de xfce \
    -websocketport 8443 \
    -disableBasicAuth \
    -sslOnly 0 \
    -geometry 1600x900 \
    -depth 24&

sleep 4
exec "$@"
EOF

RUN chmod +x /usr/local/bin/entrypoint.sh

USER px4
WORKDIR /home/px4/ros2_ws


RUN source /opt/ros/humble/setup.bash \
    && colcon build --symlink-install \
       --packages-select px4_msgs



RUN echo "source /opt/ros/humble/setup.bash" >> /home/px4/.bashrc \
    && echo "source /home/px4/ros2_ws/install/setup.bash" >> /home/px4/.bashrc \
    && echo "export DISPLAY=:1" >> /home/px4/.bashrc



WORKDIR /home/px4


EXPOSE 8443
EXPOSE 14540/udp
EXPOSE 14550/udp
EXPOSE 8888/udp


ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

CMD ["bash"]
