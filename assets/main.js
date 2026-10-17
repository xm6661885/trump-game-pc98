(() => {
'use strict';
// PC-98 look: every visible element becomes a low-res bitmap, prepared once at load.
// 1 game pixel = 1.5 SVG units (960 units 约 640 px, PC-98 width).
const PX=1.5,UP=4,SVGNS='http://www.w3.org/2000/svg';
const BAYER=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
function quantize(cv,k,dither){
  const x=cv.getContext('2d'),id=x.getImageData(0,0,cv.width,cv.height),d=id.data,w=cv.width,px=[];
  for(let i=0;i<d.length;i+=16)if(d[i+3]>110)px.push([d[i],d[i+1],d[i+2]]);
  let c=[];
  if(px.length){for(let j=0;j<k;j++)c.push(px[Math.floor((j+.5)*px.length/k)].slice());
    for(let it=0;it<6;it++){const s=c.map(()=>[0,0,0,0]);
      for(const p of px){let b=0,bd=1e9;for(let j=0;j<c.length;j++){const e=c[j],q=(p[0]-e[0])**2+(p[1]-e[1])**2+(p[2]-e[2])**2;if(q<bd){bd=q;b=j}}const t=s[b];t[0]+=p[0];t[1]+=p[1];t[2]+=p[2];t[3]++;}
      c=c.map((e,j)=>s[j][3]?[s[j][0]/s[j][3],s[j][1]/s[j][3],s[j][2]/s[j][3]]:e);}
    c=c.map(e=>e.map(v=>Math.round(v/17)*17));}
  for(let o=0,n=0;o<d.length;o+=4,n++){
    if(d[o+3]<=110){d[o+3]=0;continue}
    const t=dither?(BAYER[((n/w|0)&3)*4+(n%w&3)]/16-.5)*dither:0;
    let b=c[0],bd=1e9;for(const e of c){const q=(d[o]+t-e[0])**2+(d[o+1]+t-e[1])**2+(d[o+2]+t-e[2])**2;if(q<bd){bd=q;b=e}}
    d[o]=b[0];d[o+1]=b[1];d[o+2]=b[2];d[o+3]=255;}
  x.putImageData(id,0,0);return cv;
}
// Nearest-neighbour upscale in JS, so no browser smoothing (Safari ignores image-rendering on SVG <image>).
function upscale(cv){
  const o=document.createElement('canvas');o.width=cv.width*UP;o.height=cv.height*UP;
  const x=o.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(cv,0,0,o.width,o.height);return o.toDataURL();
}
function loadImg(url){return new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=url;});}
// Every photo sprite ships with a flat studio backdrop. Sample the frame to
// learn what that backdrop looks like, flood it away from the borders, then
// close the pinholes the key punches into hair and highlights.
function cutout(img){
  const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;
  const x=cv.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,w,h);
  const id=x.getImageData(0,0,w,h),d=id.data,seen=new Uint8Array(w*h),st=[];
  let bs=0,bl=0,bn=0;
  const look=p=>{const o=p*4,r=d[o],g=d[o+1],b=d[o+2];
    bs+=Math.max(r,g,b)-Math.min(r,g,b);bl+=r*.3+g*.59+b*.11;bn++;};
  for(let i=0;i<w;i++){look(i);look((h-1)*w+i);}
  for(let j=0;j<h;j++){look(j*w);look(j*w+w-1);}
  const flatStudio=bs/bn<12&&bl/bn>238;
  const isBg=flatStudio
    ? p=>{const o=p*4;return d[o]>200&&d[o+1]>194&&d[o+2]>188;}
    : p=>{const o=p*4,r=d[o],g=d[o+1],b=d[o+2];
        return (Math.max(r,g,b)-Math.min(r,g,b))<34&&(r*.3+g*.59+b*.11)>108;};
  const push=p=>{if(!seen[p]&&isBg(p)){seen[p]=1;st.push(p);}};
  for(let i=0;i<w;i++){push(i);push((h-1)*w+i);}
  for(let j=0;j<h;j++){push(j*w);push(j*w+w-1);}
  while(st.length){const p=st.pop(),px=p%w;
    if(px>0)push(p-1);if(px<w-1)push(p+1);if(p>=w)push(p-w);if(p<w*(h-1))push(p+w);}
  for(let pass=0;pass<2;pass++){
    const back=[];
    for(let y=1;y<h-1;y++)for(let xx=1;xx<w-1;xx++){const p=y*w+xx;
      if(!seen[p])continue;let k=0;
      for(let dy=-1;dy<2;dy++)for(let dx=-1;dx<2;dx++)if(!seen[p+dy*w+dx])k++;
      if(k>=6)back.push(p);}
    for(const p of back)seen[p]=0;
  }
  for(let p=0;p<w*h;p++)if(seen[p])d[p*4+3]=0;
  x.putImageData(id,0,0);
  return cv;
}
function pixelSprite(src,w,h,k,dither){
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;
  const x=cv.getContext('2d');x.imageSmoothingQuality='high';
  x.drawImage(src,0,0,w,h);
  const id=x.getImageData(0,0,w,h),d=id.data;
  // one pixel of sticker rim so the cut-out reads against a light scene
  const solid=new Uint8Array(w*h);
  for(let i=0;i<w*h;i++)solid[i]=d[i*4+3]>110?1:0;
  const rim=[];
  for(let y=0;y<h;y++)for(let xx=0;xx<w;xx++){const p=y*w+xx;
    if(solid[p])continue;
    let near=false;
    for(let dy=-1;dy<2&&!near;dy++)for(let dx=-1;dx<2;dx++){
      const q=(y+dy)*w+(xx+dx);
      if(y+dy>=0&&y+dy<h&&xx+dx>=0&&xx+dx<w&&solid[q]){near=true;break;}}
    if(near)rim.push(p);}
  for(const p of rim){d[p*4]=122;d[p*4+1]=21;d[p*4+2]=72;d[p*4+3]=255;}
  x.putImageData(id,0,0);
  return quantize(cv,k,dither);
}

// ---------- world & sprites ----------
const $=id=>document.getElementById(id),root=$('game'),screen=$('screen'),sx=screen.getContext('2d');
const ART=window.GAME_ART||{};
const manual=new URLSearchParams(location.search).get('test')==='1';
const store={get(k){try{return manual?null:localStorage.getItem(k);}catch{return null;}},set(k,v){try{if(!manual)localStorage.setItem(k,v);}catch{}},del(k){try{localStorage.removeItem(k);}catch{}}};
const W=(n)=>Math.round(n/PX);
const blank=(w,h)=>{const c=document.createElement('canvas');c.width=Math.max(1,w);c.height=Math.max(1,h);return c;};
// Obstacles/items are drawn at a size close to their hitbox, in game pixels.
const SPR={},SIZE={head:[48,54],air:[80,80],box:[54,56],barrier:[66,52],puddle:[132,40],rubio:[50,56],khamenei:[58,78],biden:[52,60],zelensky:[78,80],hillary:[84,80],ballot:[30,34],drink:[24,40],shield:[36,36],slow:[28,40],magnet:[34,38]};
let headLow=null,riderSrc=null;
function fitInto(img,w,h){const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height,s=Math.min(w/iw,h/ih);return [Math.max(1,Math.round(iw*s)),Math.max(1,Math.round(ih*s))];}
function makeSprite(key,src,cut){
  const [w,h]=SIZE[key],[pw,ph]=fitInto(src,W(w),W(h));
  SPR[key]=pixelSprite(cut?cutout(src):src,pw,ph,key==='puddle'?6:8,0);
}
function photoHead(img){
  // Head for the rider: an ellipse-clipped, dithered bitmap at bike-canvas resolution.
  const cv=blank(54,48),x=cv.getContext('2d');x.drawImage(cutout(img),0,0,54,48);return quantize(cv,20,4);
}
const customArt=k=>photoUnlocked()?store.get('mnr-art-'+k):null;
function loadArt(){
  const jobs=[];
  const rider=riderChoice();
  const headUrl=rider==='custom'&&customArt('head')?customArt('head'):ART[rider==='pelosi'?'ground':rider==='putin'?'air':'head'];
  if(headUrl)jobs.push(loadImg(headUrl).then(i=>{riderSrc=i;headLow=photoHead(i);}));
  for(const [key,src] of [['head',customArt('ground')||ART.ground],['air',customArt('air')||ART.air]])
    if(src)jobs.push(loadImg(src).then(i=>makeSprite(key,i,true)));
  for(const key of ['box','barrier','puddle','ballot','drink','shield','slow','magnet','rubio','khamenei','biden','zelensky','hillary'])
    if(ART[key]&&!SPR[key])jobs.push(loadImg(ART[key]).then(i=>makeSprite(key,i,false)));
  return Promise.all(jobs.map(p=>p.catch(()=>{}))).then(()=>{buildIcons();buildGarage();});
}
// Stage backdrops: generated art, quantised once into a game-resolution bitmap.
const BG_COUNT=4,BG=[],BG_TOP=[],BG_STRIP=[351,359,360,342];
function prepBg(i){
  if(BG[i]||!ART['bg'+(i+1)])return Promise.resolve();
  return loadImg(ART['bg'+(i+1)]).then(img=>{
    const cv=blank(640,427);cv.getContext('2d').drawImage(img,0,0,640,427);quantize(cv,28,2);
    const d=cv.getContext('2d').getImageData(0,0,640,1).data;let r=0,g=0,b=0;for(let k=0;k<d.length;k+=4){r+=d[k];g+=d[k+1];b+=d[k+2];}
    BG_TOP[i]=`rgb(${r/640|0},${g/640|0},${b/640|0})`;
    // Mirror-tiled strip so the slow parallax scroll never shows a seam.
    const t=blank(1280,427),tx=t.getContext('2d');tx.drawImage(cv,0,0);tx.save();tx.translate(1280,0);tx.scale(-1,1);tx.drawImage(cv,0,0);tx.restore();
    BG[i]=t;
  }).catch(()=>{});
}
// Ground and road: vector, rasterised once with hard edges.
let groundCv=null;
function prepGround(){
  const c=blank(W(960),W(320)),x=c.getContext('2d');x.scale(1/PX,1/PX);x.translate(0,-430);
  x.fillStyle='#ffd0e6';x.fill(new Path2D('M0 459Q220 431 451 458T960 451V750H0Z'));
  x.fillStyle='#f7b6d6';x.fillRect(0,487,960,73);x.fillStyle='#ffffff';x.fillRect(0,485,960,4);
  x.fillStyle='#ffd9ec';x.beginPath();x.ellipse(127,598,7,3,0,0,7);x.ellipse(782,640,9,3,0,0,7);x.fill();
  x.fillStyle='#d166a8';x.fill(new Path2D('M69 487q-16-37-19-43q23 13 24 43q8-37 21-43q-1 28-19 43M859 487q-14-31-20-36q23 7 23 36q8-27 19-32q-1 24-15 32'));
  const id=x.getImageData(0,0,c.width,c.height),d=id.data;for(let k=3;k<d.length;k+=4)d[k]=d[k]>110?255:0;x.putImageData(id,0,0);
  groundCv=c;
}
// Pixel-font text, thresholded so it stays as crisp as the art. Cached per string.
const textCache=new Map();
function textSprite(str,color,outline){
  const key=str+'|'+color+'|'+outline;let c=textCache.get(key);if(c)return c;
  const m=blank(1,1).getContext('2d');m.font="12px FusionPixel,monospace";const w=Math.ceil(m.measureText(str).width)+4;
  c=blank(w,17);const x=c.getContext('2d');x.font="12px FusionPixel,monospace";x.textBaseline='alphabetic';
  if(outline){x.fillStyle=outline;for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1],[1,1]])x.fillText(str,2+dx,13+dy);}
  x.fillStyle=color;x.fillText(str,2,13);
  const id=x.getImageData(0,0,c.width,c.height),d=id.data;for(let k=3;k<d.length;k+=4)d[k]=d[k]>100?255:0;x.putImageData(id,0,0);
  if(textCache.size>200)textCache.clear();textCache.set(key,c);return c;
}

// ---------- bike + rider ----------
const SKINS=[
  {id:'pink',name:'樱花粉',frame:'#ff4d94',dark:'#7a1548',rim:'#ffb3d9',spoke:'#ff7ab8',suit:'#26305e',suitD:'#141a3d',tie:'#e0213a',need:null},
  {id:'mint',name:'薄荷绿',frame:'#3ec9a7',dark:'#1d5e57',rim:'#bdf3e4',spoke:'#6fdcc0',suit:'#2b3a55',suitD:'#172238',tie:'#ff7ab8',need:{best:60,text:'单局 60 分'}},
  {id:'gold',name:'金色总统',frame:'#f2b632',dark:'#7a4a10',rim:'#ffe8a3',spoke:'#f7cf5e',suit:'#1b1b2a',suitD:'#0b0b14',tie:'#f2b632',need:{ballots:200,text:'累计 200 张选票'}},
  {id:'flag',name:'星条旗',frame:'#2f4fbf',dark:'#1b2560',rim:'#ffffff',spoke:'#e0213a',suit:'#26305e',suitD:'#141a3d',tie:'#e0213a',need:{stage:4,text:'跑到第 5 州'}},
  {id:'night',name:'夜骑霓虹',frame:'#9b5cff',dark:'#2a1052',rim:'#e4d0ff',spoke:'#ff2e7e',suit:'#120a24',suitD:'#05020c',tie:'#3cf2ff',need:{combo:12,text:'连击达到 12'}}
];
const RIDERS=[
  {id:'trump',name:'特朗普',need:null},
  {id:'pelosi',name:'佩洛西',need:{best:100,text:'单局 100 分'}},
  {id:'putin',name:'普京',need:{hell:40,text:'地狱模式 40 分'}},
  {id:'custom',name:'我的照片',need:{custom:true,text:'先上传照片'}}
];
// Custom photos are a late reward: a solid run on standard or hell.
const PHOTO_NEED={hard:300,stage:3,text:'标准/地狱单局 300 分，并跑到第 4 州'};
const photoUnlocked=()=>progress.hard>=PHOTO_NEED.hard&&progress.stage>=PHOTO_NEED.stage;
const bikeCv=document.createElement('canvas'),BX=180,BY=290,BW=240,BH=222;
bikeCv.width=BW/PX;bikeCv.height=BH/PX;
const bctx=bikeCv.getContext('2d',{willReadFrequently:true});
const P=d=>new Path2D(d);
const FRAME=P('M345 424L410 318L479 424H345L590 326L629 424M479 424L410 318M590 326L578 288L600 272L620 272');
const FRAME_IN=P('M345 424L410 318L479 424H345L590 326L629 424M479 424L410 318');
const SPOKES=P('M-65 0H65M0-65V65M-46-46L46 46M-46 46L46-46M-60-25L60 25M-60 25L60-25M-25-60L25 60M25-60L-25 60');
function stroke(p,c,w){bctx.strokeStyle=c;bctx.lineWidth=Math.max(3,w);bctx.stroke(p);}
function circle(x,y,r,fill,sc,w){const p=new Path2D();p.arc(x,y,r,0,7);if(fill){bctx.fillStyle=fill;bctx.fill(p);}if(sc)stroke(p,sc,w);}
function line(pts,c,w){const p=new Path2D();p.moveTo(pts[0],pts[1]);for(let i=2;i<pts.length;i+=2)p.lineTo(pts[i],pts[i+1]);stroke(p,c,w);}
// Two-bone IK: knee/elbow between a and b with segment length L, bending toward side s.
function joint(ax,ay,bx,by,L,s){const dx=bx-ax,dy=by-ay,d=Math.min(Math.hypot(dx,dy),2*L-1),h=Math.sqrt(Math.max(0,L*L-d*d/4)),mx=ax+dx/2,my=ay+dy/2,n=Math.hypot(dx,dy)||1;return [mx-dy/n*h*s,my+dx/n*h*s];}
let duckAnim=0;
function drawPixelBike(g,skin,flash){
  const c=bctx,S=skin;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,bikeCv.width,bikeCv.height);
  c.setTransform(1/3,0,0,1/3,(52.5-BX)/PX,(250-BY)/PX);c.lineCap='square';c.lineJoin='miter';
  const ang=g.distance/38,a=g.distance/75,pdx=Math.cos(a)*25,pdy=Math.sin(a)*25;
  for(const wx of [345,629]){c.save();c.translate(wx,424);c.rotate(ang);
    circle(0,0,76,'#fff6fb',S.dark,9);circle(0,0,64,null,S.rim,2);stroke(SPOKES,S.spoke,3);circle(0,0,8,S.dark);c.restore();}
  duckAnim+=((g.ducking?1:0)-duckAnim)*0.45;const k=duckAnim;
  const hip=[420,300],sh=[478-k*4,262+k*56],hd=[486+k*18,206+k*100];
  const suit=flash?`hsl(${(performance.now()/3)%360} 80% 55%)`:S.suit;
  // far leg (behind frame)
  const pf=[479-pdx,424-pdy],kf=joint(hip[0],hip[1],pf[0],pf[1],78,-1);
  line([hip[0],hip[1],kf[0],kf[1],pf[0],pf[1]],S.suitD,16);line([pf[0]-12,pf[1]+2,pf[0]+16,pf[1]+2],'#120814',9);
  stroke(FRAME,S.dark,11);stroke(FRAME_IN,S.frame,6);line([410,318,404,299],S.dark,7);line([383,298,425,298],S.dark,12);line([600,272,625,272],S.frame,8);
  circle(479,424,20,null,S.dark,4);line([479-pdx,424-pdy,479+pdx,424+pdy],S.dark,5);
  // torso: suit jacket leaning toward the bars, white collar and a flapping tie
  const body=new Path2D();body.moveTo(hip[0]-22,hip[1]+6);body.lineTo(sh[0]-30,sh[1]-10);body.lineTo(sh[0]+14,sh[1]-14);body.lineTo(sh[0]+18,sh[1]+20);body.lineTo(hip[0]+26,hip[1]+10);body.closePath();
  c.fillStyle=suit;c.fill(body);stroke(body,S.dark,4);
  const tf=Math.sin(g.distance/40)*6;
  const tie=new Path2D();tie.moveTo(sh[0]+6,sh[1]-8);tie.lineTo(sh[0]+16,sh[1]+4);tie.lineTo(sh[0]+12+tf,sh[1]+40);tie.lineTo(sh[0]+2+tf,sh[1]+34);tie.closePath();
  c.fillStyle='#ffffff';c.fillRect(sh[0]-4,sh[1]-16,18,10);c.fillStyle=S.tie;c.fill(tie);
  // near leg (in front of frame)
  const pn=[479+pdx,424+pdy],kn=joint(hip[0],hip[1],pn[0],pn[1],78,-1);
  line([hip[0],hip[1],kn[0],kn[1],pn[0],pn[1]],suit,17);line([pn[0]-12,pn[1]+2,pn[0]+16,pn[1]+2],'#120814',10);
  // head (photo, clipped to an ellipse)
  if(headLow){c.save();c.beginPath();c.ellipse(hd[0],hd[1]-14,92,82,0,0,7);c.clip();c.imageSmoothingEnabled=false;c.drawImage(headLow,hd[0]-100,hd[1]-104,200,180);c.restore();}
  else circle(hd[0],hd[1],64,'#ffd9b0',S.dark,4);
  // arm to the handlebar, drawn over the head's collar
  const hand=[606,268],el=joint(sh[0],sh[1],hand[0],hand[1],78,1);
  line([sh[0],sh[1],el[0],el[1],hand[0]-10,hand[1]+2],suit,16);c.fillStyle='#ffffff';c.fillRect(hand[0]-22,hand[1]-6,10,14);circle(hand[0],hand[1]+2,9,'#f4c69a',S.dark,3);
  c.setTransform(1,0,0,1,0,0);
  const id=c.getImageData(0,0,bikeCv.width,bikeCv.height),d=id.data;
  for(let i=3;i<d.length;i+=4)d[i]=d[i]>110?255:0;c.putImageData(id,0,0);
}

// ---------- audio: 8-bit synth sfx + BGM that speeds up with the bike ----------
const sfx=(()=>{
  let ac=null,master=null,muted=store.get('mnr-mute')==='1';
  function ctx(){
    if(!ac){const A=window.AudioContext||window.webkitAudioContext;if(!A)return null;ac=new A();master=ac.createGain();master.gain.value=.28;master.connect(ac.destination);}
    if(ac.state==='suspended')ac.resume().catch(()=>{});return ac;
  }
  function tone(type,f0,f1,dur,vol=1,when=0){
    if(muted)return;const a=ctx();if(!a)return;const t=a.currentTime+when;
    const o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.setValueAtTime(f0,t);if(f1)o.frequency.exponentialRampToValueAtTime(f1,t+dur);
    g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.connect(g);g.connect(master);o.start(t);o.stop(t+dur+.02);
  }
  function noise(dur,vol=1,hp=600,when=0){
    if(muted)return;const a=ctx();if(!a)return;const t=a.currentTime+when;
    const b=a.createBuffer(1,Math.ceil(a.sampleRate*dur),a.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    const s=a.createBufferSource(),f=a.createBiquadFilter(),g=a.createGain();s.buffer=b;f.type='highpass';f.frequency.value=hp;
    g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);s.connect(f);f.connect(g);g.connect(master);s.start(t);
  }
  const P={
    jump(){tone('square',330,880,.12,.5);},
    land(v){noise(.07,.25*Math.min(1,v/900),300);},
    pass(){tone('square',660,0,.05,.12);},
    ballot(m){const f=880*Math.pow(1.06,Math.min(12,m-1));tone('square',f,0,.05,.35);tone('square',f*1.5,0,.08,.3,.05);},
    near(c){const b=520*Math.pow(1.06,Math.min(14,c));[0,4,7,12].forEach((s,i)=>tone('square',b*Math.pow(2,s/12),0,.06,.32,i*.04));},
    item(){[0,4,7,12,16].forEach((s,i)=>tone('triangle',440*Math.pow(2,s/12),0,.09,.5,i*.05));},
    smash(){noise(.18,.5,200);tone('square',220,60,.16,.4);},
    shield(){noise(.25,.5,1200);tone('sawtooth',880,110,.3,.35);},
    die(){tone('square',440,55,.6,.55);noise(.35,.35,150);},
    stage(){[0,4,7,12,7,12].forEach((s,i)=>tone('square',523*Math.pow(2,s/12),0,.11,.4,i*.09));},
    beat(){tone('sine',150,40,.16,.9);noise(.04,.2,4000);},
    warn(){tone('square',740,0,.08,.4);tone('square',740,0,.08,.4,.16);},
    lost(){tone('triangle',440,220,.2,.3);}
  };
  return {play(n,...a){try{P[n]&&P[n](...a);}catch{}},unlock(){if(!muted)ctx();},get muted(){return muted;},
    toggle(){muted=!muted;store.set('mnr-mute',muted?'1':'0');return muted;}};
})();
const bgm=$('bgm');bgm.volume=.45;
function bgmUpdate(){
  if(sfx.muted||g.state!=='running'){if(!bgm.paused&&(sfx.muted||g.state==='paused'))bgm.pause();return;}
  if(bgm.paused){const p=bgm.play();if(p&&p.catch)p.catch(()=>{});}
  // Tempo rises with speed; slow-mo drags it down.
  const r=(0.92+0.28*(g.base-g.cfg.startSpeed)/Math.max(1,g.cfg.maxSpeed-g.cfg.startSpeed))*(g.slow>0?0.75:1);
  if(Math.abs(bgm.playbackRate-r)>.01){try{bgm.preservesPitch=false;bgm.webkitPreservesPitch=false;bgm.playbackRate=r;}catch{}}
  bgm.volume=g.rush>0?.28:.45;
}
function unlockAudio(){sfx.unlock();if(!sfx.muted&&g.state==='running'&&bgm.paused){const p=bgm.play();if(p&&p.catch)p.catch(()=>{});}}
for(const n of ['pointerdown','keydown','touchstart'])document.addEventListener(n,unlockAudio,{passive:true});

// ---------- modes, daily challenge, progress ----------
const MODE_NAME={casual:'休闲',standard:'标准',hell:'地狱'};
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
function hashStr(s){let h=2166136261;for(const ch of s){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
let mode=store.get('mnr-mode')||'standard';if(!PelicanGame.MODES[mode])mode='standard';
let daily=store.get('mnr-daily')==='1';
const bestKey=()=>daily?`mnr-best-daily-${today()}`:`mnr-best-${mode}`;
const readBest=()=>{const v=store.get(bestKey());return v&&/^\d+$/.test(v)?+v:0;};
let progress={best:0,ballots:0,stage:0,combo:0,hell:0,hard:0,runs:0};
try{Object.assign(progress,JSON.parse(store.get('mnr-progress')||'{}'));}catch{}
const unlocked=n=>!n||(n.best&&progress.best>=n.best)||(n.ballots&&progress.ballots>=n.ballots)||(n.stage&&progress.stage>=n.stage)||(n.combo&&progress.combo>=n.combo)||(n.hell&&progress.hell>=n.hell)||(n.custom&&!!customArt('head'));
let skinId=store.get('mnr-skin')||'pink';
const skinOf=()=>{const s=SKINS.find(s=>s.id===skinId);return s&&unlocked(s.need)?s:SKINS[0];};
function riderChoice(){const r=store.get('mnr-rider')||'trump',R=RIDERS.find(x=>x.id===r);return R&&unlocked(R.need)?r:'trump';}
function newSeed(){if(manual)return 42;if(daily)return hashStr('midterm-'+today());const s=new Uint32Array(1);crypto.getRandomValues(s);return s[0];}
let g=PelicanGame.createGame({seed:newSeed(),mode:daily?'standard':mode});
let best=readBest();
const STATES=['宾夕法尼亚','佐治亚','亚利桑那','密歇根','威斯康星','内华达','北卡罗来纳','俄亥俄','佛罗里达','德克萨斯','弗吉尼亚','明尼苏达','新罕布什尔','爱荷华','科罗拉多'];
const SCENES=['投票站','街区','大桥','黎明'];
const stateName=n=>STATES[n%STATES.length]+(n>=STATES.length?` ${Math.floor(n/STATES.length)+1} 轮`:'');

// ---------- layout: canvas covers the box, world is cropped like the old SVG viewBox ----------
let VB={x:0,y:0,w:960,h:620},K=1,portrait=false;
function layout(){
  portrait=innerHeight>innerWidth;root.classList.toggle('portrait',portrait);
  const r=root.getBoundingClientRect(),bw=Math.max(1,r.width),bh=Math.max(1,r.height);
  if(portrait){
    const H=Math.round(Math.max(620,640*bh/bw)/PX)*PX,u=640/bw,f=$('footer').getBoundingClientRect();
    // Road edge sits just above the touch buttons; the menu card may grow down to the rider's head.
    const bottom=Math.min(750,Math.max(600,548+(r.bottom-f.top)*u)),y0=Math.round((bottom-H)/PX)*PX;
    VB={x:140,y:y0,w:640,h:H};
    root.style.setProperty('--rider-top',Math.round((290-y0)/u)+'px');
  }
  else VB={x:0,y:0,w:960,h:Math.round(960*bh/bw)};
  // Integer upscale of the game-pixel grid so every art pixel is a crisp block.
  const gw=VB.w/PX,dpr=window.devicePixelRatio||1;
  K=Math.max(1,Math.round(bw*dpr/gw));
  screen.width=Math.round(gw*K);screen.height=Math.round(VB.h/PX*K);
  fogCache=null;
}
let fogCache=null;
function fogLevels(){
  if(fogCache)return fogCache;
  const gw=Math.round(VB.w/PX),gh=Math.round(VB.h/PX),cx=(330-VB.x)/PX,cy=(420-VB.y)/PX;
  fogCache=[0.35,0.55,0.75].map(max=>{
    const c=blank(gw,gh),x=c.getContext('2d'),id=x.createImageData(gw,gh),d=id.data;
    for(let y=0;y<gh;y++)for(let i=0;i<gw;i++){
      const dx=(i-cx)/(i>cx?330:220),dy=(y-cy)/170,r=Math.sqrt(dx*dx+dy*dy);
      const v=Math.min(max,Math.max(0,(r-0.75)*0.9));
      if(v*16>BAYER[(y&3)*4+(i&3)]){const o=(y*gw+i)*4;d[o]=26;d[o+1]=8;d[o+2]=40;d[o+3]=255;}
    }
    x.putImageData(id,0,0);return c;
  });
  return fogCache;
}

// ---------- effects ----------
const parts=[],floats=[];
function burst(x,y,n,colors,spd=260){for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,v=spd*(.4+Math.random()*.6);parts.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-120,c:colors[i%colors.length],t:0,life:.5+Math.random()*.4});}}
function floatText(x,y,str,color,scale=1){floats.push({x,y,str,color,scale,t:0});if(floats.length>24)floats.shift();}
let bannerTimer=0;
function banner(a,b,warn){const el=$('banner');$('banner1').textContent=a;$('banner2').textContent=b||'';el.classList.toggle('warn',!!warn);el.hidden=true;void el.offsetWidth;el.hidden=false;clearTimeout(bannerTimer);bannerTimer=setTimeout(()=>{el.hidden=true;},2500);$('announcement').textContent=a+' '+(b||'');}
function flash(){const f=document.createElement('div');f.className='flash';root.append(f);setTimeout(()=>f.remove(),450);}
const ITEM_NAME={drink:'能量饮料 · 无敌',shield:'护盾 · 抗一次',slow:'沙漏 · 慢动作',magnet:'磁铁 · 吸选票'};
function drain(){
  for(const e of g.events){
    switch(e.type){
      case 'jump':sfx.play('jump');break;
      case 'land':sfx.play('land',e.v);break;
      case 'pass':sfx.play('pass');break;
      case 'ballot':sfx.play('ballot',g.mult);floatText(e.x,e.y-20,'+'+e.v,'#ff2e7e');burst(e.x,e.y,5,['#ff2e7e','#ffffff','#ffd0e6'],160);break;
      case 'near':sfx.play('near',e.combo);floatText(300,300,`擦边 +${2*e.mult}`,'#ff9e6b',1);if(e.combo%2===0)floatText(300,272,`倍率 ×${e.mult}`,'#ff2e7e',2);
        const ch=$('comboChip');ch.classList.remove('bump');void ch.offsetWidth;ch.classList.add('bump');break;
      case 'comboLost':sfx.play('lost');break;
      case 'smash':sfx.play('smash');burst(e.x+20,450,10,['#ff9e6b','#7a1548','#ffd9ec'],380);floatText(e.x,400,'撞飞! +2','#ff9e6b');break;
      case 'item':sfx.play('item');floatText(300,290,ITEM_NAME[e.kind],'#7a1548');burst(310,400,12,['#ff2e7e','#ffd0e6','#ff9e6b','#9b5cff'],320);break;
      case 'itemEnd':break;
      case 'shieldBreak':sfx.play('shield');flash();floatText(300,300,'护盾碎了','#3a6fd8');burst(300,420,14,['#bfe2ff','#ffffff','#3a6fd8'],420);break;
      case 'stage':sfx.play('stage');banner(`${stateName(e.n-1)} 计票完成！`,`第 ${e.n+1} 州 · ${stateName(e.n)} · 计票冲刺 选票双倍`);burst(480,200,30,['#ff2e7e','#ffd0e6','#ffffff','#ff9e6b'],520);g.add(5*e.n);break;
      case 'beat':sfx.play('beat');beatPulse=1;break;
      case 'rushEnd':break;
      case 'event':
        if(e.name==='rain')banner('雨夜','视野变窄，看准前方');
        else if(e.name==='wind')banner(e.dir>0?'顺风':'逆风',e.dir>0?'车速变快':'车速变慢');
        else{banner('操作即将反转！','跳和趴马上对调',true);sfx.play('warn');}
        break;
      case 'reverse':root.classList.toggle('reversed',e.on);syncHolds();if(e.on){banner('操作反转','按「趴」跳，按「跳」趴',true);}else banner('操作恢复','');break;
      case 'eventEnd':break;
      case 'die':crashStart();sfx.play('die');if(navigator.vibrate)try{navigator.vibrate(80);}catch{}break;
    }
  }
  g.events.length=0;
}
let beatPulse=0;

// ---------- crash: bike flips backwards, rider's head pops off, pixel blast ----------
const CRASH=1.1;let dieAt=-1e9;
const crashT=()=>(performance.now()-dieAt)/1000;
function crashStart(){
  dieAt=performance.now();
  burst(330,400,26,['#ffffff','#ffd84a','#ff9e6b','#ff2e7e','#7a1548'],520);
  burst(330,420,14,['#3a2a3a','#7a1548','#a8648f'],260);
}
function drawCrash(skin,jy){
  const t=crashT(),c=bikeCv;
  // 1) tumble: arc up and back, spinning, drawn in coarse 45-degree-ish steps for the pixel look
  drawPixelBike(g,skin,false);
  const rot=-Math.round(t*7/0.4)*0.4,dx=-t*180,dy=-t*420+t*t*620;
  sx.save();sx.translate(300+dx,400+jy+dy);sx.rotate(rot);
  if(t<.18||Math.floor(t*14)%2)sx.drawImage(c,BX-300,BY-400,BW,BH);
  sx.restore();
  // 2) blast: expanding pixel rings + a white core for the first few frames
  if(t<.5){const r=20+t*260,n=28;for(let a=0;a<n;a++){const q=a/n*Math.PI*2;rectPx(340+Math.cos(q)*r,410+jy+Math.sin(q)*r*.7,6,6,t<.25?'#ffd84a':'#ff9e6b');}}
  if(t<.12){sx.fillStyle='#ffffff';sx.fillRect(VB.x,VB.y,VB.w,VB.h);}
  else if(t<.3){const s2=(.3-t)*300;rectPx(340-s2/2,410+jy-s2/2,s2,s2,'#ffffff');}
  const boom=textSprite('BOOM!','#ff2e7e','#ffffff'),bs=PX*3*Math.min(1,t*5);
  if(t>.08&&t<CRASH-.1)sx.drawImage(boom,Math.round((330-boom.width*bs/2)/PX)*PX,Math.round((300-t*30)/PX)*PX,boom.width*bs,boom.height*bs);
}

// ---------- drawing ----------
let bgShown=0,bgFade=1,bgPrev=0;
function drawSprite(img,x,y,w,h){if(img)sx.drawImage(img,Math.round(x/PX)*PX,Math.round(y/PX)*PX,w,h);}
function rectPx(x,y,w,h,c){sx.fillStyle=c;sx.fillRect(Math.round(x/PX)*PX,Math.round(y/PX)*PX,Math.max(PX,Math.round(w/PX)*PX),Math.max(PX,Math.round(h/PX)*PX));}
function draw(){
  const s=K/PX;sx.setTransform(1,0,0,1,0,0);sx.imageSmoothingEnabled=false;
  const bi=g.stage%BG_COUNT;
  if(bi!==bgShown){bgPrev=bgShown;bgShown=bi;bgFade=0;prepBg((bi+1)%BG_COUNT);}
  bgFade=Math.min(1,bgFade+1/40);
  sx.fillStyle=BG_TOP[bgShown]||'#ffe6f2';sx.fillRect(0,0,screen.width,screen.height);
  const shake=g.state==='over'&&crashT()<.45?Math.round((Math.random()-.5)*14*(1-crashT()/.45)/PX)*PX:0;
  sx.setTransform(s,0,0,s,(-VB.x+shake)*s,(-VB.y+shake*.5)*s);
  // Backdrop: 640x427 art scaled 1.5x, its ground strip lined up with the road; slow parallax.
  const off=-Math.round((g.distance*0.06)%1920/PX)*PX;
  const drawBg=(i,a)=>{const im=BG[i];if(!im)return;sx.globalAlpha=a;const top=492-BG_STRIP[i]*1.5;
    for(let x=off-1920;x<VB.x+VB.w+1920;x+=1920)sx.drawImage(im,x,top,1920,640.5);sx.globalAlpha=1;};
  if(bgFade<1)drawBg(bgPrev,1);
  drawBg(bgShown,bgFade<1?Math.floor(bgFade*4)/4:1);
  if(groundCv)sx.drawImage(groundCv,0,430,960,480);
  for(let x=-Math.round(g.distance%160/PX)*PX;x<960;x+=160)rectPx(x,530,70,4,'#ffffff');
  // obstacles
  for(const o of g.obstacles){
    const left=o.x,top=o.bottom-o.h;
    if(o.dead){
      const t=g.time-o.deadT;sx.save();sx.translate(left+o.w/2+t*420,top+o.h/2-t*520+t*t*900);sx.rotate(t*9);
      const im=SPR[o.art];if(im)sx.drawImage(im,-o.w/2,-o.h/2,o.w,o.h);sx.restore();continue;
    }
    if(o.type!=='air'&&o.art!=='puddle'){
      const lift=(500-o.bottom)/50;sx.fillStyle='#c86ea6';sx.globalAlpha=.3*(1-lift*.5);
      sx.beginPath();sx.ellipse(left+o.w/2,503,o.w*.6*(1-lift*.3),4,0,0,7);sx.fill();sx.globalAlpha=1;
    }
    const im=SPR[o.art];
    if(o.art==='puddle'){if(im)drawSprite(im,left-6,o.bottom-28,o.w+12,36);else rectPx(left,o.bottom-10,o.w,10,'#9b6fb0');}
    else if(o.type==='bouncer'){const sq=o.bottom>494?6:0;drawSprite(im,left-sq/2,top+sq,o.w+sq,o.h-sq);
      for(let k=0;k<3;k++)rectPx(left+o.w/2-6+(k%2)*6,o.bottom+k*((500-o.bottom)/3),6,Math.max(3,(500-o.bottom)/3-2),'#7a1548');}
    else if(o.pop&&im){const [w,h]=SIZE[o.art],hh=Math.max(10,h*o.h/o.pop);drawSprite(im,left+(o.w-w)/2-(h-hh)*.2,o.bottom-hh,w+(h-hh)*.4,hh);
      if(o.h<o.pop*.5)for(let k=0;k<3;k++){const z=(g.time*1.5+k/3)%1;const im2=textSprite('z','#7a1548','#ffffff');sx.drawImage(im2,left+o.w*.7+z*24,o.bottom-hh-14-z*36,im2.width*PX,im2.height*PX);}}
    else if(im){const [w,h]=SIZE[o.art];drawSprite(im,left+(o.w-w)/2,o.bottom-h,w,h);}
    else rectPx(left,top,o.w,o.h,'#e08a4a');
  }
  // pickups
  for(const p of g.pickups){
    const bob=Math.round(Math.sin(g.time*5+p.id)*3/PX)*PX;
    if(p.kind==='ballot'){const im=SPR.ballot,[w,h]=SIZE.ballot;if(im)drawSprite(im,p.x-w/2,p.y-h/2+bob,w,h);else rectPx(p.x-10,p.y-12,20,24,'#fff');}
    else{const im=SPR[p.kind],[w,h]=SIZE[p.kind];
      rectPx(p.x-w/2-6,p.y-h/2+bob-6,w+12,h+12,Math.floor(g.time*6)%2?'#ffffff88':'#ff2e7e44');drawSprite(im,p.x-w/2,p.y-h/2+bob,w,h);}
  }
  // rider
  const jy=Math.round(g.y/PX)*PX+(g.land>.3?PX:0);
  sx.fillStyle='#c86ea6';sx.globalAlpha=Math.max(.09,.3+g.y*.0008);sx.beginPath();sx.ellipse(296,505,116+g.y*.17,8,0,0,7);sx.fill();sx.globalAlpha=1;
  const skin=skinOf();
  if(g.state==='over'&&crashT()<CRASH){drawCrash(skin,jy);}
  else if(g.state!=='over'||Math.floor(performance.now()/240)%2){
    drawPixelBike(g,skin,g.drink>0);
    if(g.drink>0)for(let k=1;k<=2;k++){sx.globalAlpha=.25/k;sx.drawImage(bikeCv,BX-k*24,BY+jy,BW,BH);}
    sx.globalAlpha=g.invuln>0&&Math.floor(performance.now()/80)%2?.4:1;sx.drawImage(bikeCv,BX,BY+jy,BW,BH);sx.globalAlpha=1;
  }
  if(g.shield||g.invuln>0){const cx=300,cy=400+jy,rx=150,ry=118,blink=g.invuln>0&&Math.floor(performance.now()/90)%2;
    if(!blink)for(let a=0;a<64;a++){const t=a/64*Math.PI*2;if(a%4===3)continue;rectPx(cx+Math.cos(t)*rx,cy+Math.sin(t)*ry,3,3,a%8<4?'#7fc8ff':'#ffffff');}}
  if(g.magnet>0)for(let a=0;a<6;a++){const t=g.time*4+a;rectPx(300+Math.cos(t)*190,390+jy+Math.sin(t*1.3)*90,3,3,'#ff2e7e');}
  // particles & floating text
  const dt=1/60;
  for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.t+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=900*dt;if(p.t>p.life){parts.splice(i,1);continue;}rectPx(p.x,p.y,3,3,p.c);}
  for(let i=floats.length-1;i>=0;i--){const f=floats[i];f.t+=dt;if(f.t>1){floats.splice(i,1);continue;}
    if(f.t>.75&&Math.floor(f.t*20)%2)continue;const im=textSprite(f.str,f.color,'#ffffff'),sc=PX*f.scale;
    sx.drawImage(im,Math.round((f.x-im.width*sc/2)/PX)*PX,Math.round((f.y-f.t*50)/PX)*PX,im.width*sc,im.height*sc);}
  // weather & mood
  const ev=g.event,on=ev&&ev.t>=ev.warn,ramp=ev?Math.min(1,Math.min(ev.t,ev.warn+ev.dur-ev.t)/1):0;
  if(ev&&ev.type==='rain'&&on){
    for(let k=0;k<70;k++){const hx=(k*397.7)%1,hy=(k*613.3)%1,x=VB.x+((hx*VB.w-g.time*260-g.distance*.4)%VB.w+VB.w)%VB.w,y=VB.y+((hy*VB.h+g.time*900)%VB.h);rectPx(x,y,PX,12,'#b9a6ff');}
    sx.setTransform(K,0,0,K,0,0);const lv=fogLevels();sx.drawImage(lv[Math.min(2,Math.floor(ramp*3))],0,0);sx.setTransform(s,0,0,s,-VB.x*s,-VB.y*s);
  }
  if(ev&&ev.type==='wind'){for(let k=0;k<14;k++){const hy=(k*0.6180339*997)%1,x=VB.x+((k*211-g.time*(ev.dir>0?900:300))%VB.w+VB.w)%VB.w;rectPx(x,VB.y+120+hy*(VB.h-240),40,PX,'#ffffffaa');}}
  if(g.slow>0){sx.fillStyle='#9b5cff22';sx.fillRect(VB.x,VB.y,VB.w,VB.h);}
  if(g.rush>0&&beatPulse>0){const c=beatPulse>.5?'#ff2e7e':'#ff7ab8';rectPx(VB.x,VB.y,6*PX,VB.h,c);rectPx(VB.x+VB.w-6*PX,VB.y,6*PX,VB.h,c);beatPulse=Math.max(0,beatPulse-.08);}
}

// ---------- HUD & panel ----------
const setText=(el,v)=>{v=String(v);if(el._t!==v){el._t=v;el.textContent=v;}};
const ICON={};
function buildIcons(){
  for(const k of ['ballot','drink','shield','slow','magnet'])if(SPR[k]&&!ICON[k]){const c=blank(SPR[k].width*4,SPR[k].height*4),x=c.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(SPR[k],0,0,c.width,c.height);ICON[k]=c.toDataURL();}
  for(const im of document.querySelectorAll('img[data-ico]'))if(ICON[im.dataset.ico])im.src=ICON[im.dataset.ico];
}
let prevScore=-1,itemsKey='';
function hud(){
  const sc=$('score');
  if(g.score!==prevScore){setText(sc,g.score);if(g.score>prevScore&&prevScore>=0){sc.classList.remove('score-pop');void sc.offsetWidth;sc.classList.add('score-pop');}prevScore=g.score;}
  setText($('best'),Math.max(best,g.score));
  setText($('bestLab'),daily?'今日最佳':MODE_NAME[g.mode]+'最佳');
  setText($('stageName'),`第 ${g.stage+1} 州 · ${stateName(g.stage)}${g.rush>0?' · 冲刺':''}`);
  const pr=(g.distance%g.cfg.stageLength)/g.cfg.stageLength;const bar=$('stageBar'),w=Math.floor(pr*20)*5+'%';if(bar._w!==w){bar._w=w;bar.style.width=w;}
  $('comboChip').hidden=g.combo<1;setText($('combo'),g.combo);setText($('mult'),g.mult);
  const items=[];
  for(const k of ['drink','slow','magnet'])if(g[k]>0)items.push([k,Math.ceil(g[k])+'s']);
  if(g.shield)items.push(['shield','×1']);
  const key=items.map(i=>i.join(':')).join(',');
  if(key!==itemsKey){itemsKey=key;$('itemChips').innerHTML=items.map(([k,t])=>`<div class="pbox chip">${ICON[k]?`<img src="${ICON[k]}" alt="">`:''}${t}</div>`).join('');}
  $('jump').textContent=g.reverse?'↓ 趴':'↑ 跳';$('duck').textContent=g.reverse?'↑ 跳':'↓ 趴';
}
const ROASTS=[
  [0,['刚出门就翻车了，选民还没醒。','这一跤摔得比民调还快。']],
  [20,['热身完毕，票箱才刚打开。','路障赢了这一局，下次再来。']],
  [60,['摇摆州开始注意到你了。','有点东西，计票员都抬头了。']],
  [150,['这速度，连夜赶场的气势出来了。','选票雪片一样飞来，稳住。']],
  [300,['横扫摇摆州！对手开始重新计票。','这是一场压倒性的……骑行。']],
  [600,['传奇夜骑，黎明时分你已经站在国会山前。','历史会记住这一晚（和这辆小车）。']]
];
const roastFor=s=>{let pool=ROASTS[0][1];for(const [m,l] of ROASTS)if(s>=m)pool=l;return pool[(s+g.ballots)%pool.length];};
const km=()=>(g.distance/26000*1.6).toFixed(1);
let prevState='',overAt=0,newBest=false,unlockMsg='';
function onOver(){
  overAt=performance.now();
  newBest=g.score>best;if(newBest){best=g.score;store.set(bestKey(),String(best));}
  const before=[...SKINS,...RIDERS].filter(x=>unlocked(x.need)).length;
  progress.best=Math.max(progress.best,g.score);progress.ballots+=g.ballots;progress.stage=Math.max(progress.stage,g.stage);
  progress.combo=Math.max(progress.combo,g.maxCombo);if(g.mode==='hell')progress.hell=Math.max(progress.hell,g.score);if(g.mode!=='casual')progress.hard=Math.max(progress.hard,g.score);progress.runs++;
  store.set('mnr-progress',JSON.stringify(progress));
  const after=[...SKINS,...RIDERS].filter(x=>unlocked(x.need));
  unlockMsg=after.length>before?`解锁了新东西：${after.slice(before-after.length).map(x=>x.name).join('、')}（去车库看看）`:'';
  buildGarage();
  setText($('finalScore'),g.score);$('newBest').hidden=!newBest;
  $('stats').innerHTML=[['选票',g.ballots],['擦边',g.nearCount],['最高连击',g.maxCombo],['州',g.stage+1],['里程',km()+' km'],['模式',daily?'今日挑战':MODE_NAME[g.mode]]].map(([a,b])=>`<div><span>${a}</span><b>${b}</b></div>`).join('');
  $('roast').textContent=roastFor(g.score)+(unlockMsg?' '+unlockMsg:'');
  $('announcement').textContent=`本轮结束，得分 ${g.score}。`;flash();
}
function panel(){
  if(g.state===prevState)return;
  if(g.state==='over'&&crashT()<CRASH){root.dataset.state='crash';return;}
  prevState=g.state;
  root.dataset.state=g.state;$('overlay').hidden=g.state==='running';
  if(g.state!=='running'){const o=$('overlay');o.classList.remove('scan');void o.offsetWidth;o.classList.add('scan');}
  const s=g.state;
  $('result').hidden=s!=='over';$('posterBtn').hidden=s!=='over';
  $('panelDesc').hidden=s==='over';$('setup').hidden=s==='paused';$('tabsWrap').hidden=s==='paused';
  $('pause').textContent=s==='paused'?'▶':'Ⅱ';$('pause').setAttribute('aria-label',s==='paused'?'继续赶路':'暂停赶路');
  if(s==='ready'){$('panelTag').textContent='MIDTERM NIGHT RIDE';$('panelTitle').textContent='中期选举 · 连夜赶路';$('mainLabel').textContent='开始赶场';}
  else if(s==='paused'){$('panelTag').textContent='路边歇口气';$('panelTitle').textContent='先停一下';$('panelDesc').textContent='已暂停。按空格、P 或点按钮继续赶路。';$('mainLabel').textContent='继续赶路';}
  else if(s==='over'){$('panelTag').textContent='这趟先到这儿';$('panelTitle').textContent=`在${stateName(g.stage)}翻车了`;$('mainLabel').textContent='再来一趟';onOver();}
  if(s!=='running')$('mainAction').focus({preventScroll:true});
}
function syncSetup(){
  for(const b of document.querySelectorAll('#modes button')){b.setAttribute('aria-checked',String(b.dataset.mode===mode));b.disabled=daily;}
  $('daily').checked=daily;$('dailyDate').textContent=today();
}
function render(){panel();hud();draw();}

// ---------- input (physical buttons map to logical actions; reversed during that event) ----------
const held={jump:new Set(),duck:new Set()};
const logical=k=>g.reverse?(k==='jump'?'duck':'jump'):k;
function syncHolds(){
  const J=[...held.jump,...held.duck].filter(s=>logical(s.k)==='jump').length>0,D=[...held.jump,...held.duck].filter(s=>logical(s.k)==='duck').length>0;
  g.setJumpHeld(J);g.setDuckHeld(D);
}
const srcs=new Map();
function press(k,id){
  if(srcs.has(id))return;
  if(g.state!=='running'){if(k==='jump')start();return;}
  const s={k,id};srcs.set(id,s);held[k].add(s);
  if(logical(k)==='jump')g.action();
  syncHolds();
}
function release(id){const s=srcs.get(id);if(!s)return;srcs.delete(id);held[s.k].delete(s);syncHolds();}
function clearHolds(){srcs.clear();held.jump.clear();held.duck.clear();g.setJumpHeld(false);g.setDuckHeld(false);}
function start(){
  if(g.state==='paused'){g.togglePause();return;}
  if(g.state==='over'&&(crashT()<CRASH||performance.now()-overAt<450))return;
  if(g.state==='ready'||g.state==='over'){
    g=PelicanGame.createGame({seed:newSeed(),mode:daily?'standard':mode});best=readBest();
    if(manual)window.__pelican.game=g;
    prevScore=-1;parts.length=0;floats.length=0;root.classList.remove('reversed');
    g.action();
  }
  root.focus({preventScroll:true});
}
function pause(){clearHolds();g.togglePause();}
const isJump=c=>c==='Space'||c==='ArrowUp'||c==='KeyW',isDuck=c=>c==='ArrowDown'||c==='KeyS';
document.addEventListener('keydown',e=>{
  if(!$('posterView').hidden){if(e.code==='Escape')closePoster();return;}
  const t=e.target,ctl=t&&t.closest&&t.closest('#overlay button,#overlay input,#overlay a');
  if(ctl&&ctl.id!=='mainAction'&&(e.code==='Space'||e.code==='Enter'))return;
  if(isJump(e.code)||(e.code==='Enter'&&g.state!=='running')){e.preventDefault();if(!e.repeat)press('jump','key');}
  else if(isDuck(e.code)){e.preventDefault();if(!e.repeat)press('duck','kduck');}
  else if(e.code==='KeyP'||e.code==='Escape'){e.preventDefault();if(!e.repeat&&g.state!=='ready'&&g.state!=='over')pause();}
});
document.addEventListener('keyup',e=>{if(isJump(e.code)||e.code==='Enter')release('key');if(isDuck(e.code))release('kduck');});
function bindHold(btn,k){
  btn.addEventListener('pointerdown',e=>{if(e.button>0)return;e.preventDefault();try{btn.setPointerCapture(e.pointerId);}catch{}press(k,'b'+k+e.pointerId);});
  btn.addEventListener('lostpointercapture',e=>release('b'+k+e.pointerId));
  btn.addEventListener('click',e=>{if(e.detail===0){press(k,'click');release('click');}});
  btn.addEventListener('contextmenu',e=>e.preventDefault());
}
bindHold($('jump'),'jump');bindHold($('duck'),'duck');
let swipe=null;
document.addEventListener('pointerdown',e=>{
  if(e.target.closest('button,a,input,label,#overlay,#posterView'))return;
  root.focus({preventScroll:true});
  if(g.state!=='running'||e.button>0)return;
  e.preventDefault();swipe={id:e.pointerId,y:e.clientY};press('jump','p'+e.pointerId);
});
document.addEventListener('pointermove',e=>{if(swipe&&swipe.id===e.pointerId&&e.clientY-swipe.y>30&&g.state==='running'){release('p'+e.pointerId);press('duck','s'+e.pointerId);swipe=null;}});
for(const n of ['pointerup','pointercancel'])document.addEventListener(n,e=>{release('p'+e.pointerId);release('s'+e.pointerId);release('bjump'+e.pointerId);release('bduck'+e.pointerId);if(swipe&&swipe.id===e.pointerId)swipe=null;});
$('mainAction').addEventListener('click',()=>{start();});
$('pause').addEventListener('click',()=>{pause();root.focus({preventScroll:true});});
function autoPause(){clearHolds();if(g.state==='running')g.togglePause();lastFrame=0;}
window.addEventListener('blur',autoPause);
document.addEventListener('visibilitychange',()=>{if(document.hidden)autoPause();lastFrame=0;});
for(const b of document.querySelectorAll('#modes button'))b.addEventListener('click',()=>{mode=b.dataset.mode;store.set('mnr-mode',mode);best=readBest();syncSetup();});
$('daily').addEventListener('change',()=>{daily=$('daily').checked;store.set('mnr-daily',daily?'1':'0');best=readBest();syncSetup();});
for(const t of document.querySelectorAll('.tabs button'))t.addEventListener('click',()=>{
  for(const u of document.querySelectorAll('.tabs button')){const on=u===t;u.setAttribute('aria-selected',String(on));$('tab-'+u.dataset.tab).hidden=!on;}
});
const soundBtn=document.createElement('button');soundBtn.className='small';soundBtn.type='button';
const syncSound=()=>{soundBtn.textContent=sfx.muted?'♪ 关':'♪ 开';soundBtn.setAttribute('aria-label',sfx.muted?'打开声音':'关闭声音');};
soundBtn.addEventListener('click',()=>{sfx.toggle();syncSound();if(sfx.muted)bgm.pause();root.focus({preventScroll:true});});
$('pause').before(soundBtn);syncSound();
// iOS Safari ignores user-scalable=no: block pinch and double-tap zoom by hand.
for(const n of ['gesturestart','gesturechange','gestureend'])document.addEventListener(n,e=>e.preventDefault(),{passive:false});
let lastTouchEnd=0;
document.addEventListener('touchend',e=>{const now=Date.now();if(now-lastTouchEnd<350&&!e.target.closest('button,a,input,label'))e.preventDefault();lastTouchEnd=now;},{passive:false});
document.addEventListener('touchmove',e=>{if(e.touches.length>1)e.preventDefault();},{passive:false});
document.addEventListener('selectstart',e=>e.preventDefault());

// ---------- garage: riders, skins, custom photos ----------
function preview(skin,headImg){
  const fake={distance:40,ducking:false,y:0},keep=headLow;if(headImg!==undefined)headLow=headImg;
  drawPixelBike(fake,skin,false);headLow=keep;
  const c=blank(64,48),x=c.getContext('2d');x.drawImage(bikeCv,0,0,bikeCv.width,bikeCv.height,0,-6,64*bikeCv.width/bikeCv.width,48*bikeCv.height/bikeCv.width*1.333);return c;
}
const riderHeads={};
function buildGarage(){
  const rl=$('riderList'),sl=$('skinList'),cur=riderChoice(),sk=skinOf().id;
  rl.replaceChildren();sl.replaceChildren();
  const pOK=photoUnlocked();
  for(const b of document.querySelectorAll('[data-upload],#resetArt'))b.disabled=!pOK;
  if(!pOK)$('garageNote').textContent=`未解锁 · 条件：${PHOTO_NEED.text}（当前最高 ${progress.hard} 分 · 第 ${progress.stage+1} 州）`;
  else if(/^未解锁/.test($('garageNote').textContent))$('garageNote').textContent='照片只在你的浏览器里处理，不会上传。';
  for(const R of RIDERS){
    const ok=unlocked(R.need),b=document.createElement('button');b.type='button';b.className='opt';b.disabled=!ok;b.setAttribute('aria-pressed',String(R.id===cur));
    const cv=blank(48,36);if(riderHeads[R.id]){const x=cv.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(riderHeads[R.id],8,0,32,36);}
    b.append(cv);const n=document.createElement('span');n.textContent=R.name;b.append(n);
    if(!ok){const m=document.createElement('small');m.textContent=R.need.text;b.append(m);}
    b.addEventListener('click',()=>{store.set('mnr-rider',R.id);loadArt();});rl.append(b);
  }
  for(const S of SKINS){
    const ok=unlocked(S.need),b=document.createElement('button');b.type='button';b.className='opt';b.disabled=!ok;b.setAttribute('aria-pressed',String(S.id===sk));
    b.append(preview(S));const n=document.createElement('span');n.textContent=S.name;b.append(n);
    if(!ok){const m=document.createElement('small');m.textContent=S.need.text;b.append(m);}
    b.addEventListener('click',()=>{skinId=S.id;store.set('mnr-skin',S.id);buildGarage();});sl.append(b);
  }
}
function loadRiderHeads(){
  const src={trump:ART.head,pelosi:ART.ground,putin:ART.air,custom:customArt('head')};
  return Promise.all(Object.entries(src).filter(([,u])=>u).map(([k,u])=>loadImg(u).then(i=>{riderHeads[k]=photoHead(i);}).catch(()=>{}))).then(buildGarage);
}
let uploadTarget='head';
for(const b of document.querySelectorAll('[data-upload]'))b.addEventListener('click',()=>{uploadTarget=b.dataset.upload;$('avatarFile').click();});
function takePhoto(file,target){
  if(!file||!/^image\//.test(file.type))return;
  const url=URL.createObjectURL(file);
  loadImg(url).then(img=>{
    URL.revokeObjectURL(url);
    const iw=img.naturalWidth,ih=img.naturalHeight,s=Math.min(1,320/Math.max(iw,ih)),c=blank(Math.round(iw*s),Math.round(ih*s));
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    let data;try{data=c.toDataURL('image/webp',.9);if(!data.startsWith('data:image/webp'))data=c.toDataURL('image/jpeg',.9);}catch{return;}
    try{localStorage.setItem('mnr-art-'+target,data);}catch{$('garageNote').textContent='浏览器存储已满，照片只在本次有效。';}
    if(target==='head')store.set('mnr-rider','custom');
    delete SPR.head;delete SPR.air;
    $('garageNote').textContent=target==='head'?'已换成你的照片当车手！背景会自动抠掉（纯色背景效果最好）。':'已替换障碍头像。';
    loadArt();loadRiderHeads();
  }).catch(()=>{$('garageNote').textContent='这张图片读不了，换一张试试。';});
}
$('avatarFile').addEventListener('change',e=>{takePhoto(e.target.files[0],uploadTarget);e.target.value='';});
root.addEventListener('dragover',e=>e.preventDefault());
root.addEventListener('drop',e=>{e.preventDefault();const f=e.dataTransfer&&e.dataTransfer.files[0];if(f&&photoUnlocked())takePhoto(f,'head');});
$('resetArt').addEventListener('click',()=>{for(const k of ['head','ground','air'])store.del('mnr-art-'+k);store.set('mnr-rider','trump');delete SPR.head;delete SPR.air;$('garageNote').textContent='已恢复默认素材。';loadArt();loadRiderHeads();});

// ---------- result poster (pixel canvas, 4x nearest-neighbour) ----------
function pixWrite(x,str,px,py,scale,color,align,outline){
  const im=textSprite(str,color,outline||''),w=im.width*scale;
  x.drawImage(im,align==='center'?Math.round(px-w/2):align==='right'?px-w:px,py,w,im.height*scale);
}
function makePoster(){
  const Wp=270,Hp=400,c=blank(Wp,Hp),x=c.getContext('2d');x.imageSmoothingEnabled=false;
  x.fillStyle='#ffe4f1';x.fillRect(0,0,Wp,Hp);
  for(let y=0;y<Hp;y+=8)for(let i=(y/8)%2*8;i<Wp;i+=16){x.fillStyle='#ffd9ec';x.fillRect(i,y,8,8);}
  const bg=BG[g.stage%BG_COUNT];
  x.fillStyle='#7a1548';x.fillRect(10,40,250,150);
  if(bg)x.drawImage(bg,40,BG_STRIP[g.stage%BG_COUNT]-150,280,170,13,43,244,147);
  drawPixelBike({distance:200,ducking:false,y:0},skinOf(),false);
  x.save();x.beginPath();x.rect(13,43,244,147);x.clip();x.drawImage(bikeCv,70,72,bikeCv.width*.9,bikeCv.height*.9);x.restore();
  pixWrite(x,'MIDTERM NIGHT RIDE',Wp/2,8,1,'#ff7ab8','center');
  pixWrite(x,'中期选举夜骑',Wp/2,20,1,'#ffffff','center','#7a1548');
  x.fillStyle='#7a1548';x.fillRect(10,198,250,190);x.fillStyle='#fffafd';x.fillRect(13,201,244,184);
  pixWrite(x,daily?`今日挑战 ${today()}`:`${MODE_NAME[g.mode]}模式 · ${today()}`,Wp/2,206,1,'#ff2e7e','center');
  pixWrite(x,String(g.score),Wp/2,222,3,'#ff2e7e','center','#7a1548');
  pixWrite(x,newBest?'分 · 新纪录！':'分',Wp/2,274,1,'#a8648f','center');
  const st=[['选票',g.ballots],['擦边',g.nearCount],['最高连击',g.maxCombo],['跑到',`第${g.stage+1}州`]];
  st.forEach(([a,b],i)=>{const cx=24+(i%2)*124,cy=292+Math.floor(i/2)*22;pixWrite(x,a,cx,cy,1,'#a8648f');pixWrite(x,String(b),cx+110,cy,1,'#4a0c30','right');});
  const roast=roastFor(g.score);let line='',ly=340;
  for(const ch of roast){if(line.length>=19){pixWrite(x,line,Wp/2,ly,1,'#7a1548','center');line='';ly+=15;}line+=ch;}
  if(line)pixWrite(x,line,Wp/2,ly,1,'#7a1548','center');
  pixWrite(x,'xm6661885.github.io/trump-game-pc98',Wp/2,Hp-14,1,'#ff7ab8','center');
  const o=blank(Wp*4,Hp*4),ox=o.getContext('2d');ox.imageSmoothingEnabled=false;ox.drawImage(c,0,0,o.width,o.height);return o;
}
let posterBlob=null;
$('posterBtn').addEventListener('click',()=>{
  const cv=makePoster(),url=cv.toDataURL('image/png');$('posterImg').src=url;$('posterSave').href=url;$('posterView').hidden=false;
  posterBlob=null;cv.toBlob(b=>{posterBlob=b;$('posterShare').hidden=!(b&&navigator.canShare&&navigator.canShare({files:[new File([b],'p.png',{type:'image/png'})]}));});
  $('posterClose').focus();
});
$('posterShare').addEventListener('click',()=>{if(!posterBlob)return;navigator.share({files:[new File([posterBlob],'midterm-night-ride.png',{type:'image/png'})],title:'中期选举夜骑',text:`我在中期选举夜骑跑了 ${g.score} 分！`}).catch(()=>{});});
function closePoster(){$('posterView').hidden=true;$('posterBtn').focus();}
$('posterClose').addEventListener('click',closePoster);

// ---------- loop & boot ----------
let lastFrame=0;
function step(dt){g.update(dt);drain();render();}
function tick(now){
  if(lastFrame&&g.state==='running')g.update(Math.min((now-lastFrame)/1000,.05));
  lastFrame=now;drain();if(g.state!=='running')clearHolds();render();bgmUpdate();requestAnimationFrame(tick);
}
layout();addEventListener('resize',()=>{layout();render();});
syncSetup();prepGround();
$('best').textContent=String(best);
const fontsReady=document.fonts?document.fonts.ready:Promise.resolve();
fontsReady.then(()=>textCache.clear());
loadArt().then(loadRiderHeads);
prepBg(0).then(()=>{prepBg(1);render();});
render();
if(manual){window.__pelican={game:g,step,render};}else requestAnimationFrame(tick);
})();
