import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import requireTransform from 'vite-plugin-require-transform';

export default defineConfig({
    plugins: [
        react(),
        // requireTransform({ fileRegex: /.ts$/ })
    ],
    optimizeDeps: {
        exclude: ['wrappers/'],
        esbuildOptions: {
            // Node.js global to browser globalThis
            define: {
                global: 'globalThis',
            },
            // Enable esbuild polyfill plugins
            plugins: [
                NodeGlobalsPolyfillPlugin({
                    buffer: true,
                }),
            ],
        },
    },
});
