import { Capacitor } from '@capacitor/core';
import { registerSW } from 'virtual:pwa-register';

export function registerPwa(): void {
  if (!import.meta.env.PROD) return;
  // The native app ships its own files. A service worker there only fights the next store update.
  if (Capacitor.isNativePlatform()) return;
  registerSW({ immediate: true });
}
