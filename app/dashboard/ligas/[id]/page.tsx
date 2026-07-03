"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter, useParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { Users, Calendar, BarChart2, DollarSign, ChevronLeft, CheckCircle2, XCircle, Clock, Shield, Edit3, X, Save, AlertCircle, RefreshCw, Eye, Archive } from "lucide-react";

type Tab = "jugadores" | "fixture" | "posiciones" | "pagos";

const DAY_LABELS: Record<string, string> = {
  monday: "Lun", tuesday: "Mar", wednesday: "Mié",
  thursday: "Jue", friday: "Vie", saturday: "Sáb", sunday: "Dom",
};

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

// ── Modal resultado ──────────────────────────────────────────────────────
function ResultModal({ match, matchFormat, onClose, onSave }: any) {
  const [winner, setWinner] = useState(match.result?.winner ?? "");
  const [sets, setSets]     = useState<{own:string;rival:string}[]>(
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
    const setsToSave = winner==="walkover" ? [] : sets.slice(0, maxSets).filter(s=>s.own!==""||s.rival!=="");
    await onSave({ winner, score: setsToSave.map(s=>`${s.own}-${s.rival}`).join(" "), reason: winner==="walkover"?"walkover":"normal", sets: setsToSave });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl p-7 w-full max-w-md shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-black text-app-heading text-lg">Cargar resultado</h3>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>

        <label className="block text-xs font-bold text-app-muted uppercase tracking-wider mb-2">Ganador</label>
        <div className="flex flex-col gap-2 mb-5">
          {[{v:"teamA",l:aLabel},{v:"teamB",l:bLabel},{v:"walkover",l:"Walkover"}].map(opt=>(
            <button key={opt.v} onClick={()=>setWinner(opt.v)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm font-semibold text-left transition-all ${winner===opt.v?"border-pn-green bg-pn-mint text-app-heading":"border-gray-100 text-gray-600 hover:border-gray-200"}`}>
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${winner===opt.v?"bg-pn-green border-pn-green":"border-gray-300"}`}/>
              {opt.l}
            </button>
          ))}
        </div>

        {winner && winner!=="walkover" && (
          <>
            <label className="block text-xs font-bold text-app-muted uppercase tracking-wider mb-2">Sets</label>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 gap-y-2 items-center mb-5">
              <div className="text-right text-xs font-bold text-app-heading truncate">{aLabel.split(" / ")[0]}</div>
              <div />
              <div className="text-xs font-bold text-app-heading truncate">{bLabel.split(" / ")[0]}</div>
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

// ── Página principal ─────────────────────────────────────────────────────
export default function LigaDetailPage() {
  const router  = useRouter();
  const params  = useParams();
  const ligaId  = params.id as string;

  const [liga, setLiga]         = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<Tab>("jugadores");
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
    const rounds = (liga.fixture?.rounds??[]).map((r:any,i:number)=>
      i!==ri?r:{...r,matches:r.matches.map((m:any,j:number)=>j!==mi?m:{...m,result})}
    );
    await updateDoc(doc(db,"leagues",ligaId),{"fixture.rounds":rounds});
    setLiga((p:any)=>({...p,fixture:{...p.fixture,rounds}}));
    setResultModal(null);
  }

  if (loading) return (
    <DashboardLayout title="Liga">
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-pn-green border-t-transparent rounded-full animate-spin"/>
      </div>
    </DashboardLayout>
  );
  if (!liga) return <DashboardLayout title="Liga"><p className="text-center py-20 text-app-muted">Liga no encontrada.</p></DashboardLayout>;

  const players: any[]       = liga.players ?? [];
  const rounds: any[]        = liga.fixture?.rounds ?? [];
  const roundPayments: any[] = liga.roundPayments ?? [];
  const standings            = buildStandings(liga);
  const matchFormat          = liga.matchFormat ?? "three_full_sets";
  const isIndividual         = liga.teamType === "individual";

  const tabs = [
    {id:"jugadores" as Tab, label:"Jugadores",  icon:Users},
    {id:"fixture"   as Tab, label:"Fixture",    icon:Calendar},
    {id:"posiciones"as Tab, label:"Puntajes",   icon:BarChart2},
    {id:"pagos"     as Tab, label:"Pagos",      icon:DollarSign},
  ];

  // Contadores pagos
  const allEntries = roundPayments.flatMap((rp:any)=>rp.entries??[]);
  const cntPagado  = allEntries.filter((e:any)=>e.paymentStatus==="pagado"||e.paymentStatus==="paid").length;
  const cntReview  = allEntries.filter((e:any)=>e.paymentStatus==="informo_transferencia"||e.paymentStatus==="in_review").length;
  const cntImpago  = allEntries.filter((e:any)=>!e.paymentStatus||e.paymentStatus==="pendiente").length;

  return (
    <DashboardLayout title={liga.nombre} subtitle={liga.categoria ? `${liga.categoria} · ${liga.sexo}` : liga.sexo}>
      {/* Card info liga (como en la app) */}
      <div className="bg-white rounded-3xl p-5 shadow-sm mb-5 max-w-2xl mx-auto">
        <div className="flex items-center gap-4">
          {liga.organizerLogoUrl
            ? <img src={liga.organizerLogoUrl} className="w-14 h-14 rounded-2xl object-cover flex-shrink-0"/>
            : <div className="w-14 h-14 rounded-2xl bg-pn-mint flex items-center justify-center flex-shrink-0"><span className="text-2xl">🏆</span></div>}
          <div className="flex-1 min-w-0">
            <div className="text-xs text-app-muted flex items-center gap-1">🏅 {liga.categoria} — 👥 {liga.teamType==="pair"?"Parejas":"Individual"}</div>
            {liga.scheduleConfig?.dayKey && (
              <div className="text-xs text-app-muted flex items-center gap-1 mt-0.5">
                🗓 {DAY_LABELS[liga.scheduleConfig.dayKey]} — {liga.scheduleConfig.timeSlots?.join(" / ")}
              </div>
            )}
            {liga.complejo?.nombre && <div className="text-xs text-app-muted mt-0.5">🏢 {liga.complejo.nombre}</div>}
          </div>
          {liga.status==="active"&&(
            <button onClick={async()=>{if(confirm("¿Archivás?"))await updateDoc(doc(db,"leagues",ligaId),{status:"archived"}).then(()=>setLiga((p:any)=>({...p,status:"archived"})))}}
              className="flex-shrink-0 text-xs text-gray-300 hover:text-red-400 transition-colors flex items-center gap-1">
              <Archive size={13}/>
            </button>
          )}
        </div>
        {rounds.length>0&&(
          <div className="mt-3 pt-3 border-t border-gray-50 text-xs font-bold text-pn-green text-center">
            Fechas configuradas: {rounds.length} · {liga.fixtureConfig?.roundMode==="double"?"Ida y vuelta":"Ida"}
          </div>
        )}
      </div>

      {/* Tabs — mismo estilo que la app */}
      <div className="flex gap-2 mb-5 max-w-2xl mx-auto flex-wrap">
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-bold transition-all ${
              tab===t.id?"bg-app-heading text-white shadow-md":"bg-white text-app-muted border border-gray-100 hover:border-pn-green hover:text-app-heading"
            }`}>
            <t.icon size={14}/>{t.label}
          </button>
        ))}
      </div>

      <div className="max-w-2xl mx-auto">

        {/* ── JUGADORES ──────────────────────────────────────────── */}
        {tab==="jugadores"&&(
          <div>
            {players.length===0&&<p className="text-center text-app-muted py-12">No hay jugadores inscriptos.</p>}

            {/* Resumen drive/reves si es individual */}
            {isIndividual&&players.length>0&&(
              <div className="bg-white rounded-2xl px-5 py-3 mb-3 flex gap-6 text-sm font-bold text-pn-green">
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
                      <div key={num} className="bg-white rounded-2xl overflow-hidden border border-gray-50">
                        <div className="px-4 py-2 bg-gray-50 text-xs font-bold text-app-muted">Pareja {num}</div>
                        {pp.map((p:any,i:number)=>(
                          <div key={i} className="flex items-center gap-3 px-4 py-3 border-t border-gray-50 first:border-0">
                            {p.foto
                              ? <img src={p.foto} className="w-10 h-10 rounded-full object-cover flex-shrink-0"/>
                              : <div className="w-10 h-10 rounded-full bg-pn-mint flex items-center justify-center font-black text-pn-green text-sm flex-shrink-0">{(p.nombre?.[0]??"?").toUpperCase()}</div>}
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-app-heading text-sm">{p.nombre} {p.apellido??""}</div>
                              <div className="text-xs text-app-muted">{p.categoria}{p.ciudad?` · ${p.ciudad}`:""}</div>
                            </div>
                            {p.type==="guest"&&<span className="text-xs bg-amber-50 text-amber-500 font-semibold px-2 py-0.5 rounded-full">Invitado</span>}
                          </div>
                        ))}
                      </div>
                    ));
                  })()
                : players.map((p:any,i:number)=>(
                    <div key={i} className="bg-white rounded-2xl flex items-center gap-3 px-4 py-3 border border-gray-50">
                      {p.foto
                        ? <img src={p.foto} className="w-10 h-10 rounded-full object-cover flex-shrink-0"/>
                        : <div className="w-10 h-10 rounded-full bg-pn-mint flex items-center justify-center font-black text-pn-green text-sm flex-shrink-0">{(p.nombre?.[0]??"?").toUpperCase()}</div>}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-app-heading text-sm">{p.nombre} {p.apellido??""}</div>
                        <div className="text-xs text-app-muted">{p.ladoJuego?`${p.ladoJuego.charAt(0).toUpperCase()+p.ladoJuego.slice(1)} · `:""}{p.categoria}{p.ciudad?` · ${p.ciudad}`:""}</div>
                      </div>
                      {p.type==="guest"&&<span className="text-xs bg-amber-50 text-amber-500 font-semibold px-2 py-0.5 rounded-full">Invitado</span>}
                    </div>
                  ))
              }
            </div>
          </div>
        )}

        {/* ── FIXTURE ────────────────────────────────────────────── */}
        {tab==="fixture"&&(
          <div className="flex flex-col gap-4">
            {rounds.length===0&&<p className="text-center text-app-muted py-12">El fixture todavía no fue generado.</p>}
            {rounds.map((round:any,ri:number)=>{
              const isSusp = !!round.suspendedAtMillis;
              const isDone = !!round.completedAtMillis;
              return (
                <div key={ri} className="bg-white rounded-2xl overflow-hidden shadow-sm">
                  {/* Header fecha */}
                  <div className={`px-5 py-3 flex items-center justify-between ${isSusp?"bg-amber-50":isDone?"bg-pn-mint":"bg-white"}`}>
                    <span className="font-black text-app-heading text-base uppercase tracking-wide">
                      {round.title??`Fecha ${round.number??ri+1}`}
                    </span>
                    <span className={`flex items-center gap-1.5 text-xs font-bold ${isSusp?"text-amber-500":isDone?"text-pn-green":"text-gray-400"}`}>
                      <span className={`w-2 h-2 rounded-full ${isSusp?"bg-amber-400":isDone?"bg-pn-green":"bg-gray-300"}`}/>
                      {isSusp?"SUSPENDIDA":isDone?"COMPLETADA":"PENDIENTE"}
                    </span>
                  </div>

                  {round.scheduleLabel&&(
                    <div className="px-5 py-1.5 text-xs text-app-muted bg-gray-50 border-b border-gray-100">{round.scheduleLabel}</div>
                  )}

                  {/* Encabezados columnas — igual que la app */}
                  {(round.matches??[]).length>0&&(
                    <div className="grid text-xs font-bold text-pn-green uppercase px-4 py-2 border-b border-gray-100"
                      style={{gridTemplateColumns:"90px 1fr 52px 52px 32px"}}>
                      <div>Resultado</div>
                      <div className="text-center">Parejas</div>
                      <div className="text-center">Día</div>
                      <div className="text-center">Hora</div>
                      <div/>
                    </div>
                  )}

                  {/* Matches */}
                  <div className="divide-y divide-gray-50">
                    {(round.matches??[]).map((m:any,mi:number)=>{
                      const aLabel = m.teamA?.label??m.pair1Name??"Pareja A";
                      const bLabel = m.teamB?.label??m.pair2Name??"Pareja B";
                      const res    = m.result;
                      const hasRes = res?.winner&&res.winner!=="";
                      const aWon   = res?.winner==="teamA";
                      const bWon   = res?.winner==="teamB";
                      const isWO   = res?.reason==="walkover"||res?.winner==="walkover";
                      const dia    = m.dayLabel??round.scheduleConfig?.dayKey??null;
                      const hora   = m.timeSlot??null;
                      const hasRep = Object.keys(m.replacements??{}).length>0;

                      return (
                        <div key={mi} className="grid items-center px-4 py-3 hover:bg-gray-50/50 transition-colors"
                          style={{gridTemplateColumns:"90px 1fr 52px 52px 32px"}}>

                          {/* Resultado */}
                          <div>
                            {hasRes ? (
                              <button onClick={()=>setResultModal({ri,mi})}
                                className={`text-sm font-bold ${isWO?"text-amber-500":"text-pn-green"} hover:underline text-left`}>
                                {isWO?"WO":res.score||"✓"}
                              </button>
                            ) : (
                              <button onClick={()=>setResultModal({ri,mi})}
                                className="text-sm font-bold text-gray-400 hover:text-pn-green transition-colors">
                                Pendiente
                              </button>
                            )}
                          </div>

                          {/* Parejas — stacked como la app */}
                          <div className="text-center px-2">
                            <div className={`text-sm font-bold truncate ${aWon?"text-pn-green":"text-app-heading"}`}>
                              {aWon&&"👍 "}{aLabel}
                            </div>
                            <div className="text-xs text-gray-300 my-0.5">—</div>
                            <div className={`text-sm font-bold truncate ${bWon?"text-pn-green":"text-app-heading"}`}>
                              {bWon&&"👍 "}{bLabel}
                            </div>
                          </div>

                          {/* Día */}
                          <div className="text-center text-xs font-bold text-app-blue">{dia?DAY_LABELS[dia]??dia:""}</div>

                          {/* Hora */}
                          <div className="text-center text-xs font-bold text-app-blue">{hora??""}</div>

                          {/* Menú / reemplazos */}
                          <div className="text-center">
                            {hasRep&&<RefreshCw size={13} className="text-amber-400 mx-auto"/>}
                          </div>
                        </div>
                      );
                    })}
                    {(!round.matches||round.matches.length===0)&&(
                      <div className="px-4 py-3 text-sm text-app-muted italic">Sin partidos</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── PUNTAJES ────────────────────────────────────────────── */}
        {tab==="posiciones"&&(
          <div>
            {standings.length===0
              ? <p className="text-center text-app-muted py-12">Todavía no hay resultados.</p>
              : (
                <>
                  {/* Si es individual, separar Drive / Reves */}
                  {isIndividual ? (
                    ["drive","reves"].map(lado=>{
                      const rows = standings.filter(r=>
                        players.find((p:any)=>(p.teamA?.id===r.id||p.id===r.id) && p.ladoJuego===lado)
                      );
                      if(rows.length===0) return null;
                      return (
                        <div key={lado} className="bg-white rounded-2xl overflow-hidden shadow-sm mb-4">
                          <div className="px-5 py-3 font-black text-app-heading capitalize">{lado==="drive"?"Drive":"Reves"}</div>
                          <StandingsTable rows={rows}/>
                        </div>
                      );
                    })
                  ) : (
                    <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                      <div className="px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50">Tabla de puntuación</div>
                      <StandingsTable rows={standings}/>
                    </div>
                  )}
                  <div className="flex gap-3 mt-3 text-xs text-app-muted flex-wrap">
                    {[["Pts","Puntos"],["R","Reemplazos"],["PJ","Jugados"],["PG","Ganados"]].map(([k,v])=>(
                      <span key={k}><b>{k}</b>: {v}</span>
                    ))}
                  </div>
                </>
              )
            }
          </div>
        )}

        {/* ── PAGOS ────────────────────────────────────────────────── */}
        {tab==="pagos"&&(
          <div>
            {/* Config pago */}
            {liga.paymentConfig&&(
              <div className="bg-white rounded-2xl px-5 py-3 mb-4 text-sm flex gap-5 flex-wrap">
                {liga.paymentConfig.registrationFeeEnabled&&(
                  <span className="text-app-heading font-bold">Inscripción: <span className="text-pn-green">$ {liga.paymentConfig.registrationFeeAmount}</span></span>
                )}
                {liga.paymentConfig.roundPricePerPlayer>0&&(
                  <span className="text-app-heading font-bold">Por fecha: <span className="text-pn-green">$ {liga.paymentConfig.roundPricePerPlayer}</span></span>
                )}
              </div>
            )}

            {/* Chips resumen */}
            {allEntries.length>0&&(
              <div className="flex gap-2 mb-4 flex-wrap">
                <span className="border-2 border-pn-green text-pn-green text-xs font-bold px-4 py-1.5 rounded-full">Pagados {cntPagado}</span>
                <span className="border-2 border-amber-400 text-amber-500 text-xs font-bold px-4 py-1.5 rounded-full">Verificar pago {cntReview}</span>
                <span className="border-2 border-app-orange text-app-orange text-xs font-bold px-4 py-1.5 rounded-full">Impagos {cntImpago}</span>
              </div>
            )}

            {/* Por fecha */}
            {roundPayments.length===0&&rounds.length===0&&(
              <p className="text-center text-app-muted py-12">No hay pagos configurados.</p>
            )}
            {rounds.map((round:any,ri:number)=>{
              const rp = roundPayments.find((r:any)=>r.roundId===round.id||r.roundId===`round-${round.number??ri+1}`);
              const entries: any[] = rp?.entries??[];
              return (
                <div key={ri} className="mb-4">
                  {/* Banner fecha — igual que la app */}
                  <div className="bg-app-teal rounded-t-2xl px-5 py-3 text-center text-white font-black uppercase tracking-wide text-sm">
                    {round.title??`Fecha ${round.number??ri+1}`}
                    {liga.paymentConfig?.roundPricePerPlayer>0&&(
                      <div className="text-xs font-normal opacity-80 mt-0.5">$ {liga.paymentConfig.roundPricePerPlayer} por jugador</div>
                    )}
                  </div>

                  <div className="bg-white rounded-b-2xl overflow-hidden shadow-sm">
                    {/* Encabezados */}
                    {entries.length>0&&(
                      <div className="grid text-xs font-bold text-pn-green uppercase px-4 py-2 border-b border-gray-100"
                        style={{gridTemplateColumns:"1fr 90px 60px 60px 70px 40px"}}>
                        <div>Jugador</div>
                        <div className="text-center">Estado</div>
                        <div className="text-center">Modo</div>
                        <div className="text-center">Comp.</div>
                        <div className="text-right">$</div>
                        <div/>
                      </div>
                    )}

                    <div className="divide-y divide-gray-50">
                      {entries.map((entry:any,ei:number)=>{
                        const status = entry.paymentStatus??"pendiente";
                        const isPagado = status==="pagado"||status==="paid";
                        const isReview = status==="informo_transferencia"||status==="in_review";
                        return (
                          <div key={ei} className="grid items-center px-4 py-3" style={{gridTemplateColumns:"1fr 90px 60px 60px 70px 40px"}}>
                            <div className="font-bold text-app-heading text-sm truncate pr-2">
                              {entry.pairLabel??entry.participantLabel??"Jugador"}
                            </div>
                            <div className="text-center">
                              <span className={`text-xs font-bold ${isPagado?"text-pn-green":isReview?"text-amber-500":"text-app-orange"}`}>
                                {isPagado?"Pagado":isReview?"Verificar":"Impago"}
                              </span>
                            </div>
                            <div className="text-center text-xs text-app-muted">
                              {entry.paymentMethod==="mercado_pago"?"MP":entry.paymentMethod==="efectivo"?"Efec.":entry.paymentMethod||"-"}
                            </div>
                            <div className="text-center">
                              {entry.proofUrl
                                ? <button onClick={()=>setComprobanteUrl(entry.proofUrl)} className="text-xs text-pn-green font-bold hover:underline flex items-center gap-0.5 mx-auto"><Eye size={11}/>Ver</button>
                                : <span className="text-xs text-gray-300">-</span>}
                            </div>
                            <div className="text-right text-xs font-bold text-app-heading">
                              {liga.paymentConfig?.roundPricePerPlayer?`$ ${liga.paymentConfig.roundPricePerPlayer}`:""}
                            </div>
                            <div className="flex justify-center">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isPagado?"bg-pn-green":"bg-app-orange"}`}>
                                <DollarSign size={14} className="text-white"/>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {entries.length===0&&(
                        <div className="px-4 py-4 text-xs text-app-muted text-center italic">Sin registros de pago</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal resultado */}
      {resultModal&&(
        <ResultModal
          match={rounds[resultModal.ri]?.matches?.[resultModal.mi]}
          matchFormat={matchFormat}
          onClose={()=>setResultModal(null)}
          onSave={(res:any)=>saveResult(resultModal.ri,resultModal.mi,res)}
        />
      )}

      {/* Modal comprobante */}
      {comprobanteUrl&&(
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
            <td className="px-5 py-2.5 text-xs font-black text-app-muted">{i+1}</td>
            <td className="px-2 py-2.5 font-semibold text-app-heading text-sm">
              {i===0&&<Shield size={11} className="inline mr-1 text-pn-green"/>}{r.nombre}
            </td>
            <td className="px-2 py-2.5 text-center font-black text-pn-green">{r.pts}</td>
            <td className="px-2 py-2.5 text-center text-xs text-app-muted">{r.pen>0?`-${r.pen}`:"-"}</td>
            <td className="px-2 py-2.5 text-center text-xs text-app-muted">{r.pj}</td>
            <td className="px-2 py-2.5 text-center text-xs text-pn-green font-semibold">{r.pg}</td>
            <td className="px-2 py-2.5 text-center text-xs text-app-orange">{r.pp}</td>
            <td className="px-2 py-2.5 text-center text-xs text-app-muted hidden sm:table-cell">{r.sf}</td>
            <td className="px-2 py-2.5 text-center text-xs text-app-muted hidden sm:table-cell">{r.sc2}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
