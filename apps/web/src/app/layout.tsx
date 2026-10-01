import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/pwa";
import { AuthProvider } from "@/lib/auth";
import { ClubProvider } from "@/lib/club";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin", "latin-ext"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: { default: "Kort", template: "%s · Kort" },
  description: "Tenis kulübü için maç, defi ve oyuncu uygulaması",
  applicationName: "Kort",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Kort", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0b3d2c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className={`${outfit.variable} antialiased`}>
        <AuthProvider>
          <ClubProvider>
            <ServiceWorkerRegister />
            {children}
          </ClubProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
