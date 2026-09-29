import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kort — Tenis Kulübü",
    short_name: "Kort",
    description: "Kulüp üyeleri için maç, defi ve oyuncu uygulaması",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f0e7",
    theme_color: "#0b3d2c",
    lang: "tr",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
