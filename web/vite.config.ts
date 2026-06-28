import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@shared": resolve(__dirname, "../shared"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3456",
        changeOrigin: true,
        // SSE 长连接需要禁用超时
        timeout: 0,
        // 保持连接活跃
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            // SSE 请求不设置超时
            if (proxyReq.getHeader("accept") === "text/event-stream") {
              proxyReq.setTimeout(0);
            }
          });
        },
      },
    },
  },
});
