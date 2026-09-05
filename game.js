(() => {
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let DPR = Math.min(2, window.devicePixelRatio || 1);

function resize(){
  DPR = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(innerWidth * DPR);
  canvas.height = Math.floor(innerHeight * DPR);
  canvas.style.width = innerWidth+'px';
  canvas.style.height = innerHeight+'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
addEventListener('resize', resize); resize();

const W = () => innerWidth, H = () => innerHeight;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const dist=(ax,ay,bx,by)=>Math.hypot(ax-bx,ay-by);
const rand=(a,b)=>a+Math.random()*(b-a);

const keys = new Set(), pressed = new Set();
addEventListener('keydown', e=>{ if(!keys.has(e.code)) pressed.add(e.code); keys.add(e.code); if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup', e=>keys.delete(e.code));

document.querySelectorAll('#touchUI button').forEach(btn=>{
  const code=btn.dataset.key;
  const down=e=>{ e.preventDefault(); if(!keys.has(code)) pressed.add(code); keys.add(code); };
  const up=e=>{ e.preventDefault(); keys.delete(code); };
  btn.addEventListener('pointerdown',down); btn.addEventListener('pointerup',up); btn.addEventListener('pointercancel',up); btn.addEventListener('pointerleave',up);
});

// ---------- sound ----------
let audioCtx=null, muted=false;
function beep(freq=440,dur=.08,type='sine',gain=.03,slide=0){
  if(muted) return;
  try{
    audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();
    const o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,audioCtx.currentTime);
    if(slide) o.frequency.linearRampToValueAtTime(freq+slide,audioCtx.currentTime+dur);
    g.gain.setValueAtTime(gain,audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+dur);
    o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime+dur);
  }catch{}
}
function chord(){ [220,277,330,440].forEach((f,i)=>setTimeout(()=>beep(f,.35,'sine',.018,30),i*55)); }

// ---------- game state ----------
const SAVE='line-shift-save-v3';
const WORLD_WIDTH=34000;
const game={ screen:'title', time:0, world:0, prevWorld:0, realm:false, cameraX:0, shake:0, flash:0, message:'', messageT:0, checkpoint:120, deaths:0, bossDead:false, boss2Dead:false, boss3Dead:false, boss4Dead:false, boss5Dead:false, world2Entered:false, world3Entered:false, world4Entered:false, world5Entered:false, endTimer:0 };
const abilities={ color:false, double:false, grapple:false, dash:false, phase:false, echo:false, realm:false, glide:false, focus:false, resonance:false };

function save(){
  try{localStorage.setItem(SAVE,JSON.stringify({checkpoint:game.checkpoint,abilities,bossDead:game.bossDead,boss2Dead:game.boss2Dead,boss3Dead:game.boss3Dead,boss4Dead:game.boss4Dead,boss5Dead:game.boss5Dead,realm:game.realm,world2Entered:game.world2Entered,world3Entered:game.world3Entered,world4Entered:game.world4Entered,world5Entered:game.world5Entered}));}catch{}
}
function load(){
  try{
    const s=JSON.parse(localStorage.getItem(SAVE)||'null');
    if(s){ game.checkpoint=s.checkpoint||120; Object.assign(abilities,s.abilities||{}); game.bossDead=!!s.bossDead; game.boss2Dead=!!s.boss2Dead; game.boss3Dead=!!s.boss3Dead; game.boss4Dead=!!s.boss4Dead; game.boss5Dead=!!s.boss5Dead; game.realm=!!s.realm; game.world2Entered=!!s.world2Entered; game.world3Entered=!!s.world3Entered; game.world4Entered=!!s.world4Entered; game.world5Entered=!!s.world5Entered; }
  }catch{}
}
load();

const player={ x:120,y:0,w:24,h:34,vx:0,vy:0,onGround:false,jumps:0,face:1,hp:4,maxHp:4,inv:0,dashT:0,dashCD:0,shotCD:0,grapple:null,trail:[] };

const groundY = 470;
const platforms=[
  {x:0,y:groundY,w:1250,h:80},
  {x:1320,y:groundY-20,w:420,h:100},
  {x:1810,y:groundY,w:560,h:80},
  {x:2440,y:groundY-60,w:390,h:140},
  {x:2920,y:groundY,w:450,h:80},
  {x:3450,y:groundY-20,w:380,h:100},
  {x:3900,y:groundY,w:500,h:80},
  {x:4480,y:groundY-90,w:300,h:170},
  {x:4850,y:groundY,w:480,h:80},
  {x:5420,y:groundY-30,w:470,h:110},
  {x:5980,y:groundY,w:520,h:80},
  {x:6570,y:groundY-60,w:420,h:140},
  {x:7060,y:groundY,w:820,h:80},
  // upper paths
  {x:920,y:355,w:130,h:16}, {x:1090,y:300,w:150,h:16},
  {x:1530,y:330,w:120,h:16}, {x:1680,y:275,w:120,h:16},
  {x:2590,y:300,w:130,h:16}, {x:2760,y:245,w:120,h:16},
  {x:3620,y:320,w:130,h:16}, {x:3790,y:255,w:150,h:16},
  {x:4560,y:270,w:140,h:16}, {x:4740,y:220,w:140,h:16},
  {x:5630,y:300,w:150,h:16}, {x:5820,y:235,w:130,h:16},
  {x:6760,y:290,w:150,h:16},
  // WORLD 2 — terrain becomes increasingly dimensional and detailed
  {x:7880,y:groundY,w:500,h:80},
  {x:8440,y:groundY-20,w:430,h:100},
  {x:8950,y:groundY-50,w:560,h:130},
  {x:9590,y:groundY,w:470,h:80},
  {x:10120,y:groundY-35,w:390,h:115},
  {x:10580,y:groundY,w:610,h:80},
  {x:11260,y:groundY-55,w:330,h:135},
  {x:11660,y:groundY,w:690,h:80},
  {x:12410,y:groundY-25,w:500,h:105},
  {x:12980,y:groundY,w:520,h:80},
  {x:13570,y:groundY-65,w:520,h:145},
  {x:14150,y:groundY,w:560,h:80},
  {x:14770,y:groundY-35,w:970,h:115},
  // layered paths / cliff ledges
  {x:8180,y:350,w:130,h:16},{x:8350,y:300,w:120,h:16},
  {x:8660,y:320,w:150,h:16},{x:8870,y:260,w:130,h:16},
  {x:9280,y:315,w:150,h:16},{x:9500,y:250,w:120,h:16},
  {x:10030,y:300,w:150,h:16},{x:10300,y:235,w:140,h:16},
  {x:10840,y:330,w:170,h:16},{x:11100,y:255,w:135,h:16},
  {x:11780,y:310,w:160,h:16},{x:12030,y:240,w:150,h:16},
  {x:12630,y:305,w:140,h:16},{x:12850,y:230,w:150,h:16},
  {x:13320,y:325,w:160,h:16},{x:13640,y:240,w:170,h:16},
  {x:14230,y:300,w:160,h:16},{x:14530,y:225,w:150,h:16},
  // WORLD 3 — storm cliffs
  {x:15840,y:groundY,w:520,h:80},{x:16430,y:groundY-45,w:470,h:125},{x:16980,y:groundY,w:430,h:80},
  {x:17480,y:groundY-80,w:360,h:160},{x:17920,y:groundY,w:520,h:80},{x:18510,y:groundY-30,w:420,h:110},
  {x:19010,y:groundY-65,w:390,h:145},{x:19480,y:groundY,w:480,h:80},{x:20040,y:groundY-45,w:420,h:125},
  {x:20550,y:groundY,w:800,h:80},
  {x:16170,y:345,w:140,h:16},{x:16630,y:285,w:150,h:16},{x:17150,y:320,w:135,h:16},{x:17610,y:245,w:150,h:16},
  {x:18180,y:315,w:160,h:16},{x:18720,y:255,w:150,h:16},{x:19210,y:300,w:145,h:16},{x:19720,y:235,w:150,h:16},
  {x:20240,y:300,w:150,h:16},{x:20710,y:220,w:165,h:16},
  // WORLD 4 — living city
  {x:21380,y:groundY,w:560,h:80},{x:22010,y:groundY-30,w:430,h:110},{x:22520,y:groundY,w:460,h:80},
  {x:23060,y:groundY-55,w:420,h:135},{x:23560,y:groundY,w:520,h:80},{x:24160,y:groundY-40,w:400,h:120},
  {x:24640,y:groundY,w:470,h:80},{x:25190,y:groundY-70,w:390,h:150},{x:25670,y:groundY,w:480,h:80},
  {x:26230,y:groundY-35,w:780,h:115},
  {x:21680,y:335,w:150,h:16},{x:22210,y:275,w:140,h:16},{x:22780,y:320,w:160,h:16},{x:23320,y:245,w:150,h:16},
  {x:23880,y:300,w:160,h:16},{x:24420,y:235,w:150,h:16},{x:24930,y:320,w:145,h:16},{x:25430,y:250,w:160,h:16},
  {x:25960,y:300,w:150,h:16},{x:26480,y:225,w:160,h:16},
  // WORLD 5 — cosmic garden
  {x:27020,y:groundY,w:620,h:80},{x:27710,y:groundY-50,w:420,h:130},{x:28210,y:groundY,w:470,h:80},
  {x:28760,y:groundY-75,w:360,h:155},{x:29210,y:groundY,w:540,h:80},{x:29820,y:groundY-35,w:420,h:115},
  {x:30320,y:groundY,w:460,h:80},{x:30870,y:groundY-65,w:420,h:145},{x:31380,y:groundY,w:500,h:80},
  {x:31960,y:groundY-45,w:420,h:125},{x:32460,y:groundY,w:1400,h:80},
  {x:27380,y:330,w:150,h:16},{x:27940,y:260,w:150,h:16},{x:28480,y:315,w:150,h:16},{x:29030,y:235,w:160,h:16},
  {x:29580,y:310,w:150,h:16},{x:30120,y:245,w:150,h:16},{x:30660,y:300,w:160,h:16},{x:31210,y:225,w:150,h:16},
  {x:31750,y:300,w:150,h:16},{x:32270,y:220,w:170,h:16},{x:32780,y:290,w:170,h:16},
];

const hiddenPlatforms=[
  {x:1120,y:395,w:120,h:14}, {x:3360,y:350,w:110,h:14}, {x:4320,y:320,w:110,h:14}, {x:6210,y:340,w:120,h:14}, {x:9060,y:350,w:120,h:14}, {x:12190,y:340,w:120,h:14}, {x:13940,y:300,w:120,h:14},
  {x:16820,y:360,w:120,h:14},{x:18870,y:335,w:130,h:14},{x:22420,y:345,w:130,h:14},{x:24790,y:340,w:120,h:14},{x:28080,y:350,w:130,h:14},{x:30500,y:335,w:130,h:14},{x:32110,y:300,w:140,h:14}
];

// In World 2 the player can shift between two overlapping versions of the landscape.
const realmPlatforms=[
  {x:9770,y:365,w:150,h:14,state:false},{x:9950,y:305,w:130,h:14,state:true},
  {x:10720,y:360,w:150,h:14,state:true},{x:10920,y:300,w:130,h:14,state:false},
  {x:11880,y:365,w:140,h:14,state:false},{x:12070,y:300,w:130,h:14,state:true},
  {x:13140,y:350,w:150,h:14,state:true},{x:13350,y:285,w:130,h:14,state:false},
  {x:14320,y:355,w:150,h:14,state:false},{x:14530,y:285,w:140,h:14,state:true},
  {x:17310,y:350,w:150,h:14,state:true},{x:17520,y:285,w:150,h:14,state:false},{x:19640,y:350,w:150,h:14,state:false},{x:19860,y:275,w:150,h:14,state:true},
  {x:23220,y:350,w:150,h:14,state:false},{x:23440,y:280,w:150,h:14,state:true},{x:25320,y:350,w:150,h:14,state:true},{x:25540,y:275,w:150,h:14,state:false},
  {x:28600,y:350,w:150,h:14,state:false},{x:28820,y:275,w:150,h:14,state:true},{x:31000,y:350,w:150,h:14,state:true},{x:31230,y:270,w:150,h:14,state:false},{x:32560,y:340,w:150,h:14,state:false},{x:32770,y:265,w:150,h:14,state:true},
];

const spikes=[
  {x:1260,y:groundY-18,w:55,h:18},{x:1745,y:groundY-18,w:60,h:18},{x:2375,y:groundY-18,w:60,h:18},
  {x:3368,y:groundY-18,w:75,h:18},{x:3832,y:groundY-18,w:68,h:18},{x:4402,y:groundY-18,w:75,h:18},
  {x:5332,y:groundY-18,w:85,h:18},{x:5892,y:groundY-18,w:85,h:18},{x:6502,y:groundY-18,w:65,h:18},
  {x:8382,y:groundY-18,w:55,h:18},{x:8880,y:groundY-18,w:65,h:18},{x:9515,y:groundY-18,w:70,h:18},
  {x:10512,y:groundY-18,w:65,h:18},{x:11192,y:groundY-18,w:65,h:18},{x:12352,y:groundY-18,w:58,h:18},
  {x:13502,y:groundY-18,w:65,h:18},{x:14092,y:groundY-18,w:55,h:18},{x:14712,y:groundY-18,w:55,h:18},
  {x:16362,y:groundY-18,w:65,h:18},{x:16912,y:groundY-18,w:65,h:18},{x:17842,y:groundY-18,w:72,h:18},{x:18442,y:groundY-18,w:65,h:18},{x:19962,y:groundY-18,w:75,h:18},
  {x:21942,y:groundY-18,w:65,h:18},{x:22442,y:groundY-18,w:70,h:18},{x:24082,y:groundY-18,w:75,h:18},{x:25112,y:groundY-18,w:75,h:18},{x:26152,y:groundY-18,w:75,h:18},
  {x:27642,y:groundY-18,w:65,h:18},{x:28142,y:groundY-18,w:65,h:18},{x:29752,y:groundY-18,w:70,h:18},{x:30782,y:groundY-18,w:80,h:18},{x:31882,y:groundY-18,w:75,h:18}
];

const anchors=[
  {x:1610,y:190},{x:2700,y:150},{x:3730,y:150},{x:4640,y:135},{x:5750,y:150},{x:6840,y:155},
  {x:8270,y:165},{x:8780,y:145},{x:9400,y:135},{x:10250,y:145},{x:11020,y:140},{x:11940,y:130},{x:12740,y:135},{x:13680,y:125},{x:14540,y:120},{x:15140,y:135},
  {x:16580,y:135},{x:17210,y:120},{x:17740,y:100},{x:18320,y:125},{x:18930,y:105},{x:19520,y:115},{x:20130,y:95},{x:20810,y:110},
  {x:21920,y:125},{x:22590,y:105},{x:23260,y:95},{x:23920,y:120},{x:24570,y:90},{x:25220,y:110},{x:25870,y:95},{x:26540,y:105},
  {x:27510,y:120},{x:28170,y:95},{x:28860,y:80},{x:29500,y:110},{x:30180,y:85},{x:30840,y:95},{x:31520,y:75},{x:32200,y:90},{x:32900,y:85}
];

const pickups=[
  {id:'color',x:700,y:groundY-55,label:'FÄRG',taken:false},
  {id:'double',x:2050,y:groundY-55,label:'EKO',taken:false},
  {id:'grapple',x:3100,y:groundY-55,label:'TRÅD',taken:false},
  {id:'dash',x:5050,y:groundY-55,label:'PULS',taken:false},
  {id:'phase',x:6150,y:groundY-55,label:'SE',taken:false},
  {id:'realm',x:9430,y:groundY-110,label:'SKIFT',taken:false},
  {id:'glide',x:16480,y:groundY-115,label:'VIND',taken:false},
  {id:'focus',x:22080,y:groundY-105,label:'LINS',taken:false},
  {id:'resonance',x:27580,y:groundY-110,label:'KÄRNA',taken:false},
];
for(const p of pickups) p.taken=!!abilities[p.id];

const checkpoints=[850,2300,3650,5200,6500,7350,8100,9300,10600,11900,13200,14600,16050,17350,18700,20100,21450,22800,24200,25600,27100,28500,29900,31300,32600];
const enemies=[];
function addEnemy(x,type='walker'){ enemies.push({x,y:groundY-30,w:25,h:28,vx:type==='flyer'?0:rand(-45,-25),vy:0,type,hp:type==='brute'?3:1,t:rand(0,10),dead:false,home:x}); }
[1500,1900,2540,2810,3530,4020,4550,4920,5520,6100,6660,6900].forEach((x,i)=>addEnemy(x,i%4===0?'brute':'walker'));
[2670,4690,5770].forEach(x=>addEnemy(x,'flyer'));
[8480,9030,9690,10420,10950,11680,12380,13080,13730,14300,14880].forEach((x,i)=>addEnemy(x,i%3===0?'brute':'walker'));
[8750,9870,11420,12720,13920,14620].forEach(x=>addEnemy(x,'wisp'));
[9200,10820,12550,14120].forEach(x=>addEnemy(x,'sentinel'));
[16280,16880,17620,18120,18780,19320,19920,20520].forEach((x,i)=>addEnemy(x,i%3===0?'brute':'walker'));
[17120,18480,19750,20380].forEach(x=>addEnemy(x,'wisp'));
[18020,19180,20620].forEach(x=>addEnemy(x,'sentinel'));
[21780,22480,23180,23820,24520,25220,25920,26420].forEach((x,i)=>addEnemy(x,i%4===0?'brute':'walker'));
[22280,23620,24880,25780].forEach(x=>addEnemy(x,'wisp'));
[22920,24300,26120].forEach(x=>addEnemy(x,'sentinel'));
[27380,28020,28720,29420,30120,30820,31520,32220,32820].forEach((x,i)=>addEnemy(x,i%3===0?'brute':'walker'));
[27880,29180,30580,31920,32620].forEach(x=>addEnemy(x,'wisp'));
[28420,29880,31280,32420].forEach(x=>addEnemy(x,'sentinel'));

const boss={x:7520,y:groundY-55,w:62,h:58,hp:10,maxHp:10,dead:game.bossDead,t:0,vx:0,shot:0};
const boss2={x:15320,y:groundY-82,w:86,h:82,hp:16,maxHp:16,dead:game.boss2Dead,t:0,shot:0,phase:false};
const boss3={x:20940,y:groundY-78,w:82,h:78,hp:18,maxHp:18,dead:game.boss3Dead,t:0,shot:0};
const boss4={x:26620,y:groundY-90,w:92,h:90,hp:22,maxHp:22,dead:game.boss4Dead,t:0,shot:0};
const boss5={x:33100,y:groundY-105,w:108,h:104,hp:28,maxHp:28,dead:game.boss5Dead,t:0,shot:0,phase:false};
const bullets=[];
const shots=[];
const echoShard={x:4375,y:280,taken:abilities.echo};
const echoPortal={x:6330,y:groundY-45,w:34,h:45};
const windZones=[
  {x:16760,y:185,w:150,h:285,force:1220},{x:18260,y:165,w:170,h:305,force:1260},{x:19820,y:155,w:180,h:315,force:1320},
  {x:28160,y:185,w:150,h:285,force:1120},{x:30600,y:160,w:170,h:310,force:1200}
];

const signs=[
  {x:300,text:'Gå. Det räcker som början.'},
  {x:920,text:'Något förändras när du tar det.'},
  {x:2200,text:'Vissa vägar kräver att du minns.'},
  {x:3220,text:'Q — kasta tråden mot ljuspunkter.'},
  {x:5160,text:'SHIFT — en kort puls genom världen.'},
  {x:6220,text:'Det som varit osynligt har alltid funnits.'},
  {x:7130,text:'Slutet på en linje kan vara början på en värld.'},
  {x:8080,text:'VÄRLD 2 — HORISONTEN'},
  {x:9070,text:'Nu finns det mer än en väg genom samma plats.'},
  {x:9520,text:'E — skifta verkligheten.'},
  {x:11180,text:'Det som ser ut som bakgrund kan snart bli spelrum.'},
  {x:12920,text:'Världen blir tydligare. Men inte enklare.'},
  {x:14650,text:'Använd allt du har lärt dig.'},
  {x:16030,text:'VÄRLD 3 — STORMBRANTEN'},
  {x:16540,text:'Håll JUMP i luften. Låt vinden bära dig.'},
  {x:17980,text:'Nu börjar marken få höjd, väder och tyngd.'},
  {x:20480,text:'Stormen testar rörelse, inte bara strid.'},
  {x:21470,text:'VÄRLD 4 — DEN LEVANDE STADEN'},
  {x:22140,text:'LINSEN gör skotten tyngre och tydligare.'},
  {x:23940,text:'Gamla krafter fungerar annorlunda mellan väggarna.'},
  {x:26080,text:'Staden har lärt sig att försvara sig.'},
  {x:27110,text:'VÄRLD 5 — DEN KOSMISKA TRÄDGÅRDEN'},
  {x:27640,text:'KÄRNAN låter pulsen slå sönder projektiler.'},
  {x:29620,text:'Här möts alla världar du redan har förstått.'},
  {x:32480,text:'Sista sträckan. Använd allt.'}
];

function resetPlayer(full=false){
  player.x=game.checkpoint; player.y=groundY-60; player.vx=player.vy=0; player.hp=player.maxHp; player.grapple=null; player.dashT=0; player.inv=0;
  if(full){ game.checkpoint=120; }
}
resetPlayer();

function worldIndex(x){
  if(x<700) return 0;
  if(x<2050) return 1;
  if(x<3100) return 2;
  if(x<5050) return 3;
  if(x<6150) return 4;
  if(x<7900) return 5;
  if(x<9000) return 6;
  if(x<10600) return 7;
  if(x<12200) return 8;
  if(x<13900) return 9;
  if(x<15850) return 10;
  if(x<17250) return 11;
  if(x<18650) return 12;
  if(x<20050) return 13;
  if(x<21400) return 14;
  if(x<22800) return 15;
  if(x<24200) return 16;
  if(x<25600) return 17;
  if(x<27000) return 18;
  if(x<28400) return 19;
  if(x<29800) return 20;
  if(x<31200) return 21;
  return 22;
}

function setMessage(text,t=3){ game.message=text; game.messageT=t; }
function collect(p){
  p.taken=true; abilities[p.id]=true; chord(); game.flash=1; game.shake=10;
  const msgs={color:'VÄRLDEN MINNS FÄRG',double:'DUBBELHOPP — SPACE I LUFTEN',grapple:'TRÅD — Q MOT LJUSPUNKTER',dash:'PULS — SHIFT FÖR DASH',phase:'SEENDE — DOLDA VÄGAR ÄR SYNLIGA',realm:'SKIFT — E BYTER MELLAN TVÅ VÄRLDLAGER',glide:'VIND — HÅLL JUMP FÖR ATT GLIDA',focus:'LINS — SKOTTEN BLIR STARKARE',resonance:'KÄRNA — DASH KROSSAR FIENTLIGA SKOTT'};
  setMessage(msgs[p.id],4.2); save();
}

function rectsOverlap(a,b){ return a.x<a.x+a.w && a.x+b.w>b.x; }
function hit(a,b){return a.x < b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;}

function damage(srcX){
  if(player.inv>0) return;
  player.hp--; player.inv=1.15; player.vy=-230; player.vx=(player.x<srcX?-1:1)*220; game.shake=9; beep(90,.18,'sawtooth',.05,-30);
  if(player.hp<=0){ game.deaths++; resetPlayer(); setMessage('LINJEN BÖRJAR OM HÄR',1.8); }
}

function update(dt){
  game.time+=dt; game.flash=Math.max(0,game.flash-dt*1.8); game.shake=Math.max(0,game.shake-dt*18); game.messageT=Math.max(0,game.messageT-dt);
  if(pressed.has('KeyM')) muted=!muted;

  if(game.screen==='title'){
    if(pressed.has('Enter')||pressed.has('Space')||pressed.has('ArrowRight')){ game.screen='play'; beep(220,.12,'sine',.03,120); }
    pressed.clear(); return;
  }
  if(game.screen==='end'){
    game.endTimer+=dt;
    if(pressed.has('Enter')){ localStorage.removeItem(SAVE); location.reload(); }
    pressed.clear(); return;
  }

  if(pressed.has('KeyR')) resetPlayer();
  const left=keys.has('ArrowLeft')||keys.has('KeyA');
  const right=keys.has('ArrowRight')||keys.has('KeyD');
  const jump=pressed.has('Space')||pressed.has('ArrowUp')||pressed.has('KeyW');
  const dash=pressed.has('ShiftLeft')||pressed.has('ShiftRight');
  const hook=pressed.has('KeyQ');
  const shoot=pressed.has('KeyF');
  const realmShift=pressed.has('KeyE');

  if(realmShift && abilities.realm){ game.realm=!game.realm; game.flash=.65; game.shake=5; beep(game.realm?680:320,.16,'sine',.025,game.realm?-140:180); setMessage(game.realm?'SKIKT: LJUS':'SKIKT: SKUGGA',1.1); save(); }

  player.inv=Math.max(0,player.inv-dt); player.dashCD=Math.max(0,player.dashCD-dt); player.shotCD=Math.max(0,player.shotCD-dt);

  if(player.dashT>0){
    player.dashT-=dt; player.vx=player.face*520; player.vy*=.82;
  }else{
    const accel=player.onGround?900:560;
    if(left){player.vx-=accel*dt; player.face=-1;}
    if(right){player.vx+=accel*dt; player.face=1;}
    if(!left&&!right) player.vx*=Math.pow(player.onGround?.0006:.08,dt);
    player.vx=clamp(player.vx,-220,220);
  }

  if(jump){
    if(player.onGround){player.vy=-385; player.onGround=false; player.jumps=1; beep(300,.06,'square',.018,80);}
    else if(abilities.double && player.jumps<2){player.vy=-360; player.jumps=2; beep(470,.07,'triangle',.02,100); for(let i=0;i<8;i++) particles.push(particle(player.x+12,player.y+30));}
  }
  if(dash && abilities.dash && player.dashCD<=0){ player.dashT=.18; player.dashCD=.65; player.vx=player.face*520; beep(120,.12,'sawtooth',.025,500); for(let i=0;i<12;i++) particles.push(particle(player.x+12,player.y+18)); }

  if(shoot && abilities.color && player.shotCD<=0){
    player.shotCD=.22; shots.push({x:player.x+(player.face>0?player.w+2:-4),y:player.y+15,vx:player.face*(abilities.focus?620:540),life:1.2,damage:abilities.focus?2:1,size:abilities.focus?7:5}); beep(520,.045,'square',.014,120);
  }

  if(hook && abilities.grapple){
    if(player.grapple){ player.grapple=null; beep(180,.05,'square',.02,-40); }
    else{
      let best=null,bd=310;
      for(const a of anchors){ const d=dist(player.x+12,player.y+10,a.x,a.y); if(d<bd){bd=d;best=a;} }
      if(best){ player.grapple={x:best.x,y:best.y,len:bd*.82}; beep(600,.07,'triangle',.02,-180); }
    }
  }

  // gravity, gliding and wind columns
  let gravity=900;
  if(abilities.glide && !player.onGround && keys.has('Space') && player.vy>70){ gravity=250; player.vy=Math.min(player.vy,155); }
  for(const z of windZones){
    if(player.x+player.w>z.x && player.x<z.x+z.w && player.y+player.h>z.y && player.y<z.y+z.h){
      gravity=380; player.vy-=z.force*dt;
      if(Math.random()<dt*12) particles.push(particle(player.x+rand(0,player.w),player.y+player.h));
    }
  }
  player.vy+=gravity*dt;
  if(player.grapple){
    const px=player.x+12,py=player.y+12; const dx=player.grapple.x-px,dy=player.grapple.y-py; const d=Math.hypot(dx,dy)||1;
    if(d>player.grapple.len){ const pull=(d-player.grapple.len)*14; player.vx+=dx/d*pull*dt; player.vy+=dy/d*pull*dt; }
    if(d>390) player.grapple=null;
  }

  player.x+=player.vx*dt; player.y+=player.vy*dt;
  player.onGround=false;
  const baseColliders=abilities.phase?[...platforms,...hiddenPlatforms]:platforms;
  const activeRealm=abilities.realm?realmPlatforms.filter(r=>r.state===game.realm):[];
  const colliders=[...baseColliders,...activeRealm];
  for(const p of colliders){
    if(player.x+player.w>p.x && player.x<p.x+p.w && player.y+player.h>p.y && player.y+player.h<p.y+Math.max(30,Math.abs(player.vy*dt)+24) && player.vy>=0){
      player.y=p.y-player.h; player.vy=0; player.onGround=true; player.jumps=0;
    }
  }
  player.x=clamp(player.x,0,WORLD_WIDTH-player.w);
  if(player.y>H()+300 || player.y>720){ game.deaths++; resetPlayer(); }

  for(const s of spikes){ if(hit(player,s)) damage(s.x+s.w/2); }
  for(const p of pickups){ if(!p.taken && dist(player.x+12,player.y+17,p.x,p.y)<34) collect(p); }
  for(const cp of checkpoints){ if(player.x>cp && game.checkpoint<cp){game.checkpoint=cp; save(); setMessage('CHECKPOINT',1.2); beep(760,.06,'sine',.015,80);} }

  // Phase-återbesök: portalen skickar dig tillbaka till en plats som nu går att läsa på nytt.
  if(abilities.phase && !abilities.echo && hit(player,echoPortal)){
    player.x=4235; player.y=groundY-100; player.vx=0; player.vy=-80; player.grapple=null;
    setMessage('NÅGOT GAMMALT HAR BLIVIT SYNLIGT',3.4); beep(330,.25,'sine',.025,280); game.flash=1;
  }
  if(abilities.phase && !abilities.echo && dist(player.x+12,player.y+17,echoShard.x,echoShard.y)<32){
    abilities.echo=true; echoShard.taken=true; save(); chord(); game.flash=1; setMessage('EKO-MINNET — DU KAN GÅ VIDARE',3.5);
    player.x=6470; player.y=groundY-90; player.vx=120; player.vy=-80; game.checkpoint=6500;
  }
  if(!abilities.echo && player.x>7000){ player.x=7000; player.vx=Math.min(0,player.vx); if(game.messageT<.3)setMessage('LINJEN SAKNAR ETT MINNE',1.8); }

  // enemies
  for(const e of enemies){
    if(e.dead) continue; e.t+=dt;
    if(e.type==='flyer' || e.type==='wisp'){
      e.y=(e.type==='wisp'?270:300)+Math.sin(e.t*(e.type==='wisp'?3.1:2.2))*55;
      e.x=e.home+Math.sin(e.t*(e.type==='wisp'?1.2:.8))*90;
    } else if(e.type==='sentinel'){
      e.x=e.home; e.y=groundY-145+Math.sin(e.t*1.7)*12;
      e.fire=(e.fire??rand(.2,1.2))-dt;
      if(e.fire<=0 && Math.abs(player.x-e.x)<560){
        e.fire=1.7; const dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy)||1;
        bullets.push({x:e.x+12,y:e.y+12,vx:dx/d*185,vy:dy/d*185,r:5,life:4});
        beep(170,.05,'triangle',.01,80);
      }
    } else {
      const speed=e.type==='brute'?1:.0;
      e.x+=e.vx*speed*dt; if(Math.abs(e.x-e.home)>90) e.vx*=-1;
      e.y=groundY-e.h+(e.type==='brute'?0:Math.sin(e.t*5)*2);
    }
    if(hit(player,e)){
      if(player.dashT>0){e.hp--; e.x+=player.face*35; game.shake=5; beep(130,.05,'square',.02,100); if(e.hp<=0){e.dead=true;for(let i=0;i<12;i++)particles.push(particle(e.x,e.y));}}
      else if(player.vy>120 && player.y+player.h-e.y<18){e.hp--; player.vy=-250; if(e.hp<=0)e.dead=true; beep(180,.05,'square',.02,120);}
      else damage(e.x);
    }
  }

  // player shots
  for(const s of shots){
    s.x+=s.vx*dt;
    s.life-=dt;
    for(const e of enemies){
      if(e.dead) continue;
      if(hit({x:s.x-4,y:s.y-2,w:8,h:4},e)){
        e.hp-=s.damage||1;
        s.dead=true;
        beep(160,.04,'square',.012,80);
        if(e.hp<=0){
          e.dead=true;
          for(let i=0;i<9;i++) particles.push(particle(e.x,e.y));
        }
        break;
      }
    }
  }

  // boss
  if(!boss.dead && player.x>7100){
    boss.t+=dt; boss.y=groundY-boss.h+Math.sin(boss.t*2)*6; boss.x=7520+Math.sin(boss.t*.7)*120;
    boss.shot-=dt;
    if(boss.shot<=0){boss.shot=1.15; const dx=(player.x-boss.x),dy=(player.y-boss.y),d=Math.hypot(dx,dy)||1; bullets.push({x:boss.x+30,y:boss.y+20,vx:dx/d*250,vy:dy/d*250,r:6}); beep(90,.08,'sawtooth',.012,60);}
    for(const s of shots){
      if(!s.dead && hit({x:s.x-4,y:s.y-2,w:8,h:4},boss) && abilities.echo){ boss.hp-=s.damage||1; s.dead=true; game.shake=6; beep(110,.06,'square',.02,140); if(boss.hp<=0){boss.dead=true; game.bossDead=true; save(); chord(); setMessage('LINJEN ÄR DIN NU',4);} }
    }
    if(hit(player,boss)){
      if(player.dashT>0 && abilities.echo){boss.hp--; player.vx*=-.4; game.shake=12; beep(80,.1,'square',.035,180); if(boss.hp<=0){boss.dead=true; game.bossDead=true; save(); chord(); setMessage('LINJEN ÄR DIN NU',4);}}
      else damage(boss.x);
    }
  }
  for(let i=shots.length-1;i>=0;i--) if(shots[i].dead||shots[i].life<=0) shots.splice(i,1);
  for(const b of bullets){ b.x+=b.vx*dt;b.y+=b.vy*dt; b.life=(b.life??5)-dt; if(hit(player,{x:b.x-b.r,y:b.y-b.r,w:b.r*2,h:b.r*2})){ if(abilities.resonance && player.dashT>0){b.dead=true;game.shake=3;beep(760,.035,'triangle',.01,-120);} else {damage(b.x);b.dead=true;} } }
  for(let i=bullets.length-1;i>=0;i--) if(bullets[i].dead||bullets[i].life<=0||bullets[i].x<0||bullets[i].x>WORLD_WIDTH) bullets.splice(i,1);

  if(boss.dead && player.x>7780 && !game.world2Entered){
    game.world2Entered=true; game.checkpoint=Math.max(game.checkpoint,8100); save();
    setMessage('VÄRLD 2 — HORISONTEN',4.2); game.flash=1; chord();
  }

  // World 2 boss: a shifting mirror that can only be damaged in the matching world layer.
  if(!boss2.dead && player.x>14700){
    boss2.t+=dt; boss2.phase=Math.floor(boss2.t/3.2)%2===1;
    boss2.y=groundY-boss2.h-12+Math.sin(boss2.t*1.5)*18;
    boss2.x=15310+Math.sin(boss2.t*.55)*115;
    boss2.shot-=dt;
    if(boss2.shot<=0){
      boss2.shot=.85;
      for(let a=-1;a<=1;a++){
        const dx=player.x-boss2.x,dy=player.y-boss2.y,d=Math.hypot(dx,dy)||1;
        const ang=Math.atan2(dy,dx)+a*.16;
        bullets.push({x:boss2.x+43,y:boss2.y+40,vx:Math.cos(ang)*230,vy:Math.sin(ang)*230,r:5,life:5});
      }
      beep(105,.08,'sawtooth',.015,90);
    }
    const vulnerable=!abilities.realm || game.realm===boss2.phase;
    for(const s of shots){
      if(!s.dead && hit({x:s.x-4,y:s.y-2,w:8,h:4},boss2)){
        s.dead=true;
        if(vulnerable){boss2.hp-=s.damage||1;game.shake=7;beep(115,.06,'square',.025,160);}
        else{game.flash=.18;beep(760,.04,'triangle',.012,-180);}
        if(boss2.hp<=0){boss2.dead=true;game.boss2Dead=true;save();chord();setMessage('VÄRLDEN HAR FÅTT DJUP',4.5);}
      }
    }
    if(hit(player,boss2)){
      if(player.dashT>0 && vulnerable){boss2.hp--;player.vx*=-.5;game.shake=10;if(boss2.hp<=0){boss2.dead=true;game.boss2Dead=true;save();chord();}}
      else damage(boss2.x);
    }
  }
  if(!boss2.dead && player.x>15720){ player.x=15720; player.vx=Math.min(0,player.vx); if(game.messageT<.25)setMessage('SPEGELVAKTEN HÅLLER LINJEN',1.5); }
  if(boss2.dead && player.x>15720 && !game.world3Entered){game.world3Entered=true;game.checkpoint=Math.max(game.checkpoint,16050);save();setMessage('VÄRLD 3 — STORMBRANTEN',4.2);game.flash=1;chord();}

  // World 3 boss — storm heart. Wind and movement matter more than standing still.
  if(!boss3.dead && player.x>20250){
    boss3.t+=dt; boss3.x=20930+Math.sin(boss3.t*.8)*145; boss3.y=groundY-boss3.h-25+Math.sin(boss3.t*1.9)*35; boss3.shot-=dt;
    if(boss3.shot<=0){boss3.shot=.72;for(let a=-2;a<=2;a++){const ang=Math.atan2(player.y-boss3.y,player.x-boss3.x)+a*.13;bullets.push({x:boss3.x+41,y:boss3.y+38,vx:Math.cos(ang)*235,vy:Math.sin(ang)*235,r:4.5,life:5});}beep(95,.07,'sawtooth',.014,100);}
    for(const sh of shots){if(!sh.dead&&hit({x:sh.x-(sh.size||5),y:sh.y-3,w:(sh.size||5)*2,h:6},boss3)){boss3.hp-=sh.damage||1;sh.dead=true;game.shake=6;beep(130,.05,'square',.02,140);if(boss3.hp<=0){boss3.dead=true;game.boss3Dead=true;save();chord();setMessage('STORMEN ÖPPNAR SIG',4);}}}
    if(hit(player,boss3)){if(player.dashT>0){boss3.hp--;player.vx*=-.45;game.shake=9;if(boss3.hp<=0){boss3.dead=true;game.boss3Dead=true;save();chord();}}else damage(boss3.x);}
  }
  if(!boss3.dead && player.x>21280){player.x=21280;player.vx=Math.min(0,player.vx);if(game.messageT<.25)setMessage('STORMHJÄRTAT BLOCKERAR PASSAGEN',1.5);}
  if(boss3.dead && player.x>21320 && !game.world4Entered){game.world4Entered=true;game.checkpoint=Math.max(game.checkpoint,21450);save();setMessage('VÄRLD 4 — DEN LEVANDE STADEN',4.2);game.flash=1;chord();}

  // World 4 boss — city core. Alternates shield layers and rewards realm shifting.
  if(!boss4.dead && player.x>25800){
    boss4.t+=dt;const phase=Math.floor(boss4.t/2.6)%2===1;boss4.x=26610+Math.sin(boss4.t*.65)*120;boss4.y=groundY-boss4.h-16+Math.sin(boss4.t*1.4)*16;boss4.shot-=dt;
    if(boss4.shot<=0){boss4.shot=.64;for(let a=-1;a<=1;a++){const ang=Math.atan2(player.y-boss4.y,player.x-boss4.x)+a*.21;bullets.push({x:boss4.x+46,y:boss4.y+42,vx:Math.cos(ang)*270,vy:Math.sin(ang)*270,r:5.5,life:5});}beep(120,.06,'square',.012,80);}
    const vulnerable=!abilities.realm||game.realm===phase;
    for(const sh of shots){if(!sh.dead&&hit({x:sh.x-(sh.size||5),y:sh.y-3,w:(sh.size||5)*2,h:6},boss4)){sh.dead=true;if(vulnerable){boss4.hp-=sh.damage||1;game.shake=7;beep(125,.05,'square',.02,180);}else beep(820,.04,'triangle',.012,-180);if(boss4.hp<=0){boss4.dead=true;game.boss4Dead=true;save();chord();setMessage('STADEN SLÄCKER SITT FÖRSVAR',4);}}}
    if(hit(player,boss4)){if(player.dashT>0&&vulnerable){boss4.hp--;player.vx*=-.5;game.shake=10;if(boss4.hp<=0){boss4.dead=true;game.boss4Dead=true;save();chord();}}else damage(boss4.x);}
  }
  if(!boss4.dead && player.x>26920){player.x=26920;player.vx=Math.min(0,player.vx);if(game.messageT<.25)setMessage('STADSKÄRNAN LÅSER UTGÅNGEN',1.5);}
  if(boss4.dead && player.x>26950 && !game.world5Entered){game.world5Entered=true;game.checkpoint=Math.max(game.checkpoint,27100);save();setMessage('VÄRLD 5 — DEN KOSMISKA TRÄDGÅRDEN',4.2);game.flash=1;chord();}

  // Final boss — combines shifting, projectiles and movement. Resonance makes the arena breathe.
  if(!boss5.dead && player.x>32350){
    boss5.t+=dt;boss5.phase=Math.floor(boss5.t/2.3)%2===1;boss5.x=33100+Math.sin(boss5.t*.52)*150;boss5.y=groundY-boss5.h-40+Math.sin(boss5.t*1.35)*42;boss5.shot-=dt;
    if(boss5.shot<=0){boss5.shot=.52;for(let a=-2;a<=2;a++){const base=Math.atan2(player.y-boss5.y,player.x-boss5.x);const ang=base+a*.18+Math.sin(boss5.t)*.08;bullets.push({x:boss5.x+54,y:boss5.y+50,vx:Math.cos(ang)*285,vy:Math.sin(ang)*285,r:5+(Math.abs(a)===2),life:5});}beep(82,.075,'sawtooth',.016,120);}
    const vulnerable=!abilities.realm||game.realm===boss5.phase;
    for(const sh of shots){if(!sh.dead&&hit({x:sh.x-(sh.size||5),y:sh.y-3,w:(sh.size||5)*2,h:6},boss5)){sh.dead=true;if(vulnerable){boss5.hp-=sh.damage||1;game.shake=8;beep(105,.055,'square',.025,190);}else beep(900,.035,'triangle',.012,-220);if(boss5.hp<=0){boss5.dead=true;game.boss5Dead=true;save();chord();setMessage('LINJEN HAR BLIVIT EN VÄRLD',5);}}}
    if(hit(player,boss5)){if(player.dashT>0&&vulnerable){boss5.hp-=abilities.resonance?2:1;player.vx*=-.5;game.shake=12;if(boss5.hp<=0){boss5.dead=true;game.boss5Dead=true;save();chord();}}else damage(boss5.x);}
  }
  if(!boss5.dead && player.x>33750){player.x=33750;player.vx=Math.min(0,player.vx);}
  if(boss5.dead && player.x>33820){ game.screen='end'; game.endTimer=0; beep(220,.5,'sine',.02,330); }

  player.trail.push({x:player.x,y:player.y,t:.35}); if(player.trail.length>24)player.trail.shift();
  for(const t of player.trail)t.t-=dt;
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.t-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=220*dt;if(p.t<=0)particles.splice(i,1);}

  const nextWorld=worldIndex(player.x);
  if(nextWorld!==game.world){
    game.prevWorld=game.world; game.world=nextWorld;
    const names={6:'HORISONTEN',7:'DEN LEVANDE SKOGEN',8:'SPEGELVATTNET',9:'RUINERNA',10:'NATTHIMLEN',11:'STORMBRANTEN',12:'VINDPASSAGEN',13:'ÅSKKAMMEN',14:'STORMHJÄRTAT',15:'DEN LEVANDE STADEN',16:'GRÖNA KVARTERET',17:'LJUSARKADEN',18:'STADSKÄRNAN',19:'DEN KOSMISKA TRÄDGÅRDEN',20:'KRISTALLFÄLTET',21:'RINGHAVET',22:'DEN SISTA LINJEN'};
    if(names[nextWorld] && game.messageT<.4) setMessage(names[nextWorld],2.2);
  }
  const targetCam=clamp(player.x-W()*.35,0,WORLD_WIDTH-W()); game.cameraX=lerp(game.cameraX,targetCam,1-Math.pow(.0008,dt));
  pressed.clear();
}

const particles=[];
function particle(x,y){return{x,y,vx:rand(-120,120),vy:rand(-180,20),t:rand(.3,.8),r:rand(1,4)}}

function palette(i){
  const list=[
    {bg:'#ffffff',line:'#111111',accent:'#111111',accent2:'#777777',text:'#111111',fog:'rgba(255,255,255,.8)'},
    {bg:'#f7f2e8',line:'#222222',accent:'#ef476f',accent2:'#118ab2',text:'#1c1b1a',fog:'rgba(247,242,232,.7)'},
    {bg:'#102019',line:'#dbe8c9',accent:'#91c788',accent2:'#d4a373',text:'#edf6e5',fog:'rgba(16,32,25,.55)'},
    {bg:'#171225',line:'#f2ecff',accent:'#9b5de5',accent2:'#00f5d4',text:'#ffffff',fog:'rgba(23,18,37,.5)'},
    {bg:'#07131f',line:'#baf2ff',accent:'#00f5d4',accent2:'#fee440',text:'#eaffff',fog:'rgba(7,19,31,.42)'},
    {bg:'#09050e',line:'#ffffff',accent:'#ff4d8d',accent2:'#00e5ff',text:'#ffffff',fog:'rgba(9,5,14,.32)'},
    {bg:'#dcecf2',line:'#26343a',accent:'#e39b52',accent2:'#4c8f72',text:'#203038',fog:'rgba(220,236,242,.35)'},
    {bg:'#8fb8a6',line:'#19362c',accent:'#f0bd67',accent2:'#5a8662',text:'#102b23',fog:'rgba(143,184,166,.32)'},
    {bg:'#48657a',line:'#e8f0ef',accent:'#f3b76a',accent2:'#78d6cf',text:'#f6fbfa',fog:'rgba(72,101,122,.28)'},
    {bg:'#392f48',line:'#f4dfcb',accent:'#e77c62',accent2:'#93c9a7',text:'#fff3e9',fog:'rgba(57,47,72,.25)'},
    {bg:'#0b1021',line:'#e9f4ff',accent:'#ffb65c',accent2:'#77e6d7',text:'#f4f8ff',fog:'rgba(11,16,33,.2)'},
    {bg:'#8296a7',line:'#f5fbff',accent:'#ffd166',accent2:'#70d6ff',text:'#ffffff',fog:'rgba(70,84,98,.24)'},
    {bg:'#607888',line:'#f7fbff',accent:'#f7b267',accent2:'#66d9ef',text:'#ffffff',fog:'rgba(46,61,72,.23)'},
    {bg:'#455a6d',line:'#f8fbff',accent:'#ff9f6e',accent2:'#71e5ff',text:'#ffffff',fog:'rgba(36,48,62,.22)'},
    {bg:'#2d3f55',line:'#ffffff',accent:'#ffd166',accent2:'#8cecff',text:'#ffffff',fog:'rgba(29,42,58,.2)'},
    {bg:'#28313a',line:'#f4f5ed',accent:'#f6bd60',accent2:'#84dcc6',text:'#ffffff',fog:'rgba(28,34,39,.2)'},
    {bg:'#202c32',line:'#f4f5ed',accent:'#f28f3b',accent2:'#62d8c8',text:'#ffffff',fog:'rgba(23,31,35,.19)'},
    {bg:'#1c252d',line:'#f6f7ef',accent:'#ffb703',accent2:'#5eead4',text:'#ffffff',fog:'rgba(19,25,31,.17)'},
    {bg:'#151d27',line:'#ffffff',accent:'#ff9f1c',accent2:'#72efdd',text:'#ffffff',fog:'rgba(13,18,26,.16)'},
    {bg:'#100b24',line:'#f7f4ff',accent:'#ff7ab6',accent2:'#72f1b8',text:'#ffffff',fog:'rgba(16,11,36,.16)'},
    {bg:'#0b1028',line:'#f8f7ff',accent:'#c77dff',accent2:'#64dfdf',text:'#ffffff',fog:'rgba(11,16,40,.14)'},
    {bg:'#090d22',line:'#ffffff',accent:'#ff8fab',accent2:'#80ffdb',text:'#ffffff',fog:'rgba(9,13,34,.13)'},
    {bg:'#050713',line:'#ffffff',accent:'#ffd166',accent2:'#7df9ff',text:'#ffffff',fog:'rgba(5,7,19,.1)'}
  ];
  return list[clamp(i,0,list.length-1)];
}

function drawBackground(p){
  ctx.fillStyle=p.bg;ctx.fillRect(0,0,W(),H());
  const cam=game.cameraX;
  if(game.world===0){
    ctx.strokeStyle='rgba(0,0,0,.06)';ctx.lineWidth=1; for(let x=-cam%80;x<W();x+=80){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H());ctx.stroke();}
  }
  if(game.world===1){
    for(let i=0;i<20;i++){ const x=((i*211-cam*.12)% (W()+180))-80, y=80+(i*73)%280; ctx.globalAlpha=.12;ctx.fillStyle=i%2?p.accent:p.accent2;ctx.beginPath();ctx.arc(x,y,12+(i%5)*5,0,Math.PI*2);ctx.fill(); } ctx.globalAlpha=1;
  }
  if(game.world===2){
    for(let i=0;i<24;i++){const x=((i*137-cam*.28)% (W()+180))-80;const h=90+(i*47)%190;ctx.fillStyle='rgba(70,100,75,.22)';ctx.fillRect(x,H()-h-80,18,h);ctx.beginPath();ctx.arc(x+9,H()-h-90,35+(i%4)*9,0,Math.PI*2);ctx.fill();}
  }
  if(game.world===3){
    ctx.strokeStyle='rgba(155,93,229,.15)'; for(let y=60;y<H();y+=55){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W(),y+Math.sin(game.time+y)*6);ctx.stroke();}
  }
  if(game.world===4){
    for(let i=0;i<50;i++){const x=(i*97-cam*.5)%W(), y=(i*53)%H();ctx.globalAlpha=.18+.1*Math.sin(game.time*2+i);ctx.fillStyle=i%3?p.accent:p.accent2;ctx.fillRect(x,y,2,2);}ctx.globalAlpha=1;
  }
  if(game.world===5){
    for(let i=0;i<8;i++){ctx.strokeStyle=i%2?'rgba(255,77,141,.08)':'rgba(0,229,255,.08)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,(i+1)*H()/9+Math.sin(game.time+i)*12);ctx.bezierCurveTo(W()*.3,40+i*60,W()*.7,H()-50-i*40,W(),(i+1)*H()/9);ctx.stroke();}
  }
  if(game.world>=6){
    const g=ctx.createLinearGradient(0,0,0,H());
    const tops=['#d9edf2','#89b9aa','#48677c','#3d3049','#090d1c'];
    const bots=['#f4dfbf','#c9d29c','#92a6a0','#ba786b','#1d2643'];
    const wi=clamp(game.world-6,0,4); g.addColorStop(0,tops[wi]); g.addColorStop(1,bots[wi]);
    ctx.fillStyle=g;ctx.fillRect(0,0,W(),H());
    // sun / moon
    ctx.globalAlpha=.75;ctx.fillStyle=game.world===10?'#d7e6ff':'#ffe0a2';ctx.beginPath();ctx.arc(W()*.78-cam*.012,90+(game.world-6)*9,34+(game.world-6)*4,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    // far mountains, multiple parallax layers
    for(let layer=0;layer<3;layer++){
      ctx.fillStyle=game.world===10?`rgba(50,62,100,${.18+layer*.08})`:`rgba(45,73,66,${.12+layer*.08})`;
      ctx.beginPath();ctx.moveTo(0,H());
      for(let x=-120;x<=W()+160;x+=150){const wx=x+cam*(.035+layer*.025);const y=H()*.55-layer*25-55*Math.sin(wx*.004+layer);ctx.lineTo(x,y);}ctx.lineTo(W(),H());ctx.closePath();ctx.fill();
    }
    // drifting fog bands
    for(let i=0;i<4;i++){ctx.globalAlpha=.05+.025*i;ctx.fillStyle='#ffffff';const y=H()*.48+i*52+Math.sin(game.time*.25+i)*10;ctx.fillRect(0,y,W(),30+i*8);}ctx.globalAlpha=1;
    if(game.world>=7){
      // distant trees add real depth as the game progresses
      for(let i=0;i<26;i++){const x=((i*143-cam*(.12+(i%3)*.03))%(W()+240))-120;const base=H()*.72;const h=80+(i%6)*18;ctx.globalAlpha=.11+(i%3)*.035;ctx.fillStyle=game.world>=9?'#211f2a':'#23483b';ctx.fillRect(x-4,base-h,8,h);ctx.beginPath();ctx.arc(x,base-h,25+(i%4)*6,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
    }
    if(game.world>=8){
      // reflective water / haze
      ctx.globalAlpha=.14;ctx.fillStyle='#b9eff2';ctx.fillRect(0,H()*.74,W(),H()*.26);ctx.strokeStyle='rgba(255,255,255,.22)';
      for(let y=H()*.76;y<H();y+=18){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W(),y+Math.sin(game.time+y)*2);ctx.stroke();}ctx.globalAlpha=1;
    }
    if(game.world===10){
      for(let i=0;i<75;i++){const x=(i*97+13)%W(),y=(i*53+17)%(H()*.55);ctx.globalAlpha=.25+.45*((i%7)/7);ctx.fillStyle='#fff';ctx.fillRect(x,y,1+(i%3===0),1+(i%3===0));}ctx.globalAlpha=1;
      const aur=ctx.createLinearGradient(0,40,W(),260);aur.addColorStop(0,'rgba(74,255,188,0)');aur.addColorStop(.45,'rgba(74,255,188,.12)');aur.addColorStop(.75,'rgba(112,120,255,.12)');aur.addColorStop(1,'rgba(112,120,255,0)');ctx.fillStyle=aur;ctx.fillRect(0,30,W(),250);
    }
  }
  if(game.world>=11 && game.world<=14){
    const stage=game.world-11;
    const sky=ctx.createLinearGradient(0,0,0,H());sky.addColorStop(0,['#8296a7','#607888','#455a6d','#2d3f55'][stage]);sky.addColorStop(1,['#d9d0bd','#bfc7c1','#929da1','#606979'][stage]);ctx.fillStyle=sky;ctx.fillRect(0,0,W(),H());
    for(let layer=0;layer<4;layer++){ctx.fillStyle=`rgba(24,37,48,${.08+layer*.055})`;ctx.beginPath();ctx.moveTo(0,H());for(let x=-100;x<W()+140;x+=120){const wx=x+cam*(.035+layer*.027);const y=H()*.61-layer*28-50*Math.sin(wx*.005+layer*.9)-18*Math.sin(wx*.012);ctx.lineTo(x,y);}ctx.lineTo(W(),H());ctx.closePath();ctx.fill();}
    for(let i=0;i<6+stage*2;i++){const y=55+i*42+Math.sin(game.time*.18+i)*10;ctx.globalAlpha=.055+.015*i;ctx.fillStyle='#e9f2f5';ctx.beginPath();ctx.ellipse(((i*211-cam*.09)%(W()+360))-180,y,150+(i%3)*45,25+(i%2)*12,0,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
    if(stage>=1){ctx.strokeStyle=`rgba(220,240,250,${.12+stage*.035})`;ctx.lineWidth=1;for(let i=0;i<55;i++){const x=(i*67-cam*.55+game.time*180)%(W()+120)-60;const y=(i*41+game.time*300)%(H()+100)-50;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-9,y+24);ctx.stroke();}}
    if(stage>=2 && Math.sin(game.time*.7)>0.985){ctx.globalAlpha=.12;ctx.fillStyle='#eafaff';ctx.fillRect(0,0,W(),H());ctx.globalAlpha=1;}
  }
  if(game.world>=15 && game.world<=18){
    const stage=game.world-15;const g=ctx.createLinearGradient(0,0,0,H());g.addColorStop(0,['#36444c','#2c3940','#242f37','#1b2530'][stage]);g.addColorStop(1,['#8b775c','#655f50','#4a5050','#303a43'][stage]);ctx.fillStyle=g;ctx.fillRect(0,0,W(),H());
    for(let layer=0;layer<4;layer++){const speed=.025+layer*.024;ctx.fillStyle=`rgba(10,18,22,${.12+layer*.075})`;for(let i=0;i<18;i++){const x=((i*179-cam*speed)%(W()+260))-130;const h=85+((i*71+layer*53)%230);const w=42+((i*37)%62);ctx.fillRect(x,H()*.73-h,w,h);if(layer>1){ctx.globalAlpha=.18;ctx.fillStyle=stage>1?p.accent2:'#e7c98f';for(let yy=H()*.73-h+16;yy<H()*.71;yy+=24)ctx.fillRect(x+8,yy,3,6);ctx.globalAlpha=1;ctx.fillStyle=`rgba(10,18,22,${.12+layer*.075})`;}}}
    for(let i=0;i<14+stage*5;i++){const x=((i*127-cam*.22)%(W()+160))-80;const y=90+(i*83)%(H()*.55);ctx.globalAlpha=.08+.04*Math.sin(game.time+i);ctx.fillStyle=i%3===0?p.accent2:p.accent;ctx.beginPath();ctx.arc(x,y,1.5+(i%4)*.5,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
    if(stage>=2){ctx.strokeStyle='rgba(110,238,206,.12)';ctx.lineWidth=2;for(let i=0;i<7;i++){const x=i*190-(cam*.14)%190;ctx.beginPath();ctx.moveTo(x,0);ctx.bezierCurveTo(x+80,H()*.25,x-50,H()*.5,x+20,H()*.72);ctx.stroke();}}
  }
  if(game.world>=19){
    const stage=game.world-19;const g=ctx.createRadialGradient(W()*.72,H()*.18,10,W()*.55,H()*.5,H());g.addColorStop(0,['#2b1748','#1d2450','#17274d','#0b1028'][stage]);g.addColorStop(1,['#09071a','#070a1d','#05091a','#02040d'][stage]);ctx.fillStyle=g;ctx.fillRect(0,0,W(),H());
    ctx.globalAlpha=.3;ctx.fillStyle=stage>=2?'#a7c7ff':'#e3c2ff';ctx.beginPath();ctx.arc(W()*.77-cam*.01,95+stage*7,46+stage*9,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    for(let i=0;i<110+stage*35;i++){const x=(i*83+17)%W(),y=(i*47+29)%(H()*.62);ctx.globalAlpha=.22+.65*((i%9)/9);ctx.fillStyle=i%11===0?p.accent2:'#fff';const r=i%17===0?2:1;ctx.fillRect(x,y,r,r);}ctx.globalAlpha=1;
    for(let layer=0;layer<3;layer++){ctx.globalAlpha=.055+layer*.025;ctx.fillStyle=layer===1?p.accent2:p.accent;ctx.beginPath();ctx.ellipse(W()*.45-cam*(.01+layer*.006),120+layer*75,240+stage*45,42+layer*12,-.18+layer*.14,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
    if(stage>=1){const aur=ctx.createLinearGradient(0,20,W(),280);aur.addColorStop(0,'rgba(100,255,210,0)');aur.addColorStop(.35,'rgba(100,255,210,.08)');aur.addColorStop(.7,'rgba(190,100,255,.10)');aur.addColorStop(1,'rgba(190,100,255,0)');ctx.fillStyle=aur;ctx.fillRect(0,20,W(),270);}
  }

}

function worldToScreen(x,y){return{x:x-game.cameraX,y:y-(groundY-(H()*.72))};}


function drawSecondWorldScenery(p){
  if(player.x<7750) return;
  const left=game.cameraX-180,right=game.cameraX+W()+180;
  // grass, flowers and tiny stones: increasingly dense in later regions
  for(let x=8000;x<15700;x+=42){
    if(x<left||x>right) continue;
    const stage=worldIndex(x); if(stage<6) continue;
    const h=4+((x*13)%12); const sway=Math.sin(game.time*1.7+x*.03)*3;
    ctx.strokeStyle=stage>=9?'rgba(210,214,190,.42)':'rgba(45,95,63,.58)';ctx.lineWidth=1.4;
    ctx.beginPath();ctx.moveTo(x,groundY);ctx.quadraticCurveTo(x+sway,groundY-h*.55,x+sway*.5,groundY-h);ctx.stroke();
    if(stage>=7 && x%168<45){ctx.fillStyle=stage>=9?p.accent:p.accent2;ctx.globalAlpha=.65;ctx.beginPath();ctx.arc(x+3,groundY-h-3,2.2,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
  }
  // hand-placed trees give recognisable silhouettes rather than noise
  const trees=[8460,8790,9130,10380,10760,11390,11840,12670,13280,13780,14380,14920];
  for(const x of trees){if(x<left||x>right)continue;const stage=worldIndex(x);const h=95+((x/10)%55);ctx.fillStyle=stage>=9?'#2a2430':'#36513d';ctx.fillRect(x-7,groundY-h,14,h);ctx.fillStyle=stage>=9?'rgba(96,89,99,.82)':'rgba(73,117,76,.88)';for(let j=0;j<4;j++){ctx.beginPath();ctx.arc(x+(j-1.5)*12,groundY-h+18+(j%2)*9,24+j*3,0,Math.PI*2);ctx.fill();}}
  // rocks and ruins appear later, making the world feel built rather than abstract
  const rocks=[8240,9010,9780,10980,12150,13010,13990,14710];
  for(const x of rocks){if(x<left||x>right)continue;ctx.fillStyle='rgba(61,66,64,.55)';ctx.beginPath();ctx.moveTo(x-18,groundY);ctx.lineTo(x-10,groundY-15);ctx.lineTo(x+7,groundY-22);ctx.lineTo(x+22,groundY);ctx.closePath();ctx.fill();}
  if(player.x>12200){
    for(const x of [12600,13440,14240,15020]){if(x<left||x>right)continue;ctx.strokeStyle='rgba(222,201,176,.5)';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(x-28,groundY);ctx.lineTo(x-28,groundY-100);ctx.quadraticCurveTo(x,groundY-138,x+28,groundY-100);ctx.lineTo(x+28,groundY);ctx.stroke();ctx.lineWidth=2;ctx.strokeStyle='rgba(255,255,255,.12)';ctx.strokeRect(x-34,groundY-112,68,112);}
  }
  // fireflies / motes, animated but deterministic positions
  if(player.x>9000){for(let i=0;i<34;i++){const x=8200+(i*233)%7400;if(x<left||x>right)continue;const y=groundY-55-((i*71)%230)+Math.sin(game.time*1.2+i)*8;ctx.globalAlpha=.25+.35*(.5+.5*Math.sin(game.time*2+i));ctx.fillStyle=p.accent2;ctx.beginPath();ctx.arc(x,y,1.5+(i%3)*.4,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
}


function drawExtendedScenery(p){
  const left=game.cameraX-220,right=game.cameraX+W()+220;
  if(right<15800) return;
  // World 3: readable cliff detail, grass, stones, waterfalls and wind.
  if(right>15800 && left<21450){
    for(let x=15900;x<21400;x+=34){if(x<left||x>right)continue;const h=5+((x*7)%16);ctx.strokeStyle='rgba(215,229,218,.45)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(x,groundY);ctx.quadraticCurveTo(x+Math.sin(game.time*2+x*.04)*4,groundY-h*.55,x+2,groundY-h);ctx.stroke();}
    const pines=[16210,16680,17180,18070,18620,19120,19670,20330,21110];
    for(const x of pines){if(x<left||x>right)continue;const h=90+(x%70);ctx.fillStyle='rgba(31,51,45,.82)';ctx.fillRect(x-5,groundY-h,10,h);for(let j=0;j<4;j++){ctx.beginPath();ctx.moveTo(x,groundY-h-15+j*23);ctx.lineTo(x-28-j*3,groundY-h+32+j*20);ctx.lineTo(x+28+j*3,groundY-h+32+j*20);ctx.closePath();ctx.fill();}}
    for(const x of [16400,17500,18860,20020,20920]){if(x<left||x>right)continue;ctx.fillStyle='rgba(45,50,53,.62)';ctx.beginPath();ctx.moveTo(x-28,groundY);ctx.lineTo(x-16,groundY-25);ctx.lineTo(x+5,groundY-38);ctx.lineTo(x+32,groundY);ctx.closePath();ctx.fill();ctx.strokeStyle='rgba(230,238,240,.16)';ctx.stroke();}
    for(const z of windZones.filter(z=>z.x<21400)){if(z.x+z.w<left||z.x>right)continue;ctx.globalAlpha=.12;ctx.fillStyle=p.accent2;ctx.fillRect(z.x,z.y,z.w,z.h);ctx.globalAlpha=.28;ctx.strokeStyle=p.accent2;for(let y=z.y+20;y<z.y+z.h;y+=38){ctx.beginPath();ctx.moveTo(z.x+20,y);ctx.bezierCurveTo(z.x+z.w*.35,y-15,z.x+z.w*.65,y+15,z.x+z.w-20,y-6);ctx.stroke();}ctx.globalAlpha=1;}
  }
  // World 4: architecture, lit windows, pipes, vines and lamps.
  if(right>21350 && left<27100){
    const towers=[21620,22360,23080,23820,24580,25320,26040,26700];
    for(const x of towers){if(x<left||x>right)continue;const h=120+(x%140);ctx.fillStyle='rgba(22,30,33,.72)';ctx.fillRect(x-26,groundY-h,52,h);ctx.strokeStyle='rgba(205,220,210,.22)';ctx.strokeRect(x-26,groundY-h,52,h);for(let y=groundY-h+20;y<groundY-20;y+=26){ctx.fillStyle=(Math.floor(y/26)+Math.floor(x/100))%3===0?p.accent2:'rgba(245,225,170,.32)';ctx.fillRect(x-15,y,7,10);ctx.fillRect(x+7,y,7,10);}ctx.strokeStyle='rgba(100,230,190,.24)';ctx.beginPath();ctx.moveTo(x-20,groundY-h+10);ctx.bezierCurveTo(x+30,groundY-h*.6,x-40,groundY-h*.25,x+12,groundY);ctx.stroke();}
    for(const x of [21920,22920,24120,25120,26320]){if(x<left||x>right)continue;ctx.strokeStyle='rgba(225,222,205,.35)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,groundY);ctx.lineTo(x,groundY-85);ctx.arc(x,groundY-92,8,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=.22;ctx.fillStyle=p.accent;ctx.beginPath();ctx.arc(x,groundY-92,22,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.lineWidth=1;}
  }
  // World 5: crystalline plants, luminous roots and giant floating forms.
  if(right>26950){
    const crystals=[27320,27890,28420,29110,29740,30420,31080,31720,32340,32960,33520];
    for(const x of crystals){if(x<left||x>right)continue;const h=45+(x%95);ctx.globalAlpha=.75;ctx.fillStyle=(Math.floor(x/100)%2)?p.accent:p.accent2;ctx.beginPath();ctx.moveTo(x-12,groundY);ctx.lineTo(x-7,groundY-h*.65);ctx.lineTo(x,groundY-h);ctx.lineTo(x+9,groundY-h*.55);ctx.lineTo(x+14,groundY);ctx.closePath();ctx.fill();ctx.globalAlpha=.18;ctx.beginPath();ctx.arc(x,groundY-h*.55,30,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
    ctx.strokeStyle='rgba(120,255,220,.18)';for(let x=27000;x<33900;x+=110){if(x<left||x>right)continue;ctx.beginPath();ctx.moveTo(x,groundY);ctx.bezierCurveTo(x+45,groundY-25,x-30,groundY-60,x+15,groundY-90);ctx.stroke();}
    for(const z of windZones.filter(z=>z.x>=27000)){if(z.x+z.w<left||z.x>right)continue;ctx.globalAlpha=.1;ctx.fillStyle=p.accent2;ctx.fillRect(z.x,z.y,z.w,z.h);ctx.globalAlpha=.25;ctx.strokeStyle=p.accent2;for(let y=z.y+20;y<z.y+z.h;y+=40){ctx.beginPath();ctx.moveTo(z.x+18,y);ctx.bezierCurveTo(z.x+z.w*.4,y-18,z.x+z.w*.6,y+18,z.x+z.w-18,y-8);ctx.stroke();}ctx.globalAlpha=1;}
  }
}

function drawWorld(p){
  const gy=H()*.72, offY=gy-groundY;
  ctx.save();ctx.translate(-game.cameraX,offY);

  // main line
  ctx.strokeStyle=p.line;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(0,groundY);ctx.lineTo(WORLD_WIDTH,groundY);ctx.stroke();

  drawSecondWorldScenery(p);
  drawExtendedScenery(p);

  // platforms
  for(const pl of platforms){
    if(pl.w>500 && pl.y===groundY){continue;}
    let fill=game.world<2?'rgba(0,0,0,.08)':(game.world===2?'rgba(125,170,120,.25)':'rgba(255,255,255,.09)');
    if(pl.x>=15800&&pl.x<21400)fill='rgba(42,52,57,.62)';
    if(pl.x>=21400&&pl.x<27000)fill='rgba(28,38,42,.72)';
    if(pl.x>=27000)fill='rgba(55,43,84,.62)';
    ctx.fillStyle=fill;ctx.fillRect(pl.x,pl.y,pl.w,pl.h);
    ctx.strokeStyle=p.line;ctx.lineWidth=2.4;ctx.strokeRect(pl.x,pl.y,pl.w,Math.min(pl.h,20));
    ctx.globalAlpha=.22;ctx.fillStyle=p.accent2;ctx.fillRect(pl.x,pl.y,pl.w,3);ctx.globalAlpha=1;
    if(pl.x>=7880){ctx.globalAlpha=.16;ctx.strokeStyle=p.accent2;for(let tx=pl.x+12;tx<pl.x+pl.w-8;tx+=28){ctx.beginPath();ctx.moveTo(tx,pl.y+4);ctx.lineTo(tx+10,pl.y+13);ctx.stroke();}ctx.globalAlpha=1;}
    if(pl.x>=21400&&pl.x<27000){ctx.globalAlpha=.12;ctx.strokeStyle='#ffffff';for(let yy=pl.y+22;yy<pl.y+pl.h;yy+=18){ctx.beginPath();ctx.moveTo(pl.x,yy);ctx.lineTo(pl.x+pl.w,yy);ctx.stroke();}ctx.globalAlpha=1;}
  }
  if(abilities.phase){
    ctx.setLineDash([7,7]);ctx.strokeStyle=p.accent2;ctx.lineWidth=2;
    for(const pl of hiddenPlatforms){ctx.globalAlpha=.75+.2*Math.sin(game.time*4+pl.x);ctx.strokeRect(pl.x,pl.y,pl.w,pl.h);}ctx.setLineDash([]);ctx.globalAlpha=1;
  }
  if(abilities.realm){
    for(const pl of realmPlatforms){
      const active=pl.state===game.realm;ctx.globalAlpha=active?.9:.14;ctx.strokeStyle=pl.state?p.accent2:p.accent;ctx.lineWidth=active?3:1;ctx.setLineDash(active?[]:[4,8]);ctx.strokeRect(pl.x,pl.y,pl.w,pl.h);
    }ctx.setLineDash([]);ctx.globalAlpha=1;
  }

  // spikes
  ctx.save();ctx.shadowColor=p.accent;ctx.shadowBlur=7;ctx.fillStyle=p.accent;
  for(const s of spikes){ctx.beginPath();for(let x=s.x;x<s.x+s.w;x+=14){ctx.moveTo(x,s.y+s.h);ctx.lineTo(x+7,s.y);ctx.lineTo(x+14,s.y+s.h);}ctx.fill();ctx.strokeStyle='rgba(255,255,255,.45)';ctx.lineWidth=1;ctx.stroke();}ctx.restore();

  // anchors
  for(const a of anchors){ctx.save();ctx.shadowColor=p.accent2;ctx.shadowBlur=10;ctx.strokeStyle=p.accent2;ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(a.x,a.y,9+Math.sin(game.time*3+a.x)*2,0,Math.PI*2);ctx.stroke();ctx.fillStyle=p.accent2;ctx.beginPath();ctx.arc(a.x,a.y,2.8,0,Math.PI*2);ctx.fill();ctx.restore();}

  // signs
  ctx.font='600 14px system-ui';ctx.textAlign='center';
  for(const s of signs){ if(Math.abs(s.x-player.x)<500){ctx.globalAlpha=.9;ctx.lineWidth=4;ctx.strokeStyle=game.world<2?'rgba(255,255,255,.8)':'rgba(0,0,0,.45)';ctx.strokeText(s.text,s.x,groundY-105);ctx.fillStyle=p.text;ctx.fillText(s.text,s.x,groundY-105);ctx.globalAlpha=1;} }

  // pickups
  for(const q of pickups){if(q.taken)continue;ctx.save();ctx.translate(q.x,q.y);ctx.shadowColor=p.accent2;ctx.shadowBlur=16;ctx.rotate(game.time*.7);ctx.strokeStyle=p.accent;ctx.lineWidth=3;ctx.strokeRect(-13,-13,26,26);ctx.rotate(-game.time*1.4);ctx.strokeStyle=p.accent2;ctx.strokeRect(-8,-8,16,16);ctx.restore();ctx.fillStyle=p.text;ctx.font='800 11px system-ui';ctx.textAlign='center';ctx.fillText(q.label,q.x,q.y-27);}

  // enemies
  for(const e of enemies){if(e.dead)continue;ctx.save();ctx.translate(e.x,e.y);ctx.fillStyle=e.type==='brute'?p.accent:p.accent2;
    if(e.type==='flyer'||e.type==='wisp'){ctx.beginPath();ctx.moveTo(0,12);ctx.quadraticCurveTo(13,-5,26,12);ctx.quadraticCurveTo(13,29,0,12);ctx.fill();if(e.type==='wisp'){ctx.globalAlpha=.25;ctx.beginPath();ctx.arc(13,12,20+Math.sin(game.time*4+e.x)*3,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}}
    else if(e.type==='sentinel'){ctx.strokeStyle=p.accent;ctx.lineWidth=3;ctx.beginPath();ctx.arc(13,13,12,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(13,13,4+Math.sin(game.time*5+e.x)*2,0,Math.PI*2);ctx.fill();}
    else{ctx.fillRect(0,0,e.w,e.h);ctx.fillStyle=p.bg;ctx.fillRect(e.w*.62,7,4,4);if(e.type==='brute'){ctx.strokeStyle=p.accent2;ctx.lineWidth=2;ctx.strokeRect(-3,-3,e.w+6,e.h+6);}}
    ctx.restore();}

  // phase portal + minnesskärva
  if(abilities.phase && !abilities.echo){
    ctx.save();
    ctx.translate(echoPortal.x+17,echoPortal.y+22);
    ctx.strokeStyle=p.accent2;
    ctx.lineWidth=3;
    ctx.globalAlpha=.75+.2*Math.sin(game.time*4);
    ctx.beginPath();
    ctx.ellipse(0,0,16,24,0,0,Math.PI*2);
    ctx.stroke();
    ctx.globalAlpha=1;
    ctx.restore();

    ctx.save();
    ctx.translate(echoShard.x,echoShard.y);
    ctx.rotate(-game.time);
    ctx.strokeStyle=p.accent2;
    ctx.lineWidth=3;
    ctx.beginPath();
    ctx.moveTo(0,-14);
    ctx.lineTo(12,0);
    ctx.lineTo(0,14);
    ctx.lineTo(-12,0);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // player shots
  ctx.fillStyle=p.accent2;
  for(const s of shots){const sz=s.size||5;ctx.save();ctx.shadowColor=p.accent2;ctx.shadowBlur=abilities.focus?8:3;ctx.fillRect(s.x-sz,s.y-2,sz*2,4);ctx.restore();}

  // boss
  if(!boss.dead && player.x>6900){ctx.save();ctx.translate(boss.x,boss.y);ctx.rotate(Math.sin(game.time*2)*.08);ctx.fillStyle=p.accent;ctx.fillRect(0,0,boss.w,boss.h);ctx.fillStyle=p.bg;ctx.fillRect(11,14,10,10);ctx.fillRect(41,14,10,10);ctx.strokeStyle=p.accent2;ctx.lineWidth=4;ctx.strokeRect(-6,-6,boss.w+12,boss.h+12);ctx.restore();}
  if(!boss2.dead && player.x>14500){ctx.save();ctx.translate(boss2.x+boss2.w/2,boss2.y+boss2.h/2);ctx.rotate(game.time*.28);const vulnerable=!abilities.realm||game.realm===boss2.phase;ctx.globalAlpha=vulnerable?1:.38;ctx.strokeStyle=boss2.phase?p.accent2:p.accent;ctx.lineWidth=6;ctx.beginPath();ctx.arc(0,0,38,0,Math.PI*2);ctx.stroke();ctx.rotate(-game.time*.7);ctx.strokeRect(-24,-24,48,48);ctx.rotate(game.time*1.1);ctx.strokeRect(-14,-14,28,28);ctx.fillStyle=p.line;ctx.beginPath();ctx.arc(0,0,8+Math.sin(game.time*5)*2,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.restore();}
  if(!boss3.dead && player.x>20000){ctx.save();ctx.translate(boss3.x+boss3.w/2,boss3.y+boss3.h/2);ctx.shadowColor=p.accent2;ctx.shadowBlur=18;ctx.strokeStyle=p.accent2;ctx.lineWidth=5;for(let i=0;i<3;i++){ctx.rotate(game.time*(.22+i*.06)*(i%2?1:-1));ctx.beginPath();ctx.arc(0,0,18+i*12,i*.7,Math.PI*1.45+i*.7);ctx.stroke();}ctx.fillStyle=p.accent;ctx.beginPath();ctx.arc(0,0,11+Math.sin(game.time*6)*2,0,Math.PI*2);ctx.fill();ctx.restore();}
  if(!boss4.dead && player.x>25600){ctx.save();ctx.translate(boss4.x+boss4.w/2,boss4.y+boss4.h/2);const ph=Math.floor(boss4.t/2.6)%2===1;ctx.shadowColor=ph?p.accent2:p.accent;ctx.shadowBlur=16;ctx.strokeStyle=ph?p.accent2:p.accent;ctx.lineWidth=5;ctx.strokeRect(-36,-36,72,72);ctx.rotate(game.time*.4);ctx.strokeRect(-24,-24,48,48);ctx.fillStyle=p.line;ctx.fillRect(-9,-9,18,18);ctx.restore();}
  if(!boss5.dead && player.x>32100){ctx.save();ctx.translate(boss5.x+boss5.w/2,boss5.y+boss5.h/2);ctx.shadowColor=boss5.phase?p.accent2:p.accent;ctx.shadowBlur=24;ctx.strokeStyle=boss5.phase?p.accent2:p.accent;ctx.lineWidth=6;for(let i=0;i<4;i++){ctx.rotate((i%2?1:-1)*game.time*(.12+i*.05));ctx.beginPath();ctx.ellipse(0,0,20+i*11,36+i*6,0,0,Math.PI*2);ctx.stroke();}ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,0,10+Math.sin(game.time*5)*3,0,Math.PI*2);ctx.fill();ctx.restore();}
  for(const b of bullets){ctx.fillStyle=p.accent2;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();}

  // grapple line
  if(player.grapple){ctx.strokeStyle=p.accent2;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(player.x+12,player.y+10);ctx.lineTo(player.grapple.x,player.grapple.y);ctx.stroke();}

  // dash trail
  if(player.dashT>0){ctx.globalAlpha=.18;ctx.fillStyle=p.accent2;for(const t of player.trail){ctx.fillRect(t.x,t.y,player.w,player.h);}ctx.globalAlpha=1;}

  // player
  ctx.save();ctx.translate(player.x,player.y);if(player.inv>0 && Math.floor(game.time*18)%2===0)ctx.globalAlpha=.25;
  ctx.globalAlpha*=.22;ctx.fillStyle=p.accent2;ctx.beginPath();ctx.arc(12,16,24,0,Math.PI*2);ctx.fill();ctx.globalAlpha=player.inv>0 && Math.floor(game.time*18)%2===0?.25:1;
  if(abilities.glide && !player.onGround && keys.has('Space') && player.vy>40){ctx.globalAlpha=.5;ctx.strokeStyle=p.accent2;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(6,13);ctx.quadraticCurveTo(-12,6,-20,20);ctx.moveTo(18,13);ctx.quadraticCurveTo(36,6,44,20);ctx.stroke();ctx.globalAlpha=1;}
  ctx.shadowColor=p.bg;ctx.shadowBlur=3;ctx.strokeStyle=game.world<2?'#fff':'rgba(0,0,0,.6)';ctx.lineWidth=4;ctx.strokeRect(4,6,16,22);ctx.beginPath();ctx.arc(12,5,8,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;
  ctx.fillStyle=p.line;ctx.fillRect(4,6,16,22);ctx.beginPath();ctx.arc(12,5,8,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=p.accent;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(8,28);ctx.lineTo(5,34);ctx.moveTo(16,28);ctx.lineTo(19,34);ctx.stroke();
  ctx.fillStyle=p.accent2;ctx.fillRect(player.face>0?15:6,7,3,3);ctx.restore();

  for(const pr of particles){ctx.globalAlpha=clamp(pr.t*2,0,1);ctx.fillStyle=Math.random()>.5?p.accent:p.accent2;ctx.beginPath();ctx.arc(pr.x,pr.y,pr.r,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
  ctx.restore();
}

function drawHUD(p){
  ctx.save();
  ctx.fillStyle='rgba(6,9,14,.74)';ctx.fillRect(16,16,220,58);
  ctx.fillStyle='#ffffff';ctx.font='800 13px system-ui';ctx.fillText('LINE//SHIFT',28,37);
  for(let i=0;i<player.maxHp;i++){ctx.globalAlpha=i<player.hp?1:.2;ctx.fillStyle=p.accent;ctx.fillRect(28+i*22,49,14,7);}ctx.globalAlpha=1;
  ctx.font='600 11px system-ui';ctx.fillStyle='#ffffff';ctx.globalAlpha=.65;ctx.fillText('R återställ  •  M ljud',126,59);ctx.globalAlpha=1;

  const abs=[['F:SKOTT',abilities.color],['2X',abilities.double],['TRÅD',abilities.grapple],['PULS',abilities.dash],['SE',abilities.phase],['EKO',abilities.echo],['E:SKIFT',abilities.realm],['VIND',abilities.glide],['LINS',abilities.focus],['KÄRNA',abilities.resonance]];
  let x=W()-18;
  ctx.textAlign='right';ctx.font='700 11px system-ui';
  for(let i=abs.length-1;i>=0;i--){const [name,on]=abs[i];ctx.globalAlpha=on?1:.16;ctx.fillStyle='#ffffff';ctx.fillText(name,x,34);x-=ctx.measureText(name).width+16;}ctx.globalAlpha=1;

  if(!boss.dead && player.x>7050 && player.x<8050){ctx.fillStyle='rgba(0,0,0,.25)';ctx.fillRect(W()/2-150,22,300,16);ctx.fillStyle=p.accent;ctx.fillRect(W()/2-146,26,292*(boss.hp/boss.maxHp),8);ctx.strokeStyle=p.line;ctx.strokeRect(W()/2-150,22,300,16);}
  if(!boss2.dead && player.x>14600){ctx.fillStyle='rgba(0,0,0,.28)';ctx.fillRect(W()/2-170,22,340,18);ctx.fillStyle=boss2.phase?p.accent2:p.accent;ctx.fillRect(W()/2-166,27,332*(boss2.hp/boss2.maxHp),8);ctx.strokeStyle=p.line;ctx.strokeRect(W()/2-170,22,340,18);}
  if(!boss3.dead && player.x>20200&&player.x<21400){ctx.fillStyle='rgba(0,0,0,.52)';ctx.fillRect(W()/2-170,22,340,18);ctx.fillStyle=p.accent2;ctx.fillRect(W()/2-166,27,332*(boss3.hp/boss3.maxHp),8);ctx.strokeStyle='#fff';ctx.strokeRect(W()/2-170,22,340,18);}
  if(!boss4.dead && player.x>25800&&player.x<27100){ctx.fillStyle='rgba(0,0,0,.52)';ctx.fillRect(W()/2-170,22,340,18);ctx.fillStyle=p.accent;ctx.fillRect(W()/2-166,27,332*(boss4.hp/boss4.maxHp),8);ctx.strokeStyle='#fff';ctx.strokeRect(W()/2-170,22,340,18);}
  if(!boss5.dead && player.x>32300){ctx.fillStyle='rgba(0,0,0,.58)';ctx.fillRect(W()/2-185,22,370,18);ctx.fillStyle=boss5.phase?p.accent2:p.accent;ctx.fillRect(W()/2-181,27,362*(boss5.hp/boss5.maxHp),8);ctx.strokeStyle='#fff';ctx.strokeRect(W()/2-185,22,370,18);}

  if(game.messageT>0){ const a=clamp(game.messageT<.5?game.messageT*2:1,0,1);ctx.globalAlpha=a;ctx.textAlign='center';ctx.font='900 22px system-ui';ctx.lineWidth=6;ctx.strokeStyle='rgba(0,0,0,.5)';ctx.strokeText(game.message,W()/2,110);ctx.fillStyle=game.world<2?p.text:'#fff';ctx.fillText(game.message,W()/2,110);ctx.globalAlpha=1; }
  ctx.restore();
}

function drawTitle(){
  const p=palette(0); drawBackground(p);
  ctx.save();ctx.translate(0,H()*.08);
  ctx.strokeStyle='#111';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(0,H()*.62);ctx.lineTo(W(),H()*.62);ctx.stroke();
  ctx.fillStyle='#111';ctx.textAlign='center';ctx.font=`900 ${Math.min(100,Math.max(44,W()*.09))}px system-ui`;ctx.fillText('LINE//SHIFT',W()/2,H()*.34);
  ctx.font=`700 ${Math.min(22,Math.max(14,W()*.021))}px system-ui`;ctx.globalAlpha=.55;ctx.fillText('THE WORLD BEGINS EMPTY',W()/2,H()*.42);ctx.globalAlpha=1;
  ctx.font='500 15px system-ui';ctx.fillText('Allt börjar med en linje. Allt förändras när du rör vid världen.',W()/2,H()*.5);
  ctx.font='800 13px system-ui';ctx.globalAlpha=.6;ctx.fillText('ENTER / SPACE för att börja',W()/2,H()*.73);ctx.globalAlpha=1;
  ctx.restore();
}

function drawEnd(){
  const p=palette(5);drawBackground(p);
  const t=game.endTimer;ctx.textAlign='center';
  ctx.fillStyle=p.text;ctx.font=`900 ${Math.min(86,Math.max(38,W()*.08))}px system-ui`;ctx.globalAlpha=clamp(t/1.5,0,1);ctx.fillText('LINJEN FORTSÄTTER',W()/2,H()*.34);
  ctx.font='600 18px system-ui';ctx.globalAlpha=clamp((t-1)/1.5,0,1);ctx.fillText('Det som började som en linje har blivit en hel värld.',W()/2,H()*.46);
  ctx.font='800 24px system-ui';ctx.fillStyle=p.accent2;ctx.globalAlpha=clamp((t-2)/1.5,0,1);ctx.fillText('VÄRLD 5 KLAR',W()/2,H()*.56);
  ctx.font='500 13px system-ui';ctx.fillStyle=p.text;ctx.globalAlpha=clamp((t-3)/1.2,0,1);ctx.fillText('ENTER — spela om från början',W()/2,H()*.72);ctx.globalAlpha=1;
}

function render(){
  if(game.screen==='title'){drawTitle();return;}
  if(game.screen==='end'){drawEnd();return;}
  const p=palette(game.world);drawBackground(p);
  ctx.save(); if(game.shake>0)ctx.translate(rand(-game.shake,game.shake),rand(-game.shake,game.shake)); drawWorld(p);ctx.restore(); drawHUD(p);
  if(game.flash>0){ctx.globalAlpha=game.flash*.45;ctx.fillStyle='#fff';ctx.fillRect(0,0,W(),H());ctx.globalAlpha=1;}
}

let last=performance.now();
function loop(now){ const dt=Math.min(.033,(now-last)/1000);last=now;update(dt);render();requestAnimationFrame(loop); }
requestAnimationFrame(loop);

})();
