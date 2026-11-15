import type { MetadataRoute } from "next";

/**
 * F5 + D81: the installed app "Hiền Xa" — one app for the three portals (Vận hành / Thợ & tài xế / Khách hàng). iPhone installs it
 * from Safari ("Thêm vào MH chính"); Android installs the APK (a Trusted Web Activity over this same manifest, see /tai-app).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Hiền Xa",
    short_name: "Hiền Xa",
    description: "Bán hàng, giao hàng, kho và công nợ vật liệu xây dựng.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f2038",
    theme_color: "#172c49",
    lang: "vi",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
