import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: [
      '@deck.gl/react',
      '@deck.gl/layers',
      '@deck.gl/aggregation-layers',
      '@deck.gl/google-maps',
      '@deck.gl/mapbox',
      'maplibre-gl',
    ],
  },
});
