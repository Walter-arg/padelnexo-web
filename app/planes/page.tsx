import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PricingToggle from "@/components/PricingToggle";

export const metadata: Metadata = {
  title: "Planes para organizadores | PadelNexo",
  description:
    "Conocé los planes de PadelNexo para organizadores de ligas y torneos de pádel en Argentina. Desde $49.000/mes. Probá 30 días gratis.",
  alternates: { canonical: "https://www.padelnexo.com.ar/planes" },
};

export default function PlanesPage() {
  return (
    <main className="min-h-screen bg-white overflow-x-hidden">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 px-6 text-center bg-gradient-to-b from-pn-mint to-white">
        <p className="text-pn-green font-bold text-sm uppercase tracking-widest mb-3">
          Planes para organizadores
        </p>
        <h1 className="text-4xl md:text-5xl font-extrabold text-pn-navy leading-tight mb-4">
          Elegí el plan que se adapta<br className="hidden md:block" /> a tu actividad
        </h1>
        <p className="text-gray-500 text-lg max-w-xl mx-auto mb-2">
          Todos los planes incluyen acceso a la app, fixtures automáticos y cobros con MercadoPago.
        </p>
        <p className="text-pn-green font-semibold text-sm">
          Nexo Plus incluye 30 días de prueba gratuita · Pagá anual y ahorrá un 20%
        </p>
      </section>

      {/* Billing toggle + Plans grid (client component) */}
      <div className="pt-10">
        <PricingToggle />
      </div>

      {/* FAQ rápido */}
      <section className="max-w-2xl mx-auto px-6 pb-24">
        <h2 className="text-2xl font-extrabold text-pn-navy text-center mb-8">
          Preguntas frecuentes
        </h2>
        <div className="space-y-5">
          {[
            {
              q: "¿Cómo se realiza el pago?",
              a: "El pago se realiza mensualmente (o anualmente con 20% de descuento) por MercadoPago. Te contactamos por WhatsApp para coordinar la suscripción.",
            },
            {
              q: "¿Puedo cambiar de plan?",
              a: "Sí, podés subir o bajar de plan en cualquier momento. El cambio se aplica al siguiente ciclo de facturación.",
            },
            {
              q: "¿Qué pasa cuando termina el trial?",
              a: "Al finalizar los 30 días gratuitos de Nexo Plus, te avisamos para que elijas continuar con el plan o cambiar a otro.",
            },
            {
              q: "¿Puedo agregar más de un complejo?",
              a: "Por ahora los planes incluyen 1 complejo. Si necesitás más, contactanos y buscamos una solución.",
            },
          ].map(({ q, a }) => (
            <div key={q} className="border border-gray-100 rounded-xl p-5 bg-white shadow-sm">
              <p className="font-bold text-pn-navy mb-1.5">{q}</p>
              <p className="text-gray-500 text-sm leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
