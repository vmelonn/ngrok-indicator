import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { NgrokApi } from './src/api.js';
import { readSavedTunnels, defaultNgrokConfigPath } from './src/configParser.js';
import { ProcessController } from './src/process.js';

const PollIntervalSeconds = 3;

const Status = {
  DEAD: 'dead',
  IDLE: 'idle',
  RUNNING: 'running',
};

const NgrokIndicator = GObject.registerClass(
class NgrokIndicator extends PanelMenu.Button {
  _init(extension, { baseUrl, configPath, ngrokPath, maxTunnels } = {}) {
    super._init(0.0, 'Ngrok Indicator', false);
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
    this._configPath = configPath || '';
    this._discoveredConfigs = [];

    const iconFile = this._extension.dir
      .get_child('icons')
      .get_child('ngrok-symbolic.svg');
    const gicon = new Gio.FileIcon({ file: iconFile });

    this._mainIcon = new St.Icon({
      gicon,
      style_class: 'system-status-icon',
      icon_size: 20,
      y_align: Clutter.ActorAlign.CENTER,
      x_align: Clutter.ActorAlign.CENTER,
    });

    this.add_child(this._mainIcon);
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
    if (typeof configPath === 'string') {
      this._configPath = configPath;
      this._discoverConfigs(configPath);
    }
    this._loadSavedTunnels(configPath);
    this._renderSavedTunnels();
  }

  start() {
    this._refresh().catch(() => {});
    this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, PollIntervalSeconds, () => {
      this._refresh().catch(() => {});
      return GLib.SOURCE_CONTINUE;
    });
  }

  _setStatus(status) {
    this._status = status;

    this._mainIcon.remove_style_class_name('ngrok-running-icon');
    this._mainIcon.remove_style_class_name('ngrok-dead-icon');
    this._mainIcon.remove_style_class_name('system-status-icon');

    if (status === Status.RUNNING) {
      this._mainIcon.add_style_class_name('ngrok-running-icon');
    } else if (status === Status.DEAD) {
      this._mainIcon.add_style_class_name('ngrok-dead-icon');
    } else {
      // IDLE
      this._mainIcon.add_style_class_name('system-status-icon');
    }
  }

  _buildStaticMenu() {
    this.menu.removeAll();

    // 1. Active Tunnels Section
    this._tunnelsSection = new PopupMenu.PopupMenuSection();
    this.menu.addMenuItem(this._tunnelsSection);

    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    // 2. Saved Tunnels Section
    this._savedSection = new PopupMenu.PopupMenuSection();
    this.menu.addMenuItem(this._savedSection);

    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    // 3. Config Switcher
    this._configSubMenu = new PopupMenu.PopupSubMenuMenuItem('Switch Config');
    this.menu.addMenuItem(this._configSubMenu);

    // 4. Edit Config Button
    const editConfig = new PopupMenu.PopupMenuItem('Edit Configuration');
    editConfig.connect('activate', () => {
      // Use configured path, or fallback to default if empty
      let path = this._configPath;
      if (!path) {
        // We need to resolve the default path if not set
        path = defaultNgrokConfigPath();
      }

      if (!path) {
        Main.notify('Ngrok Indicator', 'No config path found.');
        return;
      }

      try {
        const f = Gio.File.new_for_path(path);
        // Ensure the file exists before trying to open it, or at least the directory
        if (!f.query_exists(null)) {
             Main.notify('Ngrok Indicator', `Config file not found at: ${path}`);
             return;
        }
        Gio.AppInfo.launch_default_for_uri(f.get_uri(), null);
      } catch (e) {
        Main.notify('Ngrok Indicator', `Failed to open config: ${e.message}`);
      }
    });
    this.menu.addMenuItem(editConfig);

    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    // 5. Open Web Interface
    const openWeb = new PopupMenu.PopupMenuItem('Open Web Interface');
    openWeb.connect('activate', () => {
      Gio.AppInfo.launch_default_for_uri(this._baseUrl, null);
    });
    this.menu.addMenuItem(openWeb);

    // 6. Settings
    const openPrefs = new PopupMenu.PopupMenuItem('Settings');
    openPrefs.connect('activate', () => {
      this._extension.openPreferences();
    });
    this.menu.addMenuItem(openPrefs);
  }

  _discoverConfigs(currentPath) {
    this._discoveredConfigs = [];
    
    // Fallback to default path directory if currentPath is empty
    let searchPath = currentPath;
    if (!searchPath) {
        const def = defaultNgrokConfigPath(); // e.g. /home/user/.config/ngrok/ngrok.yml
        const f = Gio.File.new_for_path(def);
        const parent = f.get_parent();
        if (parent) {
            searchPath = parent.get_path();
        }
    }
    
    // If searchPath is a file, get its parent directory
    try {
        const f = Gio.File.new_for_path(searchPath);
        // If it looks like a file (has extension), get parent. 
        // If it's a directory, enumerate it. 
        // Safer to just assume if it points to a .yml file, use parent.
        if (searchPath.endsWith('.yml') || searchPath.endsWith('.yaml')) {
             const p = f.get_parent();
             if (p) searchPath = p.get_path();
        }
    } catch { }

    if (!searchPath) return;

    try {
      const parent = Gio.File.new_for_path(searchPath);
      const enumerator = parent.enumerate_children(
        'standard::name,standard::type',
        Gio.FileQueryInfoFlags.NONE,
        null
      );

      let info;
      while ((info = enumerator.next_file(null))) {
        if (info.get_file_type() !== Gio.FileType.REGULAR) continue;
        const name = info.get_name();
        if (name.endsWith('.yml') || name.endsWith('.yaml')) {
           this._discoveredConfigs.push({
             name: name,
             path: parent.get_child(name).get_path()
           });
        }
      }
    } catch (e) {
      console.warn('Failed to discover configs:', e);
    }
    
    this._configSubMenu.menu.removeAll();
    if (this._discoveredConfigs.length === 0) {
       const item = new PopupMenu.PopupMenuItem('No other configs found', { reactive: false });
       item.add_style_class_name('dim-label');
       this._configSubMenu.menu.addMenuItem(item);
    } else {
       for (const cfg of this._discoveredConfigs) {
         const isCurrent = (cfg.path === currentPath);
         const item = new PopupMenu.PopupMenuItem(cfg.name);
         if (isCurrent) {
            item.setOrnament(PopupMenu.Ornament.DOT);
            item.setSensitive(false);
         }
         item.connect('activate', () => {
            this._extension.getSettings().set_string('config-path', cfg.path);
         });
         this._configSubMenu.menu.addMenuItem(item);
       }
    }
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

      const vbox = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
      });

      const nameBox = new St.BoxLayout({ x_align: Clutter.ActorAlign.START });
      const nameLabel = new St.Label({
        text: t.name || 'tunnel',
        style_class: 'ngrok-tunnel-name',
        y_align: Clutter.ActorAlign.CENTER,
      });
      nameBox.add_child(nameLabel);
      
      if (t.proto) {
        const badge = new St.Label({
           text: ` ${t.proto.toUpperCase()} `,
           style_class: 'ngrok-proto-badge',
           y_align: Clutter.ActorAlign.CENTER,
        });
        nameBox.add_child(badge);
      }
      
      const urlLabel = new St.Label({
        text: t.publicUrl,
        style_class: 'ngrok-tunnel-url',
        x_align: Clutter.ActorAlign.START,
      });

      vbox.add_child(nameBox);
      vbox.add_child(urlLabel);
      row.add_child(vbox);

      const btnBox = new St.BoxLayout({
        x_align: Clutter.ActorAlign.END,
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'ngrok-action-buttons'
      });

      // Inspector
      const inspectIcon = new St.Icon({ icon_name: 'system-search-symbolic', style_class: 'popup-menu-icon' });
      const inspectButton = new St.Button({
        child: inspectIcon,
        style_class: 'ngrok-indicator-button',
        can_focus: true,
        reactive: true,
        track_hover: true,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
      });
      inspectButton.connect('clicked', () => {
        const type = (t.proto === 'tcp') ? 'tcp' : 'http';
        Gio.AppInfo.launch_default_for_uri(`${this._baseUrl}/inspect/${type}`, null);
      });
      btnBox.add_child(inspectButton);

      // Stop
      const stopIcon = new St.Icon({ icon_name: 'process-stop-symbolic', style_class: 'popup-menu-icon' });
      const stopButton = new St.Button({
        child: stopIcon,
        style_class: 'ngrok-indicator-button ngrok-stop-button',
        can_focus: true,
        reactive: true,
        track_hover: true,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
      });

      stopButton.connect('clicked', async () => {
        try {
          if (t.name) {
            this._proc.stopTunnel(t.name);
          }
          if (!t.uri) return;
          await this._api.deleteTunnel(t.uri);
        } catch {
        } finally {
          this._refresh().catch(() => {});
        }
      });
      btnBox.add_child(stopButton);

      row.add_child(btnBox);

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
    this._loadSavedTunnels(this._configPath);
    this._renderSavedTunnels();
  }
}
);

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

    this._settingsChangedId = this._settings.connect('changed', () => {
      const baseUrl2 = this._settings.get_string('api-base-url') || 'http://127.0.0.1:4040';
      const configPath2 = this._settings.get_string('config-path') || '';
      const ngrokPath2 = this._settings.get_string('ngrok-binary-path') || '/usr/local/bin/ngrok';
      const maxTunnels2 = this._settings.get_int('max-concurrent-tunnels');
      this._extensionIndicator?.updateConfig({ baseUrl: baseUrl2, configPath: configPath2, ngrokPath: ngrokPath2, maxTunnels: maxTunnels2 });
    });
  }

  disable() {
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
