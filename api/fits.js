import { fetchFits } from './lib/spherex.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.statusCode=405; return res.end('Method not allowed'); }
  try {
    const result=await fetchFits(req.query?.url,{ra:req.query?.ra,dec:req.query?.dec,size:req.query?.size});
    res.statusCode=200;
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control','public, max-age=3600, s-maxage=3600');
    res.setHeader('X-Content-Type-Options','nosniff');
    return res.end(Buffer.from(result.data));
  } catch(error) {
    const message=error?.cause?.code||error?.message==='fetch failed'
      ? 'No pudimos descargar la observación desde IRSA. Comprueba internet y vuelve a intentarlo.'
      : error?.message||'No se pudo cargar la observación.';
    res.statusCode=502; res.setHeader('Content-Type','application/json; charset=utf-8');
    return res.end(JSON.stringify({error:message}));
  }
}
