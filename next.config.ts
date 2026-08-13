import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server's internal (_next / HMR) requests when the site is
  // opened from another origin during preview — LAN devices and tunnels
  // (ngrok / cloudflared). This does not affect the UI, only dev networking.
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
