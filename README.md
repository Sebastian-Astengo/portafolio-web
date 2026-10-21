# Portafolio web — Sebastián

Sitio estático publicado en GitHub Pages con tres proyectos: Cauce Energía, la tienda gamer Punto de guardado y Pausa, una identidad conceptual para una clínica dental.

| Proyecto | Ruta | Alcance |
| --- | --- | --- |
| Cauce Energía | `/empresa/` | Sitio corporativo multipágina |
| Punto de guardado | `/tienda/` | Catálogo gamer y bolsa demostrativa |
| Pausa Dental | `/clinica/` | Identidad editorial, fotografías de referencia y flujo de reserva conectado a Supabase cuando se configure |

## Arquitectura de la clínica

- Frontend estático responsive en `clinica/`, publicado por GitHub Pages.
- PostgreSQL, autenticación, políticas RLS y funciones server-side en `supabase/`.
- La base de datos es el registro de reservas; una restricción de exclusión impide solapamientos por profesional.
- Google Calendar lee ocupaciones y sincroniza eventos con las funciones Edge. Los eventos no contienen nombre, teléfono, correo ni notas clínicas.
- Correo transaccional y recordatorios se procesan mediante una cola idempotente; WhatsApp queda como integración opcional.
- El panel `/clinica/admin.html` exige usuario autenticado con rol autorizado.
- La clínica y sus servicios se dejan sin datos ficticios. No se muestran horas ni se aceptan reservas hasta conectar un backend y cargar horarios reales.

## Activación

Consulta `clinica/CONFIGURACION.md` para crear un proyecto Supabase, aplicar la migración, cargar servicios, profesionales y horarios confirmados, configurar Google Calendar y correo, crear el primer usuario administrador y desplegar las funciones. Las claves privadas se guardan en los secretos de Supabase; nunca en GitHub Pages.

La web incluye políticas provisionales para revisión: antes de recibir datos personales, la clínica debe completar su identidad, finalidades, plazos, canales de ejercicio de derechos y demás información aplicable. Esta implementación no constituye una certificación legal.

## Desarrollo local

Requiere Node.js y Supabase CLI. Sirve los archivos estáticos desde la raíz para conservar las rutas:

```powershell
py -m http.server 8080
```

Abre `http://localhost:8080/`. Para desarrollar el backend local:

```powershell
npx supabase start
npx supabase db reset
npx supabase functions serve
```

## GitHub Pages

El workflow `.github/workflows/pages.yml` publica el contenido al hacer push a `main`. En **Settings → Pages**, la fuente debe ser **GitHub Actions**.

Las páginas Cauce Energía y Punto de guardado incluyen contenido de muestra. El catálogo gamer no procesa pagos. El sitio dental es conceptual y no debe usarse para recibir citas hasta completar la configuración indicada arriba.
