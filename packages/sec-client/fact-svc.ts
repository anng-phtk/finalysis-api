import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import Contants from '../runtime-svc/constants.js';
import fs from 'node:fs';
import path from 'node:path';



// Ensure data directory exists on load
if (!fs.existsSync(Contants.CACHE_DIR)) {
    fs.mkdirSync(Contants.CACHE_DIR, { recursive: true });
}

export interface FetchOptions {
    /** when true, ignore the cached JSON and always re-download */
    force?: boolean;
}

export async function ensureCompanyFactsIndex(cik: string, opts: FetchOptions = {}): Promise<string> {
    let paddedCik = cik.padStart(10, '0');
    const cachePath = path.join(Contants.CACHE_DIR, `CIK${paddedCik}.json`);

    // if force refresh is requested, remove existing cache so it will re-download
    if (opts.force && fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
    }
    const url = `${Contants.BASE_URL}/submissions/CIK${paddedCik}.json`;
    // 1. Check Cache
    if (!opts.force && fs.existsSync(cachePath)) {
        console.log(`[FactsService] Loading ${paddedCik} from local cache...`);
        return cachePath; 
    }

    // 2. Stream from SEC to Disk
    const response = await fetch(url, { headers: Contants.headers });
    if (!response.ok) throw new Error(`SEC Fetch Failed: ${response.status}`);

    const fileStream = fs.createWriteStream(cachePath);
    
    // This connects the network to the disk without loading the JSON into RAM
    await finished(Readable.fromWeb(response.body as any).pipe(fileStream));

    return cachePath;
}
export async function ensureCompanyFacts(cik: string, opts: FetchOptions = {}): Promise<string> {
    const paddedCik = cik.padStart(10, '0');
    const cachePath = path.join(Contants.CACHE_DIR, `facts-${paddedCik}.json`);

    // 1. If it exists and we aren't forcing, just return the path
    if (!opts.force && fs.existsSync(cachePath)) {
        return cachePath; 
    }

    // 2. Stream from SEC to Disk
    const url = `${Contants.BASE_URL}/api/xbrl/companyfacts/CIK${paddedCik}.json`;
    const response = await fetch(url, { headers: Contants.headers });

    if (!response.ok) throw new Error(`SEC Fetch Failed: ${response.status}`);

    const fileStream = fs.createWriteStream(cachePath);
    
    // This connects the network to the disk without loading the JSON into RAM
    await finished(Readable.fromWeb(response.body as any).pipe(fileStream));

    return cachePath;
}