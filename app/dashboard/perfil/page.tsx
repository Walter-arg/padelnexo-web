"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db } from "@/lib/firebase";
import { getStorage } from "firebase/storage";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { Save, Upload, Building2, User as UserIcon, Camera } from "lucide-react";

const storage = getStorage();

function PerfilContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState(searchParams.get("tab") || "datos");
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push("/login"); return; }
      setUser(u);
      const snap = await getDoc(doc(db, "users", u.uid));
      if (snap.exists()) setProfile(snap.data());
      setLoading(false);
    });
    return unsub;
  }, [router]);

  async function handleSaveDatos() {
    if (!user) return;
    setSaving(true);
    await updateDoc(doc(db, "users", user.uid), {
      nombre: profile.nombre,
      apellido: profile.apellido,
      telefono: profile.telefono,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setSaving(true);
    const storageRef = ref(storage, `organizer_logos/${user.uid}`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    await updateDoc(doc(db, "users", user.uid), { organizerLogoUrl: url });
    setProfile((p: any) => ({ ...p, organizerLogoUrl: url }));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function updateComplejo(idx: number, field: string, value: any) {
    const complejos = [...(profile.complejos || [])];
    complejos[idx] = { ...complejos[idx], [field]: value };
    setProfile((p: any) => ({ ...p, complejos }));
  }

  async function handleSaveComplejos() {
    if (!user) return;
    setSaving(true);
    await updateDoc(doc(db, "users", user.uid), { complejos: profile.complejos || [] });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (loading || !profile) {
    return (
      <DashboardLayout title="Perfil">
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-pn-green border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  const tabs = [
    { id: "datos", label: "Mis datos", icon: UserIcon },
    { id: "complejos", label: "Complejos y canchas", icon: Building2 },
    { id: "logo", label: "Logo", icon: Camera },
  ];

  return (
    <DashboardLayout title="Mi Perfil">
      {/* Tabs */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === t.id
                ? "bg-pn-green text-white shadow-md"
                : "bg-white text-gray-500 border border-gray-200 hover:border-pn-green hover:text-pn-green"
            }`}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Datos personales */}
      {tab === "datos" && (
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 max-w-lg">
          <h2 className="font-black text-pn-navy text-lg mb-6">Datos personales</h2>
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1.5">Nombre</label>
                <input
                  value={profile.nombre || ""}
                  onChange={(e) => setProfile((p: any) => ({ ...p, nombre: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-pn-green focus:ring-2 focus:ring-pn-green/20"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1.5">Apellido</label>
                <input
                  value={profile.apellido || ""}
                  onChange={(e) => setProfile((p: any) => ({ ...p, apellido: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-pn-green focus:ring-2 focus:ring-pn-green/20"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1.5">Email</label>
              <input value={user?.email || ""} disabled className="w-full border border-gray-100 rounded-xl px-4 py-3 text-sm bg-gray-50 text-gray-400" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1.5">Teléfono</label>
              <input
                value={profile.telefono || ""}
                onChange={(e) => setProfile((p: any) => ({ ...p, telefono: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-pn-green focus:ring-2 focus:ring-pn-green/20"
              />
            </div>
            <button
              onClick={handleSaveDatos}
              disabled={saving}
              className="flex items-center justify-center gap-2 bg-pn-green hover:bg-pn-dark text-white font-bold py-3 rounded-xl transition-all disabled:opacity-60"
            >
              <Save size={16} />
              {saved ? "¡Guardado!" : saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>
      )}

      {/* Tab: Complejos */}
      {tab === "complejos" && (
        <div className="flex flex-col gap-6 max-w-2xl">
          {(profile.complejos || []).map((complejo: any, idx: number) => (
            <div key={idx} className="bg-white rounded-3xl p-7 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-black text-pn-navy text-base flex items-center gap-2">
                  <Building2 size={18} className="text-pn-green" />
                  {complejo.nombre || `Complejo ${idx + 1}`}
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Nombre</label>
                  <input
                    value={complejo.nombre || ""}
                    onChange={(e) => updateComplejo(idx, "nombre", e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-pn-green"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Dirección</label>
                  <input
                    value={complejo.direccion || ""}
                    onChange={(e) => updateComplejo(idx, "direccion", e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-pn-green"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Ciudad</label>
                  <input
                    value={complejo.ciudad || ""}
                    onChange={(e) => updateComplejo(idx, "ciudad", e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-pn-green"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Provincia</label>
                  <input
                    value={complejo.provincia || ""}
                    onChange={(e) => updateComplejo(idx, "provincia", e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-pn-green"
                  />
                </div>
              </div>

              {/* Canchas */}
              <div className="border-t border-gray-100 pt-4 mt-2">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Canchas</div>
                <div className="flex flex-col gap-2">
                  {(complejo.canchas || []).map((cancha: any, cidx: number) => (
                    <div key={cidx} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
                      <div className="flex-1">
                        <div className="font-semibold text-sm text-pn-navy">{cancha.nombre || `Cancha ${cidx + 1}`}</div>
                        <div className="text-xs text-gray-400">{cancha.estructura} · {cancha.piso} · {cancha.ambiente}</div>
                      </div>
                    </div>
                  ))}
                  {(!complejo.canchas || complejo.canchas.length === 0) && (
                    <p className="text-sm text-gray-400 italic">Sin canchas cargadas</p>
                  )}
                </div>
              </div>
            </div>
          ))}

          {(!profile.complejos || profile.complejos.length === 0) && (
            <div className="bg-white rounded-3xl p-8 text-center text-gray-400 border border-gray-100">
              <Building2 size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-semibold">No tenés complejos cargados</p>
              <p className="text-sm mt-1">Cargá tus complejos desde la app móvil.</p>
            </div>
          )}

          {profile.complejos?.length > 0 && (
            <button
              onClick={handleSaveComplejos}
              disabled={saving}
              className="flex items-center justify-center gap-2 bg-pn-green hover:bg-pn-dark text-white font-bold py-3 rounded-xl transition-all disabled:opacity-60 max-w-xs"
            >
              <Save size={16} />
              {saved ? "¡Guardado!" : saving ? "Guardando..." : "Guardar cambios"}
            </button>
          )}
        </div>
      )}

      {/* Tab: Logo */}
      {tab === "logo" && (
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 max-w-sm text-center">
          <h2 className="font-black text-pn-navy text-lg mb-6">Logo del complejo</h2>
          <div className="relative w-32 h-32 mx-auto mb-6">
            {profile.organizerLogoUrl ? (
              <img src={profile.organizerLogoUrl} className="w-32 h-32 rounded-2xl object-cover border-4 border-pn-mint" alt="Logo" />
            ) : (
              <div className="w-32 h-32 rounded-2xl bg-slate-100 flex items-center justify-center border-2 border-dashed border-gray-200">
                <Camera size={32} className="text-gray-300" />
              </div>
            )}
          </div>
          <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
          <button
            onClick={() => logoInputRef.current?.click()}
            disabled={saving}
            className="flex items-center justify-center gap-2 bg-pn-green hover:bg-pn-dark text-white font-bold py-3 px-8 rounded-xl transition-all disabled:opacity-60 mx-auto"
          >
            <Upload size={16} />
            {saving ? "Subiendo..." : saved ? "¡Logo actualizado!" : "Subir logo"}
          </button>
          <p className="text-xs text-gray-400 mt-3">PNG o JPG, máximo 2MB</p>
        </div>
      )}
    </DashboardLayout>
  );
}

export default function PerfilPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-pn-green border-t-transparent rounded-full animate-spin" /></div>}>
      <PerfilContent />
    </Suspense>
  );
}
