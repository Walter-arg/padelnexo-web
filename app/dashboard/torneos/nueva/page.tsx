"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { ChevronLeft, Upload, X, Loader2, ImageIcon } from "lucide-react";

// ── Opciones ────────────────────────────────────────────────────────────────
const BRANCHES = ["Mixto", "Masculino", "Femenino"];
const FORMATS  = ["Dobles", "Singles", "Mixto"];
const RULESETS = ["Zonas + llaves", "Solo llaves", "Solo zonas", "Round Robin"];
const STATUSES = ["draft", "published", "registration_open"];
const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador", published: "Publicado", registration_open: "Inscripciones abiertas",
};

// ── Página ──────────────────────────────────────────────────────────────────
export default function TorneoNuevaPage() {
  return (
    <Suspense fallback={
      <DashboardLayout title="Torneos">
        <div className="flex justify-center py-20">
          <Loader2 size={32} className="animate-spin" style={{ color: "#086847" }} />
        </div>
      </DashboardLayout>
    }>
      <TorneoNuevaInner />
    </Suspense>
  );
}

function TorneoNuevaInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const editId       = searchParams.get("edit");
  const isEdit       = Boolean(editId);

  const [user, setUser]           = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState("");
  const fileRef                   = useRef<HTMLInputElement>(null);

  // ── Campos del formulario ──────────────────────────────────────────────
  const [name,         setName]         = useState("");
  const [description,  setDescription]  = useState("");
  const [status,       setStatus]       = useState("draft");
  // Categoría
  const [branch,       setBranch]       = useState("Mixto");
  const [format,       setFormat]       = useState("Dobles");
  const [ruleset,      setRuleset]      = useState("Zonas + llaves");
  // Sede
  const [venueName,    setVenueName]    = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  // Fechas
  const [startDate,    setStartDate]    = useState("");
  const [endDate,      setEndDate]      = useState("");
  const [scheduleDays, setScheduleDays] = useState<string[]>([]);
  // Cupos
  const [minPairs,     setMinPairs]     = useState(4);
  const [maxPairs,     setMaxPairs]     = useState(16);
  const [showOccupancy, setShowOccupancy] = useState(true);
  // Pago
  const [entryFee,     setEntryFee]     = useState(0);
  const [paymentAlias, setPaymentAlias] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<string[]>(["Efectivo", "Transferencia"]);
  // Afiche
  const [coverImage,   setCoverImage]   = useState("");
  const [coverPreview, setCoverPreview] = useState("");

  const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const PAYMENT_METHODS_OPTIONS = ["Efectivo", "Transferencia", "MercadoPago", "Débito"];

  // ── Auth + carga en modo edición ───────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push("/login"); return; }
      setUser(u);

      if (editId) {
        const snap = await getDoc(doc(db, "tournaments", editId));
        if (snap.exists()) {
          const d: any = snap.data();
          setName(d.name ?? d.nombre ?? "");
          setDescription(d.description ?? "");
          setStatus(d.status ?? "draft");
          setBranch(d.branch ?? "Mixto");
          setFormat(d.format ?? "Dobles");
          setRuleset(d.ruleset ?? "Zonas + llaves");
          const v = d.venues?.[0];
          setVenueName(v?.name ?? "");
          setVenueAddress(v?.address ?? "");
          setStartDate(d.startDateMillis ? new Date(d.startDateMillis).toISOString().slice(0, 10) : "");
          setEndDate(d.endDateMillis   ? new Date(d.endDateMillis).toISOString().slice(0, 10)   : "");
          setScheduleDays(d.scheduleDays ?? []);
          setMinPairs(d.minPairs ?? 4);
          setMaxPairs(d.maxPairs ?? 16);
          setShowOccupancy(d.showOccupancyCard ?? true);
          setEntryFee(d.entryFee ?? 0);
          setPaymentAlias(d.paymentAlias ?? "");
          setPaymentMethods(d.paymentMethods ?? ["Efectivo", "Transferencia"]);
          if (d.coverImage) { setCoverImage(d.coverImage); setCoverPreview(d.coverImage); }
        }
      }

      setLoading(false);
    });
    return unsub;
  }, [editId, router]);

  // ── Subir imagen ───────────────────────────────────────────────────────
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const ext       = file.name.split(".").pop();
      const storRef   = ref(storage, `tournaments/covers/${user.uid}/${Date.now()}.${ext}`);
      const snapshot  = await uploadBytes(storRef, file);
      const url       = await getDownloadURL(snapshot.ref);
      setCoverImage(url);
      setCoverPreview(url);
    } catch (err) {
      setError("Error al subir la imagen. Intentá de nuevo.");
    }
    setUploading(false);
  }

  function removeImage() {
    setCoverImage("");
    setCoverPreview("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function toggleDay(day: string) {
    setScheduleDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  }

  function togglePaymentMethod(m: string) {
    setPaymentMethods(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  }

  // ── Guardar ────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("El nombre del torneo es obligatorio."); return; }
    if (!user) return;

    setSaving(true);
    setError("");

    const data: Record<string, any> = {
      name:              name.trim(),
      nombre:            name.trim(),
      description:       description.trim(),
      status,
      branch,
      format,
      ruleset,
      compositionLabel:  `${branch} · ${format} · ${ruleset}`,
      venues:            venueName ? [{ name: venueName.trim(), address: venueAddress.trim() }] : [],
      startDateMillis:   startDate ? new Date(startDate).getTime() : null,
      endDateMillis:     endDate   ? new Date(endDate).getTime()   : null,
      scheduleDays,
      minPairs,
      maxPairs,
      showOccupancyCard: showOccupancy,
      entryFee,
      paymentAlias:      paymentAlias.trim(),
      paymentMethods,
      coverImage,
      updatedAt:         serverTimestamp(),
    };

    try {
      if (isEdit && editId) {
        await updateDoc(doc(db, "tournaments", editId), data);
        router.push(`/dashboard/torneos/${editId}`);
      } else {
        data.organizerId = user.uid;
        data.createdAt   = serverTimestamp();
        data.confirmedRegistrationsCount = 0;
        const newDoc = await addDoc(collection(db, "tournaments"), data);
        router.push(`/dashboard/torneos/${newDoc.id}`);
      }
    } catch (err) {
      setError("Error al guardar. Intentá de nuevo.");
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) return (
    <DashboardLayout title="Torneos">
      <div className="flex justify-center py-20">
        <Loader2 size={32} className="animate-spin" style={{ color: "#086847" }} />
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout title={isEdit ? "Editar torneo" : "Nuevo torneo"}>
      <a href="/dashboard/torneos" className="inline-flex items-center gap-1 text-sm mb-6 hover:opacity-70" style={{ color: "#5F7D72" }}>
        <ChevronLeft size={15} /> Volver a torneos
      </a>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-w-xl">

        {/* ── Bloque 1: Info básica ──────────────────────────────────── */}
        <SectionCard title="Información básica">
          <Field label="Nombre del torneo *">
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="ej: Copa Verano 2025"
              required className="form-input"
            />
          </Field>

          <Field label="Descripción">
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Descripción breve del torneo…"
              rows={3} className="form-input resize-none"
            />
          </Field>

          <Field label="Estado inicial">
            <select value={status} onChange={e => setStatus(e.target.value)} className="form-input">
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </Field>
        </SectionCard>

        {/* ── Bloque 2: Categoría ───────────────────────────────────── */}
        <SectionCard title="Categoría">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Rama">
              <select value={branch} onChange={e => setBranch(e.target.value)} className="form-input">
                {BRANCHES.map(b => <option key={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="Formato">
              <select value={format} onChange={e => setFormat(e.target.value)} className="form-input">
                {FORMATS.map(f => <option key={f}>{f}</option>)}
              </select>
            </Field>
            <Field label="Sistema">
              <select value={ruleset} onChange={e => setRuleset(e.target.value)} className="form-input">
                {RULESETS.map(r => <option key={r}>{r}</option>)}
              </select>
            </Field>
          </div>
          <p className="text-xs mt-1" style={{ color: "#5F7D72" }}>
            Categoría: <strong style={{ color: "#086847" }}>{branch} · {format} · {ruleset}</strong>
          </p>
        </SectionCard>

        {/* ── Bloque 3: Sede ────────────────────────────────────────── */}
        <SectionCard title="Sede">
          <Field label="Nombre del complejo">
            <input value={venueName} onChange={e => setVenueName(e.target.value)}
              placeholder="ej: Padel Club Norte" className="form-input" />
          </Field>
          <Field label="Dirección">
            <input value={venueAddress} onChange={e => setVenueAddress(e.target.value)}
              placeholder="ej: Av. Corrientes 1234, Buenos Aires" className="form-input" />
          </Field>
        </SectionCard>

        {/* ── Bloque 4: Fechas ──────────────────────────────────────── */}
        <SectionCard title="Fechas y días">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha de inicio">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="form-input" />
            </Field>
            <Field label="Fecha de fin">
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="form-input" />
            </Field>
          </div>

          <Field label="Días de juego">
            <div className="flex flex-wrap gap-2 mt-1">
              {DAYS.map(day => (
                <button
                  key={day} type="button" onClick={() => toggleDay(day)}
                  className="px-3 py-1.5 rounded-full text-xs font-bold border transition-all"
                  style={scheduleDays.includes(day)
                    ? { background: "#0B8457", color: "#FFFFFF", borderColor: "#0B8457" }
                    : { background: "#F6FBF8", color: "#5F7D72", borderColor: "#CFE7DC" }}
                >
                  {day}
                </button>
              ))}
            </div>
          </Field>
        </SectionCard>

        {/* ── Bloque 5: Cupos ───────────────────────────────────────── */}
        <SectionCard title="Cupos">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mínimo de parejas">
              <input type="number" min={2} value={minPairs} onChange={e => setMinPairs(Number(e.target.value))} className="form-input" />
            </Field>
            <Field label="Máximo de parejas">
              <input type="number" min={2} value={maxPairs} onChange={e => setMaxPairs(Number(e.target.value))} className="form-input" />
            </Field>
          </div>

          <Toggle label="Mostrar porcentaje de cupos cubiertos" value={showOccupancy} onChange={setShowOccupancy} />
        </SectionCard>

        {/* ── Bloque 6: Pago ────────────────────────────────────────── */}
        <SectionCard title="Inscripción y pago">
          <Field label="Cuota de inscripción (ARS)">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: "#5F7D72" }}>$</span>
              <input type="number" min={0} value={entryFee} onChange={e => setEntryFee(Number(e.target.value))}
                className="form-input pl-7" placeholder="0 = gratis" />
            </div>
          </Field>

          {entryFee > 0 && (
            <>
              <Field label="Alias / CBU para transferencia">
                <input value={paymentAlias} onChange={e => setPaymentAlias(e.target.value)}
                  placeholder="ej: mialiaspadel" className="form-input" />
              </Field>

              <Field label="Métodos de pago aceptados">
                <div className="flex flex-wrap gap-2 mt-1">
                  {PAYMENT_METHODS_OPTIONS.map(m => (
                    <button key={m} type="button" onClick={() => togglePaymentMethod(m)}
                      className="px-3 py-1.5 rounded-full text-xs font-bold border transition-all"
                      style={paymentMethods.includes(m)
                        ? { background: "#0B8457", color: "#FFFFFF", borderColor: "#0B8457" }
                        : { background: "#F6FBF8", color: "#5F7D72", borderColor: "#CFE7DC" }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </Field>
            </>
          )}
        </SectionCard>

        {/* ── Bloque 7: Afiche ──────────────────────────────────────── */}
        <SectionCard title="Afiche del torneo">
          {coverPreview ? (
            <div className="relative inline-block">
              <img src={coverPreview} alt="Afiche" className="w-full max-w-xs rounded-xl border object-cover"
                style={{ maxHeight: 240, borderColor: "#CFE7DC" }} />
              <button
                type="button" onClick={removeImage}
                className="absolute top-2 right-2 rounded-full border p-1 text-white shadow"
                style={{ background: "#B24343", borderColor: "#B24343" }}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button" onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex flex-col items-center justify-center gap-2 w-full max-w-xs rounded-xl border-2 border-dashed py-8 transition-colors hover:opacity-80"
              style={{ borderColor: "#CFE7DC", background: "#F6FBF8" }}
            >
              {uploading ? (
                <Loader2 size={24} className="animate-spin" style={{ color: "#0B8457" }} />
              ) : (
                <ImageIcon size={24} style={{ color: "#5F7D72" }} />
              )}
              <span className="text-sm font-semibold" style={{ color: "#5F7D72" }}>
                {uploading ? "Subiendo imagen…" : "Subir afiche"}
              </span>
              <span className="text-xs" style={{ color: "#9AB5AB" }}>JPG, PNG, WEBP</span>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-white mt-1" style={{ background: "#0B8457" }}>
                <Upload size={12} /> Seleccionar archivo
              </div>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </SectionCard>

        {/* ── Error ───────────────────────────────────────────────────── */}
        {error && (
          <div className="rounded-xl border px-4 py-3 text-sm font-semibold" style={{ background: "#FFF1F1", borderColor: "#F1C8C8", color: "#B24343" }}>
            {error}
          </div>
        )}

        {/* ── Acciones ───────────────────────────────────────────────── */}
        <div className="flex gap-3 pb-6">
          <a href="/dashboard/torneos"
            className="flex-1 py-3 rounded-xl text-center text-sm font-bold border transition-colors"
            style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}>
            Cancelar
          </a>
          <button
            type="submit" disabled={saving || uploading}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-60 transition-opacity"
            style={{ background: "#0B8457" }}
          >
            {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear torneo"}
          </button>
        </div>
      </form>

      {/* Estilos locales */}
      <style>{`
        .form-input {
          width: 100%;
          border: 1.5px solid #CFE7DC;
          border-radius: 12px;
          padding: 8px 12px;
          font-size: 14px;
          color: #173A2E;
          background: #FFFFFF;
          outline: none;
          transition: border-color 0.15s;
        }
        .form-input:focus { border-color: #0B8457; }
      `}</style>
    </DashboardLayout>
  );
}

// ── Helpers de UI ────────────────────────────────────────────────────────────
function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-4 flex flex-col gap-3" style={{ background: "#FFFFFF", borderColor: "#CFE7DC" }}>
      <h2 className="font-black text-sm" style={{ color: "#173A2E", borderBottom: "1px solid #F0F7F4", paddingBottom: 8, marginBottom: 4 }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-bold" style={{ color: "#5F7D72" }}>{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-semibold" style={{ color: "#173A2E" }}>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className="relative flex-shrink-0 rounded-full transition-all"
        style={{ width: 46, height: 26, background: value ? "#0B8457" : "#CFE7DC" }}
      >
        <span
          className="absolute top-[3px] rounded-full bg-white transition-all"
          style={{ width: 20, height: 20, left: value ? 23 : 3 }}
        />
      </button>
    </div>
  );
}
