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
              # (ros2 env, px4-msgs, ...) shares the fix.
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
              ros-core
              ros-base
              colcon
              rclcpp
              rclpy
              std-msgs
              geometry-msgs
              sensor-msgs
              nav-msgs
              tf2
              tf2-ros
              rmw-fastrtps-cpp
              rmw-fastrtps-dynamic-cpp
              rosidl-default-generators
              rosidl-typesupport-c
              rosidl-typesupport-cpp
              rclcpp-lifecycle
            ];
          };

        # --- PX4 code-generation Python deps -------------------------------
        # PyPI `pyros-genmsg` -> module `genmsg`; not in nixpkgs.
        pyros-genmsg = pkgs.python3Packages.buildPythonPackage rec {
          pname = "pyros-genmsg";
          version = "0.5.8";
          format = "setuptools";
          src = pkgs.fetchurl {
            url = "https://files.pythonhosted.org/packages/f8/ca/96c243af4feb684bbb0f4126e6b3d2d330cc935e6a3c31fb1d7194ef4729/pyros_genmsg-0.5.8.tar.gz";
            hash = "sha256-PBywfZxA+eYIcph+7Jg6rFvbWSDqd5gDA/scRsMI9Hg=";
          };
          doCheck = false;
        };
        # PX4 needs the empy 3.x API (em.RAW_OPT); nixpkgs ships 4.x.
        empy3 = pkgs.python3Packages.buildPythonPackage rec {
          pname = "empy";
          version = "3.3.4";
          format = "setuptools";
          src = pkgs.fetchurl {
            url = "https://files.pythonhosted.org/packages/3b/95/88ed47cb7da88569a78b7d6fb9420298df7e99997810c844a924d96d3c08/empy-3.3.4.tar.gz";
            hash = "sha256-c6xJeFtgFHnfTqGKfHm8EwSop8NMArlHLPEgauiPAbM=";
          };
          doCheck = false;
        };
        px4PythonEnv = pkgs.python3.withPackages (ps: [
          pyros-genmsg
          empy3
          ps.jinja2
          ps.kconfiglib
          ps.numpy
          ps.packaging
          ps.pyserial
          ps.pyyaml
          ps.toml
          ps.jsonschema
          ps.setuptools
        ]);

        micro-xrce-dds-agent =
          import ./micro-xrce-dds-agent { inherit pkgs; };
        px4-msgs =
          import ./px4-msgs { inherit pkgs; };
      in {
        packages = {
          micro-xrce-dds-agent = micro-xrce-dds-agent.package;
          px4-msgs = px4-msgs.package;
          # NOTE: no hermetic `px4` package. PX4 SITL with Gazebo Harmonic
          # cannot be built purely (Gazebo is not packaged in nixpkgs); build
          # it in `nix develop .#px4` against host-installed gz. See README.
          default =
            pkgs.symlinkJoin {
              name = "px4-ros2-stack";
              paths = [
                micro-xrce-dds-agent.package
                px4-msgs.package
              ];
            };
        };

        # ROS 2 / micro-XRCE side (hermetic).
        devShells.default =
          pkgs.mkShell {
            name = "PX4 ROS2 Humble development environment";
            packages = [
              ros2
              micro-xrce-dds-agent.package
              px4-msgs.package
              pkgs.colcon
              pkgs.git
              pkgs.tmux
            ];
            shellHook = ''
              echo ""
              echo "PX4 ROS2 Humble environment"
              echo "  start-agent  -> MicroXRCEAgent udp4 -p 8888"
              echo "  PX4 build/run: use 'nix develop .#px4'"
              echo ""
              export ROS_DOMAIN_ID=0
              alias start-agent="MicroXRCEAgent udp4 -p 8888"
            '';
          };

        # Hybrid PX4 + Gazebo shell.
        # mkShellNoCC => the HOST g++/glibc compiles PX4, so it is ABI-compatible
        # with the apt-installed Gazebo Harmonic libs it links against. Nix only
        # supplies ABI-neutral tools: the pinned Python codegen env + cmake/ninja.
        devShells.px4 =
          pkgs.mkShellNoCC {
            name = "px4-sitl-gz-hybrid";
            packages = [
              px4PythonEnv
              pkgs.cmake
              pkgs.ninja
              pkgs.gnumake
              pkgs.git
            ];
            shellHook = ''
              # Let cmake discover the host (apt) Gazebo Harmonic install.
              export CMAKE_PREFIX_PATH="/usr''${CMAKE_PREFIX_PATH:+:$CMAKE_PREFIX_PATH}"
              export PKG_CONFIG_PATH="/usr/lib/x86_64-linux-gnu/pkgconfig''${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
              echo ""
              echo "PX4 hybrid SITL shell: host g++ + host Gazebo Harmonic + nix python/cmake"
              echo "  prereqs (host, one-time): gz-harmonic + build-essential via apt"
              echo "  then, in your PX4-Autopilot checkout:"
              echo "    make px4_sitl gz_x500"
              echo ""
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
