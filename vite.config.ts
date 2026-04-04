import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset URLs keep the built site working on GitHub Pages project URLs
  // such as https://<user>.github.io/<repo>/ without repo-specific config.
  base: "./",
});
