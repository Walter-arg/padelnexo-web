"use client";

import { motion } from "framer-motion";
import { X, Check } from "lucide-react";

const rows = [
  { before: "Excel para llevar tablas y posiciones", after: "Fixture y tabla de posiciones automáticas" },
  { before: "WhatsApp para avisar resultados y partidos", after: "Notificaciones push automáticas desde la app" },
  { before: "Transferencias difíciles de controlar", after: "Centro de cobros integrado con Mercado Pago" },
  { before: "Consultas repetidas de jugadores", after: "Toda la info disponible en la app 24/7" },
  { before: "Armado manual de fechas y cruces", after: "Generación automática del campeonato" },
  { before: "Múltiples herramientas separadas", after: "Una única plataforma para todo" },
  { before: "Sin control de inscriptos ni cupos", after: "Gestión de inscripciones en tiempo real" },
  { before: "Reemplazos coordinados por WhatsApp", after: "Sistema de reemplazos integrado en la app" },
];

export default function BeforeAfter() {
  return (
    <section className="py-24 bg-white">
      <div className="max-w-5xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="inline-block bg-pn-mint border border-pn-green/20 text-pn-dark text-sm font-semibold px-4 py-1.5 rounded-full mb-4">
            Antes vs. Después
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-pn-navy tracking-tight mb-5">
            Dejá atrás el caos. <br />
            <span className="text-pn-green">Optimizá tu organización.</span>
          </h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Esto es lo que cambia cuando usás PadelNexo.
          </p>
        </motion.div>

        {/* Headers */}
        <div className="grid grid-cols-2 gap-4 mb-3 px-4">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 text-sm font-bold text-red-500 bg-red-50 px-4 py-1.5 rounded-full">
              <X size={14} /> Sin PadelNexo
            </span>
          </div>
          <div className="text-center">
            <span className="inline-flex items-center gap-2 text-sm font-bold text-pn-dark bg-pn-mint px-4 py-1.5 rounded-full">
              <Check size={14} /> Con PadelNexo
            </span>
          </div>
        </div>

        {/* Rows */}
        <div className="flex flex-col gap-3">
          {rows.map((row, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
              className="grid grid-cols-2 gap-4"
            >
              {/* Before */}
              <div className="flex items-center gap-3 bg-red-50/60 border border-red-100 rounded-2xl px-5 py-4">
                <X size={16} className="text-red-400 flex-shrink-0" />
                <span className="text-sm text-gray-600">{row.before}</span>
              </div>
              {/* After */}
              <div className="flex items-center gap-3 bg-pn-mint border border-pn-green/20 rounded-2xl px-5 py-4">
                <Check size={16} className="text-pn-green flex-shrink-0" />
                <span className="text-sm font-medium text-pn-navy">{row.after}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
