import * as core from '@actions/core';
import * as github from '@actions/github';
import type { parseInputs } from './inputParser';
import type { getTestReports, TestResult } from './junitParser';
import type { SummaryTableCell, SummaryTableRow } from '@actions/core/lib/summary';

async function annotateTestResult(testResult: TestResult, token: string, headSha: string, updateCheck: boolean, jobName: string): Promise<void> {
    const annotations = testResult.annotations.filter(annotation => annotation.annotation_level !== 'notice');
    const foundResults = testResult.totalCount > 0 || testResult.skipped > 0;

    let title = 'No test results found!';
    if (foundResults) {
        title = `${testResult.totalCount} tests run, ${testResult.passed} passed, ${testResult.skipped} skipped, ${testResult.failed} failed (${testResult.failedEvaluating} failed evaluating).`;
    }

    core.info(`ℹ️ - ${testResult.checkName} - ${title}`);

    const actualFailed = testResult.failed - testResult.failedEvaluating;
    const conclusion: 'success' | 'failure' = actualFailed <= 0 ? 'success' : 'failure';

    for (const annotation of annotations) {
        core.info(`   🧪 - ${annotation.message.split('\n', 1)[0]}`);
    }

    const octokit = github.getOctokit(token);
    if (updateCheck) {
        const checks = await octokit.rest.checks.listForRef({
            ...github.context.repo,
            ref: headSha,
            check_name: jobName,
            status: 'in_progress',
            filter: 'latest',
        });

        core.debug(JSON.stringify(checks, null, 2));

        const check_run_id = checks.data.check_runs[0].id;

        core.info(`ℹ️ - ${testResult.checkName} - Updating checks ${annotations.length}`);
        for (let i = 0; i < annotations.length; i = i + 50) {
            const sliced = annotations.slice(i, i + 50);

            const updateCheckRequest = {
                ...github.context.repo,
                check_run_id,
                output: {
                    title,
                    summary: testResult.summary,
                    annotations: sliced,
                },
            };

            core.debug(JSON.stringify(updateCheckRequest, null, 2));

            await octokit.rest.checks.update(updateCheckRequest);
        }
    } else {
        const createCheckRequest = {
            ...github.context.repo,
            name: testResult.checkName,
            head_sha: headSha,
            status: 'completed',
            conclusion,
            output: {
                title,
                summary: testResult.summary,
                annotations: annotations.slice(0, 50),
            },
        };

        core.debug(JSON.stringify(createCheckRequest, null, 2));

        core.info(`ℹ️ - ${testResult.checkName} - Creating check for`);
        await octokit.rest.checks.create(createCheckRequest);
    }
}

const statusToColorDictionary = {
    draft: '🔵',
    active: '🟢',
    quarantine: '🔴',
    evaluating: '🟡',
};

async function attachSummary(accumulatedResult: TestResult, testResults: TestResult[]): Promise<void> {
    const table: SummaryTableRow[] = [
        [
            { data: 'Name', header: true },
            { data: 'Tests', header: true },
            { data: 'Passed ✅', header: true },
            { data: 'Skipped ↪️', header: true },
            { data: 'Failed ❌', header: true },
            { data: 'Failed Evaluating ⚠️', header: true },
        ],
    ];

    const detailsTable: SummaryTableRow[] = [
        [
            { data: 'Suite', header: true },
            { data: 'Test', header: true },
            { data: 'Result', header: true },
            { data: 'Test Status', header: true },
        ],
    ];

    const hasAnnotations = accumulatedResult.annotations.some(annotation => annotation.annotation_level !== 'notice');
    if (!hasAnnotations) {
        detailsTable.push([`-`, `No test annotations available`, `-`, '-']);
    }

    for (const testResult of testResults) {
        table.push([
            `${testResult.checkName}`,
            `${testResult.totalCount} run`,
            `${testResult.passed} passed`,
            `${testResult.skipped} skipped`,
            `${testResult.failed} failed`,
            `${testResult.failedEvaluating} failed evaluating`,
        ]);

        const annotations = hasAnnotations ? testResult.annotations.filter(annotation => annotation.annotation_level !== 'notice') : [];
        for (const annotation of annotations) {
            const color = statusToColorDictionary[annotation.testStatus as keyof typeof statusToColorDictionary];
            detailsTable.push([
                `${testResult.checkName}`,
                `<a href="${annotation.path}">${annotation.title}</a>`,
                `${annotation.annotation_level === 'notice' ? '✅ pass' : `❌ ${annotation.annotation_level}`}`,
                annotation.isTestimTest ? `${color} ${annotation.testStatus}` : '-',
            ]);
        }
    }

    if (testResults.length > 1) {
        table.push([
            'Total',
            `${accumulatedResult.totalCount} run`,
            `${accumulatedResult.passed} passed`,
            `${accumulatedResult.skipped} skipped`,
            `${accumulatedResult.failed} failed`,
            `${accumulatedResult.failedEvaluating} failed evaluating`,
        ]);
    }

    await core.summary.addHeading('Overall').addTable(table).addSeparator().addHeading('Details').addTable(detailsTable).write();
}

export async function publishAnnotations(inputs: Readonly<ReturnType<typeof parseInputs>>, { accumulatedResult, testResults, conclusion, headSha }: Awaited<ReturnType<typeof getTestReports>>) {
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
}

function buildTableBasedOnPreviousTable(commentBody: string | undefined, accumulatedResult: TestResult): SummaryTableRow[] {
    const currentJobRow = [
        github.context.job,
        `${accumulatedResult.totalCount} run`,
        `${accumulatedResult.passed} passed`,
        `${accumulatedResult.skipped} skipped`,
        `${accumulatedResult.failed} failed`,
        `${accumulatedResult.failedEvaluating} failed evaluating`,
    ];
    if (!commentBody) {
        return [
            [
                { data: 'Job Name', header: true },
                { data: 'Tests', header: true },
                { data: 'Passed ✅', header: true },
                { data: 'Skipped ↪️', header: true },
                { data: 'Failed ❌', header: true },
                { data: 'Failed Evaluating ⚠️', header: true },
            ],
            currentJobRow,
        ];
    }
    const previousTable = commentBody
        .split('<table>')[1]
        .replace(/<\/(table|tr|td|th)>/g, '')
        .split('<tr>')
        .filter(Boolean)
        .map(tr => tr.replace(/td|th/g, '').split('<>').filter(Boolean));
    const header = previousTable.shift()!.map<SummaryTableCell>(data => ({ data, header: true }));
    const rowOfCurrentJob = previousTable.find(tr => tr[0] === github.context.job);
    if (rowOfCurrentJob) {
        rowOfCurrentJob[1] = `${accumulatedResult.totalCount} run`;
        rowOfCurrentJob[2] = `${accumulatedResult.passed} passed`;
        rowOfCurrentJob[3] = `${accumulatedResult.skipped} skipped`;
        rowOfCurrentJob[4] = `${accumulatedResult.failed} failed`;
        rowOfCurrentJob[5] = `${accumulatedResult.failedEvaluating} failed evaluating`;
    } else {
        previousTable.push(currentJobRow);
    }
    return [header, ...previousTable];
}

export async function publishCommentOnPullRequest(token: string, { accumulatedResult, testResults, conclusion, headSha }: Awaited<ReturnType<typeof getTestReports>>) {
    const pullRequest = github.context.payload.pull_request;
    if (!pullRequest) {
        return;
    }

    const prNumber = pullRequest.number;
    core.info(`ℹ️ - Got PR number ${prNumber} with SHA: ${headSha}`);

    const octokit = github.getOctokit(token);
    const commentsSearch = await octokit.rest.issues.listComments({
        ...github.context.repo,
        issue_number: prNumber,
    });
    core.info(`ℹ️ - found ${commentsSearch.data.length} comments at ${commentsSearch.url} with status ${commentsSearch.status}`);
    const comments = commentsSearch.data.filter(({ user, body }) => user?.login === 'github-actions[bot]' && body?.startsWith('<h1 id="testim-junit-reporter-msg">'));
    core.info(`ℹ️ - found ${comments.length} comments by github-actions, starting with correct HTML`);
    const comment = comments.at(-1);
    const comment_id = comment?.id;

    const table = buildTableBasedOnPreviousTable(comment?.body, accumulatedResult);

    const tableMapper = (row: SummaryTableRow) => `<tr>${row.map(rowMapper).join('')}</tr>`;
    const rowMapper = (row: SummaryTableRow[number]) => {
        const htmlElement = typeof row === 'string' || !row.header ? 'td' : 'th';
        return `<${htmlElement}>${typeof row === 'string' ? row : row.data}</${htmlElement}>`;
    };
    const tableHTML = `<table>${table.map(tableMapper).join('')}</table>`;
    const title = `<h1 id="testim-junit-reporter-msg">Test Result Summary ${conclusion === 'success' ? '✅' : '❌'}</h1>`;
    const seeFullDetailsLink = `<a href="${pullRequest.head.repo.html_url}/actions/runs/${github.context.runId}">See full run details</a>.`;
    const summary = `Parsed <b><code>${testResults.length}</code></b> JUnit files, and has ended with status <b><code>${conclusion}</code></b> ${seeFullDetailsLink}`;

    const body = `${title}<br />${summary}<br /><br />${tableHTML}`;

    if (comment_id) {
        core.info(`ℹ️ - Updating existing comment: ${comment_id} on PR: #${prNumber}`);
        await octokit.rest.issues.updateComment({ ...github.context.repo, comment_id, body });
    } else {
        core.info(`ℹ️ - Publishing new comment on PR: #${prNumber}`);
        await octokit.rest.issues.createComment({ ...github.context.repo, issue_number: prNumber, body });
    }
}
