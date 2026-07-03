"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";

const links = [
  { label: "Funcionalidades", href: "#funcionalidades" },
  { label: "Organizadores", href: "#organizadores" },
  { label: "Jugadores", href: "#jugadores" },
  { label: "Precios", href: "#precios" },
  { label: "FAQ", href: "#faq" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "glass border-b border-gray-100 shadow-sm"
          : "bg-transparent"
      }`}
    >
      <nav className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="flex items-center gap-3 group">
          <img
            src="/logopn.png"
            alt="PadelNexo"
            className="h-10 w-auto group-hover:scale-105 transition-transform drop-shadow-md"
          />
          <span className="font-extrabold text-pn-navy text-lg tracking-tight">
            PadelNexo
          </span>
        </a>

        {/* Desktop links */}
        <ul className="hidden md:flex items-center gap-8">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-sm font-medium text-gray-600 hover:text-pn-green transition-colors"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <div className="hidden md:flex items-center gap-3">
          <a
            href="#contacto"
            className="text-sm font-semibold text-pn-navy hover:text-pn-green transition-colors"
          >
            Contacto
          </a>
          <a
            href="/login"
            className="border-2 border-pn-navy hover:border-pn-green text-pn-navy hover:text-pn-green text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
          >
            Ingreso Organizadores
          </a>
          <a
            href="#comenzar"
            className="bg-pn-green hover:bg-pn-dark text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors shadow-md shadow-pn-green/20"
          >
            Comenzar gratis
          </a>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Menú"
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.18 }}
            className="md:hidden glass border-t border-gray-100"
          >
            <ul className="px-6 py-4 flex flex-col gap-1">
              {links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="block py-3 text-sm font-medium text-gray-700 hover:text-pn-green border-b border-gray-100 last:border-0 transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li className="pt-3">
                <a
                  href="#comenzar"
                  onClick={() => setMenuOpen(false)}
                  className="block w-full text-center bg-pn-green text-white font-bold py-3 rounded-xl"
                >
                  Comenzar gratis
                </a>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
