import type { NextConfig } from "next";

// No nonce: Next.js inlines its bootstrap scripts, so script-src needs
// 'unsafe-inline' (and 'unsafe-eval' only in dev for React refresh). The rest
// of the policy still blocks framing, plugins, base-tag and form hijacking.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  /* config options here */
  // Lets the dev server serve requests (assets, HMR) to a browser that
  // loaded the app from this LAN address instead of localhost — Next.js
  // rejects cross-origin dev requests from hosts not listed here.
  // allowedDevOrigins: ["192.168.0.45"],
  experimental: {
    agentUpgrade: "security",
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
