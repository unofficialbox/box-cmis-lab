import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const jwtFile = env.VITE_JWT_CONFIG_FILE?.trim();
  const jwtPath = jwtFile ? resolve(process.cwd(), jwtFile) : null;
  const jwtFromFile =
    jwtPath && existsSync(jwtPath) ? readFileSync(jwtPath, "utf8") : undefined;

  return {
    // Prefer file contents over an inline VITE_JWT_CONFIG_JSON when configured.
    define:
      jwtFromFile !== undefined
        ? {
            "import.meta.env.VITE_JWT_CONFIG_JSON": JSON.stringify(jwtFromFile),
          }
        : {},
    server: {
      port: 5173,
      proxy: {
        "/cmis": {
          target: "http://127.0.0.1:8080",
          changeOrigin: true,
        },
        "/box-api": {
          target: "https://api.box.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/box-api/, ""),
        },
      },
    },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
    },
  };
});
