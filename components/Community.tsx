"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export default function Community() {
  return (
    <section className="py-32 bg-pn-navy relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #1fa36d, transparent)" }}
        />
        <div
          className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #c8f53d, transparent)" }}
        />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      <div className="relative max-w-5xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-white/8 border border-white/12 rounded-full px-5 py-2 mb-10">
            <span className="text-2xl">🎾</span>
            <span className="text-gray-400 text-sm font-semibold">Comunidad PadelNexo</span>
          </div>

          <h2 className="text-5xl md:text-6xl lg:text-7xl font-black text-white leading-[1.05] tracking-tight mb-8">
            No solo organizamos torneos.
            <br />
            <span
              className="text-transparent bg-clip-text"
              style={{
                backgroundImage: "linear-gradient(90deg, #1fa36d, #c8f53d)",
              }}
            >
              Conectamos jugadores.
            </span>
          </h2>

          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-12 leading-relaxed">
            PadelNexo no es solo una herramienta de gestión. Es el espacio donde
            la comunidad del pádel amateur se organiza, compite y crece junta.
          </p>

          {/* Stats row */}
          <div className="flex flex-wrap justify-center gap-8 mb-14">
            {[
              { emoji: "🏆", label: "Torneos organizados", value: "50+" },
              { emoji: "🎾", label: "Partidos jugados", value: "2000+" },
              { emoji: "👥", label: "Jugadores conectados", value: "1000+" },
              { emoji: "📍", label: "Ciudades", value: "10+" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-3xl mb-1">{s.emoji}</div>
                <div className="text-2xl font-black text-pn-lime">{s.value}</div>
                <div className="text-xs text-gray-500 font-medium mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="#comenzar"
              className="inline-flex items-center justify-center gap-2 bg-pn-lime hover:bg-yellow-300 text-pn-navy font-black text-base px-10 py-4 rounded-2xl transition-all hover:scale-[1.03] shadow-xl shadow-pn-lime/20"
            >
              Unirme a PadelNexo
              <ArrowRight size={18} />
            </a>
            <a
              href="#contacto"
              className="inline-flex items-center justify-center gap-2 border border-white/20 hover:border-white/40 text-white font-bold text-base px-10 py-4 rounded-2xl transition-all hover:bg-white/5"
            >
              Hablar con el equipo
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
