import { REPORTED_METRICS } from "../utils/types.js";
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick.js';
import { streamValues } from 'stream-json/streamers/stream-values.js';
import fs from 'node:fs';
import streamObject from "stream-json/streamers/stream-object.js";

export interface AccessionMeta {
    form: string;
    reportDate: string;
    primaryDoc: string;
    isAnnual: boolean;
}

export interface ExtractedFact {
    metric: string;
    date: string;
    value: number;
    form: string;
    reportDate: string;
    rank: number;
}

export type ExtractedFactsMap = Record<string, ExtractedFact>;

export const buildAccessionMapFromRecentFilings = (recentFilings: any): Map<string, AccessionMeta> => {
    const accessionMap: Map<string, AccessionMeta> = new Map();

    const forms = recentFilings?.form ?? [];
    const reportDates = recentFilings?.reportDate ?? [];
    const accessionNumbers = recentFilings?.accessionNumber ?? [];
    const primaryDocuments = recentFilings?.primaryDocument ?? [];

    for (let i = 0; i < forms.length; i++) {
        const formType = String(forms[i] ?? '');
        const reportDate = String(reportDates[i] ?? '');
        const accessionNumber = String(accessionNumbers[i] ?? '');
        const primaryDoc = String(primaryDocuments[i] ?? '');

        if (!accessionNumber) continue;

        accessionMap.set(accessionNumber, {
            form: formType,
            reportDate,
            primaryDoc,
            isAnnual: formType === '10-K'
        });
    }

    return accessionMap;
};

export const buildAccessionMap = async (indexPath: string): Promise<Map<string, AccessionMeta>> => {
    const pipeline = chain([
        fs.createReadStream(indexPath),
        parser(),
        pick({ filter: 'filings.recent' }),
        streamValues()
    ]);

    for await (const { value } of pipeline) {
        return buildAccessionMapFromRecentFilings(value);
    }

    return new Map();
};

export const buildTagToMetricMap = (): Map<string, { metric: string; rank: number }> => {
    const tagToMetricMap: Map<string, { metric: string; rank: number }> = new Map();

    for (const [metricKey, metricInfo] of Object.entries(REPORTED_METRICS)) {
        metricInfo.tags.forEach((tag, index) => {
            tagToMetricMap.set(tag, { metric: metricKey, rank: index });
        });
    }

    return tagToMetricMap;
};

export const selectFactsFromFactsFile = async (
    factsFile: string,
    accessionMap: Map<string, AccessionMeta>
): Promise<ExtractedFactsMap> => {
    type ReportedMetricKey = keyof typeof REPORTED_METRICS;

    const tagToMetricMap = buildTagToMetricMap();
    const results: Map<string, ExtractedFact> = new Map();
    const pipeline = chain([
        fs.createReadStream(factsFile),
        parser(),
        pick({ filter: 'facts.us-gaap' }),
        streamObject()
    ]);

    for await (const { key: tag, value: content } of pipeline) {
        const metricKey = tagToMetricMap.get(String(tag));
        if (!metricKey) continue;

        const metric = metricKey.metric;
        const metricRank = metricKey.rank;
        const targetUnit = REPORTED_METRICS[metric as ReportedMetricKey].opts.unit;
        const unitData = content.units?.[targetUnit];
        if (!unitData) continue;

        for (const fact of unitData) {
            const accessionMeta = accessionMap.get(fact.accn);
            if (!accessionMeta) continue;
            if (fact.form !== '10-K' && fact.form !== '10-Q') continue;
            if (fact.end !== accessionMeta.reportDate) continue;

            const metricType = REPORTED_METRICS[metric as ReportedMetricKey].opts.kind;

            if (metricType !== 'INSTANT' && fact.start) {
                const days = (Date.parse(fact.end) - Date.parse(fact.start)) / 86400000;
                if (fact.form === '10-Q' && (days < 70 || days > 110)) continue;
                if (fact.form === '10-K' && days < 300) continue;
            }

            if (metricType === 'FLOW' && fact.start) {
                const days = (Date.parse(fact.end) - Date.parse(fact.start)) / 86400000;
                if (fact.form.startsWith('10-Q') && (days < 70 || days > 110)) continue;
                if (fact.form.startsWith('10-K') && days < 300) continue;
            }

            const reportDate = accessionMeta.reportDate || '';
            const rec: ExtractedFact = {
                metric,
                date: String(fact.end),
                value: fact.val,
                form: fact.form,
                reportDate,
                rank: metricRank,
            };

            const groupKey = `${reportDate}:${fact.form}:${metric}`;
            const existing = results.get(groupKey);
            if (!existing || existing.rank >= metricRank) {
                results.set(groupKey, rec);
            }
        }
    }

    return Object.fromEntries(results);
};

export const extractFacts = async (indexFile: string, factsFile: string): Promise<ExtractedFactsMap> => {
    const accessionMap = await buildAccessionMap(indexFile);
    return selectFactsFromFactsFile(factsFile, accessionMap);
};
