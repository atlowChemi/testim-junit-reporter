import * as fs from 'fs';
import * as core from '@actions/core';
import * as glob from '@actions/glob';
import * as github from '@actions/github';
import { XMLParser } from 'fast-xml-parser';
import { escapeEmoji, retrieve, castArray, parseTestimFailureMessage, getTestStatusesFromPublicAPI } from './utils';
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
    testStatus: string;
    isTestimTest: boolean;
}

export interface JUnitTestCase {
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
    testcase: JUnitTestCase | JUnitTestCase[];
}
interface JUnitReport {
    testsuite?: JUnitSuite;
    testsuites?: { testsuite?: JUnitSuite | JUnitSuite[] };
}

async function parseFile(file: string, projectTokenDictionaryStrs: string[]) {
    // core.debug(`Parsing file ${file}`);

    const data: string = fs.readFileSync(file, 'utf8');
    const parser = new XMLParser({ allowBooleanAttributes: true, ignoreAttributes: false, attributeNamePrefix: '' });
    const report = parser.parse(data) as Partial<JUnitReport>;
    const testsuites = castArray(report.testsuites?.testsuite);
    const result: InternalTestResult[] = [];
    for (const testsuite of testsuites) {
        await parseSuite(file, projectTokenDictionaryStrs, testsuite as JUnitSuite, result);
    }
    return result;
}

async function parseSuite(fileName: string, projectTokenDictionaryStrs: string[], testsuite: JUnitSuite, result: InternalTestResult[]) {
    const testSuiteResult: InternalTestResult = {
        fileName,
        name: testsuite?.name,
        totalCount: 0,
        skipped: 0,
        failedEvaluating: parseInt(testsuite?.['failure-evaluating'] || '0') || 0,
        annotations: [],
    };
    if (!testsuite?.testcase) {
        return testsuite;
    }

    const testCases = castArray(testsuite.testcase);
    const testListInfo = await getTestStatusesFromPublicAPI(testCases, projectTokenDictionaryStrs);

    for (const { failure, skipped, name, ['system-out']: systemOut, classname } of testCases) {
        testSuiteResult.totalCount++;
        const success = !failure;

        if (typeof skipped !== 'undefined') {
            testSuiteResult.skipped++;
        }

        const isTestimTest = systemOut?.startsWith('https://app.testim.io/#/project');
        const { testId } = systemOut?.match(/\/test\/(?<testId>.*)\?/)?.groups || {};
        const testStatus = (testId && testListInfo?.find(({ _id }) => _id === testId)?.testStatus) || 'draft';

        let annotation_level: Annotation['annotation_level'] = 'notice';
        if (!success) {
            annotation_level = testStatus === 'evaluating' ? 'warning' : 'failure';
        }

        testSuiteResult.annotations.push({
            testStatus,
            isTestimTest,
            annotation_level,
            title: escapeEmoji(isTestimTest ? name : `${classname} - ${name}`),
            message: isTestimTest ? (failure ? parseTestimFailureMessage(failure.message) : systemOut) : failure?.toString() || '',
            raw_details: `${escapeEmoji(classname)} - ${name}:\n(${failure?.message})`,
            path: systemOut || 'unknown',
            end_line: 1,
            start_line: 1,
        });
    }
    return result.push(testSuiteResult);
}

async function parseTestReports(checkName: string, summary: string, reportPathsGlob: string, projectTokenDictionaryStrs: string[]) {
    // core.info(`Process test report for: ${reportPathsGlob} (${checkName})`);
    const testResults: TestResult[] = [];

    const globber = await glob.create(reportPathsGlob);
    for await (const file of globber.globGenerator()) {
        // core.info(`Parsing report file: ${file}`);
        const suites = await parseFile(file, projectTokenDictionaryStrs);
        for (const suite of suites) {
            const { totalCount, skipped, annotations, failedEvaluating, name, fileName } = suite;
            if (totalCount === 0) {
                continue;
            }
            const failed = annotations.filter(an => an.annotation_level !== 'notice').length;
            const passed = totalCount - failed - skipped;
            testResults.push({
                summary,
                checkName: name || checkName,
                fileName,
                totalCount,
                skipped,
                failedEvaluating,
                annotations,
                failed,
                passed,
            });
        }
    }

    return testResults;
}

class NoTestsFoundError extends Error {}

export async function getTestReports(inputs: Readonly<ReturnType<typeof parseInputs>>) {
    core.startGroup(`📦 Process test results`);
    const reportsCount = inputs.reportPaths.length;

    core.info(`Retrieved ${reportsCount} report globs/files to process.`);

    const allResults = await Promise.all(
        inputs.reportPaths.map(async (_, i) =>
            parseTestReports(
                retrieve('checkName', inputs.checkName, i, reportsCount),
                retrieve('summary', inputs.summary, i, reportsCount),
                retrieve('reportPaths', inputs.reportPaths, i, reportsCount),
                inputs.projectTokenDictionary,
            ),
        ),
    );
    const testResults = allResults.flat();
    const accumulatedResult: TestResult = {
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
    for (const tr of testResults) {
        accumulatedResult.totalCount += tr.totalCount;
        accumulatedResult.skipped += tr.skipped;
        accumulatedResult.failed += tr.failed;
        accumulatedResult.passed += tr.passed;
        accumulatedResult.failedEvaluating += tr.failedEvaluating;
        accumulatedResult.annotations.push(...tr.annotations);
    }

    core.setOutput('total', accumulatedResult.totalCount);
    core.setOutput('passed', accumulatedResult.passed);
    core.setOutput('skipped', accumulatedResult.skipped);
    core.setOutput('failed', accumulatedResult.failed);
    core.setOutput('failedEvaluating', accumulatedResult.failedEvaluating);

    const foundResults = accumulatedResult.totalCount > 0 || accumulatedResult.skipped > 0;
    if (!foundResults && inputs.requireTests) {
        throw new NoTestsFoundError(`❌ No test results found for ${inputs.checkName}`);
    }

    const pullRequest = github.context.payload.pull_request;
    const link = pullRequest?.html_url || github.context.ref;
    const actualFailed = accumulatedResult.failed - accumulatedResult.failedEvaluating;
    const conclusion: 'success' | 'failure' = actualFailed <= 0 ? 'success' : 'failure';
    const headSha = inputs.commit || pullRequest?.head.sha || github.context.sha;
    core.info(`ℹ️ Posting with conclusion '${conclusion}' to ${link} (sha: ${headSha})`);

    core.endGroup();

    return {
        accumulatedResult,
        testResults,
        conclusion,
        headSha,
    };
}

// parseTestReports('elad', 'summary', '/Users/eladtal/testim-junit-reporter/testim-junit-reporter-1/src/report-test_plan_sanity_params_test_plan_basic_and_basic_selenium.xml', ['testimProjectToken:token', 'testimProjectToken2:token2']);
parseTestReports('elad', 'summary', '/Users/eladtal/testim-junit-reporter/testim-junit-reporter-1/src/report-small_res_ui_test_save_delete.xml', [
    'testimProjectToken:token',
    'testimProjectToken2:token2',
]);
