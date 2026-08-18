const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const net = require('net');
const { execFile } = require('child_process');

const ROOT = __dirname;
const WEB = path.join(ROOT, 'apps', 'web');
const API = path.join(ROOT, 'apps', 'api');
const PORT = 4170;
let WEB_PORT = 5173;
const LOG_DIR = path.join(ROOT, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });
const state = { message: 'Tizim tayyorlanmoqda...', progress: 5, ready: false, error: null, url: null };
let browserOpened = false;

function npmRunner() {
  // Run npm's JavaScript CLI with node.exe. Never spawn npm.cmd directly.
  const nodeDir = path.dirname(process.execPath);
  const candidates = [
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.mjs'),
    process.env.npm_execpath || ''
  ].filter(p => /npm-cli\.(js|mjs)$/i.test(p) && fs.existsSync(p));

  const npmCli = candidates[0];
  return npmCli ? { command: process.execPath, prefix: [npmCli] } : null;
}

const NPM = npmRunner();

function runNpm(args, cwd) {
  const result = spawnSync(NPM.command, [...NPM.prefix, ...args], {
    cwd,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: false
  });

  if (result.error) {
    throw new Error(`npm ishga tushmadi: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const details = String(result.stderr || result.stdout || '').trim();
    throw new Error(`npm ${args.join(' ')} muvaffaqiyatsiz tugadi (kod ${result.status}).${details ? `\n${details.slice(-1200)}` : ''}`);
  }
  return result;
}

function portOpen(port, host = '127.0.0.1') {
  return new Promise(resolve => {
    const s = net.createConnection({ port, host });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    s.setTimeout(350, () => { s.destroy(); resolve(false); });
  });
}

// Eski ishga tushirishdan qolib ketgan (orphaned) jarayonlarni portdan
// majburan bo'shatadi. Buni har safar yangi start oldidan bajarish
// "eski sayt yopilmayapti, kompyuterni qayta yuklash kerak" muammosining
// asosiy sababi edi: avvalgi versiya portlar band bo'lsa serverni umuman
// qayta ishga tushirmas edi, shu bilan eski (yangilanmagan) kod abadiy
// fonda ishlab qolardi.
function killPort(port) {
  try {
    if (process.platform === 'win32') {
      const out = spawnSync('cmd.exe', ['/c', `netstat -ano | findstr :${port} | findstr LISTENING`], { encoding: 'utf8', windowsHide: true });
      const lines = String(out.stdout || '').split(/\r?\n/).filter(Boolean);
      const pids = new Set();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
      }
      for (const pid of pids) {
        spawnSync('taskkill', ['/F', '/T', '/PID', pid], { windowsHide: true });
      }
    } else {
      const out = spawnSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf8' });
      const pids = String(out.stdout || '').split(/\s+/).filter(Boolean);
      for (const pid of pids) spawnSync('kill', ['-9', pid]);
    }
  } catch {}
}

function startProcess(name, command, args, cwd, extraEnv = {}) {
  const logPath = path.join(LOG_DIR, `${name}.log`);
  try { fs.writeFileSync(logPath, '', 'utf8'); } catch {}
  const log = fs.openSync(logPath, 'a');

  const child = spawn(command, args, {
    cwd,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', log, log],
    env: {
      ...process.env,
      ...extraEnv,
      FORCE_COLOR: '0',
      BROWSER: 'none',
      PATH: [
        path.join(path.dirname(process.execPath)),
        path.join(ROOT, 'node_modules', '.bin'),
        path.join(API, 'node_modules', '.bin'),
        path.join(WEB, 'node_modules', '.bin'),
        process.env.PATH || ''
      ].filter(Boolean).join(path.delimiter)
    },
    shell: false
  });
  child.unref();
  return { child, logPath };
}

function findCli(...candidates) {
  return candidates.find(p => p && fs.existsSync(p));
}

function getViteCli() {
  return findCli(
    path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
    path.join(WEB, 'node_modules', 'vite', 'bin', 'vite.js')
  );
}

function getNestCli() {
  return findCli(
    path.join(ROOT, 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js'),
    path.join(API, 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js')
  );
}

function readLog(name) {
  try {
    const file = path.join(LOG_DIR, `${name}.log`);
    if (!fs.existsSync(file)) return '';
    return fs.readFileSync(file, 'utf8').slice(-4000);
  } catch { return ''; }
}

async function waitForPort(port, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    if (await portOpen(port)) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

function findFreeWebPort() {
  return new Promise(async resolve => {
    for (let p = 5173; p <= 5183; p++) {
      if (!(await portOpen(p))) return resolve(p);
    }
    resolve(5173);
  });
}

function openBrowser(url) {
  if (process.platform === 'win32') execFile('cmd.exe', ['/c', 'start', '', url], { windowsHide: true });
  else if (process.platform === 'darwin') execFile('open', [url]);
  else execFile('xdg-open', [url]);
}

function packagesReady() {
  return fs.existsSync(path.join(ROOT, 'node_modules', '@nestjs', 'core', 'package.json')) &&
         !!getNestCli() &&
         !!getViteCli() &&
         fs.existsSync(path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js')) &&
         fs.existsSync(path.join(ROOT, 'node_modules', 'xlsx', 'package.json'));
}

async function setupAndStart() {
  try {
    state.message = `Node.js ${process.version} va npm tekshirilmoqda...`; state.progress = 10;
    if (!NPM) throw new Error('Node.js o‘rnatilgan, lekin uning ichidagi npm CLI topilmadi. Node.js 20+ ni qayta o‘rnating.');
    state.message = 'Paketlar tekshirilmoqda...'; state.progress = 15;

    if (!packagesReady()) {
      state.message = 'Kerakli paketlar o‘rnatilmoqda...'; state.progress = 25;
      runNpm(['install'], ROOT);
    }

    state.message = 'Prisma tayyorlanmoqda...'; state.progress = 38;
    runNpm(['run', 'prisma:generate', '--workspace=apps/api'], ROOT);

    const db = path.join(API, 'prisma', 'dev.db');
    const dbExisted = fs.existsSync(db);
    state.message = 'Ma’lumotlar bazasi sxemasi yangilanmoqda...'; state.progress = 48;
    runNpm(['exec', '--', 'prisma', 'db', 'push', '--accept-data-loss'], API);
    if (!dbExisted) {
      state.message = 'Boshlang‘ich foydalanuvchilar yaratilmoqda...'; state.progress = 62;
      runNpm(['run', 'seed', '--workspace=apps/api'], ROOT);
    }

    state.message = 'Eski jarayonlar tozalanmoqda...'; state.progress = 68;
    killPort(4000);
    for (let p = 5173; p <= 5183; p++) killPort(p);
    // Portlar haqiqatan bo'shashini kutamiz (taskkill darhol emas, asinxron ishlaydi)
    for (let i = 0; i < 10; i++) {
      if (!(await portOpen(4000)) && !(await portOpen(5173))) break;
      await new Promise(r => setTimeout(r, 300));
    }

    // Portlar tozalangandan keyin tanlaymiz - shunda odatda doim standart
    // 5173 portiga qaytadi, yuqoriga siljib ketmaydi.
    WEB_PORT = await findFreeWebPort();

    state.message = 'Backend ishga tushirilmoqda...'; state.progress = 72;
    const nestCli = getNestCli();
    if (!nestCli) throw new Error('NestJS CLI topilmadi. npm install muvaffaqiyatli tugaganini tekshiring.');
    startProcess('api', process.execPath, [nestCli, 'start', '--watch'], API, { CORS_ORIGIN: `http://localhost:${WEB_PORT}` });

    state.message = 'Frontend ishga tushirilmoqda...'; state.progress = 84;
    state.message = `Frontend ${WEB_PORT}-portda ishga tushirilmoqda...`; state.progress = 88;
    const viteCli = getViteCli();
    if (!viteCli) throw new Error('Vite topilmadi. npm install muvaffaqiyatli tugaganini tekshiring.');
    startProcess('web', process.execPath, [viteCli, '--host', '127.0.0.1', '--port', String(WEB_PORT), '--strictPort'], WEB);

    state.message = 'Sayt tayyorlanmoqda...'; state.progress = 94;
    if (!(await waitForPort(WEB_PORT, 40))) {
      const log = readLog('web');
      throw new Error(`Frontend ${WEB_PORT}-portda ishga tushmadi.\n\nFrontend logi:\n${log || 'Log topilmadi.'}`);
    }

    state.url = `http://localhost:${WEB_PORT}`;
    state.message = 'Tizim tayyor.'; state.progress = 100; state.ready = true;
    if (!browserOpened) { browserOpened = true; openBrowser(state.url); }
  } catch (e) {
    state.error = e && e.message ? e.message : String(e);
    state.message = 'Ishga tushirishda xatolik.';
    state.progress = 100;
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/status') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    return res.end(JSON.stringify(state));
  }

  if (req.url === '/assets/wafa-logo.png' || req.url === '/assets/wafa-pattern.png') {
    const file = path.join(WEB, 'public', req.url.replace(/^\//, ''));
    if (fs.existsSync(file)) {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' });
      return fs.createReadStream(file).pipe(res);
    }
  }

  const html = fs.readFileSync(path.join(ROOT, 'launcher.html'));
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

server.listen(PORT, '127.0.0.1', () => {
  if (!browserOpened) { browserOpened = true; openBrowser(`http://localhost:${PORT}`); }
  setupAndStart();
});
