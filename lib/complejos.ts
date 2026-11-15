// Portado desde src/services/organizerService.js (app movil) para guardar
// los complejos/canchas del organizador con la misma forma que usa la app
// (en particular, localidad anidada en vez de ciudad/provincia planos).

export type Cancha = {
  id: string;
  nombre: string;
  estructura: "blindex" | "cemento";
  piso: "sintetico" | "cemento";
  ambiente: "cubierta" | "aire_libre";
};

export type Complejo = {
  nombre: string;
  direccion: string;
  canchaAmbiente: "cubierta" | "descubierta";
  canchas: Cancha[];
  blindex: number;
  cesped: number;
  cemento: number;
  totalCanchas: number;
  coordinates: { latitude: number; longitude: number } | null;
  localidad: { nombre: string; provincia: string; pais: string };
};

export function createEmptyCancha(index = 0): Cancha {
  return {
    id: `court-${Date.now()}-${index}`,
    nombre: "",
    estructura: "blindex",
    piso: "sintetico",
    ambiente: "aire_libre",
  };
}

export function createEmptyComplejo(): Complejo {
  return {
    nombre: "",
    direccion: "",
    canchaAmbiente: "descubierta",
    canchas: [],
    blindex: 0,
    cesped: 0,
    cemento: 0,
    totalCanchas: 0,
    coordinates: null,
    localidad: { nombre: "", provincia: "", pais: "Argentina" },
  };
}

function normalizeCancha(cancha: any = {}, index = 0): Cancha {
  const estructura = cancha.estructura === "cemento" ? "cemento" : "blindex";
  const piso = cancha.piso === "cemento" ? "cemento" : "sintetico";
  const ambiente = cancha.ambiente === "cubierta" ? "cubierta" : "aire_libre";

  return {
    id: cancha.id || `court-${index + 1}`,
    nombre: String(cancha.nombre || "").trim(),
    estructura,
    piso,
    ambiente,
  };
}

function countCourtsByType(canchas: Cancha[] = []) {
  return canchas.reduce(
    (counts, court) => {
      if (court.estructura === "blindex") counts.blindex += 1;
      else if (court.piso === "sintetico") counts.cesped += 1;
      else counts.cemento += 1;
      return counts;
    },
    { blindex: 0, cemento: 0, cesped: 0 }
  );
}

// Equivalente a normalizeComplex en organizerService.js: lo que se escribe
// en users/{uid}.complejos debe tener exactamente esta forma para que la
// app pueda leerlo (localidad anidada, no ciudad/provincia planos).
export function normalizeComplejo(complejo: any = {}): Complejo {
  const canchas = Array.isArray(complejo.canchas) ? complejo.canchas.map(normalizeCancha) : [];
  const counts = countCourtsByType(canchas);

  return {
    nombre: String(complejo.nombre || "").trim(),
    direccion: String(complejo.direccion || "").trim(),
    canchaAmbiente: complejo.canchaAmbiente === "cubierta" ? "cubierta" : "descubierta",
    canchas,
    blindex: counts.blindex,
    cesped: counts.cesped,
    cemento: counts.cemento,
    totalCanchas: canchas.length,
    coordinates: complejo.coordinates || null,
    localidad: {
      nombre: String(complejo.localidad?.nombre || "").trim(),
      provincia: String(complejo.localidad?.provincia || "").trim(),
      pais: complejo.localidad?.pais || "Argentina",
    },
  };
}
