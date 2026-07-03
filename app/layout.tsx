import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PadelNexo | Organizá ligas y torneos de pádel en Argentina",
  description:
    "PadelNexo es la app para organizar ligas, torneos y reservas de pádel amateur en Argentina. Fixtures automáticos, cobros, rankings y más. ¡Gratis para empezar!",
  keywords: [
    "padel argentina",
    "ligas de padel",
    "torneos de padel argentina",
    "organizar liga de padel",
    "fixture padel automatico",
    "padel amateur",
    "reservas de padel",
    "padel san francisco cordoba",
    "gestion de padel",
    "app padel organizadores",
  ],
  alternates: {
    canonical: "https://www.padelnexo.com.ar",
  },
  openGraph: {
    title: "PadelNexo | Organizá ligas y torneos de pádel como un profesional",
    description:
      "La plataforma que reemplaza Excel, WhatsApp y el desorden. Gestioná jugadores, fixtures, pagos y resultados desde una sola app.",
    url: "https://www.padelnexo.com.ar",
    siteName: "PadelNexo",
    locale: "es_AR",
    type: "website",
    images: [
      {
        url: "https://www.padelnexo.com.ar/og-image.png",
        width: 1200,
        height: 630,
        alt: "PadelNexo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PadelNexo | Organizá ligas y torneos de pádel",
    description: "La plataforma todo-en-uno para organizar pádel amateur.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-AR" className={inter.variable}>
      <body className="bg-white">{children}</body>
    </html>
  );
}
