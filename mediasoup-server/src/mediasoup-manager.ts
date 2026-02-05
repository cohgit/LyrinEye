import * as mediasoup from 'mediasoup';
import { Worker, Router } from 'mediasoup/node/lib/types';
import { config } from './config';

export class MediasoupManager {
    private workers: Worker[] = [];
    private routers: Map<string, Router> = new Map();
    private nextWorkerIdx = 0;

    async init() {
        console.log('🚀 Initializing Mediasoup workers...');

        for (let i = 0; i < config.mediasoup.numWorkers; i++) {
            const worker = await mediasoup.createWorker({
                logLevel: config.mediasoup.worker.logLevel,
                logTags: config.mediasoup.worker.logTags,
                rtcMinPort: config.mediasoup.worker.rtcMinPort,
                rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
            });

            worker.on('died', () => {
                console.error(`❌ Worker ${worker.pid} died, exiting in 2 seconds...`);
                setTimeout(() => process.exit(1), 2000);
            });

            this.workers.push(worker);
            console.log(`✓ Worker ${i + 1} created (PID: ${worker.pid})`);
        }

        console.log(`✅ ${this.workers.length} Mediasoup workers initialized`);
    }

    async createRouter(roomId: string): Promise<Router> {
        const worker = this.getNextWorker();

        const router = await worker.createRouter({
            mediaCodecs: config.mediasoup.router.mediaCodecs,
        });

        this.routers.set(roomId, router);
        console.log(`✓ Router created for room: ${roomId}`);

        return router;
    }

    getRouter(roomId: string): Router | undefined {
        return this.routers.get(roomId);
    }

    deleteRouter(roomId: string) {
        const router = this.routers.get(roomId);
        if (router) {
            router.close();
            this.routers.delete(roomId);
            console.log(`✓ Router deleted for room: ${roomId}`);
        }
    }

    private getNextWorker(): Worker {
        const worker = this.workers[this.nextWorkerIdx];
        this.nextWorkerIdx = (this.nextWorkerIdx + 1) % this.workers.length;
        return worker;
    }

    getWorkerStats() {
        return this.workers.map((worker, idx) => ({
            id: idx,
            pid: worker.pid,
            usage: worker.appData,
        }));
    }
}
