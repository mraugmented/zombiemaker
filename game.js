const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const size = 20;

let level = 1;
let player;
let zombies = [];
let humans = [];
let soldiers = [];
let powerups = [];

const keys = {};
window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup', e => keys[e.key] = false);

function randomPos() {
    return {
        x: Math.random() * (canvas.width - size),
        y: Math.random() * (canvas.height - size)
    };
}

function createHuman() {
    return { ...randomPos(), color: 'lightblue', speed: 1 };
}

function createSoldier() {
    return { ...randomPos(), color: 'red', speed: 1.5 };
}

function createPowerup() {
    return { ...randomPos(), color: 'gold', type: 'speed' };
}

function setupLevel() {
    humans = [];
    soldiers = [];
    zombies = [player];

    const humanCount = 5 + level * 3;
    const soldierCount = Math.floor(level / 2);

    for (let i = 0; i < humanCount; i++) humans.push(createHuman());
    for (let i = 0; i < soldierCount; i++) soldiers.push(createSoldier());

    powerups = (level % 3 === 0) ? [createPowerup()] : [];
    updateHud();
}

function resetGame() {
    level = 1;
    player = { ...randomPos(), color: 'lime', speed: 2 };
    setupLevel();
}

function updateHud() {
    document.getElementById('infected-count').textContent = `Infected: ${zombies.length}`;
    document.getElementById('level-count').textContent = `Level: ${level}`;
}

function moveEntity(entity) {
    const dir = Math.random() * Math.PI * 2;
    entity.x += Math.cos(dir) * entity.speed;
    entity.y += Math.sin(dir) * entity.speed;
    entity.x = Math.max(0, Math.min(entity.x, canvas.width - size));
    entity.y = Math.max(0, Math.min(entity.y, canvas.height - size));
}

function movePlayer() {
    if (keys['ArrowUp'] || keys['w']) player.y -= player.speed;
    if (keys['ArrowDown'] || keys['s']) player.y += player.speed;
    if (keys['ArrowLeft'] || keys['a']) player.x -= player.speed;
    if (keys['ArrowRight'] || keys['d']) player.x += player.speed;

    player.x = Math.max(0, Math.min(player.x, canvas.width - size));
    player.y = Math.max(0, Math.min(player.y, canvas.height - size));
}

function moveHumans() {
    for (const h of humans) moveEntity(h);
}

function moveSoldiers() {
    for (const s of soldiers) {
        moveEntity(s);
        if (Math.abs(player.x - s.x) < size && Math.abs(player.y - s.y) < size) {
            resetGame();
            return;
        }
    }
}

function checkCollisions() {
    for (let i = humans.length - 1; i >= 0; i--) {
        const h = humans[i];
        if (Math.abs(player.x - h.x) < size && Math.abs(player.y - h.y) < size) {
            humans.splice(i, 1);
            zombies.push(h);
            updateHud();
        }
    }

    for (let i = soldiers.length - 1; i >= 0; i--) {
        const s = soldiers[i];
        if (Math.abs(player.x - s.x) < size && Math.abs(player.y - s.y) < size) {
            soldiers.splice(i, 1);
            zombies.push(s);
            updateHud();
        }
    }

    for (let i = powerups.length - 1; i >= 0; i--) {
        const p = powerups[i];
        if (Math.abs(player.x - p.x) < size && Math.abs(player.y - p.y) < size) {
            player.speed += 1;
            powerups.splice(i, 1);
            setTimeout(() => { player.speed -= 1; }, 5000);
        }
    }

    if (humans.length === 0 && soldiers.length === 0) {
        level++;
        setupLevel();
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

function update() {
    movePlayer();
    moveHumans();
    moveSoldiers();
    checkCollisions();
    draw();
    requestAnimationFrame(update);
}

document.getElementById('restart-btn').addEventListener('click', resetGame);

resetGame();
update();
