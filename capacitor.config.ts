/// <reference types="@capacitor/local-notifications" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.supplementtracker.app',
  appName: 'Supplement Tracker',
  webDir: 'out',
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_leaf',
      iconColor: '#2BA37D',
      presentationOptions: ['badge', 'sound', 'banner', 'list'],
    },
  },
};

export default config;
