const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const statusEl = document.getElementById('status');
const form = document.getElementById('editor-form');
const formStatusEl = document.getElementById('form-status');
const ghostEditorsContainer = document.getElementById('ghost-editors');
const ghostTemplate = document.getElementById('ghost-editor-template');

const tileSize = 28;
const rows = 20;
const cols = 20;

const assetPaths = {
  pacman: 'assets/pacman.png',
  ghost: 'assets/ghost.png'
};

const tintCache = new Map();
let assets = {};

const TILES = {
  WALL: '#',
  PELLET: '.',
  POWER: 'o',
  EMPTY: ' '
};

const boardLayout = [
  '####################',
  '#........##........#',
  '#.####.#.##.#.####.#',
  '#o#  #.#.##.#.#  #o#',
  '#.####.#.##.#.####.#',
  '#..................#',
  '#.####.######.####.#',
  '#......# ## #......#',
  '######.# ## #.######',
  '     #.#    #.#     ',
  '######.# ## #.######',
  '#......# ## #......#',
  '#.####.######.####.#',
  '#..................#',
  '#.####.#.##.#.####.#',
  '#o...#.#.##.#.#...o#',
  '###.#.#.##.#.#.#.###',
  '#...#........##...##',
  '#.#.##########.#.#.#',
  '#..................#'
];

const spawnPoints = {
  pacman: { x: 9.5, y: 15 },
  ghosts: {
    blinky: { x: 9.5, y: 8 },
    pinky: { x: 9.5, y: 9 },
    inky: { x: 8.5, y: 9 },
    berserker: { x: 10.5, y: 9 }
  }
};

let characterConfig = null;
let game = null;
let animationHandle = null;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Impossibile caricare l'immagine ${src}`));
    image.src = src;
  });
}

async function loadAssets() {
  const entries = await Promise.all(
    Object.entries(assetPaths).map(async ([key, path]) => {
      try {
        const image = await loadImage(path);
        return [key, image];
      } catch (err) {
        console.warn(err.message);
        return [key, null];
      }
    })
  );
  assets = Object.fromEntries(entries);
}

function getTintedSprite(baseImage, color) {
  if (!baseImage) {
    return null;
  }
  const key = `${baseImage.src}|${color}`;
  if (tintCache.has(key)) {
    return tintCache.get(key);
  }
  const canvas = document.createElement('canvas');
  canvas.width = baseImage.width;
  canvas.height = baseImage.height;
  const context = canvas.getContext('2d');
  context.drawImage(baseImage, 0, 0);
  context.globalCompositeOperation = 'source-atop';
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  tintCache.set(key, canvas);
  return canvas;
}

function drawSpriteCentered(context, image, x, y, size, rotation = 0) {
  if (!image) return;
  context.save();
  context.translate(x, y);
  if (rotation !== 0) {
    context.rotate(rotation);
  }
  context.drawImage(image, -size / 2, -size / 2, size, size);
  context.restore();
}

function drawPacmanFallback(context, pac) {
  const centerX = pac.x * tileSize;
  const centerY = pac.y * tileSize;
  const radius = tileSize / 2.2;
  const mouthAngle = Math.PI / 6;
  const rotation = headingToAngle(pac.heading || pac.direction || { x: 1, y: 0 });
  context.save();
  context.translate(centerX, centerY);
  if (rotation !== 0) {
    context.rotate(rotation);
  }
  context.fillStyle = pac.color;
  context.beginPath();
  context.moveTo(0, 0);
  context.arc(0, 0, radius, mouthAngle, -mouthAngle, true);
  context.closePath();
  context.fill();
  context.restore();
}

function drawGhostFallback(context, ghost, color) {
  const centerX = ghost.x * tileSize;
  const centerY = ghost.y * tileSize;
  const radius = tileSize / 2.3;
  const width = radius * 2;
  const baseY = centerY + radius;
  context.fillStyle = color;
  context.beginPath();
  context.arc(centerX, centerY, radius, Math.PI, 0, false);
  context.lineTo(centerX + radius, baseY);
  const legCount = 4;
  const step = width / legCount;
  for (let i = 1; i <= legCount; i += 1) {
    const peakX = centerX + radius - step * (i - 0.5);
    const nextX = centerX + radius - step * i;
    const controlY = baseY + radius * 0.35;
    context.quadraticCurveTo(peakX, controlY, nextX, baseY);
  }
  context.closePath();
  context.fill();
}

function headingToAngle(heading) {
  if (!heading) {
    return 0;
  }
  if (heading.x === 1) return 0;
  if (heading.x === -1) return Math.PI;
  if (heading.y === 1) return Math.PI / 2;
  if (heading.y === -1) return -Math.PI / 2;
  return 0;
}

const directions = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
];

const oppositeDirection = dir => ({ x: -dir.x, y: -dir.y });

class Entity {
  constructor({ x, y, speed, color }) {
    this.startX = x;
    this.startY = y;
    this.x = x;
    this.y = y;
    this.speed = speed;
    this.baseSpeed = speed;
    this.color = color;
    this.direction = { x: 0, y: 0 };
    this.nextDirection = { x: 0, y: 0 };
  }

  reset() {
    this.x = this.startX;
    this.y = this.startY;
    this.direction = { x: 0, y: 0 };
    this.nextDirection = { x: 0, y: 0 };
    this.speed = this.baseSpeed;
  }
}

class Pacman extends Entity {
  constructor(config) {
    const spawn = spawnPoints.pacman;
    super({ x: spawn.x, y: spawn.y, speed: config.speed, color: config.color });
    this.name = config.name;
    this.heading = { x: 1, y: 0 };
  }

  reset() {
    super.reset();
    this.heading = { x: 1, y: 0 };
  }
}

class Ghost extends Entity {
  constructor(config, pacman) {
    const spawn = spawnPoints.ghosts[config.id] || { x: 9.5, y: 9 };
    super({ x: spawn.x, y: spawn.y, speed: config.speed, color: config.color });
    this.id = config.id;
    this.name = config.name;
    this.edibleOnPowerPellet = config.edibleOnPowerPellet;
    this.berserkMultiplier = config.berserkMultiplier || 1.6;
    this.isEdible = false;
    this.isBerserk = false;
    this.pacman = pacman;
    this.scatterTarget = spawn;
  }
}

function buildBoard() {
  const board = [];
  for (let row = 0; row < rows; row += 1) {
    const rowTiles = [];
    for (let col = 0; col < cols; col += 1) {
      const char = boardLayout[row][col] || ' ';
      rowTiles.push(char);
    }
    board.push(rowTiles);
  }
  return board;
}

function getTile(board, x, y) {
  const col = Math.floor(x);
  const row = Math.floor(y);
  if (row < 0 || row >= rows || col < 0 || col >= cols) {
    return TILES.WALL;
  }
  return board[row][col];
}

function isWall(board, x, y) {
  return getTile(board, x, y) === TILES.WALL;
}

function canMove(board, x, y, dir) {
  const nextX = x + dir.x * 0.5;
  const nextY = y + dir.y * 0.5;
  const tile = getTile(board, nextX, nextY);
  return tile !== TILES.WALL;
}

function wrapPosition(entity) {
  if (entity.x < 0) entity.x = cols - 0.01;
  if (entity.x >= cols) entity.x = 0;
  if (entity.y < 0) entity.y = rows - 0.01;
  if (entity.y >= rows) entity.y = 0;
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function pickGhostDirection(ghost, board, powerActive) {
  const tileCenterX = Math.floor(ghost.x) + 0.5;
  const tileCenterY = Math.floor(ghost.y) + 0.5;
  const isCentered = Math.abs(ghost.x - tileCenterX) < 0.1 && Math.abs(ghost.y - tileCenterY) < 0.1;

  if (!isCentered) {
    return ghost.direction;
  }

  const options = directions.filter(dir => {
    if (dir.x === -ghost.direction.x && dir.y === -ghost.direction.y) {
      return false;
    }
    const targetX = tileCenterX + dir.x * 0.6;
    const targetY = tileCenterY + dir.y * 0.6;
    return !isWall(board, targetX, targetY);
  });

  if (options.length === 0) {
    return oppositeDirection(ghost.direction);
  }

  const target = powerActive && ghost.isEdible
    ? { x: ghost.scatterTarget.x, y: ghost.scatterTarget.y }
    : ghost.pacman;

  let bestDir = options[0];
  let bestDistance = Infinity;
  options.forEach(option => {
    const projected = {
      x: tileCenterX + option.x,
      y: tileCenterY + option.y
    };
    const d = distance(projected, target);
    if (d < bestDistance) {
      bestDistance = d;
      bestDir = option;
    }
  });

  if (powerActive && ghost.id === 'berserker') {
    // Berserker becomes aggressive towards Pacman
    bestDir = options.sort((a, b) => {
      const projA = { x: tileCenterX + a.x, y: tileCenterY + a.y };
      const projB = { x: tileCenterX + b.x, y: tileCenterY + b.y };
      return distance(projA, ghost.pacman) - distance(projB, ghost.pacman);
    })[0];
  }

  return bestDir;
}

class Game {
  constructor(config) {
    this.config = config;
    this.board = buildBoard();
    this.pacman = new Pacman(config.pacman);
    this.ghosts = config.ghosts.map(g => new Ghost(g, this.pacman));
    this.score = 0;
    this.lives = 3;
    this.powerTimer = 0;
    this.gameOver = false;
    this.lastTimestamp = null;
    this.pelletCount = this.countPellets();
    this.registerControls();
    this.updateHud();
  }

  registerControls() {
    window.addEventListener('keydown', event => {
      const keyMap = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 }
      };
      const next = keyMap[event.key];
      if (next) {
        this.pacman.nextDirection = next;
        event.preventDefault();
      }
    });
  }

  countPellets() {
    let count = 0;
    this.board.forEach(row => {
      row.forEach(tile => {
        if (tile === TILES.PELLET || tile === TILES.POWER) {
          count += 1;
        }
      });
    });
    return count;
  }

  updateHud() {
    scoreEl.textContent = this.score;
    livesEl.textContent = this.lives;
  }

  applyConfig(config) {
    this.config = config;
    this.pacman.name = config.pacman.name;
    this.pacman.color = config.pacman.color;
    this.pacman.baseSpeed = config.pacman.speed;
    this.pacman.speed = config.pacman.speed;
    const existing = new Map(this.ghosts.map(ghost => [ghost.id, ghost]));
    this.ghosts = config.ghosts.map(ghostConfig => {
      const ghost = existing.get(ghostConfig.id) || new Ghost(ghostConfig, this.pacman);
      ghost.name = ghostConfig.name;
      ghost.color = ghostConfig.color;
      ghost.baseSpeed = ghostConfig.speed;
      ghost.speed = ghostConfig.speed;
      ghost.edibleOnPowerPellet = ghostConfig.edibleOnPowerPellet;
      ghost.berserkMultiplier = ghostConfig.berserkMultiplier || 1.6;
      ghost.isEdible = false;
      ghost.isBerserk = false;
      return ghost;
    });
  }

  resetPositions() {
    this.pacman.reset();
    this.pacman.direction = { x: -1, y: 0 };
    this.pacman.nextDirection = { x: -1, y: 0 };
    this.pacman.heading = { x: -1, y: 0 };
    this.ghosts.forEach(ghost => {
      ghost.reset();
      ghost.isEdible = false;
      ghost.isBerserk = false;
    });
    this.powerTimer = 0;
  }

  update(deltaMs, normalized) {
    if (this.gameOver) return;

    // Update power timer
    if (this.powerTimer > 0) {
      this.powerTimer -= deltaMs;
      if (this.powerTimer <= 0) {
        this.powerTimer = 0;
        this.ghosts.forEach(ghost => {
          ghost.isEdible = false;
          ghost.isBerserk = false;
          ghost.speed = ghost.baseSpeed;
        });
        if (!this.gameOver) {
          statusEl.textContent = '';
        }
      }
    }

    // Handle Pacman direction change when possible
    const pac = this.pacman;
    if (pac.nextDirection && canMove(this.board, pac.x, pac.y, pac.nextDirection)) {
      pac.direction = pac.nextDirection;
      pac.nextDirection = pac.nextDirection;
    }

    const pacmanTargetX = pac.x + pac.direction.x * pac.speed * normalized;
    const pacmanTargetY = pac.y + pac.direction.y * pac.speed * normalized;
    if (!isWall(this.board, pacmanTargetX, pacmanTargetY)) {
      pac.x = pacmanTargetX;
      pac.y = pacmanTargetY;
    }
    if (pac.direction.x !== 0 || pac.direction.y !== 0) {
      pac.heading = { x: pac.direction.x, y: pac.direction.y };
    }
    wrapPosition(pac);

    // Pellet collision
    const tile = getTile(this.board, pac.x, pac.y);
    const row = Math.floor(pac.y);
    const col = Math.floor(pac.x);
    if (tile === TILES.PELLET) {
      this.board[row][col] = TILES.EMPTY;
      this.score += 10;
      this.pelletCount -= 1;
      this.updateHud();
    } else if (tile === TILES.POWER) {
      this.board[row][col] = TILES.EMPTY;
      this.score += 50;
      this.pelletCount -= 1;
      this.updateHud();
      this.activatePowerPellet();
    }

    if (this.pelletCount === 0 && !this.gameOver) {
      statusEl.textContent = 'Hai vinto!';
      this.gameOver = true;
    }

    const powerActive = this.powerTimer > 0;

    // Update ghosts
    this.ghosts.forEach(ghost => {
      const dir = pickGhostDirection(ghost, this.board, powerActive);
      ghost.direction = dir;
      const speed = ghost.speed;
      ghost.x += dir.x * speed * normalized;
      ghost.y += dir.y * speed * normalized;
      wrapPosition(ghost);
    });

    // Collisions with ghosts
    this.ghosts.forEach(ghost => {
      if (distance(pac, ghost) < 0.5) {
        if (powerActive && ghost.isEdible && ghost.edibleOnPowerPellet) {
          this.score += 200;
          ghost.reset();
          ghost.isEdible = false;
          this.updateHud();
        } else {
          this.handlePacmanHit();
        }
      }
    });
  }

  activatePowerPellet() {
    this.powerTimer = 7000;
    statusEl.textContent = 'Power-up attivo!';
    this.ghosts.forEach(ghost => {
      if (ghost.edibleOnPowerPellet) {
        ghost.isEdible = true;
        ghost.speed = ghost.baseSpeed * 0.6;
      } else {
        ghost.isEdible = false;
        ghost.isBerserk = true;
        ghost.speed = ghost.baseSpeed * ghost.berserkMultiplier;
        statusEl.textContent = `${ghost.name} è in modalità Berserk!`;
      }
    });
  }

  handlePacmanHit() {
    this.lives -= 1;
    this.updateHud();
    if (this.lives <= 0) {
      statusEl.textContent = 'Game Over';
      this.gameOver = true;
    } else {
      statusEl.textContent = 'Attento ai fantasmi!';
      this.resetPositions();
    }
  }

  draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw board
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const tile = this.board[row][col];
        const x = col * tileSize;
        const y = row * tileSize;
        if (tile === TILES.WALL) {
          ctx.fillStyle = '#002d62';
          ctx.fillRect(x, y, tileSize, tileSize);
        } else if (tile === TILES.PELLET) {
          ctx.fillStyle = '#ffca28';
          ctx.beginPath();
          ctx.arc(x + tileSize / 2, y + tileSize / 2, 3, 0, Math.PI * 2);
          ctx.fill();
        } else if (tile === TILES.POWER) {
          ctx.fillStyle = '#ffd740';
          ctx.beginPath();
          ctx.arc(x + tileSize / 2, y + tileSize / 2, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Draw Pacman sprite
    const pac = this.pacman;
    const basePacSprite = assets ? assets.pacman : null;
    const pacSprite = getTintedSprite(basePacSprite, pac.color);
    if (pacSprite) {
      const pacAngle = headingToAngle(pac.heading);
      drawSpriteCentered(ctx, pacSprite, pac.x * tileSize, pac.y * tileSize, tileSize, pacAngle);
    } else {
      drawPacmanFallback(ctx, pac);
    }

    // Draw ghosts sprites
    this.ghosts.forEach(ghost => {
      const baseColor = ghost.isEdible && ghost.edibleOnPowerPellet ? '#4fc3f7' : ghost.color;
      const baseGhostSprite = assets ? assets.ghost : null;
      const ghostSprite = getTintedSprite(baseGhostSprite, baseColor);
      const size = tileSize * 0.95;
      if (ghostSprite) {
        drawSpriteCentered(ctx, ghostSprite, ghost.x * tileSize, ghost.y * tileSize, size);
      } else {
        drawGhostFallback(ctx, ghost, baseColor);
      }
      if (ghost.isBerserk) {
        ctx.save();
        ctx.strokeStyle = ghost.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ghost.x * tileSize, ghost.y * tileSize, size / 2 + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  loop(timestamp) {
    if (!this.lastTimestamp) {
      this.lastTimestamp = timestamp;
    }
    const deltaMs = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;
    const normalized = Math.min(deltaMs / 16.666, 3); // clamp to avoid huge steps

    this.update(deltaMs, normalized);
    this.draw();

    if (!this.gameOver) {
      animationHandle = requestAnimationFrame(this.loop.bind(this));
    }
  }

  start() {
    this.board = buildBoard();
    this.resetPositions();
    this.gameOver = false;
    this.score = 0;
    this.lives = 3;
    this.powerTimer = 0;
    this.pelletCount = this.countPellets();
    this.updateHud();
    statusEl.textContent = '';
    this.lastTimestamp = null;
    if (animationHandle) {
      cancelAnimationFrame(animationHandle);
    }
    animationHandle = requestAnimationFrame(this.loop.bind(this));
  }
}

async function loadConfig() {
  const response = await fetch('/api/characters');
  if (!response.ok) {
    throw new Error('Impossibile caricare la configurazione dei personaggi');
  }
  return response.json();
}

function toFixedHex(hex) {
  if (!hex) return '#ffffff';
  const normalized = hex.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) {
    return normalized;
  }
  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    return '#' + normalized.slice(1).split('').map(c => c + c).join('');
  }
  return '#ffffff';
}

function renderEditor(config) {
  form.querySelector('input[name="pacman.name"]').value = config.pacman.name;
  form.querySelector('input[name="pacman.color"]').value = toFixedHex(config.pacman.color);
  form.querySelector('input[name="pacman.speed"]').value = config.pacman.speed;

  ghostEditorsContainer.innerHTML = '';

  config.ghosts.forEach(ghost => {
    const fragment = ghostTemplate.content.cloneNode(true);
    const editor = fragment.querySelector('.ghost-editor');
    editor.dataset.id = ghost.id;
    editor.querySelector('[data-field="name"]').textContent = `${ghost.name} (${ghost.id})`;
    const nameInput = editor.querySelector('[data-field="nameInput"]');
    const colorInput = editor.querySelector('[data-field="colorInput"]');
    const speedInput = editor.querySelector('[data-field="speedInput"]');
    const edibleSelect = editor.querySelector('[data-field="edibleSelect"]');
    const berserkLabel = editor.querySelector('.berserk');
    const berserkInput = editor.querySelector('[data-field="berserkInput"]');

    nameInput.value = ghost.name;
    colorInput.value = toFixedHex(ghost.color);
    speedInput.value = ghost.speed;
    edibleSelect.value = String(ghost.edibleOnPowerPellet);
    if (!ghost.edibleOnPowerPellet) {
      berserkLabel.hidden = false;
      berserkInput.value = ghost.berserkMultiplier || 1.6;
      berserkInput.required = true;
    } else {
      berserkLabel.hidden = true;
      berserkInput.required = false;
    }

    edibleSelect.addEventListener('change', () => {
      const isEdible = edibleSelect.value === 'true';
      berserkLabel.hidden = isEdible;
      berserkInput.required = !isEdible;
    });

    ghostEditorsContainer.appendChild(fragment);
  });
}

function collectFormData() {
  const pacmanName = form.querySelector('input[name="pacman.name"]').value.trim();
  const pacmanColor = form.querySelector('input[name="pacman.color"]').value;
  const pacmanSpeed = Number(form.querySelector('input[name="pacman.speed"]').value);

  const ghosts = Array.from(ghostEditorsContainer.querySelectorAll('.ghost-editor')).map(editor => {
    const id = editor.dataset.id;
    const name = editor.querySelector('[data-field="nameInput"]').value.trim();
    const color = editor.querySelector('[data-field="colorInput"]').value;
    const speed = Number(editor.querySelector('[data-field="speedInput"]').value);
    const edibleOnPowerPellet = editor.querySelector('[data-field="edibleSelect"]').value === 'true';
    const berserkInput = editor.querySelector('[data-field="berserkInput"]');
    const berserkMultiplier = berserkInput && !edibleOnPowerPellet
      ? Number(berserkInput.value)
      : undefined;
    const payload = { id, name, color, speed, edibleOnPowerPellet };
    if (!edibleOnPowerPellet) {
      payload.berserkMultiplier = berserkMultiplier;
    }
    return payload;
  });

  return {
    pacman: {
      name: pacmanName,
      color: pacmanColor,
      speed: pacmanSpeed
    },
    ghosts
  };
}

async function submitForm(event) {
  event.preventDefault();
  formStatusEl.textContent = '';
  try {
    const payload = collectFormData();
    const response = await fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Errore sconosciuto');
    }
    let updatedConfig = payload;
    try {
      updatedConfig = await loadConfig();
    } catch (refreshError) {
      console.warn('Impossibile ricaricare la configurazione dal server', refreshError);
    }
    characterConfig = updatedConfig;
    renderEditor(updatedConfig);
    game.applyConfig(updatedConfig);
    formStatusEl.textContent = 'Configurazione salvata';
    formStatusEl.className = 'form-status status-info';
  } catch (err) {
    formStatusEl.textContent = err.message;
    formStatusEl.className = 'form-status status-error';
  }
}

function initForm() {
  form.addEventListener('submit', submitForm);
}

async function init() {
  try {
    const [config] = await Promise.all([loadConfig(), loadAssets()]);
    characterConfig = config;
    renderEditor(characterConfig);
    initForm();
    game = new Game(characterConfig);
    game.start();
  } catch (err) {
    statusEl.textContent = err.message;
    console.error(err);
  }
}

init();
