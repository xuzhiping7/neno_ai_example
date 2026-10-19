import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { fs: { deny: ['.env', '.env.*', '**/.git/**', '**/server/**', '**/tests/**', '**/scripts/**'] } },
  build: { target: 'es2022', sourcemap: false },
});
