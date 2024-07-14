import 'source-map-support/register';
import * as core from '@actions/core';
import { parseInputs } from './inputParser.js';
import { getTestReports } from './junitParser.js';
import { publishAnnotations, publishCommentOnPullRequest } from './messageBuilder.js';

export async function run(): Promise<void> {
    try {
        const inputs = parseInputs();
        const reports = await getTestReports(inputs);
        core.startGroup(`🚀 Publish results`);
        await publishAnnotations(inputs, reports);
        await publishCommentOnPullRequest(inputs.token, reports);
        core.endGroup();
    } catch (error: any) {
        core.setFailed(error.message);
    }
}

run();
