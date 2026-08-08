"use client";

import { useState } from "react";
import { Check, X, MessageCircle } from "lucide-react";

type Billing = "monthly" | "annual";

const plans = [
  {
    id: "simple",
    name: "Nexo Simple",
    monthlyPrice: "49.000",
    annualPrice: "39.200",
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
    monthlyPrice: "75.000",
    annualPrice: "60.000",
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
    monthlyPrice: "99.000",
    annualPrice: "79.200",
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

export default function PricingToggle() {
  const [billing, setBilling] = useState<Billing>("monthly");
  const isAnnual = billing === "annual";

  return (
    <>
      {/* Billing toggle */}
      <div className="flex flex-col items-center gap-2 mb-10">
        <div className="flex items-center gap-1 p-1 rounded-2xl" style={{ background: "#EEF8F1", border: "1px solid #CFE7DC" }}>
          <button
            onClick={() => setBilling("monthly")}
            className="px-6 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={
              !isAnnual
                ? { background: "#0B8457", color: "#fff" }
                : { background: "transparent", color: "#5F7D72" }
            }
          >
            Mensual
          </button>
          <button
            onClick={() => setBilling("annual")}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={
              isAnnual
                ? { background: "#0B8457", color: "#fff" }
                : { background: "transparent", color: "#5F7D72" }
            }
          >
            Anual
            <span
              className="text-xs font-black px-2 py-0.5 rounded-full"
              style={
                isAnnual
                  ? { background: "#A8EDCA", color: "#0B4D2E" }
                  : { background: "#CFE7DC", color: "#0B8457" }
              }
            >
              −20%
            </span>
          </button>
        </div>
        {isAnnual && (
          <p className="text-xs font-semibold" style={{ color: "#0B8457" }}>
            Pagás todo el año y ahorrás 20% — sin preocuparte mes a mes
          </p>
        )}
      </div>

      {/* Plans grid */}
      <section className="max-w-5xl mx-auto px-6 pb-20 grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;
          const waText = isAnnual
            ? `Hola, quiero contratar el plan ${plan.name} (anual)`
            : `Hola, quiero contratar el plan ${plan.name}`;

          return (
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
              {plan.trial && !isAnnual && (
                <div className="absolute -top-3.5 right-5">
                  <span className="bg-pn-lime text-pn-navy text-xs font-bold px-3 py-1 rounded-full shadow">
                    30 días gratis
                  </span>
                </div>
              )}
              {isAnnual && (
                <div className="absolute -top-3.5 right-5">
                  <span className="text-xs font-bold px-3 py-1 rounded-full shadow"
                    style={{ background: "#A8EDCA", color: "#0B4D2E" }}>
                    20% OFF
                  </span>
                </div>
              )}

              <div className="p-7 flex-1">
                <p className="text-xs font-bold uppercase tracking-widest mb-1 text-pn-green">
                  {plan.name}
                </p>
                <div className="flex items-end gap-1 mb-1">
                  <span
                    className={`text-3xl font-extrabold ${
                      plan.highlight ? "text-white" : "text-pn-navy"
                    }`}
                  >
                    ${price}
                  </span>
                  <span
                    className={`text-sm mb-1 ${
                      plan.highlight ? "text-gray-300" : "text-gray-400"
                    }`}
                  >
                    /mes
                  </span>
                </div>
                {isAnnual && (
                  <p className="text-xs font-semibold mb-1" style={{ color: plan.highlight ? "#A8EDCA" : "#0B8457" }}>
                    ${(parseInt(price.replace(".", "")) * 12).toLocaleString("es-AR")}/año
                  </p>
                )}
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
                  href={`https://wa.me/5493564220428?text=${encodeURIComponent(waText)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-sm transition-colors ${
                    plan.highlight
                      ? "bg-pn-green hover:bg-pn-dark text-white"
                      : "bg-pn-mint hover:bg-pn-mint/70 text-pn-navy"
                  }`}
                >
                  <MessageCircle size={16} />
                  {plan.trial && !isAnnual ? "Empezar prueba gratis" : isAnnual ? "Contratar plan anual" : "Contratar plan"}
                </a>
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}
