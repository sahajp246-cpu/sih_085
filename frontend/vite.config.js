import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // deck.gl modules use dynamic imports that Vite needs to pre-bundle
    include: ['@deck.gl/react', '@deck.gl/layers', '@deck.gl/aggregation-layers', '@deck.gl/google-maps'],
  },
});
