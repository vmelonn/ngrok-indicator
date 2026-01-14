import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { NgrokApi } from './src/api.js';

const PollIntervalSeconds = 3;

const Status = {
  DEAD: 'dead',
  IDLE: 'idle',
  RUNNING: 'running',
};

class NgrokIndicator extends PanelMenu.Button {
  constructor(extension, { baseUrl } = {}) {
    super(0.0, 'Ngrok Indicator', false);
    this._extension = extension;
    this._destroyed = false;

    this._api = new NgrokApi({ baseUrl });
    this._timeoutId = 0;
    this._status = Status.DEAD;
    this._tunnels = [];

    const iconFile = this._extension.dir
      .get_child('icons')
      .get_child('ngrok-symbolic.svg');
    const gicon = new Gio.FileIcon({ file: iconFile });

    this._icon = new St.Icon({
      gicon,
      style_class: 'system-status-icon ngrok-indicator-icon',
    });
    this.add_child(this._icon);
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

    this._tunnels = [];
    super.destroy();
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
    this._icon.remove_style_class_name('ngrok-indicator--dead');
    this._icon.remove_style_class_name('ngrok-indicator--idle');
    this._icon.remove_style_class_name('ngrok-indicator--running');

    if (status === Status.DEAD)
      this._icon.add_style_class_name('ngrok-indicator--dead');
    else if (status === Status.IDLE)
      this._icon.add_style_class_name('ngrok-indicator--idle');
    else
      this._icon.add_style_class_name('ngrok-indicator--running');
  }

  _buildStaticMenu() {
    this.menu.removeAll();

    this._tunnelsSection = new PopupMenu.PopupMenuSection();
    this.menu.addMenuItem(this._tunnelsSection);

    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    const savedHeader = new PopupMenu.PopupMenuItem('[Saved Tunnels] (coming soon)', { reactive: false });
    savedHeader.add_style_class_name('dim-label');
    this.menu.addMenuItem(savedHeader);

    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    const openWeb = new PopupMenu.PopupMenuItem('⚙ Open Web Interface (localhost:4040)');
    openWeb.connect('activate', () => {
      Gio.AppInfo.launch_default_for_uri('http://127.0.0.1:4040', null);
    });
    this.menu.addMenuItem(openWeb);
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
      const label = `${t.name || 'tunnel'} (${t.publicUrl})`;
      const item = new PopupMenu.PopupMenuItem(label);
      item.connect('activate', () => this._copyToClipboard(t.publicUrl));
      this._tunnelsSection.addMenuItem(item);
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
  }
}

export default class NgrokIndicatorExtension extends Extension {
  enable() {
    this._settings = this.getSettings();
    const baseUrl = this._settings.get_string('api-base-url') || 'http://127.0.0.1:4040';

    this._extensionIndicator = new NgrokIndicator(this, { baseUrl });
    Main.panel.addToStatusArea(this.uuid, this._extensionIndicator);
    this._extensionIndicator.start();

    this._style = this.getStylesheet();
    if (this._style)
      St.ThemeContext.get_for_stage(global.stage).get_theme().load_stylesheet(this._style);
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

    this._settings = null;
  }
}

