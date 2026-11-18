import type { Metadata } from "next";
import RankingClient from "./RankingClient";

const GET_PUBLIC_ORGANIZER_RANKING_URL =
  "https://southamerica-east1-padelnexo-7e4d5.cloudfunctions.net/getPublicOrganizerRanking";

async function fetchRankingMeta(organizerId: string) {
  try {
    const params = new URLSearchParams({ organizerId });
    const response = await fetch(`${GET_PUBLIC_ORGANIZER_RANKING_URL}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ organizerId: string }>;
}): Promise<Metadata> {
  const { organizerId } = await params;
  const data = await fetchRankingMeta(organizerId);
  const clubLabel = data?.venueName || data?.organizerName || "este organizador";
  const title = `Ranking de torneos de ${clubLabel}`;
  const description = `Mirá el ranking de torneos de pádel de ${clubLabel}, actualizado por categoría.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: "PadelNexo",
      locale: "es_AR",
      type: "website",
      ...(data?.organizerLogoUrl ? { images: [{ url: data.organizerLogoUrl }] } : {}),
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function PublicOrganizerRankingPage({
  params,
}: {
  params: Promise<{ organizerId: string }>;
}) {
  const { organizerId } = await params;
  return <RankingClient organizerId={organizerId} />;
}
