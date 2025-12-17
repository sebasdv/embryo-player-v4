
import { defineConfig } from 'vite';

export default defineConfig({
    base: '/embryo-player-v4/', // Repo name
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: false
    }
});
