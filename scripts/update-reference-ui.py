from pathlib import Path

root = Path(__file__).resolve().parents[1]
p = root / 'dist/index.html'
s = p.read_text(encoding='utf-8')
s = s.replace('content="#182e35"', 'content="#15345b"').replace('<link rel="stylesheet" href="style.css">', '<link rel="stylesheet" href="style.css"><link rel="stylesheet" href="reference.css">')
a = s.index('<a class="brand"'); b = s.index('<nav aria-label', a)
s = s[:a] + '<a class="brand" href="#overview" aria-label="Quiet Cuts home"><img src="assets/quiet-cuts.svg" alt="Quiet Cuts — Notice to News"></a>' + s[b:]
a = s.index('<div class="sidebar-bottom">'); b = s.index('</aside>', a)
s = s[:a] + '<div class="sidebar-bottom"><div id="sidebar-summary"></div><div class="sidebar-source">◉ &nbsp; Source snapshot<br><span>Coverage incomplete</span></div></div>' + s[b:]
s = s.replace('<body>', '<body data-page="overview">')
s = s.replace('WORKFORCE INTELLIGENCE', 'RESEARCH WORKSPACE')
s = s.replace('<div class="eyebrow"><span class="dot"></span> THE QUIET CUTS PROJECT</div>', '')
s = s.replace('<div class="dataset-switch">', '<div id="headline-metrics"></div></section><details class="workspace-settings"><summary>Research workspace <span>Snapshot, dataset & exports</span></summary><div class="workspace-body"><div class="dataset-switch">', 1)
s = s.replace('</div></section>\n<section class="history-controls"', '</div>\n<section class="history-controls"', 1)
s = s.replace('<div id="mode-note"', '</div></details><div id="mode-note"', 1)
s = s.replace('All three states', 'CA, NY, WA (3)')
s = s.replace('placeholder="Search employers…"', 'placeholder="Search employers (e.g. Boeing, Amazon)"')
s = s.replace('<footer><span>Quiet Cuts <b>·</b> Evidence before inference.</span>', '<footer><img src="assets/quiet-cuts-white.svg" alt="Quiet Cuts — Notice to News"><span>Evidence before inference.</span>')
p.write_text(s, encoding='utf-8')

p = root / 'dist/app.js'; s = p.read_text(encoding='utf-8')
s = s.replace("colors=['#e98068','#5b9a90','#cfb77c','#9baab5']", "colors=['#0866f5','#4694ff','#8abaff','#15345b']")
s = s.replace("sort:'recent'", "sort:'recent',explore:'states',analysis:'trends',selected:null")
s = s.replace('function overview(data){', 'function legacyOverview(data){', 1)
s = s.replace('function method(data){', 'function detailedMethod(data){', 1)
s = s.replace('function latency(data){', 'function reviewedLatency(data){', 1)
s = s.replace('fill="#e98068"', 'fill="#0866f5"').replace('stroke="#5b9a90"', 'stroke="#0866f5"').replace('fill="#5b9a90"', 'fill="#0866f5"')
s = s.replace("$('#page-title').textContent=titles[state.page][0];", "document.body.dataset.page=state.page; titles.overview[1]='Explore U.S. WARN notices and other public records of planned workforce reductions.'; titles.latency=['Workforce change, in context','Explore source-reported workforce reductions over time and by industry. Public notices describe plans, not confirmed job losses.']; titles.method[1]='We use official WARN records to track planned workforce reductions in public notices.'; $('#headline-metrics').innerHTML=summaryStats(data); $('#sidebar-summary').innerHTML=sidebarStats(data); $('#page-title').textContent=titles[state.page][0];")
s = s.replace("onSelect:showEvidence", "onSelect:selectRecord")
s = s.replace("$('#map-engine').textContent='WEBASSEMBLY · SKIA';", "$('#map-engine').textContent='Source coverage incomplete';")
s = s.replace("`${s.renderedTiles??s.visibleTiles} visible · ${s.cachedTiles}/32 cached · ${Math.round(s.tileBytes/1024)} KB geometry${s.countyDetail?' · county detail':''}`", "`Approximate locations${s.countyDetail?' · County detail':''}`")
s = s.replace("map.setEvents(data);map.setMode", "map.setEvents(data);map.select(state.selected);map.setMode")
s = s.replace('function bindView(){', '''function bindView(){
document.querySelectorAll('[data-explore]').forEach(b=>b.onclick=()=>{state.explore=b.dataset.explore;render()});
document.querySelectorAll('[data-analysis]').forEach(b=>b.onclick=()=>{state.analysis=b.dataset.analysis;render()});
const fullscreen=$('#map-fullscreen');if(fullscreen)fullscreen.onclick=()=>{const panel=$('.map-card');if(document.fullscreenElement)document.exitFullscreen?.();else panel.requestFullscreen?.()};
''', 1)
# Keep real dates, counts, data refresh, and reviewed-latency calculations intact.
ui = (root/'scripts/reference-ui.txt').read_text(encoding='utf-8')
s = s.replace('function scatter(data){', ui+'\nfunction scatter(data){', 1)
p.write_text(s, encoding='utf-8')

p = root/'dist/map.js'; s=p.read_text(encoding='utf-8')
replacements={
"[0.14,0.22,0.28,1]":"[0.93,0.96,0.99,1]", "[0.23,0.37,0.40,1]":"[0.85,0.92,1,1]",
"[0.12,0.31,0.33,1]":"[0.86,0.92,1,1]", "[0.4,0.53,0.57,0.53]":"[0.60,0.74,0.91,0.85]",
"[0.43,0.55,0.58,0.28]":"[0.60,0.74,0.91,0.4]", "[1,0.45,0.35,0.92]":"[0.10,0.49,1,0.7]",
"[1,0.45,0.35,0.13]":"[0.24,0.61,1,0.13]", "[1,0.88,0.68,1]":"[1,1,1,1]",
"low=[.22,.61,.59],high=[1,.45,.35]":"low=[.78,.88,1],high=[.03,.32,.85]",
":[.12,.31,.33]":":[.86,.92,1]", "CK.Color4f(0.055,0.12,0.16,1)":"CK.Color4f(1,1,1,1)",
"Dark teal means zero selected workers; slate means outside the study":"Pale blue means zero selected workers; gray means outside the study"
}
for old,new in replacements.items():s=s.replace(old,new)
s=s.replace("['dot',[0.10,0.49,1,0.7]]", "['selected',[0.70,0.13,0.20,1]], ['dot',[0.10,0.49,1,0.7]]")
s=s.replace('c.drawCircle(x,y,r,paints.dot);', 'c.drawCircle(x,y,r,e.id===selected?paints.selected:paints.dot);paints.ring.setStrokeWidth(1);c.drawCircle(x,y,r,paints.ring);')
p.write_text(s,encoding='utf-8')

p=root/'scripts/serve.mjs';s=p.read_text(encoding='utf-8').replace("'.css':'text/css'", "'.css':'text/css','.svg':'image/svg+xml','.png':'image/png'");p.write_text(s,encoding='utf-8')
