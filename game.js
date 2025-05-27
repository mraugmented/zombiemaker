const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const TILE = 20; // size for all entities
const BASE_SPEED = 2; // base player speed
const HUMAN_SPEED = 1;
const SOLDIER_SPEED = 1.5;
const SPEED_BOOST_DURATION = 300; // frames
const SPEED_BOOST_MULT = 2;

let player;
let humans = [];
let zombies = [];
let soldiers = [];
let powerups = [];
let level = 1;
let speedBoostTimer = 0;

function randomPos() {
    return {
        x: Math.random() * (canvas.width - TILE),
        y: Math.random() * (canvas.height - TILE)
    };
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
    for (let i = 0; i < count; i++) {
        powerups.push({ ...randomPos(), color: 'yellow' });
    }
}

function updateHud() {
    document.getElementById('infected-count').textContent = `Infected: ${zombies.length - 1}`;
    document.getElementById('level-info').textContent = `Level: ${level}`;
    document.getElementById('powerup-info').textContent = speedBoostTimer > 0 ? 'Speed!' : '';
}

function startLevel() {
    player = { ...randomPos(), color: 'lime', speed: BASE_SPEED };
    zombies = [player];
    humans = [];
    soldiers = [];
    powerups = [];
    spawnHumans(5 + level * 5);
    if (level > 1) spawnSoldiers(level - 1);
    spawnPowerups(1);
    updateHud();
}

function resetGame() {
    level = 1;
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
    if (keys['ArrowUp'] || keys['w']) player.y -= moveSpeed;
    if (keys['ArrowDown'] || keys['s']) player.y += moveSpeed;
    if (keys['ArrowLeft'] || keys['a']) player.x -= moveSpeed;
    if (keys['ArrowRight'] || keys['d']) player.x += moveSpeed;
    player.x = Math.max(0, Math.min(player.x, canvas.width - TILE));
    player.y = Math.max(0, Math.min(player.y, canvas.height - TILE));
}

function moveHumans() {
    for (const h of humans) {
        h.x += (Math.random() - 0.5) * HUMAN_SPEED * 2;
        h.y += (Math.random() - 0.5) * HUMAN_SPEED * 2;
        h.x = Math.max(0, Math.min(h.x, canvas.width - TILE));
        h.y = Math.max(0, Math.min(h.y, canvas.height - TILE));
    }
}

function moveSoldiers() {
    for (const s of soldiers) {
        s.x += (Math.random() - 0.5) * SOLDIER_SPEED * 2;
        s.y += (Math.random() - 0.5) * SOLDIER_SPEED * 2;
        s.x = Math.max(0, Math.min(s.x, canvas.width - TILE));
        s.y = Math.max(0, Math.min(s.y, canvas.height - TILE));
    }
}

function checkCollisions() {
    // player vs humans
    for (let i = humans.length - 1; i >= 0; i--) {
        const h = humans[i];
        if (Math.abs(h.x - player.x) < TILE && Math.abs(h.y - player.y) < TILE) {
            humans.splice(i, 1);
            zombies.push(h);
            updateHud();
        }
    }

    // zombies vs soldiers
    for (let i = soldiers.length - 1; i >= 0; i--) {
        const s = soldiers[i];
        for (let j = zombies.length - 1; j >= 0; j--) {
            const z = zombies[j];
            if (Math.abs(s.x - z.x) < TILE && Math.abs(s.y - z.y) < TILE) {
                if (z === player) {
                    resetGame();
                    return;
                } else {
                    zombies.splice(j, 1);
                }
            }
        }
    }

    // player vs powerups
    for (let i = powerups.length - 1; i >= 0; i--) {
        const p = powerups[i];
        if (Math.abs(p.x - player.x) < TILE && Math.abs(p.y - player.y) < TILE) {
            powerups.splice(i, 1);
            speedBoostTimer = SPEED_BOOST_DURATION;
            updateHud();
        }
    }

    // check level end
    if (humans.length === 0) {
        level++;
        startLevel();
    }
}

function drawEntity(ent) {
    ctx.fillStyle = ent.color;
    ctx.fillRect(ent.x, ent.y, TILE, TILE);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const h of humans) drawEntity(h);
    for (const s of soldiers) drawEntity(s);
    for (const p of powerups) drawEntity(p);
    for (const z of zombies) drawEntity(z);
}

function gameLoop() {
    movePlayer();
    moveHumans();
    moveSoldiers();
    checkCollisions();
    draw();
    updateHud();
    requestAnimationFrame(gameLoop);
}

document.getElementById('restart-btn').addEventListener('click', resetGame);

resetGame();
requestAnimationFrame(gameLoop);
