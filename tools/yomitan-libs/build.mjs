#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Builds ext/lib/hangul-js.js in a Yomitan checkout as Yomitan's own build
// does, so that tools/check-yomitan.mjs compares Korean processors with
// Yomitan's (docs/languages.md, section 8.2):
//
//   node tools/yomitan-libs/build.mjs --lockfile-only <yomitan checkout>
//   npm ci --prefix tools/yomitan-libs --ignore-scripts=false --include=optional
//   node tools/yomitan-libs/build.mjs <yomitan checkout>
//
// `--lockfile-only` checks package-lock.json here against Yomitan's at the
// pinned revision before npm reads it: exactly esbuild, the 25 platform
// packages Yomitan's esbuild entry lists, and hangul-js, each equal to
// Yomitan's entry in every field but `dev` (and `license`, which Yomitan's
// lockfile omits for esbuild), and hangul-js with the URL and hash of
// HANGUL_JS, because Yomitan's entry records its version only. npm ci then
// installs esbuild 0.25.1, the platform package of the machine and hangul-js
// 0.2.6 with those hashes. esbuild's install script, the only one, checks that
// the platform binary is 0.25.1; the build does not need it (esbuild's
// JavaScript API checks the binary's version itself).
//
// The build repeats both checks, and checks that the installed esbuild,
// platform package and hangul-js have the lockfile's versions. It bundles
// with the options of buildLib in Yomitan's dev/build-libs.js, in a temporary
// directory laid out as Yomitan's tree: package.json, jsconfig.json,
// dev/jsconfig.json and dev/lib/hangul-js.js from the pinned commit (read with
// --no-replace-objects, not from the work tree or the index, so local edits
// change nothing) and node_modules/hangul-js/ from this directory. esbuild
// writes the bundled files' paths into module comments and the source map
// (real paths, so the temporary directory's real path is used); Yomitan's
// package.json ("type": "module") changes the import code it generates
// (`__toESM(require_hangul(), 1)`); the two jsconfig.json files change
// nothing here but keep esbuild from using a tsconfig.json or jsconfig.json
// above the temporary directory. The result, ext/lib/hangul-js.js and its
// source map, must have the sha256 of the files Yomitan's own build writes
// (EXPECTED_SHA256); otherwise nothing is written. Nothing else is written:
// Yomitan's other ext/lib bundles stay missing, and tools/lib/yomitan.mjs
// stubs them.
//
// It refuses a directory that is not the top of a git work tree at the pinned
// revision, so it writes into nothing else: build in a copy of a shared
// checkout. Inside the checkout it refuses an ext or ext/lib that is a
// symbolic link, and it writes each file under a new name and renames it into
// place, so a link left in ext/lib is replaced rather than written through.

import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {constants, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {isMain} from '../lib/cli.mjs';
import {PINNED_REVISION} from '../lib/yomitan.mjs';

/** This directory: package.json, package-lock.json and node_modules/. */
const HERE = dirname(fileURLToPath(import.meta.url));

/** The files of Yomitan's tree esbuild reads for this bundle, besides hangul-js. */
const TREE_FILES = ['package.json', 'jsconfig.json', 'dev/jsconfig.json', 'dev/lib/hangul-js.js'];
const ENTRY = 'dev/lib/hangul-js.js';
const LIB_DIR = ['ext', 'lib'];
/** What build.mjs writes into <checkout>/ext/lib, and nothing else. */
const OUTPUTS = ['hangul-js.js', 'hangul-js.js.map'];
/**
 * The sha256 of the files Yomitan's own build writes at the pinned revision
 * (`npm ci`, then `node dev/bin/build-libs.js`, in a clone at d3c54c1). A
 * build that gives anything else writes nothing.
 */
export const EXPECTED_SHA256 = {
    'hangul-js.js': '9019030075e90cd6bceaf605673e0c0c6870fac6d17d4cb45564a968c41d9f62',
    'hangul-js.js.map': 'f09719ae49d30261d9f487ad18b64d8ec82d60f883b8209603b6dc47120e62f1',
};
const PACKAGES = ['esbuild', 'hangul-js'];
/**
 * hangul-js 0.2.6's tarball and its hash. Yomitan's lockfile at d3c54c1 records
 * hangul-js by version only (npm dropped both fields in yomidevs/yomitan@96f81f1);
 * from 82049f3 ("add korean") until then it recorded these two, which are also
 * the registry's `dist.tarball` and `dist.integrity`.
 */
export const HANGUL_JS = {
    version: '0.2.6',
    resolved: 'https://registry.npmjs.org/hangul-js/-/hangul-js-0.2.6.tgz',
    integrity: 'sha512-48axU8LgjCD30FEs66Xc04/8knxMwCMQw0f67l67rlttW7VXT3qRJgQeHmhiuGwWXGvSbk6YM0fhQlcjE1JFQA==',
};
const INSTALL = 'npm ci --prefix tools/yomitan-libs --ignore-scripts=false --include=optional';

// Variables that point git at another repository than the directory named.
const GIT_LOCATION = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES'];

// --no-replace-objects: `git replace` must not change what the pinned commit holds.
function git(root, args) {
    const env = {...process.env};
    for (const name of GIT_LOCATION) { delete env[name]; }
    return execFileSync('git', ['--no-replace-objects', '-C', root, ...args], {env, timeout: 60000, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe']});
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
 * problem, none when our lockfile has exactly esbuild, every platform package
 * Yomitan's esbuild entry lists, and hangul-js, each equal to Yomitan's entry
 * in every field but `dev` (and `license` where Yomitan records none), and
 * hangul-js with HANGUL_JS's URL and hash, which Yomitan's entry lacks.
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
    for (const key of allowed) {
        if (packages[key] === undefined) { problems.push(`${key} is missing`); }
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
        const pinned = key === 'node_modules/hangul-js' && other.version === HANGUL_JS.version ? HANGUL_JS : {};
        const expected = {...other};
        for (const field of ['resolved', 'integrity']) {
            if (expected[field] === undefined && pinned[field] !== undefined) { expected[field] = pinned[field]; }
        }
        for (const field of new Set([...Object.keys(expected), ...Object.keys(entry)])) {
            if (field === 'dev' || (field === 'license' && other.license === undefined)) { continue; }
            if (isDeepStrictEqual(entry[field], expected[field])) { continue; }
            const whose = other[field] === undefined && pinned[field] !== undefined ? `hangul-js ${HANGUL_JS.version}'s` : 'Yomitan\'s';
            problems.push(`${key}: ${field} ${show(entry[field])}, ${whose} is ${show(expected[field])}`);
        }
    }
    return problems;
}

function show(value) {
    return value === undefined ? '(none)' : typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * Checks our lockfile against Yomitan's at the pinned revision in the checkout.
 * Needs nothing installed, so CI runs it before `npm ci`.
 * @param {string} root an absolute checkout path that passed checkCheckout
 * @returns {any} our lockfile
 */
export function checkLockfile(root) {
    const ours = JSON.parse(readFileSync(join(HERE, 'package-lock.json'), 'utf8'));
    const theirs = JSON.parse(git(root, ['cat-file', 'blob', `${PINNED_REVISION}:package-lock.json`]).toString());
    const problems = lockfileProblems(ours, theirs);
    if (problems.length > 0) { throw new Error(`tools/yomitan-libs/package-lock.json is not Yomitan's at ${PINNED_REVISION}:\n  ${problems.join('\n  ')}`); }
    return ours;
}

/**
 * The lockfile entries npm installs on this machine: esbuild, hangul-js and
 * the platform packages whose `os` and `cpu` name it.
 * @param {any} lock
 * @returns {string[]} keys such as node_modules/@esbuild/linux-x64
 */
export function installedKeys(lock) {
    const platforms = Object.keys(lock.packages['node_modules/esbuild'].optionalDependencies ?? {}).map((name) => `node_modules/${name}`)
        .filter((key) => (lock.packages[key]?.os ?? []).includes(process.platform) && (lock.packages[key]?.cpu ?? []).includes(process.arch));
    if (platforms.length === 0) { throw new Error(`esbuild ${lock.packages['node_modules/esbuild'].version} has no platform package for ${process.platform} ${process.arch}`); }
    return [...PACKAGES.map((name) => `node_modules/${name}`), ...platforms];
}

/**
 * Checks the lockfile, then that npm installed this machine's packages at the
 * lockfile's versions.
 * @param {string} root an absolute checkout path that passed checkCheckout
 */
export function checkPackages(root) {
    const ours = checkLockfile(root);
    for (const key of installedKeys(ours)) {
        const name = key.slice('node_modules/'.length);
        const file = join(HERE, key, 'package.json');
        if (!existsSync(file)) { throw new Error(`${name} is not installed; run ${INSTALL}`); }
        const installed = JSON.parse(readFileSync(file, 'utf8')).version;
        const locked = ours.packages[key].version;
        if (installed !== locked) { throw new Error(`${name} ${installed} is installed, the lockfile has ${locked}; run ${INSTALL}`); }
    }
}

/**
 * The checkout's ext/lib. An ext or ext/lib that is a symbolic link, or not a
 * directory, is refused, so the files land in the checkout and nowhere else;
 * a missing one is fine (it is created when the files are written).
 * @param {string} absolute a checkout that passed checkCheckout
 * @returns {string}
 */
export function checkLibDirectory(absolute) {
    let dir = absolute;
    for (const part of LIB_DIR) {
        dir = join(dir, part);
        let stat;
        try {
            stat = lstatSync(dir);
        } catch (error) {
            if (error.code === 'ENOENT') { break; }
            throw error;
        }
        if (stat.isSymbolicLink()) { throw new Error(`${dir} is a symbolic link; build.mjs writes only inside the checkout`); }
        if (!stat.isDirectory()) { throw new Error(`${dir} is not a directory`); }
    }
    return join(absolute, ...LIB_DIR);
}

function sha256(file) {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/**
 * What buildLib in Yomitan's dev/build-libs.js passes to esbuild for
 * dev/lib/hangul-js.js in a tree laid out as Yomitan's at `tree`, with the
 * working directory `npm run build:libs` has there (the tree's root).
 * @param {string} tree
 */
export function esbuildOptions(tree) {
    return {
        absWorkingDir: tree,
        entryPoints: [join(tree, ENTRY)],
        bundle: true,
        minify: false,
        sourcemap: true,
        target: 'es2020',
        format: 'esm',
        outfile: join(tree, ...LIB_DIR, OUTPUTS[0]),
        external: ['fs'],
        banner: {
            js: '// @ts-nocheck',
        },
    };
}

/**
 * Builds ext/lib/hangul-js.js and its source map into the checkout.
 * @param {string} root
 * @returns {Promise<{files: {path: string, bytes: number, sha256: string}[], esbuild: string}>}
 */
export async function buildHangul(root) {
    const absolute = checkCheckout(root);
    const lib = checkLibDirectory(absolute);
    checkPackages(absolute);
    const {default: esbuild} = await import('esbuild');
    const locked = JSON.parse(readFileSync(join(HERE, 'package-lock.json'), 'utf8')).packages['node_modules/esbuild'].version;
    if (esbuild.version !== locked) { throw new Error(`esbuild ${esbuild.version} was loaded, the lockfile has ${locked}`); }
    // The real path: esbuild records real paths in the source map, so a
    // TMPDIR behind a symbolic link (macOS's /var) must not change them.
    const temp = realpathSync(mkdtempSync(join(tmpdir(), 'hoshidicts-yomitan-libs-')));
    try {
        for (const path of TREE_FILES) {
            mkdirSync(dirname(join(temp, path)), {recursive: true});
            writeFileSync(join(temp, path), git(absolute, ['cat-file', 'blob', `${PINNED_REVISION}:${path}`]));
        }
        cpSync(join(HERE, 'node_modules', 'hangul-js'), join(temp, 'node_modules', 'hangul-js'), {recursive: true});
        await esbuild.build(esbuildOptions(temp));
        const built = join(temp, ...LIB_DIR);
        const wrong = OUTPUTS.map((name) => [name, sha256(join(built, name))]).filter(([name, hash]) => hash !== EXPECTED_SHA256[name]);
        if (wrong.length > 0) { throw new Error(`the build is not Yomitan's: ${wrong.map(([name, hash]) => `${name} has sha256 ${hash}, Yomitan's build ${EXPECTED_SHA256[name]}`).join('; ')}; nothing was written`); }
        mkdirSync(lib, {recursive: true});
        const files = [];
        for (const name of OUTPUTS) {
            // A new file renamed over the old one: a link at the target is
            // replaced, never written through.
            const target = join(lib, name);
            const partial = join(lib, `.${name}.${process.pid}.partial`);
            try {
                copyFileSync(join(built, name), partial, constants.COPYFILE_EXCL);
                renameSync(partial, target);
            } finally {
                rmSync(partial, {force: true});
            }
            files.push({path: target, bytes: statSync(target).size, sha256: sha256(target)});
        }
        return {files, esbuild: esbuild.version};
    } finally {
        rmSync(temp, {recursive: true, force: true});
    }
}

const USAGE = 'usage: node tools/yomitan-libs/build.mjs [--lockfile-only] <yomitan checkout at d3c54c1>';

async function main(argv) {
    const lockfileOnly = argv[0] === '--lockfile-only';
    const args = lockfileOnly ? argv.slice(1) : argv;
    if (args.length !== 1 || args[0].startsWith('-')) {
        console.error(USAGE);
        return 2;
    }
    try {
        if (lockfileOnly) {
            // Before `npm ci`: the lockfile is Yomitan's, so npm installs only its packages.
            const lock = checkLockfile(checkCheckout(args[0]));
            console.log(`tools/yomitan-libs/package-lock.json is Yomitan's at ${PINNED_REVISION} (${Object.keys(lock.packages).length - 1} packages)`);
            return 0;
        }
        const {files, esbuild} = await buildHangul(args[0]);
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
