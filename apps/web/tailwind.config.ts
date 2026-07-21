import type { Config } from 'tailwindcss';
import sharedPreset from '@nestora/ui/tailwind-preset';

const config: Config = {
  presets: [sharedPreset],
  // packages/ui must be scanned too — otherwise Tailwind's JIT compiler
  // purges every class the shared components use, since it only knows
  // about classes it can find textually in the globbed files.
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
};

export default config;
