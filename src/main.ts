import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import './style.css';
import { registerPwa } from './pwa.ts';
import { startApp } from './ui/app.ts';

if (Capacitor.isNativePlatform()) {
  document.documentElement.dataset.native = 'true';
  void StatusBar.setOverlaysWebView({ overlay: true }).then(() => StatusBar.setStyle({ style: Style.Dark }));
}

const root = document.querySelector<HTMLElement>('#app');
if (root) startApp(root);
registerPwa();
