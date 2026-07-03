"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Minus } from "lucide-react";

const faqs = [
  {
    q: "¿PadelNexo es gratis?",
    a: "PadelNexo tiene un plan gratuito para empezar. Los organizadores pueden acceder a funcionalidades avanzadas a través de planes premium. Contactanos para conocer las opciones disponibles.",
  },
  {
    q: "¿Necesito instalar algo para organizar una liga?",
    a: "Los organizadores gestionan todo desde la app móvil (Android). No se necesita ninguna configuración técnica ni conocimientos especiales.",
  },
  {
    q: "¿Cómo funciona el cobro de inscripciones?",
    a: "PadelNexo integra Mercado Pago para que los jugadores puedan pagar sus inscripciones directamente desde la app. El dinero va a la cuenta Mercado Pago del organizador.",
  },
  {
    q: "¿Puedo organizar múltiples ligas al mismo tiempo?",
    a: "Sí. PadelNexo permite gestionar varias ligas y torneos en paralelo desde el mismo panel de administración.",
  },
  {
    q: "¿Los jugadores también necesitan la app?",
    a: "Sí, los jugadores usan la misma app para ver fixtures, posiciones, pagar inscripciones y comunicarse con el organizador.",
  },
  {
    q: "¿Está disponible para iOS?",
    a: "Por el momento PadelNexo está disponible para Android. La versión para iOS está en desarrollo y estará disponible próximamente.",
  },
  {
    q: "¿Puedo usar PadelNexo para torneos eliminatorios?",
    a: "Sí. PadelNexo soporta cuadros eliminatorios simples y dobles, zonas de grupos, y llaves automáticas para torneos de cualquier tamaño.",
  },
  {
    q: "¿Qué pasa si los jugadores no tienen la app?",
    a: "Los jugadores reciben un link de invitación para descargar la app y unirse a la liga. El proceso de incorporación es muy sencillo.",
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="py-24 bg-slate-50">
      <div className="max-w-3xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <h2 className="text-4xl md:text-5xl font-black text-pn-navy tracking-tight mb-4">
            Preguntas frecuentes
          </h2>
          <p className="text-lg text-gray-500">
            ¿Tenés dudas? Acá respondemos las más comunes.
          </p>
        </motion.div>

        <div className="flex flex-col gap-3">
          {faqs.map((faq, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04 }}
              className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm"
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="font-semibold text-pn-navy pr-4">{faq.q}</span>
                <div className="w-7 h-7 rounded-full bg-pn-mint flex items-center justify-center flex-shrink-0">
                  {open === i ? (
                    <Minus size={14} className="text-pn-green" />
                  ) : (
                    <Plus size={14} className="text-pn-green" />
                  )}
                </div>
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: "auto" }}
                    exit={{ height: 0 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden"
                  >
                    <p className="px-6 pb-5 text-gray-500 leading-relaxed">{faq.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center mt-10 text-gray-500"
        >
          ¿No encontrás lo que buscás?{" "}
          <a href="mailto:padelnexo@gmail.com" className="text-pn-green font-semibold hover:underline">
            Escribinos
          </a>
        </motion.div>
      </div>
    </section>
  );
}
