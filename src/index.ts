import 'source-map-support/register';
import * as core from '@actions/core';
import { parseInputs } from './inputParser';
import { getTestReports } from './junitParser';
import { annotateTestResult, attachSummary } from './messageBuilder';

export async function run(): Promise<void> {
    try {
        const inputs = parseInputs();
        const { accumulateResult, testResults, conclusion, headSha } = await getTestReports(inputs);

        core.startGroup(`🚀 Publish results`);
        try {
            for (const testResult of testResults) {
                await annotateTestResult(testResult, inputs.token, headSha, inputs.updateCheck, inputs.jobName);
            }
        } catch (error) {
            core.error(`❌ Failed to create checks using the provided token. (${error})`);
            core.warning(`⚠️ This usually indicates insufficient permissions. More details: https://github.com/mikepenz/action-junit-report/issues/23`);
        }

        const supportsJobSummary = process.env['GITHUB_STEP_SUMMARY'];
        if (supportsJobSummary) {
            try {
                await attachSummary(testResults);
            } catch (error) {
                core.error(`❌ Failed to set the summary using the provided token. (${error})`);
            }
        } else {
            core.warning(`⚠️ Your environment seems to not support job summaries.`);
        }

        if (inputs.failOnFailure && conclusion === 'failure') {
            core.setFailed(`❌ Tests reported ${accumulateResult.failed} failures`);
        }

        core.endGroup();
    } catch (error: any) {
        core.setFailed(error.message);
    }
}

run();
