#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// The constraint check of docs/languages.md section 14 step 7: in a scratch
// copy of the pack, delete each stem constraint of each transform (one kind
// at a time, from all of the transform's rules), empty the pronoun forms and
// remove the processor, write tests/classes.json again and run the
// conformance test on the copy. A deletion that no test catches is printed as
// SURVIVES. Not run by any test.
//
//   node languages/ka/sources/mutations.mjs <scratch dir> [--cli-dir <build dir>]

import {execFileSync} from 'node:child_process';
import {cpSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

const repo = resolve(new URL('../../..', import.meta.url).pathname);
const args = process.argv.slice(2);
const scratch = resolve(args[0]);
const buildDir = args.includes('--cli-dir') ? resolve(args[args.indexOf('--cli-dir') + 1]) : join(repo, 'build');
const pack = join(repo, 'languages', 'ka');
const KEYS = ['stemMinLength', 'stemCharacters', 'stemEndsWith', 'stemNotEndsWith', 'stemStartsWith', 'stemNotStartsWith', 'stemChange'];

function run(label, mutate) {
    const dir = join(scratch, 'languages', 'ka');
    rmSync(join(scratch, 'languages'), {recursive: true, force: true});
    cpSync(pack, dir, {recursive: true});
    const transforms = JSON.parse(readFileSync(join(dir, 'transforms.json'), 'utf8'));
    const language = JSON.parse(readFileSync(join(dir, 'language.json'), 'utf8'));
    if (!mutate(transforms, language)) { return; }
    writeFileSync(join(dir, 'transforms.json'), JSON.stringify(transforms));
    writeFileSync(join(dir, 'language.json'), JSON.stringify(language, null, 2));
    try {
        execFileSync('node', [join(repo, 'tools/check-classes.mjs'), 'ka', '--write', '--languages', join(scratch, 'languages')], {stdio: 'pipe'});
    } catch (error) {
        console.log(`CAUGHT\t${label}\t(check-classes: ${String(error.stderr).split('\n')[0]})`);
        return;
    }
    try {
        execFileSync(join(buildDir, 'language-conformance-test'), [dir], {stdio: 'pipe'});
        console.log(`SURVIVES\t${label}`);
    } catch (error) {
        const first = String(error.stdout).split('\n').find((l) => l.startsWith('FAIL')) ?? '';
        console.log(`CAUGHT\t${label}\t${first.slice(0, 160)}`);
    }
}

const base = JSON.parse(readFileSync(join(pack, 'transforms.json'), 'utf8'));
for (const [ti, t] of base.transforms.entries()) {
    for (const key of KEYS) {
        if (!t.rules.some((rule) => key in rule)) { continue; }
        run(`${t.id}: without ${key}`, (transforms) => {
            for (const rule of transforms.transforms[ti].rules) { delete rule[key]; }
            return true;
        });
    }
}
run('pron: empty', (transforms) => {
    transforms.transforms = transforms.transforms.filter((t) => t.id !== 'pron');
    return true;
});
run('no preprocessor', (transforms, language) => {
    language.lookup.preprocessors = [];
    return true;
});
run('untaggedTerms filter', (transforms, language) => {
    language.lookup.untaggedTerms = 'filter';
    return true;
});
