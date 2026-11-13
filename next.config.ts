import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Lets the dev server serve requests (assets, HMR) to a browser that
  // loaded the app from this LAN address instead of localhost — Next.js
  // rejects cross-origin dev requests from hosts not listed here.
  // allowedDevOrigins: ["192.168.0.45"],
  experimental: {
    // Default is 0s for dynamic routes, so every page every switch
    // re-hits the server even seconds after the last visit. 4 min matches
    // the list views' own useAutoRefresh interval — router.refresh() and
    // the Refresh buttons still force a real fetch regardless of this.
    staleTimes: { dynamic: 240 },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};


export default nextConfig;
