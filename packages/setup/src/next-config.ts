import { spawn } from 'child_process';
import { createConnection } from 'net';
import { fileURLToPath } from 'url';

const BRIDGE_PORT = 5179;

function isBridgeRunning(): Promise<boolean> {
    return new Promise(resolve => {
        const socket = createConnection({ port: BRIDGE_PORT, host: '127.0.0.1' });
        socket.once('connect', () => { socket.destroy(); resolve(true); });
        socket.once('error', () => resolve(false));
    });
}

let bridgeStarted = false;

function ensureBridge(): void {
    if (bridgeStarted) return;
    bridgeStarted = true;
    isBridgeRunning().then(running => {
        if (running) return;
        const cliPath = fileURLToPath(new URL('./cli.js', import.meta.url));
        const child = spawn(process.execPath, [cliPath, 'bridge', process.cwd()], {
            stdio: 'inherit',
            detached: false,
        });
        child.on('error', (err: Error) => {
            process.stderr.write(`[visual-edit] Falha ao iniciar bridge: ${err.message}\n`);
            bridgeStarted = false;
        });
        process.on('exit', () => { try { child.kill(); } catch {} });
    }).catch(() => { bridgeStarted = false; });
}

type NextConfig = Record<string, unknown>;
type WebpackOptions = { dev: boolean; isServer: boolean; nextRuntime?: string };

export function withVisualEdit(nextConfig: NextConfig = {}): NextConfig {
    return {
        ...nextConfig,
        webpack(config: any, options: WebpackOptions) {
            // Start bridge once, on the first server-side dev compilation (not edge/client)
            if (options.dev && options.isServer && options.nextRuntime !== 'edge') {
                ensureBridge();
            }

            // Inject OID loader
            const loaderPath = fileURLToPath(new URL('./next-loader.js', import.meta.url));
            config.module.rules.unshift({
                test: /\.(tsx|jsx)$/,
                exclude: /node_modules/,
                use: [loaderPath],
            });

            const upstream = (nextConfig as any).webpack;
            if (typeof upstream === 'function') {
                return upstream(config, options);
            }
            return config;
        },
    };
}
