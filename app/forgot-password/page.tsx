"use client";

import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setSent(true);
    } catch (err: any) {
      const msg: Record<string, string> = {
        "auth/user-not-found": "No existe una cuenta con ese email.",
        "auth/invalid-email": "El email no es válido.",
        "auth/too-many-requests": "Demasiados intentos. Esperá unos minutos.",
      };
      setError(msg[err.code] || "No se pudo enviar el email. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pn-navy to-pn-navy-light flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <a href="/login">
            <img src="/logopn.png" alt="PadelNexo" className="h-16 w-auto mx-auto mb-4 drop-shadow-lg" />
          </a>
          <h1 className="text-2xl font-black text-white">Recuperar contraseña</h1>
          <p className="text-gray-400 text-sm mt-1">Te enviamos un link para restablecer tu clave</p>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-2xl">
          {sent ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full bg-pn-mint flex items-center justify-center mx-auto mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3d9e5f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 className="text-lg font-black text-pn-navy mb-2">¡Email enviado!</h2>
              <p className="text-sm text-gray-500 mb-6">
                Revisá tu bandeja en <span className="font-semibold text-pn-navy">{email}</span> y seguí el link para crear una nueva contraseña.
              </p>
              <a href="/login" className="text-sm text-pn-green font-bold hover:underline">
                ← Volver al inicio de sesión
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-semibold text-pn-navy mb-1.5">Email de tu cuenta</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                  autoFocus
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-pn-navy focus:outline-none focus:border-pn-green focus:ring-2 focus:ring-pn-green/20 transition-all"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-pn-green hover:bg-pn-dark text-white font-black py-4 rounded-xl transition-all hover:scale-[1.02] shadow-lg shadow-pn-green/20 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "Enviando..." : "Enviar link de recuperación"}
              </button>

              <a
                href="/login"
                className="text-sm text-gray-500 hover:text-pn-navy text-center transition-colors"
              >
                ← Volver al inicio de sesión
              </a>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
