import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Check, X, MessageCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Planes para organizadores | PadelNexo",
  description:
    "Conocé los planes de PadelNexo para organizadores de ligas y torneos de pádel en Argentina. Desde $49.000/mes. Probá 30 días gratis.",
  alternates: { canonical: "https://www.padelnexo.com.ar/planes" },
};

const plans = [
  {
    id: "simple",
    name: "Nexo Simple",
    price: "49.000",
    description: "Para empezar a organizar con lo esencial.",
    highlight: false,
    trial: false,
    features: [
      { label: "Gestión desde la app móvil", included: true },
      { label: "Acceso desde la web", included: false },
      { label: "Hasta 3 canchas", included: true },
      { label: "3 ligas por mes", included: true },
      { label: "2 torneos por mes", included: true },
      { label: "Reservas online (turnos)", included: false },
      { label: "Integración con MercadoPago", included: true },
      { label: "1 complejo", included: true },
      { label: "Soporte por email", included: true },
      { label: "Soporte prioritario por WhatsApp", included: false },
    ],
  },
  {
    id: "plus",
    name: "Nexo Plus",
    price: "75.000",
    description: "El plan más elegido por organizadores activos.",
    highlight: true,
    trial: true,
    features: [
      { label: "Gestión desde la app móvil", included: true },
      { label: "Acceso desde la web", included: true },
      { label: "Hasta 6 canchas", included: true },
      { label: "6 ligas por mes", included: true },
      { label: "4 torneos por mes", included: true },
      { label: "Reservas online (turnos)", included: true },
      { label: "Integración con MercadoPago", included: true },
      { label: "1 complejo", included: true },
      { label: "Soporte por email", included: true },
      { label: "Soporte prioritario por WhatsApp", included: false },
    ],
  },
  {
    id: "premium",
    name: "Nexo Premium",
    price: "99.000",
    description: "Sin límites para organizadores de alto volumen.",
    highlight: false,
    trial: false,
    features: [
      { label: "Gestión desde la app móvil", included: true },
      { label: "Acceso desde la web", included: true },
      { label: "Canchas ilimitadas", included: true },
      { label: "Ligas ilimitadas", included: true },
      { label: "Torneos ilimitados", included: true },
      { label: "Reservas online (turnos)", included: true },
      { label: "Integración con MercadoPago", included: true },
      { label: "1 complejo", included: true },
      { label: "Soporte por email", included: true },
      { label: "Soporte prioritario por WhatsApp + llamada", included: true },
    ],
  },
];

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
          Nexo Plus incluye 30 días de prueba gratuita.
        </p>
      </section>

      {/* Plans grid */}
      <section className="max-w-5xl mx-auto px-6 pb-20 grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`relative rounded-2xl border flex flex-col ${
              plan.highlight
                ? "border-pn-green bg-pn-navy shadow-2xl shadow-pn-green/20 scale-[1.03]"
                : "border-gray-200 bg-white shadow-sm"
            }`}
          >
            {plan.highlight && (
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="bg-pn-green text-white text-xs font-bold px-4 py-1 rounded-full shadow">
                  Más elegido
                </span>
              </div>
            )}
            {plan.trial && (
              <div className="absolute -top-3.5 right-5">
                <span className="bg-pn-lime text-pn-navy text-xs font-bold px-3 py-1 rounded-full shadow">
                  30 días gratis
                </span>
              </div>
            )}

            <div className="p-7 flex-1">
              <p
                className={`text-xs font-bold uppercase tracking-widest mb-1 ${
                  plan.highlight ? "text-pn-green" : "text-pn-green"
                }`}
              >
                {plan.name}
              </p>
              <div className="flex items-end gap-1 mb-1">
                <span
                  className={`text-3xl font-extrabold ${
                    plan.highlight ? "text-white" : "text-pn-navy"
                  }`}
                >
                  ${plan.price}
                </span>
                <span
                  className={`text-sm mb-1 ${
                    plan.highlight ? "text-gray-300" : "text-gray-400"
                  }`}
                >
                  /mes
                </span>
              </div>
              <p
                className={`text-sm mb-6 ${
                  plan.highlight ? "text-gray-300" : "text-gray-500"
                }`}
              >
                {plan.description}
              </p>

              <ul className="space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature.label} className="flex items-start gap-2.5">
                    {feature.included ? (
                      <Check
                        size={16}
                        className="text-pn-green mt-0.5 shrink-0"
                        strokeWidth={2.5}
                      />
                    ) : (
                      <X
                        size={16}
                        className={`mt-0.5 shrink-0 ${
                          plan.highlight ? "text-gray-500" : "text-gray-300"
                        }`}
                        strokeWidth={2}
                      />
                    )}
                    <span
                      className={`text-sm ${
                        feature.included
                          ? plan.highlight
                            ? "text-gray-100"
                            : "text-gray-700"
                          : plan.highlight
                            ? "text-gray-500"
                            : "text-gray-400"
                      }`}
                    >
                      {feature.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-7 pt-0">
              <a
                href={`https://wa.me/543564555555?text=Hola%2C%20quiero%20contratar%20el%20plan%20${encodeURIComponent(plan.name)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-sm transition-colors ${
                  plan.highlight
                    ? "bg-pn-green hover:bg-pn-dark text-white"
                    : "bg-pn-mint hover:bg-pn-mint-dark text-pn-navy"
                }`}
              >
                <MessageCircle size={16} />
                {plan.trial ? "Empezar prueba gratis" : "Contratar plan"}
              </a>
            </div>
          </div>
        ))}
      </section>

      {/* FAQ rápido */}
      <section className="max-w-2xl mx-auto px-6 pb-24">
        <h2 className="text-2xl font-extrabold text-pn-navy text-center mb-8">
          Preguntas frecuentes
        </h2>
        <div className="space-y-5">
          {[
            {
              q: "¿Cómo se realiza el pago?",
              a: "El pago se realiza mensualmente por MercadoPago. Te contactamos por WhatsApp para coordinar la suscripción.",
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
