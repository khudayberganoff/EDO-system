import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // Kutubxonalar alohida faylda: ular kam o'zgaradi, shuning uchun yangi versiya chiqqanda ham
        // brauzer keshidan olinadi (faqat o'zgargan sahifa kodi qayta yuklanadi).
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          vendor: ["@tanstack/react-query", "axios", "clsx"],
        },
      },
    },
  },
});
