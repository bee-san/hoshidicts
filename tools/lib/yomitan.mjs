// SPDX-License-Identifier: GPL-3.0-or-later
// Imports Yomitan's language code from a checkout (read only) for the port
// and differential tools (docs/languages.md, section 8).
//
// Yomitan's `ext/lib/` holds bundles its build creates (kanji-processor for
// Japanese, hangul-js for Korean). A plain checkout has none, so missing ones
// are replaced by stubs that throw when used: every language except Japanese
// and Korean imports without them. To compare Korean processors, build
// `ext/lib` in a copy of the checkout (never in a shared one) and point the
// tools at the copy.

import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

/** The Yomitan revision the contract pins (section 8). */
export const PINNED_REVISION = 'd3c54c10264673eca0d66b970ef74cd5c8b048e3';

const STUBBED_LIBS = {
    'kanji-processor.js': ['convertVariants'],
    'hangul-js.js': ['Hangul'],
};

function stubUrl(file, names) {
    const message = `Yomitan's ext/lib/${file} is not built in this checkout; build ext/lib in a copy to use it`;
    const body = names.map((name) => `export const ${name} = new Proxy(function () {}, {get(target, key) { if (key === Symbol.toPrimitive || key === 'then') { return undefined; } throw new Error(${JSON.stringify(message)}); }, apply() { throw new Error(${JSON.stringify(message)}); }});`).join('\n');
    return `data:text/javascript,${encodeURIComponent(body)}`;
}

const CAPTURE_URL = `data:text/javascript,${encodeURIComponent('export function testLanguageTransformer(languageTransformer, data, preprocess) { (globalThis.__hoshidictsYomitanTests ??= []).push({data, preprocess}); }')}`;

const installed = new Set();
const roots = [];

/**
 * Installs the module hooks for a Yomitan checkout (once per root).
 * @param {string} root
 */
export function installYomitanHooks(root) {
    const absolute = resolve(root);
    if (installed.has(absolute)) { return; }
    installed.add(absolute);
    const prefix = pathToFileURL(absolute).href + '/';
    roots.push(prefix);
    if (roots.length > 1) { return; }
    registerHooks({
        resolve(specifier, context, nextResolve) {
            const parent = context.parentURL ?? '';
            const root2 = roots.find((r) => parent.startsWith(r));
            if (root2 === undefined) { return nextResolve(specifier, context); }
            let target;
            try {
                target = new URL(specifier, parent).href;
            } catch {
                return nextResolve(specifier, context);
            }
            if (target === `${root2}test/fixtures/language-transformer-test.js`) {
                return {url: CAPTURE_URL, shortCircuit: true};
            }
            const libPrefix = `${root2}ext/lib/`;
            if (target.startsWith(libPrefix)) {
                const file = target.slice(libPrefix.length);
                const names = STUBBED_LIBS[file];
                if (names !== undefined && !existsSync(new URL(target))) {
                    return {url: stubUrl(file, names), shortCircuit: true};
                }
            }
            return nextResolve(specifier, context);
        },
    });
}

/**
 * The revision of a Yomitan checkout, or null when it is not a git checkout.
 * @param {string} root
 * @returns {string | null}
 */
export function yomitanRevision(root) {
    try {
        return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore']}).trim();
    } catch {
        const head = join(root, '.git', 'HEAD');
        if (!existsSync(head)) { return null; }
        const text = readFileSync(head, 'utf8').trim();
        if (!text.startsWith('ref: ')) { return text; }
        const ref = join(root, '.git', text.slice(5));
        return existsSync(ref) ? readFileSync(ref, 'utf8').trim() : null;
    }
}

/**
 * Imports a module of the checkout.
 * @param {string} root
 * @param {string} path relative to the root, such as ext/js/language/en/english-transforms.js
 * @returns {Promise<any>}
 */
export async function importYomitan(root, path) {
    installYomitanHooks(root);
    const file = join(resolve(root), path);
    if (!existsSync(file)) { throw new Error(`${file} does not exist; is ${root} a Yomitan checkout?`); }
    return import(pathToFileURL(file).href);
}

function isDescriptor(value) {
    return value !== null && typeof value === 'object' && typeof value.conditions === 'object' && typeof value.transforms === 'object';
}

/**
 * The transform descriptors in ext/js/language/<code>/*-transforms.js, as
 * written (Georgian's declares `language: 'kat'` and is used as written).
 * @param {string} root
 * @param {string} code
 * @returns {Promise<{file: string, exportName: string, descriptor: any}[]>}
 */
export async function loadTransformDescriptors(root, code) {
    const dir = join(resolve(root), 'ext', 'js', 'language', code);
    if (!existsSync(dir)) { return []; }
    const files = readdirSync(dir).filter((name) => name.endsWith('-transforms.js')).sort();
    const found = [];
    for (const name of files) {
        const module = await importYomitan(root, `ext/js/language/${code}/${name}`);
        for (const [exportName, value] of Object.entries(module)) {
            if (isDescriptor(value)) { found.push({file: `ext/js/language/${code}/${name}`, exportName, descriptor: value}); }
        }
    }
    return found;
}

/**
 * The single transform descriptor of a language.
 * @param {string} root
 * @param {string} code
 */
export async function loadTransformDescriptor(root, code) {
    const found = await loadTransformDescriptors(root, code);
    if (found.length === 0) { return null; }
    if (found.length > 1) { throw new Error(`ext/js/language/${code} exports ${found.length} transform descriptors (${found.map((f) => f.exportName).join(', ')}); expected one`); }
    return found[0];
}

/**
 * Yomitan's text processors for a language, from language-descriptors.js:
 * `{preprocessors: [{id, process}], postprocessors: [...]}`, or null when
 * Yomitan does not describe the language.
 * @param {string} root
 * @param {string} code
 */
export async function loadTextProcessors(root, code) {
    const {languageDescriptorMap} = await importYomitan(root, 'ext/js/language/language-descriptors.js');
    const descriptor = languageDescriptorMap.get(code);
    if (descriptor === undefined) { return null; }
    const list = (object) => Object.entries(object ?? {}).map(([id, processor]) => ({id, name: processor.name, description: processor.description, process: processor.process}));
    return {preprocessors: list(descriptor.textPreprocessors), postprocessors: list(descriptor.textPostprocessors)};
}

/**
 * Yomitan's LanguageTransformer class, with its cycle warnings silenced.
 * @param {string} root
 */
export async function loadLanguageTransformer(root) {
    const {log} = await importYomitan(root, 'ext/js/core/log.js');
    log.warn = () => {};
    const {LanguageTransformer} = await importYomitan(root, 'ext/js/language/language-transformer.js');
    return LanguageTransformer;
}

/**
 * The test file of test/language/ whose transforms come from
 * ext/js/language/<code>/, or null.
 * @param {string} root
 * @param {string} code
 * @returns {string | null} a path relative to the root
 */
export function findTransformTest(root, code) {
    const dir = join(resolve(root), 'test', 'language');
    if (!existsSync(dir)) { return null; }
    const needle = `/ext/js/language/${code}/`;
    const matches = readdirSync(dir)
        .filter((name) => name.endsWith('-transforms.test.js'))
        .filter((name) => readFileSync(join(dir, name), 'utf8').split('\n').some((line) => line.startsWith('import') && line.includes(needle) && line.includes('-transforms.js')))
        .sort();
    if (matches.length > 1) { throw new Error(`more than one transform test for ${code}: ${matches.join(', ')}`); }
    return matches.length === 0 ? null : `test/language/${matches[0]}`;
}

let captureCounter = 0;

/**
 * Runs a Yomitan transform test file with its test runner replaced and
 * returns the test data it passes to testLanguageTransformer.
 * @param {string} root
 * @param {string} path relative to the root
 * @returns {Promise<{category: string, valid: boolean, tests: {source: string, term: string, rule: string | null, reasons: string[] | null}[]}[]>}
 */
export async function loadTransformTests(root, path) {
    installYomitanHooks(root);
    globalThis.__hoshidictsYomitanTests = [];
    const file = join(resolve(root), path);
    await import(`${pathToFileURL(file).href}?hoshidicts-capture=${++captureCounter}`);
    const captured = globalThis.__hoshidictsYomitanTests;
    delete globalThis.__hoshidictsYomitanTests;
    if (captured.length !== 1) { throw new Error(`${path} called testLanguageTransformer ${captured.length} times; expected once`); }
    return captured[0].data;
}
