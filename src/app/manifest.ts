import type { MetadataRoute } from "next";

/** F5: "Thêm vào màn hình chính" so phones (iPhone needs it) can receive notifications from the ERP. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hiền Xa ERP",
    short_name: "Hiền Xa",
    description: "Bán hàng, giao hàng, kho và công nợ vật liệu xây dựng.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f2038",
    theme_color: "#172c49",
    lang: "vi",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
