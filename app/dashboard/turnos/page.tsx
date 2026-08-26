"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Calendar,
  Check,
  ChevronDown,
  Clock,
  Copy,
  MapPin,
  User,
  Wallet,
  X,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────
// Constantes y helpers calcados 1:1 de src/services/turnosService.js y
// src/screens/TurnosScreen.js de la app — misma logica, mismos nombres de
// campo en Firestore, para que ambos lados queden siempre en sync.
// ─────────────────────────────────────────────────────────────────────────

const DEFAULT_SLOTS_BY_DAY: Record<string, string[]> = {
  "0": ["18:00", "19:30", "21:00"],
  "1": ["18:00", "19:30", "21:00"],
  "2": ["18:00", "19:30", "21:00"],
  "3": ["18:00", "19:30", "21:00"],
  "4": ["18:00", "19:30", "21:00"],
  "5": ["10:00", "11:30", "17:00", "18:30"],
  "6": ["10:00", "11:30", "17:00", "18:30"],
};

const HALF_HOUR_SLOTS = Array.from({ length: 32 }, (_, index) => {
  const totalMinutes = 8 * 60 + index * 30;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
});
const SLOT_ROW_SIZE = 4;

type Court = {
  id: string;
  name: string;
  enabled: boolean;
  features: string[];
  price60: number;
  price90: number;
  slotsByDate: Record<string, string[]>;
  slotsByDay: Record<string, string[]>;
  selectedDateIds: string[];
};

type ComplexConfig = {
  complexKey: string;
  name: string;
  address: string;
  courts: Court[];
};

type OrganizerConfig = {
  requiresOrganizerApproval: boolean;
  mercadoPagoConfig: { enabled?: boolean };
  complexes: ComplexConfig[];
};

type Reservation = {
  id: string;
  organizerId?: string;
  complexKey?: string;
  complexName?: string;
  courtName?: string;
  dateMillis?: number;
  dateLabel?: string;
  time?: string;
  durationMinutes?: number;
  price?: number;
  playerName?: string;
  paymentMethod?: string;
  status?: string;
  organizerNotificationUnread?: boolean;
};

function normalizeKey(value = ""): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function buildComplexKey(complex: any = {}): string {
  return `${normalizeKey(complex.nombre || complex.name)}-${normalizeKey(
    complex.direccion || complex.address
  )}`;
}

function normalizeMoney(value: any): number {
  const parsed = Number.parseFloat(String(value ?? "0").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function buildCourtFeatures(court: any = {}): string[] {
  const structureLabel = court.estructura === "cemento" ? "CEMENTO" : "BLINDEX";
  const floorLabel = court.piso === "cemento" ? "PISO CEMENTO" : "SINTETICO";
  return [structureLabel, floorLabel];
}

function buildCourtsFromComplex(complex: any = {}): Court[] {
  const canchas = Array.isArray(complex.canchas) ? complex.canchas : [];

  if (canchas.length) {
    return canchas.map((court: any, index: number) => ({
      id: court.id || `court-${index + 1}`,
      name: court.nombre?.trim() || `Cancha ${index + 1}`,
      enabled: false,
      features: buildCourtFeatures(court),
      price60: 0,
      price90: 0,
      slotsByDate: {},
      slotsByDay: DEFAULT_SLOTS_BY_DAY,
      selectedDateIds: [],
    }));
  }

  const definitions = [
    { count: Number(complex.blindex) || 0, type: "BLINDEX" },
    { count: Number(complex.cesped) || 0, type: "CESPED SINTETICO" },
    { count: Number(complex.cemento) || 0, type: "CEMENTO" },
  ];
  let courtNumber = 0;
  const courts: Court[] = [];

  definitions.forEach((definition) => {
    for (let i = 0; i < definition.count; i += 1) {
      courtNumber += 1;
      courts.push({
        id: `court-${courtNumber}`,
        name: `Cancha ${courtNumber}`,
        enabled: false,
        features: [definition.type],
        price60: 0,
        price90: 0,
        slotsByDate: {},
        slotsByDay: DEFAULT_SLOTS_BY_DAY,
        selectedDateIds: [],
      });
    }
  });

  return courts;
}

function normalizeCourtConfig(stored: any, fallback: Court): Court {
  return {
    id: stored?.id || fallback.id,
    name: stored?.name || fallback.name,
    enabled: stored?.enabled === true,
    features:
      Array.isArray(stored?.features) && stored.features.length
        ? stored.features
        : fallback.features,
    price60: normalizeMoney(stored?.price60 ?? fallback.price60),
    price90: normalizeMoney(stored?.price90 ?? fallback.price90),
    selectedDateIds: Array.isArray(stored?.selectedDateIds)
      ? stored.selectedDateIds
      : fallback.selectedDateIds || [],
    slotsByDate: stored?.slotsByDate || fallback.slotsByDate || {},
    slotsByDay: stored?.slotsByDay || fallback.slotsByDay || DEFAULT_SLOTS_BY_DAY,
  };
}

function findStoredComplexConfig(storedComplexes: any[], complex: any, index: number) {
  const complexKey = buildComplexKey(complex);
  const exactMatch = storedComplexes.find((c) => c.complexKey === complexKey);
  if (exactMatch) return exactMatch;

  const complexName = normalizeKey(complex.nombre || complex.name);
  const nameMatches = storedComplexes.filter(
    (c) => normalizeKey(c.name || c.nombre) === complexName
  );
  if (nameMatches.length === 1) return nameMatches[0];

  return storedComplexes[index] || null;
}

function normalizeComplexConfig(complex: any, storedComplex: any): ComplexConfig {
  const complexKey = storedComplex?.complexKey || buildComplexKey(complex);
  const baseCourts = buildCourtsFromComplex(complex);
  const storedCourts = Array.isArray(storedComplex?.courts) ? storedComplex.courts : [];
  const storedById = new Map(storedCourts.map((c: any) => [c.id, c]));

  return {
    complexKey,
    name: complex.nombre || storedComplex?.name || "Complejo",
    address: complex.direccion || storedComplex?.address || "",
    courts: baseCourts.map((court) => normalizeCourtConfig(storedById.get(court.id), court)),
  };
}

function buildNextSevenDays() {
  const dayFmt = new Intl.DateTimeFormat("es-AR", { weekday: "short" });
  const today = new Date();

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    date.setHours(0, 0, 0, 0);

    return {
      id: String(date.getTime()),
      dateMillis: date.getTime(),
      dayName: dayFmt.format(date).replace(".", "").toUpperCase(),
      dayNumber: date.getDate(),
    };
  });
}

function chunkSlots(slots: string[], size = SLOT_ROW_SIZE) {
  return Array.from({ length: Math.ceil(slots.length / size) }, (_, index) =>
    slots.slice(index * size, index * size + size)
  );
}

function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
}

function getTurnoStatusLabel(r: Reservation) {
  if (r.status === "confirmed") return "CONFIRMADA";
  if (r.status === "rejected") return "RECHAZADA";
  if (r.status === "cancelled") return "CANCELADA";
  return "PENDIENTE";
}

function getStatusColorClasses(status?: string) {
  if (status === "confirmed") return "bg-[#EDF7F2] border-[#C9E5D8] text-[#086847]";
  if (status === "rejected") return "bg-red-50 border-red-200 text-red-600";
  if (status === "cancelled") return "bg-gray-100 border-gray-200 text-gray-500";
  return "bg-amber-50 border-amber-200 text-amber-600";
}

function getTurnoPaymentMethodLabel(method?: string) {
  if (method === "a_confirmar") return "A confirmar";
  if (method === "mercado_pago") return "Mercado Pago";
  if (method === "transferencia") return "Transferencia";
  return "Efectivo";
}

function isActionableReservation(r: Reservation) {
  return r.status === "pending_organizer_confirmation";
}

function isActiveReservation(r: Reservation) {
  return !["cancelled", "rejected"].includes(r.status || "");
}

type FilterKey = "todas" | "pending_organizer_confirmation" | "confirmed" | "rejected" | "cancelled";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "pending_organizer_confirmation", label: "Pendientes" },
  { key: "confirmed", label: "Confirmadas" },
  { key: "rejected", label: "Rechazadas" },
  { key: "cancelled", label: "Canceladas" },
];

export default function TurnosPage() {
  const router = useRouter();
  const [uid, setUid] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"config" | "reservas">("config");
  const [config, setConfig] = useState<OrganizerConfig | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [runningAction, setRunningAction] = useState("");
  const [toast, setToast] = useState<{ text: string; tone: "success" | "danger" } | null>(null);

  const days = useMemo(buildNextSevenDays, []);

  const [selectedComplexKey, setSelectedComplexKey] = useState("");
  const [selectedCourtByComplex, setSelectedCourtByComplex] = useState<Record<string, string>>({});
  const [selectedDayId, setSelectedDayId] = useState(days[0]?.id || "");
  const [selectedDateIds, setSelectedDateIds] = useState<string[]>(
    days[0]?.id ? [days[0].id] : []
  );
  const [applyModal, setApplyModal] = useState<{ complexKey: string; sourceCourtId: string } | null>(
    null
  );
  const [applyCourtIds, setApplyCourtIds] = useState<string[]>([]);
  const [filtro, setFiltro] = useState<FilterKey>("todas");

  const showToast = (text: string, tone: "success" | "danger") => {
    setToast({ text, tone });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push("/login");
        return;
      }
      setUid(u.uid);
      try {
        await loadAll(u.uid);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function loadAll(organizerId: string) {
    const userSnap = await getDoc(doc(db, "users", organizerId));
    const userData: any = userSnap.exists() ? userSnap.data() : {};
    const complejos = Array.isArray(userData.complejos) ? userData.complejos : [];

    const configSnap = await getDoc(doc(db, "turnosConfigs", organizerId));
    const stored: any = configSnap.exists() ? configSnap.data() : null;
    const storedComplexes = Array.isArray(stored?.complexes) ? stored.complexes : [];
    const storedByKey = new Map(storedComplexes.map((c: any) => [c.complexKey, c]));

    const nextComplexes: ComplexConfig[] = complejos.map((complex: any, index: number) => {
      const key = buildComplexKey(complex);
      const storedComplex =
        storedByKey.get(key) || findStoredComplexConfig(storedComplexes, complex, index);
      return normalizeComplexConfig(complex, storedComplex || { complexKey: key });
    });

    const nextConfig: OrganizerConfig = {
      requiresOrganizerApproval: stored?.requiresOrganizerApproval !== false,
      mercadoPagoConfig: stored?.mercadoPagoConfig || {
        enabled:
          userData?.mercadoPagoConfig?.enabled === true &&
          userData?.mercadoPagoConfig?.categories?.turnos !== false,
      },
      complexes: nextComplexes,
    };

    setConfig(nextConfig);
    setSelectedComplexKey((current) => current || nextConfig.complexes[0]?.complexKey || "");

    const reservationsSnap = await getDocs(
      query(collection(db, "turnoReservations"), where("organizerId", "==", organizerId))
    );
    const nextReservations = reservationsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Reservation))
      .sort((a, b) => Number(b.dateMillis || 0) - Number(a.dateMillis || 0));
    setReservations(nextReservations);
  }

  const selectedComplex = config?.complexes.find((c) => c.complexKey === selectedComplexKey) || null;
  const selectedDay = days.find((d) => d.id === selectedDayId) || days[0];
  const selectedCourtId = selectedComplex ? selectedCourtByComplex[selectedComplex.complexKey] : "";
  const selectedCourt =
    selectedComplex?.courts.find((c) => c.id === selectedCourtId) || selectedComplex?.courts[0] || null;

  const pendingCount = reservations.filter(isActionableReservation).length;

  function updateCourtConfig(complexKey: string, courtId: string, patch: Partial<Court>) {
    setConfig((current) => {
      if (!current) return current;
      return {
        ...current,
        complexes: current.complexes.map((complex) =>
          complex.complexKey !== complexKey
            ? complex
            : {
                ...complex,
                courts: complex.courts.map((court) =>
                  court.id === courtId ? { ...court, ...patch } : court
                ),
              }
        ),
      };
    });
  }

  function toggleConfigSlot(complexKey: string, court: Court, slot: string) {
    const dateKey = String(selectedDay.dateMillis);
    const current = court.slotsByDate[dateKey] || [];
    const next = current.includes(slot)
      ? current.filter((s) => s !== slot)
      : [...current, slot].sort();
    updateCourtConfig(complexKey, court.id, {
      slotsByDate: { ...court.slotsByDate, [dateKey]: next },
    });
  }

  function toggleConfigSlotRow(complexKey: string, court: Court, rowSlots: string[]) {
    const dateKey = String(selectedDay.dateMillis);
    const current = new Set(court.slotsByDate[dateKey] || []);
    const rowIsComplete = rowSlots.every((slot) => current.has(slot));
    rowSlots.forEach((slot) => (rowIsComplete ? current.delete(slot) : current.add(slot)));
    updateCourtConfig(complexKey, court.id, {
      slotsByDate: { ...court.slotsByDate, [dateKey]: [...current].sort() },
    });
  }

  function toggleDateSelection(dateId: string) {
    setSelectedDateIds((current) =>
      current.includes(dateId) ? current.filter((id) => id !== dateId) : [...current, dateId]
    );
  }

  function applySlotsToSelectedDays(complexKey: string, court: Court) {
    if (!selectedDateIds.length) {
      showToast("Marca al menos un dia para aplicar estos horarios.", "danger");
      return;
    }
    const currentSlots = court.slotsByDate[String(selectedDay.dateMillis)] || [];
    const nextSlotsByDate = { ...court.slotsByDate };
    selectedDateIds.forEach((dateId) => {
      nextSlotsByDate[dateId] = [...currentSlots];
    });
    updateCourtConfig(complexKey, court.id, {
      selectedDateIds,
      slotsByDate: nextSlotsByDate,
    });
    showToast("Horarios copiados a los dias seleccionados. No olvides guardar.", "success");
  }

  function applyPriceAndSlotsToSelectedCourts() {
    if (!applyModal || !selectedComplex) return;
    const sourceCourt = selectedComplex.courts.find((c) => c.id === applyModal.sourceCourtId);
    if (!sourceCourt || !applyCourtIds.length) {
      showToast("Marca al menos una cancha para aplicar la configuracion.", "danger");
      return;
    }
    setConfig((current) => {
      if (!current) return current;
      return {
        ...current,
        complexes: current.complexes.map((complex) =>
          complex.complexKey !== applyModal.complexKey
            ? complex
            : {
                ...complex,
                courts: complex.courts.map((court) =>
                  applyCourtIds.includes(court.id)
                    ? {
                        ...court,
                        price60: sourceCourt.price60,
                        price90: sourceCourt.price90,
                        slotsByDate: { ...sourceCourt.slotsByDate },
                        selectedDateIds: [...sourceCourt.selectedDateIds],
                      }
                    : court
                ),
              }
        ),
      };
    });
    showToast("Precio y horario copiados. No olvides guardar.", "success");
    setApplyModal(null);
    setApplyCourtIds([]);
  }

  async function handleSaveConfig() {
    if (!uid || !config) return;
    try {
      setSaving(true);
      await setDoc(
        doc(db, "turnosConfigs", uid),
        {
          organizerId: uid,
          requiresOrganizerApproval: config.requiresOrganizerApproval !== false,
          mercadoPagoConfig: config.mercadoPagoConfig || {},
          complexes: config.complexes,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      showToast("Configuracion guardada.", "success");
    } catch (error: any) {
      showToast(error?.message || "No pudimos guardar la configuracion.", "danger");
    } finally {
      setSaving(false);
    }
  }

  async function handleReservationStatus(reservation: Reservation, status: string) {
    try {
      setRunningAction(`${reservation.id}-${status}`);
      await updateDoc(doc(db, "turnoReservations", reservation.id), {
        organizerNotificationUnread: false,
        status,
        updatedAt: serverTimestamp(),
        ...(status === "confirmed" ? { confirmedAt: serverTimestamp() } : {}),
        ...(status === "rejected" ? { rejectedAt: serverTimestamp() } : {}),
        ...(status === "cancelled" ? { cancelledAt: serverTimestamp() } : {}),
      });
      setReservations((current) =>
        current.map((r) => (r.id === reservation.id ? { ...r, status } : r))
      );
      showToast(
        status === "confirmed"
          ? "Reserva confirmada."
          : status === "rejected"
            ? "Reserva rechazada."
            : "Reserva cancelada.",
        "success"
      );
    } catch (error: any) {
      showToast(error?.message || "No pudimos actualizar la reserva.", "danger");
    } finally {
      setRunningAction("");
    }
  }

  if (loading) {
    return (
      <DashboardLayout title="Turnos">
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-[#0B8457] border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  const reservasFiltradas =
    filtro === "todas" ? reservations : reservations.filter((r) => (r.status || "") === filtro);

  return (
    <DashboardLayout title="Turnos">
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 text-white text-sm font-semibold px-5 py-4 rounded-2xl shadow-2xl ${
            toast.tone === "success" ? "bg-[#0B8457]" : "bg-red-500"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setTab("config")}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            tab === "config"
              ? "bg-[#0B8457] text-white shadow-md"
              : "bg-white text-gray-500 border border-gray-200 hover:border-[#0B8457] hover:text-[#0B8457]"
          }`}
        >
          Configuracion
        </button>
        <button
          onClick={() => setTab("reservas")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            tab === "reservas"
              ? "bg-[#0B8457] text-white shadow-md"
              : "bg-white text-gray-500 border border-gray-200 hover:border-[#0B8457] hover:text-[#0B8457]"
          }`}
        >
          Reservas
          {pendingCount > 0 && (
            <span className="bg-amber-500 text-white text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* ── TAB CONFIGURACION ─────────────────────────────────────────── */}
      {tab === "config" &&
        (!config || config.complexes.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Clock size={48} className="mx-auto mb-4 opacity-20" />
            <p className="font-semibold text-lg">No tenes complejos cargados</p>
            <p className="text-sm mt-1">
              Agrega tus complejos y canchas desde{" "}
              <a href="/dashboard/perfil" className="text-[#0B8457] font-semibold underline">
                tu perfil
              </a>{" "}
              para poder configurar los turnos.
            </p>
          </div>
        ) : (
          <div className="max-w-3xl flex flex-col gap-5">
            {/* Selector de complejo */}
            {config.complexes.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                {config.complexes.map((complex) => (
                  <button
                    key={complex.complexKey}
                    onClick={() => setSelectedComplexKey(complex.complexKey)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                      complex.complexKey === selectedComplexKey
                        ? "bg-[#EDF7F2] border-[#0B8457] text-[#086847]"
                        : "bg-white border-gray-200 text-gray-500 hover:border-[#0B8457]"
                    }`}
                  >
                    <MapPin size={13} />
                    {complex.name}
                  </button>
                ))}
              </div>
            )}

            {selectedComplex && (
              <>
                <p className="text-xs text-gray-400">{selectedComplex.address}</p>

                {/* Selector de cancha */}
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {selectedComplex.courts.map((court) => {
                    const isSelected = court.id === (selectedCourt?.id || "");
                    return (
                      <button
                        key={court.id}
                        onClick={() =>
                          setSelectedCourtByComplex((current) => ({
                            ...current,
                            [selectedComplex.complexKey]: court.id,
                          }))
                        }
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border whitespace-nowrap transition-all ${
                          isSelected
                            ? "bg-[#0B8457] border-[#0B8457] text-white"
                            : "bg-white border-gray-200 text-gray-600 hover:border-[#0B8457]"
                        }`}
                      >
                        {court.name}
                        <span
                          className={`w-2 h-2 rounded-full ${
                            court.enabled ? "bg-[#A6D96A]" : "bg-gray-300"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>

                {selectedCourt && (
                  <div className="bg-white rounded-2xl border border-[#CFE7DC] p-5 flex flex-col gap-5">
                    {/* Header cancha */}
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="font-black text-[#173A2E] text-base">{selectedCourt.name}</div>
                        <div className="text-xs text-[#5F7D72] font-semibold mt-0.5">
                          {selectedCourt.features.join(" - ") || "Sin caracteristicas"}
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          updateCourtConfig(selectedComplex.complexKey, selectedCourt.id, {
                            enabled: !selectedCourt.enabled,
                          })
                        }
                        className={`text-xs font-black px-3 py-1.5 rounded-full border transition-colors ${
                          selectedCourt.enabled
                            ? "bg-[#EDF7F2] border-[#C9E5D8] text-[#086847]"
                            : "bg-gray-100 border-gray-200 text-gray-400"
                        }`}
                      >
                        {selectedCourt.enabled ? "DISPONIBLE" : "NO DISPONIBLE"}
                      </button>
                    </div>

                    {/* Precio */}
                    <div className="bg-[#F7FBF9] border border-[#CFE7DC] rounded-xl p-4">
                      <div className="text-xs font-black text-[#086847] uppercase tracking-wide mb-3">
                        Precio del turno
                      </div>
                      <div className="flex gap-3 mb-3">
                        <div className="flex-1">
                          <label className="text-[11px] font-bold text-[#5F7D72]">60 min</label>
                          <input
                            type="number"
                            value={selectedCourt.price60 || ""}
                            onChange={(e) =>
                              updateCourtConfig(selectedComplex.complexKey, selectedCourt.id, {
                                price60: Number(e.target.value) || 0,
                              })
                            }
                            placeholder="$"
                            className="w-full mt-1 border border-[#CFE7DC] rounded-lg px-3 py-2 text-sm font-bold text-[#173A2E] focus:outline-none focus:border-[#0B8457]"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[11px] font-bold text-[#5F7D72]">90 min</label>
                          <input
                            type="number"
                            value={selectedCourt.price90 || ""}
                            onChange={(e) =>
                              updateCourtConfig(selectedComplex.complexKey, selectedCourt.id, {
                                price90: Number(e.target.value) || 0,
                              })
                            }
                            placeholder="$"
                            className="w-full mt-1 border border-[#CFE7DC] rounded-lg px-3 py-2 text-sm font-bold text-[#173A2E] focus:outline-none focus:border-[#0B8457]"
                          />
                        </div>
                      </div>
                      {selectedComplex.courts.length > 1 && (
                        <button
                          onClick={() => {
                            setApplyModal({
                              complexKey: selectedComplex.complexKey,
                              sourceCourtId: selectedCourt.id,
                            });
                            setApplyCourtIds([selectedCourt.id]);
                          }}
                          className="flex items-center gap-1.5 text-xs font-bold text-[#086847] hover:underline"
                        >
                          <Copy size={13} /> Aplicar a varias canchas
                        </button>
                      )}
                    </div>

                    {/* Dias */}
                    <div>
                      <div className="text-xs font-black text-[#086847] uppercase tracking-wide mb-2">
                        Dias (marca los dias a los que queres copiar horarios)
                      </div>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {days.map((day) => {
                          const isCurrent = day.id === selectedDayId;
                          const isChecked = selectedDateIds.includes(day.id);
                          return (
                            <button
                              key={day.id}
                              onClick={() => setSelectedDayId(day.id)}
                              className={`relative flex flex-col items-center justify-center w-14 h-16 rounded-xl border text-xs font-black flex-shrink-0 transition-all ${
                                isCurrent
                                  ? "bg-[#0B8457] border-[#0B8457] text-white"
                                  : "bg-white border-[#CFE7DC] text-[#173A2E] hover:border-[#0B8457]"
                              }`}
                            >
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleDateSelection(day.id);
                                }}
                                className={`absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full border flex items-center justify-center ${
                                  isChecked
                                    ? "bg-[#A6D96A] border-[#7FB845]"
                                    : "bg-white border-gray-300"
                                }`}
                              >
                                {isChecked && <Check size={10} className="text-[#244B1A]" />}
                              </span>
                              <span className="opacity-80">{day.dayName}</span>
                              <span>{day.dayNumber}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Horarios */}
                    <div>
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                        <div className="text-xs font-black text-[#086847] uppercase tracking-wide">
                          Horarios para {selectedDay.dayName} {selectedDay.dayNumber}
                        </div>
                        <button
                          onClick={() =>
                            applySlotsToSelectedDays(selectedComplex.complexKey, selectedCourt)
                          }
                          className="flex items-center gap-1.5 text-xs font-bold text-[#086847] hover:underline"
                        >
                          <Copy size={13} /> Aplicar a dias seleccionados
                        </button>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {chunkSlots(HALF_HOUR_SLOTS).map((row) => {
                          const selectedSlots =
                            selectedCourt.slotsByDate[String(selectedDay.dateMillis)] || [];
                          const rowIsComplete = row.every((slot) => selectedSlots.includes(slot));
                          return (
                            <div key={row.join("-")} className="flex items-center gap-1.5">
                              <div className="flex gap-1.5 flex-1">
                                {row.map((slot) => {
                                  const isAvailable = selectedSlots.includes(slot);
                                  return (
                                    <button
                                      key={slot}
                                      onClick={() =>
                                        toggleConfigSlot(selectedComplex.complexKey, selectedCourt, slot)
                                      }
                                      className={`flex-1 text-xs font-bold py-2 rounded-lg border transition-colors ${
                                        isAvailable
                                          ? "bg-[#0B8457] border-[#0B8457] text-white"
                                          : "bg-white border-[#CFE7DC] text-[#5F7D72] hover:border-[#0B8457]"
                                      }`}
                                    >
                                      {slot}
                                    </button>
                                  );
                                })}
                              </div>
                              <button
                                onClick={() =>
                                  toggleConfigSlotRow(selectedComplex.complexKey, selectedCourt, row)
                                }
                                className={`w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 ${
                                  rowIsComplete
                                    ? "bg-[#EDF7F2] border-[#C9E5D8] text-[#086847]"
                                    : "bg-white border-gray-200 text-gray-400"
                                }`}
                              >
                                {rowIsComplete ? <Check size={13} /> : <ChevronDown size={13} />}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Aprobacion */}
                <div className="bg-white rounded-2xl border border-[#CFE7DC] p-5 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="font-black text-[#173A2E] text-sm">Aprobacion del organizador</div>
                    <div className="text-xs text-[#5F7D72] mt-0.5">
                      {config.requiresOrganizerApproval === false
                        ? "Las reservas quedan confirmadas automaticamente."
                        : "Las reservas quedan pendientes hasta que las apruebes."}
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      setConfig((current) =>
                        current
                          ? {
                              ...current,
                              requiresOrganizerApproval: current.requiresOrganizerApproval === false,
                            }
                          : current
                      )
                    }
                    className={`px-4 py-2 rounded-xl text-sm font-black border transition-colors ${
                      config.requiresOrganizerApproval !== false
                        ? "bg-[#0B8457] border-[#0B8457] text-white"
                        : "bg-gray-100 border-gray-200 text-gray-400"
                    }`}
                  >
                    {config.requiresOrganizerApproval === false ? "NO" : "SI"}
                  </button>
                </div>

                {/* Mercado Pago (solo lectura, se activa desde el perfil) */}
                <div className="bg-white rounded-2xl border border-[#CFE7DC] p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <Wallet size={16} className={config.mercadoPagoConfig?.enabled ? "text-[#1A7F5A]" : "text-gray-400"} />
                    <div className="font-black text-[#173A2E] text-sm">Mercado Pago</div>
                  </div>
                  <p className="text-xs text-[#5F7D72]">
                    {config.mercadoPagoConfig?.enabled
                      ? "Los turnos nuevos ya quedan preparados para cobrar tambien con Mercado Pago."
                      : "Activalo desde tu perfil para cobrar tambien con Mercado Pago en reservas nuevas."}
                  </p>
                </div>

                <button
                  onClick={handleSaveConfig}
                  disabled={saving}
                  className="self-start bg-[#0B8457] hover:bg-[#086847] text-white font-black text-sm px-6 py-3 rounded-xl transition-colors disabled:opacity-60"
                >
                  {saving ? "Guardando..." : "Guardar configuracion"}
                </button>
              </>
            )}
          </div>
        ))}

      {/* ── TAB RESERVAS ──────────────────────────────────────────────── */}
      {tab === "reservas" && (
        <>
          <div className="flex gap-2 mb-5 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFiltro(f.key)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  filtro === f.key
                    ? "bg-[#173A2E] text-white border-[#173A2E]"
                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 max-w-2xl">
            {reservasFiltradas.length === 0 && (
              <p className="text-gray-400 text-sm">
                {reservations.length === 0 ? "No hay reservas todavia." : "No hay reservas con ese filtro."}
              </p>
            )}
            {reservasFiltradas.map((r) => {
              const actionable = isActionableReservation(r);
              const active = isActiveReservation(r);

              return (
                <div key={r.id} className="bg-white rounded-2xl px-5 py-4 border border-[#CFE7DC] flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#EDF7F2] flex items-center justify-center flex-shrink-0">
                        <Clock size={18} className="text-[#086847]" />
                      </div>
                      <div>
                        <div className="font-black text-[#173A2E] text-sm">
                          {r.complexName || "Complejo"} · {r.courtName || "Cancha"}
                        </div>
                        <div className="text-xs text-[#5F7D72] mt-0.5">
                          {r.dateLabel || "Fecha a confirmar"} · {r.time || "--:--"} hs ·{" "}
                          {r.durationMinutes || 60} min
                        </div>
                      </div>
                    </div>
                    <span
                      className={`text-[11px] font-black px-2.5 py-1 rounded-full border ${getStatusColorClasses(
                        r.status
                      )}`}
                    >
                      {getTurnoStatusLabel(r)}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-[#5F7D72] flex-wrap">
                    <span className="flex items-center gap-1">
                      <User size={12} /> {r.playerName || "Jugador"}
                    </span>
                    <span>{getTurnoPaymentMethodLabel(r.paymentMethod)}</span>
                    {typeof r.price === "number" && r.price > 0 && <span>{formatCurrency(r.price)}</span>}
                  </div>

                  {actionable && (
                    <div className="flex gap-2">
                      <button
                        disabled={Boolean(runningAction)}
                        onClick={() => handleReservationStatus(r, "rejected")}
                        className="flex-1 text-xs font-black py-2 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50"
                      >
                        {runningAction === `${r.id}-rejected` ? "..." : "RECHAZAR"}
                      </button>
                      <button
                        disabled={Boolean(runningAction)}
                        onClick={() => handleReservationStatus(r, "confirmed")}
                        className="flex-1 text-xs font-black py-2 rounded-lg bg-[#0B8457] text-white hover:bg-[#086847] disabled:opacity-50"
                      >
                        {runningAction === `${r.id}-confirmed` ? "..." : "CONFIRMAR"}
                      </button>
                    </div>
                  )}

                  {!actionable && active && r.status === "confirmed" && (
                    <button
                      disabled={Boolean(runningAction)}
                      onClick={() => handleReservationStatus(r, "cancelled")}
                      className="self-start text-xs font-bold text-gray-400 hover:text-red-500 disabled:opacity-50"
                    >
                      {runningAction === `${r.id}-cancelled` ? "..." : "Cancelar reserva"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modal aplicar precio/horario a varias canchas */}
      {applyModal && selectedComplex && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <div className="font-black text-[#173A2E] text-base">Aplicar a otras canchas</div>
              <button onClick={() => setApplyModal(null)}>
                <X size={18} className="text-gray-400" />
              </button>
            </div>
            <p className="text-xs text-[#5F7D72] mb-4">
              Se va a copiar el precio y los horarios cargados a las canchas que marques.
            </p>
            <div className="flex flex-col gap-2 mb-5 max-h-60 overflow-y-auto">
              {selectedComplex.courts.map((court) => (
                <label
                  key={court.id}
                  className="flex items-center gap-2 text-sm font-semibold text-[#173A2E]"
                >
                  <input
                    type="checkbox"
                    checked={applyCourtIds.includes(court.id)}
                    onChange={() =>
                      setApplyCourtIds((current) =>
                        current.includes(court.id)
                          ? current.filter((id) => id !== court.id)
                          : [...current, court.id]
                      )
                    }
                  />
                  {court.name}
                </label>
              ))}
            </div>
            <button
              onClick={applyPriceAndSlotsToSelectedCourts}
              className="w-full bg-[#0B8457] hover:bg-[#086847] text-white font-black text-sm py-3 rounded-xl transition-colors"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
