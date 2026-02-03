'use client';

import axios from 'axios';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface UnsentLog {
    level: LogLevel;
    message: string;
    timestamp: string;
    url: string;
    userAgent: string;
}

const API_URL = '/api/proxy/api/web/logs'; // Proxy to backend
const FLUSH_INTERVAL = 5000;
const MAX_BATCH_SIZE = 50;

class AzureLogger {
    private buffer: UnsentLog[] = [];
    private originalConsole = {
        log: console.log,
        error: console.error,
        warn: console.warn,
        info: console.info,
    };
    private initialized = false;

    init() {
        if (typeof window === 'undefined' || this.initialized) return;

        this.initialized = true;
        this.overrideConsole();

        // Flush regularly
        setInterval(() => this.flush(), FLUSH_INTERVAL);

        // Flush on unload
        window.addEventListener('beforeunload', () => this.flush());
        window.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.flush();
        });

        this.info('Azure Logger initialized');
    }

    private overrideConsole() {
        console.log = (...args) => {
            this.originalConsole.log(...args);
            this.capture('info', args);
        };
        console.error = (...args) => {
            this.originalConsole.error(...args);
            this.capture('error', args);
        };
        console.warn = (...args) => {
            this.originalConsole.warn(...args);
            this.capture('warn', args);
        };
        console.info = (...args) => {
            this.originalConsole.info(...args);
            this.capture('info', args);
        };
    }

    private capture(level: LogLevel, args: any[]) {
        try {
            const message = args.map(arg => {
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(arg);
                    } catch {
                        return '[Circular/Object]';
                    }
                }
                return String(arg);
            }).join(' ');

            this.buffer.push({
                level,
                message,
                timestamp: new Date().toISOString(),
                url: window.location.href,
                userAgent: navigator.userAgent
            });

            if (this.buffer.length >= MAX_BATCH_SIZE) {
                this.flush();
            }
        } catch (err) {
            // Prevent infinite loop if logging fails
        }
    }

    private async flush() {
        if (this.buffer.length === 0) return;

        const logsToSend = [...this.buffer];
        this.buffer = [];

        try {
            // Use fetch keepalive for better reliability on unload
            // or standard axios for normal ops
            if (navigator.sendBeacon) {
                const blob = new Blob([JSON.stringify({ logs: logsToSend, source: 'web-client' })], { type: 'application/json' });
                navigator.sendBeacon(API_URL, blob);
            } else {
                await axios.post(API_URL, {
                    logs: logsToSend,
                    source: 'web-client'
                });
            }
        } catch (error) {
            // Fallback: put back in buffer (optional, but careful about memory)
            // this.originalConsole.error('Failed to send logs to Azure', error);
        }
    }

    // Explicit logging methods if needed
    log(...args: any[]) { console.log(...args); }
    error(...args: any[]) { console.error(...args); }
    warn(...args: any[]) { console.warn(...args); }
    info(...args: any[]) { console.info(...args); }
}

export const azureLogger = new AzureLogger();
