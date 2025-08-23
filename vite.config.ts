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
          if (id.includes("node_modules")) {
            return "vendor"; // Separate node_modules into a vendor chunk
          }
        },
      },
    },
    // --- FIX: Adjust chunk size warning limit to avoid noise for the 579 KB chunk ---
    chunkSizeWarningLimit: 600, // Set to 600 KB to suppress warning for now
  },
});