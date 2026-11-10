import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Lets the dev server serve requests (assets, HMR) to a browser that
  // loaded the app from this LAN address instead of localhost — Next.js
  // rejects cross-origin dev requests from hosts not listed here.
  // allowedDevOrigins: ["192.168.0.45"],
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
