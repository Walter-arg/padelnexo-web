"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, addDoc, setDoc, increment, serverTimestamp, getDocs, query as fsQuery, where } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import { useRouter, useParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Users, UserPlus, User as UserIcon, Trash2, ArrowLeftRight,
  X, Save, RefreshCw, Eye, Archive, Shield,
  MapPin, Clock, ChevronLeft, ChevronDown, Trophy,
  Contact, CalendarDays, Wallet, Check, MoreVertical,
  MessageSquare, Smartphone, Banknote, Search, Plus,
} from "lucide-react";

type Tab = "jugadores" | "fixture" | "posiciones" | "pagos";

// ── Helpers de jugadores ───────────────────────────────────────────────────
function normalizeText(str: string): string {
  return (str ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function normalizePlayerEntry(p: any): any {
  return {
    id: p.id ?? `guest-${Date.now()}`,
    type: p.type ?? "guest",
    linkedUserId: p.linkedUserId ?? "",
    nombre: p.nombre ?? "Jugador",
    apellido: p.apellido ?? "",
    telefono: p.telefono ?? p.celular ?? p.whatsapp ?? "",
    categoria: p.categoria ?? "",
    sexo: p.sexo ?? "",
    ciudad: p.ciudad ?? "",
    provincia: p.provincia ?? "",
    foto: p.foto ?? "",
    ladoJuego: p.ladoJuego ?? "ambos",
    ladoPreferido: p.ladoPreferido ?? "Ambos lados",
    pairNumber: p.pairNumber ?? 0,
  };
}

// ── PlayerSlotRow ──────────────────────────────────────────────────────────
function PlayerSlotRow({ player, onView, onDelete, onSwap, isSwapActive, showSide }: {
  player: any;
  onView: () => void;
  onDelete: () => void;
  onSwap?: () => void;
  isSwapActive?: boolean;
  showSide?: boolean;
}) {
  const isGuest = player.type === "guest";
  return (
    <div className="bg-[#F7FBF9] border border-[#CFE7DC] rounded-xl px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <button onClick={onView} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          {player.foto
            ? <img src={player.foto} className="w-7 h-7 rounded-full object-cover flex-shrink-0" alt="" />
            : <div className="w-7 h-7 rounded-full bg-[#E5E7EB] flex items-center justify-center flex-shrink-0">
                <UserIcon size={13} className="text-[#9CA3AF]" />
              </div>
          }
          <div className="min-w-0">
            <div className="text-sm font-black text-[#173A2E] truncate">{player.nombre} {player.apellido ?? ""}</div>
            <div className="text-[11px] text-[#5F7D72] font-semibold">{isGuest ? "Solo visible en esta liga" : "Ver perfil"}</div>
          </div>
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          {onSwap && (
            <button onClick={onSwap}
              className={`w-7 h-7 rounded-[10px] border flex items-center justify-center transition-colors ${isSwapActive ? "bg-[#086847] border-[#086847]" : "bg-[#EDF7F2] border-[#C9E5D8] hover:bg-[#C9E5D8]"}`}
              title="Reemplazar por jugador registrado">
              <ArrowLeftRight size={12} className={isSwapActive ? "text-white" : "text-[#086847]"} />
            </button>
          )}
          <button onClick={onDelete}
            className="w-7 h-7 rounded-[10px] bg-[#FFF1F1] border border-[#F2C4C4] flex items-center justify-center hover:bg-red-100 transition-colors"
            title="Eliminar de la liga">
            <Trash2 size={12} className="text-[#D64545]" />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 mt-1.5">
        {showSide && player.ladoJuego && player.ladoJuego !== "ambos" && (
          <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-[#EDF7F2] border border-[#C9E5D8] text-[#086847]">
            {player.ladoJuego === "drive" ? "Drive" : "Reves"}
          </span>
        )}
        {player.categoria && (
          <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-[#EDF7F2] border border-[#C9E5D8] text-[#086847]">
            {player.categoria}
          </span>
        )}
        {player.sexo && (
          <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-[#FFF4E7] border border-[#E8C58E] text-[#8A5A2B] capitalize">
            {player.sexo}
          </span>
        )}
      </div>
      {isSwapActive && (
        <p className="text-[11px] text-[#086847] font-bold mt-1.5 leading-tight">
          Seleccioná arriba un jugador registrado para reemplazar este nombre manual.
        </p>
      )}
    </div>
  );
}

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

// ── Helpers de pagos ──────────────────────────────────────────────────────
const REGISTRATION_ROUND_ID = "__league_registration_fee__";

function participantKey(player: any): string {
  return player.linkedUserId || player.id || player.nombre || "";
}

const EDAD_MINIMA_MENSAJES = 14;

function calcularEdad(fechaNacimiento: string): number | null {
  if (!fechaNacimiento) return null;
  const parts = String(fechaNacimiento).split("-").map(Number);
  if (parts.length !== 3 || !parts[0]) return null;
  const [year, month, day] = parts;
  const today = new Date();
  const birth = new Date(year, month - 1, day);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function esMenorRestringido(fechaNacimiento: string): boolean {
  if (!fechaNacimiento) return false;
  const age = calcularEdad(fechaNacimiento);
  return age !== null && age < EDAD_MINIMA_MENSAJES;
}

function playerLabel(player: any): string {
  return `${player.nombre || ""} ${player.apellido || ""}`.trim() || "Jugador";
}

function resolveRoundEntries(round: any, storedRoundPayments: any[], liga: any): any[] {
  const matches = (round.matches ?? []).filter((m: any) => {
    if (m?.suspensionMode && !m?.result?.winner) return false;
    return (m?.teamA?.players?.length || m?.teamB?.players?.length);
  });
  const stored = storedRoundPayments.find((r: any) => r.roundId === round.id) ?? { entries: [] };

  if (liga.teamType === "pair") {
    const teams = matches.flatMap((m: any) => [m.teamA, m.teamB]).filter(Boolean);
    const seenTeams = new Set<string>();
    const result: any[] = [];
    for (const team of teams) {
      const tKey = team.id || "";
      if (!tKey || seenTeams.has(tKey)) continue;
      seenTeams.add(tKey);
      const pairLabel = team.label || (team.players ?? []).map(playerLabel).join(" / ");
      for (const player of (team.players ?? [])) {
        const pid = participantKey(player);
        const e = stored.entries.find((x: any) => x.participantId === pid) ?? null;
        result.push({ participantId: pid, participantLabel: playerLabel(player), pairLabel,
          paymentStatus: e?.paymentStatus ?? "pendiente", paymentMethod: e?.paymentMethod ?? "", proofUrl: e?.proofUrl ?? "" });
      }
    }
    return result;
  }

  const players = matches.flatMap((m: any) => [...(m?.teamA?.players ?? []), ...(m?.teamB?.players ?? [])]);
  const seen = new Set<string>();
  const result: any[] = [];
  for (const player of players) {
    const pid = participantKey(player);
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    const e = stored.entries.find((x: any) => x.participantId === pid) ?? null;
    result.push({ participantId: pid, participantLabel: playerLabel(player), pairLabel: "",
      paymentStatus: e?.paymentStatus ?? "pendiente", paymentMethod: e?.paymentMethod ?? "", proofUrl: e?.proofUrl ?? "" });
  }
  return result;
}

function resolveRegistrationEntries(storedRoundPayments: any[], liga: any): any[] {
  const stored = storedRoundPayments.find((r: any) => r.roundId === REGISTRATION_ROUND_ID) ?? { entries: [] };
  const players: any[] = liga.players ?? [];

  if (liga.teamType === "pair") {
    const pairs: Record<number, any[]> = {};
    players.forEach((p: any) => { const n = p.pairNumber ?? 0; if (!pairs[n]) pairs[n] = []; pairs[n].push(p); });
    return Object.values(pairs).flatMap((pp) => {
      const pairLabel = pp.map(playerLabel).join(" / ");
      return pp.map((player: any) => {
        const pid = participantKey(player);
        const e = stored.entries.find((x: any) => x.participantId === pid) ?? null;
        return { participantId: pid, participantLabel: playerLabel(player), pairLabel,
          paymentStatus: e?.paymentStatus ?? "pendiente", paymentMethod: e?.paymentMethod ?? "", proofUrl: e?.proofUrl ?? "" };
      });
    });
  }

  const seen = new Set<string>();
  const result: any[] = [];
  for (const player of players) {
    const pid = participantKey(player);
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    const e = stored.entries.find((x: any) => x.participantId === pid) ?? null;
    result.push({ participantId: pid, participantLabel: playerLabel(player), pairLabel: "",
      paymentStatus: e?.paymentStatus ?? "pendiente", paymentMethod: e?.paymentMethod ?? "", proofUrl: e?.proofUrl ?? "" });
  }
  return result;
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
  const [savingPayment, setSavingPayment] = useState<string|null>(null);
  const [openMenu, setOpenMenu] = useState<string|null>(null);
  const [playerProfile, setPlayerProfile] = useState<any|null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileView, setProfileView] = useState<"main"|"message"|"report">("main");
  const [profileMsgText, setProfileMsgText] = useState("");
  const [profileReportText, setProfileReportText] = useState("");
  const [profileActionLoading, setProfileActionLoading] = useState(false);
  const [openBlocks, setOpenBlocks] = useState<Record<string,boolean>>({});
  const [paymentModal, setPaymentModal] = useState<{blockId:string;blockTitle:string;entry:any}|null>(null);
  const [modalMethod, setModalMethod] = useState<"efectivo"|"transferencia">("efectivo");
  const [modalFile, setModalFile] = useState<File|null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [toast, setToast] = useState<{msg:string;ok:boolean}|null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Player management state ──────────────────────────────────────────────
  const [registeredPlayers, setRegisteredPlayers] = useState<any[]>([]);
  const [playersLoaded, setPlayersLoaded] = useState(false);
  const [playerQuery, setPlayerQuery] = useState("");
  const [guestModalOpen, setGuestModalOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");
  const [sidePickerOpen, setSidePickerOpen] = useState(false);
  const [pairPickerOpen, setPairPickerOpen] = useState(false);
  const [pendingPlayer, setPendingPlayer] = useState<any>(null);
  const [pendingIsGuest, setPendingIsGuest] = useState(false);
  const [replacementTargetId, setReplacementTargetId] = useState("");
  const [savingPlayers, setSavingPlayers] = useState(false);
  const [registrationRequests, setRegistrationRequests] = useState<any[]>([]);
  const [expandedPairs, setExpandedPairs] = useState<number[]>([]);

  const filteredRegisteredPlayers = useMemo(() => {
    if (!playerQuery) return registeredPlayers.slice(0, 12);
    const q = normalizeText(playerQuery);
    return registeredPlayers
      .filter(p =>
        normalizeText(`${p.nombre ?? ""} ${p.apellido ?? ""}`).includes(q) ||
        normalizeText(p.categoria ?? "").includes(q) ||
        normalizeText(p.ciudad ?? "").includes(q)
      )
      .slice(0, 12);
  }, [registeredPlayers, playerQuery]);

  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, async(u)=>{
      if(!u){router.push("/login");return;}
      const snap = await getDoc(doc(db,"leagues",ligaId));
      if(snap.exists()) setLiga({id:snap.id,...snap.data()});
      setLoading(false);
    });
    return unsub;
  },[ligaId,router]);

  // Carga jugadores registrados + solicitudes al abrir el tab
  useEffect(()=>{
    if(tab !== "jugadores" || playersLoaded) return;
    async function load() {
      try {
        const snap = await getDocs(fsQuery(collection(db,"users"), where("accountDeleted","!=",true)));
        const all: any[] = snap.docs
          .map(d=>({id:d.id,...d.data()}))
          .filter((u:any)=>u.role!=="blocked"&&u.role!=="deleted");
        all.sort((a:any,b:any)=>normalizeText(`${a.nombre??""} ${a.apellido??""}`).localeCompare(normalizeText(`${b.nombre??""} ${b.apellido??""}`)));
        setRegisteredPlayers(all);
      } catch {}
      setPlayersLoaded(true);
    }
    async function loadRequests() {
      try {
        const snap = await getDocs(fsQuery(collection(db,"leagueRegistrationRequests"),where("leagueId","==",ligaId)));
        setRegistrationRequests(snap.docs.map(d=>({id:d.id,...d.data()})));
      } catch {}
    }
    load();
    loadRequests();
  },[tab,playersLoaded,ligaId]);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  function lookupPlayer(participantId: string): any {
    return (liga.players ?? []).find((p: any) => {
      const key = p.linkedUserId || p.id || p.nombre || "";
      return key === participantId;
    });
  }

  async function openPlayerProfile(p: any) {
    setPlayerProfile(p);
    setProfileView("main");
    setProfileMsgText("");
    setProfileReportText("");
    if (p.linkedUserId) {
      setProfileLoading(true);
      try {
        const snap = await getDoc(doc(db, "users", p.linkedUserId));
        if (snap.exists()) setPlayerProfile({ ...p, ...snap.data() });
      } catch {}
      setProfileLoading(false);
    }
  }

  function closePlayerProfile() {
    setPlayerProfile(null);
    setProfileLoading(false);
    setProfileView("main");
    setProfileMsgText("");
    setProfileReportText("");
  }

  async function sendProfileMessage() {
    const pp = playerProfile;
    if (!profileMsgText.trim() || !pp?.linkedUserId) return;
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    setProfileActionLoading(true);
    const otherUserId = pp.linkedUserId;
    const text = profileMsgText.trim();
    const playerName = `${pp.nombre||""} ${pp.apellido||""}`.trim();
    const conversationId = [currentUser.uid, otherUserId].sort().join("__");
    const convRef = doc(db, "conversations", conversationId);
    const msgsRef = collection(db, "conversations", conversationId, "messages");
    try {
      await setDoc(convRef, {
        participants: [currentUser.uid, otherUserId].sort(),
        participantNames: { [currentUser.uid]: currentUser.displayName||"Organizador", [otherUserId]: playerName },
        unreadBy: [otherUserId], lastMessageText: text, lastMessageSenderId: currentUser.uid,
        updatedAt: serverTimestamp(), createdAt: serverTimestamp(),
      }, { merge: true });
      await addDoc(msgsRef, { text, senderId: currentUser.uid, recipientId: otherUserId, createdAt: serverTimestamp() });
      await updateDoc(convRef, {
        updatedAt: serverTimestamp(), [`unreadCountBy.${otherUserId}`]: increment(1),
        [`unreadCountBy.${currentUser.uid}`]: 0, unreadBy: [otherUserId],
        lastMessageText: text, lastMessageSenderId: currentUser.uid,
      });
      showToast("Mensaje enviado.");
      closePlayerProfile();
    } catch { showToast("No pudimos enviar el mensaje.", false); }
    setProfileActionLoading(false);
  }

  async function submitProfileReport() {
    const pp = playerProfile;
    if (!profileReportText.trim() || !pp) return;
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    setProfileActionLoading(true);
    const playerName = `${pp.nombre||""} ${pp.apellido||""}`.trim();
    const targetId = pp.linkedUserId || pp.id || "";
    try {
      await addDoc(collection(db, "reports"), {
        reporterId: currentUser.uid,
        reporterName: currentUser.displayName || "Organizador",
        reporterRole: "organizer",
        targetType: "profile",
        targetId,
        targetTitle: playerName,
        description: profileReportText.trim(),
        metadata: { category: pp.categoria||"", city: pp.ciudad||"", reportedUserId: targetId, reportedUserName: playerName },
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast("Reporte enviado. Lo revisaremos a la brevedad.");
      closePlayerProfile();
    } catch { showToast("No pudimos enviar el reporte.", false); }
    setProfileActionLoading(false);
  }

  function buildWhatsAppUrl(participantId: string, roundTitle: string): string {
    const player = lookupPlayer(participantId);
    const raw = (player?.telefono || player?.celular || player?.phone || player?.whatsapp || "").replace(/\D/g, "");
    if (!raw) return "";
    const phone = raw.startsWith("54") ? raw : "54" + (raw.startsWith("0") ? raw.slice(1) : raw);
    const ligaName = liga.nombre || liga.name || "la liga";
    const msg = `Hola ${player?.nombre || ""}! Te recordamos que tenés el pago de ${roundTitle} pendiente en ${ligaName}. Si ya pagaste, marcalo en la app. Gracias!`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  }

  async function sendReminderChat(entry: any, roundTitle: string) {
    const player = lookupPlayer(entry.participantId);
    const otherUserId = player?.linkedUserId || "";
    if (!otherUserId) { showToast("Este jugador no tiene cuenta vinculada en la app.", false); return; }
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const ligaName = liga.nombre || liga.name || "la liga";
    const text = `Hola! Te recordamos que tenés el pago de "${roundTitle}" pendiente en ${ligaName}.`;
    const conversationId = [currentUser.uid, otherUserId].sort().join("__");
    const convRef = doc(db, "conversations", conversationId);
    const msgsRef = collection(db, "conversations", conversationId, "messages");
    await setDoc(convRef, {
      participants: [currentUser.uid, otherUserId].sort(),
      participantNames: { [currentUser.uid]: currentUser.displayName || "Organizador", [otherUserId]: entry.participantLabel || "Jugador" },
      unreadBy: [otherUserId], lastMessageText: text, lastMessageSenderId: currentUser.uid,
      updatedAt: serverTimestamp(), createdAt: serverTimestamp(),
    }, { merge: true });
    await addDoc(msgsRef, { text, senderId: currentUser.uid, recipientId: otherUserId, createdAt: serverTimestamp() });
    await updateDoc(convRef, {
      updatedAt: serverTimestamp(), [`unreadCountBy.${otherUserId}`]: increment(1),
      [`unreadCountBy.${currentUser.uid}`]: 0, unreadBy: [otherUserId],
      lastMessageText: text, lastMessageSenderId: currentUser.uid,
    });
    showToast("Mensaje enviado por mensajería interna.");
  }

  async function savePaymentModal() {
    if (!paymentModal) return;
    setUploadingProof(true);
    try {
      let proofUrl = paymentModal.entry.proofUrl || "";
      if (modalFile) {
        const ext = modalFile.name.split(".").pop() ?? "jpg";
        const path = `leaguePaymentProofs/${ligaId}/${paymentModal.blockId.replace(/[^a-zA-Z0-9]/g,"_")}/${paymentModal.entry.participantId}/${Date.now()}.${ext}`;
        const sRef = storageRef(storage, path);
        await uploadBytes(sRef, modalFile);
        proofUrl = await getDownloadURL(sRef);
      }
      const rp: any[] = liga.roundPayments ?? [];
      const round = (liga.fixture?.rounds ?? []).find((r: any) => r.id === paymentModal.blockId);
      const entries = paymentModal.blockId === REGISTRATION_ROUND_ID
        ? resolveRegistrationEntries(rp, liga)
        : round ? resolveRoundEntries(round, rp, liga) : [];
      const updatedEntries = entries.map((e: any) =>
        e.participantId === paymentModal.entry.participantId
          ? { ...e, paymentStatus: "pagado", paymentMethod: modalMethod, ...(proofUrl ? { proofUrl } : {}) }
          : e
      );
      const updated = [...rp.filter((r: any) => r.roundId !== paymentModal.blockId), { roundId: paymentModal.blockId, entries: updatedEntries }];
      await updateDoc(doc(db, "leagues", ligaId), { roundPayments: updated });
      setLiga((prev: any) => ({ ...prev, roundPayments: updated }));
      setPaymentModal(null); setModalFile(null);
      showToast("Pago registrado correctamente.");
    } catch { showToast("Error al guardar el pago.", false); }
    finally { setUploadingProof(false); }
  }

  async function setPaymentStatus(roundId: string, participantId: string, status: string) {
    const key = `${roundId}:${participantId}`;
    setSavingPayment(key);
    try {
      const roundPayments: any[] = liga.roundPayments ?? [];
      const round = (liga.fixture?.rounds ?? []).find((r: any) => r.id === roundId);
      const entries = roundId === REGISTRATION_ROUND_ID
        ? resolveRegistrationEntries(roundPayments, liga)
        : round ? resolveRoundEntries(round, roundPayments, liga) : [];
      const updatedEntries = entries.map((e: any) =>
        e.participantId === participantId ? { ...e, paymentStatus: status } : e
      );
      const updatedRoundPayments = [
        ...roundPayments.filter((r: any) => r.roundId !== roundId),
        { roundId, entries: updatedEntries },
      ];
      await updateDoc(doc(db, "leagues", ligaId), { roundPayments: updatedRoundPayments });
      setLiga((prev: any) => ({ ...prev, roundPayments: updatedRoundPayments }));
    } finally {
      setSavingPayment(null);
    }
  }

  async function saveResult(ri:number,mi:number,result:any){
    const rounds=(liga.fixture?.rounds??[]).map((r:any,i:number)=>
      i!==ri?r:{...r,matches:r.matches.map((m:any,j:number)=>j!==mi?m:{...m,result})}
    );
    await updateDoc(doc(db,"leagues",ligaId),{"fixture.rounds":rounds});
    setLiga((p:any)=>({...p,fixture:{...p.fixture,rounds}}));
    setResultModal(null);
  }

  // ── Player management functions ──────────────────────────────────────────
  async function persistPlayers(nextPlayers: any[]) {
    setSavingPlayers(true);
    try {
      await updateDoc(doc(db,"leagues",ligaId),{
        players: nextPlayers.map(normalizePlayerEntry),
        updatedAt: serverTimestamp(),
      });
      setLiga((prev:any)=>({...prev,players:nextPlayers}));
    } catch { showToast("Error al guardar jugadores.",false); }
    setSavingPlayers(false);
  }

  function handleAddRegisteredPlayer(rp: any) {
    if(replacementTargetId) {
      const target=(liga?.players??[]).find((p:any)=>p.id===replacementTargetId);
      if(!target) return;
      const newP=normalizePlayerEntry({
        id:`registered-${rp.id}`,type:"registered",linkedUserId:rp.id,
        nombre:rp.nombre??"",apellido:rp.apellido??"",
        telefono:rp.telefono??rp.celular??"",categoria:rp.categoria??"",
        sexo:rp.sexo??"",ciudad:rp.ciudad??"",provincia:rp.provincia??"",foto:rp.foto??"",
        ladoJuego:target.ladoJuego,ladoPreferido:target.ladoPreferido,pairNumber:target.pairNumber,
      });
      persistPlayers((liga?.players??[]).map((p:any)=>p.id===replacementTargetId?newP:p));
      setReplacementTargetId("");
      return;
    }
    setPendingPlayer(rp);
    setPendingIsGuest(false);
    if(liga?.teamType==="pair") setPairPickerOpen(true);
    else setSidePickerOpen(true);
  }

  function handleGuestCreate() {
    if(!guestName.trim()||!guestLastName.trim()) return;
    setPendingIsGuest(true);
    setPendingPlayer(null);
    setGuestModalOpen(false);
    if(liga?.teamType==="pair") setPairPickerOpen(true);
    else setSidePickerOpen(true);
  }

  function assignToSide(lado:"drive"|"reves") {
    let newP: any;
    if(pendingIsGuest) {
      newP=normalizePlayerEntry({id:`guest-${Date.now()}`,type:"guest",linkedUserId:"",
        nombre:guestName.trim(),apellido:guestLastName.trim(),ladoJuego:lado,
        ladoPreferido:lado==="drive"?"Drive":"Reves",pairNumber:0});
      setGuestName("");setGuestLastName("");
    } else {
      const rp=pendingPlayer;
      newP=normalizePlayerEntry({id:`registered-${rp.id}`,type:"registered",linkedUserId:rp.id,
        nombre:rp.nombre??"",apellido:rp.apellido??"",telefono:rp.telefono??rp.celular??"",
        categoria:rp.categoria??"",sexo:rp.sexo??"",ciudad:rp.ciudad??"",provincia:rp.provincia??"",
        foto:rp.foto??"",ladoJuego:lado,ladoPreferido:lado==="drive"?"Drive":"Reves",pairNumber:0});
    }
    persistPlayers([...(liga?.players??[]),newP]);
    setPendingPlayer(null);setPendingIsGuest(false);setSidePickerOpen(false);
  }

  function assignToPair(pairNumber: number) {
    let newP: any;
    if(pendingIsGuest) {
      newP=normalizePlayerEntry({id:`guest-${Date.now()}`,type:"guest",linkedUserId:"",
        nombre:guestName.trim(),apellido:guestLastName.trim(),pairNumber,ladoJuego:"ambos",ladoPreferido:"Ambos lados"});
      setGuestName("");setGuestLastName("");
    } else {
      const rp=pendingPlayer;
      newP=normalizePlayerEntry({id:`registered-${rp.id}`,type:"registered",linkedUserId:rp.id,
        nombre:rp.nombre??"",apellido:rp.apellido??"",telefono:rp.telefono??rp.celular??"",
        categoria:rp.categoria??"",sexo:rp.sexo??"",ciudad:rp.ciudad??"",provincia:rp.provincia??"",
        foto:rp.foto??"",pairNumber,ladoJuego:"ambos",ladoPreferido:"Ambos lados"});
    }
    persistPlayers([...(liga?.players??[]),newP]);
    setPendingPlayer(null);setPendingIsGuest(false);setPairPickerOpen(false);
  }

  function handleDeletePlayer(playerId: string) {
    if(!confirm("¿Eliminar este jugador de la liga?")) return;
    persistPlayers((liga?.players??[]).filter((p:any)=>p.id!==playerId));
  }

  async function handleConfirmRequest(req: any) {
    const currentMax=(liga?.players??[]).reduce((m:number,p:any)=>Math.max(m,p.pairNumber??0),0);
    const nextPairNum=currentMax+1;
    const newPlayers:any[]=[];
    const addP=(src:any)=>{
      const linked=src?.linkedUserId||"";
      newPlayers.push(normalizePlayerEntry({
        id:linked?`registered-${linked}`:`guest-${Date.now()+newPlayers.length}`,
        type:linked?"registered":"guest",linkedUserId:linked,
        nombre:src?.nombre??"",apellido:src?.apellido??"",
        foto:src?.foto??"",categoria:src?.categoria??"",sexo:src?.sexo??"",ciudad:src?.ciudad??"",
        pairNumber:liga?.teamType==="pair"?nextPairNum:0,ladoJuego:"ambos",ladoPreferido:"Ambos lados",
      }));
    };
    addP(req.requester);
    if(req.partner) addP(req.partner);
    await persistPlayers([...(liga?.players??[]),...newPlayers]);
    await updateDoc(doc(db,"leagueRegistrationRequests",req.id),{status:"confirmed"});
    setRegistrationRequests(prev=>prev.map((r:any)=>r.id===req.id?{...r,status:"confirmed"}:r));
    showToast("Inscripción confirmada.");
  }

  async function handleRejectRequest(reqId: string) {
    await updateDoc(doc(db,"leagueRegistrationRequests",reqId),{status:"rejected"});
    setRegistrationRequests(prev=>prev.map((r:any)=>r.id===reqId?{...r,status:"rejected"}:r));
    showToast("Solicitud rechazada.");
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

  // ── Player computed values ───────────────────────────────────────────────
  const minimumPlayersCount = Math.max(2, liga.fixtureConfig?.minPlayersCount ?? 8);
  const pairPlayersTargetCount = minimumPlayersCount * 2;
  const sideTargetCount = Math.ceil(minimumPlayersCount / 2);
  const driveCount = players.filter((p:any)=>p.ladoJuego==="drive").length;
  const revesCount = players.filter((p:any)=>p.ladoJuego==="reves").length;

  const pairGroupsMap: Record<number,any[]> = {};
  players.forEach((p:any)=>{ const n=p.pairNumber??0; if(!pairGroupsMap[n])pairGroupsMap[n]=[]; pairGroupsMap[n].push(p); });
  const pairGroups = Object.entries(pairGroupsMap)
    .sort(([a],[b])=>Number(a)-Number(b))
    .map(([pn,pp])=>({pairNumber:Number(pn),players:pp}));
  const completePairsCount = pairGroups.filter(g=>g.players.length>=2).length;
  const missingPlayersCount = Math.max(0, pairPlayersTargetCount - players.length);
  const nextPairNumber = pairGroups.length>0 ? Math.max(...pairGroups.map(g=>g.pairNumber))+1 : 1;
  const pendingRequests = registrationRequests.filter((r:any)=>r.status==="pending"||r.status==="awaiting_partner");
  const roundPayments: any[] = liga.roundPayments ?? [];
  const standings            = buildStandings(liga);
  const matchFormat          = liga.matchFormat ?? "three_full_sets";
  const isIndividual         = liga.teamType === "individual";
  const logoUrl              = liga.organizerLogoUrl || liga.organizerLogoURL || liga.complejo?.organizerLogoUrl || liga.complejo?.organizerLogoURL;

  const regFeeEnabled = liga.paymentConfig?.registrationFeeEnabled === true && (liga.paymentConfig?.registrationFeeAmount ?? 0) > 0;
  const allResolvedEntries = [
    ...(regFeeEnabled ? resolveRegistrationEntries(roundPayments, liga) : []),
    ...rounds.flatMap((r: any) => resolveRoundEntries(r, roundPayments, liga)),
  ];
  const cntReview   = allResolvedEntries.filter((e:any)=>e.paymentStatus==="informo_transferencia"||e.paymentStatus==="in_review").length;
  const cntPagado   = allResolvedEntries.filter((e:any)=>e.paymentStatus==="pagado"||e.paymentStatus==="paid").length;
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
      icon: CalendarDays,
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
                <div className="flex flex-col gap-4">

                  {/* Summary */}
                  <div className="flex flex-col gap-0.5">
                    {liga.teamType==="pair" ? (
                      <>
                        <div className="text-sm font-bold text-[#5F7D72]">
                          Parejas completas cargadas {completePairsCount}/{minimumPlayersCount}
                        </div>
                        <div className={`text-xs font-bold ${missingPlayersCount===0?"text-[#086847]":"text-[#8A5700]"}`}>
                          {missingPlayersCount===0 ? "✓ Mínimo completo" : `Faltan ${missingPlayersCount} jugadores para llegar a ${pairPlayersTargetCount}.`}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm font-bold text-[#5F7D72]">
                          Jugadores cargados {players.length}/{minimumPlayersCount}
                          <span className="ml-3 font-semibold text-xs">Drive {driveCount}/{sideTargetCount} · Reves {revesCount}/{sideTargetCount}</span>
                        </div>
                        <div className={`text-xs font-bold ${players.length>=minimumPlayersCount?"text-[#086847]":"text-[#8A5700]"}`}>
                          {players.length>=minimumPlayersCount ? "✓ Mínimo completo" : `Faltan ${minimumPlayersCount-players.length} jugadores.`}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Solicitudes de inscripción */}
                  {pendingRequests.length>0 && (
                    <div className="bg-[#F2FBF4] border border-[#BFE6C8] rounded-2xl p-3">
                      <div className="text-[11px] font-black text-[#086847] uppercase tracking-wider text-center mb-2">Solicitudes de inscripción</div>
                      <div className="flex flex-col gap-2">
                        {pendingRequests.map((req:any)=>{
                          const rName=`${req.requester?.nombre??""} ${req.requester?.apellido??""}`.trim();
                          const pName=req.partner?`${req.partner?.nombre??""} ${req.partner?.apellido??""}`.trim():null;
                          return (
                            <div key={req.id} className="bg-white border border-[#CFE7DC] rounded-xl p-2.5 flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="font-black text-[#173A2E] text-sm truncate">{rName}</div>
                                {pName&&<div className="text-[11px] text-[#5F7D72] font-semibold">+ {pName}</div>}
                                <div className="text-[11px] text-[#5F7D72]">{req.status==="awaiting_partner"?"Esperando compañero":"Pendiente"}</div>
                              </div>
                              <button onClick={()=>handleConfirmRequest(req)} className="px-2.5 py-1.5 bg-[#086847] text-white text-[11px] font-black rounded-full whitespace-nowrap">Aceptar</button>
                              <button onClick={()=>handleRejectRequest(req.id)} className="px-2.5 py-1.5 bg-[#F4F5F7] border border-[#CFE7DC] text-[#5F7D72] text-[11px] font-black rounded-full whitespace-nowrap">Rechazar</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Header de sección + botón crear */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-[#173A2E]">
                      {liga.teamType==="pair" ? "Parejas de la liga" : "Jugadores de la liga"}
                    </span>
                    <button
                      onClick={()=>setGuestModalOpen(true)}
                      disabled={savingPlayers}
                      className="flex items-center gap-1.5 px-3 py-2 bg-[#086847] hover:bg-[#0B8457] text-white text-xs font-black rounded-xl transition-colors disabled:opacity-55"
                    >
                      <UserPlus size={14} /> Crear Jugador
                    </button>
                  </div>

                  {/* Búsqueda de jugadores registrados */}
                  <div>
                    <div className="relative mb-2">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5F7D72]" />
                      <input
                        type="text"
                        placeholder="Buscar jugadores de la plataforma..."
                        value={playerQuery}
                        onChange={e=>setPlayerQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 rounded-[18px] border border-[#CFE7DC] text-sm text-[#173A2E] bg-white focus:outline-none focus:border-[#1FAB89] placeholder:text-[#5F7D72]"
                      />
                    </div>

                    {!playersLoaded ? (
                      <div className="text-xs text-center text-[#5F7D72] py-2">Cargando jugadores...</div>
                    ) : (
                      <>
                        <div className="text-[11px] font-black text-[#5F7D72] uppercase tracking-wider text-center mb-2">
                          Jugadores registrados en la app
                        </div>
                        {filteredRegisteredPlayers.length===0 && playerQuery && (
                          <div className="bg-[#F7FBF9] border border-[#CFE7DC] rounded-[18px] p-3 text-center text-xs text-[#5F7D72] font-semibold mb-2">
                            Sin resultados para &ldquo;{playerQuery}&rdquo;
                          </div>
                        )}
                        <div className="flex flex-col gap-1.5 mb-2">
                          {filteredRegisteredPlayers.map((rp:any)=>{
                            const alreadyAdded=players.some((p:any)=>p.linkedUserId===rp.id);
                            const isReplaceMode=!!replacementTargetId;
                            return (
                              <div key={rp.id} className="bg-white border border-[#CFE7DC] rounded-[14px] flex items-center justify-between px-3 py-2 gap-2">
                                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                  {rp.foto
                                    ? <img src={rp.foto} className="w-7 h-7 rounded-full object-cover flex-shrink-0" alt="" />
                                    : <div className="w-7 h-7 rounded-full bg-[#E5E7EB] flex items-center justify-center flex-shrink-0"><UserIcon size={13} className="text-[#9CA3AF]"/></div>
                                  }
                                  <div className="min-w-0">
                                    <div className="text-[13px] font-black text-[#173A2E] truncate">{rp.nombre} {rp.apellido??""}</div>
                                    <div className="text-[11px] text-[#5F7D72] font-semibold">{rp.categoria}{rp.ciudad?` · ${rp.ciudad}`:""}</div>
                                  </div>
                                </div>
                                <button
                                  disabled={alreadyAdded||savingPlayers}
                                  onClick={()=>handleAddRegisteredPlayer(rp)}
                                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-black text-white flex-shrink-0 transition-colors ${alreadyAdded?"bg-[#A9C9BC] cursor-default":isReplaceMode?"bg-[#086847] hover:bg-[#0B8457]":"bg-[#0B8457] hover:bg-[#086847]"}`}
                                >
                                  {alreadyAdded ? "Agregado" : isReplaceMode ? <><ArrowLeftRight size={11}/> Reemplazar</> : <><Plus size={11}/> Agregar</>}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="h-px bg-[#CFE7DC]" />

                  {/* Lista principal de jugadores */}
                  {players.length===0 && (
                    <div className="bg-white border border-[#CFE7DC] rounded-[20px] p-6 text-center">
                      <div className="font-black text-[#173A2E] text-base mb-1">Sin jugadores</div>
                      <div className="text-[#5F7D72] text-sm">Sumá jugadores desde la búsqueda o creá nombres manuales para esta liga.</div>
                    </div>
                  )}

                  {liga.teamType==="pair" ? (
                    <div className="flex flex-col gap-1.5">
                      {pairGroups.map(({pairNumber:pn,players:pp})=>{
                        const isExpanded=expandedPairs.includes(pn);
                        const status=pp.length>=2?"Completa":pp.length===1?"1 libre":"2 libres";
                        const statusColor=pp.length>=2?"text-[#086847]":"text-[#8A5700]";
                        return (
                          <div key={pn} className="bg-white border border-[#CFE7DC] rounded-2xl px-4 py-2.5">
                            <button
                              className="w-full flex items-center justify-between"
                              onClick={()=>setExpandedPairs(prev=>prev.includes(pn)?prev.filter(n=>n!==pn):[...prev,pn])}
                            >
                              <span className="text-sm font-black text-[#173A2E]">Pareja {pn}</span>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-black ${statusColor}`}>{status}</span>
                                <ChevronDown size={15} className={`text-[#086847] transition-transform ${isExpanded?"rotate-180":""}`}/>
                              </div>
                            </button>
                            {!isExpanded&&pp.length>0&&(
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                {pp.map((p:any,i:number)=>(
                                  <div key={i} className="flex items-center gap-1">
                                    {p.foto?<img src={p.foto} className="w-4 h-4 rounded-full object-cover" alt=""/>:<div className="w-4 h-4 rounded-full bg-[#E5E7EB]"/>}
                                    <span className="text-xs font-bold text-[#173A2E]">{p.nombre}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {!isExpanded&&pp.length===0&&(
                              <div className="text-xs text-[#5F7D72] font-semibold mt-1.5">Sin jugadores asignados</div>
                            )}
                            {isExpanded&&(
                              <div className="mt-2 flex flex-col gap-1.5">
                                {pp.map((p:any)=>(
                                  <PlayerSlotRow key={p.id} player={p}
                                    onView={()=>openPlayerProfile(p)}
                                    onDelete={()=>handleDeletePlayer(p.id)}
                                    onSwap={p.type==="guest"?()=>setReplacementTargetId(replacementTargetId===p.id?"":p.id):undefined}
                                    isSwapActive={replacementTargetId===p.id}
                                  />
                                ))}
                                {Array.from({length:Math.max(0,2-pp.length)}).map((_,i)=>(
                                  <div key={`free-${i}`} className="bg-[#F7FBF9] border border-[#CFE7DC] rounded-xl flex items-center gap-2 px-3 py-2">
                                    <div className="w-7 h-7 rounded-full bg-[#EEF6F2] border border-[#CFE7DC] flex items-center justify-center">
                                      <UserIcon size={12} className="text-[#5F7D72]"/>
                                    </div>
                                    <span className="text-sm font-black text-[#5F7D72]">Libre</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {/* Botón nueva pareja vacía */}
                      <button
                        onClick={()=>assignToPair(nextPairNumber)}
                        disabled={savingPlayers}
                        className="flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-[#CFE7DC] rounded-2xl text-xs font-black text-[#5F7D72] hover:border-[#1FAB89] hover:text-[#086847] transition-colors disabled:opacity-55"
                      >
                        <Plus size={14}/> Nueva pareja vacía
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {players.map((p:any)=>(
                        <PlayerSlotRow key={p.id} player={p}
                          onView={()=>openPlayerProfile(p)}
                          onDelete={()=>handleDeletePlayer(p.id)}
                          onSwap={p.type==="guest"?()=>setReplacementTargetId(replacementTargetId===p.id?"":p.id):undefined}
                          isSwapActive={replacementTargetId===p.id}
                          showSide
                        />
                      ))}
                    </div>
                  )}

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
                  {/* Config badges */}
                  {liga.paymentConfig && (
                    <div className="flex gap-5 flex-wrap mb-4 text-sm">
                      {regFeeEnabled && (
                        <span className="text-pn-navy font-bold">Inscripción: <span className="text-pn-green">$ {liga.paymentConfig.registrationFeeAmount}</span></span>
                      )}
                      {liga.paymentConfig.roundPricePerPlayer > 0 && (
                        <span className="text-pn-navy font-bold">Por fecha: <span className="text-pn-green">$ {liga.paymentConfig.roundPricePerPlayer}</span></span>
                      )}
                    </div>
                  )}

                  {/* Resumen */}
                  {allResolvedEntries.length > 0 && (
                    <div className="flex gap-2 mb-5 flex-wrap">
                      <span className="border-2 border-pn-green text-pn-green text-xs font-bold px-4 py-1.5 rounded-full">Pagados {cntPagado}</span>
                      <span className="border-2 border-amber-400 text-amber-500 text-xs font-bold px-4 py-1.5 rounded-full">Verificar {cntReview}</span>
                      <span className="border-2 border-gray-200 text-gray-400 text-xs font-bold px-4 py-1.5 rounded-full">
                        Impagos {allResolvedEntries.length - cntPagado - cntReview}
                      </span>
                    </div>
                  )}

                  {!liga.paymentConfig && rounds.length === 0 && (
                    <p className="text-center text-gray-400 py-12">No hay pagos configurados.</p>
                  )}

                  {(() => {
                    // Armar lista de bloques: inscripción (si aplica) + fechas del fixture
                    const blocks: { id: string; title: string; amount: number; entries: any[] }[] = [];

                    if (regFeeEnabled) {
                      blocks.push({
                        id: REGISTRATION_ROUND_ID,
                        title: "Inscripción",
                        amount: liga.paymentConfig?.registrationFeeAmount ?? 0,
                        entries: resolveRegistrationEntries(roundPayments, liga),
                      });
                    }
                    rounds.forEach((round: any, ri: number) => {
                      blocks.push({
                        id: round.id,
                        title: round.title ?? `Fecha ${round.number ?? ri + 1}`,
                        amount: liga.paymentConfig?.roundPricePerPlayer ?? 0,
                        entries: resolveRoundEntries(round, roundPayments, liga),
                      });
                    });

                    if (blocks.length === 0) return null;

                    const toggleBlock = (id: string) => setOpenBlocks(p => ({...p, [id]: !p[id]}));

                    return (
                      <div className="flex flex-col gap-3">
                        {blocks.map((block) => {
                          const isOpen = openBlocks[block.id] !== false; // abierto por defecto
                          return (
                          <div key={block.id} className="rounded-2xl overflow-hidden border border-gray-100">
                            {/* Header del bloque — clickeable para colapsar */}
                            <button
                              onClick={()=>toggleBlock(block.id)}
                              className="w-full bg-pn-navy px-5 py-3 flex items-center justify-between hover:bg-pn-navy/90 transition-colors">
                              <ChevronLeft size={16} className={`text-gray-400 flex-shrink-0 transition-transform ${isOpen?"rotate-90":"-rotate-90"}`}/>
                              <span className="font-black text-white uppercase tracking-wide text-sm flex-1 text-center">{block.title}</span>
                              {block.amount > 0
                                ? <span className="text-xs text-gray-400 flex-shrink-0">$ {block.amount} / jugador</span>
                                : <span className="w-4"/>}
                            </button>

                            {isOpen && (
                              <>
                            {/* Columnas header */}
                            {block.entries.length > 0 && (
                              <div className="grid text-xs font-bold text-pn-green uppercase px-4 py-2 border-b border-gray-100"
                                style={{gridTemplateColumns:"1fr 80px 60px 95px 55px 80px"}}>
                                <div>Jugador</div>
                                <div className="text-center">Estado</div>
                                <div className="text-center">Modo</div>
                                <div className="text-center">Comprobante</div>
                                <div className="text-center">$</div>
                                <div/>
                              </div>
                            )}

                            <div className="divide-y divide-gray-50">
                              {block.entries.length === 0 && (
                                <div className="px-4 py-6 text-sm text-gray-400 text-center italic">Sin jugadores en este bloque</div>
                              )}
                              {block.entries.map((entry: any, ei: number) => {
                                const status = entry.paymentStatus ?? "pendiente";
                                const isPagado = status === "pagado" || status === "paid";
                                const isReview = status === "informo_transferencia" || status === "in_review";
                                const saveKey = `${block.id}:${entry.participantId}`;
                                const isSaving = savingPayment === saveKey;
                                const menuKey = `${block.id}:${entry.participantId}`;
                                const isMenuOpen = openMenu === menuKey;
                                const isPending = !isPagado && !isReview;
                                const waUrl = buildWhatsAppUrl(entry.participantId, block.title);
                                const player = lookupPlayer(entry.participantId);
                                const hasLinked = !!(player?.linkedUserId);

                                return (
                                  <div key={ei} className="grid items-center px-4 py-3 hover:bg-gray-50/50 transition-colors relative"
                                    style={{gridTemplateColumns:"1fr 80px 60px 95px 55px 80px"}}>

                                    {/* Jugador */}
                                    <div className="min-w-0 pr-2">
                                      <div className="font-bold text-pn-navy text-sm truncate">{entry.participantLabel || "Jugador"}</div>
                                      {entry.pairLabel && <div className="text-xs text-gray-400 truncate">{entry.pairLabel}</div>}
                                    </div>

                                    {/* Estado */}
                                    <div className="text-center">
                                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isPagado?"bg-green-50 text-pn-green":isReview?"bg-amber-50 text-amber-600":"bg-red-50 text-red-400"}`}>
                                        {isPagado ? "Pagado" : isReview ? "A verificar" : "Impago"}
                                      </span>
                                    </div>

                                    {/* Modo */}
                                    <div className="text-center text-xs text-gray-400">
                                      {entry.paymentMethod==="mercado_pago"?"MP":entry.paymentMethod==="efectivo"?"Efec.":entry.paymentMethod==="transferencia"?"Trans.":entry.paymentMethod||"-"}
                                    </div>

                                    {/* Comprobante */}
                                    <div className="text-center">
                                      {entry.proofUrl
                                        ? <button onClick={()=>setComprobanteUrl(entry.proofUrl)} className="text-xs text-pn-green font-bold hover:underline flex items-center gap-0.5 mx-auto"><Eye size={11}/>Ver</button>
                                        : <span className="text-xs text-gray-300">-</span>}
                                    </div>

                                    {/* Monto */}
                                    <div className="text-center text-xs font-bold text-pn-navy">{block.amount>0?`$ ${block.amount}`:""}</div>

                                    {/* Acciones: confirm/reject + ⋮ menú */}
                                    <div className="flex items-center justify-center gap-1">
                                      {/* Botón directo: Registrar pago (abre modal) */}
                                      {isSaving ? (
                                        <div className="w-7 h-7 flex items-center justify-center">
                                          <div className="w-4 h-4 border-2 border-pn-green border-t-transparent rounded-full animate-spin"/>
                                        </div>
                                      ) : isPagado ? (
                                        <div className="w-5 h-5 rounded-md bg-pn-green flex items-center justify-center mx-auto" title="Pagado">
                                          <Check size={10} className="text-white"/>
                                        </div>
                                      ) : isReview ? (
                                        /* En revisión: confirmar o rechazar rápido */
                                        <>
                                          <button onClick={()=>setPaymentStatus(block.id,entry.participantId,"pagado")} title="Confirmar pago" className="w-7 h-7 rounded-lg bg-pn-green hover:bg-green-600 flex items-center justify-center transition-colors"><Check size={13} className="text-white"/></button>
                                          <button onClick={()=>setPaymentStatus(block.id,entry.participantId,"pendiente")} title="Rechazar" className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors"><X size={13} className="text-red-400"/></button>
                                        </>
                                      ) : (
                                        /* Pendiente: ícono billete naranja para registrar pago */
                                        <button
                                          onClick={()=>{ setPaymentModal({blockId:block.id,blockTitle:block.title,entry}); setModalMethod("efectivo"); setModalFile(null); }}
                                          title="Registrar pago"
                                          className="w-7 h-7 rounded-lg bg-orange-50 hover:bg-orange-100 flex items-center justify-center transition-colors">
                                          <Banknote size={15} className="text-orange-400"/>
                                        </button>
                                      )}

                                      {/* ⋮ menú contextual */}
                                      <div className="relative">
                                        <button onClick={()=>setOpenMenu(isMenuOpen?null:menuKey)} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors">
                                          <MoreVertical size={14} className="text-gray-400"/>
                                        </button>
                                        {isMenuOpen && (
                                          <>
                                            <div className="fixed inset-0 z-20" onClick={()=>setOpenMenu(null)}/>
                                            <div className="absolute right-0 top-8 z-30 bg-white rounded-2xl shadow-xl border border-gray-100 py-1.5 w-56 overflow-hidden">
                                              {/* WhatsApp — siempre visible */}
                                              {waUrl ? (
                                                <a href={waUrl} target="_blank" rel="noreferrer"
                                                  onClick={()=>setOpenMenu(null)}
                                                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                                                  <Smartphone size={15} className="text-green-500 flex-shrink-0"/>
                                                  Enviar WhatsApp
                                                </a>
                                              ) : (
                                                <div className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 cursor-default" title="El jugador no tiene teléfono registrado">
                                                  <Smartphone size={15} className="flex-shrink-0"/>
                                                  Enviar WhatsApp
                                                </div>
                                              )}

                                              {/* Mensaje interno */}
                                              <button
                                                onClick={()=>{ setOpenMenu(null); sendReminderChat(entry, block.title); }}
                                                disabled={!hasLinked}
                                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:text-gray-300 disabled:hover:bg-transparent text-left"
                                                title={!hasLinked?"El jugador no tiene cuenta vinculada":""}>
                                                <MessageSquare size={15} className="text-blue-500 flex-shrink-0"/>
                                                Mensaje interno
                                              </button>

                                              {/* Marcar impago — solo cuando no es pendiente */}
                                              {!isPending && (
                                                <>
                                                  <div className="my-1 border-t border-gray-100"/>
                                                  <button onClick={()=>{ setOpenMenu(null); setPaymentStatus(block.id,entry.participantId,"pendiente"); }}
                                                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors text-left">
                                                    <X size={15} className="flex-shrink-0"/>
                                                    Marcar como impago
                                                  </button>
                                                </>
                                              )}
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    </div>

                                  </div>
                                );
                              })}
                            </div>
                            </>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    );
                  })()}
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

      {/* Modal registrar pago */}
      {paymentModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={()=>!uploadingProof&&setPaymentModal(null)}>
          <div className="bg-white rounded-3xl p-7 w-full max-w-md shadow-2xl" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-black text-pn-navy text-lg">Registrar pago</h3>
                <p className="text-sm text-gray-400 mt-0.5">{paymentModal.entry.participantLabel} · {paymentModal.blockTitle}</p>
              </div>
              <button onClick={()=>setPaymentModal(null)} disabled={uploadingProof}><X size={20} className="text-gray-400"/></button>
            </div>

            {/* Método de pago */}
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Método de pago</label>
            <div className="flex gap-3 mb-5">
              {(["efectivo","transferencia"] as const).map(m=>(
                <button key={m} onClick={()=>setModalMethod(m)}
                  className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all ${modalMethod===m?"border-pn-green bg-pn-mint text-pn-navy":"border-gray-100 text-gray-500 hover:border-gray-200"}`}>
                  {m==="efectivo"?"💵 Efectivo":"🏦 Transferencia"}
                </button>
              ))}
            </div>

            {/* Comprobante */}
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              Comprobante <span className="normal-case font-normal">(opcional)</span>
            </label>
            <div
              onClick={()=>fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-2xl p-5 text-center cursor-pointer hover:border-pn-green transition-colors mb-5">
              {modalFile ? (
                <div className="text-sm font-semibold text-pn-navy">{modalFile.name}</div>
              ) : paymentModal.entry.proofUrl ? (
                <div className="text-xs text-gray-400">Ya tiene comprobante — subí uno nuevo para reemplazarlo</div>
              ) : (
                <div className="text-xs text-gray-400">Tocá para adjuntar imagen o PDF</div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden"
                onChange={e=>setModalFile(e.target.files?.[0]??null)}/>
            </div>

            <div className="flex gap-3">
              <button onClick={()=>setPaymentModal(null)} disabled={uploadingProof}
                className="flex-1 py-3 rounded-xl border-2 border-gray-100 text-sm font-bold text-gray-500 disabled:opacity-50">Cancelar</button>
              <button onClick={savePaymentModal} disabled={uploadingProof}
                className="flex-1 py-3 rounded-xl bg-pn-green text-white text-sm font-black disabled:opacity-50 flex items-center justify-center gap-2">
                {uploadingProof ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Subiendo...</> : <><Check size={15}/>Confirmar pago</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal perfil jugador — replica PlayerDetailScreen de la app */}
      {playerProfile && (()=>{
        const pp = playerProfile;
        const foto = pp.foto || pp.avatarUrl || pp.fotoURL || "";
        const rawPhone = pp.telefono || pp.celular || pp.phone || pp.whatsapp || "";
        const countryCode = pp.countryCode || "+54";
        const displayPhone = rawPhone ? `${countryCode} ${rawPhone}`.trim() : "";
        let waHref = "";
        if (rawPhone) {
          let digits = rawPhone.replace(/\D/g,"");
          if (!digits.startsWith("54")) {
            if (digits.startsWith("0")) digits = digits.slice(1);
            digits = "54" + digits;
          }
          waHref = `https://wa.me/${digits}`;
        }
        const ciudad = [pp.ciudad, pp.provincia].filter(Boolean).join(", ");
        const isGuest = pp.type === "guest";
        const lado = pp.ladoJuego || pp.ladoPreferido || "";
        const fechaNac = pp.fechaNacimiento || "";
        const sinFecha = pp.linkedUserId && !fechaNac;
        const esMenor = pp.linkedUserId && fechaNac && esMenorRestringido(fechaNac);
        const mensajeBlockReason = sinFecha
          ? "No configuró su fecha de nacimiento"
          : esMenor ? `Mensajería no disponible para menores de ${EDAD_MINIMA_MENSAJES} años` : "";
        return (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={closePlayerProfile}>
            <div className="bg-[#F6FBF8] rounded-3xl w-full max-w-sm shadow-2xl relative overflow-hidden" style={{maxHeight:"90vh"}} onClick={e=>e.stopPropagation()}>

              {/* Orbs decorativos — capa fija, no scrolleable */}
              <div className="absolute top-0 right-0 w-44 h-44 rounded-full bg-[rgba(31,171,137,0.12)] -translate-y-10 translate-x-10 pointer-events-none"/>
              <div className="absolute bottom-20 left-0 w-52 h-52 rounded-full bg-[rgba(11,132,87,0.08)] -translate-x-12 pointer-events-none"/>

              <button onClick={profileView==="main" ? closePlayerProfile : ()=>setProfileView("main")}
                className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-white/80 hover:bg-white border border-[#CFE7DC] flex items-center justify-center transition-colors">
                <X size={15} className="text-[#5F7D72]"/>
              </button>

              {/* Contenido scrolleable */}
              <div className="overflow-y-auto" style={{maxHeight:"90vh"}}>
              <div className="p-5 pb-8 flex flex-col gap-3 relative">

                {/* Hero card */}
                <div className="bg-white rounded-[26px] border border-[#CFE7DC] p-5 flex flex-col items-center text-center" style={{boxShadow:"0 12px 18px rgba(23,58,46,0.08)"}}>
                  {profileLoading ? (
                    <div className="w-28 h-28 rounded-full bg-[#E5E7EB] flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-[#0B8457] border-t-transparent rounded-full animate-spin"/>
                    </div>
                  ) : foto ? (
                    <img src={foto} className="w-28 h-28 rounded-full object-cover"/>
                  ) : (
                    <div className="w-28 h-28 rounded-full bg-[#E5E7EB] flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="w-14 h-14 text-[#9CA3AF]" fill="currentColor">
                        <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                      </svg>
                    </div>
                  )}
                  <div className="font-extrabold text-[#173A2E] text-2xl mt-3 leading-tight text-center">
                    {`${pp.nombre||""} ${pp.apellido||""}`.trim()||"Jugador"}
                  </div>
                  {pp.categoria && <div className="font-bold text-[#0B8457] text-sm mt-1">{pp.categoria}</div>}
                  {ciudad && <div className="text-[#5F7D72] text-sm mt-1">{ciudad}</div>}
                  {isGuest && <span className="mt-2 text-xs bg-amber-50 text-amber-500 font-semibold px-2.5 py-0.5 rounded-full">Invitado</span>}
                </div>

                {/* Fila de tres info cards: Sexo / Mano hábil / Lado */}
                {(pp.sexo || pp.manoHabil || lado) && (
                  <div className="grid gap-2" style={{gridTemplateColumns:`repeat(${[pp.sexo,pp.manoHabil,lado].filter(Boolean).length},1fr)`}}>
                    {pp.sexo && (
                      <div className="bg-white rounded-[20px] border border-[#CFE7DC] p-3">
                        <div className="text-[10px] font-bold text-[#5F7D72] uppercase tracking-wide mb-1">Sexo</div>
                        <div className="font-bold text-[#173A2E] text-sm">{pp.sexo}</div>
                      </div>
                    )}
                    {pp.manoHabil && (
                      <div className="bg-white rounded-[20px] border border-[#CFE7DC] p-3">
                        <div className="text-[10px] font-bold text-[#5F7D72] uppercase tracking-wide mb-1">Mano hábil</div>
                        <div className="font-bold text-[#173A2E] text-sm">{pp.manoHabil}</div>
                      </div>
                    )}
                    {lado && (
                      <div className="bg-white rounded-[20px] border border-[#CFE7DC] p-3">
                        <div className="text-[10px] font-bold text-[#5F7D72] uppercase tracking-wide mb-1">Lado preferido</div>
                        <div className="font-bold text-[#173A2E] text-sm capitalize">{lado}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Descripción */}
                {pp.descripcion && (
                  <div className="bg-white rounded-[20px] border border-[#CFE7DC] p-4">
                    <div className="text-[11px] font-extrabold text-[#086847] uppercase tracking-wider mb-2">Descripción</div>
                    <div className="text-[#173A2E] text-sm leading-relaxed">{pp.descripcion}</div>
                  </div>
                )}

                {/* Celular (siempre visible para el organizador) */}
                {displayPhone && (
                  <div className="bg-white rounded-[20px] border border-[#CFE7DC] p-4">
                    <div className="text-[11px] font-extrabold text-[#086847] uppercase tracking-wider mb-2">Celular</div>
                    <div className="text-[#173A2E] text-sm font-bold">{displayPhone}</div>
                  </div>
                )}

                {/* Vista: componer mensaje */}
                {profileView === "message" && (
                  <div className="bg-white rounded-[20px] border border-[#CFE7DC] p-4 flex flex-col gap-3">
                    <div className="text-[11px] font-extrabold text-[#086847] uppercase tracking-wider">Mensaje a {`${pp.nombre||""}`.trim()}</div>
                    <textarea
                      value={profileMsgText} onChange={e=>setProfileMsgText(e.target.value)}
                      placeholder="Escribí tu mensaje..."
                      rows={3}
                      className="w-full text-sm text-[#173A2E] border border-[#CFE7DC] rounded-xl p-3 resize-none focus:outline-none focus:border-[#0B8457]"
                    />
                    <div className="flex gap-2">
                      <button onClick={()=>setProfileView("main")} className="flex-1 py-2.5 rounded-xl border-2 border-gray-100 text-sm font-bold text-gray-500">Cancelar</button>
                      <button onClick={sendProfileMessage} disabled={!profileMsgText.trim()||profileActionLoading}
                        className="flex-1 py-2.5 rounded-xl bg-pn-navy text-white text-sm font-black disabled:opacity-50 flex items-center justify-center gap-1.5">
                        {profileActionLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <><MessageSquare size={13}/>Enviar</>}
                      </button>
                    </div>
                  </div>
                )}

                {/* Vista: reportar perfil */}
                {profileView === "report" && (
                  <div className="bg-white rounded-[20px] border border-[#FFB866] p-4 flex flex-col gap-3">
                    <div className="text-[11px] font-extrabold text-[#C45B00] uppercase tracking-wider">Reportar perfil</div>
                    <textarea
                      value={profileReportText} onChange={e=>setProfileReportText(e.target.value)}
                      placeholder="Describí el motivo del reporte..."
                      rows={3}
                      className="w-full text-sm text-[#173A2E] border border-[#FFB866]/50 rounded-xl p-3 resize-none focus:outline-none focus:border-[#C45B00]"
                    />
                    <div className="flex gap-2">
                      <button onClick={()=>setProfileView("main")} className="flex-1 py-2.5 rounded-xl border-2 border-gray-100 text-sm font-bold text-gray-500">Cancelar</button>
                      <button onClick={submitProfileReport} disabled={!profileReportText.trim()||profileActionLoading}
                        className="flex-1 py-2.5 rounded-xl bg-[#FFF3E0] border border-[#FFB866] text-[#C45B00] text-sm font-black disabled:opacity-50 flex items-center justify-center gap-1.5">
                        {profileActionLoading ? <div className="w-4 h-4 border-2 border-[#C45B00] border-t-transparent rounded-full animate-spin"/> : "Enviar reporte"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Vista principal: botones de acción */}
                {profileView === "main" && (
                  <>
                    <div className="flex gap-3 mt-1">
                      {waHref && (
                        <a href={waHref} target="_blank"
                          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#25D366] text-white text-sm font-black hover:bg-[#20bc5a] transition-colors">
                          <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                          WhatsApp
                        </a>
                      )}
                      {pp.linkedUserId && (
                        <div className="flex-1 flex flex-col gap-1">
                          <button
                            onClick={mensajeBlockReason ? undefined : ()=>setProfileView("message")}
                            disabled={!!mensajeBlockReason}
                            title={mensajeBlockReason}
                            className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black transition-colors ${mensajeBlockReason ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-pn-navy text-white hover:bg-pn-navy/90"}`}>
                            <MessageSquare size={15}/>
                            Mensaje
                          </button>
                          {mensajeBlockReason && (
                            <div className="text-[10px] text-gray-400 text-center leading-tight px-1">{mensajeBlockReason}</div>
                          )}
                        </div>
                      )}
                    </div>
                    {pp.linkedUserId && (
                      <button onClick={()=>setProfileView("report")}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-2xl bg-[#FFF3E0] border border-[#FFB866] text-[#C45B00] text-xs font-black hover:bg-[#FFE0B2] transition-colors">
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
                        </svg>
                        Reportar perfil
                      </button>
                    )}
                  </>
                )}

              </div>
              </div>{/* fin scroll */}
            </div>
          </div>
        );
      })()}

      {/* ── Modal: crear jugador manual ──────────────────────────────── */}
      {guestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{background:"rgba(19,44,35,0.38)"}} onClick={()=>setGuestModalOpen(false)}>
          <div className="bg-white w-full max-w-lg rounded-t-[28px] px-6 pt-5 pb-8" onClick={e=>e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5"/>
            <h3 className="text-xl font-black text-[#173A2E] mb-1">Crear jugador</h3>
            <p className="text-sm text-[#5F7D72] mb-5">Este jugador solo existirá en esta liga (sin cuenta en la app).</p>
            <div className="flex flex-col gap-3 mb-5">
              <input
                type="text"
                placeholder="Nombre"
                value={guestName}
                onChange={e=>setGuestName(e.target.value)}
                className="w-full border border-[#CFE7DC] rounded-[18px] px-4 py-3 text-sm text-[#173A2E] focus:outline-none focus:border-[#1FAB89] placeholder:text-[#5F7D72]"
              />
              <input
                type="text"
                placeholder="Apellido"
                value={guestLastName}
                onChange={e=>setGuestLastName(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&handleGuestCreate()}
                className="w-full border border-[#CFE7DC] rounded-[18px] px-4 py-3 text-sm text-[#173A2E] focus:outline-none focus:border-[#1FAB89] placeholder:text-[#5F7D72]"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={()=>setGuestModalOpen(false)} className="flex-1 py-3 rounded-2xl bg-[#ECF8F2] border border-[#CFE7DC] text-sm font-black text-[#173A2E]">Cancelar</button>
              <button onClick={handleGuestCreate} disabled={!guestName.trim()||!guestLastName.trim()} className="flex-1 py-3 rounded-2xl bg-[#0B8457] text-white text-sm font-black disabled:opacity-55">
                Siguiente →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: elegir lado Drive/Reves (liga individual) ─────────── */}
      {sidePickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(19,44,35,0.38)"}} onClick={()=>{setSidePickerOpen(false);setPendingPlayer(null);setPendingIsGuest(false);}}>
          <div className="bg-white border border-[#CFE7DC] rounded-[24px] p-6 w-full max-w-sm shadow-2xl" onClick={e=>e.stopPropagation()}>
            <h3 className="text-lg font-black text-[#173A2E] mb-2">¿Qué lado juega?</h3>
            <p className="text-sm text-[#5F7D72] mb-5">
              {pendingIsGuest ? `${guestName} ${guestLastName}` : `${pendingPlayer?.nombre ?? ""} ${pendingPlayer?.apellido ?? ""}`}
            </p>
            <div className="flex gap-3">
              <button onClick={()=>assignToSide("drive")} className="flex-1 py-3 rounded-2xl bg-[#0B8457] text-white text-sm font-black hover:bg-[#086847] transition-colors">Drive</button>
              <button onClick={()=>assignToSide("reves")} className="flex-1 py-3 rounded-2xl bg-[#0B8457] text-white text-sm font-black hover:bg-[#086847] transition-colors">Reves</button>
            </div>
            <button onClick={()=>{setSidePickerOpen(false);setPendingPlayer(null);setPendingIsGuest(false);}} className="w-full mt-3 py-2.5 text-sm font-bold text-[#5F7D72]">Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Modal: elegir pareja (liga pair) ─────────────────────────── */}
      {pairPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{background:"rgba(19,44,35,0.38)"}} onClick={()=>{setPairPickerOpen(false);setPendingPlayer(null);setPendingIsGuest(false);}}>
          <div className="bg-white w-full max-w-lg rounded-t-[28px] px-5 pt-5 pb-8 max-h-[75vh] flex flex-col" onClick={e=>e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4"/>
            <h3 className="text-lg font-black text-[#173A2E] mb-1">Asignar a una pareja</h3>
            <p className="text-sm text-[#5F7D72] mb-4">
              {pendingIsGuest ? `${guestName} ${guestLastName}` : `${pendingPlayer?.nombre ?? ""} ${pendingPlayer?.apellido ?? ""}`}
            </p>
            <div className="overflow-y-auto flex flex-col gap-2 flex-1 pb-2">
              {pairGroups.map(({pairNumber:pn,players:pp})=>{
                const isFull=pp.length>=2;
                return (
                  <div key={pn} className="bg-[#F7FBF9] border border-[#CFE7DC] rounded-xl px-3 py-2.5 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-black text-[#173A2E]">Pareja {pn}</div>
                      <div className="text-[11px] text-[#5F7D72] font-semibold">
                        {pp.length===0?"Sin jugadores":pp.map((p:any)=>`${p.nombre} ${p.apellido??""}`).join(" / ")}
                      </div>
                    </div>
                    <button
                      onClick={()=>assignToPair(pn)}
                      disabled={isFull||savingPlayers}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-black text-white whitespace-nowrap transition-colors ${isFull?"bg-[#A9C9BC] cursor-not-allowed":"bg-[#0B8457] hover:bg-[#086847]"}`}
                    >
                      {isFull ? "Completa" : "Asignar aquí"}
                    </button>
                  </div>
                );
              })}
              <button
                onClick={()=>assignToPair(nextPairNumber)}
                disabled={savingPlayers}
                className="flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-[#CFE7DC] rounded-xl text-xs font-black text-[#5F7D72] hover:border-[#1FAB89] hover:text-[#086847] transition-colors"
              >
                <Plus size={13}/> Nueva pareja
              </button>
            </div>
            <button onClick={()=>{setPairPickerOpen(false);setPendingPlayer(null);setPendingIsGuest(false);}} className="mt-3 py-2.5 text-sm font-bold text-[#5F7D72] text-center">Cancelar</button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-bold transition-all ${toast.ok?"bg-pn-green":"bg-red-500"}`}>
          {toast.ok ? <Check size={16}/> : <X size={16}/>}
          {toast.msg}
        </div>
      )}
    </DashboardLayout>
  );
}
