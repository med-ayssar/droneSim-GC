{ pkgs }:

{
  package = pkgs.stdenv.mkDerivation {
    pname = "px4";
    version = "main";

    src = pkgs.fetchgit {
      url = "https://github.com/PX4/PX4-Autopilot.git";
      rev= "refs/heads/main";
      hash = "sha256-hPLLwJ8lc9yx2ROYHY5kn6IwCYEhlA+Qfmw+d3yhtF4=";
      fetchSubmodules = true;
    };

    nativeBuildInputs = with pkgs; [
      gcc
      gnumake
      cmake
      ninja
      python3
      git
      bc
      perl
      which
      file
   (pkgs.python3.withPackages (ps: [
    ps.kconfiglib
    ps.jinja2
    ps.pyserial
    ps.numpy
    ps.packaging
    ps.pyyaml
    ps.empy
            pkgs.gnumake

  ]))    unzip
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
