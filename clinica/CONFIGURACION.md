# Configuración del sitio dental

Este proyecto es una **implementación conceptual**. El repo no identifica una clínica real; por eso no incluye un nombre comercial, horarios, precios, equipo, dirección ni testimonios inventados. Antes de abrir reservas, la clínica debe entregar y verificar todos los datos indicados abajo.

## Requisitos

- Supabase CLI actual y Docker Desktop activo para desarrollo local.
- Un proyecto Supabase para producción.
- Un calendario de Google por profesional (o calendarios compartidos de la clínica), con Google Calendar API habilitada.
- Un proveedor de correo transaccional. El adaptador implementado usa Resend.
- Dominio/origen de producción aprobado por la clínica.

## Desarrollo local

Desde la raíz del repo:

```powershell
npx supabase start
npx supabase db reset
npx supabase functions serve --env-file supabase/.env.local
py -m http.server 8080
```

Duplica `supabase/.env.example` como `supabase/.env.local` para desarrollo local. Completa credenciales de prueba fuera de Git; `.gitignore` excluye esos archivos. Si no se configura Google y correo, la agenda no se podrá activar y el sitio explicará que está desconectada.

La migración no carga servicios ni cuentas de muestra. No se deben crear reservas ficticias para producción.

## Configurar Supabase

1. Crea un proyecto en Supabase y enlázalo con `npx supabase link --project-ref <ref>`.
2. Aplica el esquema con `npx supabase db push` (o revisa la migración en el panel SQL antes de aplicarla).
3. Despliega las funciones:

```powershell
npx supabase functions deploy public-catalog
npx supabase functions deploy available-slots
npx supabase functions deploy create-booking
npx supabase functions deploy calendar-sync
npx supabase functions deploy send-notifications
```

4. Guarda secretos **solo** en Supabase Secrets. Nunca los pongas en `clinica/config.js`, el HTML, Git ni GitHub Pages:

```powershell
npx supabase secrets set ALLOWED_ORIGINS=https://sebastian-astengo.github.io
npx supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='{"client_email":"...","private_key":"...","token_uri":"https://oauth2.googleapis.com/token"}'
npx supabase secrets set RESEND_API_KEY=re_...
npx supabase secrets set RESEND_FROM='Clínica <citas@dominio-verificado.pe>'
npx supabase secrets set CRON_SECRET='<secreto-aleatorio-largo>'
npx supabase secrets set CLINIC_TIMEZONE=America/Lima
```

`GOOGLE_SERVICE_ACCOUNT_JSON` se debe introducir desde una sesión segura. No escribas ni guardes el JSON privado en este repositorio o en archivos que vayan a GitHub. Configura Google Calendar API, concede al service account acceso de escritura a los calendarios específicos y confirma que el personal autorizó esa conexión. La integración consulta ocupaciones, crea/actualiza/elimina eventos privados e incluye solo nombre del servicio y código de cita; no guarda nombre, correo, teléfono ni notas clínicas en el calendario.

5. En `clinica/config.js`, completa `supabaseUrl` y la clave **anon/public** del proyecto, además de `policyVersion`. Esos valores son públicos; la protección se hace en el servidor con RLS, las funciones y secretos. No pegues la clave `service_role`.
6. Registra y verifica el dominio de envío con Resend, define el remitente y programa `send-notifications` cada cinco minutos enviando `x-cron-secret: <CRON_SECRET>`. La clave del cron se mantiene en el scheduler, nunca en la web. El worker usa la cola persistida, limita intentos e incorpora una clave de idempotencia.
7. En Authentication crea los usuarios del personal con contraseñas individuales y MFA según la política de la clínica. Copia sus UUID. Inserta la relación con rol usando el SQL Editor de Supabase (administrador del proyecto):

```sql
insert into public.admin_users(user_id, role, professional_id)
select id, 'owner', null from auth.users where email = 'correo-confirmado@dominio.pe';
```

Reemplaza el correo y valida que afecte exactamente una cuenta. El propietario inicial se provisiona desde el SQL Editor porque todavía no existe un usuario propietario con permiso para gestionar la tabla. Asigna roles posteriores según mínimo privilegio y añade `professional_id` para dentistas.

## Datos reales y apertura de agenda

Antes de aceptar reservas, la clínica debe proporcionar y validar:

- Razón/nombre público, responsable del tratamiento de datos y canales de contacto.
- Lista de servicios, descripciones, duración y tiempo de limpieza/preparación.
- Nombre y credenciales profesionales verificadas, especialidades publicables y consentimiento para publicar fotos.
- ID de calendario y autorización de acceso de cada profesional.
- Horarios semanales, pausas, feriados, vacaciones, bloqueos, anticipación mínima/máxima y frecuencia de citas.
- Política de reserva, cambio, cancelación y no asistencia.
- Dirección exacta, teléfono/WhatsApp, horario de atención y enlace de mapa.
- Aviso de privacidad revisado por responsable competente, plazos de conservación, proveedores, base jurídica y protocolo para solicitudes de derechos.

Carga esos datos por canales administrativos autenticados. Asegura que cada persona esté vinculada a los servicios y a un calendario correcto. Primero haz pruebas con calendarios y correos de ensayo, revisa zona horaria `America/Lima` y el consentimiento, y solo entonces habilita `clinic_settings.accepts_public_bookings` tras completar la configuración. No habilites ese indicador en la base antes de tener agenda, seguridad, consentimiento y canales comprobados.

## Funciones del panel

`clinica/admin.html` protege el inicio de sesión con Supabase Auth y valida roles en el servidor. Permite consultar citas por día/semana/mes, buscar código o paciente, cancelar, reprogramar con validación de agenda y reintentar sincronización. La configuración de catálogo, profesionales y reglas de horario queda en el backend autenticado/Supabase hasta que la clínica decida qué interfaz administrativa necesita. Los roles y RLS restringen el acceso a los registros.

El flujo no solicita motivo clínico. El sistema almacena solamente el nombre, teléfono, correo, servicio, profesional, fecha, consentimiento y metadatos requeridos para la cita. No actives la web hasta completar y revisar el borrador de `privacidad.html` y `reservas.html` con la clínica y su asesoría legal.

## Publicar el frontend

GitHub Pages sirve el frontend estático y no guarda secretos. El workflow de GitHub Actions publica desde `main`. Supabase y sus funciones se despliegan por separado según los pasos anteriores. El sitio público de portafolio no es una instancia de una clínica ni se debe usar para recibir pacientes sin completar la revisión y configuración.

## Pruebas

Con Docker Desktop activo:

```powershell
npx supabase start
npx supabase db reset
npx supabase test db
npx supabase functions serve
```

Los tests SQL revisan configuración vacía, acceso de roles públicos, idempotencia, exclusión de solapamientos, pausas, bloqueos, días cerrados, reprogramación y cancelación. Google Calendar y Resend requieren un proyecto/calendarios/cuentas de prueba y secretos; no se marcan como probados hasta ejecutar las verificaciones de aceptación con esos servicios.

## Privacidad y cumplimiento

El sitio enlaza a la Ley N.º 29733 y al Reglamento aprobado por D.S. N.º 016-2024-JUS como referencia. No constituye una opinión legal ni certificación de cumplimiento. La clínica debe verificar finalidades, fundamento de tratamiento, seguridad, conservación, encargados, transferencias internacionales, atención de derechos y obligaciones de registro que le correspondan antes de recopilar datos. No cargues información de pacientes en issues, logs, demos o pruebas compartidas.

### Prueba de concurrencia

En un Supabase **local y aislado**, carga servicios, un profesional, vínculo y horario de prueba. Obtén la URL y `service_role` locales con `npx supabase status`, asigna también los IDs del servicio y del profesional, una hora futura que esté libre en ese horario y la versión de política. Luego ejecuta `node supabase/tests/concurrent-booking.mjs`. El script envía dos RPC al mismo tiempo, espera exactamente un éxito y un conflicto, y limpia las citas y pacientes de prueba al finalizar. No ejecutes esta prueba contra una base con datos de pacientes.
