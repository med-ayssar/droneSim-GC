{ pkgs }:

{

  package = pkgs.stdenv.mkDerivation {

    pname = "px4-msgs";

    version = "main";


    src = pkgs.fetchgit {
      url = "https://github.com/PX4/px4_msgs.git";
      rev= "refs/heads/main";
      hash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    };


    nativeBuildInputs = [
      pkgs.colcon
      pkgs.cmake
      pkgs.python3
      
      (pkgs.python3.withPackages (ps: [
        ps.setuptools
        ps.packaging
        ps.pyyaml
        ps.empy
      ]))

    ];


    buildPhase = ''
      source ${pkgs.rosPackages.humble.ros-core}/setup.bash

      colcon build \
        --symlink-install
    '';


    installPhase = ''
      mkdir -p $out

      cp -r install $out/
    '';

  };

}
