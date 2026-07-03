"use client";

import { Mail, MessageCircle, Instagram } from "lucide-react";

export default function Footer() {
  return (
    <footer id="contacto" className="bg-pn-navy text-white">
      {/* CTA Banner */}
      <div
        className="py-20 text-center relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0d2438 0%, #11784e 100%)",
        }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 50%, rgba(200,245,61,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(31,163,109,0.4) 0%, transparent 50%)",
          }}
        />
        <div className="relative max-w-3xl mx-auto px-6">
          <h2 className="text-4xl md:text-5xl font-black mb-5 leading-tight">
            ¿Listo para profesionalizar tu complejo?
          </h2>
          <p className="text-lg text-white/70 mb-8 max-w-xl mx-auto">
            Más de 100 jugadores ya usan PadelNexo. Sumá tu liga hoy y olvidate
            del Excel y el WhatsApp.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center" id="comenzar">
            <a
              href={`https://wa.me/543564220428?text=${encodeURIComponent("Hola! Me interesa conocer más sobre PadelNexo para organizar mi liga.")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-pn-lime hover:bg-yellow-300 text-pn-navy font-black text-base px-10 py-4 rounded-2xl transition-all hover:scale-[1.03] shadow-xl"
            >
              <MessageCircle size={18} />
              Comenzar por WhatsApp
            </a>
            <a
              href="mailto:padelnexo@gmail.com"
              className="inline-flex items-center justify-center gap-2 border-2 border-white/30 hover:border-white/60 text-white font-bold text-base px-10 py-4 rounded-2xl transition-all hover:bg-white/5"
            >
              <Mail size={18} />
              Enviar un email
            </a>
          </div>
        </div>
      </div>

      {/* Footer links */}
      <div className="max-w-7xl mx-auto px-6 py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-3 mb-4">
              <img src="/logopn.png" alt="PadelNexo" className="h-12 w-auto" />
              <span className="font-extrabold text-lg tracking-tight">PadelNexo</span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">
              La plataforma profesional para organizar ligas y torneos de pádel amateur en Argentina.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-bold text-sm mb-4 text-gray-300 uppercase tracking-wider">Producto</h4>
            <ul className="flex flex-col gap-2.5">
              {[
                { label: "Funcionalidades", href: "#funcionalidades" },
                { label: "Para organizadores", href: "#organizadores" },
                { label: "Para jugadores", href: "#jugadores" },
                { label: "Centro de cobros", href: "#cobros" },
                { label: "Preguntas frecuentes", href: "#faq" },
              ].map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="text-sm text-gray-400 hover:text-white transition-colors">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-bold text-sm mb-4 text-gray-300 uppercase tracking-wider">Contacto</h4>
            <ul className="flex flex-col gap-3">
              <li>
                <a
                  href={`https://wa.me/543564220428`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-pn-lime transition-colors"
                >
                  <MessageCircle size={15} />
                  WhatsApp
                </a>
              </li>
              <li>
                <a
                  href="mailto:padelnexo@gmail.com"
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  <Mail size={15} />
                  padelnexo@gmail.com
                </a>
              </li>
              <li>
                <a
                  href="https://instagram.com/padelnexo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-pink-400 transition-colors"
                >
                  <Instagram size={15} />
                  Instagram
                </a>
              </li>
            </ul>
          </div>

          {/* Download */}
          <div>
            <h4 className="font-bold text-sm mb-4 text-gray-300 uppercase tracking-wider">Descargar</h4>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 border border-white/10 rounded-xl px-4 py-3 opacity-60">
                <span className="text-2xl">🤖</span>
                <div>
                  <div className="text-[10px] text-gray-400">Próximamente</div>
                  <div className="text-sm font-bold">Google Play</div>
                </div>
              </div>
              <div className="flex items-center gap-3 border border-white/10 rounded-xl px-4 py-3 opacity-40">
                <span className="text-2xl">🍎</span>
                <div>
                  <div className="text-[10px] text-gray-400">Próximamente</div>
                  <div className="text-sm font-bold">App Store</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/8 mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <span>© 2026 PadelNexo. Todos los derechos reservados.</span>
          <div className="flex gap-6">
            <a href="/privacidad" className="hover:text-white transition-colors">
              Política de privacidad
            </a>
            <a href="/terminos" className="hover:text-white transition-colors">
              Términos y condiciones
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
