(()=>{
"use strict";
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const LS={get:(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(e){return d;}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}};
// ---------- tiers ----------
const TIERS=[{n:"NO SIGNAL",p:0,e:"⬛",c:"t0"},
 {n:"SPACE DUST",p:10,e:"🌑",c:"t1",f:["half the crew said the same thing.","solid footing. everyone's footing.","a classic for a reason."]},
 {n:"TOO CLEVER",p:15,e:"💡",c:"t2",f:["you thought it was a deep cut. so did everyone else.","the secret everybody knows.","clever... a little too popular."]},
 {n:"METEOR",p:30,e:"☄️",c:"t3",f:["a decent streak across the sky.","off the beaten orbit.","not bad, cadet."]},
 {n:"COMET",p:60,e:"🌠",c:"t4",f:["only a few crews spotted that one.","now we're cruising.","rare air up here."]},
 {n:"SUPERNOVA",p:85,e:"💥",c:"t5",f:["that answer lit up the console.","mission control is impressed.","a brilliant flare."]},
 {n:"ONE IN A QUASAR",p:100,e:"🌌",c:"t6",f:["telescopes across the galaxy just turned your way.","nobody else got that far out.","off the edge of the map."]}];
const TCOL=()=>{const cs=getComputedStyle(document.body);return TIERS.map((_,i)=>cs.getPropertyValue("--t"+i).trim());};
const PREVIEW=3,TIME=25,ROUNDS=7,MAXP=700;
// ---------- journey (points -> km), real distances ----------
const STOPS=[[0,0,"Launch pad"],[10,100,"Kármán line"],[40,408,"ISS orbit"],[60,540,"Hubble orbit"],[90,1000,"Van Allen belt"],[130,20200,"GPS orbit"],[180,35786,"Geostationary"],[250,384400,"The Moon"],[330,7.8e7,"Mars"],[400,4e8,"Asteroid belt"],[460,6.3e8,"Jupiter"],[520,1.28e9,"Saturn"],[580,2.72e9,"Uranus"],[630,4.35e9,"Neptune"],[670,6e9,"Kuiper belt"],[700,1.8e10,"Heliopause"]];
function journey(pts){pts=Math.max(0,pts);let i=0;while(i<STOPS.length-1&&pts>=STOPS[i+1][0])i++;
 const a=STOPS[i],b=STOPS[Math.min(i+1,STOPS.length-1)];let km;
 if(i>=STOPS.length-1)km=a[1]*Math.pow(1.02,pts-a[0]);else{const f=(pts-a[0])/(b[0]-a[0]);km=a[1]<=0?b[1]*f:a[1]*Math.pow(b[1]/a[1],f);}
 return{km,past:a[2],next:i<STOPS.length-1?b[2]:null};}
function fmtKm(k){k=Math.round(k);if(k<1e9)return k.toLocaleString("en-US")+" KM";return (k/1e9).toFixed(2)+" BILLION KM";}
// ---------- matching ----------
const norm=s=>s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/&/g," and ").replace(/^(the|a|an) /,"").replace(/[^a-z0-9]+/g,"").replace(/(es|s)$/,"");
// Six bank groups are tiers 1..6. Fewer groups fall back to LV (no separate Too Clever slot).
// TOO_CLEVER forces tier 2, the trap. It is not filled to make tier sizes monotonic.
const LV=[1,3,4,5,6];
const PROMPTS=BANK.map(([q,a],pi)=>{const g=a.split(" / "),n=g.length,m=new Map(),byTier={};
 const tc=new Set((window.TOO_CLEVER&&TOO_CLEVER[pi]||[]).map(norm));
 g.forEach((grp,i)=>{const base=n===6?i+1:n===1?1:LV[Math.round(i*4/(n-1))];grp.split(",").forEach(ans=>{const al=ans.split("|").map(x=>x.trim()).filter(Boolean);if(!al.length)return;
  const tier=tc.has(norm(al[0]))?2:base;let added=false;al.forEach(x=>{const k=norm(x);if(k&&!m.has(k)){m.set(k,{tier,label:al[0]});added=true;}});
  if(added)(byTier[tier]=byTier[tier]||[]).push(al[0]);});});
 return{q,m,byTier};});
function lev(a,b){if(Math.abs(a.length-b.length)>1)return 9;const d=[...Array(b.length+1).keys()];for(let i=1;i<=a.length;i++){let p=d[0];d[0]=i;for(let j=1;j<=b.length;j++){const t=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,p+(a[i-1]===b[j-1]?0:1));p=t;}}return d[b.length];}
function dlev(a,b){const la=a.length,lb=b.length,md=Math.max(la,lb)<=5?1:Math.max(la,lb)<=9?2:3;if(Math.abs(la-lb)>md)return 99;
 const INF=la+lb,H=Array.from({length:la+2},()=>Array(lb+2).fill(0)),da={};H[0][0]=INF;
 for(let i=0;i<=la;i++){H[i+1][1]=i;H[i+1][0]=INF;}for(let j=0;j<=lb;j++){H[1][j+1]=j;H[0][j+1]=INF;}
 for(let i=1;i<=la;i++){let db=0;for(let j=1;j<=lb;j++){const i1=da[b[j-1]]||0,j1=db,cost=a[i-1]===b[j-1]?0:(db=j,1);
  H[i+1][j+1]=Math.min(H[i][j]+cost,H[i+1][j]+1,H[i][j+1]+1,H[i1][j1]+(i-i1-1)+1+(j-j1-1));}
  da[a[i-1]]=i;}return H[la+1][lb+1];}
function maxEdits(len){if(len<=3)return 0;if(len<=5)return 1;if(len<=9)return 2;return 3;}
function exact(P,v){return P.m.get(norm(v))||null;}
function suggest(P,input){const k=norm(input);if(k.length<3)return[];if(P.m.has(k))return[];
 const best=new Map(),kh=[];for(let c=0;c<k.length;c++){const x=k.charCodeAt(c);kh[x]=(kh[x]||0)+1;}
 for(const [key,v] of P.m){let score=null;
  if(key.startsWith(k))score=0+(key.length-k.length)/100;
  else if(k.startsWith(key)&&key.length>=4)score=.5+(k.length-key.length)/100;
  else{const allow=maxEdits(Math.max(k.length,key.length));if(allow<=0||Math.abs(key.length-k.length)>allow)continue;let bd=0;const h=kh.slice();for(let c=0;c<key.length;c++){const x=key.charCodeAt(c);h[x]=(h[x]||0)-1;}for(const x in h)bd+=Math.abs(h[x]);if(bd>2*allow)continue;const d=dlev(k,key);if(d>allow)continue;score=10+d+Math.abs(key.length-k.length)/50;}
  const prev=best.get(v.label);if(!prev||score<prev.score)best.set(v.label,{score,label:v.label,tier:v.tier});}
 const r=[...best.values()].sort((a,b)=>a.score-b.score||a.label.length-b.label.length);
 if(!r.length)return[];const out=[r[0]];if(r[1]&&r[1].score-r[0].score<=1.05)out.push(r[1]);return out;}
// correction candidate: fuzzy (typo) or partial expansion
function correction(P,v){const k=norm(v);if(!k||P.m.has(k))return null;const s=suggest(P,v);if(s.length){if(s[0].score<1&&k.length<4)return null;return s[0];}
 if(k.length>=6)for(const [key,val] of P.m)if(key.length>=5&&lev(k,key)<=1)return val;return null;}
// ---------- dates (US Eastern reset) ----------
const ET=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
function etParts(){const o={};ET.formatToParts(new Date()).forEach(p=>o[p.type]=p.value);return o;}
const EPOCH=Date.UTC(2026,10,5);
function todayNum(){const o=etParts();return Math.round((Date.UTC(+o.year,+o.month-1,+o.day)-EPOCH)/864e5)+1;}
function dateOf(n){const d=new Date(EPOCH+(n-1)*864e5);return d.toISOString().slice(0,10);}
function cdText(){const o=etParts();let s=86400-(+o.hour*3600+ +o.minute*60+ +o.second);const p=x=>String(x).padStart(2,"0");return `${p(s/3600|0)}:${p(s%3600/60|0)}:${p(s%60)}`;}
function rng(seed){let h=1779033703^seed.length;for(let i=0;i<seed.length;i++){h=Math.imul(h^seed.charCodeAt(i),3432918353);h=h<<13|h>>>19;}return()=>{h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return((h^=h>>>16)>>>0)/4294967296;};}
function shuffled(r){const idx=PROMPTS.map((_,i)=>i);for(let i=idx.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[idx[i],idx[j]]=[idx[j],idx[i]];}return idx;}
const dailyOrder=n=>shuffled(rng("starward-"+dateOf(n))).slice(0,ROUNDS);
function endlessOrder(n){const per=Math.floor(PROMPTS.length/ROUNDS),cyc=Math.floor((n-1)/per),k=(n-1)%per;return shuffled(rng("starward-endless-"+cyc)).slice(k*ROUNDS,k*ROUNDS+ROUNDS);}
// ---------- settings ----------
const SET=Object.assign({lp:false,cb:false,fix:true,clr:false,link:false,sound:false},LS.get("sw_set",{}));
function applySet(){document.body.classList.toggle("lp",SET.lp);document.body.classList.toggle("cb",SET.cb);$("btnSound").classList.toggle("on",SET.sound);$("btnSound").textContent=SET.sound?"♪":"♪̸";LS.set("sw_set",SET);}
const RM=matchMedia("(prefers-reduced-motion: reduce)");const calm=()=>SET.lp||RM.matches;
let ac;function beep(f,d=.1,type="square",v=.04){if(!SET.sound)return;try{ac=ac||new (window.AudioContext||window.webkitAudioContext)();const o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.value=f;g.gain.value=v;g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+d);o.connect(g).connect(ac.destination);o.start();o.stop(ac.currentTime+d);}catch(e){}}
const buzz=p=>{try{navigator.vibrate&&navigator.vibrate(p)}catch(e){}};
function toast(t){const e=$("toast");e.textContent=t;e.classList.add("on");clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove("on"),1600);}
// ---------- sprites ----------
const PAL={".":null,W:"#eef3ff",G:"#9aa6c4",V:"#2bd0ff",D:"#bff4ff",J:"#5a6787",C:"#3fe0ff",R:"#ff4f9a",F:"#ffb43f",K:"#141a2e",B:"#b07040",N:"#2a1a10",A:"#7ee06a",Y:"#ffd84a",T:"#c24b3a"};
const ASTRO=["....GWWWWWWG....","...WWWWWWWWWW...","..WWVVVVVVVVWW..","..WVDDVVVVVVVW..","..WVDVVVVVVVVW..","..WWVVVVVVVVWW..","...WWWWWWWWWW...",".JWWWWCCRRWWWWJ.","JJWGWWWWWWWWGWJJ","JJWGWWWWWWWWGWJJ","JJ.GWWWWWWWWG.JJ","JJ..WWWGGWWW..JJ",".F..WWW..WWW..F.",".F..WWW..WWW....","....GGG..GGG....","................"];
const swap=(g,map)=>g.map(r=>r.replace(/./g,c=>map[c]||c));
const BUDDIES=[
 {id:"cadet",n:"CADET",need:0,d:"Standard-issue suit. Smells like new velcro.",g:ASTRO},
 {id:"cosmo",n:"COSMONAUT",need:5,d:"Gold visor, red trim. Earned with a 5-day streak.",g:swap(ASTRO,{V:"Y",D:"W",C:"R"}).map((r,i)=>i===0?"....RWWWWWWR....":r)},
 {id:"rover",n:"ROVER",need:14,d:"Six wheels, zero complaints. 14-day streak.",g:["................","................","......CC........","......GG........","....GGGGGG......","...KGGGGGGK.....","..WWWWWWWWWWWW..","..WCCWWWWWWRRW..","..WWWWWWWWWWWW..","..GGGGGGGGGGGG..",".JGGGGGGGGGGGGJ.",".KK..KK..KK..KK.",".KK..KK..KK..KK.","................","................","................"]},
 {id:"alien",n:"VISITOR",need:30,d:"Not from around here. 30-day streak.",g:swap(ASTRO,{W:"A",G:"T",V:"K",D:"Y"}).map((r,i)=>i===0?"...Y........Y...":r)},
 {id:"dog",n:"SPACE PUP",need:45,d:"A very good astronaut. 45-day streak.",g:ASTRO.map((r,i)=>[,,"..WWBBBBBBBBWW..","..WBKBBBBKBBBW..","..WBBBNNBBBBBW..","..WWBBTTBBBBWW.."][i]||r)}];
function drawSprite(cv,g,flame){const x=cv.getContext("2d");x.clearRect(0,0,16,16);g.forEach((r,y)=>{for(let i=0;i<16;i++){let c=r[i]||".";if(c==="F"&&!flame)continue;const col=PAL[c];if(col){x.fillStyle=col;x.fillRect(i,y,1,1);}}});}
const ICONS=["............","....KKKK....","..KK....KK..","..K......K..","..K......K..","....KKKK....","............","............","............","............","............","............"];
const TICON={1:["............","..W.....G...","......W.....","...G.......W","........G...",".W....W.....","...........G","...W..G.....","........W...",".G..........","......W..G..","............"],
 2:["....YYYY....","...YYYYYY...","..YYWWYYYY..","..YWWYYYYY..","..YYYYYYYY..","...YYYYYY...","....YYYY....","....GGGG....","....GGGG....",".....GG.....","............","............"],
 3:["..........F.",".........FF.","........FY..","......FFY...",".....FYY....","...TTYY.....","..TTTT......",".TTTT.......",".TTT........","..T.........","............","............"],
 4:["WC..........",".WCC........","..WCCC......","...WWCCC....","....WWCC....",".....WDD....",".....DDWD...","......DWW...","............","............","............","............"],
 5:[".....Y......","..Y..Y..Y...","...Y.Y.Y....","....YWY.....","YYYYWWWYYYY.","....YWY.....","...Y.Y.Y....","..Y..Y..Y...",".....Y......","............","............","............"],
 6:[".....R......","....RRR.....","..CCCWCCC...",".CWWWWWWWC..","..CCCWCCC...","....RRR.....",".....R......",".....R......",".....R......",".....R......","............","............"],
 0:["............","..KK....KK..","...KK..KK...","....KKKK....",".....KK.....","....KKKK....","...KK..KK...","..KK....KK..","............","............","............","............"]};
function drawIcon(cv,t){cv.width=cv.height=12;const x=cv.getContext("2d");x.clearRect(0,0,12,12);const g=TICON[t];const map={...PAL,K:"#59627e"};g.forEach((r,y)=>{for(let i=0;i<12;i++){const col=map[r[i]];if(col&&r[i]!=="."){x.fillStyle=col;x.fillRect(i,y,1,1);}}});}
// ---------- profile / storage ----------
const dailyKey=n=>"sw_m_"+n;
function streakInfo(){const t=todayNum();let s=0,n=LS.get(dailyKey(t),null)&&LS.get(dailyKey(t)).live?t:t-1;while(n>=1){const d=LS.get(dailyKey(n),null);if(d&&d.live){s++;n--;}else break;}
 let played=0,sum=0,best=0;for(let i=1;i<=t;i++){const d=LS.get(dailyKey(i),null);if(d){played++;sum+=d.score;best=Math.max(best,d.score);}}
 const maxS=Math.max(s,LS.get("sw_maxstreak",0));LS.set("sw_maxstreak",maxS);return{streak:s,played,avg:played?Math.round(sum/played):0,best,maxS};}
let buddy=LS.get("sw_buddy","cadet");const curBuddy=()=>BUDDIES.find(b=>b.id===buddy)||BUDDIES[0];
// ---------- astronaut ----------
let flame=0;setInterval(()=>{if(calm()&&flame)return;flame^=1;drawSprite($("astroC"),curBuddy().g,flame);},180);
drawSprite($("wardIcon"),ASTRO,false);
const LINES=["houston!","zero-g!","o2 nominal","wheee","still climbing","beep beep","hi, earth!","is that a comet?"];
$("astro").onclick=()=>{const b=$("bubble");b.textContent=LINES[Math.random()*LINES.length|0];b.classList.add("on");beep(880,.06);clearTimeout(b._t);b._t=setTimeout(()=>b.classList.remove("on"),1300);};
// ---------- ruler ----------
const MK=[[10,"Kármán line · 100 km"],[40,"ISS · ~400 km"],[180,"Geostationary · 35,786 km"],[250,"The Moon · 384,400 km"],[330,"Mars"],[400,"Asteroid belt"],[460,"Jupiter"],[520,"Saturn"],[630,"Neptune"],[670,"Kuiper belt"],[700,"Heliopause"]];
$("marks").innerHTML=MK.map(([p,n])=>`<div class="mk" data-p="${p}" style="bottom:${p/7}%"><span>${n.toUpperCase()}</span></div>`).join("");
// ---------- view state ----------
let G=null,timer=null,alt=0,shownScore=0;
function screen(id){document.body.dataset.screen=id;document.querySelectorAll(".screen").forEach(s=>s.classList.toggle("on",s.id===id));if(id==="home"){alt=0;refreshHome();}}
function setAlt(a){alt=a;$("hAlt").textContent=fmtKm(journey(a).km);$("you").style.bottom=Math.min(100,a/7)+"%";document.querySelectorAll("#marks .mk").forEach(m=>m.classList.toggle("past",a>=+m.dataset.p));}
function hud(){const s=G;let h="";for(let k=0;k<s.order.length&&k<ROUNDS;k++){const l=s.log[k];h+=`<i class="${l?(l.tier?"ok":"miss"):(k===s.i?"now":"")}"></i>`;}
 if(s.mode==="survival")h=`<span class="pk" style="font-family:Silk;font-size:13px">${"♥".repeat(Math.max(0,s.lives))}${"♡".repeat(3-Math.max(0,s.lives))}</span>`;
 $("pips").innerHTML=h;$("hScore").textContent=shownScore;
 $("hRound").textContent=s.over?"MISSION COMPLETE":s.mode==="survival"?`SURVIVAL · PROMPT ${s.i+1}`:`PROMPT ${Math.min(s.i+1,ROUNDS)} OF ${ROUNDS}`;}
// ---------- game ----------
function start(mode,n){closeAll();
 let order;if(mode==="daily")order=dailyOrder(n);else if(mode==="endless")order=endlessOrder(n);else order=shuffled(Math.random);
 G={mode,n,order,i:0,score:0,lives:3,log:[]};shownScore=0;setAlt(0);screen("play");beep(330);nextRound();}
function nextRound(){
 if(G.mode!=="survival"&&G.i>=ROUNDS)return finish();
 if(G.mode==="survival"&&(G.lives<=0||G.i>=G.order.length))return finish();
 const P=PROMPTS[G.order[G.i]];G.P=P;G.phase="preview";G.pend=null;document.body.classList.remove("locked");
 $("cRound").textContent=G.mode==="survival"?`SURVIVAL · PROMPT ${G.i+1}`:G.mode==="endless"?`ENDLESS #${G.n} · PROMPT ${G.i+1} OF 7`:`PROMPT ${G.i+1} OF 7`;
 $("cQ").textContent=P.q;$("cHint").textContent="one answer · the rarer the better";
 $("ladder").hidden=true;$("reveal").hidden=true;$("fix").hidden=true;$("msg").textContent="";clearSug();
 $("ans").value="";$("ans").disabled=true;$("send").disabled=true;$("tbar").style.transform="scaleX(1)";$("tbar").parentNode.classList.remove("low");ring(1);$("clock").classList.remove("low");
 hud();let pv=PREVIEW;$("clockNum").textContent=pv;$("status").textContent="CLOCK STARTS IN "+pv;beep(440,.05);
 clearInterval(timer);timer=setInterval(()=>{pv--;if(pv>0){$("clockNum").textContent=pv;$("status").textContent="CLOCK STARTS IN "+pv;beep(440,.05);}else{clearInterval(timer);live();}},1000);}
function ring(f){$("ringFg").style.strokeDashoffset=175.9*(1-f);}
function live(){G.phase="live";beep(880,.12);$("status").textContent="GO! ONE ANSWER";$("ans").disabled=false;$("ans").focus();updSend();
 const end=Date.now()+TIME*1000;G.end=end;
 timer=setInterval(()=>{const left=Math.max(0,G.end-Date.now()),f=left/TIME/1000;$("tbar").style.transform=`scaleX(${f})`;ring(f);const low=left<6000;$("tbar").parentNode.classList.toggle("low",low);$("clock").classList.toggle("low",low);
  $("clockNum").textContent=Math.ceil(left/1000);if(left<=0){clearInterval(timer);timeUp();}},100);}
function updSend(){$("send").disabled=G.phase!=="live"||!$("ans").value.trim();}
function clearSug(){if(G)G.sugs=null;$("suggest").hidden=true;$("suggest").innerHTML="";}
function renderSug(){if(!G||G.phase!=="live"||G.pend){clearSug();return;}const list=suggest(G.P,$("ans").value);if(!list.length){clearSug();return;}
 G.sugs=list;const b=$("suggest");b.hidden=false;b.innerHTML=list.map((s,i)=>`<button type="button" class="schip" data-i="${i}"><em>${i?"OR":"DID YOU MEAN"}</em>${esc(s.label)}</button>`).join("");
 b.querySelectorAll(".schip").forEach(btn=>btn.addEventListener("pointerdown",e=>{e.preventDefault();takeSug(+btn.dataset.i);}));}
function takeSug(i){if(!G||!G.sugs||!G.sugs[i])return;$("ans").value=G.sugs[i].label;clearSug();clearPend();updSend();$("ans").focus();beep(660,.05);}
function clearPend(){G.pend=null;$("fix").hidden=true;}
$("ans").addEventListener("input",()=>{if(G&&G.pend&&$("ans").value!==G.pend.label)clearPend();updSend();renderSug();});
$("ans").addEventListener("keydown",e=>{if(e.key==="Tab"&&G&&G.sugs&&G.sugs.length){e.preventDefault();takeSug(0);}else if(e.key==="ArrowDown"&&G&&G.sugs&&G.sugs[1]){e.preventDefault();takeSug(1);}});
$("form").onsubmit=e=>{e.preventDefault();if(!G||G.phase!=="live")return;const v=$("ans").value.trim();if(!v)return;
 const m=exact(G.P,v);if(m)return lockIn(m,v);
 const c=correction(G.P,v);
 if(c){if(!SET.fix)return lockIn(c,v);G.pend={from:v,label:c.label,m:c};clearSug();$("ans").value=c.label;$("fix").hidden=false;
  $("fix").innerHTML=`“${esc(v)}” → corrects to “<b>${esc(c.label)}</b>” · submit again to confirm · or edit`;$("msg").textContent="";beep(520,.06);updSend();return;}
 clearSug();const ms=$("msg");ms.classList.remove("shake");void ms.offsetWidth;ms.classList.add("shake");ms.textContent=`“${v}”: no signal. try again`;
 if(SET.clr){$("ans").value="";updSend();}$("ans").focus();buzz(40);beep(160,.12);};
function timeUp(){if(G.phase!=="live")return;if(G.pend)return lockIn(G.pend.m,G.pend.from);
 const v=$("ans").value.trim();resolve(null,v);}
function lockIn(m,typed){resolve(m,typed);}
function resolve(m,typed){G.phase="lock";clearInterval(timer);clearSug();$("ans").disabled=true;$("send").disabled=true;$("ans").blur();$("fix").hidden=true;
 const tier=m?m.tier:0,T=TIERS[tier];G.log.push({q:G.P.q,a:m?m.label:null,typed:typed||"",tier,p:T.p,pi:G.order[G.i]});
 if(!m&&G.mode==="survival")G.lives--;
 $("clockNum").textContent=m?"...":"0";$("status").textContent=m?"CHECKING THE CHARTS...":"TIME!";if(!m){buzz([60,40,60]);beep(120,.35,"sawtooth");}
 setTimeout(()=>{document.body.classList.add("locked");showLadder(tier,m?m.label:typed);
  const from=G.score,to=from+T.p;G.score=to;const dur=calm()?400:(T.p?3400:300),t0=performance.now();
  if(T.p)[523,659,784,1046].slice(0,1+Math.ceil(tier/2)).forEach((f,i)=>setTimeout(()=>beep(f,.1,"triangle"),i*110));
  (function step(now){const k=Math.min(1,(now-t0)/dur),e=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;setAlt(from+(to-from)*e);if(k<1)requestAnimationFrame(step);else{showReveal(tier,m,typed,from);}})(t0);
 },m?1000:600);}
function showLadder(tier,text){$("ladder").hidden=false;$("ladder").innerHTML=[6,5,4,3,2,1].map(t=>`<div class="lr ${t===tier?"hit":""}"><canvas data-t="${t}"></canvas><span class="ln" style="color:var(--t${t})">${TIERS[t].n}${t===tier?`<span class="lq">“${esc(text)}”</span>`:""}</span><span class="lp">${TIERS[t].p}</span></div>`).join("");
 $("ladder").querySelectorAll("canvas").forEach(c=>drawIcon(c,+c.dataset.t));}
function showReveal(tier,m,typed,from){const T=TIERS[tier];drawIcon($("rIcon"),tier);$("reveal").hidden=false;
 $("rTier").textContent=m?T.n:"NOTHING LANDED";$("rTier").style.color=`var(--t${tier})`;
 $("rAns").textContent=m?`“${m.label}”`:typed?`“${typed}”`:"";
 const climb=journey(from+T.p).km-journey(from).km;
 $("rPts").textContent=m?`+${T.p} PTS · CLIMB ${fmtKm(climb)}`:"+0 PTS";
 $("rFlav").textContent=m?T.f[(G.i+tier)%3]:typed?"that one never made it onto the star charts.":"the countdown hit zero first.";
 const last=G.mode==="survival"?(G.lives<=0||G.i+1>=G.order.length):G.i+1>=ROUNDS;
 $("btnNext").textContent=last?"FINISH ▲":"ASCEND ▲";
 const s0=shownScore,s1=G.score,t0=performance.now();(function tick(now){const k=Math.min(1,(now-t0)/600);shownScore=Math.round(s0+(s1-s0)*k);$("hScore").textContent=shownScore;if(k<1)requestAnimationFrame(tick);})(t0);
 if(last){G.over=true;}hud();$("btnNext").focus({preventScroll:true});$("reveal").scrollIntoView({block:"nearest",behavior:calm()?"auto":"smooth"});}
$("btnNext").onclick=()=>{if(!G)return;shownScore=G.score;if(G.over)return finish();G.i++;nextRound();};
addEventListener("keydown",e=>{if(e.key==="Enter"&&G&&document.body.dataset.screen==="play"&&!$("reveal").hidden&&document.activeElement!==$("btnNext")&&!$("modal").classList.contains("on")){e.preventDefault();$("btnNext").click();}
 if(e.key==="Escape"){closeAll();}});
// ---------- finish & results ----------
function finish(){clearInterval(timer);G.over=true;G.phase="done";hud();
 if(G.mode==="daily"){const k=dailyKey(G.n),prev=LS.get(k,null),liveDay=G.n===todayNum();
  if(!prev||G.score>prev.score)LS.set(k,{score:G.score,log:G.log,live:prev?prev.live||liveDay:liveDay,rate:prev&&prev.rate});}
 else if(G.mode==="endless"){const lg=LS.get("sw_endless",{});if(!lg[G.n]||G.score>lg[G.n])lg[G.n]=G.score;LS.set("sw_endless",lg);}
 else{const b=LS.get("sw_best_surv",0);if(G.score>b)LS.set("sw_best_surv",G.score);}
 setTimeout(()=>{renderResults();openSheet();},calm()?0:500);}
function openSheet(){$("results").classList.add("on");$("results").setAttribute("aria-hidden","false");$("results").scrollTop=0;}
function closeSheet(){$("results").classList.remove("on");$("results").setAttribute("aria-hidden","true");}
// modelled distribution (no real player base -> estimate)
const MODEL=[.04,.42,.07,.22,.14,.08,.03];
const SIM=(()=>{const r=rng("starward-model"),out=new Uint16Array(20000);for(let s=0;s<out.length;s++){let t=0;for(let k=0;k<7;k++){let u=r(),i=0;while(i<6&&u>MODEL[i]){u-=MODEL[i];i++;}t+=TIERS[i].p;}out[s]=t;}return out;})();
const pctile=sc=>{let b=0;for(const v of SIM)if(v<sc)b++;return b/SIM.length;};
const BANDS=[[0,150,"GROUNDED"],[151,250,"LOW ORBIT"],[251,350,"LUNAR"],[351,449,"DEEP SPACE"],[450,700,"STARWARD"]];
function renderResults(){const s=G.score,j=journey(s);
 $("resTitle").textContent=G.mode==="daily"?`MISSION #${G.n} COMPLETE`+(G.n!==todayNum()?" · ARCHIVE":""):G.mode==="endless"?`ENDLESS MISSION #${G.n} COMPLETE`:`SURVIVAL RUN OVER · ${G.log.length} PROMPTS`;
 $("resScore").textContent=s;$("resAlt").textContent=fmtKm(j.km);$("resAlt").style.fontSize=j.km>1e9?"20px":"";
 $("resWhere").textContent=`REACHED: ${j.past.toUpperCase()}`+(j.next?` · NEXT: ${j.next.toUpperCase()}`:"");
 // bell curve
 const bins=new Array(29).fill(0);for(const v of SIM)bins[Math.min(28,v/25|0)]++;const mx=Math.max(...bins);
 const X=v=>10+v/700*280,Y=c=>92-c/mx*76;let d=`M${X(0)},92 `+bins.map((c,i)=>`L${X(i*25+12.5).toFixed(1)},${Y(c).toFixed(1)}`).join(" ")+` L${X(700)},92 Z`;
 const p=pctile(s),top=Math.max(1,Math.round((1-p)*100));
 $("dist").innerHTML=`<path d="${d}" fill="rgba(63,224,255,.18)" stroke="#3fe0ff" stroke-width="1.5"/><line x1="10" y1="92" x2="290" y2="92" stroke="#1c2752"/>`+
  [0,175,350,525,700].map(v=>`<text x="${X(v)}" y="105" font-size="7" fill="#7d8bb5" text-anchor="middle">${v}</text>`).join("")+
  `<line x1="${X(Math.min(s,700))}" y1="10" x2="${X(Math.min(s,700))}" y2="92" stroke="#ff4f9a" stroke-width="2"/><text x="${X(Math.min(s,700))}" y="8" font-size="8" fill="#ff4f9a" text-anchor="middle">YOU</text>`;
 $("pct").innerHTML=G.mode==="survival"?"SURVIVAL RUNS AREN'T COMPARED ON THIS CHART.":`HIGHER THAN ~${Math.round(p*100)}% OF MODELLED CREWS · TOP ${top}% <span class="dim">(est., no live player data)</span>`;
 // log chart
 let cum=0;const pts=[[0,0]].concat(G.log.map((l,i)=>[i+1,cum+=l.p]));const n=Math.max(7,G.log.length),mxs=Math.max(100,cum);
 const LX=i=>16+i/n*270,LY=v=>96-v/mxs*84;
 $("logc").innerHTML=`<line x1="16" y1="96" x2="290" y2="96" stroke="#1c2752"/><polyline fill="none" stroke="#3fe0ff" stroke-width="2" points="${pts.map(([i,v])=>LX(i)+","+LY(v)).join(" ")}"/>`+
  G.log.map((l,i)=>`<rect x="${LX(i+1)-3}" y="${LY(pts[i+1][1])-3}" width="6" height="6" fill="var(--t${l.tier})"/><text x="${LX(i+1)}" y="107" font-size="7" fill="#7d8bb5" text-anchor="middle">${i+1}</text>`).join("")+
  `<text x="16" y="10" font-size="7" fill="#7d8bb5">${mxs} PTS</text>`;
 $("bands").innerHTML=BANDS.map(([a,b,nm])=>`<div class="band ${s>=a&&s<=b?"on":""}"><b>${nm}</b>${a}${b>=700?"+":"–"+b}</div>`).join("");
 $("rows").innerHTML=G.log.map((l,i)=>{const P=PROMPTS[l.pi];const ex=[6,5,4,3,2,1].filter(t=>P.byTier[t]).map(t=>`<div><span class="tn" style="color:var(--t${t})">${TIERS[t].n}</span>${P.byTier[t].slice(0,5).map(esc).join(", ")}${P.byTier[t].length>5?` <span class="dim">+${P.byTier[t].length-5} more</span>`:""}</div>`).join("");
  return `<div class="rrow"><button type="button" aria-expanded="false"><span><span class="rq">${i+1}. ${esc(l.q)}</span><span class="ra">${l.a?esc(l.a):l.typed?`<s class="dim">${esc(l.typed)}</s>`:"—"}</span></span><span class="tag2" style="background:var(--t${l.tier})">${l.tier?TIERS[l.tier].n+" +"+l.p:"MISS 0"}</span></button><div class="exp">${ex}</div></div>`;}).join("");
 $("rows").querySelectorAll(".rrow>button").forEach(b=>b.onclick=()=>{const o=b.parentNode.classList.toggle("open");b.setAttribute("aria-expanded",o);});
 const rk=G.mode==="daily"?dailyKey(G.n):null,rec=rk?LS.get(rk,{}):{};
 $("stars").innerHTML=[1,2,3,4,5].map(v=>`<button data-v="${v}" class="${rec.rate>=v?"on":""}" aria-label="${v} stars">★</button>`).join("");
 $("stars").parentNode.style.display=rk?"":"none";
 $("stars").querySelectorAll("button").forEach(b=>b.onclick=()=>{const r=LS.get(rk,{});r.rate=+b.dataset.v;LS.set(rk,r);$("stars").querySelectorAll("button").forEach(x=>x.classList.toggle("on",+x.dataset.v<=r.rate));toast("THANKS, CADET");});
 $("btnCopy").textContent="COPY RESULT";renderLogbook();}
function renderLogbook(){const st=streakInfo();$("logbook").innerHTML=[["STREAK",st.streak],["PLAYED",st.played],["AVG",st.avg],["BEST",st.best]].map(([a,b])=>`<div><b>${b}</b><small>${a}</small></div>`).join("");}
function shareText(){const head=G.mode==="daily"?`Starward #${G.n} 🚀 ${G.score}`:G.mode==="endless"?`Starward Endless #${G.n} 🚀 ${G.score}`:`Starward Survival 🚀 ${G.score}`;
 return head+"\n"+G.log.map(l=>TIERS[l.tier].e).join("")+(SET.link?"\n"+location.origin+location.pathname:"");}
$("btnCopy").onclick=async()=>{const t=shareText();let ok=false;try{await navigator.clipboard.writeText(t);ok=true;}catch(e){const ta=document.createElement("textarea");ta.value=t;document.body.appendChild(ta);ta.select();try{ok=document.execCommand("copy");}catch(_){}ta.remove();}
 $("btnCopy").textContent=ok?"COPIED ✓":"COPY FAILED";if(!ok)toast(t);};
$("rEndless").onclick=()=>start("endless",nextEndless());$("rArchive").onclick=()=>openArchive();$("rSettings").onclick=()=>openSettings();$("rHome").onclick=goHome;
const nextEndless=()=>{const lg=LS.get("sw_endless",{});let n=1;while(lg[n]!=null)n++;return n;};
function goHome(){clearInterval(timer);closeAll();G=null;document.body.classList.remove("locked");screen("home");}
// ---------- home ----------
function refreshHome(){const n=todayNum(),d=LS.get(dailyKey(n),null);
 $("btnBegin").textContent=d?"▲ VIEW TODAY'S MISSION ▲":"▲ BEGIN ASCENT ▲";
 $("homeMission").textContent=`MISSION #${n}`;$("homeDone").classList.toggle("hide",!d);if(d)$("homeDone").textContent=`TODAY: ${d.score} PTS · ${fmtKm(journey(d.score).km)}`;
 $("homeCd").textContent="NEXT MISSION IN "+cdText();}
function viewDaily(n){$("drawer").classList.remove("on");$("modal").classList.remove("on");const d=LS.get(dailyKey(n),null);if(!d)return start("daily",n);G={mode:"daily",n,order:dailyOrder(n),i:7,score:d.score,log:d.log,over:true};shownScore=d.score;screen("play");setAlt(d.score);hud();document.body.classList.add("locked");$("ladder").hidden=true;$("reveal").hidden=true;
 $("cRound").textContent=`MISSION #${n}`;$("cQ").textContent="Mission complete";$("cHint").textContent="come back tomorrow for a new launch";renderResults();openSheet();}
$("btnBegin").onclick=()=>viewDaily(todayNum());$("logo").onclick=goHome;
$("hArchive").onclick=()=>openArchive();$("hEndless").onclick=()=>openEndless();
setInterval(()=>{if(document.body.dataset.screen==="home")refreshHome();$("resCd").textContent="NEXT MISSION IN "+cdText();},1000);
// ---------- drawer & modals ----------
function closeAll(){$("drawer").classList.remove("on");$("modal").classList.remove("on");closeSheet();}
$("btnMenu").onclick=()=>{$("drawer").classList.add("on");};$("drawer").onclick=e=>{if(e.target===$("drawer"))$("drawer").classList.remove("on");};
$("drawer").querySelectorAll("[data-act]").forEach(b=>b.onclick=()=>{$("drawer").classList.remove("on");const a=b.dataset.act;
 if(a==="daily"){closeAll();viewDaily(todayNum());}else if(a==="endless")openEndless();else if(a==="survival")start("survival");else if(a==="archive")openArchive();else if(a==="me")openMe();else if(a==="ward")openWard();else if(a==="settings")openSettings();else openFaq();});
function modal(html){$("mBody").innerHTML=html;$("modal").classList.add("on");$("modal").setAttribute("aria-hidden","false");}
$("mClose").onclick=()=>$("modal").classList.remove("on");$("modal").onclick=e=>{if(e.target===$("modal"))$("modal").classList.remove("on");};
function inGame(){return G&&!G.over&&document.body.dataset.screen==="play";}
function guard(){if(inGame()&&!confirm("Abort this mission? Progress on it will be lost."))return false;if(inGame()){clearInterval(timer);}return true;}
function openArchive(){const t=todayNum();let h=`<h3>ARCHIVE</h3><p class="meta dim">EVERY PAST MISSION, FREE. BEST SCORE IS KEPT.</p><div class="alist">`;
 for(let n=t;n>=1;n--){const d=LS.get(dailyKey(n),null);h+=`<button data-n="${n}"><span>MISSION #${n} <span class="dim">· ${dateOf(n)}</span></span><span class="s">${d?d.score+" PTS":"PLAY ▸"}</span></button>`;}
 modal(h+"</div>");$("mBody").querySelectorAll("[data-n]").forEach(b=>b.onclick=()=>{if(!guard())return;const n=+b.dataset.n;const d=LS.get(dailyKey(n),null);
  if(d&&n===t)return viewDaily(n);start("daily",n);});}
function openEndless(){const lg=LS.get("sw_endless",{}),nx=nextEndless();let h=`<h3>ENDLESS MISSIONS ∞</h3><p class="meta dim">SAME FORMAT AS THE DAILY. NUMBERED MISSIONS, REPLAY ANY, BEST SCORE KEPT.</p>
 <div class="row"><button class="btn primary" data-e="${nx}">LAUNCH ENDLESS #${nx}</button><button class="btn ghost" data-s="1">SURVIVAL ♥♥♥</button></div><p class="meta dim">SURVIVAL: ENDLESS PROMPTS, A MISS COSTS A LIFE. BEST: ${LS.get("sw_best_surv",0)} PTS</p><p class="eyebrow" style="margin-top:14px">MISSION LOG</p><div class="alist">`;
 const ks=Object.keys(lg).map(Number).sort((a,b)=>b-a);h+=ks.length?ks.map(n=>`<button data-e="${n}"><span>ENDLESS #${n}</span><span class="s">BEST ${lg[n]} ▸</span></button>`).join(""):`<p class="meta dim">NO MISSIONS CHARTED YET.</p>`;
 modal(h+"</div>");$("mBody").querySelectorAll("[data-e]").forEach(b=>b.onclick=()=>{if(guard())start("endless",+b.dataset.e);});$("mBody").querySelector("[data-s]").onclick=()=>{if(guard())start("survival");};}
function openMe(){const st=streakInfo();const lg=LS.get("sw_endless",{});
 modal(`<h3>MY STARWARD</h3><div class="stats">${[["STREAK",st.streak],["PLAYED",st.played],["AVG",st.avg],["BEST",st.best]].map(([a,b])=>`<div><b>${b}</b><small>${a}</small></div>`).join("")}</div>
 <p class="meta">LONGEST STREAK: ${st.maxS} · ENDLESS CHARTED: ${Object.keys(lg).length} · SURVIVAL BEST: ${LS.get("sw_best_surv",0)}</p>
 <p class="eyebrow" style="margin-top:16px">CREW UNLOCKED</p><p>${BUDDIES.filter(b=>st.maxS>=b.need).map(b=>b.n).join(" · ")}</p>
 <p class="meta dim">STATS LIVE ON THIS DEVICE ONLY. NO ACCOUNT, NO TRACKING.</p><div class="row"><button class="btn ghost" id="mWard">OPEN WARDROBE</button></div>`);$("mWard").onclick=openWard;}
function openWard(){const st=streakInfo();modal(`<h3>WARDROBE</h3><p class="meta dim">KEEP A DAILY STREAK TO UNLOCK NEW CREW. CURRENT STREAK: ${st.streak} · BEST: ${st.maxS}</p><div class="wgrid">${BUDDIES.map(b=>{const ok=st.maxS>=b.need;return `<button class="wi ${ok?"":"lock"} ${b.id===buddy?"sel":""}" data-b="${b.id}" ${ok?"":"disabled"}><canvas width="16" height="16" data-g="${b.id}"></canvas><b>${b.n}</b><small>${ok?b.d:`LOCKED · ${b.need}-DAY STREAK`}</small></button>`;}).join("")}</div>`);
 $("mBody").querySelectorAll("canvas[data-g]").forEach(c=>drawSprite(c,BUDDIES.find(b=>b.id===c.dataset.g).g,true));
 $("mBody").querySelectorAll(".wi").forEach(w=>w.onclick=()=>{if(w.disabled)return;buddy=w.dataset.b;LS.set("sw_buddy",buddy);drawSprite($("wardIcon"),curBuddy().g,false);$("mBody").querySelectorAll(".wi").forEach(x=>x.classList.toggle("sel",x===w));toast(curBuddy().n+" SUITED UP");});}
const SETS=[["lp","LOW-POWER MODE","Fewer animations and a calmer starfield."],["cb","COLORBLIND MODE","Brighter text and more separable tier colours."],["fix","ANSWER CORRECTIONS","Typos get a suggested fix you confirm with a second submit. Off: fixes apply instantly."],["clr","CLEAR REJECTED ENTRIES","Empty the box after a no-signal answer."],["link","SHARE LINK","Add the game link to copied results."],["sound","SOUND","Little 8-bit beeps."]];
function openSettings(){modal(`<h3>SETTINGS</h3>${SETS.map(([k,n,d])=>`<div class="tg"><span>${n}<small>${d}</small></span><button class="sw ${SET[k]?"on":""}" data-k="${k}" role="switch" aria-checked="${!!SET[k]}" aria-label="${n}"></button></div>`).join("")}`);
 $("mBody").querySelectorAll(".sw").forEach(b=>b.onclick=()=>{const k=b.dataset.k;SET[k]=!SET[k];b.classList.toggle("on",SET[k]);b.setAttribute("aria-checked",SET[k]);applySet();beep(660,.05);});}
function openFaq(){modal(`<h3>HOW TO PLAY</h3><dl class="faq">
 <dt>THE MISSION</dt><dd>Seven prompts a day. For each one you get a 3-second look, then 25 seconds to send one answer.</dd>
 <dt>SCORING</dt><dd>Common answers are Space Dust (10). Rarer answers are worth more: Meteor 30, Comet 60, Supernova 85, and One in a Quasar 100. Too Clever (15) is the "obscure" answer everyone thinks of. A perfect mission is 700.</dd>
 <dt>NO SIGNAL</dt><dd>If we don't recognise an answer, nothing is lost. Keep trying until the clock runs out. Your first accepted answer locks in.</dd>
 <dt>TYPOS</dt><dd>Close spellings get a correction. Submit again to confirm, or edit it. A chip can also suggest the answer while you type.</dd>
 <dt>ALTITUDE</dt><dd>Points push your astronaut from the launch pad past the Kármán line, the ISS and the Moon, then on to the planets and the heliopause, about 18 billion km out. Distances are real, rounded figures.</dd>
 <dt>HOW RARE IS RARE?</dt><dd>Tiers are our own estimates, not live player data. The "how you stack up" chart compares you with a modelled crowd and is marked est.</dd>
 <dt>RESETS</dt><dd>A new mission every midnight US Eastern. The Archive replays any past mission. Endless missions are numbered and unlimited, and Survival gives you 3 lives.</dd>
 <dt>CREW</dt><dd>Daily streaks unlock new astronauts in the Wardrobe at 5, 14, 30 and 45 days.</dd></dl>`);}
$("btnWard").onclick=openWard;$("btnSound").onclick=()=>{SET.sound=!SET.sound;applySet();beep(660);};
// ---------- scene (pixel canvas) ----------
const cv=$("sky"),cx=cv.getContext("2d");let W,H,PX=3,STARS=[],ROCKS=[];
function rs(){PX=innerWidth>=900?4:3;W=Math.ceil(innerWidth/PX);H=Math.ceil(innerHeight/PX);cv.width=W;cv.height=H;cx.imageSmoothingEnabled=false;
 const r=rng("stars");STARS=Array.from({length:Math.min(260,W*H/90|0)},()=>({x:r()*W,y:r()*H,z:r()*.9+.1,c:r()<.12?"#ffd6a0":r()<.2?"#a8d8ff":"#ffffff"}));
 ROCKS=Array.from({length:14},()=>({x:r()*W,o:r()*40-20,s:1+r()*2|0,v:r()*.2+.05}));}
addEventListener("resize",rs);rs();
const mix=(a,b,t)=>{const p=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));const A=p(a),B=p(b);return"rgb("+A.map((v,i)=>Math.round(v+(B[i]-v)*t)).join(",")+")";};
function disc(x,y,r,col,shade){x=Math.round(x);y=Math.round(y);for(let dy=-r;dy<=r;dy++){const w=Math.round(Math.sqrt(r*r-dy*dy));cx.fillStyle=col;cx.fillRect(x-w,y+dy,w*2+1,1);if(shade){cx.fillStyle=shade;const sw=Math.max(1,Math.round(w*.45));cx.fillRect(x+w-sw+1,y+dy,sw,1);}}}
let T=0,lastF=0;const PPP=()=>Math.max(1.6,H/170);
function frame(now){requestAnimationFrame(frame);if(calm()&&now-lastF<90)return;lastF=now;T++;
 const a=alt,hy=H*.86,ppp=PPP(),Y=p=>hy-(p-a)*ppp;const t=Math.min(1,a/45);
 const g=cx.createLinearGradient(0,0,0,H);g.addColorStop(0,mix("#3d7fc4","#02030a",Math.min(1,t*1.4)));g.addColorStop(1,mix("#9fd3f0","#070a1c",t));cx.fillStyle=g;cx.fillRect(0,0,W,H);
 // stars
 const sa=Math.min(1,Math.max(.15,(a-4)/25));const drift=calm()?0:T*.05;
 for(const s of STARS){const y=((s.y+a*ppp*s.z*.35+drift*s.z)%H+H)%H;cx.globalAlpha=sa*(.35+s.z*.65)*(calm()?1:(.85+.15*Math.sin(T*.05+s.x)));cx.fillStyle=s.c;cx.fillRect(s.x|0,y|0,1,1);}cx.globalAlpha=1;
 // heliopause glow
 if(a>560){cx.globalAlpha=Math.min(.35,(a-560)/400);const hg=cx.createRadialGradient(W/2,Y(700),2,W/2,Y(700),W);hg.addColorStop(0,"#ff5fd2");hg.addColorStop(1,"transparent");cx.fillStyle=hg;cx.fillRect(0,0,W,H);cx.globalAlpha=1;}
 const vis=y=>y>-60&&y<H+60;
 // clouds
 for(let i=0;i<6;i++){const y=Y(2+i*1.4)-i*6;if(!vis(y))continue;const x=((i*53+T*.08*(i%2?1:-1))%(W+60)+W+60)%(W+60)-30;cx.fillStyle="rgba(255,255,255,.8)";cx.fillRect(x|0,y|0,22,4);cx.fillRect((x+5)|0,(y-3)|0,12,3);}
 // Kármán line
 {const y=Y(10);if(vis(y)){cx.fillStyle="rgba(63,224,255,.5)";for(let x=0;x<W;x+=4)cx.fillRect(x,y|0,2,1);}}
 // ISS
 {const y=Y(40);if(vis(y)){const x=(T*.25)%(W+40)-20;cx.fillStyle="#3a5fa8";cx.fillRect(x-9|0,y-2|0,6,5);cx.fillRect(x+4|0,y-2|0,6,5);cx.fillStyle="#cfd6e6";cx.fillRect(x-3|0,y|0,7,2);cx.fillRect(x|0,y-1|0,2,4);}}
 // satellites
 for(const [p,dir] of [[130,1],[180,-1]]){const y=Y(p);if(!vis(y))continue;const x=((dir*T*.18+p*3)%(W+20)+W+20)%(W+20)-10;cx.fillStyle="#ffd84a";cx.fillRect(x|0,y|0,3,3);cx.fillStyle="#3a5fa8";cx.fillRect(x-4|0,y+1|0,4,1);cx.fillRect(x+3|0,y+1|0,4,1);}
 // Earth from above (after leaving)
 {const y=Y(-8)+Math.max(0,a-12)*ppp*.0;if(a>12){const r=W*.9,yy=hy+ (a<60? (a-12)*ppp*.8 : 48*ppp*.8+ (a-60)*ppp*1.5);if(yy-r<H)disc(W/2,yy+r*.25,Math.round(r),"#1c5fb0","#123c74");}}
 // Moon, planets
 const B=[[250,.28,10,"#c9ccd6","#8d91a0"],[330,.72,7,"#d2603a","#8f3a22"],[460,.3,16,"#d9b48a","#9d7a55"],[520,.7,10,"#e6d29a","#a8935e"],[580,.25,7,"#8fe3e8","#5aa7ad"],[630,.72,7,"#4468e0","#2a3f99"]];
 for(const [p,fx,r,c1,c2] of B){const y=Y(p);if(!vis(y))continue;const x=W*fx;if(p===520){cx.fillStyle="#bfa86b";cx.fillRect(x-r*1.8|0,y|0,r*3.6|0,1);}
  disc(x,y,Math.round(r*Math.min(1.6,W/130)),c1,c2);if(p===460){cx.fillStyle="#b07d55";cx.fillRect(x-14|0,y-3|0,26,2);cx.fillRect(x-15|0,y+4|0,28,1);}
  if(p===250){cx.fillStyle="#9ea2b0";cx.fillRect(x-3|0,y-3|0,3,2);cx.fillRect(x+2|0,y+3|0,2,2);}if(p===520){cx.fillStyle="#d8c286";cx.fillRect(x-r*1.8|0,y+1|0,r*1.2|0,1);}}
 // asteroid belt & kuiper
 for(const [p,col] of [[400,"#8a6e55"],[670,"#a9c7e0"]])for(const k of ROCKS){const y=Y(p+k.o);if(!vis(y))continue;const x=((k.x+T*k.v)%(W+10)+W+10)%(W+10)-5;cx.fillStyle=col;cx.fillRect(x|0,y|0,k.s+1,k.s);}
 // ground + launch pad
 {const y=Y(0);if(y<H+40){cx.fillStyle="#1e3a2a";cx.fillRect(0,y|0,W,H);cx.fillStyle="#2c5a3c";cx.fillRect(0,y|0,W,2);cx.fillStyle="#3b3f52";cx.fillRect(W/2-6|0,y-3|0,40,3);
  const rx=W/2+10|0;cx.fillStyle="#5a6787";for(let k=0;k<30;k+=3)cx.fillRect(rx+16,y-30+k|0,4,1);cx.fillRect(rx+16,y-30|0,1,30);cx.fillRect(rx+19,y-30|0,1,30);
  cx.fillStyle="#eef3ff";cx.fillRect(rx+4,y-24|0,7,21);cx.fillStyle="#ff4f9a";cx.fillRect(rx+4,y-28|0,7,4);cx.fillRect(rx+5,y-30|0,5,2);cx.fillRect(rx+6,y-31|0,3,1);cx.fillRect(rx+2,y-8|0,2,5);cx.fillRect(rx+11,y-8|0,2,5);cx.fillStyle="#3fe0ff";cx.fillRect(rx+6,y-19|0,3,3);
  const fx=W/2-30|0;cx.fillStyle="#9aa6c4";cx.fillRect(fx,y-18|0,1,18);cx.fillStyle="#3fe0ff";cx.fillRect(fx+1,y-18|0,7,4);cx.fillStyle="#ff4f9a";cx.fillRect(fx+1,y-16|0,7,1);}}
}
requestAnimationFrame(frame);
// ---------- boot ----------
applySet();refreshHome();
if("serviceWorker"in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
window.__sw={PROMPTS,exact,correction,suggest,norm,TIERS,journey,pctile,G:()=>G,todayNum,setTime:(f)=>{if(G&&G.end)G.end=Date.now()+f;},
 seedStreak:(n)=>{const t=todayNum();for(let i=0;i<n;i++)LS.set(dailyKey(t-i),{score:100,log:[],live:true});LS.set("sw_maxstreak",n);}};
})();
