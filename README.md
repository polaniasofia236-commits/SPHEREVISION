# SPHEREVISION

Prototipo web en español para explorar dos observaciones públicas de SPHEREx sin que la persona tenga que buscar ni cargar archivos FITS. El ejemplo inicial está fijado en una región que devolvió observaciones DR1 y QR3 en la prueba de integración.

## Abrir sin usar la terminal

En Windows, extraiga primero el ZIP completo y, dentro de la carpeta extraída, haga doble clic en `ABRIR SPHEREVISION.bat`. Se abrirá la página local en el navegador y la ventana negra debe permanecer abierta mientras se usa la app. No abra `app.js` ni `index.html` por separado. El archivo `ABRIR_PRIMERO.txt` también resume los pasos. El iniciador usa la versión de Node.js incluida en Codex o, si está instalada, la versión de Node.js del equipo.

## Vista previa local para desarrollo

Requiere Node.js 18.17 o posterior. Desde esta carpeta:

```sh
npm run dev
```

Después, abra `http://localhost:4173` en el navegador. El servidor consulta IRSA y sirve un proxy limitado a imágenes FITS de SPHEREx del archivo oficial.

## Flujo sencillo

1. Pulse **Mostrar comparación** para cargar el ejemplo del Polo Norte Eclíptico, o expanda **Quiero explorar otra parte del cielo**.
2. SPHEREVISION busca imágenes de DR1 y QR3, incluidas las colecciones de campos profundos.
3. El prototipo elige dos imágenes de la misma banda con observaciones separadas por al menos 30 días, solicita recortes FITS pequeños a IRSA y muestra fechas, parpadeo, superposición o una diferencia visual.

## Despliegue

El proyecto incluye funciones de API compatibles con Vercel en `api/`. Al desplegar la carpeta como proyecto Vercel, el sitio estático y las funciones `/api/observations` y `/api/fits` quedan en el mismo origen. El despliegue público no se ha realizado.

## Límites científicos y técnicos

- El emparejamiento automático es exploratorio: agrupa por banda y elige dos fechas separadas; no afirma que sean observaciones equivalentes en calibración o calidad.
- Solo reproyecta automáticamente cuando ambas imágenes incluyen WCS compatible con TAN. En caso contrario, ajusta el tamaño de B para facilitar una inspección visual y advierte que el encuadre puede explicar diferencias.
- La vista de diferencias normaliza cada imagen por separado. No es una diferencia fotométrica calibrada ni una detección automática.
- Un cambio visual no confirma un objeto móvil, un planeta nuevo ni la existencia de “Planet X”. Hace falta validación científica.
- Las búsquedas pueden no devolver dos fechas utilizables. La cobertura depende de la región y de los productos disponibles en IRSA.
- Los datos FITS pasan por el servidor del proyecto para que el público no tenga que descargarlos. Se solicitan recortes espaciales a IRSA para evitar bajar los FITS completos, que pueden superar 60 MB. El servidor solo permite consultar IRSA y rutas de FITS SPHEREx en el archivo oficial.

## Fuentes

- Reto NASA Space Apps 2026, *Planet X and SPHEREx*: https://www.spaceappschallenge.org/2026/find-a-team/lsp26/
- Acceso a datos SPHEREx, NASA/IPAC IRSA: https://irsa.ipac.caltech.edu/spherex-archive-documentation/spherex-data-access/
- Búsqueda y colecciones SIA2 de IRSA: https://irsa.ipac.caltech.edu/ibe/sia.html
- Datos abiertos SPHEREx, NASA Science: https://science.nasa.gov/open-science/spherex-universe-map/

Estado: prototipo en desarrollo. No afiliado ni avalado por NASA, Caltech o IPAC.
