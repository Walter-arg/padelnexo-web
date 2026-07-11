"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter, useParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Users, DollarSign,
  X, Save, RefreshCw, Eye, Archive, Shield,
  MapPin, Clock, ChevronLeft, Trophy,
  Contact, Swords, Wallet,
} from "lucide-react";

type Tab = "jugadores" | "fixture" | "posiciones" | "pagos";

const DAY_LABELS: Record<string, string> = {
  monday: "Lunes", tuesday: "Martes", wednesday: "Miércoles",
  thursday: "Jueves", friday: "Viernes", saturday: "Sábado", sunday: "Domingo",
};

// ── Tabla de posiciones ────────────────────────────────────────────────────
function buildStandings(liga: any) {
  const sc = liga.scoringSettings ?? {};
  const pointsWin  = sc.pointsWin  ?? 3;
  const pointsLoss = sc.pointsLoss ?? 1;
  const penaltyPts   = sc.replacementPenalty ?? 1;
  const penaltyQuota = sc.replacementQuota   ?? 0;

  const table: Record<string, any> = {};
  const init = (id: string, nombre: string) => {
    if (!table[id]) table[id] = { id, nombre, pj:0, pg:0, pp:0, sf:0, sc2:0, gf:0, gc:0, pts:0, pen:0 };
  };
  const repUses: Record<string, number> = {};
  (liga.fixture?.rounds ?? []).forEach((r: any) =>
    (r.matches ?? []).forEach((m: any) =>
      Object.keys(m.replacements ?? {}).forEach(k => {
        const tid = k.startsWith("teamA") ? m.teamA?.id : m.teamB?.id;
        if (tid) repUses[tid] = (repUses[tid] ?? 0) + 1;
      })
    )
  );
  (liga.fixture?.rounds ?? []).forEach((round: any) => {
    (round.matches ?? []).forEach((m: any) => {
      const res = m.result;
      if (!res?.winner || res.winner === "") return;
      const aId = m.teamA?.id ?? m.pair1Id ?? "A";
      const bId = m.teamB?.id ?? m.pair2Id ?? "B";
      init(aId, m.teamA?.label ?? m.pair1Name ?? "A");
      init(bId, m.teamB?.label ?? m.pair2Name ?? "B");
      let asets=0, bsets=0, ag=0, bg=0;
      (res.sets ?? []).forEach((s: any) => {
        const o = parseInt(s.own??"0"), r2 = parseInt(s.rival??"0");
        if (res.winner==="teamA") { ag+=o; bg+=r2; if(o>r2)asets++; else bsets++; }
        else { bg+=o; ag+=r2; if(o>r2)bsets++; else asets++; }
      });
      if (!res.sets?.length && res.score) {
        res.score.split(" ").forEach((set: string) => {
          const [p1,p2] = set.split("-").map(Number);
          if(!isNaN(p1)&&!isNaN(p2)){ ag+=p1; bg+=p2; if(p1>p2)asets++; else bsets++; }
        });
      }
      if (res.reason==="walkover"||res.winner==="walkover") {
        const wp = sc.pointsWalkoverWin ?? pointsWin;
        if(res.winner==="teamA"){ table[aId].pg++; table[aId].pts+=wp; table[bId].pp++; }
        else { table[bId].pg++; table[bId].pts+=wp; table[aId].pp++; }
      } else {
        if(res.winner==="teamA"){ table[aId].pg++; table[aId].pts+=pointsWin; table[bId].pp++; table[bId].pts+=pointsLoss; }
        else { table[bId].pg++; table[bId].pts+=pointsWin; table[aId].pp++; table[aId].pts+=pointsLoss; }
      }
      table[aId].pj++; table[aId].sf+=asets; table[aId].sc2+=bsets; table[aId].gf+=ag; table[aId].gc+=bg;
      table[bId].pj++; table[bId].sf+=bsets; table[bId].sc2+=asets; table[bId].gf+=bg; table[bId].gc+=ag;
    });
  });
  Object.entries(repUses).forEach(([tid, uses]) => {
    if(uses>penaltyQuota && table[tid]){
      table[tid].pen = (uses-penaltyQuota)*penaltyPts;
      table[tid].pts = Math.max(0, table[tid].pts - table[tid].pen);
    }
  });
  return Object.values(table).sort((a,b)=>b.pts-a.pts||(b.sf-b.sc2)-(a.sf-a.sc2)||(b.gf-b.gc)-(a.gf-a.gc));
}

function StandingsTable({rows}: {rows:any[]}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100 text-xs font-bold text-pn-green uppercase">
          <th className="px-5 py-2 text-left w-6">#</th>
          <th className="px-2 py-2 text-left">Nombre</th>
          <th className="px-2 py-2 text-center">Pts</th>
          <th className="px-2 py-2 text-center">R</th>
          <th className="px-2 py-2 text-center">PJ</th>
          <th className="px-2 py-2 text-center">PG</th>
          <th className="px-2 py-2 text-center">PP</th>
          <th className="px-2 py-2 text-center hidden sm:table-cell">SF</th>
          <th className="px-2 py-2 text-center hidden sm:table-cell">SC</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map((r,i)=>(
          <tr key={i} className={i===0?"bg-pn-mint/30":""}>
            <td className="px-5 py-2.5 text-xs font-black text-gray-400">{i+1}</td>
            <td className="px-2 py-2.5 font-semibold text-pn-navy text-sm">
              {i===0&&<Shield size={11} className="inline mr-1 text-pn-green"/>}{r.nombre}
            </td>
            <td className="px-2 py-2.5 text-center font-black text-pn-green">{r.pts}</td>
            <td className="px-2 py-2.5 text-center text-xs text-gray-400">{r.pen>0?`-${r.pen}`:"-"}</td>
            <td className="px-2 py-2.5 text-center text-xs text-gray-400">{r.pj}</td>
            <td className="px-2 py-2.5 text-center text-xs text-pn-green font-semibold">{r.pg}</td>
            <td className="px-2 py-2.5 text-center text-xs text-red-400">{r.pp}</td>
            <td className="px-2 py-2.5 text-center text-xs text-gray-400 hidden sm:table-cell">{r.sf}</td>
            <td className="px-2 py-2.5 text-center text-xs text-gray-400 hidden sm:table-cell">{r.sc2}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Modal resultado ────────────────────────────────────────────────────────
function ResultModal({ match, matchFormat, onClose, onSave }: any) {
  const [winner, setWinner] = useState(match.result?.winner ?? "");
  const [sets, setSets] = useState<{own:string;rival:string}[]>(
    match.result?.sets?.length
      ? match.result.sets
      : [{ own:"", rival:"" }, { own:"", rival:"" }, { own:"", rival:"" }]
  );
  const [saving, setSaving] = useState(false);
  const aLabel = match.teamA?.label ?? match.pair1Name ?? "Pareja A";
  const bLabel = match.teamB?.label ?? match.pair2Name ?? "Pareja B";
  const maxSets = matchFormat==="single_set" ? 1 : matchFormat==="two_sets_super_tiebreak" ? 2 : 3;

  async function handleSave() {
    if (!winner) return;
    setSaving(true);
    const setsToSave = winner==="walkover" ? [] : sets.slice(0,maxSets).filter(s=>s.own!==""||s.rival!=="");
    await onSave({ winner, score: setsToSave.map(s=>`${s.own}-${s.rival}`).join(" "), reason: winner==="walkover"?"walkover":"normal", sets: setsToSave });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl p-7 w-full max-w-md shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-black text-pn-navy text-lg">Cargar resultado</h3>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ganador</label>
        <div className="flex flex-col gap-2 mb-5">
          {[{v:"teamA",l:aLabel},{v:"teamB",l:bLabel},{v:"walkover",l:"Walkover"}].map(opt=>(
            <button key={opt.v} onClick={()=>setWinner(opt.v)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm font-semibold text-left transition-all ${winner===opt.v?"border-pn-green bg-pn-mint text-pn-navy":"border-gray-100 text-gray-600 hover:border-gray-200"}`}>
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${winner===opt.v?"bg-pn-green border-pn-green":"border-gray-300"}`}/>
              {opt.l}
            </button>
          ))}
        </div>
        {winner && winner!=="walkover" && (
          <>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Sets</label>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 gap-y-2 items-center mb-5">
              <div className="text-right text-xs font-bold text-pn-navy truncate">{aLabel.split(" / ")[0]}</div>
              <div />
              <div className="text-xs font-bold text-pn-navy truncate">{bLabel.split(" / ")[0]}</div>
              {Array.from({length:maxSets}).map((_,i)=>(
                <>
                  <input key={`a${i}`} value={sets[i]?.own??""} onChange={e=>setSets(p=>p.map((s,j)=>j===i?{...s,own:e.target.value}:s))}
                    className="w-full text-center border-2 border-gray-100 rounded-xl py-2 text-base font-black focus:outline-none focus:border-pn-green"
                    placeholder="0" type="number" min="0" max="99"/>
                  <span key={`d${i}`} className="text-center text-gray-300 font-black text-lg">—</span>
                  <input key={`b${i}`} value={sets[i]?.rival??""} onChange={e=>setSets(p=>p.map((s,j)=>j===i?{...s,rival:e.target.value}:s))}
                    className="w-full text-center border-2 border-gray-100 rounded-xl py-2 text-base font-black focus:outline-none focus:border-pn-green"
                    placeholder="0" type="number" min="0" max="99"/>
                </>
              ))}
            </div>
          </>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-gray-100 text-sm font-bold text-gray-500">Cancelar</button>
          <button onClick={handleSave} disabled={!winner||saving}
            className="flex-1 py-3 rounded-xl bg-pn-green text-white text-sm font-black disabled:opacity-50 flex items-center justify-center gap-2">
            <Save size={15}/>{saving?"Guardando...":"Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────────────────
export default function LigaDetailPage() {
  const router = useRouter();
  const params = useParams();
  const ligaId = params.id as string;

  const [liga, setLiga]   = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]     = useState<Tab>("jugadores");
  const [resultModal, setResultModal] = useState<{ri:number;mi:number}|null>(null);
  const [comprobanteUrl, setComprobanteUrl] = useState<string|null>(null);

  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, async(u)=>{
      if(!u){router.push("/login");return;}
      const snap = await getDoc(doc(db,"leagues",ligaId));
      if(snap.exists()) setLiga({id:snap.id,...snap.data()});
      setLoading(false);
    });
    return unsub;
  },[ligaId,router]);

  async function saveResult(ri:number,mi:number,result:any){
    const rounds=(liga.fixture?.rounds??[]).map((r:any,i:number)=>
      i!==ri?r:{...r,matches:r.matches.map((m:any,j:number)=>j!==mi?m:{...m,result})}
    );
    await updateDoc(doc(db,"leagues",ligaId),{"fixture.rounds":rounds});
    setLiga((p:any)=>({...p,fixture:{...p.fixture,rounds}}));
    setResultModal(null);
  }

  if(loading) return (
    <DashboardLayout title="">
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-pn-green border-t-transparent rounded-full animate-spin"/>
      </div>
    </DashboardLayout>
  );
  if(!liga) return (
    <DashboardLayout title="">
      <p className="text-center py-20 text-gray-400">Liga no encontrada.</p>
    </DashboardLayout>
  );

  const players: any[]       = liga.players ?? [];
  const rounds: any[]        = liga.fixture?.rounds ?? [];
  const roundPayments: any[] = liga.roundPayments ?? [];
  const standings            = buildStandings(liga);
  const matchFormat          = liga.matchFormat ?? "three_full_sets";
  const isIndividual         = liga.teamType === "individual";
  const logoUrl              = liga.organizerLogoUrl || liga.organizerLogoURL || liga.complejo?.organizerLogoUrl || liga.complejo?.organizerLogoURL;

  const allEntries  = roundPayments.flatMap((rp:any)=>rp.entries??[]);
  const cntReview   = allEntries.filter((e:any)=>e.paymentStatus==="informo_transferencia"||e.paymentStatus==="in_review").length;
  const cntPagado   = allEntries.filter((e:any)=>e.paymentStatus==="pagado"||e.paymentStatus==="paid").length;
  const completedRounds = rounds.filter((r:any)=>!!r.completedAtMillis).length;

  const modules = [
    {
      id: "jugadores" as Tab,
      label: "Jugadores",
      icon: Contact,
      color: "bg-blue-500",
      lightBg: "bg-blue-50",
      lightText: "text-blue-600",
      badge: players.length > 0 ? `${players.length} inscriptos` : "Sin jugadores",
    },
    {
      id: "fixture" as Tab,
      label: "Fixture",
      icon: Swords,
      color: "bg-amber-500",
      lightBg: "bg-amber-50",
      lightText: "text-amber-600",
      badge: rounds.length > 0 ? `${completedRounds}/${rounds.length} fechas` : "Sin fechas",
    },
    {
      id: "posiciones" as Tab,
      label: "Puntajes",
      icon: Trophy,
      color: "bg-violet-500",
      lightBg: "bg-violet-50",
      lightText: "text-violet-600",
      badge: standings.length > 0 ? `${standings.length} equipos` : "Sin resultados",
    },
    {
      id: "pagos" as Tab,
      label: "Pagos",
      icon: Wallet,
      color: "bg-emerald-500",
      lightBg: "bg-emerald-50",
      lightText: "text-emerald-600",
      badge: cntReview > 0 ? `${cntReview} a verificar` : cntPagado > 0 ? `${cntPagado} pagados` : "Sin cobros",
    },
  ];

  const activeModule = modules.find(m => m.id === tab)!;

  return (
    <DashboardLayout title="">

      {/* Volver */}
      <a href="/dashboard/ligas" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-pn-navy transition-colors mb-5">
        <ChevronLeft size={16}/> Mis ligas
      </a>

      {/* ── Layout dos columnas ── */}
      <div className="flex gap-6 items-start">

        {/* ══ PANEL IZQUIERDO (sticky) ══════════════════════════════════ */}
        <aside className="hidden lg:flex flex-col gap-4 w-72 flex-shrink-0 sticky top-20">

          {/* Card info liga */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">

            {/* Logo */}
            <div className="flex justify-center mb-5">
              {logoUrl
                ? <img src={logoUrl} className="w-20 h-20 rounded-3xl object-cover shadow-md" alt="logo"/>
                : <div className="w-20 h-20 rounded-3xl bg-blue-50 flex items-center justify-center shadow-md">
                    <Trophy size={36} className="text-blue-400"/>
                  </div>
              }
            </div>

            {/* Nombre */}
            <h1 className="font-black text-pn-navy text-xl text-center leading-tight mb-1">{liga.nombre}</h1>

            {/* Badges */}
            <div className="flex flex-wrap justify-center gap-1.5 mb-5">
              {liga.categoria && (
                <span className="text-xs bg-blue-50 text-blue-600 font-semibold px-2.5 py-1 rounded-full">{liga.categoria}</span>
              )}
              <span className="text-xs bg-slate-100 text-gray-500 font-semibold px-2.5 py-1 rounded-full">
                {liga.sexo === "Masculino" ? "Caballeros" : liga.sexo === "Femenino" ? "Damas" : liga.sexo}
              </span>
              <span className="text-xs bg-slate-100 text-gray-500 font-semibold px-2.5 py-1 rounded-full">
                {liga.teamType === "pair" ? "Parejas" : "Individual"}
              </span>
            </div>

            {/* Info rows */}
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-center gap-3 text-gray-600">
                <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0">
                  <Users size={15} className="text-gray-400"/>
                </div>
                <span><span className="font-bold text-pn-navy">{players.length}</span> jugadores</span>
              </div>

              {liga.scheduleConfig?.dayKey && (
                <div className="flex items-center gap-3 text-gray-600">
                  <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0">
                    <Clock size={15} className="text-gray-400"/>
                  </div>
                  <span>
                    <span className="font-bold text-pn-navy">{DAY_LABELS[liga.scheduleConfig.dayKey]}</span>
                    {liga.scheduleConfig.timeSlots?.length > 0 && ` · ${liga.scheduleConfig.timeSlots.join(" / ")}`}
                  </span>
                </div>
              )}

              {liga.complejo?.nombre && liga.complejo.nombre !== "Complejo sin definir" && (
                <div className="flex items-center gap-3 text-gray-600">
                  <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0">
                    <MapPin size={15} className="text-gray-400"/>
                  </div>
                  <span className="font-bold text-pn-navy truncate">{liga.complejo.nombre}</span>
                </div>
              )}

              {rounds.length > 0 && (
                <div className="flex items-center gap-3 text-gray-600">
                  <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0">
                    <Clock size={15} className="text-gray-400"/>
                  </div>
                  <span>
                    <span className="font-bold text-pn-navy">{completedRounds}/{rounds.length}</span> fechas completadas
                  </span>
                </div>
              )}
            </div>

            {/* Estado / archivar */}
            <div className="mt-5 pt-5 border-t border-gray-100">
              {liga.status === "active" ? (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-pn-green">
                    <span className="w-2 h-2 rounded-full bg-pn-green animate-pulse"/> Activa
                  </span>
                  <button
                    onClick={async()=>{
                      if(confirm("¿Archivar esta liga?"))
                        await updateDoc(doc(db,"leagues",ligaId),{status:"archived"})
                          .then(()=>setLiga((p:any)=>({...p,status:"archived"})));
                    }}
                    className="flex items-center gap-1 text-xs text-gray-300 hover:text-red-400 transition-colors"
                  >
                    <Archive size={13}/> Archivar
                  </button>
                </div>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-bold text-gray-400">
                  <Archive size={12}/> Archivada
                </span>
              )}
            </div>
          </div>
        </aside>

        {/* ══ CONTENIDO PRINCIPAL ═══════════════════════════════════════ */}
        <div className="flex-1 min-w-0">

          {/* Header mobile (solo en pantallas pequeñas) */}
          <div className="lg:hidden bg-white rounded-2xl p-4 mb-5 flex items-center gap-4 shadow-sm border border-gray-100">
            {logoUrl
              ? <img src={logoUrl} className="w-14 h-14 rounded-2xl object-cover flex-shrink-0"/>
              : <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Trophy size={24} className="text-blue-400"/>
                </div>
            }
            <div className="flex-1 min-w-0">
              <h1 className="font-black text-pn-navy text-base leading-tight truncate">{liga.nombre}</h1>
              <div className="flex flex-wrap gap-1 mt-1">
                {liga.categoria && <span className="text-xs bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded-full">{liga.categoria}</span>}
                <span className="text-xs bg-slate-100 text-gray-500 font-semibold px-2 py-0.5 rounded-full">{liga.sexo}</span>
              </div>
            </div>
          </div>

          {/* ── Grid 2x2 de módulos ── */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {modules.map(m => {
              const isActive = tab === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setTab(m.id)}
                  className={`group relative rounded-2xl p-5 text-left transition-all duration-200 border-2 ${
                    isActive
                      ? `${m.lightBg} border-current ${m.lightText} shadow-md`
                      : "bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm"
                  }`}
                >
                  {/* Indicador activo */}
                  {isActive && (
                    <div className={`absolute top-3 right-3 w-2 h-2 rounded-full ${m.color}`}/>
                  )}

                  {/* Ícono */}
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 transition-all ${
                    isActive ? m.color : "bg-slate-100 group-hover:bg-slate-200"
                  }`}>
                    <m.icon size={22} className={isActive ? "text-white" : "text-gray-500"} />
                  </div>

                  <div className={`font-black text-base mb-0.5 ${isActive ? "" : "text-pn-navy"}`}>
                    {m.label}
                  </div>
                  <div className={`text-xs font-medium ${isActive ? "opacity-70" : "text-gray-400"}`}>
                    {m.badge}
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Contenido de la sección activa ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

            {/* Header sección */}
            <div className={`px-6 py-4 flex items-center gap-3 border-b border-gray-100 ${activeModule.lightBg}`}>
              <div className={`w-9 h-9 rounded-xl ${activeModule.color} flex items-center justify-center`}>
                <activeModule.icon size={18} className="text-white"/>
              </div>
              <h2 className={`font-black text-lg ${activeModule.lightText}`}>{activeModule.label}</h2>
            </div>

            <div className="p-6">

              {/* ── JUGADORES ─────────────────────────────────────────── */}
              {tab==="jugadores" && (
                <div>
                  {players.length === 0 && (
                    <p className="text-center text-gray-400 py-12">No hay jugadores inscriptos.</p>
                  )}
                  {isIndividual && players.length > 0 && (
                    <div className="flex gap-6 text-sm font-bold text-pn-green mb-4 px-1">
                      <span>Drive {players.filter((p:any)=>p.ladoJuego==="drive").length}/{Math.ceil(players.length/2)}</span>
                      <span>Reves {players.filter((p:any)=>p.ladoJuego==="reves").length}/{Math.floor(players.length/2)}</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    {liga.teamType==="pair"
                      ? (() => {
                          const pares: Record<number,any[]> = {};
                          players.forEach((p:any)=>{ const n=p.pairNumber??0; if(!pares[n])pares[n]=[]; pares[n].push(p); });
                          return Object.entries(pares).sort(([a],[b])=>Number(a)-Number(b)).map(([num,pp])=>(
                            <div key={num} className="rounded-2xl overflow-hidden border border-gray-100">
                              <div className="px-4 py-2 bg-gray-50 text-xs font-bold text-gray-400">Pareja {num}</div>
                              {pp.map((p:any,i:number)=>(
                                <div key={i} className="flex items-center gap-3 px-4 py-3 border-t border-gray-50 first:border-0">
                                  {p.foto
                                    ? <img src={p.foto} className="w-10 h-10 rounded-full object-cover flex-shrink-0"/>
                                    : <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center font-black text-blue-500 text-sm flex-shrink-0">{(p.nombre?.[0]??"?").toUpperCase()}</div>}
                                  <div className="flex-1 min-w-0">
                                    <div className="font-bold text-pn-navy text-sm">{p.nombre} {p.apellido??""}</div>
                                    <div className="text-xs text-gray-400">{p.categoria}{p.ciudad?` · ${p.ciudad}`:""}</div>
                                  </div>
                                  {p.type==="guest" && <span className="text-xs bg-amber-50 text-amber-500 font-semibold px-2 py-0.5 rounded-full">Invitado</span>}
                                </div>
                              ))}
                            </div>
                          ));
                        })()
                      : players.map((p:any,i:number)=>(
                          <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-gray-100">
                            {p.foto
                              ? <img src={p.foto} className="w-10 h-10 rounded-full object-cover flex-shrink-0"/>
                              : <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center font-black text-blue-500 text-sm flex-shrink-0">{(p.nombre?.[0]??"?").toUpperCase()}</div>}
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-pn-navy text-sm">{p.nombre} {p.apellido??""}</div>
                              <div className="text-xs text-gray-400">{p.ladoJuego?`${p.ladoJuego.charAt(0).toUpperCase()+p.ladoJuego.slice(1)} · `:""}{p.categoria}{p.ciudad?` · ${p.ciudad}`:""}</div>
                            </div>
                            {p.type==="guest" && <span className="text-xs bg-amber-50 text-amber-500 font-semibold px-2 py-0.5 rounded-full">Invitado</span>}
                          </div>
                        ))
                    }
                  </div>
                </div>
              )}

              {/* ── FIXTURE ───────────────────────────────────────────── */}
              {tab==="fixture" && (
                <div className="flex flex-col gap-4">
                  {rounds.length===0 && <p className="text-center text-gray-400 py-12">El fixture todavía no fue generado.</p>}
                  {rounds.map((round:any,ri:number)=>{
                    const isSusp = !!round.suspendedAtMillis;
                    const isDone = !!round.completedAtMillis;
                    return (
                      <div key={ri} className="rounded-2xl overflow-hidden border border-gray-100">
                        <div className={`px-5 py-3 flex items-center justify-between ${isSusp?"bg-amber-50":isDone?"bg-pn-mint":"bg-gray-50"}`}>
                          <span className="font-black text-pn-navy text-base uppercase tracking-wide">
                            {round.title??`Fecha ${round.number??ri+1}`}
                          </span>
                          <span className={`flex items-center gap-1.5 text-xs font-bold ${isSusp?"text-amber-500":isDone?"text-pn-green":"text-gray-400"}`}>
                            <span className={`w-2 h-2 rounded-full ${isSusp?"bg-amber-400":isDone?"bg-pn-green":"bg-gray-300"}`}/>
                            {isSusp?"SUSPENDIDA":isDone?"COMPLETADA":"PENDIENTE"}
                          </span>
                        </div>
                        {round.scheduleLabel && (
                          <div className="px-5 py-1.5 text-xs text-gray-400 bg-gray-50 border-b border-gray-100">{round.scheduleLabel}</div>
                        )}
                        {(round.matches??[]).length>0 && (
                          <div className="grid text-xs font-bold text-pn-green uppercase px-4 py-2 border-b border-gray-100"
                            style={{gridTemplateColumns:"90px 1fr 52px 52px 32px"}}>
                            <div>Resultado</div><div className="text-center">Parejas</div>
                            <div className="text-center">Día</div><div className="text-center">Hora</div><div/>
                          </div>
                        )}
                        <div className="divide-y divide-gray-50">
                          {(round.matches??[]).map((m:any,mi:number)=>{
                            const aLabel=m.teamA?.label??m.pair1Name??"Pareja A";
                            const bLabel=m.teamB?.label??m.pair2Name??"Pareja B";
                            const res=m.result;
                            const hasRes=res?.winner&&res.winner!=="";
                            const aWon=res?.winner==="teamA";
                            const bWon=res?.winner==="teamB";
                            const isWO=res?.reason==="walkover"||res?.winner==="walkover";
                            const dia=m.dayLabel??round.scheduleConfig?.dayKey??null;
                            const hora=m.timeSlot??null;
                            const hasRep=Object.keys(m.replacements??{}).length>0;
                            return (
                              <div key={mi} className="grid items-center px-4 py-3 hover:bg-gray-50/50 transition-colors"
                                style={{gridTemplateColumns:"90px 1fr 52px 52px 32px"}}>
                                <div>
                                  {hasRes
                                    ? <button onClick={()=>setResultModal({ri,mi})} className={`text-sm font-bold ${isWO?"text-amber-500":"text-pn-green"} hover:underline text-left`}>{isWO?"WO":res.score||"✓"}</button>
                                    : <button onClick={()=>setResultModal({ri,mi})} className="text-sm font-bold text-gray-400 hover:text-pn-green transition-colors">Pendiente</button>}
                                </div>
                                <div className="text-center px-2">
                                  <div className={`text-sm font-bold truncate ${aWon?"text-pn-green":"text-pn-navy"}`}>{aWon&&"👍 "}{aLabel}</div>
                                  <div className="text-xs text-gray-300 my-0.5">—</div>
                                  <div className={`text-sm font-bold truncate ${bWon?"text-pn-green":"text-pn-navy"}`}>{bWon&&"👍 "}{bLabel}</div>
                                </div>
                                <div className="text-center text-xs font-bold text-blue-500">{dia?DAY_LABELS[dia]??dia:""}</div>
                                <div className="text-center text-xs font-bold text-blue-500">{hora??""}</div>
                                <div className="text-center">{hasRep&&<RefreshCw size={13} className="text-amber-400 mx-auto"/>}</div>
                              </div>
                            );
                          })}
                          {(!round.matches||round.matches.length===0) && (
                            <div className="px-4 py-3 text-sm text-gray-400 italic">Sin partidos</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── PUNTAJES ──────────────────────────────────────────── */}
              {tab==="posiciones" && (
                <div>
                  {standings.length===0
                    ? <p className="text-center text-gray-400 py-12">Todavía no hay resultados.</p>
                    : <>
                        {isIndividual
                          ? ["drive","reves"].map(lado=>{
                              const rows=standings.filter(r=>players.find((p:any)=>(p.teamA?.id===r.id||p.id===r.id)&&p.ladoJuego===lado));
                              if(rows.length===0) return null;
                              return (
                                <div key={lado} className="rounded-2xl overflow-hidden border border-gray-100 mb-4">
                                  <div className="px-5 py-3 font-black text-pn-navy capitalize bg-gray-50">{lado==="drive"?"Drive":"Reves"}</div>
                                  <StandingsTable rows={rows}/>
                                </div>
                              );
                            })
                          : <div className="rounded-2xl overflow-hidden border border-gray-100">
                              <StandingsTable rows={standings}/>
                            </div>
                        }
                        <div className="flex gap-3 mt-3 text-xs text-gray-400 flex-wrap">
                          {[["Pts","Puntos"],["R","Reemplazos"],["PJ","Jugados"],["PG","Ganados"]].map(([k,v])=>(
                            <span key={k}><b>{k}</b>: {v}</span>
                          ))}
                        </div>
                      </>
                  }
                </div>
              )}

              {/* ── PAGOS ─────────────────────────────────────────────── */}
              {tab==="pagos" && (
                <div>
                  {liga.paymentConfig && (
                    <div className="flex gap-5 flex-wrap mb-4 text-sm">
                      {liga.paymentConfig.registrationFeeEnabled && (
                        <span className="text-pn-navy font-bold">Inscripción: <span className="text-pn-green">$ {liga.paymentConfig.registrationFeeAmount}</span></span>
                      )}
                      {liga.paymentConfig.roundPricePerPlayer > 0 && (
                        <span className="text-pn-navy font-bold">Por fecha: <span className="text-pn-green">$ {liga.paymentConfig.roundPricePerPlayer}</span></span>
                      )}
                    </div>
                  )}
                  {allEntries.length > 0 && (
                    <div className="flex gap-2 mb-5 flex-wrap">
                      <span className="border-2 border-pn-green text-pn-green text-xs font-bold px-4 py-1.5 rounded-full">Pagados {cntPagado}</span>
                      <span className="border-2 border-amber-400 text-amber-500 text-xs font-bold px-4 py-1.5 rounded-full">Verificar {cntReview}</span>
                      <span className="border-2 border-gray-200 text-gray-400 text-xs font-bold px-4 py-1.5 rounded-full">
                        Impagos {allEntries.length - cntPagado - cntReview}
                      </span>
                    </div>
                  )}
                  {rounds.length===0 && roundPayments.length===0 && (
                    <p className="text-center text-gray-400 py-12">No hay pagos configurados.</p>
                  )}
                  <div className="flex flex-col gap-4">
                    {rounds.map((round:any,ri:number)=>{
                      const rp=roundPayments.find((r:any)=>r.roundId===round.id||r.roundId===`round-${round.number??ri+1}`);
                      const entries: any[]=rp?.entries??[];
                      return (
                        <div key={ri} className="rounded-2xl overflow-hidden border border-gray-100">
                          <div className="bg-pn-navy px-5 py-3 flex items-center justify-between">
                            <span className="font-black text-white uppercase tracking-wide text-sm">{round.title??`Fecha ${round.number??ri+1}`}</span>
                            {liga.paymentConfig?.roundPricePerPlayer>0 && (
                              <span className="text-xs text-gray-400">$ {liga.paymentConfig.roundPricePerPlayer} / jugador</span>
                            )}
                          </div>
                          {entries.length>0 && (
                            <div className="grid text-xs font-bold text-pn-green uppercase px-4 py-2 border-b border-gray-100"
                              style={{gridTemplateColumns:"1fr 90px 60px 60px 70px 40px"}}>
                              <div>Jugador</div><div className="text-center">Estado</div>
                              <div className="text-center">Modo</div><div className="text-center">Comp.</div>
                              <div className="text-right">$</div><div/>
                            </div>
                          )}
                          <div className="divide-y divide-gray-50">
                            {entries.map((entry:any,ei:number)=>{
                              const status=entry.paymentStatus??"pendiente";
                              const isPagado=status==="pagado"||status==="paid";
                              const isReview=status==="informo_transferencia"||status==="in_review";
                              return (
                                <div key={ei} className="grid items-center px-4 py-3" style={{gridTemplateColumns:"1fr 90px 60px 60px 70px 40px"}}>
                                  <div className="font-bold text-pn-navy text-sm truncate pr-2">{entry.pairLabel??entry.participantLabel??"Jugador"}</div>
                                  <div className="text-center">
                                    <span className={`text-xs font-bold ${isPagado?"text-pn-green":isReview?"text-amber-500":"text-red-400"}`}>
                                      {isPagado?"Pagado":isReview?"Verificar":"Impago"}
                                    </span>
                                  </div>
                                  <div className="text-center text-xs text-gray-400">
                                    {entry.paymentMethod==="mercado_pago"?"MP":entry.paymentMethod==="efectivo"?"Efec.":entry.paymentMethod||"-"}
                                  </div>
                                  <div className="text-center">
                                    {entry.proofUrl
                                      ? <button onClick={()=>setComprobanteUrl(entry.proofUrl)} className="text-xs text-pn-green font-bold hover:underline flex items-center gap-0.5 mx-auto"><Eye size={11}/>Ver</button>
                                      : <span className="text-xs text-gray-300">-</span>}
                                  </div>
                                  <div className="text-right text-xs font-bold text-pn-navy">
                                    {liga.paymentConfig?.roundPricePerPlayer?`$ ${liga.paymentConfig.roundPricePerPlayer}`:""}
                                  </div>
                                  <div className="flex justify-center">
                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isPagado?"bg-pn-green":isReview?"bg-amber-400":"bg-gray-200"}`}>
                                      <DollarSign size={14} className="text-white"/>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            {entries.length===0 && (
                              <div className="px-4 py-4 text-xs text-gray-400 text-center italic">Sin registros de pago</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

      {/* Modal resultado */}
      {resultModal && (
        <ResultModal
          match={rounds[resultModal.ri]?.matches?.[resultModal.mi]}
          matchFormat={matchFormat}
          onClose={()=>setResultModal(null)}
          onSave={(res:any)=>saveResult(resultModal.ri,resultModal.mi,res)}
        />
      )}

      {/* Modal comprobante */}
      {comprobanteUrl && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={()=>setComprobanteUrl(null)}>
          <div className="relative max-w-sm w-full" onClick={e=>e.stopPropagation()}>
            <img src={comprobanteUrl} className="w-full rounded-2xl shadow-2xl" alt="Comprobante"/>
            <button onClick={()=>setComprobanteUrl(null)} className="absolute top-3 right-3 bg-white/90 rounded-full w-8 h-8 flex items-center justify-center font-black text-lg">×</button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
