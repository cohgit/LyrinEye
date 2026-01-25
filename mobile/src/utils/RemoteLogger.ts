import { io, Socket } from 'socket.io-client';
import { CONFIG } from '../config';

class RemoteLoggerService {
    private socket: Socket | null = null;
    private originalLog = console.log;
    private originalWarn = console.warn;
    private originalError = console.error;

    init() {
        // Create a dedicated socket for logging to avoid interfering with main signaling logic
        // or reuse existing connection logic if possible. For simplicity, we create a new one identifying as logger.
        this.socket = io(CONFIG.SIGNALING_SERVER);

        this.socket.on('connect', () => {
            this.originalLog('[RemoteLogger] Connected to logging server');
        });

        this.interceptConsole();
    }

    private interceptConsole() {
        console.log = (...args) => {
            this.originalLog(...args);
            this.emitLog('log', args);
        };

        console.warn = (...args) => {
            this.originalWarn(...args);
            this.emitLog('warn', args);
        };

        console.error = (...args) => {
            this.originalError(...args);
            this.emitLog('error', args);
        };
    }

    private emitLog(level: string, args: any[]) {
        if (this.socket?.connected) {
            // Convert args to string safely
            const message = args.map(arg => {
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(arg);
                    } catch (e) {
                        return String(arg);
                    }
                }
                return String(arg);
            }).join(' ');

            this.socket.emit('client-log', {
                level,
                message,
                timestamp: new Date().toISOString()
            });
        }
    }
}

export const RemoteLogger = new RemoteLoggerService();
