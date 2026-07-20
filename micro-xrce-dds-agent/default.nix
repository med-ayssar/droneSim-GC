{ pkgs }:

{

  package = pkgs.stdenv.mkDerivation {

    pname = "micro-xrce-dds-agent";

    version = "main";


    src = pkgs.fetchgit {
      url = "https://github.com/eProsima/Micro-XRCE-DDS-Agent.git";
      rev = "v2.4.3";
      hash = "sha256-nBJ+WuoZhB3+/NiYAH/l1r0BK1aFzAUfGpyOKpWC1sg=";
    };


    nativeBuildInputs = [
      pkgs.cmake
        pkgs.pkg-config
        pkgs.git
        pkgs.cacert

    ];


    buildInputs = [
      pkgs.asio
        pkgs.openssl
    ];

    SSL_CERT_FILE = "${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt";
    GIT_SSL_CAINFO = "${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt";
    NIX_CFLAGS_COMPILE = "-Wno-error=deprecated-literal-operator";
  cmakeFlags = [
    # disable CAN on non-Linux platforms
  ] ++ pkgs.lib.optionals pkgs.stdenv.isDarwin [
      "-DUAGENT_SOCKETCAN_PROFILE=OFF"
  ];

# buildPhase = ''
# mkdir build && \
# cd build && \
# cmake .. && \
# make -j"$(nproc)" && \
# make install
# '';
installPhase = ''
  mkdir -p $out/bin

  cp MicroXRCEAgent \
  $out/bin/
  '';

  };

}
