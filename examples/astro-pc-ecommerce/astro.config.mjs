import lit from "@astrojs/lit";
import react from "@astrojs/react";
import solid from "@astrojs/solid-js";
import svelte from "@astrojs/svelte";
import vue from "@astrojs/vue";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [
    react({ include: ["**/react/**"] }),
    vue(),
    svelte(),
    solid({ include: ["**/solid/**"] }),
    lit(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
