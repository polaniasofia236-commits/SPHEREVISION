import { searchEpochPair } from './lib/spherex.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.statusCode=405; return res.json({ error:'Solo se permite consultar observaciones.' }); }
  try {
    const result=await searchEpochPair({ ra:req.query?.ra, dec:req.query?.dec, radius:req.query?.radius });
    res.statusCode=200; return res.json(result);
  } catch(error) {
    const message=error?.cause?.code||error?.message==='fetch failed'
      ? 'No pudimos conectar con IRSA. Comprueba la conexión a internet y vuelve a intentarlo.'
      : error?.message||'No se pudo consultar el archivo SPHEREx.';
    res.statusCode=502; return res.json({ error:message });
  }
}
