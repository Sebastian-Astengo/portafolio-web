# Portafolio web — Sebastián Astengo

Portafolio estático publicado en GitHub Pages. Reúne cuatro demostraciones conceptuales, sus páginas de caso de estudio y ejemplos de soluciones web para negocios.

## Proyectos

| Proyecto | Demo | Caso de estudio | Alcance real de la demo |
| --- | --- | --- | --- |
| Cauce Energía | [`empresa/`](empresa/) | [`proyectos/cauce-energia.html`](proyectos/cauce-energia.html) | Sitio corporativo multipágina. El formulario prepara un resumen en el navegador; no envía datos. |
| Punto de guardado | [`tienda/`](tienda/) | [`proyectos/punto-de-guardado.html`](proyectos/punto-de-guardado.html) | Catálogo de muestra con filtros y bolsa interactiva. No procesa pagos ni pedidos. |
| Pausa Dental | [`clinica/`](clinica/) | [`proyectos/pausa-dental.html`](proyectos/pausa-dental.html) | Sitio de presentación; las reservas están desactivadas. El repositorio incluye infraestructura Supabase de referencia, pendiente de configuración. |
| Brisa 28 | [`inmobiliaria/`](inmobiliaria/) | [`proyectos/brisa-28.html`](proyectos/brisa-28.html) | Exploración, favoritos, comparación y simulador ilustrativo. No representa inmuebles disponibles ni asesoría financiera. |

Los cuatro proyectos son conceptos de portafolio y no deben presentarse como clientes, marcas o resultados comerciales reales. Las páginas de caso describen los objetivos, las decisiones, las interacciones disponibles y las tecnologías del código.

## Sobre el sitio

- Portada, proyectos, servicios, presentación y contacto en [`index.html`](index.html).
- Casos de estudio y capturas en `proyectos/` y `assets/captures/`.
- Los enlaces del sitio usan rutas relativas para que funcionen bajo `/portafolio-web/` en GitHub Pages.
- El sitio está en español; se puede incorporar una futura versión en inglés con páginas y metadatos localizados.
- No hay formulario de contacto activo. El correo profesional, LinkedIn y un CV descargable quedan pendientes de confirmar.

## Desarrollo local

Sirve el contenido estático desde la raíz para probar las rutas:

```powershell
py -m http.server 8080
```

Abre `http://localhost:8080/`.

Para trabajar con la demo dental local y su backend de referencia, consulta [`clinica/CONFIGURACION.md`](clinica/CONFIGURACION.md). Sus políticas, horarios y conexiones deben revisarse antes de recibir datos reales.

## Publicación

El workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) publica el contenido de `main` en GitHub Pages mediante GitHub Actions. En **Settings → Pages**, la fuente debe ser **GitHub Actions**.
