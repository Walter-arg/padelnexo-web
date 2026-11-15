// Portado desde src/services/mercadoPagoConfigService.js y
// mercadoPagoOAuthService.js (app movil). El flujo OAuth real vive en las
// Cloud Functions mercadoPagoOAuthStart / mercadoPagoOAuthComplete, que ya
// soportan volver a una URL propia (nativeRedirectUri) en vez de abrir la
// app — por eso se puede reusar tal cual desde la web, sin tocar nada en
// Mercado Pago ni en el backend.

const MERCADO_PAGO_OAUTH_START_URL =
  "https://southamerica-east1-padelnexo-7e4d5.cloudfunctions.net/mercadoPagoOAuthStart";
const MERCADO_PAGO_OAUTH_COMPLETE_URL =
  "https://southamerica-east1-padelnexo-7e4d5.cloudfunctions.net/mercadoPagoOAuthComplete";

export type MercadoPagoCategories = { turnos: boolean; ligas: boolean; torneos: boolean };

export type MercadoPagoConfig = {
  enabled: boolean;
  accountLinked: boolean;
  autoEnableNewPayments: boolean;
  accountDisplayName: string;
  connectionStatus: string;
  categories: MercadoPagoCategories;
};

export const DEFAULT_MERCADO_PAGO_CONFIG: MercadoPagoConfig = {
  enabled: false,
  accountLinked: false,
  autoEnableNewPayments: false,
  accountDisplayName: "",
  connectionStatus: "checkout_pro_test",
  categories: { turnos: true, ligas: true, torneos: true },
};

export function normalizeMercadoPagoConfig(config: any = {}): MercadoPagoConfig {
  const categories = config?.categories && typeof config.categories === "object" ? config.categories : {};

  return {
    ...DEFAULT_MERCADO_PAGO_CONFIG,
    enabled: config?.enabled === true,
    accountLinked: config?.accountLinked === true,
    autoEnableNewPayments: config?.autoEnableNewPayments === true,
    accountDisplayName: String(config?.accountDisplayName || "").trim(),
    connectionStatus:
      String(config?.connectionStatus || DEFAULT_MERCADO_PAGO_CONFIG.connectionStatus).trim() ||
      DEFAULT_MERCADO_PAGO_CONFIG.connectionStatus,
    categories: {
      turnos: categories.turnos !== false,
      ligas: categories.ligas !== false,
      torneos: categories.torneos !== false,
    },
  };
}

// La pagina a la que Mercado Pago (via mercadoPagoOAuthRedirect) nos manda
// de vuelta con ?code&state&sessionId. Debe ser siempre la misma string,
// tanto al iniciar como al completar la vinculacion.
export function buildMercadoPagoWebRedirectUri(): string {
  return `${window.location.origin}/dashboard/perfil`;
}

export async function startMercadoPagoOAuth(organizerId: string): Promise<void> {
  const redirectUri = buildMercadoPagoWebRedirectUri();
  const params = new URLSearchParams({ organizerId, platform: "web", redirectUri });
  const response = await fetch(`${MERCADO_PAGO_OAUTH_START_URL}?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data?.authUrl) {
    throw new Error(data?.error || "No pudimos iniciar la vinculacion con Mercado Pago.");
  }

  window.location.href = data.authUrl;
}

export async function completeMercadoPagoOAuth({
  organizerId,
  code,
  state,
  sessionId,
}: {
  organizerId: string;
  code: string;
  state: string;
  sessionId: string;
}) {
  const redirectUri = buildMercadoPagoWebRedirectUri();
  const response = await fetch(MERCADO_PAGO_OAUTH_COMPLETE_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ organizerId, redirectUri, code, state, sessionId, platform: "web" }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || "No pudimos completar la vinculacion con Mercado Pago.");
  }

  return data;
}
