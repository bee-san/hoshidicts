#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Builds ext/lib/hangul-js.js in a Yomitan checkout as Yomitan's own build
// does, so that tools/check-yomitan.mjs compares Korean processors with
// Yomitan's (docs/languages.md, section 8.2):
//
//   npm ci --prefix tools/yomitan-libs --ignore-scripts=false
//   node tools/yomitan-libs/build.mjs <yomitan checkout>
//
// npm installs esbuild 0.25.1 and hangul-js 0.2.6, the versions Yomitan's
// package-lock.json pins at d3c54c1; esbuild's install script checks its
// platform binary. The bundle is made with the options of buildLib in
// Yomitan's dev/build-libs.js, in a temporary directory laid out as Yomitan's
// tree: package.json, jsconfig.json, dev/jsconfig.json and
// dev/lib/hangul-js.js from the pinned commit (not the work tree, so local
// edits change nothing) and node_modules/hangul-js/ from this directory.
// esbuild writes the bundled files' paths into module comments and the source
// map; Yomitan's package.json ("type": "module") changes the import code it
// generates (`__toESM(require_hangul(), 1)`); the two jsconfig.json files
// change nothing here but keep esbuild from using a tsconfig.json or
// jsconfig.json above the temporary directory. The result, ext/lib/hangul-js.js
// and its source map, equals byte for byte what `npm run build:libs` writes in
// the checkout. Nothing else is written: Yomitan's other ext/lib bundles stay
// missing, and tools/lib/yomitan.mjs stubs them.
//
// It refuses a directory that is not the top of a git work tree at the pinned
// revision, so it writes into nothing else: build in a copy of a shared
// checkout. It also refuses packages other than Yomitan's: every package of
// package-lock.json here must be esbuild, one of the platform packages
// Yomitan's esbuild entry lists, or hangul-js, with the version, and where
// Yomitan's lockfile records them the resolved URL and integrity, of Yomitan's
// lockfile at the pinned revision.

import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isMain} from '../lib/cli.mjs';
import {PINNED_REVISION} from '../lib/yomitan.mjs';

/** This directory: package.json, package-lock.json and node_modules/. */
const HERE = dirname(fileURLToPath(import.meta.url));

/** The files of Yomitan's tree esbuild reads for this bundle, besides hangul-js. */
const TREE_FILES = ['package.json', 'jsconfig.json', 'dev/jsconfig.json', 'dev/lib/hangul-js.js'];
const ENTRY = 'dev/lib/hangul-js.js';
const OUTPUTS = ['ext/lib/hangul-js.js', 'ext/lib/hangul-js.js.map'];
const PACKAGES = ['esbuild', 'hangul-js'];
const INSTALL = 'npm ci --prefix tools/yomitan-libs --ignore-scripts=false';

// Variables that point git at another repository than the directory named.
const GIT_LOCATION = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES'];

function git(root, args) {
    const env = {...process.env};
    for (const name of GIT_LOCATION) { delete env[name]; }
    return execFileSync('git', ['-C', root, ...args], {env, timeout: 60000, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe']});
}

/**
 * Checks that root is the top of a git work tree at the pinned revision and
 * returns its absolute path; throws with the reason otherwise.
 * @param {string} root
 * @returns {string}
 */
export function checkCheckout(root) {
    const absolute = resolve(root);
    if (!existsSync(absolute) || !statSync(absolute).isDirectory()) { throw new Error(`${root} is not a directory`); }
    let inside;
    try {
        inside = git(absolute, ['rev-parse', '--is-inside-work-tree']).toString().trim();
    } catch {
        inside = 'false';
    }
    if (inside !== 'true') { throw new Error(`${root} is not a git work tree; name a Yomitan checkout at ${PINNED_REVISION}`); }
    const top = git(absolute, ['rev-parse', '--show-toplevel']).toString().trim();
    if (realpathSync(top) !== realpathSync(absolute)) { throw new Error(`${root} is inside the git work tree ${top}, not its top; name the top of a Yomitan checkout`); }
    let head;
    try {
        head = git(absolute, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']).toString().trim();
    } catch {
        head = null;
    }
    if (head !== PINNED_REVISION) { throw new Error(`${root} is at ${head ?? 'no commit'}, not Yomitan ${PINNED_REVISION}`); }
    return absolute;
}

/**
 * Why the packages of our lockfile are not Yomitan's: one message per
 * problem, none when every package is esbuild, one of the platform packages
 * Yomitan's esbuild entry lists, or hangul-js, with Yomitan's version and,
 * where Yomitan's lockfile records them, its resolved URL and integrity.
 * @param {any} ours our package-lock.json
 * @param {any} theirs Yomitan's package-lock.json
 * @returns {string[]}
 */
export function lockfileProblems(ours, theirs) {
    const problems = [];
    const packages = ours?.packages ?? {};
    const yomitan = theirs?.packages ?? {};
    const platforms = Object.keys(yomitan['node_modules/esbuild']?.optionalDependencies ?? {});
    const allowed = new Set([...PACKAGES, ...platforms].map((name) => `node_modules/${name}`));
    for (const name of PACKAGES) {
        if (packages[`node_modules/${name}`] === undefined) { problems.push(`node_modules/${name} is missing`); }
    }
    for (const [key, entry] of Object.entries(packages)) {
        if (key === '') { continue; }
        if (!allowed.has(key)) {
            problems.push(`${key} is neither esbuild, one of its platform packages nor hangul-js`);
            continue;
        }
        const other = yomitan[key];
        if (other === undefined) {
            problems.push(`${key} is not in Yomitan's package-lock.json`);
            continue;
        }
        for (const field of ['version', 'resolved', 'integrity']) {
            if (field !== 'version' && other[field] === undefined) { continue; }
            if (entry[field] !== other[field]) { problems.push(`${key}: ${field} ${entry[field] ?? '(none)'}, Yomitan's is ${other[field] ?? '(none)'}`); }
        }
    }
    return problems;
}

/**
 * Checks our lockfile against the checkout's and the installed packages
 * against our lockfile.
 * @param {string} root an absolute checkout path that passed checkCheckout
 */
export function checkPackages(root) {
    const ours = JSON.parse(readFileSync(join(HERE, 'package-lock.json'), 'utf8'));
    const theirs = JSON.parse(git(root, ['cat-file', 'blob', `${PINNED_REVISION}:package-lock.json`]).toString());
    const problems = lockfileProblems(ours, theirs);
    if (problems.length > 0) { throw new Error(`tools/yomitan-libs/package-lock.json is not Yomitan's at ${PINNED_REVISION}:\n  ${problems.join('\n  ')}`); }
    for (const name of PACKAGES) {
        const file = join(HERE, 'node_modules', name, 'package.json');
        if (!existsSync(file)) { throw new Error(`${name} is not installed; run ${INSTALL}`); }
        const installed = JSON.parse(readFileSync(file, 'utf8')).version;
        const locked = ours.packages[`node_modules/${name}`].version;
        if (installed !== locked) { throw new Error(`${name} ${installed} is installed, the lockfile has ${locked}; run ${INSTALL}`); }
    }
}

function sha256(file) {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/**
 * Builds ext/lib/hangul-js.js and its source map into the checkout.
 * @param {string} root
 * @returns {Promise<{files: {path: string, bytes: number, sha256: string}[], esbuild: string}>}
 */
export async function buildHangul(root) {
    const absolute = checkCheckout(root);
    checkPackages(absolute);
    const {default: esbuild} = await import('esbuild');
    const locked = JSON.parse(readFileSync(join(HERE, 'package-lock.json'), 'utf8')).packages['node_modules/esbuild'].version;
    if (esbuild.version !== locked) { throw new Error(`esbuild ${esbuild.version} was loaded, the lockfile has ${locked}`); }
    const temp = mkdtempSync(join(tmpdir(), 'hoshidicts-yomitan-libs-'));
    try {
        for (const path of TREE_FILES) {
            mkdirSync(dirname(join(temp, path)), {recursive: true});
            writeFileSync(join(temp, path), git(absolute, ['cat-file', 'blob', `${PINNED_REVISION}:${path}`]));
        }
        cpSync(join(HERE, 'node_modules', 'hangul-js'), join(temp, 'node_modules', 'hangul-js'), {recursive: true});
        // buildLib in Yomitan's dev/build-libs.js, run from the tree's root as
        // `npm run build:libs` runs it there.
        await esbuild.build({
            absWorkingDir: temp,
            entryPoints: [join(temp, ENTRY)],
            bundle: true,
            minify: false,
            sourcemap: true,
            target: 'es2020',
            format: 'esm',
            outfile: join(temp, OUTPUTS[0]),
            external: ['fs'],
            banner: {
                js: '// @ts-nocheck',
            },
        });
        mkdirSync(join(absolute, 'ext', 'lib'), {recursive: true});
        const files = [];
        for (const path of OUTPUTS) {
            copyFileSync(join(temp, path), join(absolute, path));
            files.push({path: join(absolute, path), bytes: statSync(join(absolute, path)).size, sha256: sha256(join(absolute, path))});
        }
        return {files, esbuild: esbuild.version};
    } finally {
        rmSync(temp, {recursive: true, force: true});
    }
}

async function main(argv) {
    if (argv.length !== 1 || argv[0].startsWith('-')) {
        console.error('usage: node tools/yomitan-libs/build.mjs <yomitan checkout at d3c54c1>');
        return 2;
    }
    try {
        const {files, esbuild} = await buildHangul(argv[0]);
        for (const {path, bytes, sha256: hash} of files) { console.log(`wrote ${path} (${bytes} bytes, sha256 ${hash})`); }
        console.log(`with esbuild ${esbuild} and hangul-js ${JSON.parse(readFileSync(join(HERE, 'node_modules', 'hangul-js', 'package.json'), 'utf8')).version}`);
        return 0;
    } catch (error) {
        console.error(`build.mjs: ${error.message}`);
        return 1;
    }
}

if (isMain(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
