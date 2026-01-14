import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

async function chooseFile({ title, window, acceptLabel } = {}) {
  const dialog = new Gtk.FileDialog({ title: title || 'Select a file' });
  try {
    const file = await new Promise((resolve, reject) => {
      dialog.open(window, null, (_d, res) => {
        try {
          resolve(dialog.open_finish(res));
        } catch (e) {
          reject(e);
        }
      });
    });
    return file;
  } catch {
    return null;
  }
}

export default class NgrokIndicatorPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    const page = new Adw.PreferencesPage();
    const localGroup = new Adw.PreferencesGroup({
      title: 'Ngrok Indicator',
      description: 'Configure local agent settings.',
    });

    const localEntry = new Adw.EntryRow({
      title: 'Local API Base URL',
      text: settings.get_string('api-base-url') || 'http://127.0.0.1:4040',
    });
    localEntry.set_show_apply_button(true);
    localEntry.connect('apply', () => {
      settings.set_string('api-base-url', localEntry.get_text().trim());
    });
    localGroup.add(localEntry);

    const ngrokBin = new Adw.EntryRow({
      title: 'ngrok Binary Path',
      text: settings.get_string('ngrok-binary-path') || '/usr/local/bin/ngrok',
    });
    ngrokBin.set_show_apply_button(true);
    ngrokBin.connect('apply', () => {
      settings.set_string('ngrok-binary-path', ngrokBin.get_text().trim());
    });
    const browseNgrok = new Gtk.Button({ label: 'Browse…' });
    browseNgrok.connect('clicked', async () => {
      const file = await chooseFile({ title: 'Select ngrok binary', window });
      if (!file)
        return;
      const path = file.get_path();
      if (!path)
        return;
      ngrokBin.set_text(path);
      settings.set_string('ngrok-binary-path', path);
    });
    ngrokBin.add_suffix(browseNgrok);
    localGroup.add(ngrokBin);

    const configPath = new Adw.EntryRow({
      title: 'ngrok.yml Path (optional)',
      text: settings.get_string('config-path') || '',
    });
    configPath.set_show_apply_button(true);
    configPath.connect('apply', () => {
      settings.set_string('config-path', configPath.get_text().trim());
    });
    const browseConfig = new Gtk.Button({ label: 'Browse…' });
    browseConfig.connect('clicked', async () => {
      const file = await chooseFile({ title: 'Select ngrok.yml', window });
      if (!file)
        return;
      const path = file.get_path();
      if (!path)
        return;
      configPath.set_text(path);
      settings.set_string('config-path', path);
    });
    configPath.add_suffix(browseConfig);
    localGroup.add(configPath);

    const maxRow = new Adw.ActionRow({
      title: 'Max Concurrent Tunnels',
      subtitle: '0 = unknown/unset, -1 = unlimited. Used to disable Start actions when limit is reached.',
    });
    const adj = new Gtk.Adjustment({
      lower: -1,
      upper: 100,
      step_increment: 1,
      page_increment: 5,
      value: settings.get_int('max-concurrent-tunnels'),
    });
    const spin = new Gtk.SpinButton({ adjustment: adj, numeric: true, width_chars: 4 });
    spin.connect('value-changed', () => {
      settings.set_int('max-concurrent-tunnels', spin.get_value_as_int());
    });
    maxRow.add_suffix(spin);
    localGroup.add(maxRow);

    const openDashRow = new Adw.ActionRow({
      title: 'Open ngrok Dashboard',
      subtitle: 'Open dashboard.ngrok.com in your browser.',
    });
    const openButton = new Gtk.Button({ label: 'Open' });
    openButton.connect('clicked', () => {
      Gio.AppInfo.launch_default_for_uri('https://dashboard.ngrok.com/', null);
    });
    openDashRow.add_suffix(openButton);
    localGroup.add(openDashRow);

    page.add(localGroup);
    window.add(page);
  }
}
