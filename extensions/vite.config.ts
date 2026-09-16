import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";


export default defineConfig({

  build: {

    // Output folder containing the finished
    // Chrome extension files.
    outDir: "dist",

    // Clears the old dist folder before
    // generating a new build.
    emptyOutDir: true,


    rollupOptions: {

      /*
        Entry points used by the extension.
      */
      input: {

        // Popup user interface
        popup: "popup.html",

        // Chrome extension background script
        background: "src/background.ts",

        // Script injected into webpages
        content: "src/content.ts",

      },


      /*
        Keeps generated filenames simple.

        Example:
        popup.js
        content.js
        background.js
      */
      output: {

        entryFileNames: "[name].js",

      },

    },

  },


  /*
    Static files that Vite should copy
    into the dist folder.
  */
  plugins: [

    viteStaticCopy({

      targets: [

        /*
          Copies manifest.json into:

          extensions/dist/manifest.json
        */
        {
          src: "manifest.json",
          dest: ".",
        },


        /*
          Copies the complete assets folder into:

          extensions/dist/assets/
        */
        {
          src: "assets",
          dest: ".",
        },

      ],

    }),

  ],

});