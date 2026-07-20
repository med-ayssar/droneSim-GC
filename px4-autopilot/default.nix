{ pkgs }:

let
  # PyPI `pyros-genmsg` -> importable module `genmsg`, required by PX4's
  # message/code generation. Not packaged in nixpkgs, so build it here.
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

  # PX4 uses the empy 3.x API (em.RAW_OPT etc.), which was removed in empy 4.x.
  # nixpkgs ships 4.x, so pin 3.3.4 here.
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

  # Single Python interpreter carrying every module PX4's build imports.
  pythonEnv = pkgs.python3.withPackages (ps: [
    pyros-genmsg   # genmsg
    empy3          # empy 3.3.4 (NOT nixpkgs' 4.x)
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
in
{
  package = pkgs.stdenv.mkDerivation {
    pname = "px4";
    version = "main";

    src = pkgs.fetchgit {
      url = "https://github.com/PX4/PX4-Autopilot.git";
      rev = "refs/heads/main";
      hash = "sha256-hPLLwJ8lc9yx2ROYHY5kn6IwCYEhlA+Qfmw+d3yhtF4=";
      fetchSubmodules = true;
    };

    nativeBuildInputs = with pkgs; [
      gcc
      gnumake
      cmake
      ninja
      pythonEnv   # replaces bare python3 + the inline withPackages
      git
      bc
      perl
      which
      file
      unzip
    ];

    # cmake is only a dependency of PX4's own Makefile-driven build; do NOT let
    # the cmake setup-hook run a premature configurePhase (it fires before
    # buildPhase, i.e. before the git repo below exists -> "not a git repository").
    dontUseCmakeConfigure = true;

    buildPhase = ''
      export PX4_ZENOH=OFF
      export HOME=$TMPDIR

      # fetchgit strips .git, but PX4's version generation
      # (src/lib/version/CMakeLists.txt) shells out to `git describe`.
      # Recreate a minimal repo with a version tag so it resolves a version.
      git init -q
      git config user.email nix@localhost
      git config user.name  nix
      git add -A
      git commit -qm "nix build" >/dev/null
      git tag v1.15.0

      make px4_sitl_default
    '';

    installPhase = ''
      mkdir -p $out/bin
      cp build/px4_sitl_default/bin/px4 $out/bin/
    '';
  };
}
