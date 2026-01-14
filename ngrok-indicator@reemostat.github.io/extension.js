import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { NgrokApi } from './src/api.js';
import { readSavedTunnels } from './src/configParser.js';
import { ProcessController } from './src/process.js';

const PollIntervalSeconds = 3;

const Status = {
  DEAD: 'dead',
  IDLE: 'idle',
  RUNNING: 'running',
};

class NgrokIndicator extends PanelMenu.Button {
  constructor(extension, { baseUrl, configPath, ngrokPath, maxTunnels } = {}) {
    super(0.0, 'Ngrok Indicator', false);
    this._extension = extension;
    this._destroyed = false;

    this._baseUrl = baseUrl || 'http://127.0.0.1:4040';
    this._api = new NgrokApi({ baseUrl });
    this._proc = new ProcessController({ ngrokPath, configPath });
    this._timeoutId = 0;
    this._status = Status.DEAD;
    this._tunnels = [];
    this._savedTunnels = [];
    this._maxTunnels = typeof maxTunnels === 'number' ? maxTunnels : 0;

    const iconFile = this._extension.dir
      .get_child('icons')
      .get_child('ngrok-symbolic.svg');
    const gicon = new Gio.FileIcon({ file: iconFile });

    this._mainIcon = new St.Icon({
      gicon,
      style_class: 'system-status-icon',
    });

    this._badge = new St.Widget({
      style_class: 'ngrok-indicator-badge ngrok-indicator-badge--down',
      x_align: Clutter.ActorAlign.END,
      y_align: Clutter.ActorAlign.START,
    });

    this._iconContainer = new St.Widget({
      layout_manager: new Clutter.BinLayout(),
      style_class: 'ngrok-indicator-icon',
    });
    this._iconContainer.add_child(this._mainIcon);
    this._iconContainer.add_child(this._badge);

    this.add_child(this._iconContainer);
    this._setStatus(Status.DEAD);

    this._buildStaticMenu();
  }

  destroy() {
    this._destroyed = true;

    if (this._timeoutId) {
      GLib.Source.remove(this._timeoutId);
      this._timeoutId = 0;
    }

    this._api?.destroy();
    this._api = null;

    this._proc = null;
    this._tunnels = [];
    this._savedTunnels = [];
    super.destroy();
  }

  updateConfig({ baseUrl, configPath, ngrokPath, maxTunnels } = {}) {
    if (typeof baseUrl === 'string' && baseUrl.trim()) {
      this._baseUrl = baseUrl.trim();
      this._api?.setBaseUrl(this._baseUrl);
    }
    this._proc?.setConfig({ configPath, ngrokPath });
    if (typeof maxTunnels === 'number')
      this._maxTunnels = maxTunnels;
    this._loadSavedTunnels(configPath);
    this._renderSavedTunnels();
  }

  start() {
    // Initial refresh immediately, then poll.
    this._refresh().catch(() => {});
    this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, PollIntervalSeconds, () => {
      this._refresh().catch(() => {});
      return GLib.SOURCE_CONTINUE;
    });
  }

  _setStatus(status) {
    this._status = status;

    this._badge.remove_style_class_name('ngrok-indicator-badge--up');
    this._badge.remove_style_class_name('ngrok-indicator-badge--down');

    // Requirement: green if >= 1 tunnel, red otherwise.
    if (status === Status.RUNNING)
      this._badge.add_style_class_name('ngrok-indicator-badge--up');
    else
      this._badge.add_style_class_name('ngrok-indicator-badge--down');
  }

  _buildStaticMenu() {
    this.menu.removeAll();

    this._tunnelsSection = new PopupMenu.PopupMenuSection();
    this.menu.addMenuItem(this._tunnelsSection);

    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    this._savedSection = new PopupMenu.PopupMenuSection();
    this.menu.addMenuItem(this._savedSection);

    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    const openWeb = new PopupMenu.PopupMenuItem('Open Web Interface');
    openWeb.connect('activate', () => {
      Gio.AppInfo.launch_default_for_uri(this._baseUrl, null);
    });
    this.menu.addMenuItem(openWeb);

    const openPrefs = new PopupMenu.PopupMenuItem('Settings');
    openPrefs.connect('activate', () => {
      this._extension.openPreferences();
    });
    this.menu.addMenuItem(openPrefs);
  }

  _renderTunnels() {
    this._tunnelsSection.removeAll();

    if (this._status === Status.DEAD) {
      const item = new PopupMenu.PopupMenuItem('ngrok is not running', { reactive: false });
      item.add_style_class_name('dim-label');
      this._tunnelsSection.addMenuItem(item);
      return;
    }

    if (this._tunnels.length === 0) {
      const item = new PopupMenu.PopupMenuItem('ngrok is running (no active tunnels)', { reactive: false });
      item.add_style_class_name('dim-label');
      this._tunnelsSection.addMenuItem(item);
      return;
    }

    for (const t of this._tunnels) {
      const row = new PopupMenu.PopupBaseMenuItem();
      row.add_style_class_name('ngrok-indicator-tunnel-row');

      const label = new St.Label({
        text: `${t.name || 'tunnel'} (${t.publicUrl})`,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
      });
      row.add_child(label);

      const stopIcon = new St.Icon({ icon_name: 'window-close-symbolic', style_class: 'popup-menu-icon' });
      const stopButton = new St.Button({
        child: stopIcon,
        style_class: 'ngrok-indicator-stop-button',
        can_focus: true,
        reactive: true,
        track_hover: true,
      });

      stopButton.connect('clicked', async () => {
        // Prevent the row activate (copy) from also firing.
        // (Button click is separate, but we keep it explicit.)
        try {
          if (!t.uri)
            return;
          await this._api.deleteTunnel(t.uri);
        } catch {
          // Keep UI quiet; status will update next poll.
        } finally {
          this._refresh().catch(() => {});
        }
      });

      row.add_child(stopButton);

      row.connect('activate', () => this._copyToClipboard(t.publicUrl));
      this._tunnelsSection.addMenuItem(row);
    }
  }

  _loadSavedTunnels(configPath) {
    this._savedTunnels = readSavedTunnels(configPath);
  }

  _canStartAnotherTunnel() {
    const max = this._maxTunnels;
    if (max === -1)
      return true; // unlimited
    if (max > 0)
      return this._tunnels.length < max;
    return true; // unknown/unset
  }

  _renderSavedTunnels() {
    this._savedSection.removeAll();

    const header = new PopupMenu.PopupMenuItem('Saved Tunnels', { reactive: false });
    header.add_style_class_name('dim-label');
    this._savedSection.addMenuItem(header);

    const canStart = this._canStartAnotherTunnel();
    const max = this._maxTunnels;
    if (!canStart && max > 0) {
      const msg = new PopupMenu.PopupMenuItem(`Limit reached (${max}). Stop a tunnel first.`, { reactive: false });
      msg.add_style_class_name('dim-label');
      this._savedSection.addMenuItem(msg);
    }

    if (this._savedTunnels.length === 0) {
      const empty = new PopupMenu.PopupMenuItem('No saved tunnels found in ngrok.yml', { reactive: false });
      empty.add_style_class_name('dim-label');
      this._savedSection.addMenuItem(empty);
      return;
    }

    for (const t of this._savedTunnels) {
      const item = new PopupMenu.PopupMenuItem(`▶ Start "${t.name}"${t.addr ? ` (${t.addr})` : ''}`);
      item.setSensitive(canStart);
      item.connect('activate', async () => {
        try {
          await this._proc.startTunnel(t.name);
        } catch (e) {
          Main.notify('Ngrok Indicator', e?.message || `${e}`);
        } finally {
          this._refresh().catch(() => {});
        }
      });
      this._savedSection.addMenuItem(item);
    }

    this._savedSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    const remaining = (max > 0) ? Math.max(0, max - this._tunnels.length) : null;
    const canStartAll = (max === -1) || (max <= 0) || (remaining !== null && this._savedTunnels.length <= remaining);

    const startAll = new PopupMenu.PopupMenuItem('▶ Start All');
    startAll.setSensitive(canStartAll);
    startAll.connect('activate', async () => {
      try {
        await this._proc.startAll();
      } catch (e) {
        Main.notify('Ngrok Indicator', e?.message || `${e}`);
      } finally {
        this._refresh().catch(() => {});
      }
    });
    this._savedSection.addMenuItem(startAll);

    if (!canStartAll && max > 0) {
      const warn = new PopupMenu.PopupMenuItem(`Start All would exceed limit (${max}).`, { reactive: false });
      warn.add_style_class_name('dim-label');
      this._savedSection.addMenuItem(warn);
    }
  }

  _copyToClipboard(text) {
    const clipboard = St.Clipboard.get_default();
    clipboard.set_text(St.ClipboardType.CLIPBOARD, text);
  }

  async _refresh() {
    if (this._destroyed)
      return;

    try {
      const tunnels = await this._api.getTunnels();
      if (this._destroyed)
        return;
      this._tunnels = tunnels;
      this._setStatus(tunnels.length > 0 ? Status.RUNNING : Status.IDLE);
    } catch (e) {
      if (this._destroyed)
        return;
      this._tunnels = [];
      this._setStatus(Status.DEAD);
    }
    this._renderTunnels();
    this._renderSavedTunnels();
  }
}

export default class NgrokIndicatorExtension extends Extension {
  enable() {
    this._settings = this.getSettings();
    const baseUrl = this._settings.get_string('api-base-url') || 'http://127.0.0.1:4040';
    const configPath = this._settings.get_string('config-path') || '';
    const ngrokPath = this._settings.get_string('ngrok-binary-path') || '/usr/local/bin/ngrok';
    const maxTunnels = this._settings.get_int('max-concurrent-tunnels');

    this._extensionIndicator = new NgrokIndicator(this, { baseUrl, configPath, ngrokPath, maxTunnels });
    Main.panel.addToStatusArea(this.uuid, this._extensionIndicator);
    this._extensionIndicator.updateConfig({ baseUrl, configPath, ngrokPath, maxTunnels });
    this._extensionIndicator.start();

    this._style = this.getStylesheet();
    if (this._style)
      St.ThemeContext.get_for_stage(global.stage).get_theme().load_stylesheet(this._style);

    this._settingsChangedId = this._settings.connect('changed', () => {
      const baseUrl2 = this._settings.get_string('api-base-url') || 'http://127.0.0.1:4040';
      const configPath2 = this._settings.get_string('config-path') || '';
      const ngrokPath2 = this._settings.get_string('ngrok-binary-path') || '/usr/local/bin/ngrok';
      const maxTunnels2 = this._settings.get_int('max-concurrent-tunnels');
      this._extensionIndicator?.updateConfig({ baseUrl: baseUrl2, configPath: configPath2, ngrokPath: ngrokPath2, maxTunnels: maxTunnels2 });
    });
  }

  disable() {
    if (this._style) {
      St.ThemeContext.get_for_stage(global.stage).get_theme().unload_stylesheet(this._style);
      this._style = null;
    }

    if (this._extensionIndicator) {
      this._extensionIndicator.destroy();
      this._extensionIndicator = null;
    }

    if (this._settingsChangedId) {
      this._settings.disconnect(this._settingsChangedId);
      this._settingsChangedId = null;
    }

    this._settings = null;
  }
}

