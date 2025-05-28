// Basic zombie game with levels, soldiers and powerups
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const size = 20;
let baseSpeed = 2;
let speed = baseSpeed;
const humanSpeed = 1;
const soldierSpeed = 1.5;

let level = 1;
let regionsCleared = 0;
const TOTAL_REGIONS = 5;

let player;
let zombies = [];
let humans = [];
let soldiers = [];
let powerups = [];
let speedTimer = 0;

const keys = {};
window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

function randomPos() {
  return {
    x: Math.random() * (canvas.width - size),
    y: Math.random() * (canvas.height - size)
  };
}

function spawnHumans(count) {
  humans = [];
  for (let i = 0; i < count; i++) {
    humans.push({ ...randomPos(), color: 'lightblue' });
  }
}

function spawnSoldiers(count) {
  soldiers = [];
  for (let i = 0; i < count; i++) {
    soldiers.push({ ...randomPos(), color: 'crimson' });
  }
}

function spawnPowerup() {
  powerups = [];
  if (Math.random() < 0.7) { // most levels have one powerup
    powerups.push({ ...randomPos(), color: 'yellow' });
  }
}

function spawnLevel() {
  const humanCount = 10 + level * 5;
  const soldierCount = Math.max(0, level - 1);
  spawnHumans(humanCount);
  spawnSoldiers(soldierCount);
  spawnPowerup();
}

function resetGame() {
  level = 1;
  regionsCleared = 0;
  speed = baseSpeed;
  zombies = [];
  humans = [];
  soldiers = [];
  powerups = [];
  player = { ...randomPos(), color: 'lime' };
  zombies.push(player);
  spawnLevel();
  updateHud();
}

function updateHud() {
  document.getElementById('level').textContent = `Level: ${level}`;
  document.getElementById('infected-count').textContent = `Infected: ${zombies.length}`;
  const percent = Math.floor((regionsCleared / TOTAL_REGIONS) * 100);
  document.getElementById('world-progress').textContent = `World: ${percent}%`;
  document.getElementById('powerup-status').textContent = speedTimer > 0 ? 'Speed Boost!' : '';
}

function movePlayer() {
  if (keys['arrowup'] || keys['w']) player.y -= speed;
  if (keys['arrowdown'] || keys['s']) player.y += speed;
  if (keys['arrowleft'] || keys['a']) player.x -= speed;
  if (keys['arrowright'] || keys['d']) player.x += speed;
  player.x = Math.max(0, Math.min(player.x, canvas.width - size));
  player.y = Math.max(0, Math.min(player.y, canvas.height - size));
}

function moveHumans() {
  for (const h of humans) {
    h.x += (Math.random() - 0.5) * humanSpeed * 2;
    h.y += (Math.random() - 0.5) * humanSpeed * 2;
    h.x = Math.max(0, Math.min(h.x, canvas.width - size));
    h.y = Math.max(0, Math.min(h.y, canvas.height - size));
  }
}

function moveSoldiers() {
  for (const s of soldiers) {
    // chase nearest zombie
    let target = zombies[0];
    for (const z of zombies) {
      if (Math.hypot(z.x - s.x, z.y - s.y) < Math.hypot(target.x - s.x, target.y - s.y)) {
        target = z;
      }
    }
    const angle = Math.atan2(target.y - s.y, target.x - s.x);
    s.x += Math.cos(angle) * soldierSpeed;
    s.y += Math.sin(angle) * soldierSpeed;
    s.x = Math.max(0, Math.min(s.x, canvas.width - size));
    s.y = Math.max(0, Math.min(s.y, canvas.height - size));
  }
}

function checkCollisions() {
  // player with powerup
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    if (Math.abs(p.x - player.x) < size && Math.abs(p.y - player.y) < size) {
      powerups.splice(i, 1);
      speed = baseSpeed * 2;
      speedTimer = 300; // frames
    }
  }

  // zombies infect humans
  for (let i = humans.length - 1; i >= 0; i--) {
    const h = humans[i];
    for (const z of zombies) {
      if (Math.abs(h.x - z.x) < size && Math.abs(h.y - z.y) < size) {
        humans.splice(i, 1);
        zombies.push(h);
        updateHud();
        break;
      }
    }
  }

  // soldiers kill zombies
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    for (const s of soldiers) {
      if (Math.abs(z.x - s.x) < size && Math.abs(z.y - s.y) < size) {
        zombies.splice(i, 1);
        if (z === player) {
          alert('Game Over');
          resetGame();
          return;
        }
        break;
      }
    }
  }
}

function drawEntity(entity) {
  ctx.fillStyle = entity.color;
  ctx.fillRect(entity.x, entity.y, size, size);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const p of powerups) drawEntity(p);
  for (const h of humans) drawEntity(h);
  for (const s of soldiers) drawEntity(s);
  for (const z of zombies) drawEntity(z);
}

function updateLevel() {
  if (humans.length === 0) {
    regionsCleared++;
    if (regionsCleared >= TOTAL_REGIONS) {
      alert('You infected the world!');
      resetGame();
      return;
    }
    level++;
    speed = baseSpeed;
    speedTimer = 0;
    spawnLevel();
    updateHud();
  }
}

function update() {
  movePlayer();
  moveHumans();
  moveSoldiers();
  checkCollisions();
  if (speedTimer > 0) {
    speedTimer--;
    if (speedTimer === 0) speed = baseSpeed;
  }
  draw();
  updateLevel();
  requestAnimationFrame(update);
}

document.getElementById('restart-btn').addEventListener('click', resetGame);

resetGame();
update();
