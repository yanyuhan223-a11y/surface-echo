import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({base:'/surface-echo/',plugins:[react()],build:{chunkSizeWarningLimit:1000,rollupOptions:{output:{manualChunks:{three:['three']}}}}});
