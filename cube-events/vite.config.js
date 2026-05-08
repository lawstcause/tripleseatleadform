import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths make the built app portable for subpages like justmyluck.wtf/labels/
  base: './',
});
