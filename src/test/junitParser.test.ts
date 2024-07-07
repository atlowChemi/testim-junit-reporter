import { test } from 'node:test';
import { parseTestReports } from '../junitParser';

const DIRNAME = __dirname;

// describe('JunitParser', () => {
//     it('should parse junit report with 3 suites', async () => {
//         const testReports = await parseTestReports('test', 'test', `${DIRNAME}/xml/testsuites.xml`, []);
//         assert.strictEqual(testReports.length, 3);
//         assert.deepEqual(testReports[0], getFirstSuite('xml/testsuites.xml'));
//     });
//     it('should parse junit report with 1 suite', async () => {
//         const testReports = await parseTestReports('test', 'test', `${DIRNAME}/xml/testsuite.xml`, []);
//         assert.strictEqual(testReports.length, 1);
//         assert.deepEqual(testReports[0], getFirstSuite('xml/testsuite.xml'));
//     });
// });
test('should parse junit report with 3 suites', async (t: any) => {
    const testReports = await parseTestReports('test', 'test', `${DIRNAME}/xml/testsuites.xml`, []);
    t.assert.snapshot(testReports.length);
    t.assert.snapshot(testReports[0].fileName);
    t.assert.snapshot(testReports[0].annotations.length);
});
test('should parse junit report with 1 suite', async (t: any) => {
    const testReports = await parseTestReports('test', 'test', `${DIRNAME}/xml/testsuite.xml`, []);
    t.assert.snapshot(testReports.length);
    t.assert.snapshot(testReports[0].fileName);
    t.assert.snapshot(testReports[0].annotations.length);
});
