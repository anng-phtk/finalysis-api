import { REPORTED_METRICS } from "./metrics.types.js";
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

export type SelectionMode = 'ANNUAL' | 'VALUATION' | 'QUARTERLY';

export const buildAccessionMapFromRecentFilings = (
    recentFilings: any
): Map<string, AccessionMeta> => {
    const accessionMap = new Map<string, AccessionMeta>();

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
            isAnnual: formType.startsWith('10-K')
        });
    }

    return accessionMap;
};

export const selectValuationAccessions = (
    accessionMap: Map<string, AccessionMeta>
): Map<string, AccessionMeta> => {
    let latest10KReportDate = '';

    for (const [, value] of accessionMap) {
        if (value.form.startsWith('10-K') && value.reportDate > latest10KReportDate) {
            latest10KReportDate = value.reportDate;
        }
    }

    if (!latest10KReportDate) {
        return new Map(sortAccessionsDesc(Array.from(accessionMap.entries())));
    }

    const filtered: Array<[string, AccessionMeta]> = [];

    for (const [key, value] of accessionMap) {
        if (value.form.startsWith('10-K')) {
            filtered.push([key, value]);
            continue;
        }

        if (value.form.startsWith('10-Q') && value.reportDate > latest10KReportDate) {
            filtered.push([key, value]);
        }
    }

    return new Map(sortAccessionsDesc(filtered));
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
        pick({ filter: 'facts' }),
        streamObject()
    ]);

    for await (const { key: namespace, value: tags } of pipeline) {
        if (namespace !== 'us-gaap' && namespace !== 'dei') continue;
        for (const [tag, content] of Object.entries(tags as any)) {
            const metricKey = tagToMetricMap.get(String(tag));
            if (!metricKey) continue;

        const metric = metricKey.metric;
        const metricRank = metricKey.rank;
        const targetUnit = REPORTED_METRICS[metric as ReportedMetricKey].opts.unit;
        const unitData = content.units?.[targetUnit];
        if (!unitData) continue;

        for (const fact of unitData) {
            // Normalize fact.accn to include dashes if it's purely alphanumeric (e.g. 000032019323000106 -> 0000320193-23-000106)
            let formattedAccn = fact.accn;
            if (formattedAccn && formattedAccn.length === 18 && !formattedAccn.includes('-')) {
                formattedAccn = `${formattedAccn.slice(0, 10)}-${formattedAccn.slice(10, 12)}-${formattedAccn.slice(12)}`;
            }

            const accessionMeta = accessionMap.get(formattedAccn) || accessionMap.get(fact.accn);
            if (!accessionMeta) continue;
            if (!accessionMeta.form.startsWith('10-K') && !accessionMeta.form.startsWith('10-Q')) continue;
            if (fact.end !== accessionMeta.reportDate) continue;

            const metricType = REPORTED_METRICS[metric as ReportedMetricKey].opts.kind;

            if (metricType !== 'INSTANT' && fact.start) {
                const days = (Date.parse(fact.end) - Date.parse(fact.start)) / 86400000;
                if (accessionMeta.form.startsWith('10-Q') && (days < 70 || days > 110)) continue;
                if (accessionMeta.form.startsWith('10-K') && days < 300) continue;
            }

            if (metricType === 'FLOW' && fact.start) {
                const days = (Date.parse(fact.end) - Date.parse(fact.start)) / 86400000;
                if (accessionMeta.form.startsWith('10-Q') && (days < 70 || days > 110)) continue;
                if (accessionMeta.form.startsWith('10-K') && days < 300) continue;
            }

            const reportDate = accessionMeta.reportDate || '';
            const rec: ExtractedFact = {
                metric,
                date: String(fact.end),
                value: fact.val,
                form: accessionMeta.form, // Use actual filing form type
                reportDate,
                rank: metricRank,
            };

            const groupKey = `${accessionMeta.reportDate}:${accessionMeta.form}:${metric}`;
            const existing = results.get(groupKey);
            if (!existing || existing.rank >= metricRank) {
                results.set(groupKey, rec);
            }
        }
        }
    }

    return Object.fromEntries(results);
};

export const selectQuarterlyHistoryAccessions = (
    accessionMap: Map<string, AccessionMeta>,
    maxLimit: number = 6
): Map<string, AccessionMeta> => {
    const quarterlyEntries = Array.from(accessionMap.entries())
        .filter(([, value]) => value.form.startsWith('10-Q') && value.reportDate);

    const sortedEntries = sortAccessionsDesc(quarterlyEntries);

    return new Map(sortedEntries.slice(0, maxLimit));
}


export const selectAnnualAccessions = (
    accessionMap: Map<string, AccessionMeta>
): Map<string, AccessionMeta> => {
    const annualEntries = Array.from(accessionMap.entries())
        .filter(([, value]) => value.form.startsWith('10-K') && value.reportDate);

    return new Map(sortAccessionsDesc(annualEntries));
};


const sortAccessionsDesc = (
    entries: Array<[string, AccessionMeta]>
): Array<[string, AccessionMeta]> => {
    return entries.sort(
        (a, b) => Date.parse(b[1].reportDate) - Date.parse(a[1].reportDate)
    );
};

export const extractFacts = async (
    indexFile: string,
    factsFile: string,
    mode: SelectionMode = 'VALUATION'
): Promise<{ facts: ExtractedFactsMap; mode: SelectionMode }> => {
    const accessionMap = await buildAccessionMap(indexFile);
    let accessions: Map<string, AccessionMeta>;
    if (mode === 'QUARTERLY') {
        accessions = selectQuarterlyHistoryAccessions(accessionMap);
    } else if (mode === 'ANNUAL') {
        accessions = selectAnnualAccessions(accessionMap);
    } else {
        accessions = selectValuationAccessions(accessionMap);
    }
    return {
        facts: await selectFactsFromFactsFile(factsFile, accessions),
        mode,
    };
};