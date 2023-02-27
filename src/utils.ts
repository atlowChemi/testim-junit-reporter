import * as core from '@actions/core';
import * as http from '@actions/http-client';
import type { JUnitTestCase } from './junitParser';

export function retrieve(name: string, items: string[], index: number, total: number): string {
    if (total > 1) {
        if (items.length !== 0 && items.length !== total) {
            core.warning(`${name} has a different number of items than the 'reportPaths' input. This is usually a bug.`);
        }

        if (items.length === 0) {
            return '';
        } else if (items.length === 1) {
            return items[0].replace('\n', '');
        } else if (items.length > index) {
            return items[index].replace('\n', '');
        } else {
            core.error(`${name} has no valid config for position ${index}.`);
            return '';
        }
    } else if (items.length === 1) {
        return items[0].replace('\n', '');
    } else {
        return '';
    }
}

export function escapeEmoji(input: string) {
    const regex =
        /[\u{1f300}-\u{1f5ff}\u{1f900}-\u{1f9ff}\u{1f600}-\u{1f64f}\u{1f680}-\u{1f6ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}\u{1f1e6}-\u{1f1ff}\u{1f191}-\u{1f251}\u{1f004}\u{1f0cf}\u{1f170}-\u{1f171}\u{1f17e}-\u{1f17f}\u{1f18e}\u{3030}\u{2b50}\u{2b55}\u{2934}-\u{2935}\u{2b05}-\u{2b07}\u{2b1b}-\u{2b1c}\u{3297}\u{3299}\u{303d}\u{00a9}\u{00ae}\u{2122}\u{23f3}\u{24c2}\u{23e9}-\u{23ef}\u{25b6}\u{23f8}-\u{23fa}]/gu;
    return input.replace(regex, ``);
}

function findMatchingOption(message: string, ...strings: string[]) {
    for (const str of strings) {
        const index = message.indexOf(str);
        if (index > -1) {
            return { index, length: str.length };
        }
    }
    const str = strings.at(-1);
    const index = str ? message.indexOf(str) : -1;
    return { index, length: str?.length || 0 };
}

export function parseTestimFailureMessage(textContent: string) {
    const https = 'https://';
    const urlLocation = findMatchingOption(textContent, `More info at: ${https}`, `aborted${https}`, `: ${https}`);
    const msgSubstringLength = urlLocation.length - https.length;
    const message = textContent.substring(0, urlLocation.index + msgSubstringLength);
    const link = `https://${textContent.substring(message.length).split('https://').at(1)}`;

    return `${message}\n${link}`;
}

function getTestimSuiteDetails(testCases: JUnitTestCase[]) {
    const testimResult = testCases.find(({ ['system-out']: syso }) => syso?.includes('https://app.testim.io/#/project'));
    const urlParts = testimResult?.['system-out'].match(/\/project\/(?<projectId>.*)\/branch\/(?<branch>.*)\/test/);
    if (!urlParts?.groups) {
        return {};
    }
    const { projectId, branch } = urlParts.groups;
    return { projectId, branch };
}

function parseProjectTokenDictionary(projectTokenDictionaryStrs: string[]) {
    const entries = projectTokenDictionaryStrs.map(str => str.split(':').map(val => val.trim()) as [string, string]).filter(([key, value, ...rest]) => !rest.length || (key && value));
    return Object.fromEntries(entries);
}

const httpClient = new http.HttpClient();
const projectBranchTestStatusMap = new Map<string, Promise<{ _id: string; testStatus?: string }[]>>();

export async function getTestStatusesFromPublicAPI(testCases: JUnitTestCase[], projectTokenDictionaryStrs: string[]) {
    const { branch, projectId } = getTestimSuiteDetails(testCases);
    const projectTokenDictionary = parseProjectTokenDictionary(projectTokenDictionaryStrs);

    if (!branch || !projectId || !projectTokenDictionary[projectId]) {
        return [];
    }

    const mapKey = `${projectId}_${branch}`;

    if (projectBranchTestStatusMap.has(mapKey)) {
        return await projectBranchTestStatusMap.get(mapKey);
    }

    const loadTestList = async () => {
        const res = await httpClient.get(`https://api.testim.io/tests?branch=${branch}&includeTestStatus=true`, {
            Authorization: `Bearer ${projectTokenDictionary[projectId]}`,
            'Content-Type': 'application/json',
        });
        const { tests, error } = JSON.parse(await res.readBody()) as { error?: string; tests: { _id: string; testStatus?: string }[] };
        if (error) {
            throw new Error(error);
        }
        return tests;
    };
    const testListPerProjectAndBranch = loadTestList();

    projectBranchTestStatusMap.set(mapKey, testListPerProjectAndBranch);
    return await testListPerProjectAndBranch;
}
