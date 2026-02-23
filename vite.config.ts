import path from "path";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // --- FIX: Corrected path alias for this project ---
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // --- FIX: This proxy is essential for the frontend and backend to communicate during development ---
    proxy: {
      "/api": {
        target: "http://localhost:3000", // Forward API requests to the backend
        changeOrigin: true,
      },
    },
  },
  build: {
    // --- FIX: Explicitly define output directory and assets location ---
    outDir: "dist",
    assetsDir: "assets",
    // --- FIX: Optimize chunking to address the 579 KB warning ---
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // React core — tiny, always needed, cached independently
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react';
          // Radix UI + Lucide icons — large, changes rarely
          if (id.includes('@radix-ui/') || id.includes('lucide-react')) return 'ui';
          // TanStack Query + Router
          if (id.includes('@tanstack/')) return 'query';
          // Everything else
          return 'vendor';
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});