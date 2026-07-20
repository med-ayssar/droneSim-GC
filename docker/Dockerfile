# =============================================================================
# STAGE 1: Base ROS 2 + Desktop + KasmVNC + SSH
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
        openssh-server \
    && rm -rf /var/lib/apt/lists/*
COPY cert/zscaler.crt /usr/local/share/ca-certificates/zscaler.crt

RUN update-ca-certificates
# RUN --mount=type=secret,id=zscaler,target=/usr/local/share/ca-certificates/zscaler.crt \
#     update-ca-certificates

ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
ENV GIT_SSL_CAINFO=/etc/ssl/certs/ca-certificates.crt

ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
ENV SSL_CERT_DIR=/etc/ssl/certs
ENV GIT_SSL_CAINFO=/etc/ssl/certs/ca-certificates.crt

#
# Configure SSH server directory and options
RUN mkdir -p /var/run/sshd \
    && sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config \
    && sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config

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
    && wget --no-check-certificate \
      https://github.com/kasmtech/KasmVNC/releases/download/v1.3.1/kasmvncserver_jammy_1.3.1_${KASM_ARCH}.deb \
      -O /tmp/kasmvnc.deb \
    && apt-get update \
    && apt-get install -y /tmp/kasmvnc.deb \
    && rm -f /tmp/kasmvnc.deb \
    && rm -rf /var/lib/apt/lists/*
# =============================================================================
# PX4 User
# =============================================================================
ARG USERNAME=drone
ARG USER_UID=1000
ARG USER_GID=$USER_UID
RUN groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m -s /bin/bash $USERNAME \
    && echo "$USERNAME ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME \
    && usermod -aG sudo,ssl-cert,dialout $USERNAME \
    && echo "$USERNAME:$USERNAME" | chpasswd
RUN mkdir -p /home/$USERNAME/.vnc \
    && chown -R $USERNAME:$USERNAME /home/$USERNAME/.vnc
# =============================================================================
# Clone repositories
# =============================================================================
FROM base-env AS repo-cloner
ARG USERNAME=drone
USER $USERNAME
WORKDIR /home/$USERNAME

RUN git clone \
    --recursive \
    --depth 1 \
    https://github.com/PX4/PX4-Autopilot.git \
    /home/$USERNAME/ros/deps/src/PX4-Autopilot
RUN mkdir -p /home/$USERNAME/ros/deps/src \
    && git clone \
    https://github.com/PX4/px4_msgs.git \
    /home/$USERNAME/ros2/deps/src/px4_msgs
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
# =============================================================================
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
COPY --chown=$USERNAME:$USERNAME \
     --from=build-px4 \
     /home/$USERNAME/ros/deps/src/PX4-Autopilot \
     /home/$USERNAME/ros/deps/src/PX4-Autopilot
COPY --chown=$USERNAME:$USERNAME \
     --from=repo-cloner \
     /home/$USERNAME/ros/deps/src \
     /home/$USERNAME/ros/deps/src
# =============================================================================
# KasmVNC desktop startup
# =============================================================================

USER root
RUN apt-get update && apt-get install -y --no-install-recommends expect \
    && rm -rf /var/lib/apt/lists/*

USER $USERNAME
# Generate keys and config at container build time
RUN mkdir -p /home/$USERNAME/.ssh/host_keys \
    && ssh-keygen -f /home/$USERNAME/.ssh/host_keys/ssh_host_rsa_key -N "" -t rsa \
    && ssh-keygen -f /home/$USERNAME/.ssh/host_keys/ssh_host_ed25519_key -N "" -t ed25519 \
    && chown -R $USERNAME:$USERNAME /home/$USERNAME/.ssh
# 2. Write custom sshd_config file to the user's home directory
RUN cat <<EOF > /home/$USERNAME/.ssh/sshd_config
Port 22
HostKey /home/$USERNAME/.ssh/host_keys/ssh_host_rsa_key
HostKey /home/$USERNAME/.ssh/host_keys/ssh_host_ed25519_key
AuthorizedKeysFile /home/$USERNAME/.ssh/authorized_keys
UsePAM no
StrictModes no
PasswordAuthentication yes
PidFile /home/$USERNAME/.ssh/sshd.pid
EOF

USER root
# -------------------------------------------------
# 1. Create KasmVNC user + config (non-interactive)
# -------------------------------------------------
RUN cat > /tmp/create_kasm_user.exp <<EOF
#!/usr/bin/expect -f

spawn su - $USERNAME -c "vncpasswd -u $USERNAME -w -r"

expect "Password:"
send "password\r"

expect "Verify:"
send "password\r"

expect eof
EOF

RUN chmod +x /tmp/create_kasm_user.exp && \
    /tmp/create_kasm_user.exp && \
    cat /tmp/create_kasm_user.exp && \
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

RUN chown -R $USERNAME:$USERNAME /home/$USERNAME/.vnc

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
# 3. Entrypoint (completely non-interactive with SSH)
# -------------------------------------------------
RUN cat <<EOF > /usr/local/bin/entrypoint.sh
#!/bin/bash
set -e

# Start SSH daemon in the background
#ssh-keygen -A
/usr/sbin/sshd -f /home/$USERNAME/.ssh/sshd_config

export DISPLAY=:1
export HOME=/home/$USERNAME

# Create .Xauthority if missing
touch /home/$USERNAME/.Xauthority
chmod 600 /home/$USERNAME/.Xauthority

# Start KasmVNC — it creates /tmp/.X11-unix with correct permissions itself
kasmvncserver :1 \
    -select-de xfce \
    -websocketport 8443 \
    -disableBasicAuth \
    -sslOnly 0 \
    -geometry 1600x900 \
    -depth 24 &

sleep 4

# Symlink WSL display socket into .X11-unix so DISPLAY=:0 works alongside :1
ln -sf /tmp/wsl-X0 /tmp/.X11-unix/X0

exec "\$@"
EOF

RUN chmod +x /usr/local/bin/entrypoint.sh


USER $USERNAME
WORKDIR /home/$USERNAME/ros2_ws
RUN source /opt/ros/humble/setup.bash \
    && colcon build --symlink-install \
       --packages-select px4_msgs
RUN echo "source /opt/ros/humble/setup.bash" >> /home/$USERNAME/.bashrc \
    && echo "source /home/$USERNAME/ros2_ws/install/setup.bash" >> /home/$USERNAME/.bashrc \
    && echo "export DISPLAY=:1  # KasmVNC; use 'export DISPLAY=:0' for WSL/Windows display" >> /home/$USERNAME/.bashrc \
    && echo "if [ -f ~/.bashrc ]; then . ~/.bashrc; fi" >> /home/$USERNAME/.profile
WORKDIR /home
EXPOSE 22
EXPOSE 8443
EXPOSE 14540/udp
EXPOSE 14550/udp
EXPOSE 8888/udp
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["bash"]
