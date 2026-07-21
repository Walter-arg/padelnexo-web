"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { ArrowLeft, Plus, Trash2, Settings, ChevronDown, ChevronUp } from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const DIAS = [
  { label: "Lu", full: "Lunes",     value: "monday"    },
  { label: "Ma", full: "Martes",    value: "tuesday"   },
  { label: "Mi", full: "Miércoles", value: "wednesday" },
  { label: "Ju", full: "Jueves",    value: "thursday"  },
  { label: "Vi", full: "Viernes",   value: "friday"    },
  { label: "Sá", full: "Sábado",    value: "saturday"  },
  { label: "Do", full: "Domingo",   value: "sunday"    },
];

const CATEGORIES = [
  { label: "9na (Iniciantes)", numericValue: 9 },
  { label: "8va",              numericValue: 8 },
  { label: "7ma",              numericValue: 7 },
  { label: "6ta",              numericValue: 6 },
  { label: "5ta",              numericValue: 5 },
  { label: "4ta",              numericValue: 4 },
  { label: "3ra",              numericValue: 3 },
  { label: "2da",              numericValue: 2 },
  { label: "1era",             numericValue: 1 },
];

const SUM_TARGETS = Array.from({ length: 17 }, (_, i) => String(i + 2)); // "2"→"18"

// ── Helpers ───────────────────────────────────────────────────────────────────

function calculateRecommendedRounds(
  teamType: string,
  participantsCount: string,
  roundMode: string
): string {
  const n = parseInt(participantsCount) || 0;
  if (n < 2) return "";
  const teams = teamType === "pair" ? n : Math.floor(n / 2);
  if (teams < 2) return "";
  const firstLeg = teams % 2 === 0 ? teams - 1 : teams;
  return String(firstLeg * (roundMode === "double" ? 2 : 1));
}

function buildCategoryLabel(
  sexo: string,
  mode: string,
  sumTarget: string,
  catA: string,
  catB: string
): string {
  const branch =
    sexo === "Masculino" ? "Caballeros" : sexo === "Femenino" ? "Damas" : "Mixta";
  if (mode === "single")   return `${catA} ${branch}`.trim();
  if (mode === "sum_fixed") return `Suma ${sumTarget} ${branch} · ${catA} + ${catB}`;
  if (mode === "sum_open")  return `Suma ${sumTarget} ${branch} · libre`;
  return "";
}

function getSecondCatOptions(sumTarget: string, catALabel: string) {
  if (!sumTarget || !catALabel) return [];
  const target = parseInt(sumTarget);
  const catA = CATEGORIES.find((c) => c.label === catALabel);
  if (!catA) return [];
  const needed = target - catA.numericValue;
  return CATEGORIES.filter((c) => c.numericValue === needed && c.label !== catALabel);
}

function sanitizeDecimal(val: string): string {
  return val.replace(",", ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
}

// ── Form defaults ─────────────────────────────────────────────────────────────

function defaultForm() {
  return {
    nombre:              "",
    complejoNombre:      "",
    localidadNombre:     "",
    localidadProvincia:  "",

    teamType:      "pair"       as "pair" | "individual",
    sexo:          "Masculino"  as "Masculino" | "Femenino" | "Mixto",
    categoryMode:  "single"     as "single" | "sum_fixed" | "sum_open",
    fixedCategoryA: "4ta",
    fixedCategoryB: "",
    sumTarget:      "7",

    scheduleMode: "fixed_day" as "fixed_day" | "weekly_coordination",
    dayKey:       "tuesday",
    timeSlots:    ["08:00"] as string[],

    fixtureRoundMode:  "single" as "single" | "double",
    minPlayersCount:   "8",
    roundsCount:       "7",

    registrationFeeEnabled: false,
    registrationFeeAmount:  "",
    roundPricePerPlayer:    "",

    matchFormat:               "two_sets_super_tiebreak" as "three_full_sets" | "two_sets_super_tiebreak" | "single_set",
    singleSetPointsToWin:      6,
    singleSetWinByTwo:         false,
    superTieBreakPointsToWin:  11,
    superTieBreakWinByTwo:     false,
    pointsWin:                 3,
    pointsLoss:                1,
    replacementPenalty:        1,
    replacementPenaltyMode:    "individual" as "individual" | "pair",
    replacementQuota:          0,
    publishReplacementRequests: false,
  };
}

type LeagueForm = ReturnType<typeof defaultForm>;

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
      <p className="text-[10px] font-black text-pn-green uppercase tracking-widest mb-5">{title}</p>
      {children}
    </div>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-bold text-pn-navy mb-1.5">
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-red-500 mt-1">{msg}</p>;
}

function SegControl({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex bg-gray-100 rounded-2xl p-1 gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
            value === o.value
              ? "bg-pn-dark text-white shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function RadioCards({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string; desc: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex items-center justify-between rounded-2xl border p-4 text-left transition-all ${
            value === o.value
              ? "bg-pn-mint border-pn-green"
              : "bg-gray-50 border-gray-200 hover:border-gray-300"
          }`}
        >
          <div>
            <div className={`text-sm font-bold ${value === o.value ? "text-pn-dark" : "text-pn-navy"}`}>
              {o.label}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{o.desc}</div>
          </div>
          <div
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-3 ${
              value === o.value ? "border-pn-dark" : "border-gray-300"
            }`}
          >
            {value === o.value && (
              <div className="w-2.5 h-2.5 rounded-full bg-pn-dark" />
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc?: string;
}) {
  return (
    <div className="flex items-center justify-between bg-gray-50 rounded-2xl p-4 border border-gray-200">
      <div>
        <div className="text-sm font-bold text-pn-navy">{label}</div>
        {desc && <div className="text-xs text-gray-500 mt-0.5">{desc}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ml-4 ${
          checked ? "bg-pn-green" : "bg-gray-300"
        }`}
      >
        <div
          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
            checked ? "left-6" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  suffix,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  min?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-500 mb-1">{label}</label>
      <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 bg-white">
        <input
          type="number"
          min={min}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
          className="w-full text-sm text-pn-navy focus:outline-none"
        />
        {suffix && <span className="text-xs text-gray-400 flex-shrink-0">{suffix}</span>}
      </div>
    </div>
  );
}

function ChipPair({
  options,
  value,
  onChange,
}: {
  options: { v: boolean; l: string }[];
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          onClick={() => onChange(o.v)}
          className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition-all ${
            value === o.v
              ? "bg-pn-dark border-pn-dark text-white"
              : "border-gray-200 text-gray-500 bg-gray-50"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NuevaLigaPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<LeagueForm>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [configOpen, setConfigOpen] = useState(false);
  const [toast, setToast] = useState("");

  // ── Load user & apply defaults ──────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push("/login"); return; }
      setUser(u);
      const snap = await getDoc(doc(db, "users", u.uid));
      const ud = snap.exists() ? snap.data() : {};
      setUserData(ud);

      const ld = ud.leagueDefaults || {};
      const pd = ud.leaguePaymentDefaults || {};
      const complejos: any[] = ud.complejos || [];
      const first = complejos[0];

      setForm((prev) => ({
        ...prev,
        complejoNombre:     first?.nombre || "",
        localidadNombre:    ud.localidad?.nombre || "",
        localidadProvincia: ud.localidad?.provincia || "",

        teamType:      ld.teamType      || "pair",
        sexo:          ld.sexo          || "Masculino",
        categoryMode:  ld.categoryMode  || "single",
        fixedCategoryA: ld.fixedCategoryA || "4ta",
        fixtureRoundMode: ld.fixtureRoundMode || "single",

        matchFormat:                 ld.matchFormat                              || "two_sets_super_tiebreak",
        superTieBreakPointsToWin:    ld.superTieBreakSettings?.pointsToWin      ?? 11,
        superTieBreakWinByTwo:       ld.superTieBreakSettings?.winByTwo         ?? false,
        singleSetPointsToWin:        ld.singleSetSettings?.pointsToWin          ?? 6,
        singleSetWinByTwo:           ld.singleSetSettings?.winByTwo             ?? false,
        pointsWin:                   ld.scoringSettings?.pointsWin              ?? 3,
        pointsLoss:                  ld.scoringSettings?.pointsLoss             ?? 1,
        replacementPenalty:          ld.scoringSettings?.replacementPenalty     ?? 1,
        replacementPenaltyMode:      ld.scoringSettings?.replacementPenaltyMode || "individual",
        replacementQuota:            ld.scoringSettings?.replacementQuota       ?? 0,
        publishReplacementRequests:  ld.scoringSettings?.publishReplacementRequests ?? false,

        registrationFeeEnabled: pd.registrationFeeEnabled  || false,
        registrationFeeAmount:  pd.registrationFeeAmount   ? String(pd.registrationFeeAmount) : "",
        roundPricePerPlayer:    pd.roundPricePerPlayer      ? String(pd.roundPricePerPlayer)  : "",
      }));

      setLoading(false);
    });
    return unsub;
  }, [router]);

  // ── Recalculate rounds when dependencies change ─────────────────
  useEffect(() => {
    const recommended = calculateRecommendedRounds(
      form.teamType,
      form.minPlayersCount,
      form.fixtureRoundMode
    );
    if (recommended) {
      setForm((prev) => ({ ...prev, roundsCount: recommended }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.teamType, form.fixtureRoundMode]);

  // ── Field updater ───────────────────────────────────────────────
  function set<K extends keyof LeagueForm>(field: K, value: LeagueForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => { const e = { ...prev }; delete e[field]; return e; });
    }
  }

  function updatePlayersCount(val: string) {
    const clean = val.replace(/\D/g, "").slice(0, 2);
    const recommended = calculateRecommendedRounds(form.teamType, clean, form.fixtureRoundMode);
    setForm((prev) => ({
      ...prev,
      minPlayersCount: clean,
      roundsCount: recommended || prev.roundsCount,
    }));
  }

  // ── Time slot handlers ──────────────────────────────────────────
  function addTimeSlot() {
    if (form.timeSlots.length >= 4) return;
    set("timeSlots", [...form.timeSlots, "10:00"]);
  }
  function removeTimeSlot(idx: number) {
    if (form.timeSlots.length <= 1) return;
    set("timeSlots", form.timeSlots.filter((_, i) => i !== idx));
  }
  function updateTimeSlot(idx: number, val: string) {
    const ts = [...form.timeSlots];
    ts[idx] = val;
    set("timeSlots", ts);
  }

  // ── Validation ──────────────────────────────────────────────────
  function validateForm(): boolean {
    const errs: Record<string, string> = {};

    if (!form.nombre.trim()) errs.nombre = "El nombre es obligatorio";
    if (!form.complejoNombre.trim()) errs.complejoNombre = "El complejo es obligatorio";
    if (!form.localidadNombre.trim()) errs.localidadNombre = "La localidad es obligatoria";
    if (form.timeSlots.length === 0) errs.timeSlots = "Agregá al menos un horario";
    if (!form.roundsCount || parseInt(form.roundsCount) < 1)
      errs.roundsCount = "La cantidad de fechas debe ser mayor a 0";

    if (form.categoryMode === "single" && !form.fixedCategoryA)
      errs.fixedCategoryA = "Seleccioná una categoría";

    if (form.categoryMode === "sum_fixed" || form.categoryMode === "sum_open") {
      if (!form.sumTarget) errs.sumTarget = "Seleccioná una suma objetivo";
    }
    if (form.categoryMode === "sum_fixed") {
      if (!form.fixedCategoryA) errs.fixedCategoryA = "Seleccioná la categoría 1";
      if (!form.fixedCategoryB) errs.fixedCategoryB = "Seleccioná la categoría 2";
    }
    if (form.registrationFeeEnabled) {
      const amt = parseFloat(form.registrationFeeAmount);
      if (!form.registrationFeeAmount || isNaN(amt) || amt <= 0)
        errs.registrationFeeAmount = "Ingresá un monto válido";
    }
    if (!form.roundPricePerPlayer || parseFloat(form.roundPricePerPlayer) <= 0)
      errs.roundPricePerPlayer = "Ingresá el precio por fecha";

    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      const first = document.querySelector("[data-field-error]");
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return Object.keys(errs).length === 0;
  }

  // ── Submit ──────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm() || !user) return;
    setSaving(true);

    const complejos: any[] = userData?.complejos || [];
    const complejo =
      complejos.find((c: any) => c.nombre === form.complejoNombre) || {
        nombre:           form.complejoNombre,
        direccion:        "",
        coordinates:      null,
        organizerLogoUrl: userData?.organizerLogoURL || userData?.organizerLogoUrl || "",
      };

    const categoria = buildCategoryLabel(
      form.sexo, form.categoryMode, form.sumTarget,
      form.fixedCategoryA, form.fixedCategoryB
    );

    const scoringSettings = {
      version:                    2,
      allowWalkover:              true,
      walkoverScore:              [{ own: 6, rival: 0 }, { own: 6, rival: 0 }],
      pointsWin:                  form.pointsWin,
      pointsLoss:                 form.pointsLoss,
      pointsWalkoverWin:          form.pointsWin,
      replacementPenalty:         form.replacementPenalty,
      replacementPenaltyMode:     form.replacementPenaltyMode,
      replacementQuota:           form.replacementQuota,
      publishReplacementRequests: form.publishReplacementRequests,
      standings: {
        mode:   form.teamType === "pair" ? "pair" : "drive_reves",
        tables: form.teamType === "pair" ? ["Parejas"] : ["Drive", "Revés"],
      },
    };

    const payload = {
      nombre:           form.nombre.trim(),
      organizerId:      user.uid,
      organizerName:    user.displayName || "",
      organizerLogoUrl: userData?.organizerLogoURL || userData?.organizerLogoUrl || "",

      sexo:               form.sexo,
      teamType:           form.teamType,
      modalidadCategoria: form.categoryMode === "single" ? "libre" : "suma",
      sumTarget:          form.categoryMode !== "single" ? form.sumTarget : "",
      sumRule:            form.categoryMode === "sum_fixed" ? "fixed"
                        : form.categoryMode === "sum_open"  ? "open" : "open",
      categoria,
      categoriaA: form.fixedCategoryA,
      categoriaB: form.categoryMode === "sum_fixed" ? form.fixedCategoryB : "",

      matchFormat: form.matchFormat,

      scheduleConfig: {
        mode:      form.scheduleMode,
        dayKey:    form.scheduleMode === "fixed_day" ? form.dayKey : "",
        timeSlots: form.timeSlots.filter(Boolean),
      },
      fixtureConfig: {
        roundMode:         form.fixtureRoundMode,
        roundsCount:       parseInt(form.roundsCount) || 0,
        minPlayersCount:   parseInt(form.minPlayersCount) || 8,
        manualTeams:       [],
      },
      paymentConfig: {
        currency:               "ARS",
        registrationFeeEnabled: form.registrationFeeEnabled,
        registrationFeeAmount:  form.registrationFeeEnabled
                                  ? parseFloat(form.registrationFeeAmount) || 0 : 0,
        roundPricePerPlayer:    parseFloat(form.roundPricePerPlayer) || 0,
        mercadoPago:            {},
      },
      singleSetSettings: {
        pointsToWin: form.singleSetPointsToWin,
        winByTwo:    form.singleSetWinByTwo,
      },
      superTieBreakSettings: {
        pointsToWin: form.superTieBreakPointsToWin,
        winByTwo:    form.superTieBreakWinByTwo,
      },
      scoringSettings,

      complejo,
      complejoNombre: complejo.nombre,
      localidad: {
        nombre:    form.localidadNombre.trim(),
        provincia: form.localidadProvincia.trim(),
        pais:      "Argentina",
      },

      status:       "active",
      players:      [],
      teams:        [],
      fixture:      { generatedAtMillis: 0, rounds: [] },
      roundPayments: [],

      createdBy:      user.uid,
      createdByName:  user.displayName || "",
      createdAt:      serverTimestamp(),
      createdAtMillis: Date.now(),
      updatedAt:      serverTimestamp(),
    };

    try {
      const ref = await addDoc(collection(db, "leagues"), payload);

      // Persist user defaults (same as app's handleSubmit)
      const leagueDefaults = {
        teamType:           form.teamType,
        sexo:               form.sexo,
        categoryMode:       form.categoryMode,
        fixedCategoryA:     form.fixedCategoryA,
        fixtureRoundMode:   form.fixtureRoundMode,
        matchFormat:        form.matchFormat,
        singleSetSettings:  { pointsToWin: form.singleSetPointsToWin, winByTwo: form.singleSetWinByTwo },
        superTieBreakSettings: { pointsToWin: form.superTieBreakPointsToWin, winByTwo: form.superTieBreakWinByTwo },
        scoringSettings: {
          pointsWin:                  form.pointsWin,
          pointsLoss:                 form.pointsLoss,
          replacementPenalty:         form.replacementPenalty,
          replacementPenaltyMode:     form.replacementPenaltyMode,
          replacementQuota:           form.replacementQuota,
          publishReplacementRequests: form.publishReplacementRequests,
        },
      };
      const leaguePaymentDefaults = {
        registrationFeeEnabled: form.registrationFeeEnabled,
        registrationFeeAmount:  parseFloat(form.registrationFeeAmount) || 0,
        roundPricePerPlayer:    parseFloat(form.roundPricePerPlayer) || 0,
      };
      await updateDoc(doc(db, "users", user.uid), {
        leagueDefaults,
        leaguePaymentDefaults,
      });

      router.push(`/dashboard/ligas/${ref.id}`);
    } catch {
      setToast("No se pudo crear la liga. Intentá de nuevo.");
      setTimeout(() => setToast(""), 4000);
    } finally {
      setSaving(false);
    }
  }

  // ── Derived values ──────────────────────────────────────────────
  const complejos: any[] = userData?.complejos || [];
  const secondCatOptions  = getSecondCatOptions(form.sumTarget, form.fixedCategoryA);
  const categoryPreview   = buildCategoryLabel(
    form.sexo, form.categoryMode, form.sumTarget,
    form.fixedCategoryA, form.fixedCategoryB
  );

  // ── Render ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <DashboardLayout title="Nueva liga">
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-pn-green border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Nueva liga">
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-red-500 text-white text-sm font-semibold px-5 py-4 rounded-2xl shadow-2xl">
          {toast}
        </div>
      )}

      <div className="max-w-2xl">
        <button
          onClick={() => router.push("/dashboard/ligas")}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-pn-navy mb-6 transition-colors"
        >
          <ArrowLeft size={16} /> Volver a ligas
        </button>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">

          {/* ── Card 1: Datos básicos ───────────────────────────── */}
          <SectionCard title="Datos básicos">

            {/* Nombre */}
            <div className="mb-4" data-field-error={errors.nombre || undefined}>
              <FieldLabel required>Nombre de la liga</FieldLabel>
              <input
                type="text"
                value={form.nombre}
                onChange={(e) => set("nombre", e.target.value)}
                placeholder="Ej. Clausura Zona Centro"
                maxLength={40}
                className={`w-full border rounded-2xl px-4 py-3 text-sm text-pn-navy focus:outline-none focus:ring-2 focus:ring-pn-green/20 transition-all ${errors.nombre ? "border-red-300 bg-red-50" : "border-gray-200 focus:border-pn-green"}`}
              />
              <FieldError msg={errors.nombre} />
            </div>

            {/* Complejo */}
            <div className="mb-4" data-field-error={errors.complejoNombre || undefined}>
              <FieldLabel required>Complejo</FieldLabel>
              {complejos.length > 0 ? (
                <select
                  value={form.complejoNombre}
                  onChange={(e) => set("complejoNombre", e.target.value)}
                  className={`w-full border rounded-2xl px-4 py-3 text-sm text-pn-navy focus:outline-none focus:ring-2 focus:ring-pn-green/20 bg-white transition-all ${errors.complejoNombre ? "border-red-300" : "border-gray-200 focus:border-pn-green"}`}
                >
                  <option value="">Seleccioná un complejo</option>
                  {complejos.map((c: any) => (
                    <option key={c.nombre} value={c.nombre}>{c.nombre}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.complejoNombre}
                  onChange={(e) => set("complejoNombre", e.target.value)}
                  placeholder="Nombre del complejo"
                  className={`w-full border rounded-2xl px-4 py-3 text-sm text-pn-navy focus:outline-none focus:ring-2 focus:ring-pn-green/20 transition-all ${errors.complejoNombre ? "border-red-300 bg-red-50" : "border-gray-200 focus:border-pn-green"}`}
                />
              )}
              <FieldError msg={errors.complejoNombre} />
            </div>

            {/* Localidad */}
            <div data-field-error={errors.localidadNombre || undefined}>
              <FieldLabel required>Localidad</FieldLabel>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.localidadNombre}
                  onChange={(e) => set("localidadNombre", e.target.value)}
                  placeholder="Ej. Córdoba"
                  className={`flex-1 border rounded-2xl px-4 py-3 text-sm text-pn-navy focus:outline-none focus:ring-2 focus:ring-pn-green/20 transition-all ${errors.localidadNombre ? "border-red-300 bg-red-50" : "border-gray-200 focus:border-pn-green"}`}
                />
                <input
                  type="text"
                  value={form.localidadProvincia}
                  onChange={(e) => set("localidadProvincia", e.target.value)}
                  placeholder="Provincia"
                  className="w-36 border border-gray-200 rounded-2xl px-4 py-3 text-sm text-pn-navy focus:outline-none focus:border-pn-green focus:ring-2 focus:ring-pn-green/20 transition-all"
                />
              </div>
              <FieldError msg={errors.localidadNombre} />
            </div>
          </SectionCard>

          {/* ── Card 2: Tipo de liga ────────────────────────────── */}
          <SectionCard title="Tipo de liga">

            {/* Tipo de equipo */}
            <div className="mb-5">
              <FieldLabel>Tipo de equipo</FieldLabel>
              <SegControl
                value={form.teamType}
                onChange={(v) => {
                  const recommended = calculateRecommendedRounds(v, form.minPlayersCount, form.fixtureRoundMode);
                  setForm((prev) => ({
                    ...prev,
                    teamType: v as "pair" | "individual",
                    roundsCount: recommended || prev.roundsCount,
                  }));
                }}
                options={[
                  { value: "pair",       label: "Pareja fija"  },
                  { value: "individual", label: "Individual"   },
                ]}
              />
            </div>

            {/* Género */}
            <div className="mb-5">
              <FieldLabel>Género</FieldLabel>
              <SegControl
                value={form.sexo}
                onChange={(v) => set("sexo", v as "Masculino" | "Femenino" | "Mixto")}
                options={[
                  { value: "Masculino", label: "Caballeros" },
                  { value: "Femenino",  label: "Damas"      },
                  { value: "Mixto",     label: "Mixta"      },
                ]}
              />
            </div>

            {/* Modalidad de categoría */}
            <div>
              <FieldLabel>Modalidad de categoría</FieldLabel>
              <RadioCards
                value={form.categoryMode}
                onChange={(v) => {
                  set("categoryMode", v as "single" | "sum_fixed" | "sum_open");
                  set("fixedCategoryB", "");
                }}
                options={[
                  { value: "single",    label: "Categoría única", desc: "Se juega en 1 categoría fija" },
                  { value: "sum_fixed", label: "Suma fija",        desc: "2 categorías que suman un número objetivo" },
                  { value: "sum_open",  label: "Suma libre",       desc: "Cualquier combinación que iguale el objetivo" },
                ]}
              />

              {/* single → categoría */}
              {form.categoryMode === "single" && (
                <div className="mt-4" data-field-error={errors.fixedCategoryA || undefined}>
                  <FieldLabel>Categoría</FieldLabel>
                  <select
                    value={form.fixedCategoryA}
                    onChange={(e) => set("fixedCategoryA", e.target.value)}
                    className={`w-full border rounded-2xl px-4 py-3 text-sm text-pn-navy focus:outline-none focus:ring-2 focus:ring-pn-green/20 bg-white transition-all ${errors.fixedCategoryA ? "border-red-300" : "border-gray-200 focus:border-pn-green"}`}
                  >
                    <option value="">Seleccioná una categoría</option>
                    {CATEGORIES.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
                  </select>
                  <FieldError msg={errors.fixedCategoryA} />
                </div>
              )}

              {/* suma → target + (sum_fixed → cat A + cat B) */}
              {(form.categoryMode === "sum_fixed" || form.categoryMode === "sum_open") && (
                <div className="mt-4 flex flex-col gap-3">
                  <div data-field-error={errors.sumTarget || undefined}>
                    <FieldLabel>Suma objetivo</FieldLabel>
                    <select
                      value={form.sumTarget}
                      onChange={(e) => {
                        set("sumTarget", e.target.value);
                        set("fixedCategoryB", "");
                      }}
                      className={`w-full border rounded-2xl px-4 py-3 text-sm text-pn-navy focus:outline-none focus:ring-2 focus:ring-pn-green/20 bg-white transition-all ${errors.sumTarget ? "border-red-300" : "border-gray-200 focus:border-pn-green"}`}
                    >
                      <option value="">Seleccioná suma</option>
                      {SUM_TARGETS.map((t) => <option key={t} value={t}>Suma {t}</option>)}
                    </select>
                    <FieldError msg={errors.sumTarget} />
                  </div>

                  {form.categoryMode === "sum_fixed" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div data-field-error={errors.fixedCategoryA || undefined}>
                        <FieldLabel>
                          {form.sexo === "Mixto" ? "Caballeros" : "Categoría 1"}
                        </FieldLabel>
                        <select
                          value={form.fixedCategoryA}
                          onChange={(e) => {
                            set("fixedCategoryA", e.target.value);
                            set("fixedCategoryB", "");
                          }}
                          className={`w-full border rounded-2xl px-3 py-3 text-sm text-pn-navy focus:outline-none focus:ring-2 focus:ring-pn-green/20 bg-white ${errors.fixedCategoryA ? "border-red-300" : "border-gray-200 focus:border-pn-green"}`}
                        >
                          <option value="">—</option>
                          {CATEGORIES.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
                        </select>
                        <FieldError msg={errors.fixedCategoryA} />
                      </div>
                      <div data-field-error={errors.fixedCategoryB || undefined}>
                        <FieldLabel>
                          {form.sexo === "Mixto" ? "Damas" : "Categoría 2"}
                        </FieldLabel>
                        <select
                          value={form.fixedCategoryB}
                          onChange={(e) => set("fixedCategoryB", e.target.value)}
                          disabled={!form.fixedCategoryA || secondCatOptions.length === 0}
                          className={`w-full border rounded-2xl px-3 py-3 text-sm text-pn-navy focus:outline-none focus:ring-2 focus:ring-pn-green/20 bg-white disabled:opacity-40 disabled:cursor-not-allowed ${errors.fixedCategoryB ? "border-red-300" : "border-gray-200 focus:border-pn-green"}`}
                        >
                          <option value="">—</option>
                          {secondCatOptions.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
                        </select>
                        <FieldError msg={errors.fixedCategoryB} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Preview del label de categoría */}
              {categoryPreview && (
                <div className="mt-3 bg-pn-mint border border-pn-mint-dark rounded-xl px-4 py-2.5 text-sm font-semibold text-pn-dark">
                  {categoryPreview}
                </div>
              )}
            </div>
          </SectionCard>

          {/* ── Card 3: Día y horarios ──────────────────────────── */}
          <SectionCard title="Día y horarios de juego">

            {/* Modalidad de día */}
            <div className="mb-5">
              <FieldLabel>Modalidad</FieldLabel>
              <div className="flex gap-2">
                {[
                  { value: "fixed_day",           label: "Día fijo"     },
                  { value: "weekly_coordination",  label: "A coordinar"  },
                ].map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => set("scheduleMode", o.value as any)}
                    className={`flex-1 py-2.5 px-3 rounded-2xl border text-sm font-bold transition-all ${
                      form.scheduleMode === o.value
                        ? "bg-pn-dark border-pn-dark text-white"
                        : "bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Día fijo */}
            {form.scheduleMode === "fixed_day" && (
              <div className="mb-5">
                <FieldLabel>Día de la semana</FieldLabel>
                <div className="flex gap-1.5 flex-wrap">
                  {DIAS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => set("dayKey", d.value)}
                      title={d.full}
                      className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all ${
                        form.dayKey === d.value
                          ? "bg-pn-dark border-pn-dark text-white"
                          : "bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Horarios */}
            <div data-field-error={errors.timeSlots || undefined}>
              <div className="flex items-center justify-between mb-1.5">
                <FieldLabel>Horarios posibles</FieldLabel>
                {form.timeSlots.length < 4 && (
                  <button
                    type="button"
                    onClick={addTimeSlot}
                    className="flex items-center gap-1 text-xs font-bold text-pn-green hover:text-pn-dark transition-colors"
                  >
                    <Plus size={13} /> Agregar
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {form.timeSlots.map((slot, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="time"
                      value={slot}
                      onChange={(e) => updateTimeSlot(idx, e.target.value)}
                      className="flex-1 border border-gray-200 rounded-2xl px-4 py-2.5 text-sm text-pn-navy focus:outline-none focus:border-pn-green focus:ring-2 focus:ring-pn-green/20 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => removeTimeSlot(idx)}
                      disabled={form.timeSlots.length <= 1}
                      className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-50 border border-red-100 text-red-400 hover:bg-red-100 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
              <FieldError msg={errors.timeSlots} />
            </div>
          </SectionCard>

          {/* ── Card 4: Duración ────────────────────────────────── */}
          <SectionCard title="Duración de la liga">

            {/* Formato fixture */}
            <div className="mb-5">
              <FieldLabel>Formato del fixture</FieldLabel>
              <SegControl
                value={form.fixtureRoundMode}
                onChange={(v) => {
                  const r = calculateRecommendedRounds(form.teamType, form.minPlayersCount, v);
                  setForm((prev) => ({
                    ...prev,
                    fixtureRoundMode: v as "single" | "double",
                    roundsCount: r || prev.roundsCount,
                  }));
                }}
                options={[
                  { value: "single", label: "Solo ida"      },
                  { value: "double", label: "Ida y vuelta"  },
                ]}
              />
            </div>

            {/* Jugadores estimados + cantidad de fechas */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>
                  {form.teamType === "pair" ? "Parejas estimadas" : "Jugadores estimados"}
                  <span className="text-gray-400 font-normal text-xs ml-1">(opcional)</span>
                </FieldLabel>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.minPlayersCount}
                  onChange={(e) => updatePlayersCount(e.target.value)}
                  placeholder={form.teamType === "pair" ? "8" : "16"}
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-pn-navy focus:outline-none focus:border-pn-green focus:ring-2 focus:ring-pn-green/20 transition-all"
                />
              </div>
              <div data-field-error={errors.roundsCount || undefined}>
                <FieldLabel required>Cantidad de fechas</FieldLabel>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.roundsCount}
                  onChange={(e) => set("roundsCount", e.target.value.replace(/\D/g, ""))}
                  placeholder="7"
                  className={`w-full border rounded-2xl px-4 py-3 text-sm text-pn-navy focus:outline-none focus:ring-2 focus:ring-pn-green/20 transition-all ${errors.roundsCount ? "border-red-300 bg-red-50" : "border-gray-200 focus:border-pn-green"}`}
                />
                <FieldError msg={errors.roundsCount} />
              </div>
            </div>
          </SectionCard>

          {/* ── Card 5: Valores ─────────────────────────────────── */}
          <SectionCard title="Valores de la liga">

            {/* Inscripción */}
            <div className="mb-4">
              <FieldLabel>Inscripción inicial</FieldLabel>
              <div className="flex gap-2 mb-3">
                {[
                  { value: false, label: "Sin inscripción"  },
                  { value: true,  label: "Con inscripción"  },
                ].map((o) => (
                  <button
                    key={String(o.value)}
                    type="button"
                    onClick={() => set("registrationFeeEnabled", o.value)}
                    className={`flex-1 py-2.5 px-3 rounded-2xl border text-sm font-bold transition-all ${
                      form.registrationFeeEnabled === o.value
                        ? "bg-pn-dark border-pn-dark text-white"
                        : "bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              {form.registrationFeeEnabled && (
                <div data-field-error={errors.registrationFeeAmount || undefined}>
                  <FieldLabel required>Monto de inscripción (ARS)</FieldLabel>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.registrationFeeAmount}
                    onChange={(e) => set("registrationFeeAmount", sanitizeDecimal(e.target.value))}
                    placeholder="0.00"
                    className={`w-full border rounded-2xl px-4 py-3 text-sm text-pn-navy focus:outline-none focus:ring-2 focus:ring-pn-green/20 transition-all ${errors.registrationFeeAmount ? "border-red-300 bg-red-50" : "border-gray-200 focus:border-pn-green"}`}
                  />
                  <FieldError msg={errors.registrationFeeAmount} />
                </div>
              )}
            </div>

            {/* Precio por fecha */}
            <div data-field-error={errors.roundPricePerPlayer || undefined}>
              <FieldLabel required>Precio por fecha por jugador (ARS)</FieldLabel>
              <input
                type="text"
                inputMode="decimal"
                value={form.roundPricePerPlayer}
                onChange={(e) => set("roundPricePerPlayer", sanitizeDecimal(e.target.value))}
                placeholder="0.00"
                className={`w-full border rounded-2xl px-4 py-3 text-sm text-pn-navy focus:outline-none focus:ring-2 focus:ring-pn-green/20 transition-all ${errors.roundPricePerPlayer ? "border-red-300 bg-red-50" : "border-gray-200 focus:border-pn-green"}`}
              />
              <FieldError msg={errors.roundPricePerPlayer} />
            </div>
          </SectionCard>

          {/* ── Configuración adicional ──────────────────────────── */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setConfigOpen(!configOpen)}
              className="w-full flex items-center justify-between px-6 py-5 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-2.5">
                <Settings size={15} className="text-pn-green" />
                <span className="text-sm font-black text-pn-navy">Configuración adicional</span>
                <span className="text-xs text-gray-400 font-normal">Sets, puntuación, reemplazos</span>
              </div>
              {configOpen
                ? <ChevronUp size={17} className="text-gray-400" />
                : <ChevronDown size={17} className="text-gray-400" />
              }
            </button>

            {configOpen && (
              <div className="px-6 pb-6 border-t border-gray-100 pt-5 flex flex-col gap-6">

                {/* Formato del partido */}
                <div>
                  <FieldLabel>Formato del partido</FieldLabel>
                  <RadioCards
                    value={form.matchFormat}
                    onChange={(v) => set("matchFormat", v as any)}
                    options={[
                      { value: "three_full_sets",          label: "3 sets completos",         desc: "Formato tradicional" },
                      { value: "two_sets_super_tiebreak",  label: "2 sets + Super Tie Break",  desc: "Más dinámico" },
                      { value: "single_set",               label: "1 solo set",               desc: "Partido rápido" },
                    ]}
                  />

                  {/* Set único — ajustes */}
                  {form.matchFormat === "single_set" && (
                    <div className="mt-3 grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-200">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Puntos para ganar</label>
                        <input
                          type="number" min={1} value={form.singleSetPointsToWin}
                          onChange={(e) => set("singleSetPointsToWin", parseInt(e.target.value) || 6)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-pn-navy focus:outline-none focus:border-pn-green bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-2">Diferencia de 2</label>
                        <ChipPair
                          value={form.singleSetWinByTwo}
                          onChange={(v) => set("singleSetWinByTwo", v)}
                          options={[{ v: true, l: "Sí" }, { v: false, l: "No" }]}
                        />
                      </div>
                    </div>
                  )}

                  {/* STB — ajustes */}
                  {form.matchFormat === "two_sets_super_tiebreak" && (
                    <div className="mt-3 grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-200">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Puntos STB</label>
                        <input
                          type="number" min={1} value={form.superTieBreakPointsToWin}
                          onChange={(e) => set("superTieBreakPointsToWin", parseInt(e.target.value) || 11)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-pn-navy focus:outline-none focus:border-pn-green bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-2">Diferencia de 2</label>
                        <ChipPair
                          value={form.superTieBreakWinByTwo}
                          onChange={(v) => set("superTieBreakWinByTwo", v)}
                          options={[{ v: true, l: "Sí" }, { v: false, l: "No" }]}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Puntuación */}
                <div>
                  <p className="text-sm font-bold text-pn-navy mb-3">Sistema de puntuación</p>
                  <div className="grid grid-cols-2 gap-3">
                    <NumberInput
                      label="Partido ganado"
                      value={form.pointsWin}
                      onChange={(v) => set("pointsWin", v)}
                      suffix="pts"
                      min={0}
                    />
                    <NumberInput
                      label="Set ganado (perdedor suma)"
                      value={form.pointsLoss}
                      onChange={(v) => set("pointsLoss", v)}
                      suffix="pts"
                      min={0}
                    />
                    <NumberInput
                      label="Descuento por reemplazo"
                      value={form.replacementPenalty}
                      onChange={(v) => set("replacementPenalty", v)}
                      suffix="pts"
                      min={0}
                    />
                    <NumberInput
                      label="Cupo de reemplazo"
                      value={form.replacementQuota}
                      onChange={(v) => set("replacementQuota", v)}
                      suffix="usos"
                      min={0}
                    />
                  </div>

                  {/* Penalty mode */}
                  <div className="mt-3">
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">
                      Aplicar descuento a
                    </label>
                    <div className="flex gap-2">
                      {[
                        { v: "individual", l: "Jugador individual" },
                        { v: "pair",       l: "Pareja entera"      },
                      ].map((o) => (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => set("replacementPenaltyMode", o.v as "individual" | "pair")}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                            form.replacementPenaltyMode === o.v
                              ? "bg-pn-dark border-pn-dark text-white"
                              : "border-gray-200 text-gray-500 bg-gray-50"
                          }`}
                        >
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Publicar reemplazos */}
                <Toggle
                  checked={form.publishReplacementRequests}
                  onChange={(v) => set("publishReplacementRequests", v)}
                  label="Publicar pedidos de reemplazo"
                  desc="Los jugadores pueden ver y responder pedidos de reemplazo"
                />
              </div>
            )}
          </div>

          {/* ── Submit ──────────────────────────────────────────── */}
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-pn-green hover:bg-pn-dark text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-pn-green/20 disabled:opacity-60 text-base"
          >
            {saving ? "Creando liga..." : "Crear liga"}
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
}
