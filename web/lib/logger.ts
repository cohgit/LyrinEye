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
        this.interceptNetwork();

        // Flush regularly
        setInterval(() => this.flush(), FLUSH_INTERVAL);

        // Flush on unload
        window.addEventListener('beforeunload', () => this.flush());
        window.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.flush();
        });

        this.info('Azure Logger initialized');
    }

    private interceptNetwork() {
        const _this = this;

        // 1. Intercept Fetch
        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            const url = args[0]?.toString();
            // Ignore log requests (prevent loop) and polling if noisy
            if (url && (url.includes(API_URL) || url.includes('socket.io'))) {
                return originalFetch.apply(this, args);
            }

            const startTime = Date.now();
            const method = args[1]?.method || 'GET';

            try {
                const response = await originalFetch.apply(this, args);

                const duration = Date.now() - startTime;
                _this.capture('info', [`[NETWORK] ${method} ${url} ${response.status} (${duration}ms)`]);

                if (!response.ok) {
                    _this.capture('error', [`[NETWORK-ERROR] ${method} ${url} ${response.status} ${response.statusText}`]);
                }

                return response;
            } catch (error: any) {
                const duration = Date.now() - startTime;
                _this.capture('error', [`[NETWORK-FAIL] ${method} ${url} (${duration}ms) - ${error.message}`]);
                throw error;
            }
        };

        // 2. Intercept XMLHttpRequest (Axios uses this)
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
            // @ts-ignore
            this._url = url.toString();
            // @ts-ignore
            this._method = method;
            // @ts-ignore
            this._startTime = Date.now();

            // @ts-ignore
            return originalOpen.apply(this, [method, url, ...rest]);
        };

        XMLHttpRequest.prototype.send = function (...args: any[]) {
            // @ts-ignore
            if (this._url && (this._url.includes(API_URL) || this._url.includes('socket.io'))) {
                // @ts-ignore
                return originalSend.apply(this, args as [Document | XMLHttpRequestBodyInit | null | undefined]);
            }

            this.addEventListener('load', function () {
                // @ts-ignore
                const duration = Date.now() - this._startTime;
                // @ts-ignore
                const status = this.status;
                // @ts-ignore
                const url = this._url;
                // @ts-ignore
                const method = this._method;

                _this.capture('info', [`[NETWORK] ${method} ${url} ${status} (${duration}ms)`]);

                if (status >= 400) {
                    _this.capture('error', [`[NETWORK-ERROR] ${method} ${url} ${status}`]);
                }
            });

            this.addEventListener('error', function () {
                // @ts-ignore
                const duration = Date.now() - this._startTime;
                // @ts-ignore
                const url = this._url;
                // @ts-ignore
                const method = this._method;
                _this.capture('error', [`[NETWORK-FAIL] ${method} ${url} (${duration}ms)`]);
            });

            // @ts-ignore
            return originalSend.apply(this, args as [Document | XMLHttpRequestBodyInit | null | undefined]);
        };
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
