import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: false,
  },
  async redirects() {
    return [
      {
        source: "/politica-privacidad",
        destination: "/privacidad",
        permanent: true,
      },
      {
        source: "/politica-privacidad/",
        destination: "/privacidad",
        permanent: true,
      },
      {
        source: "/terminos-condiciones",
        destination: "/terminos",
        permanent: true,
      },
      {
        source: "/terminos-condiciones/",
        destination: "/terminos",
        permanent: true,
      },
      {
        source: "/funcionalidades",
        destination: "/funcionalidades-app-padel",
        permanent: true,
      },
      {
        source: "/funcionalidades/",
        destination: "/funcionalidades-app-padel",
        permanent: true,
      },
      {
        source: "/planes",
        destination: "/precios-app-padel",
        permanent: true,
      },
      {
        source: "/planes/",
        destination: "/precios-app-padel",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
