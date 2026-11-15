const API=(window.DN_SERVER||'').replace(/\/$/,''),NATIVE=!!(window.Capacitor&&Capacitor.isNativePlatform&&Capacitor.isNativePlatform());
const Game=NATIVE?Capacitor.registerPlugin('Game'):null;
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s),LS=localStorage;
let fails=0,joining=false,gpsOn=false,tl,S=null,M=null,I=null,off=0,pos=null,posAcc=null,map,ws,lastSend=0,alerted=false,actx,noRe=false,step=0,cur=null,lsig='',lastView='',camStream,camBlob,camCb,wl,heading=null,nstarted='';
let tsrc=0,terr=0,mapReady=false;
let sosSeen='',panelOpen=true,route=null,routeAt=0,routeFrom=null,routeTo=null,sirenT=null,sirenO=null,sirenStop=0,hold=null;
const lay={p:{},ph:{},cp:{},ring:{},me:null,acc:null,sosPin:null,sosLines:{},route:null,line:null};
function mkTok(){try{const a=new Uint8Array(20);crypto.getRandomValues(a);return Array.from(a,b=>b.toString(16).padStart(2,'0')).join('')}catch(e){return Array.from({length:40},()=>Math.floor(Math.random()*16).toString(16)).join('')}}
if(!/^[A-Za-z0-9_-]{16,64}$/.test(LS.dn_tok||''))LS.dn_tok=mkTok();
const TOK=LS.dn_tok;
const now=()=>(Date.now()+off)/1000;
const fmt=s=>{s=Math.max(0,Math.ceil(s));const h=s/3600|0,m=(s%3600)/60|0,x=s%60;return(h?h+':'+String(m).padStart(2,'0'):String(m).padStart(2,'0'))+':'+String(x).padStart(2,'0')};
const ago=s=>{s=Math.max(0,Math.floor(s));return s<60?s+' s':fmt(s)};
const vib=p=>navigator.vibrate&&navigator.vibrate(p);
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const send=m=>ws&&ws.readyState==1&&ws.send(JSON.stringify(m));
const err=t=>$('#err').textContent=t;
const st_=(sel,t)=>{const e=$(sel);if(e&&e.textContent!==t)e.textContent=t};
let ldT=0;
function ld(a,b){$('#boot').hidden=false;st_('#btitle',a);st_('#bmsg',b||'');clearTimeout(ldT);ldT=setTimeout(()=>{if(!$('#boot').hidden)st_('#bmsg','Durează mai mult decât de obicei… verifică internetul sau apasă Anulează.')},15000)}
function ldOff(){clearTimeout(ldT);$('#boot').hidden=true}
let popCb=null,gone=0,psig='',csig='';
const dist=d=>d<1000?Math.round(d)+' m':(d/1000).toFixed(d<10000?2:1)+' km';
const hav=(a,b,c,d)=>{const t=x=>x*Math.PI/180,p=t(c-a),q=t(d-b),h=Math.sin(p/2)**2+Math.cos(t(a))*Math.cos(t(c))*Math.sin(q/2)**2;return 12742000*Math.asin(Math.sqrt(h))};
const brg=(a,b,c,d)=>{const t=x=>x*Math.PI/180,y=Math.sin(t(d-b))*Math.cos(t(c)),x=Math.cos(t(a))*Math.sin(t(c))-Math.sin(t(a))*Math.cos(t(c))*Math.cos(t(d-b));return(Math.atan2(y,x)*180/Math.PI+360)%360};
const DIR=['N','NE','E','SE','S','SV','V','NV'];
function beep(){try{actx=actx||new AudioContext();[0,.22,.44].forEach(d=>{const o=actx.createOscillator();o.frequency.value=900;o.connect(actx.destination);o.start(actx.currentTime+d);o.stop(actx.currentTime+d+.14)})}catch(e){}}
async function wake(){try{wl=await navigator.wakeLock.request('screen')}catch(e){}}
addEventListener('deviceorientationabsolute',e=>{if(e.alpha!=null)heading=(360-e.alpha)%360},true);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState=='visible'){if(I)wake();checkPending();if(S&&I&&lastView=='game')mapUpdate()}});
addEventListener('dn-intent',()=>checkPending());

/* ---------- bridge nativ (serviciu în fundal) ---------- */
function nativeStart(){if(!Game||!I||!pos)return;const k=I.code+':'+I.user;if(nstarted===k)return;nstarted=k;
 Game.start({api:API,code:I.code,user:I.user,tok:TOK,name:I.name}).catch(()=>{nstarted=''})}
function nativeStop(){if(Game)Game.stop().catch(()=>{});nstarted=''}
async function checkPending(){if(!Game||!I)return;try{const r=await Game.pending();if(r&&r.sos)askSos()}catch(e){}}
function openUrl(u){if(Game)Game.openUrl({url:u}).catch(()=>{});else window.open(u,'_blank')}

/* ---------- SPLASH ---------- */
const SP={p:0,t0:performance.now(),done:false};
const SPM=[[0,'Se pornește motorul…'],[22,'Se încarcă harta lumii…'],[52,'Se pregătește GPS-ul…'],[80,'Aproape gata…'],[100,'Gata de vânătoare!']];
function spFrame(t){
 const el=t-SP.t0,ready=el>2400&&(mapReady||el>6500),target=ready?100:Math.min(92,100*(1-Math.exp(-el/1500)));
 SP.p+=(target-SP.p)*(ready?.16:.09);if(SP.p>99.6)SP.p=100;
 $('#spArc').style.strokeDashoffset=628.32*(1-SP.p/100);$('#spDot').style.transform='rotate('+SP.p*3.6+'deg)';
 $('#spPct').textContent=Math.round(SP.p)+'%';let m=SPM[0][1];for(const[k,v]of SPM)if(SP.p>=k)m=v;$('#spMsg').textContent=m;
 if(SP.p>=100){setTimeout(()=>{$('#splash').classList.add('out');setTimeout(()=>$('#splash').remove(),900)},380);return}
 requestAnimationFrame(spFrame)}
requestAnimationFrame(spFrame);

/* ---------- ecran de start (wizard) ---------- */
const F=['name','user','code'];
F.forEach(k=>{const e=$('#'+k);e.value=LS['dn_'+k]||'';
 e.oninput=()=>{if(k=='user')e.value=e.value.toLowerCase().replace(/[^a-z0-9_]/g,'');if(k=='code')e.value=e.value.toUpperCase().replace(/[^A-Z]/g,'');LS['dn_'+k]=e.value;err('')};
 e.onkeydown=ev=>{if(ev.key=='Enter')$('#next').click()}});
const qc=new URLSearchParams(location.search).get('c');if(qc){$('#code').value=qc.toUpperCase().slice(0,4);LS.dn_code=$('#code').value}
const hasProfile=()=>(LS.dn_name||'').trim().length>1&&(LS.dn_user||'').length>2;
function go(n){step=n;$$('.step').forEach(s=>s.classList.toggle('on',+s.dataset.s==n));$$('.dots i').forEach((d,i)=>d.classList.toggle('on',i<=n));
 const sv=hasProfile();$('#whon').textContent=($('#name').value||'').trim();$('#who').hidden=!(n==2&&sv);$('#back').style.visibility=(n&&!(n==2&&sv))?'visible':'hidden';$('#next').textContent=n==2?'Intră în cameră':'Continuă';$('#create').hidden=n!=2;err('')}
$('#back').onclick=()=>go(step-1);
$('#next').onclick=()=>{
 if(step==0){if($('#name').value.trim().length<2)return err('Scrie numele și prenumele.');go(1);$('#user').focus()}
 else if(step==1){if($('#user').value.length<3)return err('Username-ul are minim 3 caractere.');go(2);$('#code').focus()}
 else{if($('#code').value.length!=4)return err('Codul are 4 litere.');join(false)}};
$('#create').onclick=()=>join(true);
async function join(create){
 if(joining)return;joining=true;setTimeout(()=>joining=false,2500);
 const name=$('#name').value.trim(),user=$('#user').value;let code=$('#code').value;
 ld(create?'Creez camera':'Intru în cameră',create?'Se creează o cameră nouă…':'Se contactează serverul…');
 try{if(create){const r=await fetch(API+'/api/room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:user,tok:TOK})});
  if(!r.ok){let d='Nu am putut crea camera.';try{d=(await r.json()).detail||d}catch(e){}joining=false;ldOff();return err(d)}
  code=(await r.json()).code}}
 catch(e){joining=false;ldOff();if(!navigator.onLine)showOffline();return err('Nu mă pot conecta la server.')}
 I={name,user,code};LS.dn_code=code;noRe=false;gone=0;ld('Camera '+code,'Se stabilește conexiunea…');
 try{actx=actx||new AudioContext()}catch(e){}
 connect();gps();wake();
}

/* ---------- hartă: toată lumea, albă ---------- */
const SRC=[
 {u:'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',o:{subdomains:'abcd',maxNativeZoom:20,attribution:'&copy; OpenStreetMap &copy; CARTO'}},
 {u:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',o:{maxNativeZoom:19,attribution:'&copy; OpenStreetMap'}}];
function mkTiles(){
 if(tl)map.removeLayer(tl);const s=SRC[tsrc];
 tl=L.tileLayer(s.u,Object.assign({maxZoom:20,minZoom:2,className:'basetile',keepBuffer:2},s.o)).addTo(map);
 tl.on('tileload',()=>{terr=0;mapReady=true});
 tl.on('tileerror',()=>{if(++terr>=6&&tsrc<SRC.length-1){tsrc++;terr=0;mkTiles()}})}
function initMap(){
 map=L.map('map',{zoomControl:false,attributionControl:false,zoomSnap:.5,minZoom:2,worldCopyJump:true,preferCanvas:true}).setView([47.0105,28.8638],13);
 mkTiles();
 window.addEventListener('resize',()=>map.invalidateSize());
 L.control.attribution({position:'bottomleft',prefix:false}).addTo(map);
 setTimeout(()=>map.invalidateSize(),300);
}
function setPos(la,ln,acc){pos={lat:la,lng:ln};posAcc=acc;
 if(!lay.me){lay.me=L.marker([la,ln],{icon:L.divIcon({className:'',html:'<div class="me"></div>',iconSize:[22,22]}),zIndexOffset:1000}).addTo(map);map.setView([la,ln],17);
  lay.acc=L.circle([la,ln],{radius:acc||20,stroke:false,fillColor:'#0a84ff',fillOpacity:.12,interactive:false}).addTo(map)}
 else{lay.me.setLatLng([la,ln]);lay.acc.setLatLng([la,ln]);lay.acc.setRadius(Math.min(acc||20,150))}
 if(Date.now()-lastSend>2000){lastSend=Date.now();send({type:'pos',lat:la,lng:ln})}
 nativeStart()}
function gps(){
 if(gpsOn)return;gpsOn=true;
 navigator.geolocation.watchPosition(p=>setPos(p.coords.latitude,p.coords.longitude,p.coords.accuracy),
  e=>feed(e.code==1?'Locația este blocată. Permite accesul la locație din setări.':'Nu pot obține locația. Ieși în aer liber.'),{enableHighAccuracy:true,maximumAge:1000,timeout:30000});
}
function pinCls(p){
 if(S.phase=='sos')return'pin hider';
 if(p.st!='alive')return'pin dead';
 if(p.role=='seeker')return'pin seeker';
 return'pin '+(M&&M.role=='seeker'&&S.phase=='playing'?'ghost':'hider')}
function mapUpdate(){
 const ids=new Set(S.players.map(p=>p.u)),sos=S.phase=='sos'?S.sos:null;
 for(const k in lay.p)if(!ids.has(k)){map.removeLayer(lay.p[k]);delete lay.p[k]}
 for(const k in lay.ring)if(!ids.has(k)){map.removeLayer(lay.ring[k]);delete lay.ring[k]}
 for(const p of S.players){const k=p.u;
  if(k==I.user||p.lat==null){if(lay.p[k]){map.removeLayer(lay.p[k]);delete lay.p[k]}if(lay.ring[k]){map.removeLayer(lay.ring[k]);delete lay.ring[k]}continue}
  const cls=pinCls(p),ic=L.divIcon({className:'',html:`<div class="${cls}"></div>`,iconSize:[22,22]});
  if(!lay.p[k])lay.p[k]=L.marker([p.lat,p.lng],{icon:ic}).bindTooltip('',{permanent:true,direction:'top',offset:[0,-12],className:'tip'}).addTo(map);
  else lay.p[k].setLatLng([p.lat,p.lng]);
  if(lay.p[k]._c!=cls){lay.p[k]._c=cls;lay.p[k].setIcon(ic)}lay.p[k]._p=p;
  // hiderii văzuți de Seekeri: cerc „zonă posibilă” care crește cu vechimea locației
  if(p.pt&&cls=='pin ghost'){if(!lay.ring[k])lay.ring[k]=L.circle([p.lat,p.lng],{radius:20,color:'#111',weight:1.5,dashArray:'5 6',fillColor:'#111',fillOpacity:.06,interactive:false}).addTo(map);else lay.ring[k].setLatLng([p.lat,p.lng])}
  else if(lay.ring[k]){map.removeLayer(lay.ring[k]);delete lay.ring[k]}}
 const pid=new Set(S.photos.map(x=>x.id)),cid=new Set(S.caps.map(x=>x.id));
 for(const k in lay.ph)if(!pid.has(k)){map.removeLayer(lay.ph[k]);delete lay.ph[k]}
 for(const k in lay.cp)if(!cid.has(k)){map.removeLayer(lay.cp[k]);delete lay.cp[k]}
 for(const ph of S.photos)if(!lay.ph[ph.id])lay.ph[ph.id]=L.marker([ph.lat,ph.lng],{icon:L.divIcon({className:'',html:'<div class="pulse"></div>',iconSize:[22,22]})}).addTo(map).on('click',()=>openPhoto(ph));
 for(const c of S.caps)if(!lay.cp[c.id])lay.cp[c.id]=L.circle([c.lat,c.lng],{radius:25,color:'#ff8c00',fillColor:'#ff8c00',fillOpacity:.35,weight:3}).bindTooltip(c.n+' · prins',{className:'tip'}).addTo(map).on('click',()=>openPhoto(c));
 sosLayers(sos)}

/* ---------- SOS: marker, direcții, rută ---------- */
function sosLayers(s){
 if(!s||s.lat==null){clearSos();return}
 const ll=[s.lat,s.lng];
 if(!lay.sosPin)lay.sosPin=L.marker(ll,{icon:L.divIcon({className:'',html:'<div class="sosm">SOS</div>',iconSize:[30,30]}),zIndexOffset:2000}).bindTooltip('',{permanent:true,direction:'top',offset:[0,-16],className:'tip red'}).addTo(map);
 else lay.sosPin.setLatLng(ll);
 lay.sosPin.setTooltipContent(esc(s.n));
 const mine=s.u==I.user,seen=new Set();
 // direcție de la fiecare jucător către persoana în pericol
 for(const p of S.players){if(p.u==s.u||p.u==I.user||p.lat==null)continue;seen.add(p.u);
  const pts=[[p.lat,p.lng],ll];
  if(!lay.sosLines[p.u])lay.sosLines[p.u]=L.polyline(pts,{color:'#111',weight:2,opacity:.45,dashArray:'4 8',interactive:false}).addTo(map);else lay.sosLines[p.u].setLatLngs(pts)}
 for(const k in lay.sosLines)if(!seen.has(k)){map.removeLayer(lay.sosLines[k]);delete lay.sosLines[k]}
 // traseul meu
 if(mine||!pos){if(lay.route){map.removeLayer(lay.route);lay.route=null}if(lay.line){map.removeLayer(lay.line);lay.line=null}return}
 if(route&&route.pts.length>1){
  if(lay.line){map.removeLayer(lay.line);lay.line=null}
  if(!lay.route)lay.route=L.polyline(route.pts,{color:'#ff3b30',weight:6,opacity:.9,lineCap:'round',interactive:false}).addTo(map);else lay.route.setLatLngs(route.pts)}
 else{
  if(lay.route){map.removeLayer(lay.route);lay.route=null}
  const pts=[[pos.lat,pos.lng],ll];
  if(!lay.line)lay.line=L.polyline(pts,{color:'#ff3b30',weight:5,opacity:.9,dashArray:'2 10',lineCap:'round',interactive:false}).addTo(map);else lay.line.setLatLngs(pts)}
 fetchRoute(s)}
function clearSos(){
 if(lay.sosPin){map.removeLayer(lay.sosPin);lay.sosPin=null}
 for(const k in lay.sosLines){map.removeLayer(lay.sosLines[k]);delete lay.sosLines[k]}
 if(lay.route){map.removeLayer(lay.route);lay.route=null}if(lay.line){map.removeLayer(lay.line);lay.line=null}
 route=routeFrom=routeTo=null}
async function fetchRoute(s){
 if(!pos||s.lat==null||s.u==I.user)return;const t=Date.now();
 if(t-routeAt<15000)return;
 if(route&&routeFrom&&routeTo&&hav(routeFrom.lat,routeFrom.lng,pos.lat,pos.lng)<30&&hav(routeTo.lat,routeTo.lng,s.lat,s.lng)<30)return;
 routeAt=t;routeFrom={lat:pos.lat,lng:pos.lng};routeTo={lat:s.lat,lng:s.lng};
 try{const c=new AbortController();setTimeout(()=>c.abort(),8000);
  const r=await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${pos.lng},${pos.lat};${s.lng},${s.lat}?overview=full&geometries=geojson`,{signal:c.signal}),j=await r.json(),rt=j.routes&&j.routes[0];
  if(!rt)throw 0;route={pts:rt.geometry.coordinates.map(c=>[c[1],c[0]]),d:rt.distance,t:rt.duration}}
 catch(e){route=null}
 if(S&&S.phase=='sos')sosLayers(S.sos)}
function fitAll(){
 const pts=[];if(pos)pts.push([pos.lat,pos.lng]);for(const k in lay.p)pts.push(lay.p[k].getLatLng());
 if(S&&S.sos&&S.sos.lat!=null)pts.push([S.sos.lat,S.sos.lng]);
 if(pts.length>1)map.fitBounds(L.latLngBounds(pts),{paddingTopLeft:[44,170],paddingBottomRight:[44,S&&S.phase=='sos'?330:180],maxZoom:17});
 else if(pts.length)map.setView(pts[0],17)}

/* ---------- conexiune ---------- */
function connect(){
 if(ws&&ws.readyState<2)return;
 ws=new WebSocket((API?API.replace(/^http/,'ws'):(location.protocol=='https:'?'wss':'ws')+'://'+location.host)+`/ws/${I.code}/${I.user}?t=${TOK}`);
 ws.onopen=()=>{fails=0;hideOffline();if(!$('#boot').hidden)st_('#bmsg','Se sincronizează jucătorii…');send({type:'join',name:I.name});if(pos)send({type:'pos',lat:pos.lat,lng:pos.lng})};
 ws.onmessage=e=>{const m=JSON.parse(e.data);
  if(m.type=='state')onState(m);
  else if(m.type=='event'){
   if(m.kind=='caught'){pop(m.text,m.sub);vib([200,100,400]);beep()}
   else if(m.kind=='win')vib([300,100,300]);
   else if(m.kind=='go'){feed(m.text);vib([200,80,200])}
   else if(m.kind=='ping'){feed(M&&M.role=='hider'?'Ești vizibil pentru Seekeri chiar acum!':'Locațiile Hiderilor s-au reîmprospătat');vib(M&&M.role=='hider'?[150,80,150]:80)}
   else if(m.kind!='sos')feed(m.text)}
  else if(m.type=='error')bail(m.text)};
 ws.onclose=()=>{if(noRe||!I)return;fails++;if(fails>=3||!navigator.onLine)showOffline();setTimeout(connect,2000)};
}
function bail(t){noRe=true;try{ws.close()}catch(e){}I=null;lsig='';psig=csig='';gone=0;delete LS.dn_active;nativeStop();siren(false);ldOff();clearSosUI();$('#sosconf').hidden=$('#sheet').hidden=$('#pop').hidden=true;show('intro');go(2);err(t||'')}
function show(v){if(v==lastView)return;lastView=v;
 ['intro','lobby','over'].forEach(x=>$('#'+x).hidden=x!=v);$('#game').hidden=v!='game';
 $('#map').classList.toggle('idle',v!='game');$('#shade').hidden=v=='game';if(v=='game')setTimeout(()=>map.invalidateSize(),50)}
function onState(m){
 if(!I)return;
 const mp=m.players.find(p=>p.u==I.user);
 if(m.phase!='over'&&(!mp||mp.left)){if(++gone>=2||(mp&&mp.left))return bail('Ai ieșit din joc');return}else gone=0;
 S=m;M=m.me;off=m.now*1000-Date.now();
 ldOff();LS.dn_active=I.code;
 const vis=!document.hidden;
 if(m.phase=='lobby'){clearSosUI();lobby();if(vis)mapUpdate()}
 else if(m.phase=='over'){clearSosUI();show('over');over();if(vis)mapUpdate()}
 else{show('game');game();if(vis)mapUpdate()}
}
function clearSosUI(){if(sosSeen){sosSeen='';siren(false);$('#sosov').hidden=true;$('#sospanel').hidden=true;panelOpen=true;clearSos()}}

/* ---------- lobby ---------- */
const OPT={hide:[[60,'1 min'],[120,'2 min'],[180,'3 min'],[300,'5 min'],[600,'10 min']],dur:[[1800,'30 min'],[2700,'45 min'],[3600,'1 oră'],[7200,'2 ore'],[0,'Nelimitat']]};
function lobby(){
 show('lobby');st_('#lcode',S.code);st_('#llive',S.live+' live');st_('#lcount','· '+S.players.length+' în cameră');
 const host=S.host==I.user,ps=JSON.stringify([S.players.map(p=>[p.u,p.n,p.gps,p.live]),S.host]),cs=JSON.stringify([S.cfg,host]);
 if(ps!=psig){psig=ps;
  $('#plist').innerHTML=S.players.map(p=>`<div class="pc"><div class="av ${p.live?'on':''}">${esc(p.n.trim()[0]||'?').toUpperCase()}</div><div><b>${esc(p.n)}</b><small>@${esc(p.u)}</small></div>${p.u==S.host?'<span class="tag">Admin</span>':''}<span class="gps ${p.gps?'on':''}"><i></i>GPS</span></div>`).join('')}
 if(cs!=csig){csig=cs;
  for(const k of['hide','dur']){const el=$('#c-'+k);
   if(!el.children.length)for(const[v,l]of OPT[k]){const b=document.createElement('button');b.textContent=l;b.dataset.v=v;b.onclick=()=>send({type:'settings',[k]:+v});el.append(b)}
   for(const b of el.children){b.className='chip'+(S.cfg[k]==b.dataset.v?' on':'');b.disabled=!host}}}
 const ok=S.players.length>=2&&S.players.every(p=>p.gps);
 $('#go').hidden=!host;$('#go').disabled=!ok;
 st_('#lnote',host?(S.players.length<2?'Ai nevoie de minim 2 jucători.':!ok?'Așteptăm locația tuturor jucătorilor.':'Rolurile se aleg aleatoriu la start.'):'Setările le alege gazda. Așteptăm startul.');
}
$('#go').onclick=()=>send({type:'start'});
$('#lcopy').onclick=()=>{const u=(API||location.origin)+'/?c='+S.code;(navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(()=>feed('Link copiat'),()=>prompt('Link',u))};

/* ---------- joc ---------- */
function game(){
 const sos=S.phase=='sos',role=M&&M.role,st=M&&M.st;
 $('#hrole').textContent=sos?'SOS':role=='seeker'?'Seeker':'Hider';$('#hrole').className=sos||role=='seeker'?'seeker':'';
 $('#hlive').textContent=S.live;$('#hh').textContent='Hideri '+S.nh;$('#hs').textContent='Seekeri '+S.ns;
 $('#bcam').hidden=sos||!(role=='hider'&&st=='alive');
 $('#caught').hidden=sos||!(M&&M.near&&st=='alive');
 const near=!sos&&!!(M&&M.near&&st=='alive');$('#alert').hidden=!near;
 if(near&&!alerted){alerted=true;vib([300,100,300,100,600]);beep()}if(!near)alerted=false;
 if(sos){sosView();return}
 const key=S.rid+':'+S.round;
 if(role&&LS.dn_rv!=key){LS.dn_rv=key;reveal(role);setTimeout(fitAll,400)}
}
setInterval(()=>{if(document.hidden||!S||!M||S.phase=='lobby'||S.phase=='over')return;const t=now(),h=M.role=='hider',bar=$('#pbar i');let pb=0;
 if(S.phase=='sos'&&S.sos){st_('#hlab','SOS activ de');st_('#hbig',fmt(t-S.sos.t));st_('#hsub',S.sos.u==I.user?'Ai cerut ajutor':S.sos.n+' are nevoie de ajutor');st_('#hplab','');st_('#hping','');sosPanel()}
 else if(S.phase=='hiding'){const r=S.hide_end-t;st_('#hlab',h?'Ascunde-te':'Ascundere');st_('#hbig',fmt(r));st_('#hsub',h?'Seekerii pornesc după cronometru':'Hiderii se ascund');st_('#hplab','');st_('#hping','');
  pb=Math.max(0,Math.min(100,(1-r/Math.max(1,S.cfg.hide))*100))}
 else{
  if(S.end_at){st_('#hlab','Până la final');st_('#hbig',fmt(S.end_at-t));st_('#hsub',h?'Rămâi ascuns până expiră timpul':'Găsește toți Hiderii înainte de final')}
  else{st_('#hlab','Joc nelimitat');st_('#hbig','∞');st_('#hsub',h?'Nu te lăsa prins':'Găsește toți Hiderii')}
  st_('#hplab',h?'Ești vizibil în':'Ping hideri');st_('#hping',fmt(S.ping_at-t));
  pb=Math.max(0,Math.min(100,(1-(S.ping_at-t)/180)*100))}
 const w=Math.round(pb)+'%';if(bar.style.width!==w)bar.style.width=w;
 const msg=[];
 if(S.phase!='sos'){
  if(M.st=='caught')msg.push('Ai fost prins. Urmărești jocul.');
  else if(h&&M.out)msg.push('Peste 1 km de Seeker. Revino în '+fmt(S.grace-(t-M.out)))}
 const wr=$('#warn');wr.hidden=!msg.length;st_('#warn',msg.join(' · '));
 for(const k in lay.p){const p=lay.p[k]._p;if(!p)continue;const tx=esc(p.n)+(p.pt?' · '+ago(t-p.pt):'');if(lay.p[k]._t!==tx){lay.p[k]._t=tx;lay.p[k].setTooltipContent(tx)}
  if(p.pt&&lay.ring[k])lay.ring[k].setRadius(Math.min(450,Math.max(20,(t-p.pt)*1.5)))}
},500);
function over(){
 const W={time:'Timpul s-a scurs — doar Hiderii câștigă când cronometrul expiră.',all_caught:'Toți Hiderii au fost prinși.',seekers_left:'Toți Seekerii au părăsit jocul.'};
 $('#owin').textContent=S.winner=='seekers'?'Seekerii au câștigat':'Hiderii au câștigat';$('#owhy').textContent=W[S.why]||'';
 $('#olist').innerHTML=S.players.map(p=>`<div class="sr ${p.st!='alive'?'dead':''}"><div class="av ${p.live?'on':''}">${esc(p.n.trim()[0]||'?').toUpperCase()}</div><div><b>${esc(p.n)}</b><small>${p.role=='seeker'?'Seeker':'Hider'} · ${p.left?'a ieșit':p.st=='alive'?'a rămas în joc':'prins'}</small></div></div>`).join('');
 const host=S.host==I.user;$('#oback').textContent=host?'Înapoi în cameră':'Așteptăm gazda…';$('#oback').disabled=!host;
}
$('#oback').onclick=()=>send({type:'reset'});
$('#bfit').onclick=fitAll;
$('#bloc').onclick=()=>pos&&map.setView([pos.lat,pos.lng],17);
$('#bplayers').onclick=()=>{$('#shlive').innerHTML='<i class="livedot"></i>'+S.live+' live';
 $('#slist').innerHTML=S.players.map(p=>`<div class="sr ${p.st!='alive'?'dead':''}"><div class="av ${p.live?'on':''}">${esc(p.n.trim()[0]||'?').toUpperCase()}</div><div><b>${esc(p.n)}</b><small>@${esc(p.u)}${S.phase=='sos'?'':' · '+(p.role=='seeker'?'Seeker':'Hider')}</small></div><span class="tag">${p.left?'Ieșit':p.live?'Live':'Offline'}</span></div>`).join('');$('#sstop').hidden=S.host!=I.user;$('#sheet').hidden=false};
$('#sstop').onclick=()=>cfm('Închizi jocul?','Jocul se oprește pentru toți și revii în cameră.','Închide jocul',()=>{send({type:'reset'});$('#sheet').hidden=true});
$('#hmenu').onclick=$('#hlivebtn').onclick=()=>$('#bplayers').click();
$('#sexit').onclick=$('#lexit').onclick=()=>cfm('Închizi aplicația?','Ieși din joc, iar notificările și GPS-ul din fundal se opresc.','Închide aplicația',exitApp);
if(NATIVE){$('#sexit').hidden=false;$('#lexit').hidden=false}
function exitApp(){noRe=true;send({type:'leave'});siren(false);delete LS.dn_active;LS.dn_code='';setTimeout(()=>{if(Game)Game.exitApp().catch(()=>{});else leave()},200)}
$('#sclose').onclick=()=>$('#sheet').hidden=true;$('#sheet').onclick=e=>{if(e.target.id=='sheet')e.target.hidden=true};

/* ---------- SOS: trimitere, alertă, panou ---------- */
function askSos(){if(!I||!S||S.phase=='over'||S.phase=='sos')return;$('#sosconf').hidden=false}
function sendSos(){if(!I)return;send({type:'sos'});
 fetch(API+`/api/room/${I.code}/sos`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user:I.user,tok:TOK})}).catch(()=>{})}
$('#bsos').onclick=()=>{if(S&&S.phase=='sos'){panelOpen=true;sosPanel()}else askSos()};
$('#lsos').onclick=askSos;
$('#sosno').onclick=()=>$('#sosconf').hidden=true;
const hb=$('#sosHold'),harc=$('#hArc');
function holdStart(e){e.preventDefault();if(hold)return;const t0=performance.now();vib(25);
 const f=t=>{const k=Math.min(1,(t-t0)/2000);harc.style.strokeDashoffset=339.3*(1-k);if(k>=1){hold=null;holdDone();return}hold=requestAnimationFrame(f)};hold=requestAnimationFrame(f)}
function holdEnd(){if(hold){cancelAnimationFrame(hold);hold=null}harc.style.strokeDashoffset=339.3}
function holdDone(){holdEnd();$('#sosconf').hidden=true;vib([200,100,400]);sendSos();feed('SOS trimis…')}
hb.addEventListener('pointerdown',holdStart);['pointerup','pointercancel','pointerleave'].forEach(ev=>hb.addEventListener(ev,holdEnd));hb.oncontextmenu=e=>e.preventDefault();
function siren(on){
 clearInterval(sirenT);sirenT=null;try{sirenO&&sirenO.stop()}catch(e){}sirenO=null;
 if(!on){vib(0);return}
 try{actx=actx||new AudioContext();actx.resume&&actx.resume();const o=actx.createOscillator(),g=actx.createGain();o.type='sawtooth';o.frequency.value=650;g.gain.value=.22;o.connect(g);g.connect(actx.destination);o.start();sirenO=o;
  let k=0;sirenT=setInterval(()=>{k++;try{o.frequency.setValueAtTime(k%2?650:950,actx.currentTime)}catch(e){}vib([400,150,400]);if(Date.now()>sirenStop)siren(false)},450)}catch(e){}}
function sosView(){
 const s=S.sos;if(!s)return;const key=s.u+':'+s.t,mine=s.u==I.user;
 if(sosSeen!=key){sosSeen=key;panelOpen=true;route=routeFrom=routeTo=null;routeAt=0;
  $('#sosconf').hidden=true;$('#sheet').hidden=true;$('#cam').hidden=true;stopCam();
  $('#sotitle').textContent=mine?'SOS trimis':'SOS de la '+s.n;
  $('#sotext').textContent=mine?'Jocul s-a oprit pentru toți. Rămâi pe loc — ceilalți vin spre tine.':'Jocul s-a oprit. Mergeți imediat la '+s.n+'! Locația tuturor este acum vizibilă pe hartă.';
  $('#sogo').textContent=mine?'Am înțeles':'Arată-mi drumul';
  $('#sosov').hidden=false;sirenStop=Date.now()+(mine?4000:14000);siren(true)}
 sosPanel()}
$('#sogo').onclick=()=>{$('#sosov').hidden=true;siren(false);panelOpen=true;sosPanel();fitAll()};
$('#spclose').onclick=()=>{panelOpen=false;$('#sospanel').hidden=true};
$('#spend').onclick=()=>cfm('Închizi SOS-ul?','Alerta se oprește și toți revin în cameră.','Închide SOS',()=>send({type:'reset'}));
function sosPanel(){
 const s=S&&S.phase=='sos'?S.sos:null,p=$('#sospanel');
 if(!s||!panelOpen||!$('#sosov').hidden){p.hidden=true;return}
 p.hidden=false;const mine=s.u==I.user;
 $('#spname').textContent=mine?'Tu ai cerut ajutor':s.n;
 $('#sptag').textContent=mine?'SOS TRIMIS · AȘTEPȚI AJUTOR':'SOS ACTIV · MERGI LA EL';
 $('#spend').hidden=!(mine||S.host==I.user);$('#spnav').hidden=mine||s.lat==null;
 if(mine){$('#spdist').textContent='Rămâi pe loc';$('#spdir').textContent='';$('#spmeta').textContent=S.live+' jucători live văd locația ta';$('#sparrow').style.transform='none';return}
 if(!pos||s.lat==null){$('#spdist').textContent='—';$('#spdir').textContent='';$('#spmeta').textContent=pos?'Locația lui '+s.n+' nu este disponibilă':'Aștept locația ta GPS…';return}
 const d=hav(pos.lat,pos.lng,s.lat,s.lng),b=brg(pos.lat,pos.lng,s.lat,s.lng);
 $('#sparrow').style.transform='rotate('+(heading==null?b:b-heading)+'deg)';
 $('#spdir').textContent=DIR[Math.round(b/45)%8];
 $('#spdist').textContent=dist(route?route.d:d);
 $('#spmeta').textContent=route?'~'+Math.max(1,Math.round(route.t/60))+' min pe jos · traseu pe străzi':'~'+Math.max(1,Math.round(d/1.25/60))+' min pe jos · linie dreaptă ('+dist(d)+')'}
$('#spnav').onclick=()=>{const s=S&&S.sos;if(s&&s.lat!=null)openUrl(`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}&travelmode=walking`)};

/* ---------- mesaje ---------- */
function feed(t){const f=document.createElement('div');f.className='fi';f.textContent=t;$('#feed').append(f);while($('#feed').children.length>3)$('#feed').firstChild.remove();setTimeout(()=>f.remove(),5000)}
function pop(t,s){popCb=null;$('#pno').hidden=true;$('#pok').textContent='OK';$('#pt').textContent=t;$('#ps').textContent=s||'';$('#pop').hidden=false}
function cfm(t,s,ok,cb){popCb=cb;$('#pno').hidden=false;$('#pok').textContent=ok;$('#pt').textContent=t;$('#ps').textContent=s||'';$('#pop').hidden=false}
$('#pok').onclick=()=>{$('#pop').hidden=true;const c=popCb;popCb=null;if(c)c()};
$('#pno').onclick=()=>{$('#pop').hidden=true;popCb=null};
function reveal(role){const r=$('#reveal');r.hidden=false;$('#rv1').hidden=false;$('#rv2').hidden=true;
 $('#rrole').textContent=role=='seeker'?'SEEKER':'HIDER';
 $('#rsub').textContent=role=='seeker'?'Găsește-i pe Hiders înainte să expire timpul.':'Ascunde-te și nu te lăsa prins până expiră timpul.';
 setTimeout(()=>{$('#rv1').hidden=true;$('#rv2').hidden=false;vib([120,60,250])},1900);
 setTimeout(()=>r.hidden=true,6200);r.onclick=()=>{if(!$('#rv2').hidden)r.hidden=true}}

/* ---------- cameră ---------- */
function stopCam(){if(camStream){camStream.getTracks().forEach(t=>t.stop());camStream=null}}
function camUI(prev){$('#cvid').hidden=prev;$('#cprev').hidden=!prev;$('#cshoot').hidden=prev;$('#cretake').hidden=$('#csend').hidden=!prev}
async function openCam(title,cb){camCb=cb;camBlob=null;$('#ctitle').textContent=title;
 try{camStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280}},audio:false});
  $('#cvid').srcObject=camStream;camUI(false);$('#cam').hidden=false}
 catch(e){$('#ffile').onchange=async ev=>{const f=ev.target.files[0];ev.target.value='';if(f)cb(await shrink(f))};$('#ffile').click()}}
function shrink(f,max=1280){return new Promise(r=>{const i=new Image();i.onload=()=>{const k=Math.min(1,max/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=i.width*k;c.height=i.height*k;c.getContext('2d').drawImage(i,0,0,c.width,c.height);c.toBlob(r,'image/jpeg',.82)};i.src=URL.createObjectURL(f)})}
$('#cshoot').onclick=()=>{const v=$('#cvid'),k=Math.min(1,1280/Math.max(v.videoWidth,v.videoHeight)),c=document.createElement('canvas');c.width=v.videoWidth*k;c.height=v.videoHeight*k;c.getContext('2d').drawImage(v,0,0,c.width,c.height);
 c.toBlob(b=>{camBlob=b;$('#cprev').src=URL.createObjectURL(b);camUI(true)},'image/jpeg',.85);vib(40)};
$('#cretake').onclick=()=>camUI(false);
$('#cx').onclick=()=>{stopCam();$('#cam').hidden=true};
$('#csend').onclick=()=>{const b=camBlob;stopCam();$('#cam').hidden=true;camCb(b)};
async function upload(kind,blob){
 if(!pos)return feed('Aștept locația GPS…');
 const fd=new FormData();fd.append('file',blob,'p.jpg');fd.append('user',I.user);fd.append('tok',TOK);fd.append('lat',pos.lat);fd.append('lng',pos.lng);
 try{const r=await fetch(API+`/api/room/${I.code}/${kind}`,{method:'POST',body:fd});
  if(!r.ok){let d='Trimiterea a eșuat';try{d=(await r.json()).detail||d}catch(e){}pop('Nu s-a putut trimite',d)}}
 catch(e){pop('Nu s-a putut trimite','Verifică conexiunea la internet și încearcă din nou.')}}
$('#bcam').onclick=()=>openCam('Indiciu foto',b=>upload('photo',b));
$('#caught').onclick=()=>openCam('Fă o poză unde ai fost prins',b=>upload('capture',b));

/* ---------- vizualizare + descărcare foto ---------- */
function openPhoto(ph){cur=ph;$('#mimg').src=API+ph.url;$('#mname').textContent=ph.n;
 $('#mcap').textContent=`${ph.lat.toFixed(5)}, ${ph.lng.toFixed(5)}${ph.t?' · '+new Date(ph.t*1000).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'}):''}`;$('#photo').hidden=false}
$('#mclose').onclick=()=>$('#photo').hidden=true;
$('#dl').onclick=()=>{const im=new Image();im.crossOrigin='anonymous';
 im.onload=()=>{const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);
  const s=Math.max(16,im.width/28),h=s*4.4,f='Inter, Helvetica, Arial, sans-serif';
  x.fillStyle='rgba(0,0,0,.75)';x.fillRect(0,im.height-h,im.width,h);x.fillStyle='#fff';x.textBaseline='top';
  x.font=`500 ${s*.8}px ${f}`;x.fillText(`Locație: ${cur.lat.toFixed(5)}, ${cur.lng.toFixed(5)}`,s,im.height-h+s*.5);
  x.font=`800 ${s*1.3}px ${f}`;x.fillText("DE-A ȘNURU'",s,im.height-h+s*1.6);
  x.font=`500 ${s*.85}px ${f}`;x.fillText(cur.n,s,im.height-h+s*3.3);
  const done=m=>{$('#dl').textContent=m;setTimeout(()=>$('#dl').textContent='Descarcă',2500)};
  if(NATIVE){Capacitor.registerPlugin('SaveImage').save({data:c.toDataURL('image/jpeg',.92).split(',')[1],name:'de-a-snuru-'+Date.now()+'.jpg'}).then(()=>done('Salvat în galerie'),()=>done('Nu s-a putut salva'));return}
  c.toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='de-a-snuru.jpg';a.click();done('Descărcat')},'image/jpeg',.92)};im.src=API+cur.url};

function showOffline(){$('#offline').hidden=false}
function hideOffline(){$('#offline').hidden=true}
addEventListener('offline',showOffline);
addEventListener('online',()=>{hideOffline();if(I&&(!ws||ws.readyState>1)){fails=0;connect()}});
$('#retry').onclick=()=>{if(!navigator.onLine)return;hideOffline();if(I){fails=0;connect()}};
function leave(){noRe=true;send({type:'leave'});siren(false);nativeStop();delete LS.dn_active;LS.dn_code='';setTimeout(()=>{try{ws.close()}catch(e){}location.reload()},150)}
$('#lleave').onclick=$('#oleave').onclick=leave;$('#chg').onclick=()=>go(0);$('#bleave').onclick=leave;$('#sleave').onclick=()=>cfm('Ieși din joc?','Vei părăsi runda și revii la ecranul de start.','Ieși',leave);
initMap();go(hasProfile()?2:0);if(!navigator.onLine)showOffline();
if(LS.dn_active&&LS.dn_name&&LS.dn_user){I={name:LS.dn_name.trim(),user:LS.dn_user,code:LS.dn_active};ld('Reconectare','Revin în camera '+I.code+'…');connect();gps();wake()}
checkPending();
