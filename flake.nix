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
            ];

            config.allowUnfree = true;

          };


        rosPackages =
          pkgs.rosPackages.humble.overrideScope
            (final: prev: {

              foonathan-memory-vendor =
                prev.foonathan-memory-vendor.overrideAttrs
                  (old: {

                    NIX_CFLAGS_COMPILE =
                      (old.NIX_CFLAGS_COMPILE or "")
                      + " -Wno-error=deprecated-literal-operator";

                  });

            });



        ros2 =
          with rosPackages;
          buildEnv {

            underlay = true;

            paths = [

              ros-core
              ros-base
              colcon

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
