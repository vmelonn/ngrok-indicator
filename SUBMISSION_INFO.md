# Extension Listing Information

Use the information below when filling out the submission form on extensions.gnome.org.

## Name
Ngrok Indicator

## Short Description (One-liner)
Panel indicator for ngrok status and active tunnels. Monitor status, copy URLs, and manage tunnels directly from the panel.

## Long Description (For Website - Plain Text)

Ngrok Indicator integrates the ngrok local agent directly into your GNOME Shell top panel, allowing you to monitor and control your tunnels without switching context.

Key Features:

* Visual Status Indicator: The panel icon instantly shows your ngrok status
  - Red: Agent not running
  - Green: Tunnels active
  - Neutral: Agent running, idle

* Active Tunnels List: See all running tunnels with protocol badges (HTTP, TCP, TLS)

* One-Click Copy: Click any tunnel to instantly copy its public URL to your clipboard

* Quick Actions:
  - Stop individual tunnels
  - Open the Traffic Inspector for specific tunnels

* Saved Tunnels: Automatically detects tunnels defined in your ngrok.yml and lets you start them individually or all at once

* Config Management:
  - Switch between multiple configuration files on the fly
  - Edit your configuration file directly from the menu

Privacy and Security:

This extension communicates only with your local ngrok agent API (localhost:4040). It makes no external network requests and sends no telemetry.

Requirements:

* ngrok: You need the ngrok CLI installed and accessible
* Local API: The ngrok local API must be enabled (default port 4040)
