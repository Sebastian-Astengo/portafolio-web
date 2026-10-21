# Portafolio web — Sebastián

Cuatro conceptos web completos, listos para publicar como un sitio estático en GitHub Pages:

| Demo | Ruta | Enfoque |
| --- | --- | --- |
| Cauce Energía | `/empresa/` | Presentación de una empresa ficticia de energía solar |
| Nativa Estudio | `/tienda/` | Tienda digital con catálogo y bolsa interactiva |
| Valeria Ríos | `/persona/` | Presentación profesional de arquitecta |
| Brisa 28 | `/inmobiliaria/` | Landing de proyecto residencial con formulario de contacto |

El sitio principal está en `index.html`. Cada demo incluye su HTML, CSS y JavaScript en una carpeta independiente. No requiere Node.js, paquetes ni proceso de compilación.

## Verlo en tu computadora

Abre `index.html` en un navegador. Las fotografías se sirven desde Unsplash, así que requieren conexión a internet.

## Personalizar antes de presentarlo

- Cambia “Sebastián” y `hola@ejemplo.com` en `index.html` por tu nombre y contacto.
- Los nombres, negocios, inmuebles, textos, precios y correos de las demos son contenido conceptual para portafolio. Sustitúyelos si ya tienes proyectos reales.
- La marca Cauce Energía es ficticia. Su formulario prepara un correo usando `mailto:`.
- La bolsa de Nativa es una interacción demostrativa; no procesa pagos ni pedidos.
- El formulario de Brisa 28 abre un correo mediante `mailto:`; no almacena ni envía datos a un servidor.
- Revisa los enlaces de contacto `@ejemplo.com` y `@nativa.example` antes de compartir el sitio.

## Publicar con GitHub Pages

El workflow `.github/workflows/pages.yml` publica el contenido cuando se hace push a la rama `main`. En GitHub, abre **Settings → Pages** y selecciona **GitHub Actions** como fuente de publicación. En repositorios privados, GitHub Pages requiere un plan que permita Pages privado; con GitHub Free se necesita cambiar el repositorio a público. Cuando termine el workflow, GitHub mostrará la URL del sitio en esa sección.

Si todavía no tienes un repositorio:

```powershell
git init -b main
git add .
git commit -m "Build four professional portfolio websites"
git remote add origin https://github.com/TU-USUARIO/portafolio-web.git
git push -u origin main
```

Reemplaza `TU-USUARIO` por tu usuario de GitHub y crea antes un repositorio vacío llamado `portafolio-web`. Si ya inicializaste Git, omite `git init -b main`.
