import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseTestReports } from '../junitParser';

const DIRNAME = __dirname;
const getFirstSuite = (fileName: string) => ({
    summary: 'test',
    checkName: 'first suite',
    fileName: `${DIRNAME}/${fileName}`,
    totalCount: 2,
    skipped: 1,
    failedEvaluating: 1,
    annotations: [
        {
            testStatus: 'draft',
            isTestimTest: true,
            annotation_level: 'notice',
            title: 'first suite first test',
            message: 'https://app.testim.io/#/project/coco/branch/master/test/1234567A?result-id=1234567A',
            raw_details: 'test - first suite first test:\n(undefined)',
            path: 'https://app.testim.io/#/project/coco/branch/master/test/1234567A?result-id=1234567A',
            end_line: 1,
            start_line: 1,
        },
        {
            testStatus: 'draft',
            isTestimTest: true,
            annotation_level: 'failure',
            title: 'first suite second test',
            message: 'Step Failed: Element is not visible More info at: \nhttps://app.testim.io/#/project/coco/branch/master/test/1234567B?result-id=1234567B',
            raw_details: 'test - first suite second test:\n(Step Failed: Element is not visible More info at: https://app.testim.io/#/project/coco/branch/master/test/1234567B?result-id=1234567B)',
            path: 'https://app.testim.io/#/project/coco/branch/master/test/1234567B?result-id=1234567B',
            end_line: 1,
            start_line: 1,
        },
    ],
    failed: 1,
    passed: 0,
});
describe('JunitParser', () => {
    it('should parse junit report with 3 suites', async () => {
        const testReports = await parseTestReports('test', 'test', `${DIRNAME}/xml/testsuites.xml`, []);
        assert.strictEqual(testReports.length, 3);
        assert.deepEqual(testReports[0], getFirstSuite('xml/testsuites.xml'));
    });
    it('should parse junit report with 1 suite', async () => {
        const testReports = await parseTestReports('test', 'test', `${DIRNAME}/xml/testsuite.xml`, []);
        assert.strictEqual(testReports.length, 1);
        assert.deepEqual(testReports[0], getFirstSuite('xml/testsuite.xml'));
    });
});
