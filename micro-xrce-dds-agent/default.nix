{ pkgs }:

{

  package = pkgs.stdenv.mkDerivation {

    pname = "micro-xrce-dds-agent";

    version = "main";


    src = pkgs.fetchgit {
      url = "https://github.com/eProsima/Micro-XRCE-DDS-Agent.git";
      rev = "v3.0.1";
      hash = "sha256-nBJ+WuoZhB3+/NiYAH/l1r0BK1aFzAUfGpyOKpWC1sg=";
    };


    nativeBuildInputs = [
      pkgs.cmake
      pkgs.pkg-config
      pkgs.git
    ];


    buildInputs = [
      pkgs.asio
      pkgs.openssl
    ];


    buildPhase = ''
      mkdir build
      cd build

      cmake .. \
        -DCMAKE_BUILD_TYPE=Release

      make -j$NIX_BUILD_CORES
    '';


    installPhase = ''
      mkdir -p $out/bin

      cp MicroXRCEAgent \
        $out/bin/
    '';

  };

}
