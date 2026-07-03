"use client";

import { motion } from "framer-motion";
import { DollarSign, Eye, FileCheck, CreditCard, Clock, History, CheckCircle } from "lucide-react";

const features = [
  { icon: Eye, label: "Visualizá todos los pagos" },
  { icon: DollarSign, label: "Controlá deudas por jugador" },
  { icon: FileCheck, label: "Revisá comprobantes adjuntos" },
  { icon: CreditCard, label: "Cobrá con Mercado Pago" },
  { icon: CheckCircle, label: "Confirmá pagos al instante" },
  { icon: Clock, label: "Controlá vencimientos" },
  { icon: History, label: "Historial completo de cobros" },
];

export default function PaymentCenter() {
  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: visual */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="relative flex justify-center"
          >
            <div
              className="rounded-[40px] overflow-hidden shadow-2xl"
              style={{
                background: "linear-gradient(145deg, #1a1a2e, #0d2438)",
                padding: "10px",
                boxShadow: "0 30px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)",
                width: 280,
              }}
            >
              <div className="rounded-[32px] overflow-hidden bg-gray-200" style={{ height: 520 }}>
                <img
                  src="/imagen_pago_ligas.jpg"
                  alt="Centro de cobros PadelNexo"
                  className="w-full h-full object-cover object-top"
                />
              </div>
            </div>
            <div
              className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-48 h-20 rounded-full blur-3xl -z-10"
              style={{ background: "rgba(31,163,109,0.3)" }}
            />
          </motion.div>

          {/* Right: text */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <span className="inline-block bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold px-4 py-1.5 rounded-full mb-6">
              Funcionalidad diferencial
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-pn-navy tracking-tight mb-5">
              Centro de Cobros.{" "}
              <span className="text-pn-green">Sin excusas.</span>
            </h2>
            <p className="text-lg text-gray-500 mb-8 leading-relaxed">
              Olvidate de rastrear transferencias por WhatsApp o llevar un Excel
              de quién pagó. Con PadelNexo tenés todo centralizado en un panel
              claro y en tiempo real.
            </p>
            <ul className="flex flex-col gap-3 mb-8">
              {features.map((f) => (
                <li key={f.label} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-pn-mint flex items-center justify-center flex-shrink-0">
                    <f.icon size={16} className="text-pn-green" />
                  </div>
                  <span className="text-gray-700 font-medium text-sm">{f.label}</span>
                </li>
              ))}
            </ul>
            <a
              href="#comenzar"
              className="inline-flex items-center gap-2 bg-pn-green hover:bg-pn-dark text-white font-bold px-8 py-4 rounded-2xl transition-all hover:scale-[1.02] shadow-lg shadow-pn-green/20"
            >
              Conocer el Centro de Cobros
            </a>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
