import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.techbok.solitaire',
  appName: 'Solitaire',
  webDir: 'dist',
  ios: {
    // The web view goes edge to edge. CSS safe-area insets pad the table.
    contentInset: 'never',
    backgroundColor: '#146b3c',
    preferredContentMode: 'mobile',
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#146b3c',
    },
  },
};

export default config;
