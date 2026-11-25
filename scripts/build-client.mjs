import { build } from 'esbuild'
import manifest from '../package.json' with { type: 'json' }

// DSH resolves these shared modules in its browser runtime.
await build({
  entryPoints: ['client/index.jsx'],
  outfile: 'dist/client.js',
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  jsx: 'automatic',
  target: 'es2024',
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
    '@deepseek-ai/cordis', 'zod', '@tanstack/react-virtual',
    '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit'],
  loader: { '.css': 'text' },
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;` },
  footer: { js: 'return module.exports; } });' }
})
