import 'source-map-support/register';
import * as core from '@actions/core';
import { parseInputs } from './inputParser';
import { getTestReports } from './junitParser';
import { annotateTestResult, attachSummary } from './messageBuilder';

export async function run(): Promise<void> {
    try {
        const inputs = parseInputs();
        const { accumulatedResult, testResults, conclusion, headSha } = await getTestReports(inputs);

        core.startGroup(`🚀 Publish results`);
        try {
            for (const testResult of testResults) {
                await annotateTestResult(testResult, inputs.token, headSha, inputs.updateCheck, inputs.jobName);
            }
        } catch (error) {
            core.error(`❌ Failed creating a check using the provided token. (${error})`);
            core.warning(
                `⚠️ This usually indicates insufficient permissions. More details: https://docs.github.com/en/actions/security-guides/automatic-token-authentication#permissions-for-the-github_token`,
            );
        }

        const supportsJobSummary = process.env['GITHUB_STEP_SUMMARY'];
        if (supportsJobSummary) {
            try {
                await attachSummary(accumulatedResult, testResults);
            } catch (error) {
                core.error(`❌ Failed to set the summary using the provided token. (${error})`);
            }
        } else {
            core.warning(`⚠️ Your environment seems to not support job summaries.`);
        }

        if (inputs.failOnFailure && conclusion === 'failure') {
            core.setFailed(`❌ Tests reported ${accumulatedResult.failed} failures`);
        }

        core.endGroup();
    } catch (error: any) {
        core.setFailed(error.message);
    }
}

run();
