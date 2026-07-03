"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter, useParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Users, BarChart2, DollarSign, ChevronLeft,
  CheckCircle2, XCircle, Clock, Grid3X3, GitBranch, Trophy
} from "lucide-react";

type Tab = "inscripciones" | "grupos" | "bracket" | "pagos";

function payBadge(status: string) {
  if (status === "approved" || status === "paid")
    return <span className="flex items-center gap-1 text-green-600 text-xs font-semibold"><CheckCircle2 size={13} />Pagó</span>;
  if (status === "pending_review" || status === "pendingReview")
    return <span className="flex items-center gap-1 text-amber-500 text-xs font-semibold"><Clock size={13} />En revisión</span>;
  if (status === "partial")
    return <span className="flex items-center gap-1 text-blue-500 text-xs font-semibold"><Clock size={13} />Parcial</span>;
  return <span className="flex items-center gap-1 text-red-500 text-xs font-semibold"><XCircle size={13} />Debe</span>;
}

export default function TorneoDetailPage() {
  const router = useRouter();
  const params = useParams();
  const torneoId = params.id as string;

  const [torneo, setTorneo] = useState<any>(null);
  const [grupos, setGrupos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("inscripciones");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push("/login"); return; }
      const snap = await getDoc(doc(db, "tournaments", torneoId));
      if (snap.exists()) setTorneo({ id: snap.id, ...snap.data() });

      // Subcollection grupos (si usa formato de grupos)
      const gSnap = await getDocs(collection(db, "tournaments", torneoId, "groups"));
      if (!gSnap.empty) setGrupos(gSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      setLoading(false);
    });
    return unsub;
  }, [torneoId, router]);

  if (loading) {
    return (
      <DashboardLayout title="Torneos">
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-pn-green border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!torneo) {
    return (
      <DashboardLayout title="Torneos">
        <p className="text-gray-400 text-center py-20">Torneo no encontrado.</p>
      </DashboardLayout>
    );
  }

  const players: any[] = torneo.players ?? torneo.inscripciones ?? [];
  const esGrupos = (torneo.formato ?? torneo.type ?? "").toLowerCase().includes("grup");
  const esBracket = (torneo.formato ?? torneo.type ?? "").toLowerCase().includes("elim") ||
                    (torneo.formato ?? torneo.type ?? "").toLowerCase().includes("bracket");
  const bracket: any[] = torneo.bracket ?? torneo.matches ?? [];

  // Grupos embebidos en el doc si no hay subcollección
  const gruposData = grupos.length > 0 ? grupos : (torneo.groups ?? []);

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "inscripciones", label: "Inscripciones", icon: Users },
    ...(esGrupos || gruposData.length > 0 ? [{ id: "grupos" as Tab, label: "Grupos", icon: Grid3X3 }] : []),
    ...(esBracket || bracket.length > 0   ? [{ id: "bracket" as Tab, label: "Bracket", icon: GitBranch }] : []),
    { id: "pagos", label: "Pagos", icon: DollarSign },
  ];

  const statusColor: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    finished: "bg-blue-100 text-blue-600",
    archived: "bg-gray-100 text-gray-500",
  };

  return (
    <DashboardLayout title="Torneos">
      {/* Header */}
      <div className="mb-6">
        <a href="/dashboard/torneos" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-pn-green mb-4 transition-colors">
          <ChevronLeft size={15} /> Todos los torneos
        </a>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-black text-pn-navy">{torneo.nombre}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-400 flex-wrap">
              {torneo.complejo?.nombre && <span>📍 {torneo.complejo.nombre}</span>}
              {torneo.categoria && <span>🏅 {torneo.categoria}</span>}
              <span><Users size={13} className="inline mr-1" />{players.length} inscriptos</span>
              {torneo.formato && <span>{esGrupos ? <Grid3X3 size={13} className="inline mr-1" /> : <GitBranch size={13} className="inline mr-1" />}{torneo.formato}</span>}
            </div>
          </div>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${statusColor[torneo.status] ?? "bg-green-100 text-green-700"}`}>
            {torneo.status === "active" ? "Activo" : torneo.status === "finished" ? "Finalizado" : "Archivado"}
          </span>
        </div>
      </div>

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
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB INSCRIPCIONES ──────────────────────────────────────── */}
      {tab === "inscripciones" && (
        <div className="flex flex-col gap-2 max-w-2xl">
          {players.length === 0 && (
            <p className="text-gray-400 text-sm">No hay inscripciones todavía.</p>
          )}
          {players.map((p: any, i: number) => {
            const nombre = p.nombre ?? p.name ?? `Participante ${i + 1}`;
            const apellido = p.apellido ?? "";
            const pStatus = p.paymentStatus ?? p.inscripcionStatus ?? "unpaid";
            return (
              <div key={p.id ?? i} className="bg-white rounded-2xl px-5 py-4 border border-gray-100 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center font-black text-amber-600 text-sm flex-shrink-0">
                  {nombre[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-pn-navy text-sm truncate">{nombre} {apellido}</div>
                  {p.pareja && (
                    <div className="text-xs text-gray-400">
                      Pareja: {p.pareja.nombre ?? p.pareja} {p.pareja.apellido ?? ""}
                    </div>
                  )}
                  {p.email && <div className="text-xs text-gray-400">{p.email}</div>}
                  {p.grupo && <div className="text-xs text-gray-400">Grupo {p.grupo}</div>}
                </div>
                {payBadge(pStatus)}
              </div>
            );
          })}
        </div>
      )}

      {/* ── TAB GRUPOS ─────────────────────────────────────────────── */}
      {tab === "grupos" && (
        <div className="flex flex-col gap-6 max-w-2xl">
          {gruposData.length === 0 && (
            <p className="text-gray-400 text-sm">Los grupos todavía no fueron generados.</p>
          )}
          {gruposData.map((g: any, gi: number) => (
            <div key={g.id ?? gi} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-3 bg-slate-50 border-b border-gray-100">
                <span className="font-black text-pn-navy text-sm">{g.nombre ?? `Grupo ${gi + 1}`}</span>
              </div>

              {/* Equipos del grupo */}
              {(g.teams ?? g.players ?? []).length > 0 && (
                <div className="px-5 py-3 border-b border-gray-50">
                  <div className="text-xs font-bold text-gray-400 uppercase mb-2">Equipos</div>
                  <div className="flex flex-col gap-1">
                    {(g.teams ?? g.players ?? []).map((t: any, ti: number) => (
                      <div key={ti} className="text-sm text-pn-navy font-medium">
                        {t.nombre ?? t.name ?? `Equipo ${ti + 1}`}
                        {(t.apellido ?? "") && ` ${t.apellido}`}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Partidos del grupo */}
              <div className="divide-y divide-gray-50">
                {(g.matches ?? []).map((m: any, mi: number) => {
                  const p1 = m.pair1Name ?? m.team1?.nombre ?? m.player1?.nombre ?? "Equipo 1";
                  const p2 = m.pair2Name ?? m.team2?.nombre ?? m.player2?.nombre ?? "Equipo 2";
                  const result = m.result ?? (m.score1 != null ? `${m.score1}-${m.score2}` : null);
                  const [s1, s2] = result ? result.split("-").map(Number) : [null, null];
                  return (
                    <div key={mi} className="px-5 py-3 flex items-center gap-3">
                      <span className={`flex-1 text-right text-sm font-semibold truncate ${s1 != null && s1 > s2! ? "text-pn-navy" : "text-gray-400"}`}>{p1}</span>
                      {result ? (
                        <span className="px-3 py-1 bg-pn-navy text-white text-xs font-black rounded-lg min-w-[52px] text-center">{result}</span>
                      ) : (
                        <span className="px-3 py-1 bg-gray-100 text-gray-300 text-xs font-black rounded-lg min-w-[52px] text-center">vs</span>
                      )}
                      <span className={`flex-1 text-sm font-semibold truncate ${s2 != null && s2 > s1! ? "text-pn-navy" : "text-gray-400"}`}>{p2}</span>
                    </div>
                  );
                })}
                {(g.matches ?? []).length === 0 && (
                  <div className="px-5 py-3 text-sm text-gray-400 italic">Sin partidos todavía</div>
                )}
              </div>

              {/* Posiciones del grupo */}
              {(g.standings ?? []).length > 0 && (
                <div className="px-5 py-3 border-t border-gray-100">
                  <div className="text-xs font-bold text-gray-400 uppercase mb-2">Posiciones</div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400">
                        <th className="text-left pb-1">#</th>
                        <th className="text-left pb-1">Equipo</th>
                        <th className="text-center pb-1">PJ</th>
                        <th className="text-center pb-1">PG</th>
                        <th className="text-center pb-1 font-black text-pn-navy">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.standings.map((s: any, si: number) => (
                        <tr key={si}>
                          <td className="py-0.5 text-gray-400">{si + 1}</td>
                          <td className="py-0.5 font-semibold text-pn-navy">{s.nombre ?? s.name}</td>
                          <td className="py-0.5 text-center text-gray-500">{s.pj ?? 0}</td>
                          <td className="py-0.5 text-center text-green-600">{s.pg ?? 0}</td>
                          <td className="py-0.5 text-center font-black text-pn-navy">{s.pts ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── TAB BRACKET ────────────────────────────────────────────── */}
      {tab === "bracket" && (
        <div className="max-w-2xl">
          {bracket.length === 0 ? (
            <p className="text-gray-400 text-sm">El bracket todavía no fue generado.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {bracket.map((ronda: any, ri: number) => (
                <div key={ri} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="px-5 py-3 bg-slate-50 border-b border-gray-100">
                    <span className="font-black text-pn-navy text-sm">
                      {ronda.nombre ?? ronda.round ?? `Ronda ${ri + 1}`}
                    </span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {(ronda.matches ?? (Array.isArray(ronda) ? ronda : [])).map((m: any, mi: number) => {
                      const p1 = m.pair1Name ?? m.team1?.nombre ?? m.player1?.nombre ?? "TBD";
                      const p2 = m.pair2Name ?? m.team2?.nombre ?? m.player2?.nombre ?? "TBD";
                      const result = m.result ?? (m.score1 != null ? `${m.score1}-${m.score2}` : null);
                      const [s1, s2] = result ? result.split("-").map(Number) : [null, null];
                      return (
                        <div key={mi} className="px-5 py-3.5 flex items-center gap-3">
                          <span className={`flex-1 text-right text-sm font-semibold ${s1 != null && s1 > s2! ? "text-pn-navy" : "text-gray-400"}`}>{p1}</span>
                          {result ? (
                            <span className="px-3 py-1 bg-pn-navy text-white text-xs font-black rounded-lg min-w-[52px] text-center">{result}</span>
                          ) : (
                            <span className="px-3 py-1 bg-gray-100 text-gray-300 text-xs font-black rounded-lg min-w-[52px] text-center">vs</span>
                          )}
                          <span className={`flex-1 text-sm font-semibold ${s2 != null && s2 > s1! ? "text-pn-navy" : "text-gray-400"}`}>{p2}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB PAGOS ───────────────────────────────────────────────── */}
      {tab === "pagos" && (
        <div className="flex flex-col gap-2 max-w-2xl">
          <div className="bg-slate-50 rounded-2xl px-5 py-4 border border-gray-100 mb-2">
            <div className="text-xs font-bold text-gray-500 uppercase mb-1">Configuración de pago</div>
            <div className="flex items-center gap-4 text-sm text-pn-navy flex-wrap">
              {torneo.paymentConfig?.amount && <span className="font-bold">$ {torneo.paymentConfig.amount}</span>}
              {torneo.paymentConfig?.method && <span>Método: {torneo.paymentConfig.method}</span>}
              {torneo.paymentConfig?.type && <span>Tipo: {torneo.paymentConfig.type}</span>}
            </div>
          </div>
          {players.length === 0 && (
            <p className="text-gray-400 text-sm">No hay inscriptos todavía.</p>
          )}
          {players.map((p: any, i: number) => {
            const pStatus = p.paymentStatus ?? p.inscripcionStatus ?? "unpaid";
            return (
              <div key={p.id ?? i} className="bg-white rounded-2xl px-5 py-4 border border-gray-100 flex items-center justify-between">
                <div>
                  <div className="font-bold text-pn-navy text-sm">{p.nombre ?? p.name ?? `Participante ${i+1}`} {p.apellido ?? ""}</div>
                  {p.pareja && <div className="text-xs text-gray-400">Pareja: {p.pareja.nombre ?? p.pareja}</div>}
                </div>
                {payBadge(pStatus)}
              </div>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
