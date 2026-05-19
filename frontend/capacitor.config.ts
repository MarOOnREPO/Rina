import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rina.app',
  appName: 'Project Rina',
  webDir: 'build',
  server: {
    androidScheme: 'https',
    iosScheme: 'https'
  },
  ios: {
    contentInset: 'always',
    allowsLinkPreview: false,
    scrollEnabled: false,
    backgroundColor: '#0f0f1a'
  },
  android: {
    backgroundColor: '#0f0f1a'
  },
  plugins: {
    Keyboard: {
      resize: 'body',
      style: 'dark'
    },
    SplashScreen: {
      backgroundColor: '#0f0f1a',
      androidScaleType: 'CENTER_CROP'
    }
  }
};

export default config;
