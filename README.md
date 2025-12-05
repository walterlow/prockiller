# prockiller

Interactive CLI tool to find and kill processes by port. Built with [React Ink](https://github.com/vadimdemedes/ink).

![prockiller demo](https://img.shields.io/npm/v/@walterlow/prockiller?color=orange&style=flat-square)

```
  ██████╗ ██████╗  ██████╗  ██████╗
  ██╔══██╗██╔══██╗██╔═══██╗██╔════╝
  ██████╔╝██████╔╝██║   ██║██║
  ██╔═══╝ ██╔══██╗██║   ██║██║
  ██║     ██║  ██║╚██████╔╝╚██████╗
  ╚═╝     ╚═╝  ╚═╝ ╚═════╝  ╚═════╝
  ██╗  ██╗██╗██╗     ██╗     ███████╗██████╗
  ██║ ██╔╝██║██║     ██║     ██╔════╝██╔══██╗
  █████╔╝ ██║██║     ██║     █████╗  ██████╔╝
  ██╔═██╗ ██║██║     ██║     ██╔══╝  ██╔══██╗
  ██║  ██╗██║███████╗███████╗███████╗██║  ██║
  ╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚══════╝╚═╝  ╚═╝
```

## Install

```bash
npm install -g @walterlow/prockiller
```

Or run directly with npx:

```bash
npx @walterlow/prockiller
```

## Usage

```bash
prockiller
```

1. Enter a port number to scan
2. Navigate with arrow keys to select a process
3. Press `Enter` or `K` to kill, or `A` to kill all

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑` `↓` | Navigate process list |
| `Enter` / `K` | Kill selected process |
| `A` | Kill all processes (when multiple found) |
| `R` | Rescan current port |
| `Esc` | Go back |
| `Q` | Quit |
| `Y` / `N` | Confirm / Cancel kill |

## Features

- Scan any port for running processes
- View process details (PID, name, protocol, address)
- Kill individual processes or all at once
- Cross-platform support (Windows & Unix)
- Auto-updates to the latest version
- Beautiful orange-themed UI

## Requirements

- Node.js 18+
- Windows: Uses `netstat` and `taskkill`
- Unix/Mac: Uses `lsof` and `kill`

## Development

```bash
# Clone the repo
git clone https://github.com/walterlow/prockiller.git
cd prockiller

# Install dependencies
npm install

# Run in dev mode
npm run dev

# Build
npm run build
```

## License

MIT
