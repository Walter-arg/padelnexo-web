"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Loader2, Trophy, Users, AlertCircle } from "lucide-react";
import {
  PUBLIC_QUICK_SLOTS,
  buildPublicDayOptions,
  fetchPublicTournamentInfo,
  submitPublicTournamentRegistration,
  type PublicTournamentInfo,
} from "@/lib/publicRegistration";

function formatDateRange(startMs: number, endMs: number) {
  if (!startMs) return "";
  const start = new Date(startMs).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  if (!endMs || endMs === startMs) return start;
  const end = new Date(endMs).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
  return `${start} al ${end}`;
}

export default function PublicTournamentRegistrationPage() {
  const params = useParams();
  const tournamentId = String(params?.tournamentId ?? "");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [info, setInfo] = useState<PublicTournamentInfo | null>(null);

  const [player1Name, setPlayer1Name] = useState("");
  const [player2Name, setPlayer2Name] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [availability, setAvailability] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!tournamentId) return;
    (async () => {
      try {
        setLoading(true);
        setInfo(await fetchPublicTournamentInfo(tournamentId));
      } catch (error: any) {
        setLoadError(error?.message || "No pudimos cargar el torneo.");
      } finally {
        setLoading(false);
      }
    })();
  }, [tournamentId]);

  const dayOptions = info ? buildPublicDayOptions(info.startDateMillis, info.endDateMillis) : [];

  function toggleSlot(dayKey: string, slotKey: string) {
    setAvailability((prev) => {
      const current = prev[dayKey] ?? [];
      const next = current.includes(slotKey) ? current.filter((s) => s !== slotKey) : [...current, slotKey];
      return { ...prev, [dayKey]: next };
    });
  }

  async function handleSubmit() {
    if (!player1Name.trim() || !player2Name.trim()) {
      setSubmitError("Completá el nombre de los dos jugadores.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {
      const availabilityPayload = Object.entries(availability).reduce((acc, [dayKey, quickSlots]) => {
        if (quickSlots.length) acc[dayKey] = { quickSlots, customSlots: [] };
        return acc;
      }, {} as Record<string, { quickSlots: string[]; customSlots: never[] }>);

      await submitPublicTournamentRegistration({
        tournamentId,
        player1Name: player1Name.trim(),
        player2Name: player2Name.trim(),
        contactPhone: contactPhone.trim(),
        notes: notes.trim(),
        availability: availabilityPayload,
      });
      setDone(true);
    } catch (error: any) {
      setSubmitError(error?.message || "No pudimos enviar la inscripción.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#F6FBF8" }}>
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-5">
          <Trophy size={22} style={{ color: "#0B8457" }} />
          <span className="font-black text-lg" style={{ color: "#173A2E" }}>PadelNexo</span>
        </div>

        <div className="rounded-[22px] shadow-sm border p-6" style={{ background: "#FFFFFF", borderColor: "#CFE7DC" }}>
          {loading ? (
            <div className="flex flex-col items-center py-10 gap-3">
              <Loader2 size={28} className="animate-spin" style={{ color: "#0B8457" }} />
              <p className="text-sm font-semibold" style={{ color: "#5F7D72" }}>Cargando torneo…</p>
            </div>
          ) : loadError || !info ? (
            <div className="flex flex-col items-center py-10 gap-3 text-center">
              <AlertCircle size={28} style={{ color: "#B24343" }} />
              <p className="text-sm font-bold" style={{ color: "#173A2E" }}>{loadError || "No encontramos el torneo."}</p>
            </div>
          ) : done ? (
            <div className="flex flex-col items-center py-10 gap-3 text-center">
              <CheckCircle2 size={36} style={{ color: "#0B8457" }} />
              <p className="font-black text-base" style={{ color: "#173A2E" }}>¡Listo, tu inscripción fue enviada!</p>
              <p className="text-sm" style={{ color: "#5F7D72" }}>
                El organizador la va a revisar y confirmar. Si tenés dudas, contactalo directamente.
              </p>
            </div>
          ) : !info.open ? (
            <div className="flex flex-col items-center py-10 gap-3 text-center">
              <AlertCircle size={28} style={{ color: "#B66A16" }} />
              <p className="font-black text-base" style={{ color: "#173A2E" }}>
                {info.reason === "full" ? "Este torneo ya alcanzó el cupo máximo." : "La inscripción a este torneo no está disponible."}
              </p>
            </div>
          ) : (
            <>
              {info.coverImage && (
                <div className="-mx-6 -mt-6 mb-5 overflow-hidden rounded-t-[22px]">
                  <img src={info.coverImage} alt="" className="w-full object-cover" style={{ maxHeight: 220 }} />
                </div>
              )}

              <div className="mb-5">
                <div className="flex items-center gap-2.5">
                  {info.organizerLogoUrl ? (
                    <img src={info.organizerLogoUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0 border"
                      style={{ borderColor: "#D5EADF" }} />
                  ) : null}
                  <h1 className="font-black text-xl leading-tight" style={{ color: "#173A2E" }}>{info.name}</h1>
                </div>
                <p className="text-sm font-semibold mt-1" style={{ color: "#5F7D72" }}>
                  {formatDateRange(info.startDateMillis, info.endDateMillis)}
                  {info.compositionLabel ? ` · ${info.compositionLabel}` : ""}
                </p>
                <div className="flex items-center gap-2 mt-2 text-xs font-bold" style={{ color: "#5F7D72" }}>
                  <Users size={14} />
                  {info.registeredCount}{info.maxPairs > 0 ? ` / ${info.maxPairs}` : ""} parejas inscriptas
                  {info.entryFee > 0 ? ` · Inscripción $${info.entryFee}` : " · Sin cargo"}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>Tu nombre y apellido</label>
                  <input value={player1Name} onChange={(e) => setPlayer1Name(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{ borderColor: "#CFE7DC" }}
                    placeholder="Nombre y apellido" />
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>Nombre y apellido de tu compañero/a</label>
                  <input value={player2Name} onChange={(e) => setPlayer2Name(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{ borderColor: "#CFE7DC" }}
                    placeholder="Nombre y apellido" />
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>Teléfono de contacto</label>
                  <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{ borderColor: "#CFE7DC" }}
                    placeholder="Ej: 11 2345-6789" />
                </div>

                {dayOptions.length > 0 && (
                  <div>
                    <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>
                      Días y horarios en los que pueden jugar
                    </label>
                    <div className="flex flex-col gap-2">
                      {dayOptions.map((day) => (
                        <div key={day.key} className="rounded-xl border p-2.5" style={{ borderColor: "#CFE7DC" }}>
                          <p className="text-xs font-black mb-1.5" style={{ color: "#173A2E" }}>{day.label}</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {PUBLIC_QUICK_SLOTS.map((slot) => {
                              const active = (availability[day.key] ?? []).includes(slot.key);
                              return (
                                <button key={slot.key} type="button" onClick={() => toggleSlot(day.key, slot.key)}
                                  className="text-xs font-bold px-3 py-1.5 rounded-full border transition-colors"
                                  style={active
                                    ? { background: "#0B8457", borderColor: "#0B8457", color: "#FFFFFF" }
                                    : { background: "#F6FBF8", borderColor: "#CFE7DC", color: "#5F7D72" }}>
                                  {slot.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>
                    Observaciones para el organizador (opcional)
                  </label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none" style={{ borderColor: "#CFE7DC" }}
                    placeholder="Ej: solo podemos jugar de noche, o llegamos 15 min tarde el primer día" />
                </div>

                {submitError && <p className="text-xs font-bold" style={{ color: "#B24343" }}>{submitError}</p>}

                <button onClick={handleSubmit} disabled={submitting}
                  className="w-full py-3 rounded-xl text-sm font-black text-white disabled:opacity-50 mt-1"
                  style={{ background: "#0B8457" }}>
                  {submitting ? "Enviando…" : "Enviar inscripción"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
