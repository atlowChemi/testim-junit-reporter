import 'source-map-support/register';
import * as core from '@actions/core';
import { parseInputs } from './inputParser';
import { getTestReports } from './junitParser';
import { publishAnnotations, publishComment } from './messageBuilder';

export async function run(): Promise<void> {
    try {
        const inputs = parseInputs();
        const reports = await getTestReports(inputs);
        await Promise.all([publishAnnotations(inputs, reports), publishComment(inputs.token)]);
    } catch (error: any) {
        core.setFailed(error.message);
    }
}

run();
