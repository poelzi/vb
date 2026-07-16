# voxel.blue tasks

# Production build (sandboxed, offline) -> ./result
default:
    nix build -L .#voxelBlue

# Pull new mixes from Mixcloud into content/ (needs network; review & commit)
sync:
    nix run .#sync

# Local dev server on http://localhost:1313
dev:
    nix run .#dev
