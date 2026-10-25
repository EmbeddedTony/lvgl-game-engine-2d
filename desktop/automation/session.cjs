const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');
const LIMIT = 40 * 1024 * 1024;
const profileDirectory = () =>
  process.env.LGE_PROFILE_DIR ||
  path.join(
    process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library/Application Support')
      : process.platform === 'win32'
        ? process.env.APPDATA || os.homedir()
        : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
    'LVGL Game Engine 2D',
  );

async function sessions(profile = profileDirectory()) {
  const dir = path.join(profile, 'automation');
  const names = await fs.readdir(dir).catch(() => []);
  const found = await Promise.all(
    names
      .filter((n) => /^session-\d+\.json$/.test(n))
      .map(async (name) => {
        try {
          const value = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
          if (
            value.protocolVersion !== 1 ||
            !Number.isInteger(value.pid) ||
            typeof value.token !== 'string' ||
            typeof value.endpoint !== 'string'
          )
            return null;
          process.kill(value.pid, 0);
          return value;
        } catch {
          return null;
        }
      }),
  );
  return found.filter(Boolean);
}
function publicSession({ token, endpoint, ...metadata }) {
  return metadata;
}
async function request(session, method, params = {}, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(session.endpoint);
    let bytes = 0,
      chunks = [];
    const fail = (e) => {
      socket.destroy();
      reject(e);
    };
    socket.setTimeout(timeout, () =>
      fail(
        Object.assign(new Error('Editor request timed out. Retry after checking editor status.'), {
          code: 'UNAVAILABLE',
        }),
      ),
    );
    socket.on('error', (e) =>
      fail(
        Object.assign(new Error(`Cannot connect to editor: ${e.message}`), { code: 'UNAVAILABLE' }),
      ),
    );
    socket.on('connect', () =>
      socket.write(
        JSON.stringify({ protocolVersion: 1, token: session.token, method, params }) + '\n',
      ),
    );
    socket.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > LIMIT) return fail(new Error('Editor response exceeds 40 MiB.'));
      chunks.push(chunk);
      if (chunk.includes(10)) {
        try {
          const reply = JSON.parse(Buffer.concat(chunks).toString('utf8').trim());
          socket.end();
          if (!reply.ok) {
            const e = new Error(reply.error.message);
            Object.assign(e, reply.error);
            reject(e);
          } else resolve(reply.data);
        } catch (e) {
          fail(e);
        }
      }
    });
    socket.on('end', () => {
      if (!chunks.length) fail(new Error('Editor closed the connection.'));
    });
  });
}
/** Private local IPC only: no listening TCP port, evaluation endpoint or process execution. */
async function startServer({ profile = profileDirectory(), metadata, dispatch }) {
  const dir = path.join(profile, 'automation');
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await fs.chmod(dir, 0o700);
  const digest = createHash('sha256').update(profile).digest('hex').slice(0, 12);
  const endpoint =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\lge-${digest}-${process.pid}`
      : path.join(os.tmpdir(), `lge-${process.getuid?.() ?? 'user'}-${digest}-${process.pid}.sock`);
  const token = randomBytes(32).toString('hex');
  const descriptor = path.join(dir, `session-${process.pid}.json`);
  // A prior crashed process can leave a socket with a subsequently reused PID.
  // This endpoint belongs exclusively to this process/profile pair.
  if (process.platform !== 'win32') await fs.rm(endpoint, { force: true });
  let queue = Promise.resolve(),
    closed = false;
  const clients = new Set();
  const server = net.createServer((socket) => {
    clients.add(socket);
    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => {});
    socket.setTimeout(30000, () => socket.destroy());
    let bytes = 0,
      chunks = [],
      done = false;
    socket.on('data', async (chunk) => {
      if (done) return;
      bytes += chunk.length;
      if (bytes > LIMIT) {
        done = true;
        socket.destroy();
        return;
      }
      chunks.push(chunk);
      if (!chunk.includes(10)) return;
      done = true;
      const respond = (value) => {
        if (!socket.destroyed) socket.end(JSON.stringify(value) + '\n');
      };
      try {
        const req = JSON.parse(Buffer.concat(chunks).toString('utf8').trim());
        const offered = Buffer.from(typeof req.token === 'string' ? req.token : '');
        if (
          req.protocolVersion !== 1 ||
          offered.length !== token.length ||
          !timingSafeEqual(offered, Buffer.from(token))
        )
          throw Object.assign(new Error('Invalid local editor credentials.'), {
            code: 'UNAUTHORIZED',
          });
        if (!['snapshot', 'apply', 'save'].includes(req.method))
          throw Object.assign(new Error('Unknown editor method.'), { code: 'INVALID_ARGUMENT' });
        respond({ ok: true, data: await dispatch(req.method, req.params ?? {}) });
      } catch (e) {
        respond({
          ok: false,
          error: { code: e.code || 'EXECUTION_FAILED', message: e.message, details: e.details },
        });
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(endpoint, resolve);
  });
  if (process.platform !== 'win32') await fs.chmod(endpoint, 0o600);
  const publish = () => {
    queue = queue
      .catch(() => {})
      .then(async () => {
        if (closed) return;
        const value = {
          protocolVersion: 1,
          id: String(process.pid),
          pid: process.pid,
          endpoint,
          token,
          ...metadata(),
        };
        const temp = descriptor + '.tmp';
        await fs.writeFile(temp, JSON.stringify(value), { mode: 0o600 });
        await fs.rename(temp, descriptor);
      });
    return queue;
  };
  await publish();
  return {
    publish,
    async close() {
      closed = true;
      for (const socket of clients) socket.destroy();
      server.close();
      await queue.catch(() => {});
      await fs.rm(descriptor, { force: true });
      if (process.platform !== 'win32') await fs.rm(endpoint, { force: true });
    },
  };
}
module.exports = { sessions, publicSession, request, startServer, profileDirectory };
