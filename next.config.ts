import type { NextConfig } from "next";

/**
 * dev server บล็อกไฟล์ /_next/* เมื่อเปิดผ่านโดเมนอื่นนอกจาก localhost
 * ตอนทดสอบใน LINE ต้องเปิดผ่าน tunnel → อนุญาตเฉพาะโดเมนใน APP_BASE_URL
 * (เปลี่ยน APP_BASE_URL แล้วต้องรีสตาร์ท npm run dev)
 */
function devTunnelOrigins(): string[] {
  try {
    const host = new URL(process.env.APP_BASE_URL ?? '').hostname;
    return host && host !== 'localhost' ? [host] : [];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  allowedDevOrigins: devTunnelOrigins(),
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
};

export default nextConfig;
