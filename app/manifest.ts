import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Remember",
    short_name: "Remember",
    description: "Your private memory timeline",
    start_url: "/capture",
    display: "standalone",
    background_color: "#f7f8f4",
    theme_color: "#355849",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
