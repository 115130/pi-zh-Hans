{
  description = "pi coding agent - cross-compilation environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # JavaScript runtime & package manager
            bun
            nodejs-slim
            nodePackages.npm

            # Build tools
            zip
            gzip

            # Utilities
            gnused
            gnutar
            findutils
            coreutils
          ];

          shellHook = ''
            echo "=== pi build environment ==="
            echo "bun: $(bun --version)"
            echo "node: $(node --version)"
            echo "npm: $(npm --version)"
          '';
        };
      });
}
