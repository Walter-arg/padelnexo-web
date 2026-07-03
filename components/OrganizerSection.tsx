"use client";

import { motion } from "framer-motion";
import {
  Users, DollarSign, Calendar, BarChart3, RefreshCw,
  MapPin, Trophy, MessageSquare, FileText, Settings,
} from "lucide-react";

const items = [
  { icon: Users, title: "Organizá cientos de jugadores sin planillas", desc: "Cada jugador tiene su perfil, historial y datos centralizados. Nada en papel." },
  { icon: DollarSign, title: "Controlá quién pagó y quién debe", desc: "Panel de cobros en tiempo real. Comprobantes, estados y deudas a simple vista." },
  { icon: Calendar, title: "Armá fixtures automáticamente", desc: "Cargá los inscriptos y la plataforma genera las fechas, cruces y zonas en segundos." },
  { icon: BarChart3, title: "Publicá resultados al instante", desc: "Los jugadores ven posiciones, resultados y estadísticas sin preguntarte nada." },
  { icon: Trophy, title: "Administrá torneos completos", desc: "Cuadros eliminatorios, zonas, llaves dobles. Toda la complejidad resuelta." },
  { icon: RefreshCw, title: "Gestioná reemplazos fácilmente", desc: "Encontrá jugadores disponibles por zona y categoría sin mandar mensajes." },
  { icon: MapPin, title: "Controlá sedes y canchas", desc: "Asigná canchas a cada partido, gestioná horarios y sedes desde la app." },
  { icon: MessageSquare, title: "Centralizá toda la comunicación", desc: "Un solo canal para hablar con tus jugadores. Sin grupos de WhatsApp desbordados." },
  { icon: FileText, title: "Administrá varias ligas al mismo tiempo", desc: "Un panel único para gestionar múltiples competencias en paralelo." },
  { icon: Settings, title: "Configurá categorías a tu medida", desc: "Iniciante, intermedio, avanzado, +40, mixto. Lo que necesitás, como lo necesitás." },
];

export default function OrganizerSection() {
  return (
    <section id="organizadores" className="py-24 bg-gradient-to-br from-slate-50 to-pn-mint/30">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="inline-block bg-pn-navy text-pn-lime text-sm font-bold px-4 py-1.5 rounded-full mb-4">
            Para organizadores
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-pn-navy tracking-tight mb-5">
            Pensado para eliminar <br />
            <span className="text-pn-green">el trabajo administrativo repetitivo.</span>
          </h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Todo lo que antes te llevaba horas, ahora lo hacés en minutos.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-2 gap-5 max-w-4xl mx-auto">
          {items.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: (i % 2) * 0.1 }}
              whileHover={{ y: -3 }}
              className="flex gap-4 bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:border-pn-green/30 hover:shadow-md transition-all duration-200"
            >
              <div className="w-11 h-11 rounded-xl bg-pn-mint flex items-center justify-center flex-shrink-0">
                <item.icon size={20} className="text-pn-green" />
              </div>
              <div>
                <h3 className="font-bold text-pn-navy text-sm mb-1">{item.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mt-14"
        >
          <a
            href="#comenzar"
            className="inline-flex items-center gap-2 bg-pn-navy hover:bg-pn-navy-light text-white font-bold text-base px-10 py-4 rounded-2xl transition-all hover:scale-[1.02] shadow-lg"
          >
            Quiero organizar con PadelNexo
          </a>
        </motion.div>
      </div>
    </section>
  );
}
