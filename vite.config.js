import { defineConfig, preview } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        configurator: path.resolve(__dirname, 'configurator.html'),
        profile: path.resolve(__dirname, 'profile.html'),
        previewer: path.resolve(__dirname, 'preview.html'),
      },
    },
  },
});
