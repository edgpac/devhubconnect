import path from "path"
import react from "@vitejs/plugin-react-swc"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // --- FIX: Corrected path alias for this project ---
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // --- FIX: This proxy is essential for the frontend and backend to communicate ---
    proxy: {
      '/api': {
        target: 'http://localhost:3000', // Forward API requests to the backend
        changeOrigin: true,
      },
    },
  },
})