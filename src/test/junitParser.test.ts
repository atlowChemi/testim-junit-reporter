import { test } from 'node:test';
import { parseTestReports } from '../junitParser.ts';

const DIRNAME = import.meta.dirname;

test('should parse junit report with 3 suites', async (t: any) => {
    const testReports = await parseTestReports('test', 'test', `${DIRNAME}/xml/testsuites.xml`, []);
    t.assert.strictEqual(testReports.length, 3);
    t.assert.strictEqual(testReports[0].annotations.length, 2);
});
test('should parse junit report with 1 suite', async (t: any) => {
    const testReports = await parseTestReports('test', 'test', `${DIRNAME}/xml/testsuite.xml`, []);
    t.assert.strictEqual(testReports.length, 1);
    t.assert.strictEqual(testReports[0].annotations.length, 2);
});
