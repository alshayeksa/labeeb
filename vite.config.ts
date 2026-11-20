import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: "127.0.0.1" },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    restoreMocks: true,
    // Shell tests type into forms keystroke by keystroke; slower CI runners
    // (macOS Intel) exceed the 5 s default without any real failure.
    testTimeout: 20000,
  },
  build: { target: "es2022" },
});
