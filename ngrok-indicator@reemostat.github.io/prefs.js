import Adw from 'gi://Adw';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class NgrokIndicatorPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const page = new Adw.PreferencesPage();
    const group = new Adw.PreferencesGroup({
      title: 'Ngrok Indicator',
      description: 'Preferences are coming in a later iteration.',
    });

    const row = new Adw.ActionRow({
      title: 'Status',
      subtitle: 'V1 is read-only (viewer).',
    });

    group.add(row);
    page.add(group);
    window.add(page);
  }
}

