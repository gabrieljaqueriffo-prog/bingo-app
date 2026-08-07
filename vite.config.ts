import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/bingo-app/",
  plugins: [react(), VitePWA({
    registerType: "autoUpdate",
    includeAssets: ["favicon.svg", "apple-touch-icon.png"],
    manifest: {
      name: "Bingo — Cartones digitales",
      short_name: "Bingo",
      description: "Controla tus cartones de bingo desde el teléfono, incluso sin conexión.",
      lang: "es",
      theme_color: "#14281d",
      background_color: "#f7f1e3",
      display: "standalone",
      start_url: "/bingo-app/",
      scope: "/bingo-app/",
      icons: [
        { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
        { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
        { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
      ]
    },
    workbox: {
      cleanupOutdatedCaches: true,
      navigateFallback: "/bingo-app/index.html",
      globPatterns: ["**/*.{js,css,html,ico,png,svg,wasm}"],
      runtimeCaching: [{
        urlPattern: /^https:\/\/cdn\.jsdelivr\.net\//,
        handler: "CacheFirst",
        options: { cacheName: "ocr-assets-v1", expiration: { maxEntries: 20, maxAgeSeconds: 31536000 } }
      }]
    }
  })]
});
