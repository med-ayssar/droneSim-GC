{
  description = "PX4 ROS2 development environment";
  inputs = {
    nix-ros-overlay.url =
      "github:lopsided98/nix-ros-overlay/master";
    nixpkgs.follows =
      "nix-ros-overlay/nixpkgs";
  };
  outputs =
    { self, nix-ros-overlay, nixpkgs }:
    nix-ros-overlay.inputs.flake-utils.lib.eachDefaultSystem
    (system:
      let
        pkgs =
          import nixpkgs {
            inherit system;
            overlays = [
              nix-ros-overlay.overlays.default
              # Patch foonathan-memory-vendor globally so every consumer
              # (ros2 env, px4-msgs, px4-autopilot, ...) shares the fix.
              (final: prev: {
                rosPackages = prev.rosPackages // {
                  humble = prev.rosPackages.humble.overrideScope
                    (rosFinal: rosPrev: {
                      foonathan-memory-vendor =
                        rosPrev.foonathan-memory-vendor.overrideAttrs
                        (old: {
                          NIX_CFLAGS_COMPILE =
                            (old.NIX_CFLAGS_COMPILE or "")
                            + " -Wno-error=deprecated-literal-operator";
                        });
                    });
                };
              })
            ];
            config.allowUnfree = true;
          };
        ros2 =
          with pkgs.rosPackages.humble;
          buildEnv {
            underlay = true;
            paths = [
              # ROS 2 core
              ros-core
              ros-base
              # Build tools
              colcon
              # C++ ROS 2 client library
              rclcpp
              # Python client library (optional but useful)
              rclpy
              # ROS messages
              std-msgs
              geometry-msgs
              sensor-msgs
              nav-msgs
              # TF support
              tf2
              tf2-ros
              # DDS middleware
              rmw-fastrtps-cpp
              rmw-fastrtps-dynamic-cpp
              # ROS DDS common interfaces
              rosidl-default-generators
              rosidl-typesupport-c
              rosidl-typesupport-cpp
              # Lifecycle nodes (common in PX4 integrations)
              rclcpp-lifecycle
            ];
          };
        micro-xrce-dds-agent =
          import ./micro-xrce-dds-agent {
            inherit pkgs;
          };
        px4-msgs =
          import ./px4-msgs {
            inherit pkgs;
          };
        px4-autopilot =
          import ./px4-autopilot {
            inherit pkgs;
          };
      in {
        packages = {
          micro-xrce-dds-agent =
            micro-xrce-dds-agent.package;
          px4-msgs =
            px4-msgs.package;
          px4 =
            px4-autopilot.package;
          default =
            pkgs.symlinkJoin {
              name = "px4-stack";
              paths = [
                micro-xrce-dds-agent.package
                px4-msgs.package
                px4-autopilot.package
              ];
            };
        };
        devShells.default =
          pkgs.mkShell {
            name =
              "PX4 ROS2 Humble development environment";
            packages = [
              ros2
              micro-xrce-dds-agent.package
              px4-msgs.package
              px4-autopilot.package
              pkgs.colcon
              pkgs.git
              pkgs.tmux
            ];
            shellHook = ''
              echo ""
              echo "PX4 ROS2 Humble environment"
              echo ""
              export ROS_DOMAIN_ID=0
              alias start-agent="
              MicroXRCEAgent udp4 -p 8888
              "
              alias start-px4="
              px4
              "
              '';
          };
      });
  nixConfig = {
    extra-substituters = [
      "https://ros.cachix.org"
    ];
    extra-trusted-public-keys = [
      "ros.cachix.org-1:dSyZxI8geDCJrwgvCOHDoAfOm5sV1wCPjBkKL+38Rvo="
    ];
  };
}
