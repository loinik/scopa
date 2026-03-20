import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

import manifest from './public/manifest.webmanifest';

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            manifest,
            workbox: {
                globPatterns: ['**/*.{js,css,html,png,svg}'],
            },
        })
    ],
    base: '/scopa/'
});