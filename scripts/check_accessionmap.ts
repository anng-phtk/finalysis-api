import { buildAccessionMap } from "../packages/facts-svc/fact-extractor.js";
import type { FetchOptions } from "../packages/utils/types.js";

const opt: FetchOptions = { force: true } as FetchOptions
buildAccessionMap('NVDA').then(map => {
    console.log('Accession Map:', map);
}).catch(err => {
    console.error('Error building accession map:', err);
});