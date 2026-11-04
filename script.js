/**
 * DEFESA DA MURALHA: CYBER TOWER DEFENSE
 * Projeto Integrado de Matemática (PA e PG)
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- CONFIGURAÇÕES DE JOGO & ESTADO ---
const GAME_STATE = {
    gold: 180,
    wave: 1,
    wallHealth: 1000,
    maxWallHealth: 1000,
    waveInProgress: false,
    selectedTowerType: 'cannon',
    selectedTowerInstance: null,
    enemiesSpawned: 0,
    totalEnemiesInWave: 0,
    spawnInterval: null
};

// --- FÓRMULAS MATEMÁTICAS ---
// PA: Progressão Aritmética para Robôs por Onda
// an = a1 + (n - 1) * r
const PA_CONFIG = {
    a1: 5, // Robôs na primeira onda
    r: 3   // Razão: +3 robôs a cada nova onda
};

function calcularRobosDaOnda(n) {
    return PA_CONFIG.a1 + (n - 1) * PA_CONFIG.r;
}

// PG: Progressão Geométrica para Custo de Upgrades das Torres
// an = a1 * (q ^ (n - 1))
const PG_CONFIG = {
    q: 1.6 // Razão multiplicadora do upgrade
};

function calcularCustoUpgrade(custoBase, nivel) {
    return Math.floor(custoBase * Math.pow(PG_CONFIG.q, nivel - 1));
}

// --- TIPOS DE TORRES ---
const TOWER_TYPES = {
    cannon: { name: 'Canhão', cost: 50, range: 130, damage: 25, fireRate: 60, color: '#3498db' },
    laser:  { name: 'Laser',  cost: 80, range: 100, damage: 8,  fireRate: 12, color: '#e74c3c' },
    missile:{ name: 'Míssil', cost: 130, range: 190, damage: 70, fireRate: 110, color: '#f1c40f' }
};

// --- CAMINHO DOS ROBÔS E MURALHA ---
const PATH = [
    { x: -30, y: 150 },
    { x: 220, y: 150 },
    { x: 220, y: 450 },
    { x: 500, y: 450 },
    { x: 500, y: 250 },
    { x: 760, y: 250 },
    { x: 760, y: 580 }
];

const WALL_Y = 540; // Coordenada da Muralha Defensiva

// --- ARRAYS DE OBJETOS DO CANVAS ---
let towers = [];
let enemies = [];
let projectiles = [];
let particles = [];

// --- CLASSES DE ELEMENTOS DO JOGO ---

// 1. CLASSE DOS INIMIGOS (ROBÔS)
class Enemy {
    constructor(waveNumber) {
        this.x = PATH[0].x;
        this.y = PATH[0].y;
        this.pathIndex = 0;
        this.radius = 16;
        
        // Atributos ajustados conforme a onda
        this.maxHealth = 40 + (waveNumber * 15);
        this.health = this.maxHealth;
        this.speed = 1.4 + Math.min(waveNumber * 0.1, 1.5);
        this.goldValue = 12 + waveNumber;
        this.damage = 50 + waveNumber * 10;
        this.rotation = 0;
    }

    update() {
        // Movimentação ao longo do caminho
        const target = PATH[this.pathIndex + 1];
        if (!target) return;

        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distance = Math.hypot(dx, dy);

        if (distance < this.speed) {
            this.x = target.x;
            this.y = target.y;
            this.pathIndex++;
            if (this.pathIndex >= PATH.length - 1) {
                // Chegou na muralha!
                this.attackWall();
            }
        } else {
            this.rotation = Math.atan2(dy, dx);
            this.x += (dx / distance) * this.speed;
            this.y += (dy / distance) * this.speed;
        }
    }

    attackWall() {
        GAME_STATE.wallHealth = Math.max(0, GAME_STATE.wallHealth - this.damage);
        createExplosion(this.x, this.y, '#ff4757', 15);
        this.health = 0; // Remove o robô
        updateHUD();
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        // Corpo Mecânico do Robô (Visual Trabalhado)
        ctx.fillStyle = '#485460';
        ctx.fillRect(-14, -12, 28, 24);

        ctx.fillStyle = '#00d2d3';
        ctx.fillRect(-6, -8, 12, 16);

        // Olhos Neon Vermelhos
        ctx.fillStyle = '#ff4757';
        ctx.shadowColor = '#ff4757';
        ctx.shadowBlur = 8;
        ctx.fillRect(8, -6, 4, 4);
        ctx.fillRect(8, 2, 4, 4);

        ctx.restore();

        // Barra de Vida
        const healthPercent = this.health / this.maxHealth;
        ctx.fillStyle = '#2f3542';
        ctx.fillRect(this.x - 16, this.y - 24, 32, 5);
        ctx.fillStyle = healthPercent > 0.5 ? '#2ed573' : '#ff4757';
        ctx.fillRect(this.x - 16, this.y - 24, 32 * healthPercent, 5);
    }
}

// 2. CLASSE DAS TORRES DE DEFESA
class Tower {
    constructor(x, y, typeKey) {
        this.x = x;
        this.y = y;
        this.typeKey = typeKey;
        const config = TOWER_TYPES[typeKey];
        
        this.name = config.name;
        this.costBase = config.cost;
        this.range = config.range;
        this.damage = config.damage;
        this.fireRate = config.fireRate;
        this.color = config.color;
        
        this.level = 1;
        this.cooldown = 0;
        this.target = null;
        this.angle = 0;
    }

    update() {
        if (this.cooldown > 0) this.cooldown--;

        // Busca o inimigo mais próximo no alcance
        this.target = null;
        let closestDist = this.range;

        for (let enemy of enemies) {
            const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
            if (dist < closestDist) {
                closestDist = dist;
                this.target = enemy;
            }
        }

        // Mira e atira
        if (this.target) {
            this.angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
            if (this.cooldown <= 0) {
                this.shoot();
                this.cooldown = this.fireRate;
            }
        }
    }

    shoot() {
        projectiles.push(new Projectile(this.x, this.y, this.target, this.damage, this.color, this.typeKey));
    }

    upgrade() {
        const cost = calcularCustoUpgrade(this.costBase, this.level + 1);
        if (GAME_STATE.gold >= cost) {
            GAME_STATE.gold -= cost;
            this.level++;
            this.damage = Math.floor(this.damage * 1.4);
            this.range = Math.floor(this.range * 1.1);
            createExplosion(this.x, this.y, '#00e6ff', 12);
            updateHUD();
            return true;
        }
        return false;
    }

    draw() {
        // Base Redonda de Pedra/Metal
        ctx.beginPath();
        ctx.arc(this.x, this.y, 22, 0, Math.PI * 2);
        ctx.fillStyle = '#2c3e50';
        ctx.fill();
        ctx.strokeStyle = '#10ac84';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Anel do Nível
        ctx.beginPath();
        ctx.arc(this.x, this.y, 16, 0, Math.PI * 2);
        ctx.fillStyle = '#1e272e';
        ctx.fill();

        // Canhão Giratório
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.fillRect(0, -5, 18, 10); // Cano do canhão

        ctx.restore();

        // Indicador de Nível
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 11px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText(`L${this.level}`, this.x, this.y + 4);
    }
}

// 3. CLASSE DE PROJÉTEIS
class Projectile {
    constructor(x, y, target, damage, color, type) {
        this.x = x;
        this.y = y;
        this.target = target;
        this.damage = damage;
        this.color = color;
        this.type = type;
        this.speed = 7;
        this.active = true;
    }

    update() {
        if (!this.target || this.target.health <= 0) {
            this.active = false;
            return;
        }

        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < this.speed) {
            // Acertou o inimigo!
            this.target.health -= this.damage;
            this.active = false;
            createExplosion(this.target.x, this.target.y, this.color, 6);

            if (this.target.health <= 0) {
                GAME_STATE.gold += this.target.goldValue;
                updateHUD();
            }
        } else {
            this.x += (dx / dist) * this.speed;
            this.y += (dy / dist) * this.speed;
        }
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 8;
        ctx.fill();
    }
}

// 4. EFEITOS DE PARTÍCULAS / EXPLOSÃO
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = (Math.random() - 0.5) * 4;
        this.vy = (Math.random() - 0.5) * 4;
        this.life = 1.0;
        this.decay = Math.random() * 0.05 + 0.02;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, 3, 3);
        ctx.restore();
    }
}

function createExplosion(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color));
    }
}

// --- DESENHO DO MAPA E CENÁRIO ---
function drawMap() {
    // 1. Chão de Terra e Grama
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Textura de terreno
    ctx.fillStyle = '#162032';
    for (let i = 0; i < canvas.width; i += 40) {
        for (let j = 0; j < canvas.height; j += 40) {
            if ((i + j) % 80 === 0) {
                ctx.fillRect(i, j, 40, 40);
            }
        }
    }

    // 2. Caminho dos Robôs (Estrada de Pedras/Terra)
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) {
        ctx.lineTo(PATH[i].x, PATH[i].y);
    }
    ctx.lineWidth = 44;
    ctx.strokeStyle = '#0f172a';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.lineWidth = 36;
    ctx.strokeStyle = '#334155';
    ctx.stroke();

    // 3. A Muralha Fortificada (Base do Jogador)
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, WALL_Y, canvas.width, 60);

    // Detalhes da muralha (Blocos de concreto)
    ctx.fillStyle = '#334155';
    for (let x = 0; x < canvas.width; x += 40) {
        ctx.fillRect(x, WALL_Y, 36, 12);
    }

    // Luzes de Alerta na Muralha
    ctx.fillStyle = '#ff4757';
    ctx.shadowColor = '#ff4757';
    ctx.shadowBlur = 10;
    ctx.fillRect(100, WALL_Y + 25, 8, 8);
    ctx.fillRect(400, WALL_Y + 25, 8, 8);
    ctx.fillRect(700, WALL_Y + 25, 8, 8);
    ctx.shadowBlur = 0;
}

// --- LOOP PRINCIPAL DO CANVAS ---
function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Desenha Terreno e Estruturas
    drawMap();

    // 2. Desenha Alcance da Torre Selecionada (se houver)
    if (GAME_STATE.selectedTowerInstance) {
        const t = GAME_STATE.selectedTowerInstance;
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 230, 255, 0.15)';
        ctx.fill();
        ctx.strokeStyle = '#00e6ff';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // 3. Atualiza e Desenha Torres
    for (let tower of towers) {
        tower.update();
        tower.draw();
    }

    // 4. Atualiza e Desenha Inimigos
    for (let i = enemies.length - 1; i >= 0; i--) {
        enemies[i].update();
        enemies[i].draw();
        if (enemies[i].health <= 0) {
            enemies.splice(i, 1);
            updateHUD();
        }
    }

    // 5. Atualiza e Desenha Projéteis
    for (let i = projectiles.length - 1; i >= 0; i--) {
        projectiles[i].update();
        projectiles[i].draw();
        if (!projectiles[i].active) projectiles.splice(i, 1);
    }

    // 6. Atualiza e Desenha Partículas
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw();
        if (particles[i].life <= 0) particles.splice(i, 1);
    }

    // Verificação de fim de onda
    if (GAME_STATE.waveInProgress && GAME_STATE.enemiesSpawned >= GAME_STATE.totalEnemiesInWave && enemies.length === 0) {
        GAME_STATE.waveInProgress = false;
        GAME_STATE.wave++;
        document.getElementById('start-wave-btn').disabled = false;
        document.getElementById('start-wave-btn').innerText = `▶ INICIAR ONDA ${GAME_STATE.wave} (PA)`;
        updateHUD();
    }

    // Tela de Game Over
    if (GAME_STATE.wallHealth <= 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#ff4757';
        ctx.font = '900 42px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText('A MURALHA CAIU!', canvas.width / 2, canvas.height / 2 - 20);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = '20px Rajdhani';
        ctx.fillText(`Você sobreviveu até a Onda ${GAME_STATE.wave}`, canvas.width / 2, canvas.height / 2 + 30);
        return;
    }

    requestAnimationFrame(gameLoop);
}

// --- GERENCIAMENTO DE ONDAS (FÓRMULA DA PA) ---
function startWave() {
    if (GAME_STATE.waveInProgress) return;

    GAME_STATE.waveInProgress = true;
    GAME_STATE.enemiesSpawned = 0;
    // FÓRMULA DA PA: an = 5 + (n-1)*3
    GAME_STATE.totalEnemiesInWave = calcularRobosDaOnda(GAME_STATE.wave);
    
    document.getElementById('start-wave-btn').disabled = true;
    updateHUD();

    GAME_STATE.spawnInterval = setInterval(() => {
        if (GAME_STATE.enemiesSpawned < GAME_STATE.totalEnemiesInWave) {
            enemies.push(new Enemy(GAME_STATE.wave));
            GAME_STATE.enemiesSpawned++;
            updateHUD();
        } else {
            clearInterval(GAME_STATE.spawnInterval);
        }
    }, 1000);
}

// --- INTERAÇÕES DO JOGADOR ---
canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // 1. Verifica se clicou em uma torre existente
    const clickedTower = towers.find(t => Math.hypot(t.x - clickX, t.y - clickY) < 25);

    if (clickedTower) {
        GAME_STATE.selectedTowerInstance = clickedTower;
        showInspector(clickedTower);
        return;
    }

    // Fecha inspetor se clicar no chão
    hideInspector();

    // 2. Não permite construir no caminho ou na muralha
    if (clickY > WALL_Y - 20) return;

    // 3. Tenta construir nova torre
    const config = TOWER_TYPES[GAME_STATE.selectedTowerType];
    if (GAME_STATE.gold >= config.cost) {
        GAME_STATE.gold -= config.cost;
        towers.push(new Tower(clickX, clickY, GAME_STATE.selectedTowerType));
        updateHUD();
    }
});

// --- ATUALIZAÇÃO DA INTERFACE (HUD) ---
function updateHUD() {
    document.getElementById('gold-display').innerText = `🪙 ${GAME_STATE.gold}`;
    document.getElementById('wave-display').innerText = `ONDA ${GAME_STATE.wave}`;
    
    // Atualiza texto da Fórmula da PA
    const robosProximaOnda = calcularRobosDaOnda(GAME_STATE.wave);
    document.getElementById('wave-formula').innerHTML = `a<sub>${GAME_STATE.wave}</sub> = 5 + (${GAME_STATE.wave}-1)×3 = <b>${robosProximaOnda} robôs</b>`;
    
    // Barra de Vida da Muralha
    const healthPercent = (GAME_STATE.wallHealth / GAME_STATE.maxWallHealth) * 100;
    document.getElementById('wall-health-bar').style.width = `${Math.max(0, healthPercent)}%`;
    document.getElementById('wall-health-text').innerText = `${Math.max(0, GAME_STATE.wallHealth)} / ${GAME_STATE.maxWallHealth} HP`;

    // Robôs restantes
    document.getElementById('enemies-left').innerText = `${enemies.length + (GAME_STATE.totalEnemiesInWave - GAME_STATE.enemiesSpawned)} / ${GAME_STATE.totalEnemiesInWave}`;

    // Atualiza Inspetor se ativo
    if (GAME_STATE.selectedTowerInstance) {
        showInspector(GAME_STATE.selectedTowerInstance);
    }
}

// INSPECTOR DE TORRES
function showInspector(tower) {
    const inspector = document.getElementById('tower-inspector');
    inspector.classList.remove('hidden');

    const nextCost = calcularCustoUpgrade(tower.costBase, tower.level + 1);
    
    document.getElementById('inspector-title').innerText = `Torre ${tower.name}`;
    document.getElementById('inspector-level').innerText = `Nível: ${tower.level}`;
    document.getElementById('inspector-damage').innerText = `Dano: ${tower.damage}`;
    document.getElementById('inspector-range').innerText = `Alcance: ${tower.range}px`;
    document.getElementById('upgrade-cost').innerText = nextCost;
    document.getElementById('sell-value').innerText = Math.floor(tower.costBase * 0.6);
}

function hideInspector() {
    GAME_STATE.selectedTowerInstance = null;
    document.getElementById('tower-inspector').classList.add('hidden');
}

// EVENTOS DE BOTÕES E SELEÇÃO
document.getElementById('start-wave-btn').addEventListener('click', startWave);
document.getElementById('close-inspector-btn').addEventListener('click', hideInspector);

document.getElementById('upgrade-tower-btn').addEventListener('click', () => {
    if (GAME_STATE.selectedTowerInstance) {
        GAME_STATE.selectedTowerInstance.upgrade();
    }
});

document.getElementById('sell-tower-btn').addEventListener('click', () => {
    if (GAME_STATE.selectedTowerInstance) {
        const index = towers.indexOf(GAME_STATE.selectedTowerInstance);
        if (index > -1) {
            GAME_STATE.gold += Math.floor(GAME_STATE.selectedTowerInstance.costBase * 0.6);
            towers.splice(index, 1);
            hideInspector();
            updateHUD();
        }
    }
});

// Seleção de cards de torre na barra lateral
document.querySelectorAll('.tower-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.tower-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        GAME_STATE.selectedTowerType = card.getAttribute('data-type');
    });
});

// INICIALIZAÇÃO
updateHUD();
gameLoop();
