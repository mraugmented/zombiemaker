const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const TILE = 20; // size for all entities
const BASE_SPEED = 3; // base player speed
const HUMAN_SPEED = 1;
const SOLDIER_SPEED = 1.0; // Reduced from 1.5 to make soldiers slower than zombies
const SPEED_BOOST_DURATION = 300; // frames
const SPEED_BOOST_MULT = 2;
const INVINCIBLE_DURATION = 300;
const FREEZE_DURATION = 300;
const RAGE_DURATION = 300;
const RAGE_MULT = 2;
const EXPLOSION_RADIUS = 100; // New powerup effect

let highscore = Number(localStorage.getItem('highscore') || 0);
let score = 0;
let gameRunning = false;

let invincibleTimer = 0;
let freezeTimer = 0;
let rageTimer = 0;

let walls = [];

let player;
let humans = [];
let zombies = [];
let soldiers = [];
let powerups = [];
let level = 1;
let speedBoostTimer = 0;
let bosses = [];

let achievements = {
    totalInfections: 0,
    levelsCompleted: 0,
    bossesKilled: 0,
    powerupsCollected: 0,
    highestLevel: 0
};

// Load achievements from localStorage
function loadAchievements() {
    const saved = localStorage.getItem('achievements');
    if (saved) {
        achievements = { ...achievements, ...JSON.parse(saved) };
    }
}

function saveAchievements() {
    localStorage.setItem('achievements', JSON.stringify(achievements));
}

function checkAchievements() {
    const messages = [];
    
    if (achievements.totalInfections >= 100 && !achievements.infectionMaster) {
        achievements.infectionMaster = true;
        messages.push('Achievement: Infection Master!');
    }
    
    if (achievements.levelsCompleted >= 10 && !achievements.survivor) {
        achievements.survivor = true;
        messages.push('Achievement: Survivor!');
    }
    
    if (achievements.bossesKilled >= 5 && !achievements.bossSlayer) {
        achievements.bossSlayer = true;
        messages.push('Achievement: Boss Slayer!');
    }
    
    if (messages.length > 0) {
        saveAchievements();
        // Show achievement notification
        console.log(messages.join('\n'));
    }
}

// Initialize achievements on load
loadAchievements();

let audioContext;
let backgroundMusic;
let musicPlaying = false;

function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        createBackgroundMusic();
    } catch (e) {
        console.log('Audio not supported');
    }
}

function createBackgroundMusic() {
    if (!audioContext) return;
    
    // Create a simple looping background tone
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(110, audioContext.currentTime); // Low A
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    backgroundMusic = { oscillator, gainNode };
}

function startBackgroundMusic() {
    if (!musicPlaying && backgroundMusic) {
        backgroundMusic.oscillator.start();
        musicPlaying = true;
    }
}

function stopBackgroundMusic() {
    if (musicPlaying && backgroundMusic) {
        backgroundMusic.oscillator.stop();
        musicPlaying = false;
        createBackgroundMusic(); // Recreate for next time
    }
}

function playSound(freq = 440, dur = 0.1, type = 'sine') {
    if (!audioContext) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + dur);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + dur);
}

// Initialize audio on first user interaction
document.addEventListener('click', () => {
    if (!audioContext) {
        initAudio();
    }
}, { once: true });

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

let bullets = [];
const BULLET_SPEED = 4;
const SOLDIER_SHOOT_RANGE = 100;
const SOLDIER_SHOOT_COOLDOWN = 60; // frames between shots

function spawnSoldiers(count) {
    for (let i = 0; i < count; i++) {
        soldiers.push({ 
            ...randomPos(), 
            color: 'red',
            shootCooldown: 0
        });
    }
}

function spawnPowerups(count) {
    const types = ['speed', 'invincible', 'freeze', 'multiply', 'rage', 'explosion'];
    for (let i = 0; i < count; i++) {
        const type = types[Math.floor(Math.random() * types.length)];
        let color = 'yellow';
        if (type === 'invincible') color = 'purple';
        if (type === 'freeze') color = 'white';
        if (type === 'multiply') color = 'orange';
        if (type === 'rage') color = 'red';
        if (type === 'explosion') color = 'green';
        powerups.push({ ...randomPos(), color, type });
    }
}

function spawnBoss() {
    const boss = { 
        ...randomPos(), 
        color: 'darkred', 
        health: 3 + Math.floor(level / 5),
        maxHealth: 3 + Math.floor(level / 5),
        speed: SOLDIER_SPEED * 1.2 // Reduced multiplier so bosses aren't too fast
    };
    bosses.push(boss);
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
    const wallCount = 4 + level; // More walls per level
    for (let i = 0; i < wallCount; i++) {
        const x = Math.floor(Math.random() * (canvas.width / 100)) * 100;
        const y = Math.floor(Math.random() * (canvas.height / 100)) * 100;
        const width = 20 + Math.random() * 80;
        const height = 20 + Math.random() * 80;
        walls.push({ x, y, width, height });
    }
}

function updateHud() {
    document.getElementById('infected-count').textContent = `Infected: ${zombies.length - 1}`;
    document.getElementById('level-info').textContent = `Level: ${level}`;
    const parts = [];
    if (speedBoostTimer > 0) parts.push('Speed');
    if (invincibleTimer > 0) parts.push('Invincible');
    if (freezeTimer > 0) parts.push('Freeze');
    if (rageTimer > 0) parts.push('Rage');
    document.getElementById('powerup-info').textContent = parts.join(' ');
    document.getElementById('score-info').textContent = `Score: ${score}`;
    document.getElementById('highscore-info').textContent = `Highscore: ${highscore}`;
}

let difficulty = 'medium';
let difficultyMultipliers = {
    easy: { humanCount: 0.7, soldierCount: 0.5, zombieSpeed: 1.2, playerSpeed: 1.1 },
    medium: { humanCount: 1.0, soldierCount: 1.0, zombieSpeed: 1.0, playerSpeed: 1.0 },
    hard: { humanCount: 1.5, soldierCount: 1.5, zombieSpeed: 0.8, playerSpeed: 0.9 }
};

// Difficulty selection handlers
document.getElementById('easy-btn').addEventListener('click', () => selectDifficulty('easy'));
document.getElementById('medium-btn').addEventListener('click', () => selectDifficulty('medium'));
document.getElementById('hard-btn').addEventListener('click', () => selectDifficulty('hard'));

function selectDifficulty(newDifficulty) {
    difficulty = newDifficulty;
    document.querySelectorAll('.difficulty-btn').forEach(btn => btn.classList.remove('selected'));
    document.getElementById(`${newDifficulty}-btn`).classList.add('selected');
}

function startLevel() {
    createMaze();
    player = { ...randomPos(), color: 'lime', speed: BASE_SPEED * difficultyMultipliers[difficulty].playerSpeed };
    zombies = [player];
    humans = [];
    soldiers = [];
    bosses = [];
    powerups = [];
    bullets = [];
    spawnHumans(Math.floor((5 + level * 5) * difficultyMultipliers[difficulty].humanCount));
    if (level > 1) spawnSoldiers(Math.floor((level - 1) * difficultyMultipliers[difficulty].soldierCount));
    if (level % 5 === 0) spawnBoss();
    spawnPowerups(2 + Math.floor(level / 2));
    updateHud();
}

function resetGame() {
    level = 1;
    score = 0;
    speedBoostTimer = 0;
    invincibleTimer = 0;
    freezeTimer = 0;
    rageTimer = 0;
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
    if (rageTimer > 0) {
        moveSpeed *= RAGE_MULT;
        rageTimer--;
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
            const zombieSpeed = (HUMAN_SPEED + (level * 0.2)) * difficultyMultipliers[difficulty].zombieSpeed;
            const dx = Math.sign(closest.x - z.x) * zombieSpeed;
            const dy = Math.sign(closest.y - z.y) * zombieSpeed;
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
        // Decrease shoot cooldown
        if (s.shootCooldown > 0) s.shootCooldown--;
        
        let closest = player;
        let closestDist = Infinity;
        for (const z of zombies) {
            const d = Math.hypot(z.x - s.x, z.y - s.y);
            if (d < closestDist) { closestDist = d; closest = z; }
        }
        
        // Shoot if in range and cooldown is ready
        if (closestDist < SOLDIER_SHOOT_RANGE && s.shootCooldown === 0) {
            const dx = closest.x - s.x;
            const dy = closest.y - s.y;
            const dist = Math.hypot(dx, dy);
            bullets.push({
                x: s.x + TILE / 2,
                y: s.y + TILE / 2,
                dx: (dx / dist) * BULLET_SPEED,
                dy: (dy / dist) * BULLET_SPEED,
                target: closest
            });
            s.shootCooldown = SOLDIER_SHOOT_COOLDOWN;
            playSound(800, 0.05, 'square'); // Gunshot sound
        }
        
        // Move towards closest zombie
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

function moveBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.x += bullet.dx;
        bullet.y += bullet.dy;
        
        // Remove bullets that go off screen
        if (bullet.x < 0 || bullet.x > canvas.width || bullet.y < 0 || bullet.y > canvas.height) {
            bullets.splice(i, 1);
            continue;
        }
        
        // Check collision with zombies
        for (let j = zombies.length - 1; j >= 0; j--) {
            const z = zombies[j];
            if (Math.abs(bullet.x - (z.x + TILE/2)) < TILE/2 && 
                Math.abs(bullet.y - (z.y + TILE/2)) < TILE/2) {
                bullets.splice(i, 1);
                if (z === player) {
                    if (invincibleTimer === 0) {
                        endGame();
                        return;
                    }
                } else {
                    zombies.splice(j, 1);
                    playSound(400, 0.1, 'sawtooth');
                }
                break;
            }
        }
    }
}

function moveBosses() {
    if (freezeTimer > 0) return;
    for (const b of bosses) {
        let closest = player;
        let closestDist = Infinity;
        for (const z of zombies) {
            const d = Math.hypot(z.x - b.x, z.y - b.y);
            if (d < closestDist) { closestDist = d; closest = z; }
        }
        const dx = Math.sign(closest.x - b.x) * b.speed;
        const dy = Math.sign(closest.y - b.y) * b.speed;
        const prev = { x: b.x, y: b.y };
        b.x += dx;
        b.y += dy;
        b.x = Math.max(0, Math.min(b.x, canvas.width - TILE));
        b.y = Math.max(0, Math.min(b.y, canvas.height - TILE));
        if (isInsideWall(b)) { b.x = prev.x; b.y = prev.y; }
    }
}

function checkCollisions() {
    // player vs humans
    for (let i = humans.length - 1; i >= 0; i--) {
        const h = humans[i];
        if (Math.abs(h.x - player.x) < TILE && Math.abs(h.y - player.y) < TILE) {
            humans.splice(i, 1);
            // Create new zombie with proper properties
            const newZombie = { 
                x: h.x, 
                y: h.y, 
                color: 'lime',
                isActive: true // Mark as active zombie
            };
            zombies.push(newZombie);
            score++;
            achievements.totalInfections++;
            playSound(440, 0.1); // infection sound
            updateHud();
        }
    }

    // zombies vs humans
    for (let j = 0; j < zombies.length; j++) {
        const z = zombies[j];
        const infectionRadius = TILE + (level * 2); // Boost radius per level
        for (let i = humans.length - 1; i >= 0; i--) {
            const h = humans[i];
            if (Math.abs(h.x - z.x) < infectionRadius && Math.abs(h.y - z.y) < infectionRadius) {
                humans.splice(i, 1);
                // Create new zombie with proper properties
                const newZombie = { 
                    x: h.x, 
                    y: h.y, 
                    color: 'lime',
                    isActive: true // Mark as active zombie
                };
                zombies.push(newZombie);
                score++;
                achievements.totalInfections++;
                playSound(440, 0.1); // infection sound
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

    // zombies vs bosses
    for (let i = bosses.length - 1; i >= 0; i--) {
        const b = bosses[i];
        for (let j = zombies.length - 1; j >= 0; j--) {
            const z = zombies[j];
            if (Math.abs(b.x - z.x) < TILE && Math.abs(b.y - z.y) < TILE) {
                if (z === player) {
                    if (invincibleTimer > 0) {
                        b.health--;
                        if (b.health <= 0) {
                            bosses.splice(i, 1);
                            score += 10; // Bonus score for boss
                            achievements.bossesKilled++;
                            playSound(300, 0.5, 'sawtooth'); // boss death sound
                        }
                    } else {
                        endGame();
                        return;
                    }
                } else {
                    if (invincibleTimer > 0) {
                        b.health--;
                        if (b.health <= 0) {
                            bosses.splice(i, 1);
                            score += 10;
                            achievements.bossesKilled++;
                            playSound(300, 0.5, 'sawtooth'); // boss death sound
                        }
                    } else {
                        zombies.splice(j, 1);
                        b.health--;
                        if (b.health <= 0) {
                            bosses.splice(i, 1);
                            score += 10;
                            achievements.bossesKilled++;
                            playSound(300, 0.5, 'sawtooth'); // boss death sound
                        }
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
            achievements.powerupsCollected++;
            if (p.type === 'speed') {
                speedBoostTimer = SPEED_BOOST_DURATION;
            } else if (p.type === 'invincible') {
                invincibleTimer = INVINCIBLE_DURATION;
            } else if (p.type === 'freeze') {
                freezeTimer = FREEZE_DURATION;
            } else if (p.type === 'multiply') {
                const newZombie = { ...randomPos(), color: 'lime' };
                zombies.push(newZombie);
                playSound(1000, 0.15); // multiply sound
            } else if (p.type === 'rage') {
                rageTimer = RAGE_DURATION;
                playSound(1200, 0.1); // rage sound
            } else if (p.type === 'explosion') {
                // Infect all humans in radius
                for (let i = humans.length - 1; i >= 0; i--) {
                    const h = humans[i];
                    const dist = Math.hypot(h.x - player.x, h.y - player.y);
                    if (dist < EXPLOSION_RADIUS) {
                        humans.splice(i, 1);
                        zombies.push({ ...h, color: 'lime' });
                        score++;
                    }
                }
                playSound(500, 0.2, 'square'); // explosion sound
                updateHud();
            }
            playSound(880, 0.2); // powerup sound
            updateHud();
        }
    }

    // check level end
    if (humans.length === 0) {
        level++;
        achievements.levelsCompleted++;
        achievements.highestLevel = Math.max(achievements.highestLevel, level);
        checkAchievements();
        playSound(660, 0.3); // level complete sound
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
    } else if (ent.type === 'multiply') {
        // Star shape for multiply
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            ctx.lineTo(ent.x + TILE / 2 + (TILE / 2) * Math.cos(2 * Math.PI * i / 5), ent.y + TILE / 2 + (TILE / 2) * Math.sin(2 * Math.PI * i / 5));
            ctx.lineTo(ent.x + TILE / 2 + (TILE / 4) * Math.cos(2 * Math.PI * (i + 0.5) / 5), ent.y + TILE / 2 + (TILE / 4) * Math.sin(2 * Math.PI * (i + 0.5) / 5));
        }
        ctx.closePath();
        ctx.fill();
    } else if (ent.type === 'rage') {
        // Flame shape for rage
        ctx.beginPath();
        ctx.moveTo(ent.x + TILE / 2, ent.y);
        ctx.quadraticCurveTo(ent.x + TILE, ent.y + TILE / 2, ent.x + TILE / 2, ent.y + TILE);
        ctx.quadraticCurveTo(ent.x, ent.y + TILE / 2, ent.x + TILE / 2, ent.y);
        ctx.fill();
    } else if (ent.type === 'explosion') {
        // Bomb shape
        ctx.beginPath();
        ctx.arc(ent.x + TILE / 2, ent.y + TILE / 2, TILE / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'black';
        ctx.fillRect(ent.x + TILE / 2 - 2, ent.y, 4, TILE / 4);
    }
}

function drawBoss(boss) {
    // Draw boss with health bar
    ctx.fillStyle = boss.color;
    ctx.fillRect(boss.x, boss.y, TILE, TILE);

    // Health bar
    ctx.fillStyle = 'red';
    ctx.fillRect(boss.x, boss.y - 8, TILE, 4);
    ctx.fillStyle = 'green';
    ctx.fillRect(boss.x, boss.y - 8, TILE * (boss.health / boss.maxHealth), 4);
}

function drawBullet(bullet) {
    ctx.fillStyle = 'yellow';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 2, 0, Math.PI * 2);
    ctx.fill();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#333';
    for (const w of walls) ctx.fillRect(w.x, w.y, w.width, w.height);
    for (const h of humans) drawCharacter(h, 'human');
    for (const s of soldiers) drawCharacter(s, 'soldier');
    for (const p of powerups) drawPowerup(p);
    for (const z of zombies) drawCharacter(z, 'zombie');
    for (const b of bosses) drawBoss(b);
    for (const bullet of bullets) drawBullet(bullet);
}

function gameLoop() {
    if (!gameRunning) return;
    movePlayer();
    moveZombies();
    moveHumans();
    moveSoldiers();
    moveBosses();
    moveBullets();
    checkCollisions();
    draw();
    updateHud();
    requestAnimationFrame(gameLoop);
}

document.getElementById('restart-btn').addEventListener('click', resetGame);

function updateAchievementDisplay() {
    const achievementList = document.getElementById('achievement-list');
    if (!achievementList) return;
    
    const achievementTexts = [
        { key: 'infectionMaster', text: '🧟 Infection Master (100 infections)', unlocked: achievements.infectionMaster },
        { key: 'survivor', text: '🏆 Survivor (10 levels)', unlocked: achievements.survivor },
        { key: 'bossSlayer', text: '⚔️ Boss Slayer (5 bosses)', unlocked: achievements.bossSlayer }
    ];
    
    achievementList.innerHTML = achievementTexts.map(a => 
        `<div class="achievement ${a.unlocked ? '' : 'locked'}">${a.text}</div>`
    ).join('');
}

// Update achievement display on page load
document.addEventListener('DOMContentLoaded', () => {
    updateAchievementDisplay();
});

// Also update when start screen is shown
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('go-restart-btn').addEventListener('click', () => {
    updateAchievementDisplay();
    startGame();
});

function startGame() {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-over').classList.add('hidden');
    gameRunning = true;
    startBackgroundMusic();
    resetGame();
    requestAnimationFrame(gameLoop);
}

function endGame() {
    gameRunning = false;
    stopBackgroundMusic();
    document.getElementById('final-score').textContent = `Score: ${score}`;
    document.getElementById('level-reached').textContent = level;
    document.getElementById('total-infections').textContent = achievements.totalInfections;
    if (score > highscore) {
        highscore = score;
        localStorage.setItem('highscore', highscore);
    }
    document.getElementById('high-score').textContent = `Highscore: ${highscore}`;
    document.getElementById('game-over').classList.remove('hidden');
}

// Initially show start screen
gameRunning = false;
