import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PricingToggle from "@/components/PricingToggle";
import { Zap, DollarSign, BarChart3 } from "lucide-react";

export const metadata: Metadata = {
  title: "Planes para organizadores | PadelNexo",
  description:
    "Conocé los planes de PadelNexo para organizadores de ligas y torneos de pádel en Argentina. Desde $49.000/mes. Probá 30 días gratis.",
  alternates: { canonical: "https://www.padelnexo.com.ar/planes" },
};

const keyFeatures = [
  {
    icon: Zap,
    title: "Fixture automático en segundos",
    desc: "Cargás los equipos y la plataforma genera fechas, cruces y zonas sola. Lo que antes te llevaba horas, ahora te lleva un tap.",
  },
  {
    icon: DollarSign,
    title: "Sabés exactamente quién pagó",
    desc: "Panel de cobros con MercadoPago integrado. Deudas, comprobantes y estados en tiempo real — sin perseguir a nadie por WhatsApp.",
  },
  {
    icon: BarChart3,
    title: "Rankings y resultados sin intermediarios",
    desc: "Tus jugadores ven posiciones, estadísticas y próximas fechas desde la app. Cero consultas, cero mensajes.",
  },
];

export default function PlanesPage() {
  return (
    <main className="min-h-screen bg-white overflow-x-hidden">
      <Navbar />

      {/* Hero — descubrimiento */}
      <section className="pt-32 pb-20 px-6 text-center bg-gradient-to-b from-pn-mint to-white">
        <p className="text-pn-green font-bold text-sm uppercase tracking-widest mb-3">
          Para organizadores
        </p>
        <h1 className="text-4xl md:text-5xl font-extrabold text-pn-navy leading-tight mb-4">
          Organizá tu liga o torneo<br className="hidden md:block" /> sin complicaciones
        </h1>
        <p className="text-gray-500 text-lg max-w-lg mx-auto mb-10">
          Fixtures, cobros y rankings — todo resuelto desde tu celular.
        </p>

        {/* 3 features clave */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-12">
          {keyFeatures.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-pn-mint flex items-center justify-center mb-4">
                <Icon size={20} className="text-pn-green" />
              </div>
              <h3 className="font-bold text-pn-navy text-sm mb-2">{title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <a
          href="#precios"
          className="inline-block bg-pn-green hover:bg-pn-dark text-white font-bold px-8 py-3.5 rounded-2xl transition-colors shadow-md"
        >
          Ver planes y precios
        </a>
      </section>

      {/* Puente hacia precios */}
      <section
        id="precios"
        className="py-16 px-6 text-center bg-gradient-to-b from-white to-pn-mint"
      >
        <p className="text-pn-green font-bold text-sm uppercase tracking-widest mb-3">
          Planes y precios
        </p>
        <h2 className="text-3xl md:text-4xl font-extrabold text-pn-navy mb-3">
          Elegí el plan ideal para vos
        </h2>
        <p className="text-gray-500 max-w-md mx-auto text-sm">
          Todos los planes incluyen fixtures automáticos y cobros con MercadoPago.
          <br />Nexo Plus incluye 30 días de prueba · Pagá anual y ahorrá un 20%
        </p>
      </section>

      {/* Billing toggle + plans grid */}
      <div className="pt-4">
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
