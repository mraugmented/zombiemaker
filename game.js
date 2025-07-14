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
    
    // Add health display for main player
    const healthDisplay = document.getElementById('health-info') || (() => {
        const healthSpan = document.createElement('span');
        healthSpan.id = 'health-info';
        healthSpan.style.color = '#ff4444';
        document.getElementById('hud').appendChild(healthSpan);
        return healthSpan;
    })();
    healthDisplay.textContent = `Health: ${player.health || 3}`;
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

let levelStartDelay = 0;
const LEVEL_START_DELAY = 180; // 3 seconds at 60fps

function startLevel() {
    levelStartDelay = LEVEL_START_DELAY;
    createMaze();
    player = { 
        ...randomPos(), 
        color: 'lime', 
        speed: BASE_SPEED * difficultyMultipliers[difficulty].playerSpeed,
        health: 3,
        maxHealth: 3
    };
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
    
    // Try moving in each direction separately to prevent getting stuck
    let newX = player.x;
    let newY = player.y;
    
    if (keys['ArrowUp'] || keys['w']) newY -= moveSpeed;
    if (keys['ArrowDown'] || keys['s']) newY += moveSpeed;
    if (keys['ArrowLeft'] || keys['a']) newX -= moveSpeed;
    if (keys['ArrowRight'] || keys['d']) newX += moveSpeed;
    
    // Check X movement first
    const testX = { x: newX, y: player.y };
    if (!isInsideWall(testX) && newX >= 0 && newX <= canvas.width - TILE) {
        player.x = newX;
    }
    
    // Check Y movement separately
    const testY = { x: player.x, y: newY };
    if (!isInsideWall(testY) && newY >= 0 && newY <= canvas.height - TILE) {
        player.y = newY;
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
            
            // Try moving in each direction separately to prevent getting stuck
            let newX = z.x + dx;
            let newY = z.y + dy;
            
            // Check X movement first
            const testX = { x: newX, y: z.y };
            if (!isInsideWall(testX) && newX >= 0 && newX <= canvas.width - TILE) {
                z.x = newX;
            }
            
            // Check Y movement separately
            const testY = { x: z.x, y: newY };
            if (!isInsideWall(testY) && newY >= 0 && newY <= canvas.height - TILE) {
                z.y = newY;
            }
            
            // If still stuck, try alternative path
            if (z.x === prev.x && z.y === prev.y) {
                const angle = Math.atan2(closest.y - z.y, closest.x - z.x) + (Math.random() - 0.5) * Math.PI / 2;
                const altX = z.x + Math.cos(angle) * zombieSpeed;
                const altY = z.y + Math.sin(angle) * zombieSpeed;
                
                if (!isInsideWall({x: altX, y: z.y}) && altX >= 0 && altX <= canvas.width - TILE) {
                    z.x = altX;
                }
                if (!isInsideWall({x: z.x, y: altY}) && altY >= 0 && altY <= canvas.height - TILE) {
                    z.y = altY;
                }
            }
        }
    }
}

function moveHumans() {
    for (const h of humans) {
        // Find closest zombie threat
        let closestZombie = zombies[0];
        let closestDist = Infinity;
        for (const z of zombies) {
            const dist = Math.hypot(h.x - z.x, h.y - z.y);
            if (dist < closestDist) {
                closestDist = dist;
                closestZombie = z;
            }
        }
        
        // Calculate escape direction from closest zombie
        let dx = h.x - closestZombie.x;
        let dy = h.y - closestZombie.y;
        const dist = Math.hypot(dx, dy) || 1;
        dx = (dx / dist) * HUMAN_SPEED;
        dy = (dy / dist) * HUMAN_SPEED;
        
        // Add avoidance from other humans to prevent clustering
        for (const other of humans) {
            if (other === h) continue;
            const otherDist = Math.hypot(h.x - other.x, h.y - other.y);
            if (otherDist < TILE * 2) { // If too close to another human
                const avoidX = (h.x - other.x) / otherDist;
                const avoidY = (h.y - other.y) / otherDist;
                dx += avoidX * 0.5;
                dy += avoidY * 0.5;
            }
        }
        
        // Add wall avoidance
        const futureX = h.x + dx * 3;
        const futureY = h.y + dy * 3;
        if (isInsideWall({x: futureX, y: h.y})) {
            dx = -dx * 0.5 + (Math.random() - 0.5) * 2;
        }
        if (isInsideWall({x: h.x, y: futureY})) {
            dy = -dy * 0.5 + (Math.random() - 0.5) * 2;
        }
        
        // Add some randomness to prevent predictable movement
        dx += (Math.random() - 0.5) * 0.3;
        dy += (Math.random() - 0.5) * 0.3;
        
        const prev = { x: h.x, y: h.y };
        h.x += dx;
        h.y += dy;
        
        // Keep within bounds
        h.x = Math.max(TILE, Math.min(h.x, canvas.width - TILE * 2));
        h.y = Math.max(TILE, Math.min(h.y, canvas.height - TILE * 2));
        
        // Better wall collision - try alternative directions if stuck
        if (isInsideWall(h)) {
            h.x = prev.x;
            h.y = prev.y;
            // Try moving in a different direction
            const angle = Math.random() * Math.PI * 2;
            h.x += Math.cos(angle) * HUMAN_SPEED;
            h.y += Math.sin(angle) * HUMAN_SPEED;
            h.x = Math.max(TILE, Math.min(h.x, canvas.width - TILE * 2));
            h.y = Math.max(TILE, Math.min(h.y, canvas.height - TILE * 2));
            if (isInsideWall(h)) {
                h.x = prev.x;
                h.y = prev.y;
            }
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

function lineIntersectsWall(x1, y1, x2, y2) {
    for (const wall of walls) {
        // Check if line segment intersects with wall rectangle
        if (x1 >= wall.x && x1 <= wall.x + wall.width && 
            y1 >= wall.y && y1 <= wall.y + wall.height) return true;
        if (x2 >= wall.x && x2 <= wall.x + wall.width && 
            y2 >= wall.y && y2 <= wall.y + wall.height) return true;
    }
    return false;
}

function moveBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        const prevX = bullet.x;
        const prevY = bullet.y;
        bullet.x += bullet.dx;
        bullet.y += bullet.dy;
        
        // Check if bullet hits a wall
        if (lineIntersectsWall(prevX, prevY, bullet.x, bullet.y)) {
            bullets.splice(i, 1);
            continue;
        }
        
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
                        // Main player takes multiple hits
                        if (!player.health) player.health = 3;
                        player.health--;
                        if (player.health <= 0) {
                            endGame();
                            return;
                        }
                        playSound(600, 0.2, 'sawtooth');
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
    
    // Draw background pattern for city atmosphere
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add subtle grid pattern
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    
    // Draw walls with better styling
    ctx.fillStyle = '#444';
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    for (const w of walls) {
        ctx.fillRect(w.x, w.y, w.width, w.height);
        ctx.strokeRect(w.x, w.y, w.width, w.height);
    }
    
    for (const h of humans) drawCharacter(h, 'human');
    for (const s of soldiers) drawCharacter(s, 'soldier');
    for (const p of powerups) drawPowerup(p);
    for (const z of zombies) drawCharacter(z, 'zombie');
    for (const b of bosses) drawBoss(b);
    for (const bullet of bullets) drawBullet(bullet);
    
    // Draw player health bar
    if (player.health < player.maxHealth) {
        ctx.fillStyle = 'red';
        ctx.fillRect(player.x, player.y - 10, TILE, 4);
        ctx.fillStyle = 'green';
        ctx.fillRect(player.x, player.y - 10, TILE * (player.health / player.maxHealth), 4);
    }
}

function gameLoop() {
    if (!gameRunning) return;
    
    // Handle level start delay
    if (levelStartDelay > 0) {
        levelStartDelay--;
        // Draw countdown
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#333';
        for (const w of walls) ctx.fillRect(w.x, w.y, w.width, w.height);
        for (const h of humans) drawCharacter(h, 'human');
        for (const s of soldiers) drawCharacter(s, 'soldier');
        for (const p of powerups) drawPowerup(p);
        for (const z of zombies) drawCharacter(z, 'zombie');
        for (const b of bosses) drawBoss(b);
        
        // Draw countdown text
        ctx.fillStyle = 'white';
        ctx.font = '48px "Press Start 2P"';
        ctx.textAlign = 'center';
        const countdown = Math.ceil(levelStartDelay / 60);
        ctx.fillText(countdown.toString(), canvas.width / 2, canvas.height / 2);
        ctx.textAlign = 'left';
        
        requestAnimationFrame(gameLoop);
        return;
    }
    
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
