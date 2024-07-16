import { test } from 'node:test';
import { parseTestReports } from '../junitParser.ts';

const DIRNAME = import.meta.dirname;
test('should parse junit report with multiple suites', async (t) => {
    const testReports = await parseTestReports('test', 'test', `${DIRNAME}/xml/testsuites.xml`, []);
    // @ts-expect-error
    t.assert.strictEqual(testReports.length, 3);
    // @ts-expect-error
    t.assert.strictEqual(testReports[0].annotations.length, 2);
});
test('should parse junit report with 1 suite', async (t) => {
    const testReports = await parseTestReports('test', 'test', `${DIRNAME}/xml/testsuite.xml`, []);
    // @ts-expect-error
    t.assert.strictEqual(testReports.length, 1);
    // @ts-expect-error
    t.assert.strictEqual(testReports[0].annotations.length, 2);
});
