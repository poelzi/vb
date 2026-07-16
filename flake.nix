{
  description = "voxel.blue — DJ site (Hugo, content synced from Mixcloud)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        version = builtins.substring 0 8 (self.lastModifiedDate or self.lastModified or "19700101");

        # Production build. Fully offline & sandbox-safe: content syncing
        # (Mixcloud API) happens separately via `nix run .#sync`, which
        # writes content/ + static/ files that get committed.
        site = pkgs.stdenvNoCC.mkDerivation {
          pname = "voxel-blue";
          inherit version;

          src = ./.;
          nativeBuildInputs = [ pkgs.hugo ];

          buildPhase = ''
            runHook preBuild
            export HOME="$TMPDIR"
            hugo --gc -d public
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            mkdir -p "$out"
            cp -r public/. "$out"/
            runHook postInstall
          '';
        };

        # Pull new mixes from the Mixcloud API into content/ (needs network —
        # run from a checkout, then review & commit the generated files).
        sync = pkgs.writeShellApplication {
          name = "voxel-blue-sync";
          runtimeInputs = [ pkgs.python3 ];
          text = ''
            python3 sync.py "$@"
          '';
        };

        # Local dev server.
        dev = pkgs.writeShellApplication {
          name = "voxel-blue-dev";
          runtimeInputs = [ pkgs.hugo ];
          text = ''
            hugo server --disableFastRender "$@"
          '';
        };
      in
      {
        packages.voxelBlue = site;
        packages.default = site;

        apps = {
          default = {
            type = "app";
            program = "${dev}/bin/voxel-blue-dev";
          };
          dev = {
            type = "app";
            program = "${dev}/bin/voxel-blue-dev";
          };
          sync = {
            type = "app";
            program = "${sync}/bin/voxel-blue-sync";
          };
        };

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            hugo
            python3
            just
          ];
        };

        # Makes the built site available as a package on a NixOS host.
        nixosModules.voxel-blue =
          { pkgs, ... }:
          {
            environment.systemPackages = [
              self.packages.${pkgs.stdenv.hostPlatform.system}.voxelBlue
            ];
          };
      }
    );
}
