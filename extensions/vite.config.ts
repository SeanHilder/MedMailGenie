import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,

    rollupOptions: {
      input: {
        popup: "popup.html",
        background: "src/background.ts",
        content: "src/content.ts",
      },

      output: {
        entryFileNames: "[name].js",
      },
    },
  },

  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: "manifest.json",
          dest: ".",
        },
      ],
    }),
  ],
});