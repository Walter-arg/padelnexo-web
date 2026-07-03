"use client";

import { motion } from "framer-motion";
import {
  Users, Trophy, DollarSign, Calendar, BarChart3, Bell,
  MessageSquare, Star, RefreshCw, MapPin, Clock, Shield, Zap,
} from "lucide-react";

const features = [
  { icon: Calendar, label: "Gestión de ligas", desc: "Organizá campeonatos completos con categorías, zonas y fechas." },
  { icon: Trophy, label: "Torneos", desc: "Armá cuadros eliminatorios y llaves automáticas en minutos." },
  { icon: DollarSign, label: "Centro de cobros", desc: "Controlá quién pagó, quién debe y recibí pagos con Mercado Pago." },
  { icon: Zap, label: "Fixture inteligente", desc: "Generación automática de partidos, fechas y cruces." },
  { icon: BarChart3, label: "Resultados en tiempo real", desc: "Los jugadores ven posiciones y resultados al instante." },
  { icon: MessageSquare, label: "Mensajería integrada", desc: "Comunicación directa con jugadores sin salir de la plataforma." },
  { icon: Star, label: "Ranking automático", desc: "Tabla de posiciones actualizada en cada resultado cargado." },
  { icon: Users, label: "Gestión de jugadores", desc: "Perfiles, historial, categoría y disponibilidad de cada jugador." },
  { icon: Bell, label: "Notificaciones", desc: "Avisá partidos, pagos y resultados con push notifications." },
  { icon: RefreshCw, label: "Reemplazos", desc: "Encontrá reemplazos para partidos sin jugadores disponibles." },
  { icon: MapPin, label: "Sedes y canchas", desc: "Administrá complejos, canchas y horarios desde la app." },
  { icon: Clock, label: "Reserva de turnos", desc: "Tus jugadores reservan canchas directamente desde PadelNexo." },
  { icon: Shield, label: "Estadísticas", desc: "Métricas de participación, cobros y actividad de tu liga." },
];

export default function WhySection() {
  return (
    <section id="funcionalidades" className="py-24 bg-pn-navy relative overflow-hidden">
      {/* Background decoration */}
      <div
        className="absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl opacity-10"
        style={{ background: "radial-gradient(circle, #1fa36d, transparent)" }}
      />

      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="inline-block bg-pn-green/10 border border-pn-green/20 text-pn-lime text-sm font-semibold px-4 py-1.5 rounded-full mb-4">
            Todo en uno
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-5 tracking-tight">
            ¿Por qué elegir PadelNexo?
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Una plataforma completa para que dejes de perder tiempo y empieces a
            organizar como un profesional.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <motion.div
              key={f.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: (i % 4) * 0.08 }}
              whileHover={{ y: -4, scale: 1.02 }}
              className="group bg-white/5 hover:bg-white/10 border border-white/8 hover:border-pn-green/40 rounded-2xl p-5 cursor-default transition-all duration-200"
            >
              <div className="w-10 h-10 rounded-xl bg-pn-green/15 group-hover:bg-pn-green/25 flex items-center justify-center mb-4 transition-colors">
                <f.icon size={20} className="text-pn-lime" />
              </div>
              <h3 className="font-bold text-white text-sm mb-1.5">{f.label}</h3>
              <p className="text-xs text-gray-400 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
