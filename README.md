# Ngrok Indicator

A GNOME Shell extension for managing ngrok tunnels directly from the system panel.

## Overview

Ngrok Indicator provides a system tray interface for monitoring and controlling ngrok tunnels. The extension integrates with the ngrok local API to display tunnel status, manage active connections, and launch pre-configured tunnels from your ngrok configuration file.

## Features

### Status Monitoring
- **Visual indicator**: Panel icon changes color based on tunnel state
  - Green: Active tunnels running
  - Red: ngrok process not running or unreachable
  - System color: ngrok running with no active tunnels
- **Real-time updates**: Automatic polling of tunnel status every 3 seconds

### Tunnel Management
- **Active tunnels view**:
  - Display tunnel name and public URL
  - Protocol badges (HTTP, TCP, etc.)
  - One-click URL copying to clipboard
  - Individual tunnel termination
  - Quick access to ngrok traffic inspector
- **Saved tunnels**:
  - Automatic detection of tunnels defined in ngrok.yml
  - Launch individual tunnels or start all configured tunnels
  - Respects max concurrent tunnel limits

### Configuration
- **Quick config switching**: Switch between multiple ngrok.yml configurations
- **Direct file editing**: Open ngrok.yml in system default editor
- **Process control**: Automatic process lifecycle management with cleanup
- **Preferences panel**:
  - Custom ngrok binary path
  - Custom configuration file location
  - Local API base URL configuration
  - Maximum concurrent tunnels setting

## Installation

### Requirements
- GNOME Shell 46 or later
- ngrok CLI (v3.x recommended)
- ngrok local API enabled (default: http://127.0.0.1:4040)

### Development Installation

```bash
cd ngrok-indicator
chmod +x dev-install.sh
./dev-install.sh
```

The installation script will:
1. Package the extension
2. Install to `~/.local/share/gnome-shell/extensions/`
3. Compile GSettings schemas
4. Enable the extension

After installation, restart GNOME Shell:
- **Wayland**: Log out and log back in
- **X11**: Press `Alt+F2`, type `r`, and press Enter

### Manual Installation

```bash
gnome-extensions pack ./ngrok-indicator@reemostat.github.io \
  --force \
  --extra-source=src \
  --extra-source=icons \
  --schema=schemas/org.gnome.shell.extensions.ngrok-indicator.gschema.xml

gnome-extensions install --force ./ngrok-indicator@reemostat.github.io.shell-extension.zip
gnome-extensions enable ngrok-indicator@reemostat.github.io
```

## Usage

### Starting Tunnels
1. Click the ngrok icon in the system panel
2. Navigate to "Saved Tunnels" section
3. Click on a tunnel name to start it
4. Or select "Start All" to launch all configured tunnels

### Managing Active Tunnels
- Click a tunnel row to copy its public URL
- Click the magnifying glass icon to open the traffic inspector
- Click the stop icon to terminate a specific tunnel

### Configuration
Access extension settings via:
- Right-click the panel icon → Settings
- GNOME Extensions application

## Architecture

### Components
- `extension.js`: Main extension logic and UI
- `src/api.js`: ngrok local API client (libsoup3)
- `src/process.js`: Process lifecycle management
- `src/configParser.js`: ngrok.yml parser (supports v2 and v3 formats)
- `stylesheet.css`: UI styling

### API Integration
The extension communicates with ngrok via its local REST API:
- `GET /api/tunnels`: List active tunnels
- `DELETE /api/tunnels/{name}`: Stop specific tunnel

### Process Management
- Non-blocking tunnel startup via `Gio.Subprocess`
- Automatic process cleanup on tunnel stop
- Exit status monitoring with cleanup callbacks

## Privacy & Permissions

- **Local only**: All communication is with localhost ngrok API
- **No external requests**: Extension does not make external network calls
- **Clipboard access**: Only when user explicitly clicks to copy URL
- **File system**: Reads ngrok.yml and writes to extension settings only

## Troubleshooting

### Extension not appearing
```bash
gnome-extensions enable ngrok-indicator@reemostat.github.io
```

### Tunnels not detected
Verify your ngrok.yml path in Settings. Default location:
```
~/.config/ngrok/ngrok.yml
```

### Icon not changing color
Ensure ngrok process is running and accessible at configured API URL (default: http://127.0.0.1:4040)

## Development

### Project Structure
```
ngrok-indicator@reemostat.github.io/
├── extension.js          # Main extension class
├── prefs.js             # Preferences dialog
├── metadata.json        # Extension metadata
├── stylesheet.css       # UI styles
├── icons/
│   └── ngrok-symbolic.svg
├── schemas/
│   └── org.gnome.shell.extensions.ngrok-indicator.gschema.xml
└── src/
    ├── api.js           # ngrok API client
    ├── configParser.js  # YAML parser
    └── process.js       # Process controller
```

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with `./dev-install.sh`
5. Submit a pull request

## License

This project is licensed under the MIT License. See LICENSE file for details.

## Related Projects

- [ngrok](https://ngrok.com/) - Secure tunnels to localhost
- [GNOME Shell Extensions](https://extensions.gnome.org/)