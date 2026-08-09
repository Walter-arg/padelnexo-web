"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Calendar, Clock, Users, ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";

type CategoryId = "ligas" | "torneos" | "turnos" | "jugadores";

const categories = [
  {
    id: "ligas" as CategoryId,
    Icon: Trophy,
    label: "Ligas",
    tagline: "Fixture automático. Pagos sin perseguir. Reemplazos en un tap.",
    cardBg: "linear-gradient(145deg, #0F1F3D 0%, #1B3462 100%)",
    accent: "#60A5FA",
    accentHex: "#60A5FA",
    panelBg: "#0F172A",
    chipBg: "rgba(96,165,250,0.15)",
    painHeadline: "¿Cuántas veces tuviste que perseguir un pago esta semana?",
    solution:
      "Con PadelNexo armás la liga, los jugadores se inscriben, el fixture se genera solo y los pagos llegan por MercadoPago. Vos gestionás desde un panel — no corrés detrás de nadie.",
    features: [
      { emoji: "⚡", title: "Fixture en segundos", desc: "Cargás los jugadores y la plataforma genera fechas, cruces y zonas automáticamente. Sin Excel, sin cálculos." },
      { emoji: "💳", title: "Pagos que se registran solos", desc: "Cuando alguien paga con MercadoPago, el sistema lo registra solo. Sin revisar transferencias ni marcar nada a mano." },
      { emoji: "🔄", title: "Reemplazos sin WhatsApp", desc: "Un jugador falta. Los disponibles se postulan solos desde la app. Vos elegís quién entra y listo." },
      { emoji: "📊", title: "Tabla de posiciones en vivo", desc: "Cero consultas de '¿cómo quedó la tabla?'. Los jugadores la ven actualizada en tiempo real desde su celular." },
      { emoji: "📱", title: "Los jugadores ven todo solos", desc: "Fixture, resultados, pagos y fechas. Sin que tengas que reenviar nada ni contestar preguntas repetidas." },
      { emoji: "🗂️", title: "Múltiples ligas, un solo panel", desc: "Manejás varias ligas y categorías desde un mismo lugar. Sin tabs de WhatsApp ni confusión." },
    ],
  },
  {
    id: "torneos" as CategoryId,
    Icon: Calendar,
    label: "Torneos",
    tagline: "Inscripciones con disponibilidad incluida. Cuadros generados automáticamente.",
    cardBg: "linear-gradient(145deg, #3B1400 0%, #7C2D12 100%)",
    accent: "#FB923C",
    accentHex: "#FB923C",
    panelBg: "#1C0A00",
    chipBg: "rgba(251,146,60,0.15)",
    painHeadline: "¿Todavía coordinás los horarios del torneo por WhatsApp, uno por uno?",
    solution:
      "Los jugadores se inscriben desde la app con su disponibilidad ya incluida. La plataforma recomienda las zonas, arma las llaves y genera los cuadros. Vos confirmás — ella trabaja.",
    features: [
      { emoji: "📋", title: "Inscripción con disponibilidad incluida", desc: "Al anotarse, cada jugador declara cuándo puede jugar. Sin coordinar nada por separado." },
      { emoji: "🧩", title: "Zonas recomendadas por la app", desc: "La app analiza las parejas confirmadas y recomienda el formato óptimo. Presets de 6 a 16+ parejas." },
      { emoji: "🏅", title: "Llaves con byes automáticos", desc: "Los cuadros se generan solos con la lógica correcta: 1ros vs 2dos de otra zona, byes donde corresponde." },
      { emoji: "🎯", title: "Modalidad ESTRICTO o FLEXIBILIDAD", desc: "Elegís más eliminaciones directas o más continuidad para que nadie quede afuera antes de tiempo." },
      { emoji: "🎨", title: "Afiche de portada del torneo", desc: "Subís una imagen y aparece como portada del evento. Identidad visual sin herramientas externas." },
      { emoji: "💰", title: "Pagos de inscripción integrados", desc: "MercadoPago o transferencia con comprobante adjunto. Todo por pareja, centralizado." },
    ],
  },
  {
    id: "turnos" as CategoryId,
    Icon: Clock,
    label: "Turnos",
    tagline: "Reservas sin llamadas. Pagos automáticos. Panel visual día a día.",
    cardBg: "linear-gradient(145deg, #042F2E 0%, #0F4C45 100%)",
    accent: "#2DD4BF",
    accentHex: "#2DD4BF",
    panelBg: "#011E1D",
    chipBg: "rgba(45,212,191,0.15)",
    painHeadline: "¿Cuántas reservas perdiste porque no pudiste contestar el teléfono?",
    solution:
      "Los jugadores ven los horarios disponibles y reservan directamente desde la app. Sin llamadas, sin mensajes, sin confusión. Vos tenés todo en un panel visual, día por día, cancha por cancha.",
    features: [
      { emoji: "📅", title: "Disponibilidad en tiempo real", desc: "Los horarios ya reservados aparecen bloqueados. El jugador ve solo lo que está libre y reserva en el momento." },
      { emoji: "🔔", title: "Reservas sin tu intervención", desc: "El jugador elige complejo, cancha, horario y duración. Confirma solo. Vos recibís la reserva hecha." },
      { emoji: "💳", title: "Pago con MercadoPago detectado solo", desc: "El jugador paga online y el sistema lo registra automáticamente. Sin verificar transferencias." },
      { emoji: "📍", title: "Tu complejo aparece cerca de quien importa", desc: "Los jugadores buscan por proximidad GPS. Tu complejo aparece en el radio de quienes están cerca." },
      { emoji: "📊", title: "Agenda visual diaria por cancha", desc: "De un vistazo sabés qué horarios están ocupados y cuáles libres. Sin revisar conversaciones." },
      { emoji: "📲", title: "Avisos por WhatsApp automáticos", desc: "Cuando confirmás o cancelás, el jugador recibe el aviso por WhatsApp. Sin que tengas que escribir." },
    ],
  },
  {
    id: "jugadores" as CategoryId,
    Icon: Users,
    label: "Jugadores",
    tagline: "Directorio con disponibilidad real. Reemplazantes que se postulan solos.",
    cardBg: "linear-gradient(145deg, #1E0047 0%, #3B0764 100%)",
    accent: "#C084FC",
    accentHex: "#C084FC",
    panelBg: "#0D0020",
    chipBg: "rgba(192,132,252,0.15)",
    painHeadline: "¿Perdiste un partido porque no encontraste reemplazante a tiempo?",
    solution:
      "Los jugadores publican su disponibilidad para reemplazos y se postulan solos cuando hay un lugar. Vos filtrás por zona, categoría o proximidad GPS y contactás al candidato en segundos.",
    features: [
      { emoji: "🙋", title: "Reemplazantes que se anotan solos", desc: "Un jugador marca que está disponible. Cuando hay lugar, se postula. Vos elegís quién entra sin buscar por grupos." },
      { emoji: "🔍", title: "Búsqueda por categoría y zona", desc: "Filtrás el directorio por nivel, ciudad o disponibilidad hoy. Sin preguntar uno por uno." },
      { emoji: "📍", title: "Proximidad GPS configurable", desc: "Buscás jugadores a 5, 10 o 20 km. Ideal cuando urge y necesitás alguien cerca del complejo." },
      { emoji: "⭐", title: "Favoritos para acceso rápido", desc: "Guardás tus reemplazantes de confianza. La próxima vez los encontrás en segundos." },
      { emoji: "💬", title: "Mensajes directos en la app", desc: "Contactás al jugador desde la plataforma. Sin salir a WhatsApp, sin buscar el número." },
      { emoji: "📋", title: "Perfiles completos", desc: "Categoría, mano hábil, lado preferido, días disponibles. Toda la info para elegir al candidato correcto." },
    ],
  },
];

export default function FuncionalidadesShowcase() {
  const [selected, setSelected] = useState<CategoryId | null>(null);
  const active = categories.find((c) => c.id === selected) ?? null;

  return (
    <div style={{ background: "#050E1A" }}>
      <AnimatePresence mode="wait">
        {/* ── WELCOME SCREEN ── */}
        {!active && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {/* Hero */}
            <div className="text-center pt-16 pb-10 px-6">
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#0B8457" }}>
                Funcionalidades
              </p>
              <h1 className="text-3xl md:text-5xl font-black text-white leading-tight mb-4">
                ¿Qué querés organizar?
              </h1>
              <p className="text-gray-400 text-base md:text-lg max-w-lg mx-auto">
                Explorá cómo PadelNexo resuelve cada parte de tu rutina — sin llamadas, sin planillas, sin perseguir pagos.
              </p>
            </div>

            {/* Category cards */}
            <div className="grid grid-cols-2 gap-4 px-4 pb-16 max-w-3xl mx-auto md:gap-6 md:px-8">
              {categories.map((cat, i) => (
                <motion.button
                  key={cat.id}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  onClick={() => setSelected(cat.id)}
                  className="relative text-left rounded-2xl overflow-hidden group"
                  style={{ background: cat.cardBg, minHeight: 220 }}
                >
                  {/* Decorative large icon */}
                  <div
                    className="absolute -bottom-4 -right-4 opacity-10"
                    style={{ color: cat.accentHex }}
                  >
                    <cat.Icon size={120} strokeWidth={1} />
                  </div>

                  {/* Content */}
                  <div className="relative p-5 flex flex-col h-full" style={{ minHeight: 220 }}>
                    {/* Icon chip */}
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 flex-shrink-0"
                      style={{ background: cat.chipBg, border: `1px solid ${cat.accentHex}30` }}
                    >
                      <cat.Icon size={22} style={{ color: cat.accentHex }} />
                    </div>

                    <h2 className="text-xl font-black text-white mb-1">{cat.label}</h2>
                    <p className="text-xs leading-relaxed flex-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                      {cat.tagline}
                    </p>

                    <div
                      className="mt-4 flex items-center gap-1 text-xs font-bold group-hover:gap-2 transition-all"
                      style={{ color: cat.accentHex }}
                    >
                      Explorar <ArrowRight size={13} />
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── CATEGORY DETAIL ── */}
        {active && (
          <motion.div
            key={active.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {/* Nav bar */}
            <div
              className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 overflow-x-auto"
              style={{ background: "#050E1A", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <button
                onClick={() => setSelected(null)}
                className="flex items-center gap-1.5 flex-shrink-0 text-xs font-bold text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft size={14} /> Inicio
              </button>
              <div className="w-px h-4 bg-white/10 flex-shrink-0" />
              <div className="flex gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelected(cat.id)}
                    className="flex items-center gap-1.5 flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                    style={
                      cat.id === active.id
                        ? { background: active.accentHex, color: "#000" }
                        : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }
                    }
                  >
                    <cat.Icon size={12} />
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Pain headline */}
            <div
              className="px-6 py-14 text-center"
              style={{ background: active.panelBg }}
            >
              <div
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-6"
                style={{ background: active.chipBg, color: active.accentHex, border: `1px solid ${active.accentHex}30` }}
              >
                <active.Icon size={13} />
                {active.label}
              </div>
              <h2
                className="text-2xl md:text-4xl font-black text-white max-w-2xl mx-auto leading-tight mb-6"
              >
                {active.painHeadline}
              </h2>
              <p className="text-base md:text-lg max-w-xl mx-auto leading-relaxed" style={{ color: active.accentHex }}>
                {active.solution}
              </p>
            </div>

            {/* Features grid */}
            <div className="max-w-4xl mx-auto px-4 py-12 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {active.features.map((feature, i) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className="rounded-2xl p-5"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <span className="text-3xl mb-3 block">{feature.emoji}</span>
                  <h3 className="font-bold text-white text-sm mb-2">{feature.title}</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">{feature.desc}</p>
                </motion.div>
              ))}
            </div>

            {/* CTA */}
            <div className="text-center pb-20 px-6">
              <p className="text-gray-500 text-sm mb-5">
                ¿Listo para dejar de improvisar y empezar a organizar en serio?
              </p>
              <Link
                href="/planes"
                className="inline-flex items-center gap-2 font-black text-sm px-8 py-4 rounded-2xl transition-all hover:scale-[1.03] shadow-lg"
                style={{ background: active.accentHex, color: "#000" }}
              >
                Ver planes y precios <ArrowRight size={16} />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
