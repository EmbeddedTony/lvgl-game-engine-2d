const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
/* One USB owner across CLI/editor processes. Fail promptly instead of letting
 * a debug poll interrupt programming. A crashed owner's PID can be recovered. */
async function acquireProbe() {
  const directory = path.join(os.tmpdir(), 'lvgl-game-engine-stlink.lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await fs.mkdir(directory);
      await fs.writeFile(path.join(directory, 'owner.json'), JSON.stringify({ pid: process.pid }));
      let released = false;
      return async () => {
        if (!released) {
          released = true;
          await fs.rm(directory, { recursive: true, force: true });
        }
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let owner;
      try {
        owner = JSON.parse(await fs.readFile(path.join(directory, 'owner.json'), 'utf8'));
      } catch {
        throw Error('ST-LINK is being acquired by another engine process. Retry shortly.');
      }
      if (!Number.isInteger(owner.pid) || owner.pid <= 0)
        throw Error('Invalid ST-LINK lock owner.');
      try {
        process.kill(owner.pid, 0);
      } catch (e) {
        if (e.code === 'ESRCH') {
          await fs.rm(directory, { recursive: true, force: true });
          continue;
        }
      }
      throw Error(
        'ST-LINK is busy in another engine operation. Stop the board monitor or wait for flash verification.',
      );
    }
  }
  throw Error('Could not acquire ST-LINK.');
}
module.exports = { acquireProbe };
