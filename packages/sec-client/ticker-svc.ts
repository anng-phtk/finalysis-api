import Constants from '../runtime-svc/constants.js';
import * as fs from 'fs';
import path from 'node:path';
import chain from 'stream-chain';
import parser from 'stream-json';
import streamObject from 'stream-json/streamers/stream-object.js';


export const getCIK = async (ticker: string) => {
    if (!ticker || ticker === '') return null;
    const mappingFile = await findTickerMappingFile();
    if (!mappingFile) return null;

    const target = ticker.toUpperCase();
    const pipeline = chain([fs.createReadStream(mappingFile), parser(), streamObject()]);

    for await (const data of pipeline) {
        if (data.value.ticker === target) {
            pipeline.destroy();
            return String(data.value.cik_str).padStart(10, '0');
        }
    }

    return ;
};

export const findTickerMappingFile = async () => {
    try {
        if (!fs.existsSync(Constants.CACHE_DIR)) {
            fs.mkdirSync(Constants.CACHE_DIR, { recursive: true });
        }

        if (!fs.existsSync(Constants.CACHE_FILE)) {
            try {
                const secRequest = await fetch(Constants.TICKER_URL, { headers: Constants.headers });

                if (!secRequest.ok || secRequest.status !== 200) {
                    throw new Error(`Failed to fetch ticker map: ${secRequest.status} ${secRequest.statusText}`);
                }

                // Read the entire body into a variable
                let rawData = await secRequest.json();
                console.info(`Successfully fetched ticker map from SEC with status ${secRequest.status}`);
                console.info(`Fetched ${Object.keys(rawData).length} ticker entries from SEC`);

                // Save to Disk
                fs.writeFileSync(Constants.CACHE_FILE, JSON.stringify(rawData, null, 2));
            } catch (error: any) {
                console.error('Error fetching ticker map from SEC:', error.message || String(error));
                return null;
            }
        }

        return Constants.CACHE_FILE;
    } catch (err) {
        console.error('Error processing ticker mapping file:', err);
    }
};