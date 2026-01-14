# Changelog

All notable changes to this project will be documented in this file.

## [1.0] - 2026-01-15

### Added
- Panel indicator with color-coded ngrok status icon
  - Green: Active tunnels running
  - Red: ngrok agent not running
  - Neutral: Agent running, no active tunnels
- Active tunnels display with protocol badges (HTTP, TCP, TLS)
- One-click tunnel URL copying to clipboard
- Individual tunnel stop functionality
- Traffic Inspector quick access for each tunnel
- Saved tunnels list from ngrok.yml configuration
- Start individual saved tunnels or all at once
- Quick config file switcher for multiple ngrok.yml files
- Direct config file editing from extension menu
- Settings panel for configuring:
  - Local API URL (default: http://127.0.0.1:4040)
  - ngrok binary path
  - Configuration file path
  - Refresh interval and tunnel display limits

### Technical
- Local-only operation: No external network requests or telemetry
- Non-blocking subprocess management for tunnel processes
- Proper process lifecycle handling and cleanup
- GNOME Shell 46 compatibility

