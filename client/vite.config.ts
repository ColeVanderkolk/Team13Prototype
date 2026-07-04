import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    fs: {
      // Allow the main client to import the existing teammate-built collectible prototype without moving or editing it.
      allow: [path.resolve(__dirname, "..")],
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Ensure imported prototype files outside /client use the same Three.js package as the main app.
      "three": path.resolve(__dirname, "./node_modules/three"),
    },
  },
});
