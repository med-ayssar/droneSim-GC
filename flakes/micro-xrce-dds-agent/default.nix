{ pkgs }:

{

  package = pkgs.stdenv.mkDerivation {

    pname = "micro-xrce-dds-agent";

    version = "main";


    src = pkgs.fetchgit {
      url = "https://github.com/eProsima/Micro-XRCE-DDS-Agent.git";
      rev = "v2.4.3";
      # hash = "sha256-nBJ+WuoZhB3+/NiYAH/l1r0BK1aFzAUfGpyOKpWC1sg=";
      hash = "sha256-t2PZurWc8Kbkm3zFyNwHQea4Yj+zHWFXFqZ0E19km54=";
    };


    nativeBuildInputs = [
      pkgs.cmake
        pkgs.pkg-config
        pkgs.git
        pkgs.cacert
        pkgs.autoPatchelfHook

    ];


    buildInputs = [
      pkgs.asio
        pkgs.openssl
        pkgs.tinyxml-2
    ];

    SSL_CERT_FILE = "${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt";
    GIT_SSL_CAINFO = "${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt";
    # The libcurl backing this nixpkgs git honours CURL_CA_BUNDLE but ignores
    # GIT_SSL_CAINFO / http.sslCAInfo, so the superbuild's git clones fail TLS
    # verification without this. (Verified empirically: only CURL_CA_BUNDLE works.)
    CURL_CA_BUNDLE = "${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt";
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
  runHook preInstall

  mkdir -p $out/bin $out/lib

  # The Agent's superbuild disables the final install step
  # (INSTALL_COMMAND "" in cmake/SuperBuild.cmake), so the binary and its
  # shared libraries are left in the build tree. Collect them by hand:
  #   - MicroXRCEAgent + libmicroxrcedds_agent.so live in the build root
  #   - fastcdr / fastdds and friends live under temp_install/*/lib
  cp MicroXRCEAgent $out/bin/
  cp -a libmicroxrcedds_agent.so* $out/lib/
  find temp_install -type f \( -name '*.so' -o -name '*.so.*' \) \
    -exec cp -a {} $out/lib/ \;

  runHook postInstall
  '';

  };

}
