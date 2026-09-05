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
const SAVE='line-shift-save-v2';
const game={ screen:'title', time:0, world:0, cameraX:0, shake:0, flash:0, message:'', messageT:0, checkpoint:120, deaths:0, bossDead:false, endTimer:0 };
const abilities={ color:false, double:false, grapple:false, dash:false, phase:false, echo:false };

function save(){
  try{localStorage.setItem(SAVE,JSON.stringify({checkpoint:game.checkpoint,abilities,bossDead:game.bossDead}));}catch{}
}
function load(){
  try{
    const s=JSON.parse(localStorage.getItem(SAVE)||'null');
    if(s){ game.checkpoint=s.checkpoint||120; Object.assign(abilities,s.abilities||{}); game.bossDead=!!s.bossDead; }
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
];

const hiddenPlatforms=[
  {x:1120,y:395,w:120,h:14}, {x:3360,y:350,w:110,h:14}, {x:4320,y:320,w:110,h:14}, {x:6210,y:340,w:120,h:14}
];

const spikes=[
  {x:1260,y:groundY-18,w:55,h:18},{x:1745,y:groundY-18,w:60,h:18},{x:2375,y:groundY-18,w:60,h:18},
  {x:3368,y:groundY-18,w:75,h:18},{x:3832,y:groundY-18,w:68,h:18},{x:4402,y:groundY-18,w:75,h:18},
  {x:5332,y:groundY-18,w:85,h:18},{x:5892,y:groundY-18,w:85,h:18},{x:6502,y:groundY-18,w:65,h:18}
];

const anchors=[
  {x:1610,y:190},{x:2700,y:150},{x:3730,y:150},{x:4640,y:135},{x:5750,y:150},{x:6840,y:155}
];

const pickups=[
  {id:'color',x:700,y:groundY-55,label:'FÄRG',taken:false},
  {id:'double',x:2050,y:groundY-55,label:'EKO',taken:false},
  {id:'grapple',x:3100,y:groundY-55,label:'TRÅD',taken:false},
  {id:'dash',x:5050,y:groundY-55,label:'PULS',taken:false},
  {id:'phase',x:6150,y:groundY-55,label:'SE',taken:false},
];
for(const p of pickups) p.taken=!!abilities[p.id];

const checkpoints=[850,2300,3650,5200,6500,7350];
const enemies=[];
function addEnemy(x,type='walker'){ enemies.push({x,y:groundY-30,w:25,h:28,vx:type==='flyer'?0:rand(-45,-25),vy:0,type,hp:type==='brute'?3:1,t:rand(0,10),dead:false,home:x}); }
[1500,1900,2540,2810,3530,4020,4550,4920,5520,6100,6660,6900].forEach((x,i)=>addEnemy(x,i%4===0?'brute':'walker'));
[2670,4690,5770].forEach(x=>addEnemy(x,'flyer'));

const boss={x:7520,y:groundY-55,w:62,h:58,hp:10,maxHp:10,dead:game.bossDead,t:0,vx:0,shot:0};
const bullets=[];
const shots=[];
const echoShard={x:4375,y:280,taken:abilities.echo};
const echoPortal={x:6330,y:groundY-45,w:34,h:45};

const signs=[
  {x:300,text:'Gå. Det räcker som början.'},
  {x:920,text:'Något förändras när du tar det.'},
  {x:2200,text:'Vissa vägar kräver att du minns.'},
  {x:3220,text:'Q — kasta tråden mot ljuspunkter.'},
  {x:5160,text:'SHIFT — en kort puls genom världen.'},
  {x:6220,text:'Det som varit osynligt har alltid funnits.'},
  {x:7130,text:'Tommie + Nea + Smirja. Tre perspektiv. En linje.'}
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
  return 5;
}

function setMessage(text,t=3){ game.message=text; game.messageT=t; }
function collect(p){
  p.taken=true; abilities[p.id]=true; chord(); game.flash=1; game.shake=10;
  const msgs={color:'VÄRLDEN MINNS FÄRG',double:'DUBBELHOPP — SPACE I LUFTEN',grapple:'TRÅD — Q MOT LJUSPUNKTER',dash:'PULS — SHIFT FÖR DASH',phase:'SEENDE — DOLDA VÄGAR ÄR SYNLIGA'};
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
    player.shotCD=.22; shots.push({x:player.x+(player.face>0?player.w+2:-4),y:player.y+15,vx:player.face*540,life:1.2}); beep(520,.045,'square',.014,120);
  }

  if(hook && abilities.grapple){
    if(player.grapple){ player.grapple=null; beep(180,.05,'square',.02,-40); }
    else{
      let best=null,bd=310;
      for(const a of anchors){ const d=dist(player.x+12,player.y+10,a.x,a.y); if(d<bd){bd=d;best=a;} }
      if(best){ player.grapple={x:best.x,y:best.y,len:bd*.82}; beep(600,.07,'triangle',.02,-180); }
    }
  }

  // gravity and grapple pull
  player.vy+=900*dt;
  if(player.grapple){
    const px=player.x+12,py=player.y+12; const dx=player.grapple.x-px,dy=player.grapple.y-py; const d=Math.hypot(dx,dy)||1;
    if(d>player.grapple.len){ const pull=(d-player.grapple.len)*14; player.vx+=dx/d*pull*dt; player.vy+=dy/d*pull*dt; }
    if(d>390) player.grapple=null;
  }

  player.x+=player.vx*dt; player.y+=player.vy*dt;
  player.onGround=false;
  const colliders=abilities.phase?[...platforms,...hiddenPlatforms]:platforms;
  for(const p of colliders){
    if(player.x+player.w>p.x && player.x<p.x+p.w && player.y+player.h>p.y && player.y+player.h<p.y+Math.max(30,Math.abs(player.vy*dt)+24) && player.vy>=0){
      player.y=p.y-player.h; player.vy=0; player.onGround=true; player.jumps=0;
    }
  }
  player.x=clamp(player.x,0,7900-player.w);
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
    if(e.type==='flyer'){ e.y=300+Math.sin(e.t*2.2)*55; e.x=e.home+Math.sin(e.t*.8)*90; }
    else{ e.x+=e.vx*dt; if(Math.abs(e.x-e.home)>90) e.vx*=-1; e.y=groundY-e.h+(e.type==='brute'?0:Math.sin(e.t*5)*2); }
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
        e.hp--;
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
      if(!s.dead && hit({x:s.x-4,y:s.y-2,w:8,h:4},boss) && abilities.echo){ boss.hp--; s.dead=true; game.shake=6; beep(110,.06,'square',.02,140); if(boss.hp<=0){boss.dead=true; game.bossDead=true; save(); chord(); setMessage('LINJEN ÄR DIN NU',4);} }
    }
    if(hit(player,boss)){
      if(player.dashT>0 && abilities.echo){boss.hp--; player.vx*=-.4; game.shake=12; beep(80,.1,'square',.035,180); if(boss.hp<=0){boss.dead=true; game.bossDead=true; save(); chord(); setMessage('LINJEN ÄR DIN NU',4);}}
      else damage(boss.x);
    }
  }
  for(let i=shots.length-1;i>=0;i--) if(shots[i].dead||shots[i].life<=0) shots.splice(i,1);
  for(const b of bullets){ b.x+=b.vx*dt;b.y+=b.vy*dt; if(hit(player,{x:b.x-b.r,y:b.y-b.r,w:b.r*2,h:b.r*2})){damage(b.x);b.dead=true;} }
  for(let i=bullets.length-1;i>=0;i--) if(bullets[i].dead||bullets[i].x<7000||bullets[i].x>8000) bullets.splice(i,1);

  if(boss.dead && player.x>7780){ game.screen='end'; game.endTimer=0; beep(220,.5,'sine',.02,330); }

  player.trail.push({x:player.x,y:player.y,t:.35}); if(player.trail.length>24)player.trail.shift();
  for(const t of player.trail)t.t-=dt;
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.t-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=220*dt;if(p.t<=0)particles.splice(i,1);}

  game.world=worldIndex(player.x);
  const targetCam=clamp(player.x-W()*.35,0,7900-W()); game.cameraX=lerp(game.cameraX,targetCam,1-Math.pow(.0008,dt));
  pressed.clear();
}

const particles=[];
function particle(x,y){return{x,y,vx:rand(-120,120),vy:rand(-180,20),t:rand(.3,.8),r:rand(1,4)}}

function palette(i){
  return [
    {bg:'#ffffff',line:'#111111',accent:'#111111',accent2:'#777777',text:'#111111',fog:'rgba(255,255,255,.8)'},
    {bg:'#f7f2e8',line:'#222222',accent:'#ef476f',accent2:'#118ab2',text:'#1c1b1a',fog:'rgba(247,242,232,.7)'},
    {bg:'#102019',line:'#dbe8c9',accent:'#91c788',accent2:'#d4a373',text:'#edf6e5',fog:'rgba(16,32,25,.55)'},
    {bg:'#171225',line:'#f2ecff',accent:'#9b5de5',accent2:'#00f5d4',text:'#ffffff',fog:'rgba(23,18,37,.5)'},
    {bg:'#07131f',line:'#baf2ff',accent:'#00f5d4',accent2:'#fee440',text:'#eaffff',fog:'rgba(7,19,31,.42)'},
    {bg:'#09050e',line:'#ffffff',accent:'#ff4d8d',accent2:'#00e5ff',text:'#ffffff',fog:'rgba(9,5,14,.32)'}
  ][i];
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
}

function worldToScreen(x,y){return{x:x-game.cameraX,y:y-(groundY-(H()*.72))};}

function drawWorld(p){
  const gy=H()*.72, offY=gy-groundY;
  ctx.save();ctx.translate(-game.cameraX,offY);

  // main line
  ctx.strokeStyle=p.line;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(0,groundY);ctx.lineTo(7900,groundY);ctx.stroke();

  // platforms
  for(const pl of platforms){
    if(pl.w>500 && pl.y===groundY){continue;}
    ctx.fillStyle=game.world<2?'rgba(0,0,0,.08)':(game.world===2?'rgba(125,170,120,.25)':'rgba(255,255,255,.08)');
    ctx.fillRect(pl.x,pl.y,pl.w,pl.h);
    ctx.strokeStyle=p.line;ctx.lineWidth=2;ctx.strokeRect(pl.x,pl.y,pl.w,Math.min(pl.h,20));
  }
  if(abilities.phase){
    ctx.setLineDash([7,7]);ctx.strokeStyle=p.accent2;ctx.lineWidth=2;
    for(const pl of hiddenPlatforms){ctx.globalAlpha=.75+.2*Math.sin(game.time*4+pl.x);ctx.strokeRect(pl.x,pl.y,pl.w,pl.h);}ctx.setLineDash([]);ctx.globalAlpha=1;
  }

  // spikes
  ctx.fillStyle=p.accent;
  for(const s of spikes){ctx.beginPath();for(let x=s.x;x<s.x+s.w;x+=14){ctx.moveTo(x,s.y+s.h);ctx.lineTo(x+7,s.y);ctx.lineTo(x+14,s.y+s.h);}ctx.fill();}

  // anchors
  for(const a of anchors){ctx.strokeStyle=p.accent2;ctx.lineWidth=2;ctx.beginPath();ctx.arc(a.x,a.y,9+Math.sin(game.time*3+a.x)*2,0,Math.PI*2);ctx.stroke();ctx.fillStyle=p.accent2;ctx.fillRect(a.x-2,a.y-2,4,4);}

  // signs
  ctx.font='600 14px system-ui';ctx.textAlign='center';
  for(const s of signs){ if(Math.abs(s.x-player.x)<500){ctx.fillStyle=p.text;ctx.globalAlpha=.75;ctx.fillText(s.text,s.x,groundY-105);ctx.globalAlpha=1;} }

  // pickups
  for(const q of pickups){if(q.taken)continue;ctx.save();ctx.translate(q.x,q.y);ctx.rotate(game.time*.7);ctx.strokeStyle=p.accent;ctx.lineWidth=3;ctx.strokeRect(-13,-13,26,26);ctx.rotate(-game.time*1.4);ctx.strokeStyle=p.accent2;ctx.strokeRect(-8,-8,16,16);ctx.restore();ctx.fillStyle=p.text;ctx.font='800 11px system-ui';ctx.textAlign='center';ctx.fillText(q.label,q.x,q.y-27);}

  // enemies
  for(const e of enemies){if(e.dead)continue;ctx.save();ctx.translate(e.x,e.y);ctx.fillStyle=e.type==='brute'?p.accent:p.accent2; if(e.type==='flyer'){ctx.beginPath();ctx.moveTo(0,12);ctx.lineTo(13,0);ctx.lineTo(26,12);ctx.lineTo(13,24);ctx.closePath();ctx.fill();}else{ctx.fillRect(0,0,e.w,e.h);ctx.fillStyle=p.bg;ctx.fillRect(e.w*.62,7,4,4);}ctx.restore();}

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
  for(const s of shots) ctx.fillRect(s.x-5,s.y-2,10,4);

  // boss
  if(!boss.dead && player.x>6900){ctx.save();ctx.translate(boss.x,boss.y);ctx.rotate(Math.sin(game.time*2)*.08);ctx.fillStyle=p.accent;ctx.fillRect(0,0,boss.w,boss.h);ctx.fillStyle=p.bg;ctx.fillRect(11,14,10,10);ctx.fillRect(41,14,10,10);ctx.strokeStyle=p.accent2;ctx.lineWidth=4;ctx.strokeRect(-6,-6,boss.w+12,boss.h+12);ctx.restore();}
  for(const b of bullets){ctx.fillStyle=p.accent2;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();}

  // grapple line
  if(player.grapple){ctx.strokeStyle=p.accent2;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(player.x+12,player.y+10);ctx.lineTo(player.grapple.x,player.grapple.y);ctx.stroke();}

  // dash trail
  if(player.dashT>0){ctx.globalAlpha=.18;ctx.fillStyle=p.accent2;for(const t of player.trail){ctx.fillRect(t.x,t.y,player.w,player.h);}ctx.globalAlpha=1;}

  // player
  ctx.save();ctx.translate(player.x,player.y);if(player.inv>0 && Math.floor(game.time*18)%2===0)ctx.globalAlpha=.25;
  ctx.fillStyle=p.line;ctx.fillRect(4,6,16,22);ctx.beginPath();ctx.arc(12,5,8,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=p.accent;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(8,28);ctx.lineTo(5,34);ctx.moveTo(16,28);ctx.lineTo(19,34);ctx.stroke();
  ctx.fillStyle=p.accent2;ctx.fillRect(player.face>0?15:6,7,3,3);ctx.restore();

  for(const pr of particles){ctx.globalAlpha=clamp(pr.t*2,0,1);ctx.fillStyle=Math.random()>.5?p.accent:p.accent2;ctx.beginPath();ctx.arc(pr.x,pr.y,pr.r,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
  ctx.restore();
}

function drawHUD(p){
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,.22)';ctx.fillRect(16,16,220,58);
  ctx.fillStyle=p.text;ctx.font='800 13px system-ui';ctx.fillText('LINE//SHIFT',28,37);
  for(let i=0;i<player.maxHp;i++){ctx.globalAlpha=i<player.hp?1:.2;ctx.fillStyle=p.accent;ctx.fillRect(28+i*22,49,14,7);}ctx.globalAlpha=1;
  ctx.font='600 11px system-ui';ctx.fillStyle=p.text;ctx.globalAlpha=.65;ctx.fillText('R återställ  •  M ljud',126,59);ctx.globalAlpha=1;

  const abs=[['F:SKOTT',abilities.color],['2X',abilities.double],['TRÅD',abilities.grapple],['PULS',abilities.dash],['SE',abilities.phase],['EKO',abilities.echo]];
  let x=W()-18;
  ctx.textAlign='right';ctx.font='700 11px system-ui';
  for(let i=abs.length-1;i>=0;i--){const [name,on]=abs[i];ctx.globalAlpha=on?1:.22;ctx.fillStyle=p.text;ctx.fillText(name,x,34);x-=ctx.measureText(name).width+16;}ctx.globalAlpha=1;

  if(!boss.dead && player.x>7050){ctx.fillStyle='rgba(0,0,0,.25)';ctx.fillRect(W()/2-150,22,300,16);ctx.fillStyle=p.accent;ctx.fillRect(W()/2-146,26,292*(boss.hp/boss.maxHp),8);ctx.strokeStyle=p.line;ctx.strokeRect(W()/2-150,22,300,16);}

  if(game.messageT>0){ const a=clamp(game.messageT<.5?game.messageT*2:1,0,1);ctx.globalAlpha=a;ctx.textAlign='center';ctx.font='900 22px system-ui';ctx.fillStyle=p.text;ctx.fillText(game.message,W()/2,110);ctx.globalAlpha=1; }
  ctx.restore();
}

function drawTitle(){
  const p=palette(0); drawBackground(p);
  ctx.save();ctx.translate(0,H()*.08);
  ctx.strokeStyle='#111';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(0,H()*.62);ctx.lineTo(W(),H()*.62);ctx.stroke();
  ctx.fillStyle='#111';ctx.textAlign='center';ctx.font=`900 ${Math.min(100,Math.max(44,W()*.09))}px system-ui`;ctx.fillText('LINE//SHIFT',W()/2,H()*.34);
  ctx.font=`700 ${Math.min(26,Math.max(16,W()*.024))}px system-ui`;ctx.globalAlpha=.65;ctx.fillText('Tommie • Nea • Smirja',W()/2,H()*.42);ctx.globalAlpha=1;
  ctx.font='500 15px system-ui';ctx.fillText('Allt börjar med en linje. Allt förändras när du rör vid världen.',W()/2,H()*.5);
  ctx.font='800 13px system-ui';ctx.globalAlpha=.6;ctx.fillText('ENTER / SPACE för att börja',W()/2,H()*.73);ctx.globalAlpha=1;
  ctx.restore();
}

function drawEnd(){
  const p=palette(5);drawBackground(p);
  const t=game.endTimer;ctx.textAlign='center';
  ctx.fillStyle=p.text;ctx.font=`900 ${Math.min(86,Math.max(38,W()*.08))}px system-ui`;ctx.globalAlpha=clamp(t/1.5,0,1);ctx.fillText('LINJEN FORTSÄTTER',W()/2,H()*.34);
  ctx.font='600 18px system-ui';ctx.globalAlpha=clamp((t-1)/1.5,0,1);ctx.fillText('Du förändrade världen. Världen förändrade hur du kunde röra dig.',W()/2,H()*.46);
  ctx.font='800 24px system-ui';ctx.fillStyle=p.accent2;ctx.globalAlpha=clamp((t-2)/1.5,0,1);ctx.fillText('TOMMIE • NEA • SMIRJA',W()/2,H()*.56);
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
