import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:file*.svg",
        headers: [{ key: "Content-Type", value: "image/svg+xml" }],
      },
    ];
  },
};

export default nextConfig;
