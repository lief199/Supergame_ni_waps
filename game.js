(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // -------------------- UI Elements --------------------
  const ui = {
    p1hp: document.querySelector('#p1hp .fill'),
    p1st: document.querySelector('#p1st .fill'),
    p2hp: document.querySelector('#p2hp .fill'),
    p2st: document.querySelector('#p2st .fill'),
    timer: document.getElementById('timer')
  };

  // -------------------- Overlay Screens --------------------
  const startScreen = document.getElementById('startScreen');
  const startBtn = document.getElementById('startBtn');
  const rematchScreen = document.getElementById('rematchScreen');
  const rematchBtn = document.getElementById('rematchBtn');
  const rematchMessage = document.getElementById('rematchMessage');
  const rematchLeaderboardEl = document.getElementById('rematchLeaderboard');

  // -------------------- Leaderboard / API config --------------------
  // Replace this with your Apps Script Web App URL after you deploy
 fetch(GOOGLE_SHEETS_URL, {
  method: "POST",
  body: JSON.stringify({ name: winnerName, wins: winCount }),
  headers: { "Content-Type": "application/json" }
})
.then(res => res.json())
.then(data => {
  console.log("Saved to Google Sheets:", data);
})
.catch(err => console.error("Error:", err));

  // -------------------- Player name state (new) --------------------
  let player1Name = 'P1';
  let player2Name = 'P2';

  let gameStarted = false;
  let paused = true; // paused until start

  // -------------------- Center Screens --------------------
  function centerScreen(screen) {
    screen.style.display = 'flex';
    screen.style.top = '50%';
    screen.style.left = '50%';
    screen.style.transform = 'translate(-50%, -50%)';
  }

  function showStartScreen() { centerScreen(startScreen); }
  function showRematchScreen(winner) {
    rematchMessage.textContent = winner + " Wins!";
    centerScreen(rematchScreen);
    paused = true;
  }

  // -------------------- Game Start --------------------
  startBtn.addEventListener('click', () => {
    // read player names from start screen inputs if present
    const n1 = document.getElementById('player1Name');
    const n2 = document.getElementById('player2Name');
    player1Name = (n1 && n1.value.trim()) ? n1.value.trim() : 'P1';
    player2Name = (n2 && n2.value.trim()) ? n2.value.trim() : 'P2';

    // update HUD labels (we added IDs in HTML)
    const p1Label = document.getElementById('p1NameLabel');
    const p2Label = document.getElementById('p2NameLabel');
    if(p1Label) p1Label.textContent = `${player1Name} (Sky Blue)`;
    if(p2Label) p2Label.textContent = `${player2Name} (Orange)`;

    startScreen.style.display = 'none';
    gameStarted = true;
    paused = false;
    resetGame(true); // start countdown now
  });

 rematchBtn.addEventListener('click', () => {
  rematchScreen.style.display = 'none';
  paused = false;

  // If someone already won the match, restart the whole game
  if(p1Wins >= 2 || p2Wins >= 2){
    resetGame(true); // full reset, start countdown
  } else {
    resetRound(true); // next round only
    gameStarted = true;
  }
});

  // -------------------- Load Sprites --------------------
  const P1sprites = {
    idle: Object.assign(new Image(), { src: './images/blue.png' }),
    left: Object.assign(new Image(), { src: './images/blue-leftjab.png' }),
    right: Object.assign(new Image(), { src: './images/blue-rightjab.png' }),
    shield: Object.assign(new Image(), { src: './images/blue-shield.png' })
  };

  const P2sprites = {
    idle: Object.assign(new Image(), { src: './images/red.png' }),
    left: Object.assign(new Image(), { src: './images/red-left.png' }),
    right: Object.assign(new Image(), { src: './images/red-right.png' }),
    shield: Object.assign(new Image(), { src: './images/red-shield.png' })
  };

  // -------------------- World & Game State --------------------
  const WORLD = { w: canvas.width, h: canvas.height, floorY: 460, ringPad: 60 };
  let showHitboxes = false, roundTime = 99, lastSecTick = 0;
  let countdown = 0, countdownActive = false;
  let roundNumber = 1, maxRounds = 3, p1Wins = 0, p2Wins = 0, roundActive = false;

 const Keys = { a:false,d:false,f:false,g:false,
               w:false,ArrowUp:false,  // changed keys
               ArrowLeft:false,ArrowRight:false,period:false,slash:false,
               Enter:false,r:false,o:false };

 const KeyMap = {
  'KeyA':'a','KeyD':'d','KeyF':'f','KeyG':'g','KeyW':'w',      // P1 cover = W
  'ArrowLeft':'ArrowLeft','ArrowRight':'ArrowRight','Period':'period','Slash':'slash','ArrowUp':'ArrowUp', // P2 cover = ArrowUp
  'Enter':'Enter','KeyR':'r','KeyO':'o'
};


  addEventListener('keydown', e => {
    const k = KeyMap[e.code]; if(!k) return;
    if(['Enter','h'].includes(k)) e.preventDefault();
    Keys[k]=true;
    if(k==='Enter'){ paused=!paused; updatePauseMenu(); }
    if(k==='o') showHitboxes=!showHitboxes;
    if(k==='r') resetGame();
  });

  addEventListener('keyup', e => { const k = KeyMap[e.code]; if(k) Keys[k]=false; });

  // -------------------- Attacks --------------------
  const ATTACKS = {
    leftJab:{ damage:6, range:45, width:15, height:10, windup:150, active:120, recover:180, knockback:3.5, stamCost:6 },
    rightJab:{ damage:7, range:45, width:15 , height:10, windup:150, active:120, recover:180, knockback:3, stamCost:7 }
  };
  const COVER = { reduce:0.4, stamPerHit:12, stamPerTick:8/60, pushback:8 };
  const STAM = { max:100, regen:12/60, cooldown:700 };

  function createPlayer(x, name, sprites){
    return {x, y:WORLD.floorY-120, w:60, h:120, dir:1, vx:0, speed:0.4,
            maxHP:100, hp:100, maxStam:STAM.max, stam:STAM.max, stamLock:0,
            attacking:null, attackTimer:0, hasHit:false, covering:false, hitstun:0,
            coverTimer:0, name, sprites};
  }

  // Use the current name variables when creating P1/P2 so chosen names persist
  const P1 = createPlayer(WORLD.ringPad+60, player1Name, P1sprites);
  const P2 = createPlayer(WORLD.w-WORLD.ringPad-120, player2Name, P2sprites); P2.dir=-1;

  // -------------------- Pause Menu --------------------
  function updatePauseMenu(){ document.getElementById('pauseMenu').style.display = paused?'flex':'none'; }
  document.getElementById('resumeBtn').addEventListener('click', ()=>{ paused=false; updatePauseMenu(); });

  // -------------------- Scoreboard --------------------
  function updateScoreboard(){
    // show names on scoreboard now
    document.getElementById('p1score').textContent = `${player1Name} Wins: ${p1Wins}`;
    document.getElementById('p2score').textContent = `${player2Name} Wins: ${p2Wins}`;
    document.getElementById('round').textContent = `Round: ${roundNumber} / ${maxRounds}`;
  }

  // -------------------- Reset / Round --------------------
  function resetRound(startCountdownFlag = false){
    // preserve chosen player names when resetting player objects
    Object.assign(P1, createPlayer(WORLD.ringPad+60, player1Name, P1sprites));
    Object.assign(P2, createPlayer(WORLD.w-WORLD.ringPad-120, player2Name, P2sprites)); P2.dir=-1;
    roundTime=99; lastSecTick=0; updateScoreboard();
    if(startCountdownFlag) startCountdown();
  }

  function resetGame(startCountdownFlag = false){
    roundNumber=1; p1Wins=0; p2Wins=0;
    resetRound(startCountdownFlag);
  }

  function startCountdown(){
    countdown=3; countdownActive=true; paused=true; roundActive=false;
    let interval=setInterval(()=>{
      if(countdown>1) countdown--;
      else { clearInterval(interval); countdown="FIGHT!";
             setTimeout(()=>{countdownActive=false; paused=false; roundActive=true;},1000); }
    },1000);
  }

  // -------------------- Utility --------------------
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
  const rectsOverlap=(a,b)=>a && b && a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;
  function makeHurtbox(p){ return { x:p.x+p.w*0.25, y:p.y+p.h*0.1, w:p.w*0.5, h:p.h*0.9 }; }
  function makeHitbox(p, kind) {
    const def = ATTACKS[kind];
    if(!def) return null;
    const w = def.range - def.width;
    const h = def.height;
    const x = p.dir === 1 ? p.x + p.w - 35 : p.x + 35 - w;
    return { x, y: p.y + p.h*0.25, w, h };
  }

  // -------------------- Input Handling --------------------
  function readInputs(){ return {
  p1:{left:Keys.a,right:Keys.d,leftJab:Keys.f,rightJab:Keys.g,cover:Keys.w},     // P1 cover = W
  p2:{left:Keys.ArrowLeft,right:Keys.ArrowRight,leftJab:Keys.period,rightJab:Keys.slash,cover:Keys.ArrowUp} // P2 cover = ArrowUp
}; }

  let prev={p1:{},p2:{}};
  function getPresses(inputs){
    const out={p1:{},p2:{}};
    for(const side of ['p1','p2']){
      for(const k in inputs[side]) out[side][k]=inputs[side][k]&&!prev[side][k];
    }
    prev=JSON.parse(JSON.stringify(inputs));
    return out;
  }

  // -------------------- Attack Logic --------------------
  function tryStartAttack(p,kind){
    const def = ATTACKS[kind]; if(!def) return;
    if(p.attacking||p.hitstun>0||p.stam<def.stamCost) return;
    p.attacking=kind; p.attackTimer=0; p.hasHit=false; p.stam-=def.stamCost; p.stamLock=STAM.cooldown;
  }
  function applyHit(attacker,defender,kind){
    const def = ATTACKS[kind]; if(!def) return;
    let dmg = def.damage;
    if(defender.covering && defender.stam>0){
      defender.stam=Math.max(0,defender.stam-COVER.stamPerHit);
      defender.x+=defender.dir*-COVER.pushback;
      dmg*=COVER.reduce;
    }
    defender.hp=Math.max(0,defender.hp-dmg);
    defender.hitstun=240; defender.vx=(attacker.dir===1?1:-1)*def.knockback;
  }

  // -------------------- Player Tick --------------------
  function tickPlayer(p,inps,presses,opp,dt){
    if(p.hitstun>0){ p.hitstun-=dt; p.x+=p.vx; p.vx*=0.8; return; }
    p.covering=inps.cover;
    if(!p.attacking && p.stam>0){ if(inps.left){p.x-=p.speed*dt;p.dir=-1;} if(inps.right){p.x+=p.speed*dt;p.dir=1;} }
    if(presses.leftJab) tryStartAttack(p,'leftJab');
    if(presses.rightJab) tryStartAttack(p,'rightJab');

    if(p.attacking){
      p.attackTimer+=dt;
      const def=ATTACKS[p.attacking]; const t=p.attackTimer;
      if(t>def.windup && t<=def.windup+def.active && !p.hasHit){
        const hb=makeHitbox(p,p.attacking);
        if(rectsOverlap(hb,makeHurtbox(opp))){ applyHit(p,opp,p.attacking); p.hasHit=true; }
      }
      if(t>def.windup+def.active+def.recover){ p.attacking=null; p.attackTimer=0; }
    }

    if(p.stam<STAM.max){ p.stamLock>0?p.stamLock-=dt:p.stam=Math.min(STAM.max,p.stam+STAM.regen*dt); }
    p.x=clamp(p.x,WORLD.ringPad,WORLD.w-WORLD.ringPad-p.w);
    if(p.covering){ p.stam=Math.max(0,p.stam-COVER.stamPerTick*dt); p.coverTimer=(p.coverTimer||0)+dt; } else p.coverTimer=0;
  }

  // -------------------- KO / Round End --------------------
  function checkKO(){
  if(!roundActive || !gameStarted) return;
  if(P1.hp <= 0){
    roundActive = false;
    p2Wins++;
    updateScoreboard();
    endRound(player2Name); // ✅ use player2Name instead of "P2"
  } 
  else if(P2.hp <= 0){
    roundActive = false;
    p1Wins++;
    updateScoreboard();
    endRound(player1Name); // ✅ use player1Name instead of "P1"
  }
}


  function endRound(winner){
  countdown = "K.O!";
  countdownActive = true;

  setTimeout(() => {
    countdownActive = false;

    if(p1Wins >= 2 || p2Wins >= 2){
      rematchMessage.textContent = winner + " Wins the Match!";
      saveMatchResult(winner); // ✅ directly pass the winner's name
      centerScreen(rematchScreen);
      getLeaderboard();
      paused = true;
    } else {
      roundNumber++;
      resetRound(true);
    }

  }, 1500);
}



  // -------------------- Draw Functions --------------------
  function drawRing(){
    ctx.fillStyle="#3b4a5a";
    ctx.fillRect(0,WORLD.floorY,WORLD.w,WORLD.h-WORLD.floorY);
    ctx.fillStyle="#2f6fab";
    ctx.fillRect(40,WORLD.floorY-20,WORLD.w-80,20);
    ctx.strokeStyle="#d9d9d9"; ctx.lineWidth=4;
    for(let i=0;i<3;i++){
      let y=WORLD.floorY-40-i*20;
      ctx.beginPath(); ctx.moveTo(40,y); ctx.lineTo(WORLD.w-40,y); ctx.stroke();
    }
    ctx.fillStyle="#bfbfbf";
    ctx.fillRect(30,WORLD.floorY-160,20,160);
    ctx.fillRect(WORLD.w-50,WORLD.floorY-160,20,160);
  }

  function drawPlayer(p){
    let img=p.covering?p.sprites.shield:p.attacking==='leftJab'?p.sprites.left:p.attacking==='rightJab'?p.sprites.right:p.sprites.idle;
    if(img && img.complete && img.naturalWidth>0){
      ctx.save(); ctx.globalAlpha=0.95;
      let frame=0; const frameCount=4; const frameHeight=img.height/frameCount;
      if(p.attacking){ const def=ATTACKS[p.attacking]; const total=def.windup+def.active+def.recover; frame=Math.floor((p.attackTimer/total)*frameCount); if(frame>=frameCount) frame=frameCount-1; }
      else if(p.covering){ const progress=Math.min(1,(p.coverTimer||0)/200); frame=Math.floor(progress*(frameCount-1)); if(frame>=frameCount) frame=frameCount-1; }
      else frame=Math.floor(Date.now()/200)%frameCount;
      if(p.dir===1){ ctx.translate(p.x+p.w,p.y); ctx.scale(-1,1); } else ctx.translate(p.x,p.y);
      ctx.drawImage(img,0,frame*frameHeight,img.width,frameHeight,0,0,p.w,p.h);
      ctx.restore();
    } else { ctx.fillStyle="#fff"; ctx.fillRect(p.x,p.y,p.w,p.h); }

    if(showHitboxes){
      const hurt=makeHurtbox(p); ctx.strokeStyle="lime"; ctx.strokeRect(hurt.x,hurt.y,hurt.w,hurt.h);
      if(p.attacking){ const hb=makeHitbox(p,p.attacking); ctx.strokeStyle="red"; ctx.strokeRect(hb.x,hb.y,hb.w,hb.h); }
    }
  }

  function updateUI(){
    ui.p1hp.style.width=`${P1.hp}%`;
    ui.p1st.style.width=`${P1.stam}%`;
    ui.p2hp.style.width=`${P2.hp}%`;
    ui.p2st.style.width=`${P2.stam}%`;
    ui.timer.textContent = roundTime;
  }

  // -------------------- Leaderboard functions (new) --------------------
  async function getLeaderboard(){
    // If WEB_APP_URL not configured, show placeholder (no network call)
    if(!WEB_APP_URL || WEB_APP_URL.startsWith('YOUR_')){
      // optionally clear or show example data
      const list = document.getElementById('leaderboardList');
      if(list) list.innerHTML = `<li>Set WEB_APP_URL to show leaderboard</li>`;
      if(rematchLeaderboardEl) rematchLeaderboardEl.innerHTML = `<div>Set WEB_APP_URL to show leaderboard</div>`;
      return;
    }

    try {
      const res = await fetch(WEB_APP_URL);
      const data = await res.json();

      // Expecting Google Sheets doGet that returns rows (array of arrays).
      let rows = Array.isArray(data) ? data : (data.rows || []);
      // If API returned an object with .values or other, handle some shapes:
      if(!rows.length && data.values && Array.isArray(data.values)) rows = data.values;

      // detect header row presence
      let start = 0;
      if(rows.length && Array.isArray(rows[0]) && typeof rows[0][0] === 'string'){
        if(/player/i.test(rows[0][0]) || /wins/i.test(rows[0][1])) start = 1;
      }

      const entries = [];
      for(let i = start; i < rows.length; i++){
        const r = rows[i];
        // r may be array: [name, wins] or object
        if(Array.isArray(r)){
          const name = String(r[0] ?? '').trim();
          const wins = Number(r[1] ?? 0);
          if(name) entries.push({name, wins});
        } else if(r && typeof r === 'object'){
          // look for likely keys
          const name = String(r.player ?? r.Player ?? r.name ?? r.Name ?? '').trim();
          const wins = Number(r.wins ?? r.Wins ?? r.count ?? 0);
          if(name) entries.push({name, wins});
        }
      }

      entries.sort((a,b)=>b.wins - a.wins);

      const list = document.getElementById('leaderboardList');
      if(list) list.innerHTML = entries.slice(0,10).map((e,i)=>`<li>${i+1}. ${e.name} - ${e.wins} wins</li>`).join('');

      if(rematchLeaderboardEl) {
        rematchLeaderboardEl.innerHTML = entries.slice(0,5).map((e,i)=>`<div>${i+1}. ${e.name} - ${e.wins} wins</div>`).join('');
      }

    } catch(err) {
      console.error('Failed to fetch leaderboard', err);
    }
  }

  async function saveMatchResult(winnerName){
    if(!WEB_APP_URL || WEB_APP_URL.startsWith('YOUR_')){
      console.log('WEB_APP_URL not set; skipping save. winner:', winnerName, 'score:', p1Wins, p2Wins);
      return;
    }

    const payload = {
      player1: player1Name,
      player2: player2Name,
      winner: winnerName,
      p1Wins: p1Wins,
      p2Wins: p2Wins
    };

    try {
      const res = await fetch(WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const txt = await res.text();
      console.log('Match saved:', txt);
      // refresh leaderboard after save
      getLeaderboard();
    } catch(err) {
      console.error('Failed to save match result', err);
    }
  }

  // -------------------- Main Loop --------------------
  let last=0;
  function loop(ts){
    if(!last) last=ts; let dt=ts-last; last=ts;
    if(!paused && gameStarted){
      let inputs=readInputs();
      let presses=getPresses(inputs);
      tickPlayer(P1,inputs.p1,presses.p1,P2,dt);
      tickPlayer(P2,inputs.p2,presses.p2,P1,dt);
      checkKO();
    }

    ctx.clearRect(0,0,WORLD.w,WORLD.h);
    drawRing(); drawPlayer(P1); drawPlayer(P2);

    if(countdownActive){
      ctx.save(); ctx.font="bold 100px Arial Black"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.lineWidth=8;
      if(countdown==="FIGHT!"){ const pulse=(Math.sin(Date.now()/150)+1)/2; ctx.fillStyle=`rgb(${200+pulse*55},0,0)`; ctx.strokeStyle="black"; }
      else ctx.fillStyle="yellow", ctx.strokeStyle="black";
      ctx.strokeText(countdown,WORLD.w/2,WORLD.h/2); ctx.fillText(countdown,WORLD.w/2,WORLD.h/2); ctx.restore();
    }

    updateUI(); updateScoreboard();
    if(!paused && ts-lastSecTick>1000){ roundTime=Math.max(0,roundTime-1); lastSecTick=ts; }

    requestAnimationFrame(loop);
  }

  // -------------------- Init --------------------
  // Show the start screen and show existing leaderboard snapshot if possible
  showStartScreen(); // show centered start screen
  // update HUD labels to initial names
  const p1LabelInit = document.getElementById('p1NameLabel');
  const p2LabelInit = document.getElementById('p2NameLabel');
  if(p1LabelInit) p1LabelInit.textContent = `${player1Name} (Sky Blue)`;
  if(p2LabelInit) p2LabelInit.textContent = `${player2Name} (Orange)`;

  resetGame(false); // don't start countdown yet
  // try to fetch leaderboard to pre-fill UI (if WEB_APP_URL set)
  getLeaderboard();
  requestAnimationFrame(loop);
})();

