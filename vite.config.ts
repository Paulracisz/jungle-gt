import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' makes every asset path relative, so the build works on any
// GitHub Pages URL (user.github.io/<repo>/) without configuring the repo name.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 1000 },
});
