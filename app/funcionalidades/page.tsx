import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FuncionalidadesShowcase from "@/components/FuncionalidadesShowcase";

export const metadata: Metadata = {
  title: "Funcionalidades | PadelNexo",
  description:
    "Conocé todo lo que PadelNexo hace por vos: ligas con fixture automático, torneos con cuadros inteligentes, turnos sin llamadas y directorio de jugadores con reemplazos automáticos.",
  alternates: { canonical: "https://www.padelnexo.com.ar/funcionalidades" },
};

export default function FuncionalidadesPage() {
  return (
    <main className="min-h-screen overflow-x-hidden" style={{ background: "#050E1A" }}>
      <Navbar />
      <div className="pt-16">
        <FuncionalidadesShowcase />
      </div>
      <Footer />
    </main>
  );
}
