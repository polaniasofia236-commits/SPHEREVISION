import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { searchEpochPair, fetchFits } from './api/lib/spherex.js';

const root=path.dirname(fileURLToPath(import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/markdown; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  try{
    if(url.pathname==='/api/observations'){
      const result=await searchEpochPair({ra:url.searchParams.get('ra'),dec:url.searchParams.get('dec'),radius:url.searchParams.get('radius')||undefined});
      return send(res,200,'application/json; charset=utf-8',JSON.stringify(result));
    }
    if(url.pathname==='/api/fits'){
      const result=await fetchFits(url.searchParams.get('url'),{ra:url.searchParams.get('ra'),dec:url.searchParams.get('dec'),size:url.searchParams.get('size')});
      return send(res,200,result.contentType,Buffer.from(result.data),{'Cache-Control':'public, max-age=3600'});
    }
    const requested=url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname);
    const filePath=path.resolve(root,`.${requested}`);
    if(!filePath.startsWith(root+path.sep))return send(res,403,'text/plain','Forbidden');
    const bytes=await fs.readFile(filePath);
    return send(res,200,mime[path.extname(filePath)]||'application/octet-stream',bytes);
  }catch(error){
    const code=error?.code==='ENOENT'?404:502;
    const message=error?.cause?.code||error?.message==='fetch failed'
      ? 'No pudimos conectar con IRSA. Comprueba la conexión a internet y vuelve a intentarlo.'
      : error?.message||'No se pudo completar la solicitud.';
    return send(res,code,'application/json; charset=utf-8',JSON.stringify({error:message}));
  }
});
function send(res,status,type,body,headers={}){res.writeHead(status,{'Content-Type':type,'X-Content-Type-Options':'nosniff',...headers});res.end(body);}
const port=process.env.PORT==='0'?0:(Number(process.env.PORT)||4173);
// Render and similar hosts route public traffic to 0.0.0.0; keep the
// localhost-only binding for the downloadable desktop prototype.
const host=process.env.NODE_ENV==='production'?'0.0.0.0':'127.0.0.1';
server.listen(port,host,()=>{
  const address=server.address();
  const url=`http://127.0.0.1:${address.port}`;
  console.log(`SPHEREVISION en ${url}`);
  if(process.env.SPHEREVISION_OPEN_BROWSER==='1'&&process.platform==='win32'){
    const browser=spawn('cmd.exe',['/c','start','',url],{detached:true,stdio:'ignore',windowsHide:true});
    browser.unref();
  }
});
