// SPDX-License-Identifier: GPL-3.0-or-later
// tools/yomitan-libs/build.mjs and the Korean processor comparison it makes
// possible (docs/languages.md, section 8.2).
//
// The refusals and the lockfile checks need only git. With YOMITAN_DIR naming
// a Yomitan checkout at the pinned revision (CI sets it to its own), the
// lockfile is also compared with Yomitan's; when that checkout's
// ext/lib/hangul-js.js is built (CI builds it with build.mjs; locally, build
// it in a copy) and hoshidicts-cli is built, the bundle is compared with the
// files Yomitan's own build writes, and tools/check-yomitan.mjs compares the
// Korean fixture's processors with Yomitan's through it:
//
//   YOMITAN_DIR=/path/to/yomitan-copy node --test tools/test/
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {after, describe, test} from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {DEFAULT_CLI} from '../check-yomitan.mjs';
import {REPO_ROOT, corpusStrings, loadPack, readJson} from '../lib/pack.mjs';
import {PINNED_REVISION, yomitanRevision} from '../lib/yomitan.mjs';
import {lockfileProblems} from '../yomitan-libs/build.mjs';

const tool = fileURLToPath(new URL('../yomitan-libs/build.mjs', import.meta.url));
const checkTool = fileURLToPath(new URL('../check-yomitan.mjs', import.meta.url));
const lockfile = fileURLToPath(new URL('../yomitan-libs/package-lock.json', import.meta.url));
const korean = fileURLToPath(new URL('./fixtures/korean/', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'hoshidicts-yomitan-libs-test-'));
after(() => rmSync(temp, {recursive: true, force: true}));

// The two files Yomitan's own build writes at the pinned revision: `npm ci`
// and `node dev/bin/build-libs.js` in a clone at d3c54c1 (Node 22.23.1).
const REFERENCE = {
    'hangul-js.js': '9019030075e90cd6bceaf605673e0c0c6870fac6d17d4cb45564a968c41d9f62',
    'hangul-js.js.map': 'f09719ae49d30261d9f487ad18b64d8ec82d60f883b8209603b6dc47120e62f1',
};

// A Yomitan checkout at the pinned revision, with or without the bundle.
const root = process.env.YOMITAN_DIR === undefined || process.env.YOMITAN_DIR === '' ? null : resolve(process.env.YOMITAN_DIR);
const skipCheckout = root === null ? 'YOMITAN_DIR is not set' : yomitanRevision(root) !== PINNED_REVISION ? `YOMITAN_DIR is not at ${PINNED_REVISION}` : false;
const bundle = root === null ? null : join(root, 'ext', 'lib', 'hangul-js.js');
const cli = process.env.HOSHIDICTS_CLI ?? DEFAULT_CLI;
const skipBundle = skipCheckout
    || (!existsSync(bundle) ? 'YOMITAN_DIR has no ext/lib/hangul-js.js; build it in a copy with tools/yomitan-libs/build.mjs' : false)
    || (!existsSync(cli) ? `${cli} does not exist; build hoshidicts-cli or set HOSHIDICTS_CLI` : false);

// git finds no repository above temp, and no variable points it elsewhere.
const env = {...process.env, GIT_CEILING_DIRECTORIES: temp};
for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) { delete env[name]; }

function build(...args) {
    return spawnSync(process.execPath, [tool, ...args], {encoding: 'utf8', env});
}

function gitIn(dir, ...args) {
    return execFileSync('git', ['-C', dir, '-c', 'user.name=Test', '-c', 'user.email=test@example.org', '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', ...args], {env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});
}

let counter = 0;
function directory() {
    const dir = join(temp, `case-${++counter}`);
    mkdirSync(dir);
    return dir;
}

/** A git work tree with one commit laid out like Yomitan's entry. */
function repository() {
    const dir = directory();
    gitIn(dir, 'init', '-q');
    mkdirSync(join(dir, 'dev', 'lib'), {recursive: true});
    writeFileSync(join(dir, 'dev', 'lib', 'hangul-js.js'), "export * as Hangul from 'hangul-js';\n");
    gitIn(dir, 'add', '.');
    gitIn(dir, 'commit', '-q', '-m', 'Not Yomitan');
    return dir;
}

function assertRefused(result, dir, pattern) {
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, pattern);
    assert.equal(result.stdout, '');
    assert.ok(!existsSync(join(dir, 'ext')), `${dir}/ext was written`);
}

describe('build.mjs refuses to write anywhere but a Yomitan checkout at the pinned revision', () => {
    test('without exactly one checkout argument it prints its usage', () => {
        for (const args of [[], [temp, temp], ['--help']]) {
            const result = build(...args);
            assert.equal(result.status, 2, args.join(' '));
            assert.match(result.stderr, /^usage: node tools\/yomitan-libs\/build\.mjs <yomitan checkout at d3c54c1>/);
        }
    });

    test('a missing path or a file', () => {
        const missing = join(temp, 'missing');
        assertRefused(build(missing), missing, /missing is not a directory/);
        assert.ok(!existsSync(missing));
        const file = join(temp, 'file');
        writeFileSync(file, '');
        const result = build(file);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /file is not a directory/);
    });

    test('a directory outside git, a bare repository and a .git directory', () => {
        const plain = directory();
        mkdirSync(join(plain, 'dev', 'lib'), {recursive: true});
        assertRefused(build(plain), plain, /is not a git work tree; name a Yomitan checkout at d3c54c1/);
        const bare = directory();
        gitIn(bare, 'init', '-q', '--bare');
        assertRefused(build(bare), bare, /is not a git work tree/);
        const gitDir = join(repository(), '.git');
        assertRefused(build(gitDir), gitDir, /is not a git work tree/);
    });

    test('a subdirectory of a work tree', () => {
        const dir = repository();
        const sub = join(dir, 'dev');
        assertRefused(build(sub), sub, /dev is inside the git work tree .+, not its top; name the top of a Yomitan checkout/);
    });

    test('a work tree at another revision or without a commit', () => {
        const other = repository();
        const head = gitIn(other, 'rev-parse', 'HEAD').trim();
        assertRefused(build(other), other, new RegExp(`is at ${head}, not Yomitan ${PINNED_REVISION}$`, 'm'));
        const empty = directory();
        gitIn(empty, 'init', '-q');
        assertRefused(build(empty), empty, new RegExp(`is at no commit, not Yomitan ${PINNED_REVISION}$`, 'm'));
    });

    test('this repository', () => {
        const result = build(REPO_ROOT);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /is not a git work tree|is at [0-9a-f]{40}, not Yomitan/);
        assert.ok(!existsSync(join(REPO_ROOT, 'ext')));
    });
});

describe('package-lock.json', () => {
    const lock = readJson(lockfile);

    test('installs esbuild 0.25.1 with its platform packages and hangul-js 0.2.6, from the registry; only esbuild has an install script', () => {
        assert.deepEqual(readJson(fileURLToPath(new URL('../yomitan-libs/package.json', import.meta.url))).dependencies, {'esbuild': '0.25.1', 'hangul-js': '0.2.6'});
        assert.deepEqual(lock.packages[''].dependencies, {'esbuild': '0.25.1', 'hangul-js': '0.2.6'});
        const esbuild = lock.packages['node_modules/esbuild'];
        const platforms = Object.keys(esbuild.optionalDependencies).map((name) => `node_modules/${name}`);
        assert.equal(platforms.length, 25);
        const keys = Object.keys(lock.packages).filter((key) => key !== '');
        assert.deepEqual(keys.sort(), ['node_modules/esbuild', 'node_modules/hangul-js', ...platforms].sort());
        assert.equal(esbuild.version, '0.25.1');
        assert.equal(lock.packages['node_modules/hangul-js'].version, '0.2.6');
        for (const key of platforms) {
            assert.equal(lock.packages[key].version, '0.25.1', key);
            assert.equal(lock.packages[key].optional, true, key);
        }
        for (const key of keys) {
            assert.match(lock.packages[key].resolved, /^https:\/\/registry\.npmjs\.org\//, key);
            assert.match(lock.packages[key].integrity, /^sha512-[A-Za-z0-9+/]{86}==$/, key);
        }
        assert.deepEqual(keys.filter((key) => lock.packages[key].hasInstallScript), ['node_modules/esbuild']);
    });

    test('lockfileProblems: Yomitan\'s versions, and its URLs and hashes where it records them; nothing else', () => {
        // Stands in for Yomitan's lockfile, which records hangul-js without
        // a URL or a hash at the pinned revision and has many more packages.
        const yomitan = structuredClone(lock);
        delete yomitan.packages['node_modules/hangul-js'].resolved;
        delete yomitan.packages['node_modules/hangul-js'].integrity;
        yomitan.packages['node_modules/ajv'] = {version: '8.17.1', resolved: 'https://registry.npmjs.org/ajv/-/ajv-8.17.1.tgz', integrity: 'sha512-x', dev: true};
        assert.deepEqual(lockfileProblems(lock, yomitan), []);
        const changed = (edit) => {
            const ours = structuredClone(lock);
            edit(ours.packages);
            return lockfileProblems(ours, yomitan).join('\n');
        };
        assert.equal(changed((p) => { p['node_modules/esbuild'].version = '0.25.2'; }), "node_modules/esbuild: version 0.25.2, Yomitan's is 0.25.1");
        assert.match(changed((p) => { p['node_modules/@esbuild/linux-x64'].integrity = 'sha512-y'; }), /^node_modules\/@esbuild\/linux-x64: integrity sha512-y, Yomitan's is sha512-xbfU/);
        assert.match(changed((p) => { p['node_modules/esbuild'].resolved = 'https://example.org/esbuild-0.25.1.tgz'; }), /^node_modules\/esbuild: resolved https:\/\/example\.org/);
        assert.equal(changed((p) => { delete p['node_modules/esbuild'].integrity; }), `node_modules/esbuild: integrity (none), Yomitan's is ${lock.packages['node_modules/esbuild'].integrity}`);
        assert.equal(changed((p) => { p['node_modules/hangul-js'].version = '0.2.5'; }), "node_modules/hangul-js: version 0.2.5, Yomitan's is 0.2.6");
        assert.equal(changed((p) => { p['node_modules/ajv'] = yomitan.packages['node_modules/ajv']; }), 'node_modules/ajv is neither esbuild, one of its platform packages nor hangul-js');
        assert.equal(changed((p) => { delete p['node_modules/hangul-js']; }), 'node_modules/hangul-js is missing');
        delete yomitan.packages['node_modules/@esbuild/linux-x64'];
        assert.equal(lockfileProblems(lock, yomitan).join('\n'), "node_modules/@esbuild/linux-x64 is not in Yomitan's package-lock.json");
    });

    test('matches Yomitan\'s package-lock.json at the pinned revision', {skip: skipCheckout}, () => {
        const theirs = JSON.parse(execFileSync('git', ['-C', root, 'cat-file', 'blob', `${PINNED_REVISION}:package-lock.json`], {env, encoding: 'utf8', maxBuffer: 1 << 28}));
        assert.deepEqual(lockfileProblems(lock, theirs), []);
        for (const key of Object.keys(lock.packages).filter((k) => k !== '' && k !== 'node_modules/hangul-js')) {
            assert.equal(theirs.packages[key].integrity, lock.packages[key].integrity, key);
        }
        // At d3c54c1 Yomitan's lockfile records hangul-js 0.2.6 by version
        // only (npm dropped its URL and hash in 96f81f1); before that it had
        // the URL and the registry's hash that ours has.
        assert.deepEqual(theirs.packages['node_modules/hangul-js'], {version: '0.2.6', license: 'MIT'});
    });
});

function sha256(file) {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function check(languagesDir) {
    return spawnSync(process.execPath, [checkTool, root, 'ko', '--languages', languagesDir, '--cli', cli], {encoding: 'utf8', env, maxBuffer: 1 << 28});
}

/** A copy of the Korean fixture, its language.json edited or its text.tsv replaced. */
function copyKorean({edit, rows} = {}) {
    const dir = mkdtempSync(join(temp, 'korean-'));
    cpSync(korean, dir, {recursive: true});
    const file = join(dir, 'ko', 'language.json');
    if (edit !== undefined) {
        const language = readJson(file);
        edit(language);
        writeFileSync(file, JSON.stringify(language, null, 2));
    }
    if (rows !== undefined) { writeFileSync(join(dir, 'ko', 'tests', 'text.tsv'), `# category\tvalid\tinput\tvariant\n${rows.join('\n')}\n`); }
    return dir;
}

describe('the Korean processors are compared with Yomitan\'s through its hangul-js bundle', {skip: skipBundle}, () => {
    test('ext/lib/hangul-js.js and its source map are the files Yomitan\'s own build writes', () => {
        for (const [name, hash] of Object.entries(REFERENCE)) { assert.equal(sha256(join(root, 'ext', 'lib', name)), hash, name); }
    });

    test('check-yomitan pairs disassembleHangul and reassembleHangul with the builtins and finds no difference', () => {
        const result = check(korean);
        assert.equal(result.status, 0, result.stderr);
        const inputs = corpusStrings(loadPack('ko', {languagesDir: korean})).length;
        assert.ok(inputs > 200);
        assert.deepEqual(result.stdout.trim().split('\n'), [
            'ko: no sources/yomitan.json; rules not compared',
            `ko: processors: disassembleHangul (${inputs} inputs), reassembleHangul (${inputs} inputs); 0 listed differences, 0 unexplained`,
        ]);
        assert.equal(result.stderr, '');
    });

    test('a processor that is not Yomitan\'s fails the check', () => {
        let result = check(copyKorean({edit: (language) => { language.lookup.preprocessors[0].keepInput = true; }}));
        assert.equal(result.status, 1);
        assert.match(result.stderr, /^ko: processors: disassembleHangul \(\d+ inputs\), reassembleHangul \(\d+ inputs\); 0 listed differences, [1-9]\d* unexplained$/m);
        assert.match(result.stderr, /pack only processor disassembleHangul: "가" -> "가"/);
        result = check(copyKorean({edit: (language) => { language.lookup.postprocessors[0].variants = [[{builtin: 'hangul.disassemble'}]]; }}));
        assert.equal(result.status, 1);
        assert.match(result.stderr, /yomitan only processor reassembleHangul: "가" -> "가"/);
        assert.match(result.stderr, /pack only processor reassembleHangul: "가" -> "ㄱㅏ"/);
    });

    test('every syllable, every jamo and every sequence of two or three modern jamo give Yomitan\'s outputs', async () => {
        const {Hangul} = await import(pathToFileURL(bundle).href);
        const range = (first, last) => Array.from({length: last - first + 1}, (_, i) => String.fromCodePoint(first + i));
        const modern = range(0x3131, 0x3163);
        const texts = [...range(0xAC00, 0xD7A3), ...range(0x3131, 0x318E), ...range(0x1100, 0x11FF), ...range(0xA960, 0xA97F), ...range(0xD7B0, 0xD7FF)];
        for (const a of modern) {
            for (const b of modern) {
                texts.push(a + b);
                for (const c of modern) { texts.push(a + b + c); }
            }
        }
        const result = check(copyKorean({rows: texts.map((text) => `every\t1\t${text}\t${Hangul.disassemble(text, false).join('')}`)}));
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /^ko: processors: disassembleHangul \((\d+) inputs\), reassembleHangul \(\1 inputs\); 0 listed differences, 0 unexplained$/m);
        assert.ok(Number(/disassembleHangul \((\d+) inputs\)/.exec(result.stdout)[1]) >= texts.length);
    });
});
