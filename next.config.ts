import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.7.38"],
  async redirects() {
    return [{ source: "/calculator", destination: "/play", permanent: false }]
  },
};

export default nextConfig;
