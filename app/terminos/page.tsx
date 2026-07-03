import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y Condiciones | PadelNexo",
  description: "Términos y condiciones de uso de PadelNexo. Conocé las reglas y condiciones para usar nuestra plataforma.",
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-8">
    <h2 className="text-xl font-black text-app-heading mb-3">{title}</h2>
    <div className="text-gray-600 leading-relaxed space-y-3">{children}</div>
  </section>
);

export default function TerminosPage() {
  const lastUpdate = "29 de junio de 2026";

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(160deg, #e8f5ee 0%, #f0faf5 60%, #ffffff 100%)" }}>
      {/* Header */}
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
          <h1 className="text-3xl font-black text-app-heading mb-2">Términos y Condiciones</h1>
          <p className="text-app-muted text-sm">Última actualización: {lastUpdate}</p>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-sm">

          <Section title="1. Aceptación de los términos">
            <p>
              Al descargar, instalar o usar la aplicación PadelNexo o el sitio web{" "}
              <strong>www.padelnexo.com.ar</strong>, aceptás estos Términos y Condiciones en su
              totalidad. Si no estás de acuerdo con alguna parte, no uses nuestros servicios.
            </p>
            <p>
              PadelNexo es operado por sus creadores con domicilio en Argentina. Estos términos se
              rigen por las leyes de la República Argentina.
            </p>
          </Section>

          <Section title="2. Descripción del servicio">
            <p>PadelNexo es una plataforma digital que permite a organizadores y jugadores de pádel:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Crear y gestionar ligas y torneos de pádel amateur</li>
              <li>Generar fixtures automáticos y registrar resultados</li>
              <li>Gestionar inscripciones y pagos de jugadores</li>
              <li>Administrar reservas de turnos en canchas de pádel</li>
              <li>Comunicarse entre organizadores y jugadores dentro de la plataforma</li>
              <li>Acceder a estadísticas y rankings de juego</li>
            </ul>
          </Section>

          <Section title="3. Registro y cuentas">
            <p>
              Para usar PadelNexo debés crear una cuenta con información verdadera y actualizada.
              Sos responsable de mantener la confidencialidad de tu contraseña y de todas las
              actividades que ocurran bajo tu cuenta.
            </p>
            <p>
              Podés registrarte con email y contraseña o mediante tu cuenta de Google. Al hacerlo,
              aceptás que PadelNexo acceda a tu nombre y dirección de correo electrónico.
            </p>
            <p>
              Nos reservamos el derecho de suspender o cancelar cuentas que violen estos términos,
              usen información falsa o realicen actividades fraudulentas.
            </p>
          </Section>

          <Section title="4. Uso aceptable">
            <p>Al usar PadelNexo te comprometés a:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Usar la plataforma únicamente para fines legales y relacionados al pádel</li>
              <li>No publicar contenido falso, ofensivo o que infrinja derechos de terceros</li>
              <li>No intentar acceder a cuentas ajenas ni a datos de otros usuarios</li>
              <li>No usar la plataforma para enviar spam o comunicaciones no solicitadas</li>
              <li>No realizar ingeniería inversa ni intentar copiar el código de la aplicación</li>
            </ul>
          </Section>

          <Section title="5. Pagos y cobros">
            <p>
              PadelNexo facilita la gestión de cobros entre organizadores y jugadores. Los pagos
              se procesan a través de <strong>Mercado Pago</strong>, sujeto a sus propios términos
              y condiciones.
            </p>
            <p>
              PadelNexo actúa como intermediario tecnológico y no es responsable por disputas de
              pago entre organizadores y jugadores. Cada organizador es responsable de gestionar
              sus propios cobros, aranceles y devoluciones.
            </p>
            <p>
              El uso de PadelNexo como plataforma es actualmente <strong>gratuito</strong>. Nos
              reservamos el derecho de introducir planes pagos en el futuro, notificando a los
              usuarios con al menos 30 días de anticipación.
            </p>
          </Section>

          <Section title="6. Contenido del usuario">
            <p>
              Al subir contenido a PadelNexo (fotos, comprobantes, mensajes), nos otorgás una
              licencia no exclusiva para almacenarlo y mostrarlo dentro de la plataforma con el
              único fin de prestar el servicio.
            </p>
            <p>
              No reclamamos propiedad sobre tu contenido. Podés eliminar tu cuenta y solicitar
              la eliminación de tu contenido en cualquier momento.
            </p>
          </Section>

          <Section title="7. Propiedad intelectual">
            <p>
              La marca PadelNexo, el logo, el diseño de la aplicación y el código fuente son
              propiedad exclusiva de sus creadores. Queda prohibida su reproducción, distribución
              o uso comercial sin autorización expresa y por escrito.
            </p>
          </Section>

          <Section title="8. Limitación de responsabilidad">
            <p>PadelNexo no será responsable por:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Interrupciones del servicio por mantenimiento, fallas técnicas o causas de fuerza mayor</li>
              <li>Pérdida de datos por problemas ajenos a nuestra plataforma</li>
              <li>Disputas entre organizadores y jugadores sobre pagos, resultados o participación</li>
              <li>Daños indirectos derivados del uso de la aplicación</li>
            </ul>
            <p>
              El servicio se provee "tal como está". Si bien hacemos nuestro mejor esfuerzo para
              mantener la plataforma funcionando correctamente, no garantizamos disponibilidad
              ininterrumpida del 100%.
            </p>
          </Section>

          <Section title="9. Modificaciones del servicio">
            <p>
              Nos reservamos el derecho de modificar, suspender o discontinuar cualquier parte
              del servicio en cualquier momento. Notificaremos cambios importantes a través de
              la app o por email con razonable anticipación.
            </p>
            <p>
              También podemos actualizar estos Términos y Condiciones. El uso continuado de la
              plataforma después de los cambios implica la aceptación de los nuevos términos.
            </p>
          </Section>

          <Section title="10. Cancelación de cuenta">
            <p>
              Podés cancelar tu cuenta en cualquier momento desde la configuración de la app o
              contactándonos por email. Al cancelar, tus datos personales serán eliminados dentro
              de los 30 días hábiles conforme a nuestra{" "}
              <a href="/privacidad" className="text-pn-green hover:underline font-semibold">
                Política de Privacidad
              </a>.
            </p>
          </Section>

          <Section title="11. Legislación aplicable">
            <p>
              Estos términos se rigen por las leyes de la República Argentina. Cualquier disputa
              será sometida a la jurisdicción de los tribunales ordinarios de la Ciudad de
              Córdoba, Argentina.
            </p>
          </Section>

          <Section title="12. Contacto">
            <p>Para consultas sobre estos Términos y Condiciones:</p>
            <ul className="list-none space-y-1 ml-2 mt-2">
              <li>📧 <a href="mailto:soporte.padelnexo@gmail.com" className="text-pn-green hover:underline font-semibold">soporte.padelnexo@gmail.com</a></li>
              <li>🌐 <a href="https://www.padelnexo.com.ar" className="text-pn-green hover:underline">www.padelnexo.com.ar</a></li>
            </ul>
          </Section>

        </div>
      </main>

      <footer className="text-center py-8 text-sm text-app-muted">
        © 2026 PadelNexo · <a href="/" className="hover:text-app-heading transition-colors">Inicio</a>
        {" · "}
        <a href="/privacidad" className="hover:text-app-heading transition-colors">Política de privacidad</a>
      </footer>
    </div>
  );
}
