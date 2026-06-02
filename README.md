# Prockiller

A desktop app for Windows that lists active network connections and lets you kill
the process behind any one of them with a single click. Built with Rust and
[iced](https://iced.rs).

![Prockiller screenshot](./screenshot.png)

## Features

- **Live connection table** — protocol, local address, foreign address, state, PID,
  and process name for every active connection (backed by `netstat` / `tasklist`).
- **One-click kill** — terminate the process holding a port without dropping to a
  terminal.
- **Filter** — narrow the list by port, process, PID, address, or state as you type.
- **Sortable, resizable columns** — click a header to sort; drag the dividers to
  resize.
- **Auto-refresh** — the table updates every 5 seconds (toggleable).
- **Update check** — notifies you when a newer release is available.

## Download

Grab the latest `prockiller-iced-vX.Y.Z-windows-x64.exe` from the
[Releases](https://github.com/walterlow/prockiller/releases) page. It's a single
executable — no install required.

## Build from source

Install Rust:

```powershell
winget install Rustlang.Rustup
```

Then build:

```powershell
cargo build --release
```

Output: `target/release/prockiller-iced.exe`

Or use the helper script, which builds and stages a versioned, checksummed
artifact in `dist/` (mirrors the release pipeline):

```powershell
.\build-release.ps1
```

## Releases (CI/CD)

Releases are built by GitHub Actions ([`.github/workflows/release.yml`](.github/workflows/release.yml)).

To cut a release:

1. Bump `version` in `Cargo.toml`.
2. Commit, then tag and push:

   ```powershell
   git tag v1.0.4
   git push origin v1.0.4
   ```

The workflow first verifies the pushed tag matches the `version` in `Cargo.toml`,
then builds the release binary on `windows-latest`, names it
`prockiller-iced-v<version>-windows-x64.exe`, generates a matching `.sha256`
checksum, and attaches both to a GitHub Release with auto-generated notes. You can
also trigger it manually from the Actions tab (build-only, no release published).

Every push to `main` and every pull request runs [`.github/workflows/ci.yml`](.github/workflows/ci.yml),
which checks formatting, runs Clippy, builds, and runs the test suite.

## License

MIT
