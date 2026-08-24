import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Eliminar cuenta | PadelNexo",
  description: "Cómo solicitar la eliminación de tu cuenta de PadelNexo y qué pasa con tus datos.",
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-8">
    <h2 className="text-xl font-black text-app-heading mb-3">{title}</h2>
    <div className="text-gray-600 leading-relaxed space-y-3">{children}</div>
  </section>
);

export default function EliminarCuentaPage() {
  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(160deg, #e8f5ee 0%, #f0faf5 60%, #ffffff 100%)" }}>
      <header className="bg-white/80 backdrop-blur border-b border-gray-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <img src="/logopn.png" alt="PadelNexo" className="h-9 w-auto" />
            <span className="font-black text-app-heading text-lg">PadelNexo</span>
          </a>
          <a href="/" className="text-sm text-app-muted hover:text-app-heading transition-colors">← Volver al inicio</a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-black text-app-heading mb-2">Eliminar tu cuenta de PadelNexo</h1>
          <p className="text-app-muted text-sm">Cómo solicitarlo y qué pasa con tus datos</p>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-sm">

          <Section title="Cómo eliminar tu cuenta">
            <p>
              Podés eliminar tu cuenta de PadelNexo en cualquier momento, directamente desde la
              aplicación:
            </p>
            <ol className="list-decimal list-inside space-y-2 ml-2">
              <li>Abrí la app <strong>PadelNexo</strong> e iniciá sesión con tu cuenta.</li>
              <li>Andá a tu <strong>Perfil</strong> (ícono de usuario o tu avatar).</li>
              <li>Buscá la opción <strong>"Eliminar cuenta"</strong> dentro de la configuración de tu perfil.</li>
              <li>Confirmá la eliminación cuando la app te lo pida.</li>
            </ol>
            <p className="mt-3">
              La eliminación se procesa de inmediato — no hace falta contactar a soporte ni esperar
              una respuesta manual, aunque también podés escribirnos a{" "}
              <a href="mailto:soporte.padelnexo@gmail.com" className="text-pn-green hover:underline font-semibold">
                soporte.padelnexo@gmail.com
              </a>{" "}
              si preferís pedirlo por ese medio o tenés algún problema con el proceso dentro de la app.
            </p>
          </Section>

          <Section title="Qué datos se eliminan">
            <p>Al eliminar tu cuenta, esto se borra de inmediato y de forma permanente:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Tu acceso a la cuenta (no vas a poder volver a iniciar sesión con ella)</li>
              <li>Tu email y teléfono reales</li>
              <li>Tu foto de perfil</li>
              <li>La descripción, categoría, ubicación y demás datos de tu perfil</li>
              <li>Todas tus conversaciones y mensajes dentro de la app, incluso los que le enviaste a otros usuarios</li>
              <li>Los bloqueos entre vos y otros usuarios</li>
            </ul>
            <p className="mt-3">
              Tu nombre queda reemplazado por <strong>"Usuario eliminado"</strong> en los lugares donde
              ya participaste (por ejemplo, resultados de partidos ya jugados), para no alterar
              información compartida con otros usuarios.
            </p>
          </Section>

          <Section title="Qué datos se conservan, y por qué">
            <p>
              Por integridad de la plataforma (resultados deportivos, pagos ya procesados, historial de
              torneos y ligas compartido con otros usuarios), lo siguiente <strong>no se elimina</strong>{" "}
              al borrar tu cuenta:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Historial de reservas de turnos e inscripciones a ligas y torneos en los que participaste</li>
              <li>Invitaciones que enviaste o recibiste</li>
              <li>Reportes que presentaste o que se presentaron sobre tu perfil (se conservan para procesos de moderación)</li>
            </ul>
            <p className="mt-3">
              Esta información se conserva desvinculada de tu email y teléfono reales (que sí se
              eliminan por completo), sin un período de retención adicional definido — se mantiene
              mientras la plataforma esté operativa, para preservar la integridad de resultados e
              historiales compartidos con otros usuarios.
            </p>
            <p>
              Tu email queda registrado por separado para evitar que se cree una cuenta nueva con esa
              misma dirección. Si creés que esto es un error o querés hacer una consulta puntual sobre
              tus datos, escribinos a{" "}
              <a href="mailto:soporte.padelnexo@gmail.com" className="text-pn-green hover:underline font-semibold">
                soporte.padelnexo@gmail.com
              </a>.
            </p>
          </Section>

          <Section title="Más información">
            <p>
              Para el detalle completo de cómo tratamos tus datos, consultá nuestra{" "}
              <a href="/privacidad" className="text-pn-green hover:underline font-semibold">
                Política de Privacidad
              </a>.
            </p>
          </Section>

        </div>
      </main>

      <footer className="text-center py-8 text-sm text-app-muted">
        © 2026 PadelNexo · <a href="/" className="hover:text-app-heading transition-colors">Inicio</a>
      </footer>
    </div>
  );
}
