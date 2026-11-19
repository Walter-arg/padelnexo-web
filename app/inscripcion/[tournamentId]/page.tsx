import type { Metadata } from "next";
import InscripcionClient from "./InscripcionClient";

const GET_PUBLIC_TOURNAMENT_INFO_URL =
  "https://southamerica-east1-padelnexo-7e4d5.cloudfunctions.net/getPublicTournamentInfo";

async function fetchTournamentMeta(tournamentId: string) {
  try {
    const params = new URLSearchParams({ tournamentId });
    const response = await fetch(`${GET_PUBLIC_TOURNAMENT_INFO_URL}?${params.toString()}`, {
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
  params: Promise<{ tournamentId: string }>;
}): Promise<Metadata> {
  const { tournamentId } = await params;
  const data = await fetchTournamentMeta(tournamentId);
  const clubLabel = data?.venueName || data?.organizerName || "";
  const tournamentName = data?.name || "este torneo";
  const title = `Inscripción a ${tournamentName}${clubLabel ? ` · ${clubLabel}` : ""}`;
  const description = clubLabel
    ? `Anotate al torneo de pádel "${tournamentName}", organizado por ${clubLabel}.`
    : `Anotate al torneo de pádel "${tournamentName}".`;
  const image = data?.coverImage || data?.organizerLogoUrl;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: "PadelNexo",
      locale: "es_AR",
      type: "website",
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function PublicTournamentRegistrationPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  return <InscripcionClient tournamentId={tournamentId} />;
}
