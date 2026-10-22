# Sebastián Astengo · Desarrollo web

**Diseño y desarrollo sitios web para negocios que necesitan presentar mejor sus servicios, mostrar sus productos o recibir consultas.**

[Ver portafolio y proyectos en vivo →](https://sebastian-astengo.github.io/portafolio-web/)

Trabajo principalmente con **HTML, CSS y JavaScript**. Me interesa crear experiencias claras, rápidas y adaptables, desde la estructura de contenido hasta las interacciones que ayudan a recorrer un sitio y ponerse en contacto.

Estoy disponible para conversar sobre proyectos freelance y oportunidades laborales. [Escríbeme desde la página de contacto →](https://sebastian-astengo.github.io/portafolio-web/#contacto)

## Qué puedo desarrollar

- Sitios corporativos multipágina para presentar una empresa y sus servicios.
- Landing pages enfocadas en explicar una oferta y facilitar consultas.
- Catálogos interactivos con filtros, ordenamiento y bolsa de productos.
- Interfaces responsive para móvil, tablet y escritorio.
- Interacciones en JavaScript, navegación accesible y mejoras para un sitio existente.

> El alcance se acuerda para cada proyecto. Pagos, reservas, recepción de formularios y otros servicios externos requieren configurar y probar la plataforma correspondiente antes de usarlos con clientes reales.

## Proyectos seleccionados

| Proyecto | Qué permite explorar | Demo | Detalles |
| --- | --- | --- | --- |
| **Cauce Energía** | Sitio corporativo multipágina para presentar soluciones solares y orientar consultas. | [Visitar](empresa/) | [Ver caso](proyectos/cauce-energia.html) |
| **Punto de guardado** | Catálogo gamer con filtros, ordenamiento y bolsa interactiva. | [Visitar](tienda/) | [Ver caso](proyectos/punto-de-guardado.html) |
| **Pausa Dental** | Sitio para una clínica con presentación de atención y preguntas frecuentes. | [Visitar](clinica/) | [Ver caso](proyectos/pausa-dental.html) |
| **Brisa 28** | Experiencia inmobiliaria con exploración, comparación y simulador ilustrativo. | [Visitar](inmobiliaria/) | [Ver caso](proyectos/brisa-28.html) |

Los cuatro son **proyectos conceptuales**, creados para mostrar decisiones de contenido, diseño e implementación. No representan clientes, propiedades disponibles ni resultados comerciales reales. Las páginas de caso explican el alcance de cada demo y las funciones que están activas.

## Tecnologías y prácticas

- HTML semántico, CSS y JavaScript nativo.
- Diseño adaptable, navegación por teclado y soporte para `prefers-reduced-motion`.
- Metadatos básicos de SEO, favicon y rutas compatibles con GitHub Pages.
- Publicación estática mediante GitHub Actions.

## Estructura del proyecto

- `index.html`, `portfolio.css`, `portfolio.js`: portada y presentación profesional.
- `empresa/`, `tienda/`, `clinica/`, `inmobiliaria/`: demos funcionales.
- `proyectos/`: casos de estudio y descripción del alcance.
- `assets/`: favicon y capturas optimizadas.

## Ejecutar localmente

Desde la raíz del repositorio, inicia un servidor estático:

```powershell
py -m http.server 8080
```

Luego abre <http://localhost:8080/>.

La demo dental incluye infraestructura de referencia para Supabase, pero no está configurada para recibir reservas. Consulta [`clinica/CONFIGURACION.md`](clinica/CONFIGURACION.md) antes de conectar servicios o datos reales.

## Publicación

El workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) publica la rama `main` en GitHub Pages mediante GitHub Actions. En **Settings → Pages**, selecciona **GitHub Actions** como fuente.
