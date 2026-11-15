const fs=require('fs');
const cfg=JSON.parse(fs.readFileSync('apk.config.json','utf8'));
const url=(process.env.DN_SERVER_URL||cfg.serverUrl||'').trim().replace(/\/$/,'');
if(!/^https:\/\/.+/.test(url)||/USERNAME/i.test(url)){
  console.error('EROARE: seteaza adresa serverului (Space-ul Hugging Face) in apk.config.json sau in GitHub > Settings > Variables > DN_SERVER_URL');process.exit(1)}
fs.rmSync('www',{recursive:true,force:true});
fs.cpSync('app/static','www',{recursive:true});
fs.cpSync('node_modules/leaflet/dist','www/vendor/leaflet',{recursive:true});
fs.mkdirSync('www/vendor/fonts',{recursive:true});
const U={latin:'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
 'latin-ext':'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'};
let css='';
for(const w of[400,500,600,800])for(const sub of['latin','latin-ext']){
  const f=`inter-${sub}-${w}-normal.woff2`,p=`node_modules/@fontsource/inter/files/${f}`;
  if(!fs.existsSync(p))continue;fs.copyFileSync(p,`www/vendor/fonts/${f}`);
  css+=`@font-face{font-family:Inter;font-style:normal;font-weight:${w};font-display:swap;src:url(${f}) format('woff2');unicode-range:${U[sub]}}\n`}
fs.writeFileSync('www/vendor/fonts/fonts.css',css);
let h=fs.readFileSync('www/index.html','utf8');
h=h.replace(/<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/g,'')
   .replace('<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">','<link rel="stylesheet" href="vendor/fonts/fonts.css"><link rel="stylesheet" href="vendor/leaflet/leaflet.css">')
   .replace('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js','vendor/leaflet/leaflet.js');
if(h.includes('unpkg.com')||h.includes('fonts.googleapis'))throw new Error('index.html inca are resurse externe');
fs.writeFileSync('www/index.html',h);
fs.writeFileSync('www/config.js','window.DN_SERVER='+JSON.stringify(url)+';\nwindow.DN_WEB="https://victorrosca89.github.io/DE-A-SNURU-WEB/";\nwindow.DN_GITHUB="https://github.com/victorrosca89";\nwindow.DN_MAIL="victorrosca89@gmail.com";\n');
console.log('www gata, server:',url);
