import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const page = (p) => resolve(import.meta.dirname, p);

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        home: page("index.html"),
        paid: page("paid/index.html"),
        sheet: page("paid/sheet/index.html"),
        resurrection: page("paid/resurrection/index.html"),
        alive: page("paid/alive/index.html"),
        verdict: page("v/index.html"),
        admin: page("admin/index.html"),
      },
    },
  },
});
