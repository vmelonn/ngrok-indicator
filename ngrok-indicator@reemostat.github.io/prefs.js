import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { NgrokCloudApi } from './src/cloudApi.js';

function planToMaxTunnels(planName) {
  const p = (planName || '').toLowerCase();
  if (!p)
    return 0;

  // Conservative defaults from ngrok pricing docs; allow manual override later.
  if (p.includes('free'))
    return 3;
  if (p.includes('hobbyist'))
    return 3;
  if (p.includes('pay') && p.includes('go'))
    return -1; // unlimited
  if (p.includes('enterprise'))
    return -1;
  if (p.includes('pro'))
    return -1;

  return 0;
}

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
      description: 'Configure ngrok cloud API access and local agent settings.',
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

    const accountGroup = new Adw.PreferencesGroup({
      title: 'Account',
      description: 'Enter an ngrok API key to fetch account details. The key is stored locally in GSettings.',
    });

    const apiKeyRow = new Adw.ActionRow({
      title: 'ngrok API Key',
      subtitle: 'Used to query https://api.ngrok.com/account',
    });
    const apiKeyEntry = new Gtk.PasswordEntry({
      hexpand: true,
      placeholder_text: 'Paste API key…',
      text: settings.get_string('cloud-api-key') || '',
      show_peek_icon: true,
    });
    apiKeyEntry.connect('changed', () => {
      settings.set_string('cloud-api-key', apiKeyEntry.get_text());
    });
    apiKeyRow.add_suffix(apiKeyEntry);
    apiKeyRow.set_activatable_widget(apiKeyEntry);
    accountGroup.add(apiKeyRow);

    const cachedEmail = settings.get_string('cloud-account-email') || '';
    const cachedPlan = settings.get_string('cloud-plan-name') || '';
    const cachedRow = new Adw.ActionRow({
      title: 'Cached Account',
      subtitle: `${cachedEmail || '—'}${cachedPlan ? ` • ${cachedPlan}` : ''}`,
    });
    accountGroup.add(cachedRow);

    const accountStatusRow = new Adw.ActionRow({
      title: 'Account Status',
      subtitle: 'Not checked yet.',
    });
    const testButton = new Gtk.Button({ label: 'Verify' });
    testButton.connect('clicked', async () => {
      const apiKey = settings.get_string('cloud-api-key') || '';
      if (!apiKey.trim()) {
        accountStatusRow.set_subtitle('Paste an API key first.');
        return;
      }

      accountStatusRow.set_subtitle('Checking…');
      const api = new NgrokCloudApi({ apiKey: apiKey.trim() });
      try {
        const account = await api.getAccount();
        const email = account?.email ?? '';
        const planName = account?.plan_name ?? account?.plan ?? '';

        if (email)
          settings.set_string('cloud-account-email', email);
        if (planName)
          settings.set_string('cloud-plan-name', planName);

        const computedMax = planToMaxTunnels(planName);
        // Only auto-set max tunnels if it is currently unknown/unset (0).
        if (settings.get_int('max-concurrent-tunnels') === 0)
          settings.set_int('max-concurrent-tunnels', computedMax);

        cachedRow.set_subtitle(`${email || '—'}${planName ? ` • ${planName}` : ''}`);

        const effective = settings.get_int('max-concurrent-tunnels');
        const detectedText = computedMax === -1 ? 'unlimited' : (computedMax > 0 ? `${computedMax}` : 'unknown');
        const effectiveText = effective === -1 ? 'unlimited' : (effective > 0 ? `${effective}` : 'unknown');
        accountStatusRow.set_subtitle(`OK • detected max: ${detectedText} • current max: ${effectiveText}`);
      } catch (e) {
        accountStatusRow.set_subtitle(`Error: ${e?.message || e}`);
      } finally {
        api.destroy();
      }
    });
    accountStatusRow.add_suffix(testButton);
    accountGroup.add(accountStatusRow);

    const openDashRow = new Adw.ActionRow({
      title: 'Open ngrok Dashboard',
      subtitle: 'Find your API key in the ngrok dashboard.',
    });
    const openButton = new Gtk.Button({ label: 'Open' });
    openButton.connect('clicked', () => {
      Gio.AppInfo.launch_default_for_uri('https://dashboard.ngrok.com/', null);
    });
    openDashRow.add_suffix(openButton);
    accountGroup.add(openDashRow);

    const clearRow = new Adw.ActionRow({
      title: 'Clear API Key',
      subtitle: 'Removes the stored key from local settings.',
    });
    const clearButton = new Gtk.Button({ label: 'Clear', css_classes: ['destructive-action'] });
    clearButton.connect('clicked', () => {
      settings.set_string('cloud-api-key', '');
      apiKeyEntry.set_text('');
      settings.set_string('cloud-account-email', '');
      settings.set_string('cloud-plan-name', '');
      cachedRow.set_subtitle('—');
      accountStatusRow.set_subtitle('Cleared.');
    });
    clearRow.add_suffix(clearButton);
    accountGroup.add(clearRow);

    const statusRow = new Adw.ActionRow({
      title: 'Extension Status',
      subtitle: 'Controller features are enabled from the panel menu (saved tunnels + start/stop).',
    });
    localGroup.add(statusRow);
    page.add(localGroup);
    page.add(accountGroup);
    window.add(page);
  }
}

