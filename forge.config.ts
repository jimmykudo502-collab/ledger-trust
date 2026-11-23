import type { ForgeConfig } from '@electron-forge/shared-types';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import fs from 'node:fs/promises';
import path from 'node:path';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    // Window/exe naming only. package.json's name stays "agentobi", so the
    // data folder (%APPDATA%gentobi) and existing clients are unchanged.
    name: 'Ledger Trust',
    executableName: 'LedgerTrust',
    win32metadata: {
      ProductName: 'Ledger Trust',
      FileDescription: 'Ledger Trust bookkeeping',
    },
  },
  rebuildConfig: {
    // better-sqlite3 ships Node-API prebuilds that load in both Node and
    // Electron, so it never needs a node-gyp rebuild.
    ignoreModules: ['better-sqlite3'],
  },
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  hooks: {
    // The Vite plugin only packages the bundled .vite output, and
    // better-sqlite3 is external (native), so copy just what it needs at
    // runtime: its JS, package.json and Node-API prebuilt binaries.
    packageAfterCopy: async (_config, buildPath) => {
      const source = path.join(__dirname, 'node_modules', 'better-sqlite3');
      const target = path.join(buildPath, 'node_modules', 'better-sqlite3');
      for (const entry of ['package.json', 'lib', 'prebuilds']) {
        await fs.cp(path.join(source, entry), path.join(target, entry), { recursive: true });
      }
    },
  },
  plugins: [
    // Native .node files can't load from inside the asar archive.
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
