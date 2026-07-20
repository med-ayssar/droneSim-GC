{ pkgs }:

{
  package = pkgs.stdenv.mkDerivation {
    pname = "px4";
    version = "main";

    src = pkgs.fetchgit {
      url = "https://github.com/PX4/PX4-Autopilot.git";
      rev= "refs/heads/main";
      hash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      fetchSubmodules = true;
    };

    nativeBuildInputs = with pkgs; [
      gcc
      gnumake
      cmake
      ninja
      python3
      python3Packages.jinja2
      python3Packages.pyserial
      python3Packages.numpy
      python3Packages.packaging
      git
      bc
      perl
      which
      file
      unzip
    ];

    buildPhase = ''
      make px4_sitl_default
    '';

    installPhase = ''
      mkdir -p $out/bin
      cp build/px4_sitl_default/bin/px4 $out/bin/
    '';
  };
}
