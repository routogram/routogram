import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import createNextIntlPlugin from "next-intl/plugin";

const exampleRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(exampleRoot, "../..");

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl({
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "placehold.co" },
    ],
  },
});
