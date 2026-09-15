import type { NextConfig } from "next";
const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const clerkHost = clerkKey
  ? Buffer.from(clerkKey.replace(/^pk_(test|live)_/, ""), "base64")
      .toString()
      .replace(/\$$/, "")
  : "";
const clerkOrigin = /^[a-z0-9.-]+$/.test(clerkHost)
  ? `https://${clerkHost}`
  : "";
const config: NextConfig = {
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline' ${clerkOrigin} https://challenges.cloudflare.com https://*.protect.clerk.com ${process.env.NODE_ENV === "development" ? "'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://img.clerk.com ${clerkOrigin}; connect-src 'self' ${clerkOrigin} https://clerk-telemetry.com https://*.protect.clerk.com:*; worker-src 'self' blob:; frame-src 'self' ${clerkOrigin} https://challenges.cloudflare.com https://*.protect.clerk.com; font-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`,
          },
        ],
      },
    ];
  },
};
export default config;
