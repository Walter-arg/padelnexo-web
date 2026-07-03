import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad | PadelNexo",
  description: "Política de privacidad de PadelNexo. Conocé cómo recopilamos, usamos y protegemos tu información personal.",
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-8">
    <h2 className="text-xl font-black text-app-heading mb-3">{title}</h2>
    <div className="text-gray-600 leading-relaxed space-y-3">{children}</div>
  </section>
);

export default function PrivacidadPage() {
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
        {/* Título */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-black text-app-heading mb-2">Política de Privacidad</h1>
          <p className="text-app-muted text-sm">Última actualización: {lastUpdate}</p>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-sm">

          <Section title="1. Introducción">
            <p>
              PadelNexo ("nosotros", "nuestro") opera la aplicación móvil PadelNexo y el sitio web
              <strong> www.padelnexo.com.ar</strong>. Esta Política de Privacidad describe cómo
              recopilamos, usamos, almacenamos y protegemos tu información personal cuando usás
              nuestros servicios.
            </p>
            <p>
              Al usar PadelNexo, aceptás las prácticas descritas en esta política. Si no estás de
              acuerdo, por favor no utilices nuestros servicios.
            </p>
          </Section>

          <Section title="2. Información que recopilamos">
            <p><strong>2.1 Información que nos proporcionás directamente:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Nombre y apellido</li>
              <li>Dirección de correo electrónico</li>
              <li>Número de teléfono (opcional)</li>
              <li>Fotografía de perfil (opcional)</li>
              <li>Información de tu complejo deportivo (nombre, dirección, canchas)</li>
              <li>Categoría de pádel y preferencia de lado de juego</li>
            </ul>
            <p className="mt-3"><strong>2.2 Información generada por el uso de la app:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Ligas, torneos y reservas de turnos que creás o en los que participás</li>
              <li>Resultados de partidos y estadísticas de juego</li>
              <li>Registros de pagos e inscripciones</li>
              <li>Comprobantes de pago (imágenes) que subís voluntariamente</li>
              <li>Mensajes enviados dentro de la plataforma</li>
            </ul>
            <p className="mt-3"><strong>2.3 Información técnica:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Identificador único del dispositivo</li>
              <li>Token de notificaciones push (para enviar avisos de la app)</li>
              <li>Datos de uso y registro de errores (para mejorar la app)</li>
            </ul>
          </Section>

          <Section title="3. Cómo usamos tu información">
            <p>Usamos tu información exclusivamente para:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Crear y gestionar tu cuenta en PadelNexo</li>
              <li>Permitirte organizar y participar en ligas, torneos y reservas de turnos</li>
              <li>Procesar pagos e inscripciones a través de Mercado Pago</li>
              <li>Enviarte notificaciones relacionadas con tus ligas y torneos (resultados, recordatorios de pago, etc.)</li>
              <li>Permitir la comunicación entre organizadores y jugadores dentro de la plataforma</li>
              <li>Mejorar el funcionamiento y la experiencia de la app</li>
              <li>Cumplir con obligaciones legales aplicables en Argentina</li>
            </ul>
            <p className="mt-3">
              <strong>No vendemos, alquilamos ni compartimos tu información personal con terceros con fines comerciales o publicitarios.</strong>
            </p>
          </Section>

          <Section title="4. Servicios de terceros">
            <p>PadelNexo utiliza los siguientes servicios de terceros que pueden procesar tu información:</p>

            <p className="mt-3"><strong>Google Firebase (Google LLC)</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Autenticación de usuarios (Firebase Authentication)</li>
              <li>Almacenamiento de datos (Cloud Firestore)</li>
              <li>Almacenamiento de archivos e imágenes (Firebase Storage)</li>
              <li>Notificaciones push (Firebase Cloud Messaging)</li>
            </ul>
            <p className="text-sm text-gray-400 mt-1">Política de privacidad: <a href="https://firebase.google.com/support/privacy" className="text-pn-green hover:underline" target="_blank">firebase.google.com/support/privacy</a></p>

            <p className="mt-4"><strong>Mercado Pago (MercadoLibre S.R.L.)</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Procesamiento de pagos de inscripciones y cuotas</li>
              <li>Generación de links de pago</li>
            </ul>
            <p className="text-sm text-gray-400 mt-1">Política de privacidad: <a href="https://www.mercadopago.com.ar/privacidad" className="text-pn-green hover:underline" target="_blank">mercadopago.com.ar/privacidad</a></p>

            <p className="mt-4"><strong>Google Sign-In</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Opción de inicio de sesión con cuenta de Google</li>
            </ul>
          </Section>

          <Section title="5. Almacenamiento y seguridad">
            <p>
              Tus datos se almacenan en los servidores de Google Firebase, ubicados en Estados Unidos
              y/o la Unión Europea, con altos estándares de seguridad. Firebase cumple con ISO 27001,
              SOC 1, SOC 2 y SOC 3.
            </p>
            <p>
              Implementamos medidas de seguridad técnicas y organizativas para proteger tu información
              contra acceso no autorizado, pérdida o alteración. Sin embargo, ningún sistema de
              transmisión por internet es 100% seguro.
            </p>
            <p>
              Los comprobantes de pago y fotos de perfil se almacenan en Firebase Storage con acceso
              restringido únicamente a los usuarios autorizados.
            </p>
          </Section>

          <Section title="6. Retención de datos">
            <p>
              Conservamos tu información mientras tu cuenta esté activa. Si eliminás tu cuenta,
              borraremos o anonimizaremos tus datos personales dentro de los <strong>30 días hábiles</strong>,
              excepto aquellos que debamos conservar por obligaciones legales.
            </p>
            <p>
              Los datos de ligas y torneos pueden conservarse en forma anonimizada para estadísticas
              generales de la plataforma.
            </p>
          </Section>

          <Section title="7. Tus derechos">
            <p>De acuerdo con la Ley 25.326 de Protección de Datos Personales de Argentina, tenés derecho a:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Acceso:</strong> conocer qué datos tenemos sobre vos</li>
              <li><strong>Rectificación:</strong> corregir datos inexactos o incompletos</li>
              <li><strong>Supresión:</strong> solicitar la eliminación de tus datos</li>
              <li><strong>Oposición:</strong> oponerte al tratamiento de tus datos</li>
            </ul>
            <p className="mt-3">
              Para ejercer estos derechos, escribinos a{" "}
              <a href="mailto:soporte.padelnexo@gmail.com" className="text-pn-green hover:underline font-semibold">
                soporte.padelnexo@gmail.com
              </a>
            </p>
            <p className="text-sm text-gray-400 mt-2">
              La Dirección Nacional de Protección de Datos Personales es el organismo competente para
              atender las denuncias y reclamos en la materia.
            </p>
          </Section>

          <Section title="8. Menores de edad">
            <p>
              PadelNexo no está dirigido a menores de 13 años. No recopilamos conscientemente
              información personal de menores de 13 años. Si sos padre o tutor y creés que tu hijo
              nos proporcionó datos personales, contactanos para eliminarlos.
            </p>
          </Section>

          <Section title="9. Notificaciones push">
            <p>
              La app puede enviarte notificaciones push para informarte sobre resultados, pagos
              pendientes, reemplazos y novedades de tus ligas. Podés desactivar las notificaciones
              en cualquier momento desde la configuración de tu dispositivo.
            </p>
          </Section>

          <Section title="10. Cambios a esta política">
            <p>
              Podemos actualizar esta Política de Privacidad ocasionalmente. Te notificaremos sobre
              cambios significativos a través de la app o por email. La fecha de última actualización
              al inicio del documento siempre refleja la versión vigente.
            </p>
          </Section>

          <Section title="11. Contacto">
            <p>Si tenés preguntas sobre esta Política de Privacidad, contactanos:</p>
            <ul className="list-none space-y-1 ml-2 mt-2">
              <li>📧 <a href="mailto:soporte.padelnexo@gmail.com" className="text-pn-green hover:underline font-semibold">soporte.padelnexo@gmail.com</a></li>
              <li>🌐 <a href="https://www.padelnexo.com.ar" className="text-pn-green hover:underline">www.padelnexo.com.ar</a></li>
            </ul>
          </Section>

        </div>
      </main>

      <footer className="text-center py-8 text-sm text-app-muted">
        © 2026 PadelNexo · <a href="/" className="hover:text-app-heading transition-colors">Inicio</a>
      </footer>
    </div>
  );
}
