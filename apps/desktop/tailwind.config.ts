import type { Config } from 'tailwindcss';
import sharedPreset from '@nestora/ui/tailwind-preset';

const config: Config = {
  presets: [sharedPreset],
  content: ['./src/renderer/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
};

export default config;
