const $ = (id) => document.getElementById(id);
const canvas = $('viewer');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const state = { a:null, b:null, blinkB:false, paused:false, timer:null, aligned:false, busy:false };

$('sample-button').addEventListener('click', () => runComparison({ra:164.7,dec:-5.8,radius:0.005,regionName:'la región de ejemplo'}));
$('search-form').addEventListener('submit',(event)=>{
  event.preventDefault();
  runComparison({ra:Number($('ra').value),dec:Number($('dec').value),radius:Number($('radius').value),regionName:'la región elegida'});
});
$('mode').addEventListener('change',()=>{updateBlink();draw();});
$('opacity').addEventListener('input',(event)=>{$('opacity-value').textContent=`${event.target.value}%`;draw();});
$('blink-button').addEventListener('click',()=>{
  state.paused=!state.paused;
  $('blink-button').textContent=state.paused?'▶ Reanudar':'⏸ Pausar';
  if(!state.paused){state.blinkB=false;draw();}
});
window.addEventListener('resize',draw);

if(location.protocol==='file:'){
  const message='Abriste la página como un archivo local. Para buscar y cargar los datos automáticamente, abre “Iniciar SPHEREVISION.bat” en esta misma carpeta.';
  $('progress-message').textContent=message;
  $('viewer-notice').textContent='La comparación necesita conectarse al archivo público de SPHEREx. Usa el iniciador incluido; no hace falta descargar ningún FITS.';
  $('sample-button').disabled=true;
  $('search-form').querySelector('button[type="submit"]').disabled=true;
  $('empty-state').querySelector('strong').textContent='Falta iniciar el prototipo';
  $('empty-state').querySelector('p').textContent='Abre “Iniciar SPHEREVISION.bat” en la carpeta del proyecto.';
}

async function runComparison(region){
  if(state.busy)return;
  state.busy=true;
  $('sample-button').disabled=true;
  const otherButton=$('search-form').querySelector('button[type="submit"]');
  otherButton.disabled=true;
  $('progress-message').textContent='Buscando imágenes públicas de SPHEREx…';
  $('viewer-notice').textContent='Consultando NASA/IPAC IRSA y preparando las observaciones. No necesitas descargar ni cargar archivos.';
  $('empty-state').style.display='grid';
  $('empty-state').querySelector('strong').textContent='Buscando observaciones…';
  $('empty-state').querySelector('p').textContent='SPHEREVISION está consultando imágenes públicas para esta región.';
  document.querySelector('#comparacion').scrollIntoView({behavior:'smooth',block:'start'});
  try{
    const query=new URLSearchParams({ra:String(region.ra),dec:String(region.dec),radius:String(region.radius)});
    const response=await fetch(`/api/observations?${query}`);
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'No se encontraron observaciones.');
    $('progress-message').textContent=`Encontramos ${result.available} imágenes. Cargando dos fechas distintas…`;
    const [a,b]=await Promise.all([loadRemoteEpoch(result.pair.a,region),loadRemoteEpoch(result.pair.b,region)]);
    state.a={...a,name:'Primera fecha',date:result.pair.a.date,collection:result.pair.a.collection};
    state.b={...b,name:'Segunda fecha',date:result.pair.b.date,collection:result.pair.b.collection};
    state.aligned=!!(state.a.wcs&&state.b.wcs&&state.a.wcs.tan&&state.b.wcs.tan);
    $('empty-state').style.display='none';
    $('blink-button').disabled=false;
    $('label-a').textContent=`PRIMERA · ${formatDate(state.a.date)}`;
    $('label-b').textContent=`SEGUNDA · ${formatDate(state.b.date)}`;
    $('progress-message').textContent=`Comparación lista para ${region.regionName}. Las imágenes corresponden a fechas separadas por ${result.pair.separationDays} días.`;
    $('viewer-notice').textContent=state.aligned
      ?'Las imágenes se alinearon con sus coordenadas celestes. Una diferencia puede deberse a un objeto, pero también a cobertura, calibración o artefactos.'
      :'No fue posible confirmar la alineación celeste de las dos imágenes. Las diferencias visibles podrían deberse al encuadre.';
    $('image-details').innerHTML=`<span>${escapeHtml(formatDate(state.a.date))} · ${escapeHtml(state.a.collection||'SPHEREx')}</span><span>${escapeHtml(formatDate(state.b.date))} · ${escapeHtml(state.b.collection||'SPHEREx')} · datos de IRSA</span>`;
    updateBlink();draw();
  }catch(error){
    $('progress-message').textContent=error?.message||'No se pudieron cargar las observaciones.';
    $('empty-state').querySelector('strong').textContent='No pudimos completar la búsqueda';
    $('empty-state').querySelector('p').textContent='Intenta con el ejemplo recomendado o vuelve a buscar más tarde.';
    $('viewer-notice').textContent='La cobertura y las fechas disponibles varían. IRSA también puede tardar en publicar observaciones nuevas.';
    state.a=null;state.b=null;draw();
  }finally{
    state.busy=false;$('sample-button').disabled=false;otherButton.disabled=false;
  }
}

async function loadRemoteEpoch(epoch,region){
  const size=Math.max(0.05,Math.min(0.2,region.radius*4));
  const query=new URLSearchParams({url:epoch.url,ra:String(region.ra),dec:String(region.dec),size:String(size)});
  const response=await fetch(`/api/fits?${query}`);
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||'No se pudo cargar una imagen pública.');}
  return parseFits(await response.blob());
}
function formatDate(value){
  if(!value)return'fecha no disponible';
  const date=new Date(value);if(Number.isNaN(date.valueOf()))return String(value);
  return new Intl.DateTimeFormat('es-CO',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(date);
}

async function parseFits(file){
  const buffer=await file.arrayBuffer();
  const bytes=new Uint8Array(buffer),view=new DataView(buffer);
  let offset=0,chosen=null;
  while(offset+2880<=bytes.length){
    const cards=new Map();let end=false,cursor=offset;
    while(cursor+80<=bytes.length){
      const card=new TextDecoder('ascii').decode(bytes.subarray(cursor,cursor+80));cursor+=80;
      const key=card.slice(0,8).trim();if(key==='END'){end=true;break;}
      if(card[8]==='=')cards.set(key,parseFitsValue(card.slice(10)));
    }
    if(!end)break;
    const dataStart=offset+Math.ceil((cursor-offset)/2880)*2880;
    const axes=Number(cards.get('NAXIS')||0),dims=[];
    for(let i=1;i<=axes;i++)dims.push(Number(cards.get(`NAXIS${i}`)||0));
    const bitpix=Number(cards.get('BITPIX')||0),dataElements=axes>0?dims.reduce((p,n)=>p*n,1):0;
    const pcount=Number(cards.get('PCOUNT')||0),gcount=Number(cards.get('GCOUNT')||1),byteCount=(dataElements+pcount)*gcount*Math.abs(bitpix)/8;
    const image=(cards.get('XTENSION')==='IMAGE'||cards.has('SIMPLE'))&&dims.length>=2&&dims[0]>0&&dims[1]>0&&[8,16,32,64,-32,-64].includes(bitpix);
    if(!chosen&&image&&dataStart+byteCount<=bytes.length)chosen={dataStart,dims,bitpix,cards,count:dims[0]*dims[1]};
    if(!Number.isFinite(byteCount)||byteCount<0)break;
    offset=dataStart+Math.ceil(byteCount/2880)*2880;
  }
  if(!chosen)throw new Error('IRSA devolvió un FITS sin una imagen compatible. Prueba de nuevo con otra región.');
  const{dataStart,dims,bitpix,cards,count}=chosen;
  const bscale=Number(cards.get('BSCALE')??1),bzero=Number(cards.get('BZERO')??0),blank=cards.get('BLANK');
  const values=new Float32Array(count);let valid=0;
  for(let i=0;i<count;i++){
    const pos=dataStart+i*Math.abs(bitpix)/8;let v;
    if(bitpix===8)v=view.getUint8(pos);else if(bitpix===16)v=view.getInt16(pos,false);else if(bitpix===32)v=view.getInt32(pos,false);else if(bitpix===64)v=Number(view.getBigInt64(pos,false));else if(bitpix===-32)v=view.getFloat32(pos,false);else v=view.getFloat64(pos,false);
    if(!Number.isFinite(v)||(blank!==undefined&&v===Number(blank))){values[i]=NaN;continue;}
    values[i]=v*bscale+bzero;valid++;
  }
  if(!valid)throw new Error('La imagen no contiene píxeles utilizables.');
  const sample=[],stride=Math.max(1,Math.floor(count/100000));
  for(let i=0;i<count;i+=stride)if(Number.isFinite(values[i]))sample.push(values[i]);
  sample.sort((a,b)=>a-b);
  const lo=sample[Math.floor((sample.length-1)*0.02)],hi=sample[Math.floor((sample.length-1)*0.985)];
  return{values,width:dims[0],height:dims[1],lo,hi,wcs:readWcs(cards)};
}
function parseFitsValue(raw){
  const value=raw.split('/')[0].trim();
  if(value.startsWith("'"))return value.slice(1,value.lastIndexOf("'")).trim();
  if(value==='T')return true;if(value==='F')return false;
  const number=Number(value.replace(/[dD]/,'E'));return value&&Number.isFinite(number)?number:value;
}
function readWcs(cards){
  const ra=Number(cards.get('CRVAL1')),dec=Number(cards.get('CRVAL2')),crpix1=Number(cards.get('CRPIX1')),crpix2=Number(cards.get('CRPIX2'));
  if(![ra,dec,crpix1,crpix2].every(Number.isFinite))return null;
  let cd11=Number(cards.get('CD1_1')),cd12=Number(cards.get('CD1_2')),cd21=Number(cards.get('CD2_1')),cd22=Number(cards.get('CD2_2'));
  if(![cd11,cd12,cd21,cd22].every(Number.isFinite)){
    const dx=Number(cards.get('CDELT1')),dy=Number(cards.get('CDELT2'));if(![dx,dy].every(Number.isFinite))return null;
    cd11=dx*Number(cards.get('PC1_1')??1);cd12=dx*Number(cards.get('PC1_2')??0);cd21=dy*Number(cards.get('PC2_1')??0);cd22=dy*Number(cards.get('PC2_2')??1);
  }
  const det=cd11*cd22-cd12*cd21;if(!Number.isFinite(det)||Math.abs(det)<1e-18)return null;
  const c1=String(cards.get('CTYPE1')||'').toUpperCase(),c2=String(cards.get('CTYPE2')||'').toUpperCase();
  return{ra,dec,crpix1,crpix2,cd11,cd12,cd21,cd22,inv11:cd22/det,inv12:-cd12/det,inv21:-cd21/det,inv22:cd11/det,tan:c1.includes('TAN')&&c2.includes('TAN')};
}
function escapeHtml(text){return String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function updateBlink(){
  clearInterval(state.timer);state.timer=null;
  const blinking=$('mode').value==='blink'&&state.a&&state.b;
  $('blink-button').disabled=!blinking;
  if(blinking&&!state.paused)state.timer=setInterval(()=>{state.blinkB=!state.blinkB;draw();},700);
}
function draw(){
  const W=canvas.width,H=canvas.height;ctx.clearRect(0,0,W,H);ctx.fillStyle='#050d17';ctx.fillRect(0,0,W,H);
  const a=state.a,b=state.b;if(!a&&!b)return;
  const base=a||b,fit=Math.min(W/base.width,H/base.height),dw=Math.max(1,Math.floor(base.width*fit)),dh=Math.max(1,Math.floor(base.height*fit));
  const ox=Math.floor((W-dw)/2),oy=Math.floor((H-dh)/2),mode=$('mode').value,opacity=Number($('opacity').value)/100;
  const img=ctx.createImageData(dw,dh);
  for(let py=0;py<dh;py++)for(let px=0;px<dw;px++){
    const x=(px+.5)*base.width/dw-.5,y=(py+.5)*base.height/dh-.5,av=a?sample(a,x,y):NaN,bv=b?sampleRegistered(b,x,y,a,base):NaN;let r=0,g=0,bl=0;
    if(mode==='difference'&&a&&b){if(Number.isFinite(av)&&Number.isFinite(bv)){const diff=normalize(av,a)-normalize(bv,b),amp=Math.min(1,Math.abs(diff)*2.2);if(diff>=0){r=255*amp;g=112*amp;bl=35*amp;}else{r=25*amp;g=145*amp;bl=255*amp;}}}
    else if(mode==='overlay'&&a&&b){const aa=Number.isFinite(av)?normalize(av,a)*255:0,bb=Number.isFinite(bv)?normalize(bv,b)*255:0;r=aa*(1-opacity)+bb*opacity;g=r;bl=r;}
    else{const useB=mode==='b'||(mode==='blink'&&state.blinkB),value=useB?bv:av,obj=useB?b:a;if(Number.isFinite(value)&&obj){const q=normalize(value,obj)*255;r=q;g=q;bl=q;}}
    const i=(py*dw+px)*4;img.data[i]=r;img.data[i+1]=g;img.data[i+2]=bl;img.data[i+3]=255;
  }
  ctx.putImageData(img,ox,oy);
  $('label-a').style.display=(a&&mode!=='b')?'block':'none';
  $('label-b').style.display=(b&&(mode==='b'||mode==='blink'&&state.blinkB||mode==='overlay'||mode==='difference'))?'block':'none';
}
function normalize(v,d){return Math.max(0,Math.min(1,(v-d.lo)/(d.hi-d.lo||1)));}
function sample(d,x,y){if(!d||x<0||y<0||x>=d.width||y>=d.height)return NaN;return d.values[Math.round(y)*d.width+Math.round(x)];}
function sampleRegistered(b,x,y,a,base){
  if(!b)return NaN;
  if(a?.wcs&&b.wcs&&a.wcs.tan&&b.wcs.tan){const sky=pixelToSky(a.wcs,x,y),p=skyToPixel(b.wcs,sky[0],sky[1]);return sample(b,p[0],p[1]);}
  return sample(b,(x+.5)*b.width/base.width-.5,(y+.5)*b.height/base.height-.5);
}
function pixelToSky(w,x,y){
  const dx=x+1-w.crpix1,dy=y+1-w.crpix2,xr=(w.cd11*dx+w.cd12*dy)*Math.PI/180,yr=(w.cd21*dx+w.cd22*dy)*Math.PI/180,r0=w.ra*Math.PI/180,d0=w.dec*Math.PI/180,den=Math.cos(d0)-yr*Math.sin(d0);
  return[(r0+Math.atan2(xr,den))*180/Math.PI,Math.atan2(Math.sin(d0)+yr*Math.cos(d0),Math.sqrt(den*den+xr*xr))*180/Math.PI];
}
function skyToPixel(w,raDeg,decDeg){
  const r0=w.ra*Math.PI/180,d0=w.dec*Math.PI/180,ra=raDeg*Math.PI/180,dec=decDeg*Math.PI/180;let dra=ra-r0;
  while(dra>Math.PI)dra-=2*Math.PI;while(dra< -Math.PI)dra+=2*Math.PI;
  const den=Math.sin(dec)*Math.sin(d0)+Math.cos(dec)*Math.cos(d0)*Math.cos(dra);if(den<=0)return[-1e9,-1e9];
  const xi=Math.cos(dec)*Math.sin(dra)/den*180/Math.PI,eta=(Math.sin(dec)*Math.cos(d0)-Math.cos(dec)*Math.sin(d0)*Math.cos(dra))/den*180/Math.PI;
  return[w.inv11*xi+w.inv12*eta+w.crpix1-1,w.inv21*xi+w.inv22*eta+w.crpix2-1];
}
