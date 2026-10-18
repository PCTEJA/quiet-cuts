// Skia/CanvasKit runs the renderer in WebAssembly. Geometry is tiled offline.
const BASE = new URL('.', import.meta.url);
const MAX_TILES = 32, MAX_BYTES = 8 * 1024 * 1024, MAX_INFLIGHT = 4;
let runtime;
function loadRuntime() {
  return runtime ||= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('vendor/canvaskit.js', BASE).href;
    script.onload = () => globalThis.CanvasKitInit({ locateFile: f => new URL(`vendor/${f}`, BASE).href }).then(resolve,reject);
    script.onerror = () => reject(new Error('The WebAssembly map engine could not load. Reload to retry.'));
    document.head.append(script);
  });
}
const project = (lon,lat) => [(lon+180)/360, (1-Math.asinh(Math.tan(Math.max(-85,Math.min(85,lat))*Math.PI/180))/Math.PI)/2];
const views = { US: [-98.5,38.5,3.8], CA: [-119.5,36.6,5], WA: [-120.8,47.2,5.7], NY: [-75.3,43,5.7] };
const stateIds = { '06':'CA', '53':'WA', '36':'NY' };

export async function createMap(element, { onSelect = () => {}, onStats = () => {}, onError = () => {} } = {}) {
  let CK;
  try { CK = await loadRuntime(); } catch (e) { onError(e.message); throw e; }
  let available=null;
  try { const r=await fetch(new URL('tiles/manifest.json',BASE));if(r.ok)available=new Set((await r.json()).keys); } catch { /* Individual requests remain usable if the index is unavailable. */ }
  let width=1,height=1,dpr=1,surface=null,zoom=3.8,center=project(-98.5,38.5),events=[],selected=null;
  let mode='events',regionTotals={CA:0,WA:0,NY:0};
  let destroyed=false,frame=0,drag=null,hit=[],cohort='US',rendered=0,requests=0,cachedBytes=0,errorReported=false;
  const cache=new Map(), active=new Map(), missing=new Set();
  let wanted=new Map();
  const paints={};
  for(const [name,rgba,stroke] of [
    ['land',[0.14,0.22,0.28,1]], ['study',[0.23,0.37,0.40,1]],
    ['CA',[0.12,0.31,0.33,1]], ['WA',[0.12,0.31,0.33,1]], ['NY',[0.12,0.31,0.33,1]],
    ['border',[0.4,0.53,0.57,0.53],true], ['county',[0.43,0.55,0.58,0.28],true],
    ['dot',[1,0.45,0.35,0.92]], ['halo',[1,0.45,0.35,0.13]], ['ring',[1,0.88,0.68,1],true]
  ]) { const p=new CK.Paint(); p.setColor(CK.Color4f(...rgba)); p.setAntiAlias(true); if(stroke) {p.setStyle(CK.PaintStyle.Stroke);p.setStrokeWidth(1);} paints[name]=p; }
  element.tabIndex=0;
  element.setAttribute('role','img');
  element.setAttribute('aria-label','Interactive layoff map. Arrow keys pan; plus and minus zoom; Home resets. Select individual records in the accessible event list.');
  element.style.touchAction='none';
  const extent=()=>256*2**zoom;
  function stats() { onStats({ engine:'Skia · WebAssembly', zoom: +zoom.toFixed(1), visibleTiles: wanted.size, renderedTiles: rendered, cachedTiles:cache.size, cacheLimit:MAX_TILES, tileBytes:cachedBytes, activeRequests:active.size, requests, countyDetail:Math.floor(zoom)>=5, wasmBytes:CK.HEAPU8?.buffer.byteLength||0, mode, regionTotals:{...regionTotals} }); }
  // Regions show sums of the current filtered sample, never statewide population estimates.
  // Zero selected workers is dark teal; states outside the study remain neutral slate.
  function updateRegions() {
    regionTotals={CA:0,WA:0,NY:0};
    for(const e of events)if(Object.hasOwn(regionTotals,e.state)&&Number.isFinite(+e.workers))regionTotals[e.state]+=Math.max(0,+e.workers);
    const max=Math.max(...Object.values(regionTotals),1),low=[.22,.61,.59],high=[1,.45,.35];
    for(const state of Object.keys(regionTotals)) {
      const amount=regionTotals[state],t=amount/max;
      const rgb=amount>0?low.map((value,i)=>value+(high[i]-value)*t):[.12,.31,.33];
      paints[state].setColor(CK.Color4f(...rgb,1));
    }
    updateDescription();
  }
  function updateDescription() {
    const totals=Object.entries(regionTotals).map(([s,n])=>`${s}: ${n.toLocaleString()} workers in selected records`).join('; ');
    element.title=mode==='regions'?`${totals}. Color is relative to this filtered sample. Dark teal means zero selected workers; slate means outside the study. County lines provide geographic context only.`:'Drag to pan; scroll to zoom. Select a circle to inspect a record.';
    element.setAttribute('aria-label',`Interactive layoff map. ${mode==='regions'?`State totals for selected records. ${totals}.`:'Event markers for selected records.'} Arrow keys pan; plus and minus zoom; Home resets. Select individual records in the accessible event list.`);
  }
  function schedule() { if(!destroyed&&!frame) frame=requestAnimationFrame(draw); }
  function tilePaths(data) {
    const output=[];
    try {
      for(const [layer,features] of [['s',data.s],['c',data.c]]) for(const f of features||[]) {
        const p=new CK.Path();
        for(const ring of f.g) { if(!ring.length)continue; p.moveTo(ring[0][0],ring[0][1]); for(let i=1;i<ring.length;i++)p.lineTo(ring[i][0],ring[i][1]);p.close(); }
        output.push({p,layer,id:f.id});
      }
      return output;
    } catch(e) { output.forEach(f=>f.p.delete());throw e; }
  }
  function removeTile(key) { const t=cache.get(key); t.paths.forEach(f=>f.p.delete());cachedBytes-=t.bytes;cache.delete(key); }
  function evict() {
    while(cache.size>MAX_TILES||cachedBytes>MAX_BYTES) {
      const key=[...cache.keys()].find(k=>!wanted.has(k));
      if(key===undefined)break;removeTile(key);
    }
  }
  function visible() {
    const z=Math.max(2,Math.min(7,Math.floor(zoom))),n=2**z,scale=extent(), tilePx=scale/n;
    let xmin=Math.max(0,Math.floor((center[0]*scale-width/2)/tilePx)),xmax=Math.min(n-1,Math.floor((center[0]*scale+width/2)/tilePx));
    let ymin=Math.max(0,Math.floor((center[1]*scale-height/2)/tilePx)),ymax=Math.min(n-1,Math.floor((center[1]*scale+height/2)/tilePx));
    const result=[];
    for(let x=xmin;x<=xmax;x++)for(let y=ymin;y<=ymax;y++){const key=`${z}/${x}/${y}`;if(!available||available.has(key))result.push({key,x,y,z,d:(x+.5-center[0]*n)**2+(y+.5-center[1]*n)**2});}
    // Bound both drawing work and cache, including unusually large browser windows.
    return new Map(result.sort((a,b)=>a.d-b.d).slice(0,MAX_TILES).map(t=>[t.key,t]));
  }
  function fetchTiles() {
    for(const [key,controller] of active)if(!wanted.has(key))controller.abort();
    for(const [key] of wanted) {
      if(active.size>=MAX_INFLIGHT)break;
      if(cache.has(key)||active.has(key)||missing.has(key))continue;
      const controller=new AbortController(); active.set(key,controller);requests++;
      fetch(new URL(`tiles/${key}.json`,BASE),{signal:controller.signal}).then(async r=>{
        if(r.status===404){missing.add(key);if(missing.size>256)missing.delete(missing.values().next().value);return;}
        if(!r.ok)throw new Error(`Map tile request failed (${r.status})`);
        const text=await r.text();
        if(destroyed||controller.signal.aborted||!wanted.has(key))return;
        const tile={paths:tilePaths(JSON.parse(text)),bytes:text.length*2};
        cache.set(key,tile);cachedBytes+=tile.bytes;evict();
      }).catch(e=>{if(e.name!=='AbortError'&&!destroyed){missing.add(key);if(!errorReported){errorReported=true;onError('Some map detail could not load. The record list remains available.');}}}).finally(()=>{active.delete(key);if(!destroyed){schedule();fetchTiles();}});
    }
  }
  function draw() {
    frame=0;if(destroyed||!surface)return;
    wanted=visible();fetchTiles();evict();
    const c=surface.getCanvas(),scale=extent();
    c.clear(CK.Color4f(0.055,0.12,0.16,1));c.save();c.scale(dpr,dpr);rendered=0;
    for(const [key,t] of wanted) {
      const tile=cache.get(key);if(!tile)continue;
      cache.delete(key);cache.set(key,tile);rendered++;
      const size=scale/2**t.z,tx=t.x*size-center[0]*scale+width/2,ty=t.y*size-center[1]*scale+height/2;
      c.save();c.clipRect(CK.LTRBRect(tx,ty,tx+size,ty+size),CK.ClipOp.Intersect,false);c.translate(tx,ty);c.scale(size/4096,size/4096);
      paints.border.setStrokeWidth(4096/size*.65);paints.county.setStrokeWidth(4096/size*.45);
      for(const f of tile.paths) {
        if(f.layer==='s') { const state=stateIds[f.id];c.drawPath(f.p,state?(mode==='regions'?paints[state]:paints.study):paints.land);c.drawPath(f.p,paints.border); }
        else c.drawPath(f.p,paints.county);
      }
      c.restore();
    }
    hit=[];
    for(const e of mode==='events'?events:[]) {
      if(e.lon==null||e.lat==null||!Number.isFinite(+e.lon)||!Number.isFinite(+e.lat))continue;
      const p=project(+e.lon,+e.lat),x=(p[0]-center[0])*scale+width/2,y=(p[1]-center[1])*scale+height/2;
      if(x< -30||x>width+30||y< -30||y>height+30)continue;
      const r=Math.max(4,Math.min(19,3+Math.sqrt(+e.workers||0)*.24));
      c.drawCircle(x,y,r+5,paints.halo);c.drawCircle(x,y,r,paints.dot);
      if(e.id===selected){paints.ring.setStrokeWidth(2);c.drawCircle(x,y,r+3,paints.ring);}
      hit.push({x,y,r:Math.max(r,12),event:e});
    }
    c.restore();surface.flush();stats();
  }
  function resize() {
    const r=element.getBoundingClientRect();if(!r.width||!r.height)return;
    width=r.width;height=r.height;dpr=Math.min(2,window.devicePixelRatio||1);
    // At most 4 megapixels of surface memory, including very wide displays.
    dpr=Math.min(dpr,Math.sqrt(4_000_000/(width*height)));
    if(surface){surface.dispose();surface=null;}
    element.width=Math.max(1,Math.round(width*dpr));element.height=Math.max(1,Math.round(height*dpr));
    surface=CK.MakeCanvasSurface(element);
    if(!surface){onError('WebAssembly drawing is unavailable on this device. Explore the accessible records below.');return;}
    schedule();
  }
  function zoomBy(delta,px=width/2,py=height/2) {
    const before=extent(),anchor=[center[0]+(px-width/2)/before,center[1]+(py-height/2)/before];
    zoom=Math.max(2,Math.min(7.9,zoom+delta));const after=extent();center=[anchor[0]-(px-width/2)/after,anchor[1]-(py-height/2)/after];schedule();
  }
  function fit(state='US') {
    cohort=views[state]?state:'US';const v=views[cohort];center=project(v[0],v[1]);
    zoom=cohort==='US'?Math.max(2,Math.min(4.1,Math.log2(Math.max(250,width)*360/(66*256)))):v[2];schedule();
  }
  const listeners=[];
  function listen(type,fn,options){element.addEventListener(type,fn,options);listeners.push([type,fn,options]);}
  listen('wheel',e=>{e.preventDefault();const r=element.getBoundingClientRect();zoomBy(-Math.sign(e.deltaY)*.35,e.clientX-r.left,e.clientY-r.top);},{passive:false});
  listen('pointerdown',e=>{element.focus({preventScroll:true});element.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};element.style.cursor='grabbing';});
  listen('pointermove',e=>{if(!drag)return;const s=extent();center[0]-=(e.clientX-drag.x)/s;center[1]=Math.max(.03,Math.min(.95,center[1]-(e.clientY-drag.y)/s));center[0]=Math.max(0,Math.min(1,center[0]));drag.moved ||= Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>5;drag.x=e.clientX;drag.y=e.clientY;schedule();});
  listen('pointerup',e=>{if(drag&&!drag.moved){const r=element.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;const mark=hit.filter(p=>Math.hypot(p.x-x,p.y-y)<=p.r).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];if(mark){selected=mark.event.id;onSelect(selected);schedule();}}drag=null;element.style.cursor='grab';});
  listen('pointercancel',()=>{drag=null;element.style.cursor='grab';});
  listen('keydown',e=>{const delta={ArrowLeft:[-80,0],ArrowRight:[80,0],ArrowUp:[0,-80],ArrowDown:[0,80]}[e.key];if(delta){e.preventDefault();center[0]+=delta[0]/extent();center[1]+=delta[1]/extent();schedule();}else if(['+','=','-','Home'].includes(e.key)){e.preventDefault();if(e.key==='Home')fit();else zoomBy(e.key==='-'?-.5:.5);}});
  element.style.cursor='grab';
  const observer=new ResizeObserver(resize);observer.observe(element);resize();fit();updateRegions();
  return { setEvents(next){events=Array.isArray(next)?next:[];updateRegions();schedule();}, fit, zoomBy,
    // setMode('regions') shades CA/WA/NY by filtered workers; 'events' restores markers.
    setMode(next){mode=next==='regions'?'regions':'events';updateDescription();schedule();},
    select(id){selected=id;schedule();},
    destroy(){destroyed=true;observer.disconnect();cancelAnimationFrame(frame);active.forEach(c=>c.abort());active.clear();for(const key of [...cache.keys()])removeTile(key);Object.values(paints).forEach(p=>p.delete());surface?.dispose();listeners.forEach(([t,f,o])=>element.removeEventListener(t,f,o));}
  };
}
