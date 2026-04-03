import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const METRO_PORT = 8081;

const isPortInUse = (port) =>
  new Promise((resolve) => {
    const socket = net
      .createConnection({ host: '127.0.0.1', port })
      .once('connect', () => {
        socket.destroy();
        resolve(true);
      })
      .once('error', () => {
        resolve(false);
      });
  });

const run = async () => {
  const inUse = await isPortInUse(METRO_PORT);
  if (inUse) {
    console.error(
      `Port ${METRO_PORT} already has a Metro server. Stop existing Expo first (Ctrl+C in that terminal), then run this command again.`
    );
    console.error(
      'This prevents scanning a stale LAN QR code like exp://172.x.x.x that phones often cannot reach.'
    );
    process.exit(1);
  }

  const expoBin =
    process.platform === 'win32'
      ? path.resolve(process.cwd(), 'node_modules', '.bin', 'expo.cmd')
      : path.resolve(process.cwd(), 'node_modules', '.bin', 'expo');

  const child = spawn(expoBin, ['start', '--tunnel', '--clear'], {
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
};

run().catch((error) => {
  console.error(`Failed to start Expo tunnel: ${error.message}`);
  process.exit(1);
});
