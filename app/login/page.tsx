"use client";

import { useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      router.push("/dashboard");
    } catch (err: any) {
      const msg: Record<string, string> = {
        "auth/user-not-found": "No existe una cuenta con ese email.",
        "auth/wrong-password": "Contraseña incorrecta.",
        "auth/email-already-in-use": "Ese email ya está registrado.",
        "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
        "auth/invalid-email": "El email no es válido.",
        "auth/invalid-credential": "Email o contraseña incorrectos.",
      };
      setError(msg[err.code] || "Ocurrió un error. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError("");
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      router.push("/dashboard");
    } catch (err: any) {
      setError("No se pudo iniciar sesión con Google.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pn-navy to-pn-navy-light flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/logopn.png" alt="PadelNexo" className="h-16 w-auto mx-auto mb-4 drop-shadow-lg" />
          <h1 className="text-2xl font-black text-white">
            {mode === "login" ? "Ingreso Organizadores" : "Crear cuenta"}
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {mode === "login" ? "Accedé a tu panel de gestión" : "Registrá tu complejo en PadelNexo"}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl p-8 shadow-2xl">

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-xl py-3 text-sm font-semibold text-gray-700 transition-all mb-5 disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continuar con Google
          </button>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400 font-medium">o con email</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-semibold text-pn-navy mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-pn-navy focus:outline-none focus:border-pn-green focus:ring-2 focus:ring-pn-green/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-pn-navy mb-1.5">Contraseña</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm text-pn-navy focus:outline-none focus:border-pn-green focus:ring-2 focus:ring-pn-green/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-pn-navy transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {mode === "login" && (
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="w-4 h-4 accent-pn-green rounded"
                  />
                  <span className="text-sm text-gray-600">Recordarme</span>
                </label>
                <a href="#" className="text-sm text-pn-green font-semibold hover:underline">
                  ¿Olvidaste tu contraseña?
                </a>
              </div>
            )}

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
              {loading ? "Cargando..." : mode === "login" ? "Ingresar" : "Crear cuenta"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-5">
            {mode === "login" ? (
              <>
                ¿No tenés cuenta?{" "}
                <button onClick={() => { setMode("register"); setError(""); }} className="text-pn-green font-bold hover:underline">
                  Registrarse
                </button>
              </>
            ) : (
              <>
                ¿Ya tenés cuenta?{" "}
                <button onClick={() => { setMode("login"); setError(""); }} className="text-pn-green font-bold hover:underline">
                  Iniciar sesión
                </button>
              </>
            )}
          </p>
        </div>

        <p className="text-center text-xs text-gray-500 mt-6">
          <a href="/" className="hover:text-white transition-colors">← Volver al inicio</a>
        </p>
      </div>
    </div>
  );
}
