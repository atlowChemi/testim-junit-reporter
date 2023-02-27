import * as fs from 'fs';
import * as core from '@actions/core';
import * as glob from '@actions/glob';
import * as github from '@actions/github';
import { XMLParser } from 'fast-xml-parser';
import { escapeEmoji, retrieve, parseTestimFailureMessage } from './utils';
import type { parseInputs } from './inputParser';

interface InternalTestResult {
    name?: string;
    fileName: string;
    skipped: number;
    totalCount: number;
    failedEvaluating: number;
    annotations: Annotation[];
}

export interface TestResult {
    fileName: string;
    checkName: string;
    summary: string;
    totalCount: number;
    failedEvaluating: number;
    skipped: number;
    failed: number;
    passed: number;
    annotations: Annotation[];
}

export interface Annotation {
    annotation_level: 'failure' | 'notice' | 'warning';
    title: string;
    message: string;
    path: string;
    end_line: number;
    start_line: number;
    raw_details: string;
}

interface JUnitTestCase {
    name: string;
    classname: string;
    ownedBy: string;
    ownerEmail: string;
    time: string;
    'system-out': string;
    failure?: { message: string };
    skipped?: {};
}

interface JUnitSuite {
    failure: string;
    'failure-evaluating': string;
    name: string;
    skipped: string;
    tests: string;
    timestamp: string;
    testcase: JUnitTestCase[];
}
interface JUnitReport {
    testsuites?: { testsuite?: JUnitSuite };
}

async function parseFile(file: string) {
    core.debug(`Parsing file ${file}`);

    const data: string = fs.readFileSync(file, 'utf8');
    const parser = new XMLParser({ allowBooleanAttributes: true, ignoreAttributes: false, attributeNamePrefix: '' });
    const report = parser.parse(data) as Partial<JUnitReport>;

    return parseSuite(report, file);
}

async function parseSuite({ testsuites: { testsuite } = {} }: Partial<JUnitReport> = {}, fileName: string) {
    const result: InternalTestResult = { fileName, name: testsuite?.name, totalCount: 0, skipped: 0, failedEvaluating: parseInt(testsuite?.['failure-evaluating'] || '0') || 0, annotations: [] };
    if (!testsuite?.testcase) {
        return result;
    }

    for (const { failure, skipped, name, ['system-out']: systemOut, classname } of testsuite.testcase) {
        result.totalCount++;
        const success = !failure;

        if (skipped) {
            result.skipped++;
        }

        result.annotations.push({
            annotation_level: success ? 'notice' : 'failure',
            title: escapeEmoji(name),
            message: parseTestimFailureMessage(failure?.message || ''),
            raw_details: `${escapeEmoji(classname)} - ${name}:\n(${failure?.message})`,
            path: systemOut,
            end_line: 1,
            start_line: 1,
        });
    }
    return result;
}

async function parseTestReports(checkName: string, summary: string, reportPathsGlob: string) {
    core.debug(`Process test report for: ${reportPathsGlob} (${checkName})`);
    const res: TestResult = { annotations: [], checkName, fileName: '', summary, totalCount: 0, skipped: 0, passed: 0, failed: 0, failedEvaluating: 0 };

    const globber = await glob.create(reportPathsGlob);
    for await (const file of globber.globGenerator()) {
        core.debug(`Parsing report file: ${file}`);

        const { totalCount, skipped, annotations, failedEvaluating, name, fileName } = await parseFile(file);
        if (totalCount === 0) {
            continue;
        }
        if (name) {
            res.checkName = name;
        }
        res.fileName = fileName;
        res.totalCount += totalCount;
        res.skipped += skipped;
        res.failedEvaluating += failedEvaluating;
        res.annotations.push(...annotations);
    }

    res.failed = res.annotations.filter(an => an.annotation_level === 'failure').length;
    res.passed = res.totalCount - res.failed - res.skipped;

    return res;
}

class NoTestsFoundError extends Error {}

export async function getTestReports(inputs: Readonly<ReturnType<typeof parseInputs>>) {
    core.startGroup(`📦 Process test results`);
    const reportsCount = inputs.reportPaths.length;

    const testResults: TestResult[] = [];
    const accumulateResult: TestResult = {
        checkName: '',
        fileName: '',
        summary: '',
        totalCount: 0,
        skipped: 0,
        failed: 0,
        passed: 0,
        failedEvaluating: 0,
        annotations: [],
    };

    core.info(`Retrieved ${reportsCount} report globs/files to process.`);

    for (let i = 0; i < reportsCount; i++) {
        const testResult = await parseTestReports(
            retrieve('checkName', inputs.checkName, i, reportsCount),
            retrieve('summary', inputs.summary, i, reportsCount),
            retrieve('reportPaths', inputs.reportPaths, i, reportsCount),
        );

        accumulateResult.totalCount += testResult.totalCount;
        accumulateResult.skipped += testResult.skipped;
        accumulateResult.failed += testResult.failed;
        accumulateResult.passed += testResult.passed;
        testResults.push(testResult);
    }

    core.setOutput('total', accumulateResult.totalCount);
    core.setOutput('passed', accumulateResult.passed);
    core.setOutput('skipped', accumulateResult.skipped);
    core.setOutput('failed', accumulateResult.failed);

    const foundResults = accumulateResult.totalCount > 0 || accumulateResult.skipped > 0;
    if (!foundResults && inputs.requireTests) {
        throw new NoTestsFoundError(`❌ No test results found for ${inputs.checkName}`);
    }

    const pullRequest = github.context.payload.pull_request;
    const link = pullRequest?.html_url || github.context.ref;
    // TODO: handle evaluating
    const conclusion: 'success' | 'failure' = accumulateResult.failed <= 0 ? 'success' : 'failure';
    const headSha = inputs.commit || pullRequest?.head.sha || github.context.sha;
    core.info(`ℹ️ Posting with conclusion '${conclusion}' to ${link} (sha: ${headSha})`);

    core.endGroup();

    return {
        accumulateResult,
        testResults,
        conclusion,
        headSha,
    };
}
