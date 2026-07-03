"use client";

import { motion } from "framer-motion";

const stats = [
  { value: "1000+", label: "Jugadores registrados" },
  { value: "100+", label: "Ligas activas" },
  { value: "50+", label: "Torneos organizados" },
  { value: "100%", label: "Plataforma completa" },
];

export default function Stats() {
  return (
    <section className="bg-pn-navy py-16">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="text-center"
            >
              <div className="text-4xl lg:text-5xl font-black text-pn-lime mb-2">
                {stat.value}
              </div>
              <div className="text-sm text-gray-400 font-medium">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
