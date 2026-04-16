import { buildAccessionMap } from "../packages/facts-svc/fact-extractor.js";

buildAccessionMap('NVDA', { force: true }).then(map => {
    console.log('Accession Map:', map);
}).catch(err => {
    console.error('Error building accession map:', err);
});