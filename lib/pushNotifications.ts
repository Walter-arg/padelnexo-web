// La web no tiene token push (eso solo existe en builds nativos de la app),
// asi que para que un aviso enviado desde la web tambien llegue como
// notificacion al telefono, se delega en la Cloud Function
// sendPushNotification, que hace el mismo fetch a Expo que ya hace
// pushNotificationsService.js del lado de la app.

const SEND_PUSH_NOTIFICATION_URL =
  "https://southamerica-east1-padelnexo-7e4d5.cloudfunctions.net/sendPushNotification";

export async function sendPushNotification({
  recipientId,
  title,
  body,
  data,
}: {
  recipientId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<void> {
  if (!recipientId || !body) return;

  try {
    await fetch(SEND_PUSH_NOTIFICATION_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ recipientId, title, body, data }),
    });
  } catch {
    // Un push que no sale no debe romper la accion principal (confirmar/agregar pareja).
  }
}
