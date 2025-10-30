const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILE = path.join(__dirname, 'data', 'characters.json');

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    const defaultData = {
      pacman: {
        name: 'Pacmax',
        color: '#ffe600',
        speed: 0.14
      },
      ghosts: [
        {
          id: 'blinky',
          name: 'Blinky',
          color: '#ff0000',
          speed: 0.11,
          edibleOnPowerPellet: true
        },
        {
          id: 'pinky',
          name: 'Pinky',
          color: '#ff69b4',
          speed: 0.1,
          edibleOnPowerPellet: true
        },
        {
          id: 'inky',
          name: 'Inky',
          color: '#00ffff',
          speed: 0.105,
          edibleOnPowerPellet: true
        },
        {
          id: 'berserker',
          name: 'Berserker',
          color: '#8b00ff',
          speed: 0.095,
          edibleOnPowerPellet: false,
          berserkMultiplier: 1.6
        }
      ]
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2), 'utf8');
  }
}

function loadCharacters() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read character data', err);
    return null;
  }
}

function validateCharacterData(payload) {
  if (!payload || typeof payload !== 'object') {
    return 'Payload must be an object.';
  }
  const { pacman, ghosts } = payload;
  if (!pacman || typeof pacman !== 'object') {
    return 'Pacman configuration is required.';
  }
  if (!Array.isArray(ghosts) || ghosts.length === 0) {
    return 'At least one ghost configuration is required.';
  }

  const validateSpeed = (value, label) => {
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0 || value > 1) {
      throw new Error(`${label} speed must be a number between 0 and 1.`);
    }
  };

  try {
    validateSpeed(pacman.speed, 'Pacman');
    if (typeof pacman.name !== 'string' || !pacman.name.trim()) {
      throw new Error('Pacman name must be a non-empty string.');
    }
    if (typeof pacman.color !== 'string' || !pacman.color.startsWith('#')) {
      throw new Error('Pacman color must be a hex value.');
    }

    const ids = new Set();
    ghosts.forEach((ghost, index) => {
      if (!ghost || typeof ghost !== 'object') {
        throw new Error(`Ghost at index ${index} must be an object.`);
      }
      if (typeof ghost.id !== 'string' || !ghost.id.trim()) {
        throw new Error(`Ghost at index ${index} must include a unique id.`);
      }
      if (ids.has(ghost.id)) {
        throw new Error(`Duplicate ghost id detected: ${ghost.id}`);
      }
      ids.add(ghost.id);
      if (typeof ghost.name !== 'string' || !ghost.name.trim()) {
        throw new Error(`Ghost ${ghost.id} must have a name.`);
      }
      if (typeof ghost.color !== 'string' || !ghost.color.startsWith('#')) {
        throw new Error(`Ghost ${ghost.id} color must be a hex value.`);
      }
      validateSpeed(ghost.speed, `Ghost ${ghost.id}`);
      if (typeof ghost.edibleOnPowerPellet !== 'boolean') {
        throw new Error(`Ghost ${ghost.id} must specify if it is edible on power pellet.`);
      }
      if (!ghost.edibleOnPowerPellet) {
        if (typeof ghost.berserkMultiplier !== 'number' || ghost.berserkMultiplier <= 1) {
          throw new Error(`Non-edible ghost ${ghost.id} requires a berserkMultiplier greater than 1.`);
        }
      }
    });
  } catch (err) {
    return err.message;
  }

  return null;
}

function saveCharacters(payload) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

function serveStatic(req, res) {
  let filePath = url.parse(req.url).pathname;
  if (!filePath || filePath === '/') {
    filePath = '/index.html';
  }
  const resolvedPath = path.join(PUBLIC_DIR, path.normalize(filePath).replace(/^\\|\/+/, ''));
  if (!resolvedPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(resolvedPath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(resolvedPath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500);
        res.end('Server Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  if (parsedUrl.pathname === '/api/characters') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }

    if (req.method === 'GET') {
      const data = loadCharacters();
      if (!data) {
        sendJson(res, 500, { error: 'Failed to load character configuration.' });
        return;
      }
      sendJson(res, 200, data);
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 1e6) {
          req.connection.destroy();
        }
      });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const error = validateCharacterData(payload);
          if (error) {
            sendJson(res, 400, { error });
            return;
          }
          saveCharacters(payload);
          sendJson(res, 200, { status: 'ok' });
        } catch (err) {
          sendJson(res, 400, { error: 'Invalid JSON payload.' });
        }
      });
      return;
    }

    res.writeHead(405, {
      'Access-Control-Allow-Origin': '*',
      'Allow': 'GET,POST,OPTIONS'
    });
    res.end('Method Not Allowed');
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Pacmax server running on http://localhost:${PORT}`);
});
