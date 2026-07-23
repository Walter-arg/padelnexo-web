"use client";

import { useEffect, useMemo, useState, useRef, Suspense } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { ChevronLeft, Loader2, ImageIcon } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type CategoryMode = "single" | "sum_fixed" | "sum_open";
type ConfirmMode  = "both_paid" | "one_paid" | "manual";
type VenueMode    = "single" | "multiple";
type CatConfig    = { categoryMode: CategoryMode; branch: string; sumTarget: string; fixedCategoryA: string; fixedCategoryB: string };

// ── Constants ─────────────────────────────────────────────────────────────────
const CAT_OPTIONS = [
  { label: "9na", value: "9na", num: 9 },
  { label: "8va", value: "8va", num: 8 },
  { label: "7ma", value: "7ma", num: 7 },
  { label: "6ta", value: "6ta", num: 6 },
  { label: "5ta", value: "5ta", num: 5 },
  { label: "4ta", value: "4ta", num: 4 },
  { label: "3ra", value: "3ra", num: 3 },
  { label: "2da", value: "2da", num: 2 },
  { label: "1era", value: "1era", num: 1 },
];

const SUM_OPTIONS = Array.from({ length: 17 }, (_, i) => ({
  label: `Suma ${i + 2}`, value: String(i + 2),
}));

const DEFAULT_CAT: CatConfig = {
  categoryMode: "single", branch: "Masculino",
  sumTarget: "", fixedCategoryA: "", fixedCategoryB: "",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseMoney(s: string)  { return parseInt(s.replace(/\./g, ""), 10) || 0; }
function fmtMoney(n: number)    { return n === 0 ? "" : n.toLocaleString("es-AR").replace(/,/g, "."); }

function buildComposition(c: CatConfig) {
  const sumNum = parseInt(c.sumTarget) || 0;
  if (c.categoryMode === "single") {
    return {
      compositionType: "single_category",
      compositionConfig: { branch: c.branch, categoryFormat: "libre", fixedCategoryA: c.fixedCategoryA },
      compositionLabel: `${c.fixedCategoryA} ${c.branch}`.trim(),
    };
  }
  if (c.categoryMode === "sum_fixed") {
    return {
      compositionType: "sum",
      compositionConfig: { branch: c.branch, categoryFormat: "suma", sumRule: "sum_fixed", sumTarget: sumNum, fixedCategoryA: c.fixedCategoryA, fixedCategoryB: c.fixedCategoryB },
      compositionLabel: ([c.fixedCategoryA, c.fixedCategoryB].filter(Boolean).join("+") + ` ${c.branch}`).trim(),
    };
  }
  return {
    compositionType: "sum",
    compositionConfig: { branch: c.branch, categoryFormat: "suma", sumRule: "sum_open", sumTarget: sumNum },
    compositionLabel: `Suma ${c.sumTarget} ${c.branch}`.trim(),
  };
}

function getValidCatAOptions(sumTarget: string) {
  if (!sumTarget) return CAT_OPTIONS;
  const n = parseInt(sumTarget);
  if (isNaN(n)) return CAT_OPTIONS;
  return CAT_OPTIONS.filter(o => {
    const b = n - o.num;
    return CAT_OPTIONS.some(c => c.num === b);
  });
}

function getValidCatBOptions(sumTarget: string, catA: string) {
  if (!sumTarget || !catA) return [];
  const n = parseInt(sumTarget);
  const a = CAT_OPTIONS.find(o => o.value === catA);
  if (!a || isNaN(n)) return CAT_OPTIONS;
  return CAT_OPTIONS.filter(o => o.num === n - a.num);
}

// ── Page shell ────────────────────────────────────────────────────────────────
export default function TorneoNuevaPage() {
  return (
    <Suspense fallback={
      <DashboardLayout title="Torneos" wide>
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

  // S2 – Tipo de torneo
  const [tournamentRuleSet, setTournamentRuleSet] = useState<"fap" | "apa">("fap");

  // S3 – Modo de armado
  const [creationMode, setCreationMode] = useState<"single" | "multiple">("single");
  const [quantity, setQuantity]         = useState("2");

  // S4 – Nombre
  const [name, setName] = useState("");

  // S5 – Venues
  const [venueMode, setVenueMode]           = useState<VenueMode>("single");
  const [selectedVenues, setSelectedVenues] = useState<string[]>([]);
  const [showTempModal, setShowTempModal]   = useState(false);
  const [tempName, setTempName]             = useState("");
  const [tempBlindex, setTempBlindex]       = useState("");
  const [tempCesped, setTempCesped]         = useState("");
  const [tempCemento, setTempCemento]       = useState("");
  const [tempAddress, setTempAddress]       = useState("");
  const [savingTemp, setSavingTemp]         = useState(false);
  const [tempError, setTempError]           = useState("");

  // S6 – Categorías
  const [singleCat, setSingleCat]       = useState<CatConfig>({ ...DEFAULT_CAT });
  const [multiConfigs, setMultiConfigs] = useState<CatConfig[]>([{ ...DEFAULT_CAT }, { ...DEFAULT_CAT }]);

  // S7 – Costo
  const [pairConfirmation, setPairConfirmation] = useState<ConfirmMode>("manual");
  const [entryFeeStr, setEntryFeeStr]           = useState("");
  const [paymentAlias, setPaymentAlias]         = useState("");

  // S8 – Duración
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate]     = useState("");

  // Sync multiConfigs length with quantity
  useEffect(() => {
    const qty = Math.max(2, parseInt(quantity) || 2);
    setMultiConfigs(prev => {
      const next = [...prev];
      while (next.length < qty) next.push({ ...DEFAULT_CAT });
      return next.slice(0, qty);
    });
  }, [quantity]);

  // Auth + data load
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push("/login"); return; }
      setUser(u);
      const uSnap = await getDoc(doc(db, "users", u.uid));
      const ud = uSnap.exists() ? uSnap.data() : {};
      setUserData(ud);

      if (!editId && Array.isArray(ud.complejos) && ud.complejos.length > 0) {
        setSelectedVenues([ud.complejos[0].nombre]);
      }

      if (editId) {
        const snap = await getDoc(doc(db, "tournaments", editId));
        if (snap.exists()) {
          const d: any = snap.data();
          setName(d.name ?? "");
          setTournamentRuleSet(d.tournamentRuleSet ?? "fap");
          setVenueMode(d.venueMode ?? "single");
          setPairConfirmation(d.pairConfirmationMode ?? "manual");
          setEntryFeeStr(d.entryFee ? fmtMoney(d.entryFee) : "");
          setPaymentAlias(d.paymentAlias ?? "");
          setStartDate(d.startDateMillis ? new Date(d.startDateMillis).toISOString().slice(0, 10) : "");
          setEndDate(d.endDateMillis     ? new Date(d.endDateMillis).toISOString().slice(0, 10)   : "");
          setSelectedVenues((d.venues ?? []).map((v: any) => v.name));
          if (d.coverImage) { setCoverImage(d.coverImage); setCoverPreview(d.coverImage); }
          if (d.compositionConfig) {
            const cc = d.compositionConfig;
            const rule = cc.sumRule ?? "";
            const mode: CategoryMode = (rule === "sum_fixed" || rule === "fixed") ? "sum_fixed"
              : (rule === "sum_open" || rule === "open") ? "sum_open" : "single";
            setSingleCat({ categoryMode: mode, branch: cc.branch ?? "Masculino", sumTarget: cc.sumTarget ? String(cc.sumTarget) : "", fixedCategoryA: cc.fixedCategoryA ?? "", fixedCategoryB: cc.fixedCategoryB ?? "" });
          }
        }
      }
      setLoading(false);
    });
    return unsub;
  }, [editId, router]);

  const approvedVenues: any[] = userData?.complejos ?? [];
  const tempVenues: any[]     = userData?.tournamentComplexes ?? [];
  const allVenues              = useMemo(() => [...approvedVenues, ...tempVenues], [userData]);

  function toggleVenue(nombre: string) {
    setSelectedVenues(prev => {
      if (venueMode === "single") return [nombre];
      return prev.includes(nombre) ? prev.filter(x => x !== nombre) : [...prev, nombre];
    });
  }

  function changeVenueMode(mode: VenueMode) {
    setVenueMode(mode);
    if (mode === "single") setSelectedVenues(prev => prev.slice(0, 1));
  }

  async function addTempVenue() {
    if (!tempName.trim()) { setTempError("El nombre es obligatorio."); return; }
    const bl = parseInt(tempBlindex) || 0;
    const cs = parseInt(tempCesped)  || 0;
    const cm = parseInt(tempCemento) || 0;
    if (bl + cs + cm === 0) { setTempError("Cargá al menos una cancha para guardar el lugar."); return; }
    setSavingTemp(true);
    try {
      const v = { nombre: tempName.trim(), blindex: bl, cesped: cs, cemento: cm, totalCanchas: bl + cs + cm, direccion: tempAddress.trim() };
      const current: any[] = userData?.tournamentComplexes ?? [];
      const exists = current.some((c: any) => c.nombre?.toLowerCase() === v.nombre.toLowerCase());
      const next = exists
        ? current.map((c: any) => c.nombre?.toLowerCase() === v.nombre.toLowerCase() ? v : c)
        : [...current, v];
      await updateDoc(doc(db, "users", user.uid), { tournamentComplexes: next });
      setUserData((p: any) => ({ ...p, tournamentComplexes: next }));
      setSelectedVenues(prev => {
        if (venueMode === "single") return [v.nombre];
        return prev.includes(v.nombre) ? prev : [...prev, v.nombre];
      });
      setTempName(""); setTempBlindex(""); setTempCesped(""); setTempCemento(""); setTempAddress("");
      setShowTempModal(false); setTempError("");
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
    return selectedVenues.map(nombre => {
      const c = allVenues.find((av: any) => av.nombre === nombre);
      return { name: nombre, address: c?.direccion ?? "" };
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
      venueMode,
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
      paymentAlias: paymentAlias.trim(),
      startDateMillis: startDate ? new Date(startDate).setHours(0, 0, 0, 0) : 0,
      endDateMillis:   endDate   ? new Date(endDate).setHours(0, 0, 0, 0)   : 0,
      buildMode: "automatic",
      recommendedGroupSize: 4,
      allowManualCorrection: true,
      championPairId: "",
      runnerUpPairId: "",
      confirmedRegistrationsCount: 0,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
  }

  const previewNames = useMemo(() => {
    if (creationMode !== "multiple" || !name.trim()) return [];
    const qty = Math.max(2, parseInt(quantity) || 2);
    return multiConfigs.slice(0, qty).map(cat => {
      const suffix = buildComposition(cat).compositionLabel;
      return [name.trim().toUpperCase(), suffix].filter(Boolean).join(" ");
    });
  }, [creationMode, name, quantity, multiConfigs]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Escribí el nombre del torneo."); return; }
    if (!selectedVenues.length) { setError("Seleccioná al menos un lugar de juego."); return; }
    if (creationMode !== "multiple" && !singleCat.fixedCategoryA) { setError("Seleccioná la categoría."); return; }
    if (creationMode !== "multiple" && singleCat.categoryMode !== "single" && !singleCat.sumTarget) { setError("Seleccioná la suma objetivo."); return; }
    if (creationMode !== "multiple" && singleCat.categoryMode === "sum_fixed" && !singleCat.fixedCategoryB) { setError("Seleccioná la Categoría B."); return; }
    if (!startDate) { setError("Seleccioná la fecha de inicio."); return; }
    if (!endDate)   { setError("Seleccioná la fecha de fin."); return; }
    if (!user) return;
    setSaving(true); setError("");

    try {
      if (isEdit && editId) {
        const comp = buildComposition(singleCat);
        const fee  = parseMoney(entryFeeStr);
        await updateDoc(doc(db, "tournaments", editId), {
          name: name.trim(), tournamentRuleSet, venues: buildVenues(), venueMode, ...comp,
          pairConfirmationMode: pairConfirmation, entryFee: fee,
          paymentMethods: fee > 0 ? ["transferencia"] : [], paymentAlias: paymentAlias.trim(),
          startDateMillis: new Date(startDate).setHours(0, 0, 0, 0),
          endDateMillis:   new Date(endDate).setHours(0, 0, 0, 0),
          coverImage, updatedAt: serverTimestamp(),
        });
        router.push(`/dashboard/torneos/${editId}`);
        return;
      }

      if (creationMode === "single") {
        const newRef = await addDoc(collection(db, "tournaments"), buildBase(singleCat, name.trim().toUpperCase()));
        router.push(`/dashboard/torneos/${newRef.id}`);
      } else {
        const qty   = Math.max(2, parseInt(quantity) || 2);
        const batch = writeBatch(db);
        multiConfigs.slice(0, qty).forEach(cat => {
          const comp   = buildComposition(cat);
          const tName  = [name.trim().toUpperCase(), comp.compositionLabel].filter(Boolean).join(" ");
          batch.set(doc(collection(db, "tournaments")), buildBase(cat, tName));
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
    <DashboardLayout title="Torneos" wide>
      <div className="flex justify-center py-20">
        <Loader2 size={32} className="animate-spin" style={{ color: "#086847" }} />
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout title={isEdit ? "Editar torneo" : "Nuevo torneo"} wide>
      <a href="/dashboard/torneos" className="inline-flex items-center gap-1 text-sm mb-6 hover:opacity-70" style={{ color: "#5F7D72" }}>
        <ChevronLeft size={15} /> Volver a torneos
      </a>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-3xl mx-auto">

        {/* 1 · Afiche */}
        <Card title="SUBIR AFICHE O FLYER">
          {coverPreview ? (
            <div className="flex items-center gap-3 rounded-xl border p-3" style={{ background: "#F7FBF8", borderColor: "#DCE9E1" }}>
              <img src={coverPreview} alt="Afiche" className="w-28 h-20 rounded-lg object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black uppercase" style={{ color: "#086847" }}>Afiche cargado</p>
                <p className="text-xs mt-1" style={{ color: "#5F7D72" }}>Imagen del torneo seleccionada.</p>
              </div>
              <button type="button" onClick={() => { setCoverImage(""); setCoverPreview(""); if (fileRef.current) fileRef.current.value = ""; }}
                className="text-xs font-black hover:opacity-70" style={{ color: "#B24343" }}>Quitar</button>
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="flex items-center gap-3 w-full rounded-xl border px-4 py-3 hover:opacity-80 transition-opacity"
              style={{ background: "#F4FAF7", borderColor: "#CFE7DC" }}>
              {uploading
                ? <Loader2 size={20} className="animate-spin flex-shrink-0" style={{ color: "#0B8457" }} />
                : <ImageIcon size={20} className="flex-shrink-0" style={{ color: "#086847" }} />}
              <span>
                <span className="block text-sm font-black" style={{ color: "#173A2E" }}>{uploading ? "Subiendo imagen…" : "Subir afiche o flyer"}</span>
                <span className="block text-xs mt-0.5" style={{ color: "#5F7D72" }}>JPG, PNG, WEBP — opcional</span>
              </span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </Card>

        {/* 2 · Tipo de torneo */}
        {!isEdit && (
          <Card title="TIPO DE TORNEO">
            <RadioList
              options={[
                { value: "fap", label: "TORNEO FAP", subtitle: "Federación Argentina de Pádel", description: "3 clasificados por zona de 4. Modalidad más extensa." },
                { value: "apa", label: "TORNEO APA", subtitle: "Asociación Pádel Argentina",    description: "2 clasificados por zona de 4. Modalidad más corta." },
              ]}
              value={tournamentRuleSet}
              onSelect={v => setTournamentRuleSet(v as "fap" | "apa")}
              withSubtitle
            />
          </Card>
        )}

        {/* 3 · Modo de armado */}
        {!isEdit && (
          <Card title="MODO DE ARMADO">
            <RadioList
              options={[
                { value: "single",   label: "CREAR UNO",    description: "Crea un torneo independiente." },
                { value: "multiple", label: "CREAR VARIOS", description: "Crea varios torneos iguales en una sola acción." },
              ]}
              value={creationMode}
              onSelect={v => setCreationMode(v as "single" | "multiple")}
            />
            <BlueNote text={creationMode === "multiple" ? "Crea varios torneos iguales en una sola acción." : "Crea un torneo independiente."} />
            {creationMode === "multiple" && (
              <div className="flex items-center justify-center gap-3 mt-1">
                <span className="text-sm font-bold" style={{ color: "#173A2E" }}>Cantidad de torneos</span>
                <input
                  type="text" inputMode="numeric" maxLength={2} value={quantity}
                  onChange={e => { const v = e.target.value.replace(/\D/g, ""); setQuantity(v || "2"); }}
                  className="fi text-center font-black text-base" style={{ width: 56 }}
                />
              </div>
            )}
          </Card>
        )}

        {/* 4 · Nombre */}
        <Card title="NOMBRE DEL TORNEO">
          <input
            value={name}
            onChange={e => setName(e.target.value.toUpperCase())}
            placeholder={creationMode === "multiple" && !isEdit ? "Torneo Apertura" : "Torneo de invierno"}
            className="fi text-center font-bold tracking-wide"
          />
          {previewNames.length > 0 && (
            <div className="rounded-xl border p-3 mt-1" style={{ background: "#F4FAF7", borderColor: "#CFE7DC" }}>
              <p className="text-xs font-black uppercase text-center mb-2" style={{ color: "#086847" }}>Se van a crear</p>
              {previewNames.map((n, i) => (
                <p key={i} className="text-xs font-bold text-center leading-5" style={{ color: "#173A2E" }}>{n}</p>
              ))}
            </div>
          )}
        </Card>

        {/* 5 · Lugares de juego */}
        <Card title="SELECCIONAR LUGARES DE JUEGO">
          <RadioList
            options={[
              { value: "single",   label: "SEDE ÚNICA",      description: "Usa una sede principal." },
              { value: "multiple", label: "MÚLTIPLES SEDES", description: "Permite más de un lugar de juego." },
            ]}
            value={venueMode}
            onSelect={v => changeVenueMode(v as VenueMode)}
          />
          <BlueNote text={venueMode === "multiple" ? "Permite más de un lugar de juego." : "Usa una sede principal."} />

          {/* Complejos aprobados */}
          {approvedVenues.length > 0 && (
            <>
              <p className="text-sm font-bold text-center mt-1 mb-2" style={{ color: "#173A2E" }}>Complejos aprobados</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {approvedVenues.map((c: any) => (
                  <VenueChip key={`a-${c.nombre}`} label={c.nombre} active={selectedVenues.includes(c.nombre)}
                    onPress={() => toggleVenue(c.nombre)} tint="approved" />
                ))}
              </div>
            </>
          )}

          {/* Lugares temporales */}
          {tempVenues.length > 0 && (
            <>
              <p className="text-sm font-bold text-center mt-3 mb-2" style={{ color: "#173A2E" }}>Lugares temporales</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {tempVenues.map((c: any) => (
                  <VenueChip key={`t-${c.nombre}`} label={c.nombre} active={selectedVenues.includes(c.nombre)}
                    onPress={() => toggleVenue(c.nombre)} tint="temp" />
                ))}
              </div>
            </>
          )}

          {approvedVenues.length === 0 && tempVenues.length === 0 && (
            <p className="text-sm text-center" style={{ color: "#5F7D72" }}>No tenés complejos registrados.</p>
          )}

          <div className="flex justify-center mt-3">
            <button type="button" onClick={() => { setShowTempModal(true); setTempError(""); }}
              className="px-5 py-2 rounded-xl border text-xs font-black uppercase tracking-wide transition-all hover:opacity-80"
              style={{ borderColor: "#CFE7DC", color: "#086847", background: "#F4FAF7" }}>
              AGREGAR LUGAR TEMPORAL
            </button>
          </div>
        </Card>

        {/* 6 · Categorías */}
        <Card title="SELECCIONE CATEGORÍAS">
          {(creationMode === "single" || isEdit) ? (
            <CategoryForm config={singleCat} onChange={p => setSingleCat(prev => ({ ...prev, ...p }))} />
          ) : (
            <div className="flex flex-col gap-4">
              {multiConfigs.map((cat, i) => (
                <div key={i} className="rounded-xl border p-4" style={{ background: "#F7FBF8", borderColor: "#DCE9E1" }}>
                  <p className="text-xs font-black uppercase text-center mb-1" style={{ color: "#086847" }}>TORNEO {i + 1}</p>
                  {name.trim() && (
                    <p className="text-xs font-bold text-center mb-3" style={{ color: "#173A2E" }}>
                      {[name.trim().toUpperCase(), buildComposition(cat).compositionLabel].filter(Boolean).join(" ")}
                    </p>
                  )}
                  <CategoryForm config={cat} onChange={p => setMultiConfigs(prev => prev.map((c, j) => j === i ? { ...c, ...p } : c))} />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 7 · Costo y modalidad */}
        <Card title="DEFINIR COSTO Y MODALIDAD">
          <p className="text-sm font-bold text-center mb-2" style={{ color: "#173A2E" }}>¿CUÁNDO SE CONFIRMA LA INSCRIPCIÓN?</p>
          <RadioList
            options={[
              { value: "both_paid", label: "PAGO DE AMBOS JUGADORES",       description: "La pareja se confirma cuando se aprueban los pagos de ambos. (ESTRICTO)" },
              { value: "one_paid",  label: "PAGO DE UNO DE LOS 2 JUGADORES", description: "La pareja se confirma cuando se aprueba el pago de uno de los dos. (INTERMEDIO)" },
              { value: "manual",    label: "CONFIRMACIÓN MANUAL",            description: "El organizador confirma manualmente la inscripción. (FLEXIBLE)" },
            ]}
            value={pairConfirmation}
            onSelect={v => setPairConfirmation(v as ConfirmMode)}
          />
          <BlueNote text={
            pairConfirmation === "both_paid" ? "La pareja se confirma cuando se aprueban los pagos de ambos. (ESTRICTO)"
            : pairConfirmation === "one_paid"  ? "La pareja se confirma cuando se aprueba el pago de uno de los dos. (INTERMEDIO)"
            : "El organizador confirma manualmente la inscripción. (FLEXIBLE)"
          } />

          <FLabel label="VALOR DE INSCRIPCIÓN POR JUGADOR">
            <input
              value={entryFeeStr}
              onChange={e => {
                const raw = e.target.value.replace(/\./g, "");
                const n   = parseInt(raw) || 0;
                setEntryFeeStr(n === 0 ? "" : n.toLocaleString("es-AR").replace(/,/g, "."));
              }}
              placeholder="0" inputMode="numeric" className="fi text-center"
            />
          </FLabel>

          <FLabel label="Alias de transferencia">
            <input value={paymentAlias} onChange={e => setPaymentAlias(e.target.value)}
              placeholder="INGRESA TU ALIAS" className="fi text-center" />
          </FLabel>
        </Card>

        {/* 8 · Duración */}
        <Card title="DURACIÓN DEL TORNEO">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-wide text-center leading-4" style={{ color: "#173A2E" }}>EL TORNEO<br />COMIENZA</p>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="fi text-center w-full" />
            </div>
            <div className="flex flex-col items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-wide text-center leading-4" style={{ color: "#173A2E" }}>EL TORNEO<br />FINALIZA</p>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="fi text-center w-full" />
            </div>
          </div>
        </Card>

        {error && (
          <div className="rounded-xl border px-4 py-3 text-sm font-semibold"
            style={{ background: "#FFF1F1", borderColor: "#F1C8C8", color: "#B24343" }}>
            {error}
          </div>
        )}

        <div className="flex gap-3 pb-6">
          <a href="/dashboard/torneos" className="flex-1 py-3 rounded-xl text-center text-sm font-bold border"
            style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}>
            Cancelar
          </a>
          <button type="submit" disabled={saving || uploading}
            className="flex-1 py-3 rounded-xl text-sm font-black uppercase text-white disabled:opacity-60"
            style={{ background: "#0B8457" }}>
            {saving ? "GUARDANDO..." : isEdit ? "GUARDAR CAMBIOS" : creationMode === "multiple" ? "CREAR TORNEOS" : "CREAR TORNEO"}
          </button>
        </div>
      </form>

      {/* Modal: lugar temporal */}
      {showTempModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="w-full max-w-lg rounded-t-3xl p-6 pb-10 flex flex-col gap-4" style={{ background: "#FFFFFF", maxHeight: "82vh", overflowY: "auto" }}>
            <h3 className="text-xl font-black text-center" style={{ color: "#173A2E" }}>Agregar lugar temporal</h3>
            <FLabel label="Nombre del complejo">
              <input value={tempName} onChange={e => setTempName(e.target.value)}
                placeholder="Nombre del complejo" className="fi text-center" />
            </FLabel>
            <FLabel label="Canchas blindex">
              <input value={tempBlindex} onChange={e => setTempBlindex(e.target.value.replace(/\D/g, ""))}
                placeholder="0" inputMode="numeric" className="fi text-center" />
            </FLabel>
            <FLabel label="Canchas de césped">
              <input value={tempCesped} onChange={e => setTempCesped(e.target.value.replace(/\D/g, ""))}
                placeholder="0" inputMode="numeric" className="fi text-center" />
            </FLabel>
            <FLabel label="Canchas de cemento">
              <input value={tempCemento} onChange={e => setTempCemento(e.target.value.replace(/\D/g, ""))}
                placeholder="0" inputMode="numeric" className="fi text-center" />
            </FLabel>
            <FLabel label="Dirección">
              <input value={tempAddress} onChange={e => setTempAddress(e.target.value)}
                placeholder="Dirección" className="fi text-center" />
            </FLabel>
            {tempError && <p className="text-xs font-semibold text-center" style={{ color: "#B24343" }}>{tempError}</p>}
            <button type="button" onClick={addTempVenue} disabled={savingTemp}
              className="w-full py-3 rounded-xl text-sm font-black uppercase text-white disabled:opacity-60"
              style={{ background: "#0B8457" }}>
              {savingTemp ? "GUARDANDO..." : "GUARDAR LUGAR"}
            </button>
          </div>
        </div>
      )}

      <style>{`
        .fi {
          width: 100%;
          border: 1.5px solid #CFE7DC;
          border-radius: 12px;
          padding: 10px 14px;
          font-size: 14px;
          color: #173A2E;
          background: #FFFFFF;
          outline: none;
          transition: border-color 0.15s;
        }
        .fi:focus { border-color: #0B8457; }
        .fi:disabled { background: #F6FBF8; color: #9AB5AB; }
      `}</style>
    </DashboardLayout>
  );
}

// ── CategoryForm ──────────────────────────────────────────────────────────────
function CategoryForm({ config, onChange }: { config: CatConfig; onChange: (p: Partial<CatConfig>) => void }) {
  const { categoryMode, branch, sumTarget, fixedCategoryA, fixedCategoryB } = config;

  function setCatMode(mode: CategoryMode) {
    onChange({ categoryMode: mode, sumTarget: mode === "single" ? "" : sumTarget, fixedCategoryB: mode === "sum_fixed" ? fixedCategoryB : "" });
  }
  function setSumTarget(v: string)    { onChange({ sumTarget: v, fixedCategoryB: "" }); }
  function setCatA(v: string)         { onChange({ fixedCategoryA: v, fixedCategoryB: "" }); }

  const validCatA = categoryMode === "sum_fixed" ? getValidCatAOptions(sumTarget) : CAT_OPTIONS;
  const validCatB = categoryMode === "sum_fixed" ? getValidCatBOptions(sumTarget, fixedCategoryA) : [];

  const modeDesc = categoryMode === "single"   ? "Una categoría fija para toda la pareja."
    : categoryMode === "sum_fixed" ? "Suma con combinación exacta."
    : "Suma abierta dentro del objetivo.";

  return (
    <div className="flex flex-col gap-3">
      <RadioList
        options={[
          { value: "single",    label: "CATEGORÍA ÚNICA", description: "Una categoría fija para toda la pareja." },
          { value: "sum_fixed", label: "SUMA FIJA",        description: "Suma con combinación exacta." },
          { value: "sum_open",  label: "SUMA LIBRE",       description: "Suma abierta dentro del objetivo." },
        ]}
        value={categoryMode}
        onSelect={v => setCatMode(v as CategoryMode)}
      />
      <BlueNote text={modeDesc} />

      <FLabel label="Sexo">
        <select value={branch} onChange={e => onChange({ branch: e.target.value })} className="fi text-center">
          <option value="Masculino">Caballeros</option>
          <option value="Femenino">Damas</option>
          <option value="Mixto">Mixto</option>
        </select>
      </FLabel>

      {categoryMode !== "single" && (
        <FLabel label="Suma">
          <select value={sumTarget} onChange={e => setSumTarget(e.target.value)} className="fi text-center">
            <option value="">Seleccionar suma</option>
            {SUM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FLabel>
      )}

      <FLabel label={categoryMode === "single" ? "Categoría" : "Categoría A"}>
        <select value={fixedCategoryA} onChange={e => setCatA(e.target.value)} className="fi text-center">
          <option value="">Seleccionar categoría</option>
          {validCatA.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </FLabel>

      {categoryMode === "sum_fixed" && (
        <FLabel label="Categoría B">
          <select value={fixedCategoryB} onChange={e => onChange({ fixedCategoryB: e.target.value })}
            className="fi text-center" disabled={!fixedCategoryA || validCatB.length === 0}>
            <option value="">Seleccionar categoría</option>
            {validCatB.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FLabel>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function RadioList({ options, value, onSelect, withSubtitle = false }: {
  options: { value: string; label: string; description?: string; subtitle?: string }[];
  value: string;
  onSelect: (v: string) => void;
  withSubtitle?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button key={opt.value} type="button" onClick={() => onSelect(opt.value)}
            className={`flex items-${withSubtitle ? "start" : "center"} gap-3 rounded-lg border px-4 py-2.5 text-left transition-all`}
            style={active ? { background: "#E8F5EE", borderColor: "#A6D8BC" } : { background: "#F4FAF7", borderColor: "#CFE7DC" }}>
            <span className="mt-0.5 flex-shrink-0 rounded-full border-2 w-4 h-4"
              style={{ background: active ? "#086847" : "#FFFFFF", borderColor: active ? "#086847" : "#9EB7AA" }} />
            <span>
              <span className="block text-xs font-black uppercase tracking-wide"
                style={{ color: active ? "#086847" : "#173A2E" }}>{opt.label}</span>
              {opt.subtitle && (
                <span className="block text-xs font-bold mt-0.5" style={{ color: "#173A2E" }}>{opt.subtitle}</span>
              )}
              {withSubtitle && opt.description && (
                <span className="block text-xs font-semibold mt-0.5" style={{ color: "#5F7D72" }}>{opt.description}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BlueNote({ text }: { text: string }) {
  return <p className="text-xs font-semibold text-center" style={{ color: "#1E88C8" }}>{text}</p>;
}

function VenueChip({ label, active, onPress, tint }: { label: string; active: boolean; onPress: () => void; tint: "approved" | "temp" }) {
  const styles = {
    approved: {
      active:   { background: "#086847", color: "#FFFFFF", borderColor: "#086847" },
      inactive: { background: "#EEF6F2", color: "#086847", borderColor: "#CFE7DC" },
    },
    temp: {
      active:   { background: "#6751B6", color: "#FFFFFF", borderColor: "#6751B6" },
      inactive: { background: "#F4F2FF", color: "#6751B6", borderColor: "#D9D1FF" },
    },
  };
  return (
    <button type="button" onClick={onPress}
      className="px-4 py-2 rounded-full border-2 text-xs font-black uppercase transition-all"
      style={active ? styles[tint].active : styles[tint].inactive}>
      {label}
    </button>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-5 flex flex-col gap-3" style={{ background: "#FFFFFF", borderColor: "#CFE7DC" }}>
      <h2 className="font-black text-base text-center uppercase tracking-wide" style={{ color: "#173A2E" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function FLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-bold text-center" style={{ color: "#5F7D72" }}>{label}</label>
      {children}
    </div>
  );
}
