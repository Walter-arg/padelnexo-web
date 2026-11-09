import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/login", "/forgot-password"],
      },
    ],
    sitemap: "https://www.padelnexo.com.ar/sitemap.xml",
  };
}
