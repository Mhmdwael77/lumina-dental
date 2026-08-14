import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // -------------------------------------------------------------------------
  // Performance
  // -------------------------------------------------------------------------

  // Gzip / Brotli compression on all responses (production builds).
  compress: true,

  // Drop the X-Powered-By header — tiny security + bandwidth win.
  poweredByHeader: false,

  // Image optimization
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 31536000,
  },

  // Tell Next.js these packages use barrel exports so it can tree-shake them
  // per-page instead of bundling the whole library.
  experimental: {
    optimizePackageImports: ["lucide-react", "gsap", "framer-motion"],
  },

  // -------------------------------------------------------------------------
  // Dev networking — allow preview from LAN / tunnels
  // -------------------------------------------------------------------------
  allowedDevOrigins: [
    "192.168.1.8", // this machine's current LAN IP (update if it changes)
    "192.168.1.*", // other devices on the same Wi-Fi subnet
    "*.ngrok-free.app",
    "*.ngrok.app",
    "*.ngrok.io",
    "*.trycloudflare.com",
  ],
};

export default nextConfig;
