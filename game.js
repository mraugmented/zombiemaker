const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const TILE = 20; // size for all entities
const BASE_SPEED = 2; // base player speed
const HUMAN_SPEED = 1;
const SOLDIER_SPEED = 1.5;
const SPEED_BOOST_DURATION = 300; // frames
const SPEED_BOOST_MULT = 2;
const INVINCIBLE_DURATION = 300;
const FREEZE_DURATION = 300;

let highscore = Number(localStorage.getItem('highscore') || 0);
let score = 0;
let gameRunning = false;

let invincibleTimer = 0;
let freezeTimer = 0;

let walls = [];

let player;
let humans = [];
let zombies = [];
let soldiers = [];
let powerups = [];
let level = 1;
let speedBoostTimer = 0;

function randomPos() {
    let pos;
    let tries = 0;
    do {
        pos = {
            x: Math.random() * (canvas.width - TILE),
            y: Math.random() * (canvas.height - TILE)
        };
        tries++;
    } while (isInsideWall(pos) && tries < 100);
    return pos;
}

function isInsideWall(p) {
    for (const w of walls) {
        if (p.x < w.x + w.width && p.x + TILE > w.x &&
            p.y < w.y + w.height && p.y + TILE > w.y) {
            return true;
        }
    }
    return false;
}

function spawnHumans(count) {
    for (let i = 0; i < count; i++) {
        humans.push({ ...randomPos(), color: 'lightblue' });
    }
}

function spawnSoldiers(count) {
    for (let i = 0; i < count; i++) {
        soldiers.push({ ...randomPos(), color: 'red' });
    }
}

function spawnPowerups(count) {
    const types = ['speed', 'invincible', 'freeze'];
    for (let i = 0; i < count; i++) {
        const type = types[Math.floor(Math.random() * types.length)];
        let color = 'yellow';
        if (type === 'invincible') color = 'purple';
        if (type === 'freeze') color = 'white';
        powerups.push({ ...randomPos(), color, type });
    }
}

function playBeep(freq = 440, dur = 0.1) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + dur);
    } catch (e) {}
}

function createMaze() {
    walls = [];
    for (let x = 100; x <= 600; x += 200) {
        walls.push({ x, y: 100, width: 20, height: 400 });
    }
    for (let y = 100; y <= 400; y += 200) {
        walls.push({ x: 100, y, width: 600, height: 20 });
    }
}

function updateHud() {
    document.getElementById('infected-count').textContent = `Infected: ${zombies.length - 1}`;
    document.getElementById('level-info').textContent = `Level: ${level}`;
    const parts = [];
    if (speedBoostTimer > 0) parts.push('Speed');
    if (invincibleTimer > 0) parts.push('Invincible');
    if (freezeTimer > 0) parts.push('Freeze');
    document.getElementById('powerup-info').textContent = parts.join(' ');
    document.getElementById('score-info').textContent = `Score: ${score}`;
    document.getElementById('highscore-info').textContent = `Highscore: ${highscore}`;
}

function startLevel() {
    createMaze();
    player = { ...randomPos(), color: 'lime', speed: BASE_SPEED };
    zombies = [player];
    humans = [];
    soldiers = [];
    powerups = [];
    spawnHumans(5 + level * 5);
    if (level > 1) spawnSoldiers(level - 1);
    spawnPowerups(2);
    updateHud();
}

function resetGame() {
    level = 1;
    score = 0;
    speedBoostTimer = 0;
    invincibleTimer = 0;
    freezeTimer = 0;
    startLevel();
}

const keys = {};
window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup', e => keys[e.key] = false);

function movePlayer() {
    let moveSpeed = player.speed;
    if (speedBoostTimer > 0) {
        moveSpeed *= SPEED_BOOST_MULT;
        speedBoostTimer--;
    }
    const prev = { x: player.x, y: player.y };
    if (keys['ArrowUp'] || keys['w']) player.y -= moveSpeed;
    if (keys['ArrowDown'] || keys['s']) player.y += moveSpeed;
    if (keys['ArrowLeft'] || keys['a']) player.x -= moveSpeed;
    if (keys['ArrowRight'] || keys['d']) player.x += moveSpeed;
    player.x = Math.max(0, Math.min(player.x, canvas.width - TILE));
    player.y = Math.max(0, Math.min(player.y, canvas.height - TILE));
    if (isInsideWall(player)) {
        player.x = prev.x;
        player.y = prev.y;
    }
}

function moveZombies() {
    for (let i = 1; i < zombies.length; i++) {
        const z = zombies[i];
        let closest = null;
        let closestDist = Infinity;
        for (const h of humans) {
            const d = Math.hypot(z.x - h.x, z.y - h.y);
            if (d < closestDist) {
                closestDist = d;
                closest = h;
            }
        }
        if (closest) {
            const dx = Math.sign(closest.x - z.x) * HUMAN_SPEED;
            const dy = Math.sign(closest.y - z.y) * HUMAN_SPEED;
            const prev = { x: z.x, y: z.y };
            z.x += dx;
            z.y += dy;
            z.x = Math.max(0, Math.min(z.x, canvas.width - TILE));
            z.y = Math.max(0, Math.min(z.y, canvas.height - TILE));
            if (isInsideWall(z)) {
                z.x = prev.x;
                z.y = prev.y;
            }
        }
    }
}

function moveHumans() {
    for (const h of humans) {
        const target = zombies[0];
        let dx = h.x - target.x;
        let dy = h.y - target.y;
        const dist = Math.hypot(dx, dy) || 1;
        dx = (dx / dist) * HUMAN_SPEED;
        dy = (dy / dist) * HUMAN_SPEED;
        h.x += dx + (Math.random() - 0.5) * 0.5;
        h.y += dy + (Math.random() - 0.5) * 0.5;
        h.x = Math.max(0, Math.min(h.x, canvas.width - TILE));
        h.y = Math.max(0, Math.min(h.y, canvas.height - TILE));
        if (isInsideWall(h)) {
            h.x -= dx;
            h.y -= dy;
        }
    }
}

function moveSoldiers() {
    if (freezeTimer > 0) {
        freezeTimer--;
        return;
    }
    for (const s of soldiers) {
        let closest = player;
        let closestDist = Infinity;
        for (const z of zombies) {
            const d = Math.hypot(z.x - s.x, z.y - s.y);
            if (d < closestDist) { closestDist = d; closest = z; }
        }
        const dx = Math.sign(closest.x - s.x) * SOLDIER_SPEED;
        const dy = Math.sign(closest.y - s.y) * SOLDIER_SPEED;
        const prev = { x: s.x, y: s.y };
        s.x += dx;
        s.y += dy;
        s.x = Math.max(0, Math.min(s.x, canvas.width - TILE));
        s.y = Math.max(0, Math.min(s.y, canvas.height - TILE));
        if (isInsideWall(s)) { s.x = prev.x; s.y = prev.y; }
    }
}

function checkCollisions() {
    // player vs humans
    for (let i = humans.length - 1; i >= 0; i--) {
        const h = humans[i];
        if (Math.abs(h.x - player.x) < TILE && Math.abs(h.y - player.y) < TILE) {
            humans.splice(i, 1);
            zombies.push(h);
            h.color = 'lime';
            score++;
            playBeep();
            updateHud();
        }
    }

    // zombies vs humans
    for (let j = 0; j < zombies.length; j++) {
        const z = zombies[j];
        for (let i = humans.length - 1; i >= 0; i--) {
            const h = humans[i];
            if (Math.abs(h.x - z.x) < TILE && Math.abs(h.y - z.y) < TILE) {
                humans.splice(i, 1);
                zombies.push(h);
                h.color = 'lime';
                score++;
                playBeep();
                updateHud();
            }
        }
    }

    // zombies vs soldiers
    for (let i = soldiers.length - 1; i >= 0; i--) {
        const s = soldiers[i];
        for (let j = zombies.length - 1; j >= 0; j--) {
            const z = zombies[j];
            if (Math.abs(s.x - z.x) < TILE && Math.abs(s.y - z.y) < TILE) {
                if (z === player) {
                    if (invincibleTimer > 0) {
                        soldiers.splice(i, 1);
                    } else {
                        endGame();
                        return;
                    }
                } else {
                    if (invincibleTimer > 0) {
                        soldiers.splice(i, 1);
                    } else {
                        zombies.splice(j, 1);
                    }
                }
            }
        }
    }

    // player vs powerups
    for (let i = powerups.length - 1; i >= 0; i--) {
        const p = powerups[i];
        if (Math.abs(p.x - player.x) < TILE && Math.abs(p.y - player.y) < TILE) {
            powerups.splice(i, 1);
            if (p.type === 'speed') {
                speedBoostTimer = SPEED_BOOST_DURATION;
            } else if (p.type === 'invincible') {
                invincibleTimer = INVINCIBLE_DURATION;
            } else if (p.type === 'freeze') {
                freezeTimer = FREEZE_DURATION;
            }
            playBeep(880);
            updateHud();
        }
    }

    // check level end
    if (humans.length === 0) {
        level++;
        playBeep(660);
        startLevel();
    }
    if (invincibleTimer > 0) invincibleTimer--;
}

function drawCharacter(ent, type) {
    ctx.fillStyle = ent.color;
    // Head
    ctx.beginPath();
    ctx.arc(ent.x + TILE / 2, ent.y + TILE / 4, TILE / 4, 0, Math.PI * 2);
    ctx.fill();
    // Body
    ctx.fillRect(ent.x + TILE / 4, ent.y + TILE / 2, TILE / 2, TILE / 2);
    if (type === 'soldier') {
        // Gun
        ctx.fillStyle = 'black';
        ctx.fillRect(ent.x + TILE / 2, ent.y + TILE / 2, TILE / 2, TILE / 8);
    }
    // For zombie, add eyes
    if (type === 'zombie') {
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(ent.x + TILE / 3, ent.y + TILE / 5, TILE / 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ent.x + 2 * TILE / 3, ent.y + TILE / 5, TILE / 12, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawPowerup(ent) {
    ctx.fillStyle = ent.color;
    if (ent.type === 'speed') {
        // Triangle for speed
        ctx.beginPath();
        ctx.moveTo(ent.x + TILE / 2, ent.y);
        ctx.lineTo(ent.x + TILE, ent.y + TILE);
        ctx.lineTo(ent.x, ent.y + TILE);
        ctx.closePath();
        ctx.fill();
    } else if (ent.type === 'invincible') {
        // Circle for shield
        ctx.beginPath();
        ctx.arc(ent.x + TILE / 2, ent.y + TILE / 2, TILE / 2, 0, Math.PI * 2);
        ctx.fill();
    } else if (ent.type === 'freeze') {
        // Square with cross for snowflake
        ctx.fillRect(ent.x + TILE / 4, ent.y + TILE / 4, TILE / 2, TILE / 2);
        ctx.fillStyle = 'blue';
        ctx.fillRect(ent.x + TILE / 3, ent.y + TILE / 4, TILE / 3, TILE / 2);
        ctx.fillRect(ent.x + TILE / 4, ent.y + TILE / 3, TILE / 2, TILE / 3);
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#333';
    for (const w of walls) ctx.fillRect(w.x, w.y, w.width, w.height);
    for (const h of humans) drawCharacter(h, 'human');
    for (const s of soldiers) drawCharacter(s, 'soldier');
    for (const p of powerups) drawPowerup(p);
    for (const z of zombies) drawCharacter(z, 'zombie');
}

function gameLoop() {
    if (!gameRunning) return;
    movePlayer();
    moveZombies();
    moveHumans();
    moveSoldiers();
    checkCollisions();
    draw();
    updateHud();
    requestAnimationFrame(gameLoop);
}

document.getElementById('restart-btn').addEventListener('click', resetGame);
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('go-restart-btn').addEventListener('click', startGame);

function startGame() {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-over').classList.add('hidden');
    gameRunning = true;
    resetGame();
    requestAnimationFrame(gameLoop);
}

function endGame() {
    gameRunning = false;
    document.getElementById('final-score').textContent = `Score: ${score}`;
    if (score > highscore) {
        highscore = score;
        localStorage.setItem('highscore', highscore);
    }
    document.getElementById('high-score').textContent = `Highscore: ${highscore}`;
    document.getElementById('game-over').classList.remove('hidden');
}

// Initially show start screen
gameRunning = false;
