import * as core from '@actions/core';

export class InvalidGithubTokenError extends Error {}

export function parseInputs() {
    core.startGroup(`📖 Parsing input values`);

    const token = core.getInput('github_token') || process.env.GITHUB_TOKEN;
    if (!token) {
        throw new InvalidGithubTokenError('❌ A token is required to execute this action');
    }
    const values = {
        token,
        commit: core.getInput('commit'),
        jobName: core.getInput('job_name'),
        summary: core.getMultilineInput('summary'),
        checkName: core.getMultilineInput('check_name'),
        reportPaths: core.getMultilineInput('report_paths'),
        updateCheck: core.getInput('update_check') === 'true',
        requireTests: core.getInput('require_tests') === 'true',
        failOnFailure: core.getInput('fail_on_failure') === 'true',
        projectTokenDictionary: core.getMultilineInput('project_api_key_map'),
    };
    core.debug(JSON.stringify(values, undefined, 4));
    core.endGroup();
    return values;
}
