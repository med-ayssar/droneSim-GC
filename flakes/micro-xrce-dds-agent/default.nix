{ pkgs }:

let
  inherit (pkgs) lib stdenv;
in
{

  package = stdenv.mkDerivation {

    pname = "micro-xrce-dds-agent";

    version = "2.4.3";


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
    ]
    # Linux: rewrite ELF RPATHs so the binary finds the bundled .so files.
    ++ lib.optionals stdenv.isLinux [ pkgs.autoPatchelfHook ]
    # macOS: rewrite Mach-O install names so the binary finds the bundled .dylib.
    ++ lib.optionals stdenv.isDarwin [ pkgs.fixDarwinDylibNames ];


    buildInputs = [
      pkgs.asio
      pkgs.openssl
      pkgs.tinyxml-2
    ];

    SSL_CERT_FILE = "${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt";
    # The superbuild git-clones its deps. The libcurl backing this nixpkgs git
    # honours CURL_CA_BUNDLE, but setting GIT_SSL_CAINFO (-> http.sslCAInfo ->
    # CURLOPT_CAINFO) actively BREAKS TLS verification here and overrides
    # CURL_CA_BUNDLE. So set only CURL_CA_BUNDLE and do NOT set GIT_SSL_CAINFO.
    CURL_CA_BUNDLE = "${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt";
    NIX_CFLAGS_COMPILE = "-Wno-error=deprecated-literal-operator";

    cmakeFlags = [
      # Superbuild: let the Agent's CMake fetch + build its own dependency
      # versions (fastcdr, fastdds, foonathan_memory, spdlog) into temp_install.
      "-DUAGENT_SUPERBUILD=ON"
      "-DUAGENT_BUILD_EXECUTABLE=ON"
    ] ++ lib.optionals stdenv.isDarwin [
      # SocketCAN is Linux-only.
      "-DUAGENT_SOCKETCAN_PROFILE=OFF"
    ];

    installPhase = ''
      runHook preInstall

      mkdir -p $out/bin $out/lib

      # The superbuild disables the final install step (INSTALL_COMMAND "" in
      # cmake/SuperBuild.cmake), so the Agent's own artifacts are left in the
      # build tree while its dependencies are fully installed under
      # temp_install. Assemble a complete, consumable prefix by hand.
      #
      # find (no shell globs) keeps this safe when a pattern matches nothing,
      # and the .so / .dylib split covers Linux and macOS.

      # 1. The MicroXRCEAgent executable.
      find . -type f -name MicroXRCEAgent -perm -u+x \
        -exec install -Dm755 {} $out/bin/MicroXRCEAgent \;

      # 2. The Agent library + any superbuild dependency shared libraries that
      #    were built shared (fastcdr, fastdds, ...).
      find . -type f \( -name '*.so' -o -name '*.so.*' -o -name '*.dylib' \) \
        -not -path '*/CMakeFiles/*' \
        -exec cp -a {} $out/lib/ \;

      # 3. The dependency install trees (headers, CMake config, static libs,
      #    tools) so downstream consumers can find_package() them later.
      if [ -d temp_install ]; then
        for dep in temp_install/*/; do
          [ -d "$dep" ] && cp -a "$dep". "$out"/
        done
      fi

      runHook postInstall
    '';

  };

}
