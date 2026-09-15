import type { Metadata, Viewport } from "next";
import "./globals.css";
import ClerkSession from "@/components/clerk-session";
import { ClerkProvider } from "@clerk/nextjs";
export const metadata: Metadata = {
  title: "Remember",
  description: "A quiet place for what matters.",
  applicationName: "Remember",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Remember" },
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f8f4",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
          <ClerkProvider>
            <ClerkSession />
            {children}
          </ClerkProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
