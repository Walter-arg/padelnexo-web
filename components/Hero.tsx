"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, PlayCircle } from "lucide-react";

const screens = [
  { src: "/screen1.jpg", alt: "Turnos disponibles en PadelNexo" },
  { src: "/imagen_liga11.jpg", alt: "Ligas activas en PadelNexo" },
  { src: "/imagen_reserva_turnos.jpg", alt: "Reserva de canchas en PadelNexo" },
];

function PhoneMockup() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % screens.length);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      animate={{ y: [0, -14, 0] }}
      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      className="relative mx-auto"
      style={{ width: 280 }}
    >
      {/* Phone frame */}
      <div
        className="relative rounded-[44px] overflow-hidden shadow-2xl"
        style={{
          background: "linear-gradient(145deg, #1a1a2e 0%, #0d2438 100%)",
          padding: "12px",
          boxShadow:
            "0 40px 80px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.08), inset 0 0 0 1px rgba(255,255,255,0.05)",
        }}
      >
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-7 bg-pn-navy-light rounded-b-2xl z-20 flex items-center justify-center gap-2">
          <div className="w-2 h-2 rounded-full bg-gray-700" />
          <div className="w-12 h-1.5 rounded-full bg-gray-700" />
        </div>

        {/* Screen */}
        <div className="relative rounded-[36px] overflow-hidden bg-gray-100" style={{ height: 560 }}>
          <AnimatePresence mode="wait">
            <motion.img
              key={current}
              src={screens[current].src}
              alt={screens[current].alt}
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0 w-full h-full object-cover object-top"
            />
          </AnimatePresence>
        </div>

        {/* Home indicator */}
        <div className="flex justify-center mt-2">
          <div className="w-24 h-1 rounded-full bg-white/20" />
        </div>
      </div>

      {/* Glow behind phone */}
      <div
        className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-56 h-20 rounded-full blur-3xl -z-10"
        style={{ background: "rgba(31,163,109,0.3)" }}
      />

      {/* Floating badges */}
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 4, repeat: Infinity, delay: 0.5 }}
        className="absolute -left-16 top-24 glass rounded-2xl px-4 py-3 shadow-xl border border-white/60"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-pn-green/20 flex items-center justify-center">
            <span className="text-pn-green text-xs font-bold">✓</span>
          </div>
          <div>
            <p className="text-xs font-bold text-pn-navy leading-tight">Pago confirmado</p>
            <p className="text-[10px] text-gray-500">Mercado Pago</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 5, repeat: Infinity, delay: 1.5 }}
        className="absolute -right-14 top-48 glass rounded-2xl px-4 py-3 shadow-xl border border-white/60"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            <span className="text-blue-600 text-xs">🏆</span>
          </div>
          <div>
            <p className="text-xs font-bold text-pn-navy leading-tight">Fixture listo</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        animate={{ y: [0, -7, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, delay: 2.5 }}
        className="absolute -left-14 bottom-32 glass rounded-2xl px-4 py-3 shadow-xl border border-white/60"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
            <span className="text-amber-600 text-xs">👥</span>
          </div>
          <div>
            <p className="text-xs font-bold text-pn-navy leading-tight">Hasta 48 parejas</p>
            <p className="text-[10px] text-gray-500">inscriptas</p>
          </div>
        </div>
      </motion.div>

      {/* Screen indicator dots */}
      <div className="flex justify-center gap-1.5 mt-6">
        {screens.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`transition-all duration-300 rounded-full ${
              i === current ? "w-5 h-1.5 bg-pn-green" : "w-1.5 h-1.5 bg-gray-300"
            }`}
          />
        ))}
      </div>
    </motion.div>
  );
}

export default function Hero() {
  return (
    <section
      id="inicio"
      className="relative min-h-screen flex items-center overflow-hidden pt-16"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(31,163,109,0.12) 0%, transparent 70%), linear-gradient(180deg, #f0fdf6 0%, #ffffff 60%)",
      }}
    >
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(31,163,109,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(31,163,109,0.06) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-6 py-20 lg:py-32 grid lg:grid-cols-2 gap-16 lg:gap-24 items-center w-full">
        {/* Left: Text */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 bg-pn-mint border border-pn-green/20 rounded-full px-4 py-1.5 mb-8"
          >
            <div className="w-2 h-2 rounded-full bg-pn-green animate-pulse" />
            <span className="text-pn-dark text-sm font-semibold">
              Próximamente en Google Play
            </span>
          </motion.div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-pn-navy leading-[1.1] tracking-tight mb-6">
            Profesionalizá tus{" "}
            <span className="text-pn-green">ligas</span> y{" "}
            <span className="text-pn-green">torneos</span>{" "}
            de pádel,{" "}
            <span className="relative inline-block">
              <span className="text-pn-green">automatizá</span>
              <svg
                className="absolute -bottom-1 left-0 w-full"
                height="6"
                viewBox="0 0 100 6"
                preserveAspectRatio="none"
              >
                <path
                  d="M0,4 Q50,0 100,4"
                  stroke="#c8f53d"
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            </span>{" "}
            la gestión de turnos.
          </h1>

          <p className="text-xl text-gray-600 leading-relaxed mb-10 max-w-xl">
            Gestioná jugadores, fixtures, pagos, rankings, resultados y
            comunicación desde una sola plataforma. Sin Excel. Sin WhatsApp.
            Sin caos.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mb-5">
            <a
              href="#comenzar"
              className="group inline-flex items-center justify-center gap-2 bg-pn-green hover:bg-pn-dark text-white font-bold text-base px-8 py-4 rounded-2xl transition-all duration-200 shadow-lg shadow-pn-green/25 hover:shadow-pn-green/40 hover:scale-[1.02]"
            >
              Comenzar gratis
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href="#demo"
              className="inline-flex items-center justify-center gap-2 border-2 border-gray-200 hover:border-pn-green text-pn-navy font-bold text-base px-8 py-4 rounded-2xl transition-all duration-200 hover:text-pn-green hover:bg-pn-mint"
            >
              <PlayCircle size={18} />
              Solicitar demo
            </a>
          </div>

          <div className="mb-12">
            <a
              href="/login"
              className="inline-flex items-center justify-center gap-2 bg-pn-navy hover:bg-pn-navy-light text-white font-black text-base px-8 py-4 rounded-2xl transition-all duration-200 hover:scale-[1.02] shadow-lg w-full sm:w-auto"
            >
              🔐 Ingreso Organizadores
            </a>
          </div>

          {/* Social proof micro */}
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {["#1fa36d", "#11784e", "#0d6b42"].map((bg, i) => (
                  <div
                    key={i}
                    className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-white text-[10px] font-bold"
                    style={{ background: bg }}
                  >
                    J
                  </div>
                ))}
              </div>
              <span>Jugadores activos</span>
            </div>
            <div className="h-4 w-px bg-gray-200" />
            <span>🏅 Ligas y torneos en curso</span>
          </div>
        </motion.div>

        {/* Right: Phone mockup */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: "easeOut", delay: 0.15 }}
          className="flex justify-center lg:justify-end"
        >
          <PhoneMockup />
        </motion.div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white to-transparent pointer-events-none" />
    </section>
  );
}
