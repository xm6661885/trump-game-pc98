/* Pure game logic (no DOM). Deterministic for a given seed + mode, so the
 * daily challenge gives everyone the same course. Works in Node for tests. */
(function(root){
'use strict';

const CONFIG=Object.freeze({
  startSpeed:470,
  maxSpeed:900,
  speedAcceleration:3.2,
  gravity:2050,
  fallGravity:2450,
  apexGravityScale:0.55,
  apexThreshold:110,
  maxFallSpeed:1100,
  jumpVelocity:-880,
  airJumpVelocity:-1250,
  airJumps:0,
  jumpCut:1,
  coyoteTime:0.09,
  jumpBuffer:0.1,
  spawnStart:1.0,
  spawnMin:1.25,
  spawnMax:2.0,
  airChance:0.3,
  spawnX:1000,
  scoreX:187,
  playerRight:405,
  groundBottom:500,
  airBottom:350,       // high enough that a ducked rider visibly clears it
  airHeight:80,
  physicsStep:1/120,
  duckDrop:42,
  duckFallGravity:6000,
  // Extras
  nearPad:20,          // obstacle inflated by this much = "擦边"
  comboWindow:8,       // seconds without a near miss before the combo resets
  stageLength:26000,   // distance per state
  rushTime:7,          // seconds of 计票冲刺 at the start of each new state
  slowScale:0.6,
  beat:0.625,         // 96 BPM; rush obstacles land every two beats
  comboGap:0.9,
  itemChance:0.13,
  unlockScale:1,      // multiplies the times at which harder patterns start appearing
  newChance:0.4       // share of ground/air spawns that use one of the newer faces
});

const MODES=Object.freeze({
  // Casual barely speeds up; hell starts fast, ramps hard and throws the tricky patterns early.
  casual:Object.freeze({startSpeed:380,maxSpeed:560,speedAcceleration:0.9,spawnMin:1.8,spawnMax:2.8,airChance:0.2,unlockScale:1.8,newChance:0.3,itemChance:0.2}),
  standard:Object.freeze({}),
  hell:Object.freeze({startSpeed:620,maxSpeed:1180,speedAcceleration:9,spawnMin:1.1,spawnMax:1.5,airChance:0.42,unlockScale:0.35,newChance:0.55,itemChance:0.08,comboGap:0.8})
});

const ITEMS=Object.freeze({
  drink:{time:5},   // invincible, smashes obstacles
  shield:{time:0},  // absorbs one hit
  slow:{time:4},    // world at 60% speed
  magnet:{time:8}   // pulls ballots in
});
const ITEM_KINDS=Object.keys(ITEMS);

// Ground obstacle shapes: w/h are hitbox sizes, art is drawn to match.
const GROUND=Object.freeze({
  head:{w:48,h:54},
  box:{w:50,h:52},
  barrier:{w:64,h:50},
  puddle:{w:120,h:16},
  bouncer:{w:48,h:54},
  rubio:{w:48,h:54},     // rolls in faster than the road
  khamenei:{w:56,h:74},  // tall: needs a full jump
  biden:{w:48,h:58}      // dozes flat, pops up when you get close
});

const multOf=c=>Math.min(5,1+Math.floor(c/2));

const Proto={
  random(){let r=this.rng;r^=r<<13;r^=r>>>17;r^=r<<5;this.rng=r>>>0;return this.rng/4294967296;},
  emit(type,data){if(!this.quiet)this.events.push(Object.assign({type},data));},
  reset(){
    const M=this.cfg;
    Object.assign(this,{state:'ready',y:0,vy:0,time:0,score:0,obstacles:[],pickups:[],distance:0,base:M.startSpeed,speed:M.startSpeed,wind:1,
      jumpHeld:false,duckHeld:false,ducking:false,buffer:0,coyote:0,airLeft:M.airJumps,cut:false,land:0,
      rng:(this.seed>>>0)||1,nextSpawn:M.spawnStart,nextId:1,
      combo:0,maxCombo:0,lastNear:-99,mult:1,nearCount:0,ballots:0,passed:0,smashed:0,
      drink:0,slow:0,magnet:0,shield:false,invuln:0,
      stage:0,rush:0,beatClock:0,event:null,nextEvent:0,reverse:false,events:[]});
    this.nextEvent=30+this.random()*15;
  },
  clone(){const c=structuredClone(Object.assign({},this));Object.setPrototypeOf(c,Proto);c.quiet=true;c.events=[];return c;},
  // Hitboxes follow the two wheels, frame, head, torso and the arm on the handlebar. pad>0 = near-miss probe.
  collides(o,pad){
    const M=this.cfg;
    if(!(o.x-pad<M.playerRight&&o.x+o.w+pad>M.scoreX))return false;
    const left=o.x+3-pad,right=o.x+o.w-3+pad,top=o.bottom-o.h+3-pad,bottom=o.bottom+(o.type==='air'?pad:0);
    for(const cx of [225,367]){
      const cy=462+this.y;
      const dx=cx-Math.max(left,Math.min(cx,right));
      const dy=cy-Math.max(top,Math.min(cy,bottom));
      if(dx*dx+dy*dy<36*36)return true;
    }
    const d=this.ducking?M.duckDrop:0;
    for(const [x1,x2,y1,y2,up] of [[230,365,444,470,0],[255,318,334,385,1],[258,305,375,402,1],[303,358,378,395,1]]){
      const oy=this.y+(up?Math.min(d,444-y1):0);
      if(x1<right&&x2>left&&y1+oy<bottom&&y2+oy>top)return true;
    }
    return false;
  },
  addObstacle(type,art,x,w,h,bottom,grp,extra){
    const o=Object.assign({id:this.nextId++,type,art,x,w,h,bottom,scored:false,grp},extra);
    this.obstacles.push(o);return o;
  },
  // Places one obstacle pattern at x. Returns {end, center} in world x.
  place(pat,x,kindR,patR,eff){
    const M=this.cfg,grp=()=>({near:false,hit:false});
    if(pat==='air'){this.addObstacle('air','air',x,80,M.airHeight,M.airBottom,grp());return {end:x+80,center:x+40};}
    if(pat==='puddle'){
      // Wide but flat: needs a long, well-timed jump. Width follows what one jump can cover.
      const w=Math.round(Math.max(76,Math.min(132,eff*0.595-180)));
      this.addObstacle('ground','puddle',x,w,GROUND.puddle.h,M.groundBottom,grp());return {end:x+w,center:x+w/2};
    }
    if(pat==='bouncer'){
      const G=GROUND.bouncer;
      this.addObstacle('bouncer','head',x,G.w,G.h,M.groundBottom,grp(),{amp:46,freq:Math.PI/0.7,phase:patR*Math.PI});
      return {end:x+G.w,center:x+G.w/2};
    }
    if(pat==='rubio'){
      const G=GROUND.rubio;this.addObstacle('ground','rubio',x,G.w,G.h,M.groundBottom,grp(),{fast:0.22});
      return {end:x+G.w,center:x+G.w/2,fast:true};
    }
    if(pat==='khamenei'||pat==='biden'){
      const G=GROUND[pat];this.addObstacle('ground',pat,x,G.w,pat==='biden'?18:G.h,M.groundBottom,grp(),pat==='biden'?{pop:G.h}:{});
      return {end:x+G.w,center:x+G.w/2};
    }
    if(pat==='zelensky'){
      // Two in a row: stay down until both have passed.
      const g=grp();this.addObstacle('air','zelensky',x,80,M.airHeight,M.airBottom,g,{scored:true});
      this.addObstacle('air','zelensky',x+110,80,M.airHeight,M.airBottom,g);
      return {end:x+190,center:x+95};
    }
    if(pat==='hillary'){
      // Swoops down from the top, already at duck height well before it reaches you.
      this.addObstacle('air','hillary',x,80,M.airHeight,M.airBottom,grp(),{drop:true});
      return {end:x+80,center:x+40};
    }
    if(pat==='combo'){
      this.addObstacle('ground','head',x,48,54,M.groundBottom,grp());
      const ax=x+this.base*M.comboGap;
      this.addObstacle('air','air',ax,80,M.airHeight,M.airBottom,grp());
      return {end:ax+80,center:ax+40,combo:true};
    }
    const art=kindR<0.55?'head':kindR<0.78?'box':'barrier',G=GROUND[art],step=G.w+8;
    // Clusters only as wide as one jump can clear at the slowest (head-wind) speed.
    const maxN=Math.max(1,Math.min(3,Math.floor((eff*0.595-210)/step)));
    const n=1+Math.floor(patR*maxN),g=grp();
    for(let k=0;k<n;k++)this.addObstacle('ground',art,x+k*step,G.w,G.h,M.groundBottom,g,{scored:k<n-1});
    const end=x+(n-1)*step+G.w;return {end,center:(x+end)/2};
  },
  addBallot(x,y,v){this.pickups.push({id:this.nextId++,kind:'ballot',x,y,r:16,value:v});},
  spawn(){
    const M=this.cfg,t=this.time,s=this.base,eff=s*0.92;
    // Fixed number of draws per spawn keeps the course identical for everyone on a seed.
    const r=this.random(),gapR=this.random(),kindR=this.random(),patR=this.random(),itemR=this.random(),itemK=this.random(),ballR=this.random(),newR=this.random();
    const rush=this.rush>0,u=M.unlockScale;
    let gap=rush?M.beat*2:M.spawnMin+gapR*(M.spawnMax-M.spawnMin);
    let pat='ground';
    if(t>6*u&&r<M.airChance)pat='air';
    else if(t>16*u&&r<M.airChance+0.08)pat='puddle';
    else if(t>22*u&&r<M.airChance+0.15)pat='bouncer';
    else if(t>28*u&&!rush&&r<M.airChance+0.22)pat='combo';
    if(t>10*u&&newR<M.newChance){
      const k=newR/M.newChance;
      if(pat==='ground')pat=k<0.34?'rubio':k<0.67?'khamenei':'biden';
      else if(pat==='air')pat=k<0.5||rush?'hillary':'zelensky';
    }
    const x=M.spawnX,p=this.place(pat,x,kindR,patR,eff);
    if(p.combo)gap=Math.max(gap,M.comboGap+M.spawnMin);
    if(pat==='zelensky')gap+=110/s;
    const next=x+s*gap,xc=(p.end+next)/2,val=rush?2:1;
    if(t>8&&itemR<M.itemChance&&!rush){
      this.pickups.push({id:this.nextId++,kind:ITEM_KINDS[Math.floor(itemK*ITEM_KINDS.length)],x:xc,y:262,r:24});
    }else if(ballR<(rush?1:0.72)){
      const b=ballR/(rush?1:0.72);
      if(pat==='air'&&b<0.5)for(let k=0;k<4;k++)this.addBallot(p.center+(k-1.5)*44,468,val);
      else if((pat==='ground'||pat==='puddle')&&b<0.45)for(let k=0;k<5;k++)this.addBallot(p.center+(k-2)*58,404-128*Math.sin(Math.PI*(k+.5)/5),val);
      else if(b<0.78)for(let k=0;k<5;k++)this.addBallot(xc+(k-2)*46,446,val);
      else for(let k=0;k<5;k++)this.addBallot(xc+(k-2)*50,392-130*Math.sin(Math.PI*(k+.5)/5),val);
    }
    if(rush){this.beatClock=0;this.emit('beat',{spawn:true});}
    // The fixed positive interval and speed cap preserve independent dodge windows (see tests/fairness.test.cjs).
    this.nextSpawn=gap;
  },
  add(base){this.score+=base*this.mult;},
  smash(o){o.dead=true;o.deadT=this.time;o.scored=true;this.smashed++;},
  updateEvent(step){
    const M=this.cfg;
    if(!this.event&&this.time>=this.nextEvent){
      if(this.rush>0)this.nextEvent=this.time+1;
      else{
        const r=this.random(),dirR=this.random();
        let type=['rain','wind','reverse'][Math.floor(r*3)];
        if(type==='reverse'&&!M.reverseOk)type='rain';
        const dur={rain:12,wind:10,reverse:6}[type];
        this.event={type,t:0,dur,warn:type==='reverse'?1.6:0,dir:dirR<0.5?-1:1};
        this.emit('event',{name:type,dir:this.event.dir});
      }
    }
    const e=this.event;
    if(e){
      e.t+=step;
      const on=e.t>=e.warn;
      if(e.type==='reverse'&&on!==this.reverse){this.reverse=on;this.emit('reverse',{on});}
      this.wind=e.type==='wind'?1+e.dir*0.08*Math.sin(Math.PI*Math.min(1,e.t/e.dur)):1;
      if(e.t>=e.warn+e.dur){
        if(this.reverse){this.reverse=false;this.emit('reverse',{on:false});}
        this.event=null;this.wind=1;this.nextEvent=this.time+18+this.random()*18;this.emit('eventEnd',{name:e.type});
      }
    }
  },
  setDuckHeld(held){this.duckHeld=Boolean(held)&&this.state==='running';if(!this.duckHeld)this.ducking=false;},
  setJumpHeld(held){this.jumpHeld=Boolean(held)&&this.state==='running';},
  togglePause(){
    if(this.state==='running'){this.state='paused';this.jumpHeld=false;this.duckHeld=false;this.ducking=false;}
    else if(this.state==='paused')this.state='running';
  },
  action(){
    if(this.state==='paused'){this.state='running';return;}
    if(this.state==='over')this.reset();
    if(this.state==='ready')this.state='running';
    if(this.state==='running')this.buffer=this.cfg.jumpBuffer;
  },
  update(dt){
    if(this.state!=='running'||!Number.isFinite(dt)||dt<=0)return;
    let remaining=Math.min(dt,0.1);
    // Slow motion dilates the whole world, physics included, so every window stays fair.
    if(this.slow>0)remaining*=this.cfg.slowScale;
    while(remaining>1e-8){
      const step=Math.min(remaining,this.cfg.physicsStep);remaining-=step;
      this.tick(step);
      if(this.state!=='running')return;
    }
  },
  tick(step){
    const M=this.cfg;
    this.time+=step;
    this.base=Math.min(M.maxSpeed,M.startSpeed+M.speedAcceleration*this.time);
    this.updateEvent(step);
    this.speed=this.base*this.wind;
    this.distance+=this.speed*step;
    const st=Math.floor(this.distance/M.stageLength);
    if(st>this.stage){this.stage=st;this.rush=M.rushTime;this.beatClock=0;this.emit('stage',{n:st});}
    if(this.rush>0){
      this.rush-=step;this.beatClock+=step;
      if(this.beatClock>=M.beat){this.beatClock-=M.beat;this.emit('beat',{});}
      if(this.rush<=0){this.rush=0;this.emit('rushEnd',{});}
    }
    for(const k of ['drink','slow','magnet'])if(this[k]>0){this[k]-=step;if(this[k]<=0){this[k]=0;this.emit('itemEnd',{kind:k});}}
    if(this.invuln>0)this.invuln=Math.max(0,this.invuln-step);

    const grounded=this.y===0&&this.vy===0;
    if(grounded){this.coyote=M.coyoteTime;this.airLeft=M.airJumps;}else this.coyote=Math.max(0,this.coyote-step);
    // A tap is always one full, fixed-height jump (Chrome-dino style); holding does not auto-rebound.
    if(this.buffer>0&&!(this.duckHeld&&grounded)){
      if(this.coyote>0){this.vy=M.jumpVelocity;this.coyote=0;this.buffer=0;this.cut=false;this.emit('jump',{});}
      else if(this.airLeft>0&&this.vy>-400){this.vy=M.airJumpVelocity;this.airLeft--;this.buffer=0;this.cut=false;this.emit('jump',{air:true});}
      else this.buffer=Math.max(0,this.buffer-step);
    }
    if(!this.jumpHeld&&this.vy<0&&!this.cut){this.vy*=M.jumpCut;this.cut=true;}
    let grav=this.duckHeld&&!grounded?M.duckFallGravity:this.vy>0?M.fallGravity:M.gravity;
    // Brief hang near the apex, then ease into the fall instead of snapping down.
    if(!this.duckHeld&&!grounded&&Math.abs(this.vy)<M.apexThreshold)grav*=M.apexGravityScale;
    this.y+=this.vy*step+0.5*grav*step*step;
    this.vy=Math.min(this.vy+grav*step,M.maxFallSpeed);
    if(this.y>=0&&this.vy>0){this.land=Math.min(1,this.vy/900);if(this.vy>300)this.emit('land',{v:this.vy});}
    if(this.y>=0){this.y=0;this.vy=0;}
    this.ducking=this.duckHeld&&this.y===0;

    this.nextSpawn-=step;
    if(this.nextSpawn<=0)this.spawn();

    for(const o of this.obstacles){
      o.x-=this.speed*step*(1+(o.fast||0));
      if(o.dead)continue;
      if(o.type==='bouncer')o.bottom=M.groundBottom-o.amp*Math.abs(Math.sin(o.phase+this.time*o.freq));
      if(o.drop)o.bottom=M.airBottom-Math.max(0,o.x-620)*0.75;
      if(o.pop)o.h=o.x>680?18:Math.min(o.pop,18+(680-o.x)*0.6);
      if(this.collides(o,0)){
        if(this.drink>0){this.smash(o);o.grp.hit=true;this.add(2);this.emit('smash',{x:o.x});continue;}
        if(this.invuln>0){o.grp.hit=true;continue;}
        if(this.shield&&M.items){this.shield=false;this.invuln=0.8;this.smash(o);o.grp.hit=true;this.combo=0;this.mult=1;this.emit('shieldBreak',{});continue;}
        this.state='over';this.jumpHeld=false;this.duckHeld=false;this.ducking=false;this.emit('die',{});return;
      }
      if(!o.grp.near&&this.collides(o,M.nearPad))o.grp.near=true;
      if(!o.scored&&o.x+o.w<M.scoreX){
        o.scored=true;this.passed++;
        if(o.grp.near&&!o.grp.hit){
          this.combo++;this.nearCount++;this.lastNear=this.time;this.maxCombo=Math.max(this.maxCombo,this.combo);
          this.mult=multOf(this.combo);this.add(2);this.emit('near',{combo:this.combo,mult:this.mult});
        }else{this.add(1);this.emit('pass',{});}
      }
    }
    if(this.combo>0&&this.time-this.lastNear>M.comboWindow){this.combo=0;this.mult=1;this.emit('comboLost',{});}
    this.obstacles=this.obstacles.filter(o=>o.x+o.w>-50&&!(o.dead&&this.time-o.deadT>1.2));

    const top=326+this.y+(this.ducking?M.duckDrop:0),bot=500+this.y,cy=(top+bot)/2;
    for(const p of this.pickups){
      p.x-=this.speed*step;
      if(this.magnet>0&&p.kind==='ballot'){
        const dx=300-p.x,dy=cy-p.y,d=Math.hypot(dx,dy);
        if(d<480){const v=1300*step;if(d<=v){p.x=300;p.y=cy;}else{p.x+=dx/d*v;p.y+=dy/d*v;}}
      }
      if(p.x>200-p.r&&p.x<410+p.r&&p.y>top-p.r&&p.y<bot+p.r){
        p.got=true;
        if(p.kind==='ballot'){this.ballots++;this.add(p.value);this.emit('ballot',{x:p.x,y:p.y,v:p.value*this.mult});}
        else if(M.items){
          if(p.kind==='shield')this.shield=true;else this[p.kind]=ITEMS[p.kind].time;
          this.emit('item',{kind:p.kind});
        }
      }
    }
    this.pickups=this.pickups.filter(p=>!p.got&&p.x>-60);
  }
};

function createGame({seed=42,mode='standard'}={}){
  const g=Object.create(Proto);
  g.seed=seed;g.mode=MODES[mode]?mode:'standard';
  g.cfg=Object.assign({},CONFIG,MODES[g.mode],{reverseOk:g.mode!=='casual',items:true});
  g.config=g.cfg;g.quiet=false;
  g.reset();
  return g;
}
const api={createGame,CONFIG,MODES,ITEMS,GROUND,multOf};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.PelicanGame=api;
})(typeof globalThis!=='undefined'?globalThis:this);
