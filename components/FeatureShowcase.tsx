"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Calendar, Clock } from "lucide-react";

const tabs = [
  {
    id: "ligas",
    label: "Ligas",
    icon: Trophy,
    headline: "Todos tus torneos bajo control.",
    desc: "Fixture, tabla de posiciones, resultados, próximas fechas y estadísticas. Los jugadores siguen los torneos en tiempo real sin preguntarte nada. Elegís cómo se confirma una inscripción: con pago parcial, pago total o sin haber realizado el pago.",
    highlights: [
      "Fixture automático por fechas",
      "Tabla de posiciones en vivo",
      "Histórico de resultados",
      "Carga de resultados desde la app",
      "Gestión de múltiples categorías",
      "Inscripción con pago parcial, total o sin pago",
    ],
    screen: "/imagen_puntaje_ligas.jpg",
    color: "from-blue-600 to-pn-navy",
  },
  {
    id: "torneos",
    label: "Torneos",
    icon: Trophy,
    headline: "Torneos sin caos.",
    desc: "Organizá inscripciones, zonas, cuadros eliminatorios, resultados y categorías desde una sola pantalla. La plataforma se encarga del resto.",
    highlights: [
      "Cuadros eliminatorios automáticos",
      "Zonas y grupos configurables",
      "Llaves simples y dobles",
      "Pagos de inscripción integrados",
      "Gestión de sedes y canchas",
      "Publicación de resultados",
    ],
    screen: "/imagen_zonas_torneos.jpg",
    color: "from-amber-500 to-orange-600",
  },
  {
    id: "turnos",
    label: "Turnos",
    icon: Clock,
    headline: "Reservas rápidas, sin llamadas.",
    desc: "Tus jugadores ven los horarios disponibles y reservan cancha directamente desde la app. Sin llamadas, sin WhatsApp, sin confusión.",
    highlights: [
      "Horarios disponibles en tiempo real",
      "Reserva en pocos taps",
      "Múltiples complejos",
      "Historial de reservas",
      "Notificación de confirmación",
      "Pago integrado",
    ],
    screen: "/imagen_reserva_turnos.jpg",
    color: "from-pn-green to-pn-dark",
  },
  {
    id: "fixture",
    label: "Fixture",
    icon: Calendar,
    headline: "Fixtures en segundos.",
    desc: "Cargá los equipos o jugadores y PadelNexo genera el fixture completo automáticamente. Editalo, publicalo y notificá a todos en un click.",
    highlights: [
      "Generación automática",
      "Modalidades configurables",
      "Asignación de canchas",
      "Publicación con un tap",
      "Edición flexible",
      "Integrado con rankings",
    ],
    screen: "/imagen_fecha_liga.jpg",
    color: "from-violet-600 to-purple-700",
  },
];

export default function FeatureShowcase() {
  const [active, setActive] = useState(tabs[0]);

  return (
    <section className="py-24 bg-pn-navy overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-4">
            Una plataforma. <span className="text-pn-lime">Todo resuelto.</span>
          </h2>
          <p className="text-lg text-gray-400 max-w-xl mx-auto">
            Explorá las principales funcionalidades que hacen de PadelNexo la herramienta
            indispensable para tu liga o torneo.
          </p>
        </motion.div>

        {/* Tabs */}
        <div className="flex flex-wrap justify-center gap-3 mb-12">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActive(tab)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 ${
                active.id === tab.id
                  ? "bg-pn-green text-white shadow-lg shadow-pn-green/30"
                  : "bg-white/8 text-gray-400 hover:bg-white/15 hover:text-white"
              }`}
            >
              <tab.icon size={15} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3 }}
            className="grid lg:grid-cols-2 gap-12 items-center"
          >
            {/* Left */}
            <div>
              <h3 className="text-3xl md:text-4xl font-black text-white mb-4 leading-tight">
                {active.headline}
              </h3>
              <p className="text-gray-400 text-lg mb-8 leading-relaxed">{active.desc}</p>
              <ul className="grid grid-cols-2 gap-3">
                {active.highlights.map((h) => (
                  <li key={h} className="flex items-center gap-2.5 text-sm text-gray-300">
                    <div className="w-4 h-4 rounded-full bg-pn-green/20 flex items-center justify-center flex-shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-pn-lime" />
                    </div>
                    {h}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right: phone mockup */}
            <div className="flex justify-center">
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 5, repeat: Infinity }}
                className="relative"
                style={{ width: 240 }}
              >
                <div
                  className="rounded-[40px] overflow-hidden shadow-2xl"
                  style={{
                    background: "linear-gradient(145deg, #1a1a2e, #0d2438)",
                    padding: "10px",
                    boxShadow: "0 30px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)",
                  }}
                >
                  <div className="rounded-[32px] overflow-hidden bg-gray-200" style={{ height: 480 }}>
                    <img
                      src={active.screen}
                      alt={active.label}
                      className="w-full h-full object-cover object-top"
                    />
                  </div>
                </div>
                <div
                  className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-40 h-16 rounded-full blur-2xl -z-10"
                  style={{ background: "rgba(31,163,109,0.35)" }}
                />
              </motion.div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
