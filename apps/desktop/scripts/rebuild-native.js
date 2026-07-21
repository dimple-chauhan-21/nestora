#!/usr/bin/env node
'use strict';

/**
 * @electron/rebuild's CLI module-walker mis-resolves the target package in
 * this pnpm workspace: apps/api also depends on better-sqlite3 (a different
 * major, deliberately — see offline-queue.ts's own comment), and the CLI's
 * directory walk picks up that other version instead of the one actually
 * resolved for apps/desktop. This script does the same job directly: resolve
 * exactly what `require('better-sqlite3')` would resolve to from THIS
 * package, then rebuild that one physical copy against Electron's headers.
 */

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const modulePkgPath = require.resolve('better-sqlite3/package.json', { paths: [__dirname] });
const moduleDir = path.dirname(modulePkgPath);

const electronVersion = require('electron/package.json').version;

const nodeGyp = require.resolve('node-gyp/bin/node-gyp.js', { paths: [__dirname] });

console.log(`Rebuilding ${moduleDir} against Electron ${electronVersion} (${process.arch})`);

execFileSync(
  process.execPath,
  [
    nodeGyp,
    'rebuild',
    `--target=${electronVersion}`,
    `--arch=${process.arch}`,
    '--dist-url=https://electronjs.org/headers',
    '--release',
  ],
  { cwd: moduleDir, stdio: 'inherit' },
);
