import * as core from '@actions/core';

export function retrieve(name: string, items: string[], index: number, total: number): string {
    if (total > 1) {
        if (items.length !== 0 && items.length !== total) {
            core.warning(`${name} has a different number of items than the 'reportPaths' input. This is usually a bug.`);
        }

        if (items.length === 0) {
            return '';
        } else if (items.length === 1) {
            return items[0].replace('\n', '');
        } else if (items.length > index) {
            return items[index].replace('\n', '');
        } else {
            core.error(`${name} has no valid config for position ${index}.`);
            return '';
        }
    } else if (items.length === 1) {
        return items[0].replace('\n', '');
    } else {
        return '';
    }
}

export function escapeEmoji(input: string) {
    const regex =
        /[\u{1f300}-\u{1f5ff}\u{1f900}-\u{1f9ff}\u{1f600}-\u{1f64f}\u{1f680}-\u{1f6ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}\u{1f1e6}-\u{1f1ff}\u{1f191}-\u{1f251}\u{1f004}\u{1f0cf}\u{1f170}-\u{1f171}\u{1f17e}-\u{1f17f}\u{1f18e}\u{3030}\u{2b50}\u{2b55}\u{2934}-\u{2935}\u{2b05}-\u{2b07}\u{2b1b}-\u{2b1c}\u{3297}\u{3299}\u{303d}\u{00a9}\u{00ae}\u{2122}\u{23f3}\u{24c2}\u{23e9}-\u{23ef}\u{25b6}\u{23f8}-\u{23fa}]/gu;
    return input.replace(regex, ``);
}
