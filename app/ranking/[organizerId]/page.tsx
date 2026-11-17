"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, Trophy, AlertCircle, Building2 } from "lucide-react";

type RankingRow = { key: string; name: string; points: number; rank: number };

type PublicRankingData = {
  organizerId: string;
  organizerName: string;
  organizerLogoUrl: string;
  venueName: string;
  categories: string[];
  rankingsByCategory: Record<string, RankingRow[]>;
};

const GET_PUBLIC_ORGANIZER_RANKING_URL =
  "https://southamerica-east1-padelnexo-7e4d5.cloudfunctions.net/getPublicOrganizerRanking";

export default function PublicOrganizerRankingPage() {
  const params = useParams();
  const organizerId = String(params?.organizerId ?? "");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [data, setData] = useState<PublicRankingData | null>(null);
  const [activeCategory, setActiveCategory] = useState("");

  useEffect(() => {
    if (!organizerId) return;
    (async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({ organizerId });
        const response = await fetch(`${GET_PUBLIC_ORGANIZER_RANKING_URL}?${params.toString()}`, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json?.error || "No pudimos cargar el ranking.");
        setData(json);
        setActiveCategory(json.categories?.[0] ?? "");
      } catch (error: any) {
        setLoadError(error?.message || "No pudimos cargar el ranking.");
      } finally {
        setLoading(false);
      }
    })();
  }, [organizerId]);

  const rows = data?.rankingsByCategory?.[activeCategory] ?? [];

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#F6FBF8" }}>
      <div className="w-full max-w-md">
        <div className="rounded-[22px] shadow-sm border p-6" style={{ background: "#FFFFFF", borderColor: "#CFE7DC" }}>
          {loading ? (
            <div className="flex flex-col items-center py-10 gap-3">
              <Loader2 size={28} className="animate-spin" style={{ color: "#0B8457" }} />
              <p className="text-sm font-semibold" style={{ color: "#5F7D72" }}>Cargando ranking…</p>
            </div>
          ) : loadError || !data ? (
            <div className="flex flex-col items-center py-10 gap-3 text-center">
              <AlertCircle size={28} style={{ color: "#B24343" }} />
              <p className="text-sm font-bold" style={{ color: "#173A2E" }}>{loadError || "No encontramos este ranking."}</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center text-center mb-4">
                {data.organizerLogoUrl ? (
                  <img src={data.organizerLogoUrl} alt="Logo" className="w-16 h-16 rounded-full object-cover mb-2" />
                ) : (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mb-2" style={{ background: "#F3FAF6", border: "1px solid #D5EADF" }}>
                    <Trophy size={26} style={{ color: "#086847" }} />
                  </div>
                )}
                {data.venueName && (
                  <p className="text-sm font-bold flex items-center gap-1.5 mb-0.5" style={{ color: "#2F8FCF" }}>
                    <Building2 size={14} /> {data.venueName}
                  </p>
                )}
                <h1 className="font-black text-2xl" style={{ color: "#1FAB89" }}>Ranking</h1>
                {data.organizerName && (
                  <p className="text-xs font-bold mt-0.5" style={{ color: "#5F7D72" }}>{data.organizerName}</p>
                )}
              </div>

              {data.categories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 justify-center mb-4">
                  {data.categories.map((category) => (
                    <button
                      key={category}
                      onClick={() => setActiveCategory(category)}
                      className="text-xs font-bold px-3 py-1.5 rounded-full border transition-colors"
                      style={category === activeCategory
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
