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
# Create User
# =============================================================================
ARG USERNAME=drone
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
# Clone repositories into /home/$USERNAME/ros/deps/src
# =============================================================================
FROM base-env AS repo-cloner
ARG USERNAME=drone

USER $USERNAME
WORKDIR /home/$USERNAME

RUN mkdir -p /home/$USERNAME/ros/deps/src \
    && git clone \
        --recursive \
        --depth 1 \
        https://github.com/PX4/PX4-Autopilot.git \
        /home/$USERNAME/ros/deps/src/PX4-Autopilot \
    && git clone \
        https://github.com/PX4/px4_msgs.git \
        /home/$USERNAME/ros/deps/src/px4_msgs \
    && git clone \
        -b v2.4.3 \
        https://github.com/eProsima/Micro-XRCE-DDS-Agent.git \
        /home/$USERNAME/ros/deps/src/Micro-XRCE-DDS-Agent

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

# =============================================================================
# Build Micro XRCE DDS Agent
# =============================================================================
FROM deps AS build-dds
ARG USERNAME=drone

COPY --from=repo-cloner \
     /home/$USERNAME/ros/deps/src/Micro-XRCE-DDS-Agent \
     /home/$USERNAME/ros/deps/src/Micro-XRCE-DDS-Agent

WORKDIR /home/$USERNAME/ros/deps/src/Micro-XRCE-DDS-Agent/build
RUN cmake .. \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX=/usr/local \
    && make -j$(nproc) \
    && make install

# =============================================================================
# Build PX4
# =============================================================================
FROM deps AS build-px4
ARG USERNAME=drone

USER $USERNAME
COPY --chown=$USERNAME:$USERNAME \
     --from=repo-cloner \
     /home/$USERNAME/ros/deps/src/PX4-Autopilot \
     /home/$USERNAME/ros/deps/src/PX4-Autopilot

WORKDIR /home/$USERNAME/ros/deps/src/PX4-Autopilot
RUN python3 -m venv .venv \
    && source .venv/bin/activate \
    && pip install -r Tools/setup/requirements.txt \
    && make px4_sitl_default

# =============================================================================
# Final Image
# =============================================================================
FROM deps AS final
ARG USERNAME=drone

USER root

COPY --from=build-dds \
     /usr/local \
     /usr/local
RUN ldconfig

# Copy compiled PX4 build back
COPY --chown=$USERNAME:$USERNAME \
     --from=build-px4 \
     /home/$USERNAME/ros/deps/src/PX4-Autopilot \
     /home/$USERNAME/ros/deps/src/PX4-Autopilot

# Copy all original clones into final image
COPY --chown=$USERNAME:$USERNAME \
     --from=repo-cloner \
     /home/$USERNAME/ros/deps/src \
     /home/$USERNAME/ros/deps/src

# =============================================================================
# KasmVNC desktop startup
# =============================================================================
RUN apt-get update && apt-get install -y --no-install-recommends expect \
    && rm -rf /var/lib/apt/lists/*

# -------------------------------------------------
# 1. Create KasmVNC user + config (non-interactive)
# -------------------------------------------------
RUN cat > /tmp/create_kasm_user.exp <<EOF
#!/usr/bin/expect -f
spawn su - $USERNAME -c "vncpasswd -u $USERNAME -w -r"
expect "Password:"
send "$USERNAME\r"
expect "Verify:"
send "$USERNAME\r"
expect eof
EOF

RUN chmod +x /tmp/create_kasm_user.exp && \
    /tmp/create_kasm_user.exp && \
    rm /tmp/create_kasm_user.exp

RUN mkdir -p /home/$USERNAME/.vnc && \
    cat <<EOF > /home/$USERNAME/.vnc/kasmvnc.yaml
network:
  protocol: http
  interface: 0.0.0.0
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

# -------------------------------------------------
# 2. xstartup for XFCE
# -------------------------------------------------
RUN cat <<'EOF' > /home/$USERNAME/.vnc/xstartup
#!/bin/bash
export DISPLAY=:1
export XDG_CURRENT_DESKTOP=XFCE
export XDG_SESSION_DESKTOP=XFCE
unset SESSION_MANAGER
unset DBUS_SESSION_BUS_ADDRESS
exec dbus-launch --exit-with-session startxfce4
EOF

RUN chmod +x /home/$USERNAME/.vnc/xstartup && \
    chown -R $USERNAME:$USERNAME /home/$USERNAME/.vnc

# -------------------------------------------------
# 3. Entrypoint script dynamic resolution
# -------------------------------------------------
RUN cat <<EOF > /usr/local/bin/entrypoint.sh
#!/bin/bash
set -e
export DISPLAY=:1
export HOME=/home/$USERNAME

# Create .Xauthority if missing
touch /home/$USERNAME/.Xauthority
chmod 600 /home/$USERNAME/.Xauthority

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
    -depth 24 &
sleep 4
exec "\$@"
EOF

RUN chmod +x /usr/local/bin/entrypoint.sh

# =============================================================================
# Build ROS 2 Workspace
# =============================================================================
USER $USERNAME
WORKDIR /home/$USERNAME/ros/deps
RUN source /opt/ros/humble/setup.bash \
    && colcon build --symlink-install --packages-select px4_msgs

RUN echo "source /opt/ros/humble/setup.bash" >> /home/$USERNAME/.bashrc \
    && echo "source /home/$USERNAME/ros/deps/install/setup.bash" >> /home/$USERNAME/.bashrc \
    && echo "export DISPLAY=:1" >> /home/$USERNAME/.bashrc

WORKDIR /home/$USERNAME
EXPOSE 8443
EXPOSE 14540/udp
EXPOSE 14550/udp
EXPOSE 8888/udp

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["bash"]
