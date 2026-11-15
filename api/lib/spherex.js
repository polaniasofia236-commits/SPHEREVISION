const SIA = 'https://irsa.ipac.caltech.edu/SIA';
const COLLECTIONS = ['spherex_dr1', 'spherex_dr1_deep', 'spherex_qr3', 'spherex_qr3_deep'];

export async function searchEpochPair({ ra, dec, radius = 0.05 }) {
  const r = Number(ra), d = Number(dec), rad = Number(radius);
  if (!Number.isFinite(r) || r < 0 || r > 360) throw new Error('La ascensión recta debe estar entre 0° y 360°.');
  if (!Number.isFinite(d) || d < -90 || d > 90) throw new Error('La declinación debe estar entre −90° y 90°.');
  if (!Number.isFinite(rad) || rad < 0.005 || rad > 0.5) throw new Error('El radio debe estar entre 0,005° y 0,5°.');

  const params = new URLSearchParams();
  for (const c of COLLECTIONS) params.append('COLLECTION', c);
  params.set('POS', `CIRCLE ${r} ${d} ${rad}`);
  params.set('RESPONSEFORMAT', 'CSV');
  params.set('MAXREC', '1000');
  const response = await fetchWithRetry(`${SIA}?${params}`, { headers: { accept: 'text/csv' } }, 45000);
  if (!response.ok) throw new Error(`IRSA respondió con el código ${response.status}. Intenta de nuevo en un momento.`);
  const csv = await response.text();
  const rows = parseCsv(csv);
  if (!rows.length) throw new Error('IRSA no devolvió observaciones para esta zona. Prueba el ejemplo recomendado o amplía el área.');
  const pair = choosePair(rows);
  if (!pair) throw new Error('Encontramos imágenes, pero no dos fechas comparables en esta zona. Prueba el ejemplo recomendado.');
  return { region: { ra: r, dec: d, radius: rad }, pair, available: rows.length };
}

export async function fetchFits(remoteUrl, { ra, dec, size } = {}) {
  let url;
  try { url = new URL(remoteUrl); } catch { throw new Error('La dirección de datos no es válida.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'irsa.ipac.caltech.edu' || !url.pathname.startsWith('/ibe/data/spherex/')) {
    throw new Error('IRSA devolvió una dirección de archivo no permitida.');
  }
  const centerRa = Number(ra), centerDec = Number(dec), cutoutSize = Number(size);
  if (!Number.isFinite(centerRa) || centerRa < 0 || centerRa > 360 || !Number.isFinite(centerDec) || centerDec < -90 || centerDec > 90) {
    throw new Error('No pudimos validar el centro de la región. Vuelve a buscarla.');
  }
  if (!Number.isFinite(cutoutSize) || cutoutSize < 0.01 || cutoutSize > 0.5) {
    throw new Error('El tamaño de la imagen solicitada no es válido.');
  }
  // Los FITS completos superan 60 MB. IRSA permite pedir un recorte de la zona buscada.
  url.searchParams.set('center', `${centerRa},${centerDec}`);
  url.searchParams.set('size', String(cutoutSize));
  const response = await fetchWithRetry(url, {}, 60000);
  if (!response.ok) throw new Error(`No se pudo cargar una imagen desde IRSA (${response.status}).`);
  const data = await response.arrayBuffer();
  if (data.byteLength > 45 * 1024 * 1024) throw new Error('El archivo supera el límite de tamaño de esta versión.');
  return { data, contentType: response.headers.get('content-type') || 'application/fits' };
}

async function fetchWithRetry(url, options, timeoutMs) {
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
      if (![502, 503, 504].includes(response.status) || attempt === 2) return response;
    } catch (error) {
      if (attempt === 2) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  return response;
}

function choosePair(inputRows) {
  const rows = inputRows.map((row) => {
    const url = value(row, ['access_url']);
    const mjd = Number(value(row, ['t_min']));
    const collection = value(row, ['obs_collection']);
    const min = Number(value(row, ['em_min'])), max = Number(value(row, ['em_max']));
    const band = Number.isFinite(min) && Number.isFinite(max) ? `${min.toPrecision(5)}:${max.toPrecision(5)}` : value(row, ['energy_bandpassname','instrument_name']) || 'unknown';
    return { url, mjd, date: Number.isFinite(mjd) ? mjdToDate(mjd) : null, band, collection, obsId: value(row, ['obs_id']), instrument: value(row, ['instrument_name']), bandLabel: value(row, ['energy_bandpassname']) };
  }).filter((x) => x.url && Number.isFinite(x.mjd) && x.date && x.url.startsWith('https://irsa.ipac.caltech.edu/ibe/data/spherex/'));

  const groups = new Map();
  for (const item of rows) { const list = groups.get(item.band) || []; list.push(item); groups.set(item.band, list); }
  let best = null;
  for (const group of groups.values()) {
    group.sort((a,b)=>a.mjd-b.mjd);
    for (let i=0;i<group.length;i++) for (let j=i+1;j<group.length;j++) {
      const days=group[j].mjd-group[i].mjd;
      if (days < 30) continue;
      const score = days + (group[i].collection !== group[j].collection ? 5 : 0);
      if (!best || score > best.score) best={ score, days, a:group[i], b:group[j] };
    }
  }
  if (!best) return null;
  return { a: best.a, b: best.b, separationDays: Math.round(best.days), sameBand: best.a.band === best.b.band };
}

function value(row, keys) { for (const key of keys) { const v=row[key]; if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim(); } return ''; }
function mjdToDate(mjd) { return new Date((mjd - 40587) * 86400000).toISOString(); }

function parseCsv(text) {
  const lines=[]; let row=[], cell='', quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}
    else if(ch==='"')quoted=true;
    else if(ch===','){row.push(cell);cell='';}
    else if(ch==='\n'){row.push(cell);lines.push(row);row=[];cell='';}
    else if(ch!=='\r')cell+=ch;
  }
  if(cell||row.length){row.push(cell);lines.push(row);}
  const headerIndex=lines.findIndex((line)=>line.some((field)=>field.trim().toLowerCase()==='access_url'));
  if(headerIndex<0)return[];
  const headers=lines[headerIndex].map((x)=>x.trim().toLowerCase());
  return lines.slice(headerIndex+1).filter((line)=>line.length>=headers.length).map((line)=>Object.fromEntries(headers.map((name,i)=>[name,line[i]??''])));
}
