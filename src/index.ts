import 'source-map-support/register';
import * as core from '@actions/core';
import { delay } from './utils';
import { parseInputs } from './inputParser';
import { getTestReports } from './junitParser';
import { publishAnnotations, publishCommentOnPullRequest } from './messageBuilder';

export async function run(): Promise<void> {
    try {
        const inputs = parseInputs();
        const reports = await getTestReports(inputs);
        await publishAnnotations(inputs, reports);
        await delay(1000);
        await publishCommentOnPullRequest(inputs.token, inputs.commit);
    } catch (error: any) {
        core.setFailed(error.message);
    }
}

run();
