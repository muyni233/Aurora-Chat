import type { NextConfig } from "next";

// Origin of the FastAPI backend that this Next.js process should proxy to.
// Defaults to localhost:8000 — set BACKEND_ORIGIN when Next and FastAPI live on
// different hosts (e.g. separate containers). Read at build/start time.
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  // Pin Turbopack's workspace root to this folder. Without this, a stray
  // package-lock.json in the user's home directory (C:\Users\<user>\) makes
  // Next.js mis-detect the root, which breaks the RSC client manifest
  // (`app/page.tsx#default` not found) and @swc/helpers resolution.
  // See: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/turbopack.md
  turbopack: {
    root: import.meta.dirname,
  },
  async rewrites() {
    // Proxying /api and /uploads through the Next.js process means the browser
    // only ever talks to the frontend origin. Deploys can expose port 3000 (or
    // whatever fronts it) and keep FastAPI bound to localhost — no CORS, no
    // second port to publish. lib/api.ts must use a same-origin apiBase ("")
    // for this to take effect; see public/aurora.config.js.
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_ORIGIN}/api/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${BACKEND_ORIGIN}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
