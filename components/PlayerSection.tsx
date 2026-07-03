"use client";

import { motion } from "framer-motion";
import { Search, UserPlus, BarChart2, Calendar, CreditCard, Users, Clock, Bell, Smartphone } from "lucide-react";

const cards = [
  { icon: Search, title: "Encontrá ligas cercanas", desc: "Buscá competencias por zona, categoría y nivel." },
  { icon: UserPlus, title: "Inscribite fácil", desc: "Sumate a ligas y torneos en pocos taps." },
  { icon: BarChart2, title: "Seguí tu posición", desc: "Tabla de posiciones actualizada en tiempo real." },
  { icon: Calendar, title: "Consultá el fixture", desc: "Tus partidos, fechas y rivales siempre a mano." },
  { icon: CreditCard, title: "Pagá desde la app", desc: "Inscripciones con Mercado Pago, sin transferencias manuales." },
  { icon: Users, title: "Encontrá jugadores", desc: "Buscá compañeros o rivales por zona y disponibilidad." },
  { icon: Clock, title: "Mostrá tu disponibilidad", desc: "Indicá cuándo podés jugar para que te encuentren." },
  { icon: Bell, title: "Recibí notificaciones", desc: "Alertas de partidos, resultados y novedades de tu liga." },
  { icon: Smartphone, title: "Todo desde el celular", desc: "Sin computadora, sin papeles. Solo tu teléfono." },
];

export default function PlayerSection() {
  return (
    <section id="jugadores" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="inline-block bg-pn-mint border border-pn-green/20 text-pn-dark text-sm font-semibold px-4 py-1.5 rounded-full mb-4">
            Para jugadores
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-pn-navy tracking-tight mb-5">
            También mejora tu <br />
            <span className="text-pn-green">experiencia como jugador.</span>
          </h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Todo lo que necesitás para jugar más y mejor, desde el celular.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {cards.map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: (i % 3) * 0.08 }}
              whileHover={{ y: -4 }}
              className="group flex gap-4 p-6 rounded-2xl border border-gray-100 hover:border-pn-green/40 hover:shadow-lg hover:shadow-pn-green/5 transition-all duration-200 bg-white"
            >
              <div className="w-10 h-10 rounded-xl bg-pn-mint group-hover:bg-pn-green/15 flex items-center justify-center flex-shrink-0 transition-colors">
                <card.icon size={18} className="text-pn-green" />
              </div>
              <div>
                <h3 className="font-bold text-pn-navy text-sm mb-1">{card.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{card.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
