// Fairness: a lookahead bot (no items, no shield) must survive every mode for
// several minutes across many seeds. If a pattern is impossible to dodge, the
// bot dies and this test fails with the seed and what killed it.
// Run: node tests/fairness.test.cjs [seeds] [seconds] [modes, e.g. hell,casual]
const {createGame}=require('../assets/game.js');
const DT=1/60;
const SEEDS=+(process.argv[2]||12),SECS=+(process.argv[3]||200);

function apply(g,a){
  if(a==='jump'){g.setDuckHeld(false);g.action();g.setJumpHeld(true);}
  else if(a==='duck'){g.setJumpHeld(false);g.setDuckHeld(true);}
  else{g.setJumpHeld(false);g.setDuckHeld(false);}
}
// plan: [[startFrame, action, frames], ...]; idle otherwise.
function survives(g,plan,frames){
  const c=g.clone();
  for(let f=0;f<frames;f++){
    let a='idle';
    for(const [s,act,len] of plan)if(f>=s&&f<s+len)a=act;
    apply(c,a);c.update(DT);
    if(c.state==='over')return false;
  }
  return true;
}
const H=100;
const ACTS=[['jump',6],['duck',40],['duck',75]];
function choose(g){
  if(survives(g,[],H))return 'idle';
  for(const [a,l] of ACTS)if(survives(g,[[0,a,l]],H))return a;
  // Waiting is often right: idle now if a single later action saves us.
  for(let k=3;k<60;k+=3)for(const [a,l] of ACTS)if(survives(g,[[k,a,l]],H))return 'idle';
  for(const [a,l] of ACTS)for(let k=4;k<70;k+=3)for(const [b,m] of ACTS)
    if(survives(g,[[0,a,l],[k,b,m]],H))return a;
  return null;
}
let fails=0;
for(const mode of (process.argv[4]||'casual,standard,hell').split(',')){
  for(let s=1;s<=SEEDS;s++){
    const g=createGame({seed:s*7919,mode});g.cfg.items=false;g.action();
    let hold=null,left=0,stuck=null;
    for(let f=0;f<SECS*60&&g.state!=='over';f++){
      if(left<=0){const a=choose(g);if(a===null&&!stuck)stuck=g.time;hold=a||'idle';left=hold==='jump'?6:hold==='duck'?4:1;}
      apply(g,hold);left--;g.update(DT);
    }
    if(g.state==='over'){
      fails++;
      const near=g.obstacles.filter(o=>o.x<480&&o.x+o.w>150).map(o=>`${o.art}/${o.type}@${o.x|0}`);
      console.log(`FAIL ${mode} seed=${s*7919} t=${g.time.toFixed(1)} speed=${g.speed|0} event=${g.event&&g.event.type} near=${near}`);
    }else console.log(`ok   ${mode} seed=${s*7919} t=${g.time.toFixed(0)} score=${g.score} stage=${g.stage} smashed=${g.smashed}`);
  }
}
if(fails){console.log(`${fails} failure(s)`);process.exit(1);}
console.log('all survivable');
