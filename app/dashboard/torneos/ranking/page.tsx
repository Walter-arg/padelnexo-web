"use client";

import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Trophy, Loader2, Building2, Settings, X, Link2, ImageDown, RefreshCw,
} from "lucide-react";
import {
  buildOrganizerRanking,
  getOrganizerRankingConfig,
  listOrganizerTournamentRankingEntries,
  resetOrganizerRanking,
  updateOrganizerRankingConfig,
  type OrganizerRankingConfig,
  type TournamentRankingEntry,
} from "@/lib/tournamentRanking";

const PUBLIC_RANKING_BASE_URL = "https://www.padelnexo.com.ar/ranking";

function formatConfigDate(millis?: number) {
  if (!millis) return "Sin definir";
  return new Date(millis).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function millisToInputValue(millis?: number) {
  if (!millis) return "";
  return new Date(millis).toISOString().slice(0, 10);
}

function inputValueToMillis(value: string) {
  if (!value) return 0;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
}

export default function TournamentRankingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [organizerId, setOrganizerId] = useState("");
  const [organizerProfile, setOrganizerProfile] = useState<any>(null);
  const [entries, setEntries] = useState<TournamentRankingEntry[]>([]);
  const [config, setConfig] = useState<OrganizerRankingConfig>({ fromMillis: 0, toMillis: 0 });
  const [activeCategory, setActiveCategory] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [draftConfig, setDraftConfig] = useState<OrganizerRankingConfig>({ fromMillis: 0, toMillis: 0 });
  const [savingConfig, setSavingConfig] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [sharingImage, setSharingImage] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function loadRanking(uid: string) {
    setLoading(true);
    const [organizerSnapshot, nextEntries, nextConfig] = await Promise.all([
      getDoc(doc(db, "users", uid)),
      listOrganizerTournamentRankingEntries(uid),
      getOrganizerRankingConfig(uid),
    ]);
    setOrganizerProfile(organizerSnapshot.exists() ? organizerSnapshot.data() : null);
    setEntries(nextEntries);
    setConfig(nextConfig);
    setLoading(false);
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) { router.push("/login"); return; }
      setOrganizerId(u.uid);
      loadRanking(u.uid);
    });
    return unsub;
  }, [router]);

  const { categories, rankingsByCategory } = buildOrganizerRanking(entries, config);
  const currentCategory = categories.includes(activeCategory) ? activeCategory : categories[0] ?? "";
  const rows = rankingsByCategory[currentCategory] ?? [];
  const venueName = organizerProfile?.complejos?.[0]?.nombre ?? "";

  function openConfig() {
    setDraftConfig(config);
    setConfigOpen(true);
  }

  async function handleSaveConfig() {
    setSavingConfig(true);
    try {
      await updateOrganizerRankingConfig(organizerId, draftConfig);
      setConfig(draftConfig);
      setConfigOpen(false);
      showToast("Configuración guardada.");
    } catch {
      showToast("No pudimos guardar la configuración.", false);
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleReset() {
    setSavingConfig(true);
    try {
      const fromMillis = await resetOrganizerRanking(organizerId);
      const nextConfig = { fromMillis, toMillis: 0 };
      setConfig(nextConfig);
      setDraftConfig(nextConfig);
      setConfigOpen(false);
      showToast("Ranking reseteado: arranca de cero desde hoy.");
    } catch {
      showToast("No pudimos resetear el ranking.", false);
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleCopyLink() {
    const url = `${PUBLIC_RANKING_BASE_URL}/${organizerId}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copiado. Compartilo con tus jugadores.");
    } catch {
      showToast("No pudimos copiar el link.", false);
    }
  }

  async function handleShareImage() {
    if (!shareRef.current) return;
    setSharingImage(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(shareRef.current, { backgroundColor: "#FFFFFF", pixelRatio: 2 });
      const link = document.createElement("a");
      link.download = `ranking-${currentCategory || "torneos"}.png`;
      link.href = dataUrl;
      link.click();
      showToast("Imagen descargada.");
    } catch {
      showToast("No pudimos generar la imagen.", false);
    } finally {
      setSharingImage(false);
    }
  }

  return (
    <DashboardLayout title="Ranking">
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={32} className="animate-spin" style={{ color: "#086847" }} />
        </div>
      ) : (
        <div className="max-w-xl mx-auto">
          <div ref={shareRef} className="rounded-2xl border p-6 mb-4" style={{ background: "#FFFFFF", borderColor: "#CFE7DC" }}>
            <div className="flex flex-col items-center text-center mb-4">
              {organizerProfile?.organizerLogoUrl ? (
                <img src={organizerProfile.organizerLogoUrl} alt="Logo" className="w-16 h-16 rounded-full object-cover mb-2" />
              ) : (
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-2" style={{ background: "#F3FAF6", border: "1px solid #D5EADF" }}>
                  <Trophy size={26} style={{ color: "#086847" }} />
                </div>
              )}
              {venueName && (
                <p className="text-sm font-bold flex items-center gap-1.5 mb-0.5" style={{ color: "#2F8FCF" }}>
                  <Building2 size={14} /> {venueName}
                </p>
              )}
              <h1 className="font-black text-2xl" style={{ color: "#1FAB89" }}>Ranking</h1>
              {organizerProfile?.name && (
                <p className="text-xs font-bold mt-0.5" style={{ color: "#5F7D72" }}>{organizerProfile.name}</p>
              )}
            </div>

            {categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5 justify-center mb-4">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setActiveCategory(category)}
                    className="text-xs font-bold px-3 py-1.5 rounded-full border transition-colors"
                    style={category === currentCategory
                      ? { background: "#086847", borderColor: "#086847", color: "#FFFFFF" }
                      : { background: "#F6FBF8", borderColor: "#CFE7DC", color: "#5F7D72" }}
                  >
                    {category}
                  </button>
                ))}
              </div>
            )}

            {rows.length === 0 ? (
              <div className="text-center py-10">
                <Trophy size={32} className="mx-auto mb-2" style={{ color: "#CFE7DC" }} />
                <p className="text-sm font-semibold" style={{ color: "#5F7D72" }}>
                  Todavía no hay torneos finalizados que sumen a este ranking.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="flex px-3 py-1 text-[11px] font-black uppercase" style={{ color: "#9BB8AE" }}>
                  <span className="w-8">#</span>
                  <span className="flex-1">Jugador</span>
                  <span className="w-12 text-right">Pts</span>
                </div>
                {rows.map((row) => (
                  <div key={row.key} className="flex items-center rounded-xl border px-3 py-2" style={{ borderColor: "#CFE7DC", background: "#FFFFFF" }}>
                    <span className="w-8 font-black" style={{ color: "#5F7D72" }}>{row.rank}</span>
                    <span className="flex-1 font-bold truncate" style={{ color: "#173A2E" }}>{row.name}</span>
                    <span className="w-12 text-right font-black" style={{ color: "#086847" }}>{row.points}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 mb-2">
            <button onClick={handleCopyLink}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold border"
              style={{ borderColor: "#CFE7DC", color: "#086847", background: "#F0F7F4" }}>
              <Link2 size={15} /> Copiar link
            </button>
            <button onClick={handleShareImage} disabled={sharingImage}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold border disabled:opacity-50"
              style={{ borderColor: "#CFE7DC", color: "#086847", background: "#F0F7F4" }}>
              <ImageDown size={15} /> {sharingImage ? "Generando..." : "Descargar imagen"}
            </button>
          </div>

          <button onClick={openConfig}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold border"
            style={{ borderColor: "#CFE7DC", color: "#5F7D72" }}>
            <Settings size={15} /> Configurar ranking
          </button>
        </div>
      )}

      {configOpen && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={() => setConfigOpen(false)}>
          <div className="bg-white rounded-[22px] p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-lg" style={{ color: "#086847" }}>Configurar ranking</h3>
              <button onClick={() => setConfigOpen(false)}><X size={16} style={{ color: "#5F7D72" }} /></button>
            </div>

            <p className="text-xs font-semibold mb-3" style={{ color: "#5F7D72" }}>
              Elegí desde y hasta qué fecha se tienen en cuenta los torneos para este ranking.
            </p>

            <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>Desde</label>
            <input type="date" value={millisToInputValue(draftConfig.fromMillis)}
              onChange={(e) => setDraftConfig((c) => ({ ...c, fromMillis: inputValueToMillis(e.target.value) }))}
              className="w-full border rounded-xl px-3 py-2 text-sm mb-3" style={{ borderColor: "#CFE7DC" }} />

            <label className="text-xs font-bold block mb-1" style={{ color: "#5F7D72" }}>Hasta</label>
            <input type="date" value={millisToInputValue(draftConfig.toMillis)}
              onChange={(e) => setDraftConfig((c) => ({ ...c, toMillis: inputValueToMillis(e.target.value) }))}
              className="w-full border rounded-xl px-3 py-2 text-sm mb-4" style={{ borderColor: "#CFE7DC" }} />

            <button onClick={handleReset} disabled={savingConfig}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold border mb-4 disabled:opacity-50"
              style={{ borderColor: "#F1C8C8", color: "#B24343", background: "#FFF1F1" }}>
              <RefreshCw size={14} /> Resetear ranking a cero
            </button>

            <div className="flex gap-3">
              <button onClick={() => setConfigOpen(false)}
                className="flex-1 py-3 rounded-xl text-sm font-black border" style={{ background: "#ECF8F2", borderColor: "#CFE7DC", color: "#173A2E" }}>
                Cancelar
              </button>
              <button onClick={handleSaveConfig} disabled={savingConfig}
                className="flex-1 py-3 rounded-xl text-sm font-black text-white disabled:opacity-40" style={{ background: "#0B8457" }}>
                {savingConfig ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-full text-sm font-bold shadow-lg z-[200]"
          style={{ background: toast.ok ? "#086847" : "#B24343", color: "#FFFFFF" }}>
          {toast.msg}
        </div>
      )}
    </DashboardLayout>
  );
}
