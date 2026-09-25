import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import svgLoader from 'vite-svg-loader';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [vue(), svgLoader(), tailwindcss()],
});
