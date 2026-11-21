import type { NextConfig } from "next";

const configuredOrigin = process.env.API_ORIGIN?.trim();
const hosted = Boolean(process.env.VERCEL_ENV || process.env.VERCEL === "1");
if (hosted && !configuredOrigin) {
  throw new Error("Set API_ORIGIN for this Vercel environment before deploying CodecStream.");
}
const apiUrl = new URL(configuredOrigin || "http://localhost:4000");
if (
  (apiUrl.protocol !== "https:" && (hosted || apiUrl.protocol !== "http:")) ||
  apiUrl.username || apiUrl.password || apiUrl.pathname !== "/" || apiUrl.search || apiUrl.hash
) {
  throw new Error("API_ORIGIN must be an HTTP(S) origin, using HTTPS on Vercel.");
}
const API_ORIGIN = apiUrl.origin;

const nextConfig: NextConfig = {
  /* config options here */
  transpilePackages: ["@codecstream/shared"],
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      { source: "/api/auth/:path*", destination: `${API_ORIGIN}/api/auth/:path*` },
      { source: "/api/:path*", destination: `${API_ORIGIN}/:path*` },
    ];
  },
};

export default nextConfig;
