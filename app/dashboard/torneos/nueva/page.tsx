"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { ChevronLeft, Loader2, ImageIcon, Plus, X } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type CategoryMode = "single" | "sum_fixed" | "sum_open";
type ConfirmMode  = "both_paid" | "one_paid" | "manual";
type CatConfig    = { categoryMode: CategoryMode; branch: string; sumTarget: string; fixedCategoryA: string };

// ── Constants ─────────────────────────────────────────────────────────────────
const CAT_OPTIONS = [
  { label: "9na (Iniciantes)", value: "9na", num: 9 },
  { label: "8va",  value: "8va",  num: 8 },
  { label: "7ma",  value: "7ma",  num: 7 },
  { label: "6ta",  value: "6ta",  num: 6 },
  { label: "5ta",  value: "5ta",  num: 5 },
  { label: "4ta",  value: "4ta",  num: 4 },
  { label: "3ra",  value: "3ra",  num: 3 },
  { label: "2da",  value: "2da",  num: 2 },
  { label: "1era", value: "1era", num: 1 },
];
const SUM_OPTIONS = Array.from({ length: 17 }, (_, i) => ({ label: `Suma ${i + 2}`, value: String(i + 2) }));
const PAIR_OPTS: { value: ConfirmMode; label: string; description: string }[] = [
  { value: "both_paid", label: "PAGO DE AMBOS JUGADORES",  description: "Se confirma cuando se aprueban los pagos de ambos. (ESTRICTO)" },
  { value: "one_paid",  label: "PAGO DE UNO DE LOS 2",    description: "Se confirma cuando se aprueba el pago de uno de los dos. (INTERMEDIO)" },
  { value: "manual",    label: "CONFIRMACIÓN MANUAL",      description: "El organizador confirma manualmente. (FLEXIBLE)" },
];
const BRANCHES = ["Masculino", "Femenino", "Mixto"] as const;
const DEFAULT_CAT: CatConfig = { categoryMode: "single", branch: "Masculino", sumTarget: "10", fixedCategoryA: "7ma" };

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseMoney(str: string) { return parseInt(str.replace(/\./g, ""), 10) || 0; }
function fmtMoney(n: number)     { return n === 0 ? "" : n.toLocaleString("es-AR").replace(/,/g, "."); }

function buildComposition(c: CatConfig) {
  const sumNum = parseInt(c.sumTarget) || 10;
  if (c.categoryMode === "single") {
    return {
      compositionType: "single_category",
      compositionConfig: { branch: c.branch, categoryFormat: "libre", fixedCategoryA: c.fixedCategoryA },
      compositionLabel: `${c.fixedCategoryA} ${c.branch}`,
    };
  }
  if (c.categoryMode === "sum_fixed") {
    const catANum = CAT_OPTIONS.find(o => o.value === c.fixedCategoryA)?.num ?? 0;
    const catB    = CAT_OPTIONS.find(o => o.num === sumNum - catANum);
    return {
      compositionType: "sum",
      compositionConfig: { branch: c.branch, categoryFormat: "suma", sumRule: "sum_fixed", sumTarget: sumNum, fixedCategoryA: c.fixedCategoryA, fixedCategoryB: catB?.value ?? "" },
      compositionLabel: `${c.fixedCategoryA}+${catB?.value ?? "?"} ${c.branch}`,
    };
  }
  return {
    compositionType: "sum",
    compositionConfig: { branch: c.branch, categoryFormat: "suma", sumRule: "sum_open", sumTarget: sumNum },
    compositionLabel: `Suma ${c.sumTarget} ${c.branch}`,
  };
}

// ── Page shell ────────────────────────────────────────────────────────────────
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

// ── Main form ─────────────────────────────────────────────────────────────────
function TorneoNuevaInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const editId       = searchParams.get("edit");
  const isEdit       = Boolean(editId);

  const [user, setUser]           = useState<any>(null);
  const [userData, setUserData]   = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState("");
  const fileRef                   = useRef<HTMLInputElement>(null);

  // S1 – Afiche
  const [coverImage, setCoverImage]     = useState("");
  const [coverPreview, setCoverPreview] = useState("");

  // S2 – Tipo
  const [tournamentRuleSet, setTournamentRuleSet] = useState<"fap" | "apa">("fap");

  // S3 – Modo
  const [creationMode, setCreationMode] = useState<"single" | "multiple">("single");
  const [quantity, setQuantity]         = useState(2);

  // S4 – Nombre
  const [name, setName] = useState("");

  // S5 – Venues
  const [selectedVenues, setSelectedVenues] = useState<string[]>([]);
  const [showTempModal, setShowTempModal]   = useState(false);
  const [tempName, setTempName]             = useState("");
  const [tempAddress, setTempAddress]       = useState("");
  const [savingTemp, setSavingTemp]         = useState(false);
  const [tempError, setTempError]           = useState("");

  // S6 – Categorías
  const [singleCat, setSingleCat]     = useState<CatConfig>({ ...DEFAULT_CAT });
  const [multiConfigs, setMultiConfigs] = useState<CatConfig[]>([{ ...DEFAULT_CAT }, { ...DEFAULT_CAT }]);

  // S7 – Costo
  const [pairConfirmation, setPairConfirmation] = useState<ConfirmMode>("manual");
  const [entryFeeStr, setEntryFeeStr]           = useState("");
  const [paymentAlias, setPaymentAlias]         = useState("");

  // S8 – Duración
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate]     = useState("");

  useEffect(() => {
    setMultiConfigs(prev => {
      const next = [...prev];
      while (next.length < quantity) next.push({ ...DEFAULT_CAT });
      return next.slice(0, quantity);
    });
  }, [quantity]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push("/login"); return; }
      setUser(u);
      const uSnap = await getDoc(doc(db, "users", u.uid));
      setUserData(uSnap.exists() ? uSnap.data() : {});

      if (editId) {
        const snap = await getDoc(doc(db, "tournaments", editId));
        if (snap.exists()) {
          const d: any = snap.data();
          setName(d.name ?? "");
          setTournamentRuleSet(d.tournamentRuleSet ?? "fap");
          setPairConfirmation(d.pairConfirmationMode ?? "manual");
          setEntryFeeStr(d.entryFee ? fmtMoney(d.entryFee) : "");
          setPaymentAlias(d.paymentAlias ?? "");
          setStartDate(d.startDateMillis ? new Date(d.startDateMillis).toISOString().slice(0, 10) : "");
          setEndDate(d.endDateMillis     ? new Date(d.endDateMillis).toISOString().slice(0, 10)   : "");
          setSelectedVenues((d.venues ?? []).map((v: any) => v.name));
          if (d.coverImage) { setCoverImage(d.coverImage); setCoverPreview(d.coverImage); }
          if (d.compositionConfig) {
            const cc = d.compositionConfig;
            const mode: CategoryMode = cc.sumRule === "sum_fixed" ? "sum_fixed" : cc.sumRule === "sum_open" ? "sum_open" : "single";
            setSingleCat({ categoryMode: mode, branch: cc.branch ?? "Masculino", sumTarget: cc.sumTarget ? String(cc.sumTarget) : "10", fixedCategoryA: cc.fixedCategoryA ?? "7ma" });
          }
        }
      }
      setLoading(false);
    });
    return unsub;
  }, [editId, router]);

  const allVenues: any[] = [...(userData?.complejos ?? []), ...(userData?.tournamentComplexes ?? [])];

  function toggleVenue(n: string) {
    setSelectedVenues(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);
  }

  async function addTempVenue() {
    if (!tempName.trim()) { setTempError("El nombre es obligatorio."); return; }
    setSavingTemp(true);
    try {
      const v       = { name: tempName.trim(), address: tempAddress.trim() };
      const current = userData?.tournamentComplexes ?? [];
      await updateDoc(doc(db, "users", user.uid), { tournamentComplexes: [...current, v] });
      setUserData((p: any) => ({ ...p, tournamentComplexes: [...current, v] }));
      setSelectedVenues(p => [...p, v.name]);
      setTempName(""); setTempAddress(""); setShowTempModal(false);
    } catch { setTempError("Error al guardar."); }
    setSavingTemp(false);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const ext  = file.name.split(".").pop();
      const sRef = ref(storage, `tournaments/covers/${user.uid}/${Date.now()}.${ext}`);
      const snap = await uploadBytes(sRef, file);
      const url  = await getDownloadURL(snap.ref);
      setCoverImage(url); setCoverPreview(url);
    } catch { setError("Error al subir la imagen."); }
    setUploading(false);
  }

  function buildVenues() {
    return selectedVenues.map(n => {
      const v = allVenues.find((av: any) => av.name === n);
      return { name: n, address: v?.address ?? "" };
    });
  }

  function buildBase(cat: CatConfig, tournamentName: string) {
    const comp = buildComposition(cat);
    const fee  = parseMoney(entryFeeStr);
    return {
      name: tournamentName,
      organizerId: user.uid,
      organizerName: userData?.name ?? "",
      organizerLogoUrl: userData?.logoUrl ?? "",
      coverImage,
      description: "",
      tournamentRuleSet,
      status: "draft",
      registrationStatus: "closed",
      venueMode: selectedVenues.length > 1 ? "multiple" : "single",
      venues: buildVenues(),
      temporaryVenues: [],
      ...comp,
      tournamentFormat: "groups_knockout",
      matchFormat: "best_of_3",
      thirdSetMode: "super_tiebreak",
      maxPairs: 8,
      minPairs: 4,
      registrationMode: "pair_only",
      pairConfirmationMode: pairConfirmation,
      entryFee: fee,
      paymentMethods: fee > 0 ? ["transferencia"] : [],
      paymentAlias: fee > 0 ? paymentAlias.trim() : "",
      startDateMillis: new Date(startDate).setHours(0, 0, 0, 0),
      endDateMillis:   new Date(endDate).setHours(0, 0, 0, 0),
      buildMode: "automatic",
      recommendedGroupSize: 4,
      allowManualCorrection: true,
      championPairId: "",
      runnerUpPairId: "",
      confirmedRegistrationsCount: 0,
      createdBy: user.uid,
      createdByName: userData?.name ?? "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim())           { setError("El nombre del torneo es obligatorio."); return; }
    if (!selectedVenues.length) { setError("Seleccioná al menos un lugar de juego."); return; }
    if (!startDate)             { setError("La fecha de inicio es obligatoria."); return; }
    if (!endDate)               { setError("La fecha de fin es obligatoria."); return; }
    if (!user) return;
    setSaving(true); setError("");

    try {
      if (isEdit && editId) {
        const comp = buildComposition(singleCat);
        const fee  = parseMoney(entryFeeStr);
        await updateDoc(doc(db, "tournaments", editId), {
          name: name.trim(),
          tournamentRuleSet,
          venues: buildVenues(),
          venueMode: selectedVenues.length > 1 ? "multiple" : "single",
          ...comp,
          pairConfirmationMode: pairConfirmation,
          entryFee: fee,
          paymentMethods: fee > 0 ? ["transferencia"] : [],
          paymentAlias: fee > 0 ? paymentAlias.trim() : "",
          startDateMillis: new Date(startDate).setHours(0, 0, 0, 0),
          endDateMillis:   new Date(endDate).setHours(0, 0, 0, 0),
          coverImage,
          updatedAt: serverTimestamp(),
        });
        router.push(`/dashboard/torneos/${editId}`);
        return;
      }

      if (creationMode === "single") {
        const newRef = await addDoc(collection(db, "tournaments"), buildBase(singleCat, name.trim().toUpperCase()));
        router.push(`/dashboard/torneos/${newRef.id}`);
      } else {
        const batch = writeBatch(db);
        multiConfigs.forEach(cat => {
          const comp           = buildComposition(cat);
          const tournamentName = `${name.trim().toUpperCase()} ${comp.compositionLabel}`;
          const newRef         = doc(collection(db, "tournaments"));
          batch.set(newRef, buildBase(cat, tournamentName));
        });
        await batch.commit();
        router.push("/dashboard/torneos");
      }
    } catch {
      setError("Error al guardar. Intentá de nuevo.");
      setSaving(false);
    }
  }

  if (loading) return (
    <DashboardLayout title="Torneos">
      <div className="flex justify-center py-20">
        <Loader2 size={32} className="animate-spin" style={{ color: "#086847" }} />
      </div>
    </DashboardLayout>
  );

  const fee = parseMoney(entryFeeStr);

  return (
    <DashboardLayout title={isEdit ? "Editar torneo" : "Nuevo torneo"}>
      <a href="/dashboard/torneos" className="inline-flex items-center gap-1 text-sm mb-6 hover:opacity-70" style={{ color: "#5F7D72" }}>
        <ChevronLeft size={15} /> Volver a torneos
      </a>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-w-2xl">

        {/* 1 · Afiche */}
        <SectionCard title="Afiche del torneo">
          {coverPreview ? (
            <div className="relative inline-block">
              <img src={coverPreview} alt="Afiche" className="w-full max-w-xs rounded-xl border object-cover"
                style={{ maxHeight: 240, borderColor: "#CFE7DC" }} />
              <button type="button"
                onClick={() => { setCoverImage(""); setCoverPreview(""); if (fileRef.current) fileRef.current.value = ""; }}
                className="absolute top-2 right-2 rounded-full p-1 text-white shadow"
                style={{ background: "#B24343" }}>
                <X size={14} />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="flex flex-col items-center gap-2 w-full max-w-xs rounded-xl border-2 border-dashed py-8 hover:opacity-80"
              style={{ borderColor: "#CFE7DC", background: "#F6FBF8" }}>
              {uploading
                ? <Loader2 size={24} className="animate-spin" style={{ color: "#0B8457" }} />
                : <ImageIcon size={24} style={{ color: "#5F7D72" }} />}
              <span className="text-sm font-semibold" style={{ color: "#5F7D72" }}>
                {uploading ? "Subiendo…" : "Subir afiche"}
              </span>
              <span className="text-xs" style={{ color: "#9AB5AB" }}>JPG, PNG, WEBP</span>
              <span className="px-3 py-1.5 rounded-full text-xs font-bold text-white" style={{ background: "#0B8457" }}>Seleccionar</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </SectionCard>

        {/* 2 · Tipo de torneo */}
        {!isEdit && (
          <SectionCard title="Tipo de torneo">
            <p className="text-xs" style={{ color: "#5F7D72" }}>Reglamento del torneo</p>
            <div className="flex gap-3 mt-1">
              {(["fap", "apa"] as const).map(r => (
                <button key={r} type="button" onClick={() => setTournamentRuleSet(r)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-black uppercase border-2 transition-all"
                  style={tournamentRuleSet === r
                    ? { background: "#0B8457", color: "#FFFFFF", borderColor: "#0B8457" }
                    : { background: "#F6FBF8", color: "#5F7D72", borderColor: "#CFE7DC" }}>
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          </SectionCard>
        )}

        {/* 3 · Modo de armado */}
        {!isEdit && (
          <SectionCard title="Modo de armado">
            <div className="flex gap-3">
              <button type="button" onClick={() => setCreationMode("single")}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all"
                style={creationMode === "single"
                  ? { background: "#0B8457", color: "#FFFFFF", borderColor: "#0B8457" }
                  : { background: "#F6FBF8", color: "#5F7D72", borderColor: "#CFE7DC" }}>
                Torneo único
              </button>
              <button type="button" onClick={() => setCreationMode("multiple")}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all"
                style={creationMode === "multiple"
                  ? { background: "#0B8457", color: "#FFFFFF", borderColor: "#0B8457" }
                  : { background: "#F6FBF8", color: "#5F7D72", borderColor: "#CFE7DC" }}>
                Múltiples torneos
              </button>
            </div>
            {creationMode === "multiple" && (
              <div className="mt-3 flex flex-col gap-1">
                <p className="text-xs font-semibold" style={{ color: "#5F7D72" }}>Cantidad de torneos</p>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setQuantity(q => Math.max(2, q - 1))}
                    className="w-9 h-9 rounded-full border-2 text-xl font-black flex items-center justify-center"
                    style={{ borderColor: "#CFE7DC", color: "#0B8457" }}>−</button>
                  <span className="text-xl font-black w-8 text-center" style={{ color: "#173A2E" }}>{quantity}</span>
                  <button type="button" onClick={() => setQuantity(q => Math.min(10, q + 1))}
                    className="w-9 h-9 rounded-full border-2 text-xl font-black flex items-center justify-center"
                    style={{ borderColor: "#CFE7DC", color: "#0B8457" }}>+</button>
                </div>
              </div>
            )}
          </SectionCard>
        )}

        {/* 4 · Nombre */}
        <SectionCard title={creationMode === "multiple" && !isEdit ? "Nombre base" : "Nombre del torneo"}>
          <input value={name} onChange={e => setName(e.target.value.toUpperCase())}
            placeholder="ej: COPA VERANO 2025" className="form-input"
            style={{ fontWeight: 700, letterSpacing: "0.5px" }} />
          {creationMode === "multiple" && !isEdit && (
            <p className="text-xs" style={{ color: "#5F7D72" }}>
              Se usará como prefijo: «{name || "NOMBRE"} 7ma Masculino», etc.
            </p>
          )}
        </SectionCard>

        {/* 5 · Lugares de juego */}
        <SectionCard title="Lugares de juego">
          {allVenues.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {allVenues.map((v: any) => (
                <button key={v.name} type="button" onClick={() => toggleVenue(v.name)}
                  className="px-3 py-1.5 rounded-full text-sm font-bold border-2 transition-all"
                  style={selectedVenues.includes(v.name)
                    ? { background: "#0B8457", color: "#FFFFFF", borderColor: "#0B8457" }
                    : { background: "#F6FBF8", color: "#5F7D72", borderColor: "#CFE7DC" }}>
                  {v.name}
                </button>
              ))}
            </div>
          )}
          {allVenues.length === 0 && (
            <p className="text-sm" style={{ color: "#5F7D72" }}>No tenés complejos registrados. Podés agregar uno temporal.</p>
          )}
          <button type="button" onClick={() => { setShowTempModal(true); setTempError(""); }}
            className="inline-flex items-center gap-1.5 text-sm font-bold hover:opacity-70 transition-opacity"
            style={{ color: "#0B8457" }}>
            <Plus size={14} /> Agregar complejo temporal
          </button>
          {selectedVenues.length > 0 && (
            <p className="text-xs font-semibold" style={{ color: "#086847" }}>
              Seleccionado: {selectedVenues.join(", ")}
            </p>
          )}
        </SectionCard>

        {/* 6 · Categorías */}
        {(creationMode === "single" || isEdit) ? (
          <SectionCard title="Categoría">
            <CategoryForm config={singleCat}
              onChange={patch => setSingleCat(p => ({ ...p, ...patch }))} />
          </SectionCard>
        ) : (
          multiConfigs.map((cat, i) => (
            <SectionCard key={i} title={`Torneo ${i + 1} — Categoría`}>
              <CategoryForm config={cat}
                onChange={patch => setMultiConfigs(p => p.map((c, j) => j === i ? { ...c, ...patch } : c))} />
            </SectionCard>
          ))
        )}

        {/* 7 · Costo y modalidad */}
        <SectionCard title="Costo y modalidad">
          <Field label="Cuota de inscripción (ARS)">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: "#5F7D72" }}>$</span>
              <input
                value={entryFeeStr}
                onChange={e => {
                  const raw = e.target.value.replace(/\./g, "");
                  const n   = parseInt(raw) || 0;
                  setEntryFeeStr(n === 0 ? "" : n.toLocaleString("es-AR").replace(/,/g, "."));
                }}
                placeholder="0 = gratis" inputMode="numeric" className="form-input pl-7"
              />
            </div>
          </Field>

          {fee > 0 && (
            <Field label="Alias / CVU para transferencia">
              <input value={paymentAlias} onChange={e => setPaymentAlias(e.target.value)}
                placeholder="ej: mialiaspadel" className="form-input" />
            </Field>
          )}

          <div>
            <p className="text-xs font-bold mb-2" style={{ color: "#5F7D72" }}>Confirmación de pareja</p>
            <div className="flex flex-col gap-2">
              {PAIR_OPTS.map(opt => (
                <button key={opt.value} type="button" onClick={() => setPairConfirmation(opt.value)}
                  className="text-left rounded-xl border-2 p-3 transition-all"
                  style={pairConfirmation === opt.value
                    ? { borderColor: "#0B8457", background: "#F0FAF5" }
                    : { borderColor: "#CFE7DC", background: "#FFFFFF" }}>
                  <p className="text-xs font-black" style={{ color: pairConfirmation === opt.value ? "#0B8457" : "#173A2E" }}>
                    {opt.label}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#5F7D72" }}>{opt.description}</p>
                </button>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* 8 · Duración */}
        <SectionCard title="Duración del torneo">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha de inicio">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="form-input" />
            </Field>
            <Field label="Fecha de fin">
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="form-input" />
            </Field>
          </div>
        </SectionCard>

        {error && (
          <div className="rounded-xl border px-4 py-3 text-sm font-semibold"
            style={{ background: "#FFF1F1", borderColor: "#F1C8C8", color: "#B24343" }}>
            {error}
          </div>
        )}

        <div className="flex gap-3 pb-6">
          <a href="/dashboard/torneos"
            className="flex-1 py-3 rounded-xl text-center text-sm font-bold border"
            style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}>
            Cancelar
          </a>
          <button type="submit" disabled={saving || uploading}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-60"
            style={{ background: "#0B8457" }}>
            {saving ? "Guardando…" : isEdit ? "Guardar cambios" : creationMode === "multiple" ? `Crear ${quantity} torneos` : "Crear torneo"}
          </button>
        </div>
      </form>

      {/* Modal: complejo temporal */}
      {showTempModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-6 flex flex-col gap-4"
            style={{ background: "#FFFFFF" }}>
            <div className="flex items-center justify-between">
              <h3 className="font-black text-base" style={{ color: "#173A2E" }}>Agregar complejo temporal</h3>
              <button type="button" onClick={() => { setShowTempModal(false); setTempError(""); }}
                className="p-1 rounded-full hover:opacity-70">
                <X size={18} style={{ color: "#5F7D72" }} />
              </button>
            </div>
            <Field label="Nombre *">
              <input value={tempName} onChange={e => setTempName(e.target.value)}
                placeholder="ej: Padel Club Norte" className="form-input" />
            </Field>
            <Field label="Dirección">
              <input value={tempAddress} onChange={e => setTempAddress(e.target.value)}
                placeholder="ej: Av. Corrientes 1234" className="form-input" />
            </Field>
            {tempError && (
              <p className="text-xs font-semibold" style={{ color: "#B24343" }}>{tempError}</p>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={() => { setShowTempModal(false); setTempError(""); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border"
                style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}>
                Cancelar
              </button>
              <button type="button" onClick={addTempVenue} disabled={savingTemp}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
                style={{ background: "#0B8457" }}>
                {savingTemp ? "Guardando…" : "Agregar"}
              </button>
            </div>
          </div>
        </div>
      )}

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

// ── CategoryForm ──────────────────────────────────────────────────────────────
function CategoryForm({ config, onChange }: {
  config: CatConfig;
  onChange: (patch: Partial<CatConfig>) => void;
}) {
  const { categoryMode, branch, sumTarget, fixedCategoryA } = config;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set = (k: keyof CatConfig, v: any) => onChange({ [k]: v });

  const sumNum   = parseInt(sumTarget) || 10;
  const catANum  = CAT_OPTIONS.find(o => o.value === fixedCategoryA)?.num ?? 0;
  const autoCatB = categoryMode === "sum_fixed" ? CAT_OPTIONS.find(o => o.num === sumNum - catANum) : null;

  const validCatA = categoryMode === "sum_fixed"
    ? CAT_OPTIONS.filter(o => { const b = sumNum - o.num; return b >= 1 && b <= 9 && b !== o.num; })
    : CAT_OPTIONS;

  const previewLabel = categoryMode === "single"
    ? `${fixedCategoryA} ${branch}`
    : categoryMode === "sum_fixed"
      ? `${fixedCategoryA}+${autoCatB?.value ?? "?"} ${branch}`
      : `Suma ${sumTarget} ${branch}`;

  return (
    <div className="flex flex-col gap-3">
      {/* Rama */}
      <div>
        <p className="text-xs font-bold mb-1.5" style={{ color: "#5F7D72" }}>Rama</p>
        <div className="flex gap-2">
          {BRANCHES.map(b => (
            <button key={b} type="button" onClick={() => set("branch", b)}
              className="flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all"
              style={branch === b
                ? { background: "#0B8457", color: "#FFFFFF", borderColor: "#0B8457" }
                : { background: "#F6FBF8", color: "#5F7D72", borderColor: "#CFE7DC" }}>
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Tipo de categoría */}
      <div>
        <p className="text-xs font-bold mb-1.5" style={{ color: "#5F7D72" }}>Tipo de categoría</p>
        <div className="flex gap-2">
          {([
            { v: "single" as CategoryMode,    l: "Cat. fija" },
            { v: "sum_fixed" as CategoryMode, l: "Suma fija" },
            { v: "sum_open" as CategoryMode,  l: "Suma abierta" },
          ]).map(({ v, l }) => (
            <button key={v} type="button" onClick={() => set("categoryMode", v)}
              className="flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all"
              style={categoryMode === v
                ? { background: "#0B8457", color: "#FFFFFF", borderColor: "#0B8457" }
                : { background: "#F6FBF8", color: "#5F7D72", borderColor: "#CFE7DC" }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* single: elegir categoría */}
      {categoryMode === "single" && (
        <Field label="Categoría">
          <select value={fixedCategoryA} onChange={e => set("fixedCategoryA", e.target.value)} className="form-input">
            {CAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      )}

      {/* sum: elegir suma objetivo */}
      {(categoryMode === "sum_fixed" || categoryMode === "sum_open") && (
        <Field label="Suma objetivo">
          <select value={sumTarget} onChange={e => set("sumTarget", e.target.value)} className="form-input">
            {SUM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      )}

      {/* sum_fixed: catA + catB auto */}
      {categoryMode === "sum_fixed" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoría A">
            <select value={fixedCategoryA} onChange={e => set("fixedCategoryA", e.target.value)} className="form-input">
              {validCatA.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Categoría B (auto)">
            <div className="form-input" style={{ background: "#F6FBF8", color: autoCatB ? "#086847" : "#B24343", fontWeight: 700 }}>
              {autoCatB ? autoCatB.label : "No válido"}
            </div>
          </Field>
        </div>
      )}

      <p className="text-xs font-semibold" style={{ color: "#5F7D72" }}>
        Vista previa: <strong style={{ color: "#086847" }}>{previewLabel}</strong>
      </p>
    </div>
  );
}

// ── UI helpers ────────────────────────────────────────────────────────────────
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
