"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Loader2, Trophy, Users, AlertCircle, FileText, X, Plus, Building2 } from "lucide-react";
import {
  buildPublicDayOptions,
  fetchPublicTournamentInfo,
  submitPublicTournamentRegistration,
  type PublicAvailability,
  type PublicTournamentInfo,
} from "@/lib/publicRegistration";

function formatDateRange(startMs: number, endMs: number) {
  if (!startMs) return "";
  const start = new Date(startMs).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  if (!endMs || endMs === startMs) return start;
  const end = new Date(endMs).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
  return `${start} al ${end}`;
}

// Reconoce **negrita** y *negrita* (WhatsApp), igual que el reglamento de Ligas.
function parseRulesSegments(text: string = ""): { bold: boolean; text: string }[] {
  const segments: { bold: boolean; text: string }[] = [];
  const regex = /\*\*([\s\S]+?)\*\*|\*([^*\n]+?)\*/g;
  let lastIndex = 0;
  let match = regex.exec(text);

  while (match) {
    if (match.index > lastIndex) segments.push({ bold: false, text: text.slice(lastIndex, match.index) });
    segments.push({ bold: true, text: (match[1] !== undefined ? match[1] : match[2]) ?? "" });
    lastIndex = match.index + match[0].length;
    match = regex.exec(text);
  }
  if (lastIndex < text.length) segments.push({ bold: false, text: text.slice(lastIndex) });
  return segments;
}

function RulesText({ text }: { text: string }) {
  return (
    <p className="text-sm" style={{ whiteSpace: "pre-wrap", color: "#173A2E" }}>
      {parseRulesSegments(text).map((seg, i) => (
        <span key={i} className={seg.bold ? "font-black" : undefined}>{seg.text}</span>
      ))}
    </p>
  );
}

type AvailSlot = { dateKey: string; dayLabel: string; from: string; to: string };

export default function PublicTournamentRegistrationPage() {
  const params = useParams();
  const tournamentId = String(params?.tournamentId ?? "");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [info, setInfo] = useState<PublicTournamentInfo | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  const [player1Name, setPlayer1Name] = useState("");
  const [player2Name, setPlayer2Name] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [slots, setSlots] = useState<AvailSlot[]>([]);
  const [adding, setAdding] = useState(false);
  const [newDay, setNewDay] = useState("");
  const [newFrom, setNewFrom] = useState("18:00");
  const [newTo, setNewTo] = useState("21:00");
  const [slotError, setSlotError] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!tournamentId) return;
    (async () => {
      try {
        setLoading(true);
        const data = await fetchPublicTournamentInfo(tournamentId);
        setInfo(data);
        const days = buildPublicDayOptions(data.startDateMillis, data.endDateMillis);
        if (days[0]) setNewDay(days[0].key);
      } catch (error: any) {
        setLoadError(error?.message || "No pudimos cargar el torneo.");
      } finally {
        setLoading(false);
      }
    })();
  }, [tournamentId]);

  const dayOptions = info ? buildPublicDayOptions(info.startDateMillis, info.endDateMillis) : [];

  function addSlot() {
    if (!newDay || !newFrom || !newTo) { setSlotError("Completá todos los campos."); return; }
    if (newFrom === newTo) { setSlotError("El horario de inicio y fin no pueden ser iguales."); return; }
    const dayLabel = dayOptions.find((d) => d.key === newDay)?.label ?? newDay;
    setSlots((prev) => [...prev, { dateKey: newDay, dayLabel, from: newFrom, to: newTo }]);
    setAdding(false);
    setSlotError("");
    setNewFrom("18:00");
    setNewTo("21:00");
  }

  async function handleSubmit() {
    if (!player1Name.trim() || !player2Name.trim()) {
      setSubmitError("Completá el nombre de los dos jugadores.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {
      const availability: PublicAvailability = {};
      for (const s of slots) {
        if (!availability[s.dateKey]) availability[s.dateKey] = { quickSlots: [], customSlots: [] };
        availability[s.dateKey].customSlots.push({ from: s.from, to: s.to });
      }

      await submitPublicTournamentRegistration({
        tournamentId,
        player1Name: player1Name.trim(),
        player2Name: player2Name.trim(),
        contactPhone: contactPhone.trim(),
        notes: notes.trim(),
        availability,
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
          <span className="font-black text-lg" style={{ color: "#173A2E" }}>Inscripción</span>
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
                <div className="-mx-6 -mt-6 mb-5 overflow-hidden rounded-t-[22px] flex items-center justify-center"
                  style={{ height: 240, background: "#0F2D22" }}>
                  <img src={info.coverImage} alt="" className="w-full h-full object-contain" />
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
                {info.venueName && (
                  <p className="text-sm font-bold mt-1 flex items-center gap-1.5" style={{ color: "#2F8FCF" }}>
                    <Building2 size={14} /> {info.venueName}
                  </p>
                )}
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

              {info.rules && (
                <button onClick={() => setRulesOpen(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border mb-4 transition-opacity hover:opacity-80"
                  style={{ borderColor: "#A8C6F0", background: "#EBF2FF", color: "#4A78C0" }}>
                  <FileText size={15} /> Leer reglamento del torneo
                </button>
              )}

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

                    {slots.length === 0 && !adding && (
                      <div className="text-center py-4 rounded-xl" style={{ background: "#F6FBF8" }}>
                        <p className="text-xs font-semibold" style={{ color: "#9BB8AE" }}>Sin horarios cargados</p>
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      {slots.map((s, i) => (
                        <div key={i} className="flex items-center justify-between rounded-xl border px-3 py-2.5"
                          style={{ background: "#F0FAF5", borderColor: "#B7DFBF" }}>
                          <div>
                            <p className="text-[10px] font-black uppercase" style={{ color: "#5F7D72" }}>{s.dayLabel}</p>
                            <p className="text-sm font-black" style={{ color: "#173A2E" }}>Desde las {s.from} hasta las {s.to}</p>
                          </div>
                          <button onClick={() => setSlots((prev) => prev.filter((_, j) => j !== i))}
                            className="rounded-full p-1.5" style={{ background: "#FFF1F1" }}>
                            <X size={12} style={{ color: "#B24343" }} />
                          </button>
                        </div>
                      ))}
                    </div>

                    {adding && (
                      <div className="rounded-xl border p-3 mt-2 flex flex-col gap-2.5" style={{ borderColor: "#CFE7DC", background: "#F6FBF8" }}>
                        <div>
                          <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>Día</label>
                          <select value={newDay} onChange={(e) => setNewDay(e.target.value)}
                            className="w-full border rounded-xl px-3 py-2 text-sm bg-white" style={{ borderColor: "#CFE7DC" }}>
                            {dayOptions.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>Desde</label>
                            <input type="time" value={newFrom} onChange={(e) => setNewFrom(e.target.value)}
                              className="w-full border rounded-xl px-3 py-2 text-sm bg-white" style={{ borderColor: "#CFE7DC" }} />
                          </div>
                          <div className="flex-1">
                            <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>Hasta</label>
                            <input type="time" value={newTo} onChange={(e) => setNewTo(e.target.value)}
                              className="w-full border rounded-xl px-3 py-2 text-sm bg-white" style={{ borderColor: "#CFE7DC" }} />
                          </div>
                        </div>
                        {slotError && <p className="text-xs font-semibold" style={{ color: "#B24343" }}>{slotError}</p>}
                        <div className="flex gap-2">
                          <button onClick={() => { setAdding(false); setSlotError(""); }}
                            className="flex-1 py-2 rounded-xl text-sm font-bold border" style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}>
                            Cancelar
                          </button>
                          <button onClick={addSlot} className="flex-1 py-2 rounded-xl text-sm font-bold text-white" style={{ background: "#0B8457" }}>
                            Agregar
                          </button>
                        </div>
                      </div>
                    )}

                    {!adding && (
                      <button onClick={() => setAdding(true)}
                        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border text-sm font-bold mt-2"
                        style={{ borderColor: "#CFE7DC", color: "#0B8457", background: "#F6FBF8", borderStyle: "dashed" }}>
                        <Plus size={14} /> Agregar horario
                      </button>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>
                    Observaciones para el organizador (opcional)
                  </label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none" style={{ borderColor: "#CFE7DC" }}
                    placeholder="Ej: llegamos 15 min tarde el primer día" />
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

      {rulesOpen && info?.rules && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setRulesOpen(false)}>
          <div className="w-full max-w-md rounded-[22px] p-6 shadow-xl max-h-[80vh] overflow-y-auto" style={{ background: "#FFFFFF" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-base" style={{ color: "#173A2E" }}>Reglamento del torneo</h3>
              <button onClick={() => setRulesOpen(false)}><X size={18} style={{ color: "#5F7D72" }} /></button>
            </div>
            <RulesText text={info.rules} />
          </div>
        </div>
      )}
    </div>
  );
}
