// ==================== filing-queue.ts ====================

import fs from 'fs';
import path from 'path';
import { SecFilingExploder, SecExploderError } from './exploder.js';
import type { ManifestEntry } from './exploder.js';

// ==================== TYPES ====================

export interface FilingJob {
    id: string;
    ticker: string;
    cik: string;
    url: string;
    filingType: '10-K' | '10-Q' | '8-K';
    periodEndDate: string;
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    error?: string;
    manifest?: ManifestEntry[];
    outputDir?: string;
}

export interface EnqueuePayload {
    ticker: string;
    cik: string;
    url: string;
    filingType: '10-K' | '10-Q' | '8-K';
    periodEndDate: string;
}

// ==================== JOB QUEUE ====================

export class FilingJobQueue {
    private readonly baseDir: string;
    private readonly dirs: Record<FilingJob['status'], string>;
    private readonly lockTimeoutMs: number;

    constructor(baseDir: string, options?: { lockTimeoutMs?: number }) {
        this.baseDir = path.resolve(baseDir);
        this.lockTimeoutMs = options?.lockTimeoutMs ?? 30 * 60 * 1000;

        this.dirs = {
            pending: path.join(this.baseDir, 'pending'),
            processing: path.join(this.baseDir, 'processing'),
            completed: path.join(this.baseDir, 'completed'),
            failed: path.join(this.baseDir, 'failed'),
        };

        for (const dir of Object.values(this.dirs)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    enqueue(payload: EnqueuePayload): FilingJob {
        const job: FilingJob = {
            id: this.generateId(payload),
            ...payload,
            createdAt: Date.now(),
            status: 'pending',
        };

        const filePath = this.jobFilePath('pending', job.id);
        fs.writeFileSync(filePath, JSON.stringify(job, null, 2), 'utf-8');
        return job;
    }

    enqueueMany(payloads: EnqueuePayload[]): FilingJob[] {
        return payloads.map(p => this.enqueue(p));
    }

    dequeue(): FilingJob | null {
        this.recoverStaleJobs();

        const pendingFiles = this.listJobFiles('pending').sort();
        if (pendingFiles.length === 0) return null;

        const fileName = pendingFiles[0]!;
        const job = this.readJob('pending', fileName);
        if (!job) return null;

        job.status = 'processing';
        job.startedAt = Date.now();

        const processingPath = this.jobFilePath('processing', job.id);
        fs.writeFileSync(processingPath, JSON.stringify(job, null, 2), 'utf-8');

        // FIX: use job.id instead of fileName (fileName already has .json)
        fs.unlinkSync(this.jobFilePath('pending', job.id));

        return job;
    }

    complete(jobId: string, manifest: ManifestEntry[], outputDir: string): void {
        const job = this.readJob('processing', jobId);
        if (!job) throw new Error(`Job ${jobId} not found in processing`);

        job.status = 'completed';
        job.completedAt = Date.now();
        job.manifest = manifest;
        job.outputDir = outputDir;

        this.moveJob('processing', 'completed', jobId, job);
    }

    fail(jobId: string, error: string): void {
        const job = this.readJob('processing', jobId);
        if (!job) throw new Error(`Job ${jobId} not found in processing`);

        job.status = 'failed';
        job.completedAt = Date.now();
        job.error = error;

        this.moveJob('processing', 'failed', jobId, job);
    }

    getStatusCounts(): Record<FilingJob['status'], number> {
        return {
            pending: this.listJobFiles('pending').length,
            processing: this.listJobFiles('processing').length,
            completed: this.listJobFiles('completed').length,
            failed: this.listJobFiles('failed').length,
        };
    }

    getFailedJobs(): FilingJob[] {
        return this.listJobFiles('failed')
            .map(f => this.readJob('failed', f))
            .filter((j): j is FilingJob => j !== null);
    }

    retry(jobId: string): FilingJob | null {
        const job = this.readJob('failed', jobId);
        if (!job) return null;

        job.status = 'pending';
        delete job.startedAt;
        delete job.completedAt;
        delete job.error;
        delete job.manifest;
        delete job.outputDir;

        this.moveJob('failed', 'pending', jobId, job);
        return job;
    }

    retryAll(): number {
        const failed = this.getFailedJobs();
        for (const job of failed) {
            this.retry(job.id);
        }
        return failed.length;
    }

    // ==================== PRIVATE ====================

    private generateId(payload: EnqueuePayload): string {
        const ts = Date.now();
        const rand = Math.random().toString(36).slice(2, 6);
        const ticker = payload.ticker.toLowerCase();
        return `${ts}-${rand}-${ticker}`;
    }

    private jobFilePath(status: FilingJob['status'], jobId: string): string {
        return path.join(this.dirs[status], `${jobId}.json`);
    }

    private listJobFiles(status: FilingJob['status']): string[] {
        const dir = this.dirs[status];
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    }

    private readJob(status: FilingJob['status'], idOrFile: string): FilingJob | null {
        const fileName = idOrFile.endsWith('.json') ? idOrFile : `${idOrFile}.json`;
        const filePath = path.join(this.dirs[status], fileName);

        if (!fs.existsSync(filePath)) return null;

        try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(raw) as FilingJob;
        } catch {
            return null;
        }
    }

    private moveJob(
        fromStatus: FilingJob['status'],
        toStatus: FilingJob['status'],
        jobId: string,
        job: FilingJob
    ): void {
        const toPath = this.jobFilePath(toStatus, jobId);
        fs.writeFileSync(toPath, JSON.stringify(job, null, 2), 'utf-8');

        // FIX: jobFilePath already adds .json
        const fromPath = this.jobFilePath(fromStatus, jobId);
        if (fs.existsSync(fromPath)) {
            fs.unlinkSync(fromPath);
        }
    }

    private recoverStaleJobs(): void {
        const processingFiles = this.listJobFiles('processing');
        const now = Date.now();

        for (const fileName of processingFiles) {
            const job = this.readJob('processing', fileName);
            if (!job) continue;

            const elapsed = job.startedAt ? now - job.startedAt : Infinity;
            if (elapsed > this.lockTimeoutMs) {
                console.warn(`Recovering stale job: ${job.id} (elapsed: ${Math.round(elapsed / 1000)}s)`);
                job.status = 'pending';
                delete job.startedAt;
                this.moveJob('processing', 'pending', job.id, job);
            }
        }
    }
}

// ==================== WORKER ====================

export interface WorkerOptions {
    pollIntervalMs?: number;
    maxJobRetries?: number;
    onJobStart?: (job: FilingJob) => void;
    onJobComplete?: (job: FilingJob) => void;
    onJobError?: (job: FilingJob, error: Error) => void;
    onJobProgress?: (job: FilingJob, item: string, index: number, total: number) => void;
    filingOptions?: {
        userAgent?: string;
        keepStyles?: boolean;
        customCss?: string;
    };
}

export class FilingWorker {
    private readonly queue: FilingJobQueue;
    private readonly outputRoot: string;
    private readonly pollIntervalMs: number;
    private readonly maxJobRetries: number;
    private readonly filingOptions: WorkerOptions['filingOptions'];
    private readonly callbacks: Pick<WorkerOptions, 'onJobStart' | 'onJobComplete' | 'onJobError' | 'onJobProgress'>;
    
    private running = false;
    private activeJobs = 0;
    private stopRequested = false;
    private pollTimer?: ReturnType<typeof setTimeout>;

    constructor(queue: FilingJobQueue, outputRoot: string, options: WorkerOptions = {}) {
        this.queue = queue;
        this.outputRoot = path.resolve(outputRoot);
        this.pollIntervalMs = options.pollIntervalMs ?? 2000;
        this.maxJobRetries = options.maxJobRetries ?? 3;
        this.filingOptions = options.filingOptions;
        const callbacks: any = {};
        if (options.onJobStart) callbacks.onJobStart = options.onJobStart;
        if (options.onJobComplete) callbacks.onJobComplete = options.onJobComplete;
        if (options.onJobProgress) callbacks.onJobProgress = options.onJobProgress;
        if (options.onJobError) callbacks.onJobError = options.onJobError;
        this.callbacks = callbacks;

        fs.mkdirSync(this.outputRoot, { recursive: true });
    }

    async start(): Promise<void> {
        if (this.running) return;
        
        this.running = true;
        this.stopRequested = false;
        console.log(`Worker started. Polling every ${this.pollIntervalMs}ms`);
        console.log(`Output root: ${this.outputRoot}`);

        while (!this.stopRequested) {
            const job = this.queue.dequeue();
            
            if (job) {
                this.activeJobs++;
                this.processJob(job).finally(() => {
                    this.activeJobs--;
                });
            } else {
                await this.sleep(this.pollIntervalMs);
            }
        }

        while (this.activeJobs > 0) {
            await this.sleep(100);
        }

        this.running = false;
        console.log('Worker stopped.');
    }

    stop(): void {
        this.stopRequested = true;
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
        }
    }

    async processJob(job: FilingJob): Promise<void> {
        const outputDir = this.buildOutputPath(job);
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Processing: ${job.ticker} ${job.filingType} (${job.periodEndDate})`);
        console.log(`URL: ${job.url}`);
        console.log(`Output: ${outputDir}`);

        this.callbacks.onJobStart?.(job);

        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= this.maxJobRetries; attempt++) {
            try {
                if (attempt > 1) {
                    console.log(`  Retry attempt ${attempt}/${this.maxJobRetries}...`);
                }

                const exploderOpts: any = {
                    outputRoot: outputDir,
                    dryRun: false,
                    onProgress: (item: string, index: number, total: number) => {
                        console.log(`  [${index + 1}/${total}] ${item}`);
                        this.callbacks.onJobProgress?.(job, item, index, total);
                    },
                };
                if (this.filingOptions?.userAgent) exploderOpts.userAgent = this.filingOptions.userAgent;
                if (this.filingOptions?.keepStyles !== undefined) exploderOpts.keepStyles = this.filingOptions.keepStyles;
                if (this.filingOptions?.customCss) exploderOpts.customCss = this.filingOptions.customCss;

                const exploder = new SecFilingExploder(job.url, exploderOpts);

                const result = await exploder.explode();
                
                this.queue.complete(job.id, result.manifest, outputDir);
                this.callbacks.onJobComplete?.(job);
                console.log(`✓ Completed: ${result.manifest.length} sections`);
                return; 
                
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                console.warn(`  ✗ Attempt ${attempt} failed: ${lastError.message}`);
                
                if (attempt < this.maxJobRetries) {
                    await this.sleep(2000 * attempt);
                }
            }
        }

        const errMessage = lastError?.message || 'Unknown error after retries';
        console.error(`✗ Failed permanently after ${this.maxJobRetries} retries: ${errMessage}`);
        
        this.queue.fail(job.id, errMessage);
        this.callbacks.onJobError?.(job, lastError || new Error(errMessage));
    }

    private buildOutputPath(job: FilingJob): string {
        return path.join(
            this.outputRoot,
            'filings',
            job.ticker.toUpperCase(),
            job.periodEndDate,
            job.filingType
        );
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => {
            this.pollTimer = setTimeout(resolve, ms);
        });
    }
}