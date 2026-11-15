"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db } from "@/lib/firebase";
import { getStorage } from "firebase/storage";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { Save, Upload, Building2, User as UserIcon, Camera, Plus, Trash2, Wallet, CheckCircle2 } from "lucide-react";
import { createEmptyCancha, createEmptyComplejo, normalizeComplejo, type Cancha, type Complejo } from "@/lib/complejos";
import {
  normalizeMercadoPagoConfig,
  startMercadoPagoOAuth,
  completeMercadoPagoOAuth,
  type MercadoPagoConfig,
} from "@/lib/mercadoPago";

const storage = getStorage();

const ESTRUCTURA_OPTIONS = [
  { value: "blindex", label: "Blindex" },
  { value: "cemento", label: "Cemento" },
];
const PISO_OPTIONS = [
  { value: "sintetico", label: "Césped sintético" },
  { value: "cemento", label: "Cemento" },
];
const AMBIENTE_OPTIONS = [
  { value: "aire_libre", label: "Aire libre" },
  { value: "cubierta", label: "Cubierta" },
];

function PerfilContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState(searchParams.get("tab") || "datos");
  const [mpLinking, setMpLinking] = useState(false);
  const [mpError, setMpError] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push("/login"); return; }
      setUser(u);
      const snap = await getDoc(doc(db, "users", u.uid));
      if (snap.exists()) setProfile(snap.data());
      setLoading(false);

      // Volvemos de Mercado Pago (via mercadoPagoOAuthRedirect) con estos
      // parametros en la URL. Si estan, completamos la vinculacion.
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const sessionId = searchParams.get("sessionId");
      const oauthErr = searchParams.get("error");

      if (oauthErr) {
        setMpError("Mercado Pago rechazo la vinculacion.");
        setTab("mercadopago");
        router.replace("/dashboard/perfil?tab=mercadopago");
        return;
      }

      if (code && state && sessionId) {
        setTab("mercadopago");
        setMpLinking(true);
        try {
          const result = await completeMercadoPagoOAuth({ organizerId: u.uid, code, state, sessionId });
          setProfile((current: any) => ({
            ...current,
            mercadoPagoConfig: normalizeMercadoPagoConfig({ ...current?.mercadoPagoConfig, ...(result?.config || {}) }),
          }));
        } catch (error: any) {
          setMpError(error?.message || "No pudimos completar la vinculacion con Mercado Pago.");
        } finally {
          setMpLinking(false);
          router.replace("/dashboard/perfil?tab=mercadopago");
        }
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function updateComplejoLocalidad(idx: number, field: "nombre" | "provincia", value: string) {
    const complejos = [...(profile.complejos || [])];
    complejos[idx] = {
      ...complejos[idx],
      localidad: { ...(complejos[idx].localidad || {}), [field]: value },
    };
    setProfile((p: any) => ({ ...p, complejos }));
  }

  function addComplejo() {
    const complejos = [...(profile.complejos || []), createEmptyComplejo()];
    setProfile((p: any) => ({ ...p, complejos }));
  }

  function removeComplejo(idx: number) {
    if (!window.confirm("¿Eliminar este complejo y todas sus canchas? Esta accion no se puede deshacer.")) return;
    const complejos = (profile.complejos || []).filter((_: any, i: number) => i !== idx);
    setProfile((p: any) => ({ ...p, complejos }));
  }

  function addCancha(complejoIdx: number) {
    const complejos = [...(profile.complejos || [])];
    const canchas: Cancha[] = [...(complejos[complejoIdx].canchas || [])];
    canchas.push(createEmptyCancha(canchas.length));
    complejos[complejoIdx] = { ...complejos[complejoIdx], canchas };
    setProfile((p: any) => ({ ...p, complejos }));
  }

  function updateCancha(complejoIdx: number, canchaIdx: number, field: string, value: string) {
    const complejos = [...(profile.complejos || [])];
    const canchas: Cancha[] = [...(complejos[complejoIdx].canchas || [])];
    canchas[canchaIdx] = { ...canchas[canchaIdx], [field]: value };
    complejos[complejoIdx] = { ...complejos[complejoIdx], canchas };
    setProfile((p: any) => ({ ...p, complejos }));
  }

  function removeCancha(complejoIdx: number, canchaIdx: number) {
    const complejos = [...(profile.complejos || [])];
    const canchas: Cancha[] = (complejos[complejoIdx].canchas || []).filter((_: any, i: number) => i !== canchaIdx);
    complejos[complejoIdx] = { ...complejos[complejoIdx], canchas };
    setProfile((p: any) => ({ ...p, complejos }));
  }

  async function handleSaveComplejos() {
    if (!user) return;
    setSaving(true);
    const normalizados: Complejo[] = (profile.complejos || []).map(normalizeComplejo);
    await updateDoc(doc(db, "users", user.uid), { complejos: normalizados });
    setProfile((p: any) => ({ ...p, complejos: normalizados }));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const mpConfig: MercadoPagoConfig = normalizeMercadoPagoConfig(profile?.mercadoPagoConfig);

  async function handleMpLink() {
    if (!user) return;
    setMpError("");
    setMpLinking(true);
    try {
      await startMercadoPagoOAuth(user.uid);
    } catch (error: any) {
      setMpError(error?.message || "No pudimos iniciar la vinculacion con Mercado Pago.");
      setMpLinking(false);
    }
  }

  function updateMpField(field: keyof MercadoPagoConfig, value: any) {
    setProfile((current: any) => ({
      ...current,
      mercadoPagoConfig: { ...normalizeMercadoPagoConfig(current?.mercadoPagoConfig), [field]: value },
    }));
  }

  function toggleMpCategory(categoryKey: keyof MercadoPagoConfig["categories"]) {
    setProfile((current: any) => {
      const normalized = normalizeMercadoPagoConfig(current?.mercadoPagoConfig);
      return {
        ...current,
        mercadoPagoConfig: {
          ...normalized,
          categories: { ...normalized.categories, [categoryKey]: !normalized.categories[categoryKey] },
        },
      };
    });
  }

  async function handleSaveMercadoPago() {
    if (!user) return;
    setSaving(true);
    await updateDoc(doc(db, "users", user.uid), { mercadoPagoConfig: mpConfig });
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
    { id: "mercadopago", label: "Mercado Pago", icon: Wallet },
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
                <button
                  onClick={() => removeComplejo(idx)}
                  className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-600"
                >
                  <Trash2 size={13} /> Eliminar complejo
                </button>
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
                    value={complejo.localidad?.nombre || ""}
                    onChange={(e) => updateComplejoLocalidad(idx, "nombre", e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-pn-green"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Provincia</label>
                  <input
                    value={complejo.localidad?.provincia || ""}
                    onChange={(e) => updateComplejoLocalidad(idx, "provincia", e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-pn-green"
                  />
                </div>
              </div>

              {/* Canchas */}
              <div className="border-t border-gray-100 pt-4 mt-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Canchas</div>
                  <button
                    onClick={() => addCancha(idx)}
                    className="flex items-center gap-1 text-xs font-bold text-pn-green hover:text-pn-dark"
                  >
                    <Plus size={14} /> Agregar cancha
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {(complejo.canchas || []).map((cancha: any, cidx: number) => (
                    <div key={cancha.id || cidx} className="flex items-center gap-2 bg-slate-50 rounded-xl px-4 py-3 flex-wrap">
                      <input
                        value={cancha.nombre || ""}
                        onChange={(e) => updateCancha(idx, cidx, "nombre", e.target.value)}
                        placeholder={`Cancha ${cidx + 1}`}
                        className="flex-1 min-w-[120px] border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-pn-green"
                      />
                      <select
                        value={cancha.estructura || "blindex"}
                        onChange={(e) => updateCancha(idx, cidx, "estructura", e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                      >
                        {ESTRUCTURA_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <select
                        value={cancha.piso || "sintetico"}
                        onChange={(e) => updateCancha(idx, cidx, "piso", e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                      >
                        {PISO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <select
                        value={cancha.ambiente || "aire_libre"}
                        onChange={(e) => updateCancha(idx, cidx, "ambiente", e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                      >
                        {AMBIENTE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <button
                        onClick={() => removeCancha(idx, cidx)}
                        className="text-red-400 hover:text-red-600 p-1"
                        title="Eliminar cancha"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  {(!complejo.canchas || complejo.canchas.length === 0) && (
                    <p className="text-sm text-gray-400 italic">Sin canchas cargadas</p>
                  )}
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={addComplejo}
            className="flex items-center justify-center gap-2 bg-white border-2 border-dashed border-gray-200 hover:border-pn-green text-gray-500 hover:text-pn-green font-bold py-4 rounded-3xl transition-all"
          >
            <Plus size={16} /> Agregar complejo
          </button>

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

      {/* Tab: Mercado Pago */}
      {tab === "mercadopago" && (
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 max-w-lg">
          <h2 className="font-black text-pn-navy text-lg mb-2">Mercado Pago</h2>
          <p className="text-sm text-gray-500 mb-6">Vinculá tu cuenta para cobrar turnos, ligas y torneos online.</p>

          {mpError && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3 mb-5">
              {mpError}
            </div>
          )}

          {!mpConfig.accountLinked ? (
            <button
              onClick={handleMpLink}
              disabled={mpLinking}
              className="flex items-center justify-center gap-2 bg-[#00A3DF] hover:bg-[#0092C7] text-white font-bold py-3 px-6 rounded-xl transition-all disabled:opacity-60"
            >
              <Wallet size={16} />
              {mpLinking ? "Conectando..." : "Conectar con Mercado Pago"}
            </button>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                <CheckCircle2 size={20} className="text-green-600 flex-shrink-0" />
                <div>
                  <div className="font-bold text-sm text-pn-navy">Cuenta vinculada</div>
                  <div className="text-xs text-gray-500">{mpConfig.accountDisplayName || "Mercado Pago"}</div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-gray-100 pt-5">
                <div>
                  <div className="font-bold text-sm text-pn-navy">Cobros habilitados</div>
                  <div className="text-xs text-gray-500">Activá o desactivá Mercado Pago en toda la cuenta.</div>
                </div>
                <button
                  onClick={() => updateMpField("enabled", !mpConfig.enabled)}
                  className={`w-12 h-7 rounded-full transition-all relative flex-shrink-0 ${mpConfig.enabled ? "bg-pn-green" : "bg-gray-200"}`}
                >
                  <span className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${mpConfig.enabled ? "left-6" : "left-1"}`} />
                </button>
              </div>

              {mpConfig.enabled && (
                <div className="flex flex-col gap-3 border-t border-gray-100 pt-5">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Por categoría</div>
                  {([
                    { key: "turnos", label: "Turnos" },
                    { key: "ligas", label: "Ligas" },
                    { key: "torneos", label: "Torneos" },
                  ] as const).map((cat) => (
                    <div key={cat.key} className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-pn-navy">{cat.label}</span>
                      <button
                        onClick={() => toggleMpCategory(cat.key)}
                        className={`w-11 h-6 rounded-full transition-all relative flex-shrink-0 ${mpConfig.categories[cat.key] ? "bg-pn-green" : "bg-gray-200"}`}
                      >
                        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${mpConfig.categories[cat.key] ? "left-6" : "left-1"}`} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={handleSaveMercadoPago}
                disabled={saving}
                className="flex items-center justify-center gap-2 bg-pn-green hover:bg-pn-dark text-white font-bold py-3 rounded-xl transition-all disabled:opacity-60 mt-2"
              >
                <Save size={16} />
                {saved ? "¡Guardado!" : saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
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
