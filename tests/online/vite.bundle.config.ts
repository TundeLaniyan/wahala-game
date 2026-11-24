/**
 * The app's own vite config for the bundle-assertion builds (tests/online/public-bundle.test.ts), minus copying `public/`:
 * the assertions read JavaScript, HTML and the manifest only, and the 80 MB of audio and previews would be copied twice
 * for nothing (the shared test machines run close to full disks). Everything else (plugins, defines, envPrefix, rollup
 * options) is exactly the production configuration.
 */
import type { ConfigEnv, UserConfig } from 'vite';
import base from '../../vite.config';

export default (env: ConfigEnv): UserConfig => {
  const c = (typeof base === 'function' ? base(env) : base) as UserConfig;
  return { ...c, build: { ...c.build, copyPublicDir: false } };
};
