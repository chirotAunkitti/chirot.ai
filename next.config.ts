import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export', // สำหรับ static export สำหรับ GitHub Pages
  basePath: '/chirot.ai', // ตั้งค่า base path สำหรับ GitHub Pages
  assetPrefix: '/chirot.ai', // ตั้งค่า asset prefix
  images: {
    unoptimized: true, // GitHub Pages ไม่รองรับ image optimization
  },
};

export default nextConfig;
