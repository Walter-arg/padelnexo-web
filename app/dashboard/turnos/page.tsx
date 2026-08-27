"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
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
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Calendar,
  Check,
  ChevronDown,
  Clock,
  Copy,
  MapPin,
  Search,
  Settings,
  User,
  UserPlus,
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
const DURATIONS = [60, 90];
const SAME_DAY_TOLERANCE_MINUTES = 15;
const ASSIGNMENT_PAYMENT_METHODS = [
  { key: "a_confirmar", label: "A confirmar" },
  { key: "efectivo", label: "Efectivo" },
  { key: "transferencia", label: "Transferencia" },
];

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
  courtId?: string;
  courtName?: string;
  dateMillis?: number;
  dateLabel?: string;
  time?: string;
  durationMinutes?: number;
  price?: number;
  playerId?: string;
  playerName?: string;
  playerPhone?: string;
  playerCountryCode?: string;
  paymentMethod?: string;
  status?: string;
  organizerNotificationUnread?: boolean;
};

type Player = {
  id: string;
  nombre: string;
  apellido: string;
  categoria: string;
  ciudad: string;
  telefono: string;
  countryCode: string;
};

type BookingPlayer = {
  id: string;
  name: string;
  phone: string;
  countryCode: string;
  type: "registered" | "guest";
};

function normalizeText(value = ""): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeKey(value = ""): string {
  return normalizeText(value).replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
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
  const dayFmt = new Intl.DateTimeFormat("es-AR", { weekday: "long" });
  const monthFmt = new Intl.DateTimeFormat("es-AR", { month: "short" });
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
      monthName: monthFmt.format(date).replace(".", "").toUpperCase(),
      fullLabel: date.toLocaleDateString("es-AR", { day: "2-digit", month: "long", weekday: "long" }),
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

function isActiveReservation(r: Reservation) {
  return !["cancelled", "rejected"].includes(r.status || "");
}

function parseSlotToMinutes(slot = ""): number | null {
  const [hours, minutes] = slot.split(":").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function formatSlotFromMinutes(totalMinutes = 0) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function buildSlotBlocks(slot = "", durationMinutes = 60): string[] {
  const startMinutes = parseSlotToMinutes(slot);
  if (startMinutes === null) return [];
  const blockCount = Math.max(1, Math.ceil(durationMinutes / 30));
  return Array.from({ length: blockCount }, (_, index) => formatSlotFromMinutes(startMinutes + index * 30));
}

function isPastSlotForDay(day: { dateMillis: number }, slot: string): boolean {
  const slotMinutes = parseSlotToMinutes(slot);
  if (slotMinutes === null || !day?.dateMillis) return false;

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (day.dateMillis !== today.getTime()) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return currentMinutes > slotMinutes + SAME_DAY_TOLERANCE_MINUTES;
}

function getReservableCourtSlots(court: Court | null, day: { dateMillis: number } | undefined): string[] {
  if (!court || !day) return [];
  const dateSlots = court.slotsByDate[String(day.dateMillis)] || [];
  return dateSlots.filter((slot) => !isPastSlotForDay(day, slot));
}

function getReservedSlotsForCourtDay(
  reservations: Reservation[],
  complexKey: string,
  courtId: string,
  dateMillis: number
): Set<string> {
  const reserved = new Set<string>();
  reservations.forEach((r) => {
    if (
      !isActiveReservation(r) ||
      r.complexKey !== complexKey ||
      r.courtId !== courtId ||
      Number(r.dateMillis || 0) !== dateMillis
    ) {
      return;
    }
    buildSlotBlocks(r.time, r.durationMinutes || 60).forEach((slot) => reserved.add(slot));
  });
  return reserved;
}

function isDurationAvailable(
  availableSlots: Set<string>,
  reservedSlots: Set<string>,
  slot: string,
  durationMinutes: number
): boolean {
  if (!availableSlots.has(slot)) return false;
  return buildSlotBlocks(slot, durationMinutes).every((block) => !reservedSlots.has(block));
}

function getCourtPrice(court: Court | null, duration: number): number {
  if (!court) return 0;
  return duration === 90 ? court.price90 : court.price60;
}

function normalizePlayer(id: string, data: any): Player {
  const localidad = data.localidad || {};
  const location = data.location || {};
  return {
    id,
    nombre: data.nombre || "Jugador",
    apellido: data.apellido || data.lastName || "",
    categoria: data.categoria || "",
    ciudad: localidad.nombre || location.ciudad || "",
    telefono: String(data.telefono || "").trim(),
    countryCode: String(data.countryCode || "+54").trim(),
  };
}

type TabKey = "reservas" | "asignar" | "config";

export default function TurnosPage() {
  const router = useRouter();
  const [uid, setUid] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabKey>("reservas");
  const [config, setConfig] = useState<OrganizerConfig | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [runningAction, setRunningAction] = useState("");
  const [toast, setToast] = useState<{ text: string; tone: "success" | "danger" } | null>(null);

  const days = useMemo(buildNextSevenDays, []);

  // Compartido entre las 3 secciones, igual que selectedOrganizerComplexKey /
  // selectedDayId en la app.
  const [selectedComplexKey, setSelectedComplexKey] = useState("");
  const [selectedDayId, setSelectedDayId] = useState(days[0]?.id || "");

  // ── Seccion "Asignar canchas disponibles" (configuracion) ──
  const [selectedCourtByComplex, setSelectedCourtByComplex] = useState<Record<string, string>>({});
  const [selectedDateIds, setSelectedDateIds] = useState<string[]>(days[0]?.id ? [days[0].id] : []);
  const [applyModal, setApplyModal] = useState<{ complexKey: string; sourceCourtId: string } | null>(
    null
  );
  const [applyCourtIds, setApplyCourtIds] = useState<string[]>([]);

  // ── Seccion "Reservas confirmadas" ──
  const [reservationDetail, setReservationDetail] = useState<Reservation | null>(null);

  // ── Seccion "Asignar reserva" ──
  const [bookingCourtId, setBookingCourtId] = useState("");
  const [bookingSlot, setBookingSlot] = useState("");
  const [bookingDuration, setBookingDuration] = useState(90);
  const [bookingPlayer, setBookingPlayer] = useState<BookingPlayer | null>(null);
  const [bookingPaymentMethod, setBookingPaymentMethod] = useState("efectivo");
  const [bookingReceiptFile, setBookingReceiptFile] = useState<File | null>(null);
  const [bookingSaving, setBookingSaving] = useState(false);
  const [playerPickerOpen, setPlayerPickerOpen] = useState(false);
  const [playerQuery, setPlayerQuery] = useState("");
  const [playersDirectory, setPlayersDirectory] = useState<Player[] | null>(null);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

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

  async function ensurePlayersLoaded() {
    if (playersDirectory || loadingPlayers) return;
    setLoadingPlayers(true);
    try {
      const snap = await getDocs(collection(db, "users"));
      const list = snap.docs
        .filter((d) => {
          const data = d.data() || {};
          if (data.accountDeleted) return false;
          const role = String(data.role || "user").toLowerCase();
          return role !== "blocked" && role !== "deleted";
        })
        .map((d) => normalizePlayer(d.id, d.data()));
      setPlayersDirectory(list);
    } finally {
      setLoadingPlayers(false);
    }
  }

  const selectedComplex = config?.complexes.find((c) => c.complexKey === selectedComplexKey) || null;
  const selectedDay = days.find((d) => d.id === selectedDayId) || days[0];
  const selectedCourtId = selectedComplex ? selectedCourtByComplex[selectedComplex.complexKey] : "";
  const selectedCourt =
    selectedComplex?.courts.find((c) => c.id === selectedCourtId) || selectedComplex?.courts[0] || null;

  // Complejos/canchas reservables (mismo filtro que listBookableComplexes: habilitada
  // y con al menos un dia con horarios cargados).
  const bookableComplexes = useMemo(() => {
    if (!config) return [];
    return config.complexes
      .map((complex) => ({
        ...complex,
        availableCourts: complex.courts.filter(
          (court) =>
            court.enabled && Object.values(court.slotsByDate).some((slots) => slots.length > 0)
        ),
      }))
      .filter((complex) => complex.availableCourts.length > 0);
  }, [config]);
  const [bookingComplexKey, setBookingComplexKey] = useState("");
  const bookingComplex = bookableComplexes.find((c) => c.complexKey === bookingComplexKey) || null;
  const bookingCourt = bookingComplex?.availableCourts.find((c) => c.id === bookingCourtId) || null;
  const bookingReservedSlots = bookingCourt
    ? getReservedSlotsForCourtDay(reservations, bookingComplex!.complexKey, bookingCourt.id, selectedDay.dateMillis)
    : new Set<string>();
  const bookingAllSlots = getReservableCourtSlots(bookingCourt, selectedDay);
  const bookingAvailableSlotSet = new Set(bookingAllSlots.filter((s) => !bookingReservedSlots.has(s)));
  const bookingPrice = getCourtPrice(bookingCourt, bookingDuration);

  const filteredPlayers = useMemo(() => {
    const list = playersDirectory || [];
    const q = normalizeText(playerQuery);
    if (!q) return list.slice(0, 25);
    return list
      .filter((p) => normalizeText([p.nombre, p.apellido, p.categoria, p.ciudad].join(" ")).includes(q))
      .slice(0, 25);
  }, [playersDirectory, playerQuery]);

  useEffect(() => {
    if (tab === "asignar") {
      ensurePlayersLoaded();
      if (!bookingComplexKey && bookableComplexes.length) {
        setBookingComplexKey(bookableComplexes[0].complexKey);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

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

  async function handleCancelReservation(reservation: Reservation) {
    try {
      setRunningAction(`${reservation.id}-cancelled`);
      await updateDoc(doc(db, "turnoReservations", reservation.id), {
        organizerNotificationUnread: false,
        status: "cancelled",
        cancelledAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setReservations((current) =>
        current.map((r) => (r.id === reservation.id ? { ...r, status: "cancelled" } : r))
      );
      showToast("Reserva cancelada.", "success");
    } catch (error: any) {
      showToast(error?.message || "No pudimos cancelar la reserva.", "danger");
    } finally {
      setRunningAction("");
    }
  }

  function resetBookingFlow() {
    setBookingCourtId("");
    setBookingSlot("");
    setBookingDuration(90);
    setBookingPlayer(null);
    setBookingPaymentMethod("efectivo");
    setBookingReceiptFile(null);
  }

  async function handleCreateBooking() {
    if (!bookingComplex || !bookingCourt || !bookingSlot || !bookingPlayer || !uid) {
      showToast("Completa cancha, horario y jugador antes de reservar.", "danger");
      return;
    }
    if (bookingPaymentMethod === "transferencia" && !bookingReceiptFile) {
      showToast("Adjunta el comprobante de transferencia.", "danger");
      return;
    }

    try {
      setBookingSaving(true);
      let proofFileName = "";
      let proofUrl = "";

      if (bookingPaymentMethod === "transferencia" && bookingReceiptFile) {
        const extension = bookingReceiptFile.name.split(".").pop() || "jpg";
        const fileName = `${bookingPlayer.id || "jugador"}-${Date.now()}.${extension}`;
        const proofRef = storageRef(
          storage,
          `turno-payment-proofs/${bookingPlayer.id || "sin-usuario"}/${fileName}`
        );
        await uploadBytes(proofRef, bookingReceiptFile, {
          contentType: bookingReceiptFile.type || "application/octet-stream",
        });
        proofFileName = fileName;
        proofUrl = await getDownloadURL(proofRef);
      }

      const payload = {
        organizerId: uid,
        createdByOrganizer: true,
        requiresOrganizerApproval: false,
        complexKey: bookingComplex.complexKey,
        complexName: bookingComplex.name,
        complexAddress: bookingComplex.address,
        courtId: bookingCourt.id,
        courtName: bookingCourt.name,
        dateMillis: selectedDay.dateMillis,
        dateLabel: selectedDay.fullLabel,
        time: bookingSlot,
        durationMinutes: bookingDuration,
        price: bookingPrice,
        paymentMethod: bookingPaymentMethod,
        proofFileName,
        proofUrl,
        playerId: bookingPlayer.id || "",
        playerName: bookingPlayer.name,
        playerCountryCode: bookingPlayer.countryCode || "+54",
        playerPhone: bookingPlayer.phone || "",
        playerType: bookingPlayer.type,
        organizerNotificationUnread: false,
        status: "confirmed",
        confirmedAt: serverTimestamp(),
        paymentStatus:
          bookingPaymentMethod === "transferencia"
            ? "in_review"
            : bookingPaymentMethod === "a_confirmar"
              ? "to_be_defined"
              : "pending_cash",
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, "turnoReservations"), payload);
      showToast("Reserva asignada correctamente.", "success");
      resetBookingFlow();
      await loadAll(uid);
      setTab("reservas");
    } catch (error: any) {
      showToast(error?.message || "No pudimos crear la reserva.", "danger");
    } finally {
      setBookingSaving(false);
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

  const hasComplexes = Boolean(config && config.complexes.length > 0);

  const TABS: {
    key: TabKey;
    label: string;
    icon: any;
    active: { bg: string; border: string; text: string };
  }[] = [
    {
      key: "reservas",
      label: "Reservas confirmadas",
      icon: Calendar,
      active: { bg: "bg-[#EAF8F0]", border: "border-[#0B8457]", text: "text-[#086847]" },
    },
    {
      key: "asignar",
      label: "Asignar reserva",
      icon: UserPlus,
      active: { bg: "bg-[#EAF3FB]", border: "border-[#3E7FBE]", text: "text-[#1D5C91]" },
    },
    {
      key: "config",
      label: "Asignar canchas disponibles",
      icon: Settings,
      active: { bg: "bg-[#FBF1DF]", border: "border-[#D9A441]", text: "text-[#8A5E10]" },
    },
  ];

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
      <div className="flex gap-3 mb-6 flex-wrap">
        {TABS.map(({ key, label, icon: Icon, active }) => {
          const isActive = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex flex-col items-center justify-center gap-2 w-32 h-28 sm:w-36 sm:h-32 rounded-2xl border-2 text-center px-2 transition-all ${
                isActive
                  ? `${active.bg} ${active.border} ${active.text} shadow-md`
                  : "bg-white border-gray-200 text-gray-400 hover:border-gray-300"
              }`}
            >
              <Icon size={28} />
              <span className="text-xs font-black uppercase leading-tight">{label}</span>
            </button>
          );
        })}
      </div>

      {!hasComplexes ? (
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
        <>
          {/* Selector de dias, compartido por las 3 secciones */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {days.map((day) => {
                const isCurrent = day.id === selectedDayId;
                const isChecked = tab === "config" && selectedDateIds.includes(day.id);
                return (
                  <button
                    key={day.id}
                    onClick={() => {
                      setSelectedDayId(day.id);
                      setBookingSlot("");
                    }}
                    className={`relative flex flex-col items-center justify-center w-24 h-20 rounded-xl border text-xs font-black flex-shrink-0 whitespace-nowrap transition-all ${
                      isCurrent
                        ? "bg-[#0B8457] border-[#0B8457] text-white"
                        : "bg-white border-[#CFE7DC] text-[#173A2E] hover:border-[#0B8457]"
                    }`}
                  >
                    {tab === "config" && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleDateSelection(day.id);
                        }}
                        className={`absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full border flex items-center justify-center ${
                          isChecked ? "bg-[#A6D96A] border-[#7FB845]" : "bg-white border-gray-300"
                        }`}
                      >
                        {isChecked && <Check size={10} className="text-[#244B1A]" />}
                      </span>
                    )}
                    <span className="opacity-80 text-[10px]">{day.dayName}</span>
                    <span className="text-lg">{day.dayNumber}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── RESERVAS CONFIRMADAS ─────────────────────────────────── */}
          {tab === "reservas" && (
            <div className="max-w-3xl flex flex-col gap-4">
              {config!.complexes.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  {config!.complexes.map((complex) => (
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

              {selectedComplex && selectedComplex.courts.length === 0 && (
                <p className="text-sm text-gray-400">No hay canchas cargadas para esta sede.</p>
              )}

              {selectedComplex?.courts.map((court) => {
                const configuredSlots = court.slotsByDate[String(selectedDay.dateMillis)] || [];
                return (
                  <div key={court.id} className="bg-white rounded-2xl border border-[#CFE7DC] p-4">
                    <div className="font-black text-[#173A2E] text-sm mb-1">{court.name}</div>
                    <div className="text-xs text-[#5F7D72] mb-3">
                      {court.features.join(" - ") || "Sin caracteristicas"}
                    </div>
                    {configuredSlots.length === 0 ? (
                      <p className="text-xs text-gray-400">
                        No hay horarios cargados para esta cancha en este dia.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {chunkSlots(configuredSlots).map((row) => (
                          <div key={row.join("-")} className="flex gap-1.5">
                            {row.map((slot) => {
                              const reservation = reservations.find((r) => {
                                if (
                                  !isActiveReservation(r) ||
                                  r.complexKey !== selectedComplex.complexKey ||
                                  r.courtId !== court.id ||
                                  Number(r.dateMillis || 0) !== selectedDay.dateMillis
                                ) {
                                  return false;
                                }
                                return buildSlotBlocks(r.time, r.durationMinutes || 60).includes(slot);
                              });
                              const isStart = reservation?.time === slot;

                              return (
                                <button
                                  key={slot}
                                  disabled={!isStart}
                                  onClick={() => reservation && setReservationDetail(reservation)}
                                  className={`flex-1 text-xs font-bold py-2 rounded-lg border transition-colors ${
                                    reservation
                                      ? reservation.status === "pending_organizer_confirmation"
                                        ? "bg-amber-50 border-amber-300 text-amber-700"
                                        : "bg-[#0B8457] border-[#0B8457] text-white"
                                      : "bg-white border-[#CFE7DC] text-[#5F7D72]"
                                  } ${isStart ? "cursor-pointer" : reservation ? "cursor-default" : ""}`}
                                >
                                  {slot}
                                  {isStart ? " · VER" : ""}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── ASIGNAR RESERVA ──────────────────────────────────────── */}
          {tab === "asignar" && (
            <div className="max-w-3xl flex flex-col gap-4">
              {bookableComplexes.length === 0 ? (
                <p className="text-sm text-gray-400">
                  No tenes canchas habilitadas con horarios cargados. Configuralas primero en{" "}
                  <button onClick={() => setTab("config")} className="text-[#0B8457] font-semibold underline">
                    Asignar canchas disponibles
                  </button>
                  .
                </p>
              ) : (
                <>
                  {bookableComplexes.length > 1 && (
                    <div className="flex gap-2 flex-wrap">
                      {bookableComplexes.map((complex) => (
                        <button
                          key={complex.complexKey}
                          onClick={() => {
                            setBookingComplexKey(complex.complexKey);
                            setBookingCourtId("");
                            setBookingSlot("");
                          }}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                            complex.complexKey === bookingComplexKey
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

                  {bookingComplex && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {bookingComplex.availableCourts.map((court) => (
                        <button
                          key={court.id}
                          onClick={() => {
                            setBookingCourtId(court.id);
                            setBookingSlot("");
                          }}
                          className={`px-4 py-2 rounded-xl text-sm font-semibold border whitespace-nowrap transition-all ${
                            court.id === bookingCourtId
                              ? "bg-[#0B8457] border-[#0B8457] text-white"
                              : "bg-white border-gray-200 text-gray-600 hover:border-[#0B8457]"
                          }`}
                        >
                          {court.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {bookingCourt && (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        {bookingCourt.features.map((f) => (
                          <span
                            key={f}
                            className="text-[11px] font-black px-2 py-0.5 rounded-full bg-[#EDF7F2] border border-[#C9E5D8] text-[#086847]"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                      <div>
                        <div className="text-xs font-black text-[#086847] uppercase tracking-wide mb-2">
                          Elegi un turno
                        </div>
                        {bookingAllSlots.length === 0 ? (
                          <p className="text-xs text-gray-400">No hay horarios cargados para este dia.</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {bookingAllSlots.map((slot) => {
                              const isAvailable = bookingAvailableSlotSet.has(slot);
                              const isSelected = slot === bookingSlot;
                              return (
                                <button
                                  key={slot}
                                  disabled={!isAvailable}
                                  onClick={() => {
                                    setBookingSlot(slot);
                                    setBookingDuration(
                                      isDurationAvailable(bookingAvailableSlotSet, new Set(), slot, 90)
                                        ? 90
                                        : 60
                                    );
                                  }}
                                  className={`text-xs font-bold px-3 py-2 rounded-lg border transition-colors ${
                                    isSelected
                                      ? "bg-[#0B8457] border-[#0B8457] text-white"
                                      : isAvailable
                                        ? "bg-white border-[#CFE7DC] text-[#173A2E] hover:border-[#0B8457]"
                                        : "bg-gray-100 border-gray-100 text-gray-300 cursor-not-allowed"
                                  }`}
                                >
                                  {slot}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {bookingSlot && (
                        <div className="bg-white rounded-2xl border border-[#CFE7DC] p-5 flex flex-col gap-4">
                          <div>
                            <div className="text-xs font-black text-[#086847] uppercase tracking-wide mb-2">
                              Duracion
                            </div>
                            <div className="flex gap-2">
                              {DURATIONS.map((d) => (
                                <button
                                  key={d}
                                  onClick={() => setBookingDuration(d)}
                                  className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${
                                    bookingDuration === d
                                      ? "bg-[#0B8457] border-[#0B8457] text-white"
                                      : "bg-white border-[#CFE7DC] text-[#173A2E]"
                                  }`}
                                >
                                  {d} min
                                </button>
                              ))}
                            </div>
                          </div>

                          <button
                            onClick={() => setPlayerPickerOpen(true)}
                            className="flex items-center gap-3 border border-[#CFE7DC] rounded-xl px-4 py-3 text-left hover:border-[#0B8457]"
                          >
                            <User size={18} className="text-[#086847]" />
                            <div className="flex-1">
                              <div className="text-[11px] font-bold text-[#5F7D72]">
                                {bookingPlayer ? "Reserva para" : "Seleccionar usuario"}
                              </div>
                              <div className="text-sm font-black text-[#173A2E]">
                                {bookingPlayer ? bookingPlayer.name : "Persona registrada o no registrada"}
                              </div>
                            </div>
                          </button>

                          <div>
                            <div className="text-xs font-black text-[#086847] uppercase tracking-wide mb-2">
                              Precio del turno
                            </div>
                            <div className="text-xl font-black text-[#173A2E]">
                              {formatCurrency(bookingPrice)}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs font-black text-[#086847] uppercase tracking-wide mb-2">
                              Metodo de pago
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              {ASSIGNMENT_PAYMENT_METHODS.map((m) => (
                                <button
                                  key={m.key}
                                  onClick={() => setBookingPaymentMethod(m.key)}
                                  className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${
                                    bookingPaymentMethod === m.key
                                      ? "bg-[#0B8457] border-[#0B8457] text-white"
                                      : "bg-white border-[#CFE7DC] text-[#173A2E]"
                                  }`}
                                >
                                  {m.label}
                                </button>
                              ))}
                            </div>
                            {bookingPaymentMethod === "transferencia" && (
                              <label className="mt-3 flex items-center gap-2 text-xs font-bold text-[#086847] cursor-pointer">
                                <input
                                  type="file"
                                  accept="image/*,application/pdf"
                                  className="hidden"
                                  onChange={(e) => setBookingReceiptFile(e.target.files?.[0] || null)}
                                />
                                <span className="underline">
                                  {bookingReceiptFile ? bookingReceiptFile.name : "Cargar comprobante"}
                                </span>
                              </label>
                            )}
                          </div>

                          <button
                            onClick={handleCreateBooking}
                            disabled={bookingSaving || !bookingPlayer}
                            className="bg-[#0B8457] hover:bg-[#086847] text-white font-black text-sm py-3 rounded-xl transition-colors disabled:opacity-50"
                          >
                            {bookingSaving ? "RESERVANDO..." : "RESERVAR"}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── ASIGNAR CANCHAS DISPONIBLES (configuracion) ──────────── */}
          {tab === "config" && (
            <div className="max-w-3xl flex flex-col gap-5">
              {config!.complexes.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  {config!.complexes.map((complex) => (
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

                      <div>
                        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                          <div className="text-xs font-black text-[#086847] uppercase tracking-wide">
                            Horarios para {selectedDay.dayName} {selectedDay.dayNumber}
                          </div>
                          <button
                            onClick={() => applySlotsToSelectedDays(selectedComplex.complexKey, selectedCourt)}
                            className="flex items-center gap-1.5 text-xs font-bold text-[#086847] hover:underline"
                          >
                            <Copy size={13} /> Aplicar a dias seleccionados (marcalos arriba)
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

                  <div className="bg-white rounded-2xl border border-[#CFE7DC] p-5 flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <div className="font-black text-[#173A2E] text-sm">Aprobacion del organizador</div>
                      <div className="text-xs text-[#5F7D72] mt-0.5">
                        {config!.requiresOrganizerApproval === false
                          ? "Las reservas quedan confirmadas automaticamente."
                          : "Las reservas quedan pendientes hasta que las apruebes."}
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        setConfig((current) =>
                          current
                            ? { ...current, requiresOrganizerApproval: current.requiresOrganizerApproval === false }
                            : current
                        )
                      }
                      className={`px-4 py-2 rounded-xl text-sm font-black border transition-colors ${
                        config!.requiresOrganizerApproval !== false
                          ? "bg-[#0B8457] border-[#0B8457] text-white"
                          : "bg-gray-100 border-gray-200 text-gray-400"
                      }`}
                    >
                      {config!.requiresOrganizerApproval === false ? "NO" : "SI"}
                    </button>
                  </div>

                  <div className="bg-white rounded-2xl border border-[#CFE7DC] p-5">
                    <div className="flex items-center gap-2 mb-1">
                      <Wallet
                        size={16}
                        className={config!.mercadoPagoConfig?.enabled ? "text-[#1A7F5A]" : "text-gray-400"}
                      />
                      <div className="font-black text-[#173A2E] text-sm">Mercado Pago</div>
                    </div>
                    <p className="text-xs text-[#5F7D72]">
                      {config!.mercadoPagoConfig?.enabled
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
          )}
        </>
      )}

      {/* Modal detalle de reserva (seccion Reservas confirmadas) */}
      {reservationDetail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <div className="font-black text-[#173A2E] text-base">Detalle de reserva</div>
              <button onClick={() => setReservationDetail(null)}>
                <X size={18} className="text-gray-400" />
              </button>
            </div>
            <div className="flex flex-col gap-3 mb-5">
              <div className="flex items-center gap-3">
                <User size={16} className="text-[#086847]" />
                <div>
                  <div className="text-sm font-black text-[#173A2E]">
                    {reservationDetail.playerName || "Jugador"}
                  </div>
                  <div className="text-xs text-[#5F7D72]">
                    {reservationDetail.playerPhone || "Sin telefono cargado"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar size={16} className="text-[#086847]" />
                <div>
                  <div className="text-sm font-black text-[#173A2E]">{reservationDetail.courtName}</div>
                  <div className="text-xs text-[#5F7D72]">
                    {reservationDetail.dateLabel} · {reservationDetail.time} hs ·{" "}
                    {reservationDetail.durationMinutes || 60} min
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span
                  className={`text-[11px] font-black px-2.5 py-1 rounded-full border ${getStatusColorClasses(
                    reservationDetail.status
                  )}`}
                >
                  {getTurnoStatusLabel(reservationDetail)}
                </span>
                <span className="text-xs text-[#5F7D72]">
                  {getTurnoPaymentMethodLabel(reservationDetail.paymentMethod)} ·{" "}
                  {formatCurrency(reservationDetail.price || 0)}
                </span>
              </div>
            </div>
            <button
              disabled={
                !isActiveReservation(reservationDetail) || runningAction === `${reservationDetail.id}-cancelled`
              }
              onClick={async () => {
                await handleCancelReservation(reservationDetail);
                setReservationDetail(null);
              }}
              className="w-full text-sm font-black py-3 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50"
            >
              {runningAction === `${reservationDetail.id}-cancelled` ? "..." : "Cancelar reserva"}
            </button>
          </div>
        </div>
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
                <label key={court.id} className="flex items-center gap-2 text-sm font-semibold text-[#173A2E]">
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

      {/* Modal selector de jugador (seccion Asignar reserva) */}
      {playerPickerOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <div className="font-black text-[#173A2E] text-base">Asignar reserva</div>
              <button onClick={() => setPlayerPickerOpen(false)}>
                <X size={18} className="text-gray-400" />
              </button>
            </div>
            <p className="text-xs text-[#5F7D72] mb-4">
              Selecciona una persona registrada o carga una no registrada.
            </p>
            <div className="flex items-center gap-2 border border-[#CFE7DC] rounded-xl px-3 py-2 mb-3">
              <Search size={15} className="text-gray-400" />
              <input
                value={playerQuery}
                onChange={(e) => setPlayerQuery(e.target.value)}
                placeholder="Buscar por nombre, categoria o ciudad"
                className="flex-1 text-sm outline-none"
              />
            </div>
            <div className="flex flex-col gap-1 max-h-52 overflow-y-auto mb-4">
              {loadingPlayers ? (
                <p className="text-xs text-gray-400">Cargando jugadores...</p>
              ) : filteredPlayers.length === 0 ? (
                <p className="text-xs text-gray-400">No encontramos jugadores registrados.</p>
              ) : (
                filteredPlayers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setBookingPlayer({
                        id: p.id,
                        name: [p.nombre, p.apellido].filter(Boolean).join(" ") || "Jugador",
                        phone: p.telefono,
                        countryCode: p.countryCode,
                        type: "registered",
                      });
                      setPlayerPickerOpen(false);
                      setPlayerQuery("");
                    }}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#F7FBF9] text-left"
                  >
                    <User size={16} className="text-[#086847]" />
                    <div>
                      <div className="text-sm font-bold text-[#173A2E]">
                        {[p.nombre, p.apellido].filter(Boolean).join(" ")}
                      </div>
                      <div className="text-xs text-[#5F7D72]">
                        {[p.categoria, p.ciudad].filter(Boolean).join(" - ") || "Usuario registrado"}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-gray-100 pt-4">
              <div className="text-xs font-black text-[#086847] uppercase tracking-wide mb-2">
                Jugador no registrado
              </div>
              <div className="flex gap-2 mb-2">
                <input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Nombre"
                  className="flex-1 border border-[#CFE7DC] rounded-lg px-3 py-2 text-sm"
                />
                <input
                  value={guestLastName}
                  onChange={(e) => setGuestLastName(e.target.value)}
                  placeholder="Apellido"
                  className="flex-1 border border-[#CFE7DC] rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <input
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                placeholder="Telefono opcional"
                className="w-full border border-[#CFE7DC] rounded-lg px-3 py-2 text-sm mb-3"
              />
              <button
                onClick={() => {
                  if (!guestName.trim() || !guestLastName.trim()) {
                    showToast("Carga nombre y apellido para asignar la reserva.", "danger");
                    return;
                  }
                  setBookingPlayer({
                    id: "",
                    name: `${guestName.trim()} ${guestLastName.trim()}`.trim(),
                    phone: guestPhone.trim(),
                    countryCode: "",
                    type: "guest",
                  });
                  setGuestName("");
                  setGuestLastName("");
                  setGuestPhone("");
                  setPlayerPickerOpen(false);
                }}
                className="w-full border border-[#0B8457] text-[#0B8457] font-black text-sm py-2.5 rounded-xl hover:bg-[#EDF7F2] transition-colors"
              >
                CREAR NO REGISTRADO
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
