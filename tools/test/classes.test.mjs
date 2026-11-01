// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import {describe, test} from 'node:test';
import {
    ClassError,
    ClassSet,
    GENERAL_CATEGORIES,
    checkReplacement,
    classReferences,
    mergeRanges,
    parseClass,
    parsePattern,
    rangesOfSource,
    rangesToItems,
} from '../lib/classes.mjs';

/** Ranges by testing every code point with JavaScript itself. */
function bruteForce(source) {
    const regExp = new RegExp(`^${source}$`, 'u');
    const ranges = [];
    let first = -1;
    for (let cp = 0; cp <= 0x10FFFF; ++cp) {
        const member = !(cp >= 0xD800 && cp <= 0xDFFF) && regExp.test(String.fromCodePoint(cp));
        if (member && first < 0) { first = cp; }
        if (!member && first >= 0) {
            ranges.push([first, cp - 1]);
            first = -1;
        }
    }
    if (first >= 0) { ranges.push([first, 0x10FFFF]); }
    return mergeRanges(ranges);
}

describe('parseClass', () => {
    test('accepts the syntax of section 5', () => {
        for (const source of [
            '[A-Za-z\\u00C0-\\u024F]',
            '[^a-z]',
            '[\\u{20000}-\\u{2FA1F}]',
            '[\\p{L}\\p{Mn}\\p{Nd}]',
            '[\\\\\\]\\^\\-]',
            '[a\\-z]',
            '[{letter}\\p{M}]',
            '[\u3005-\u3007\u30FC]',
            '[ .\'\u2019]',
            '[[(|)*+?.$/]',
            '[]',
            '[^]',
            '[\u{1F600}]',
            '{letter}',
        ]) {
            assert.doesNotThrow(() => parseClass(source), source);
        }
    });

    test('describes items', () => {
        assert.deepEqual(parseClass('{word}'), {type: 'ref', name: 'word'});
        const set = parseClass('[^a-c\\u0041\\p{Lu}{x}]');
        assert.equal(set.type, 'set');
        assert.equal(set.negated, true);
        assert.deepEqual(set.items.map((i) => i.kind), ['range', 'char', 'category', 'ref']);
        assert.deepEqual(set.items.map((i) => i.raw), ['a-c', '\\u0041', '\\p{Lu}', '{x}']);
        assert.deepEqual(classReferences('[{a}x{b}]'), ['a', 'b']);
    });

    test('rejects what the syntax does not allow', () => {
        const cases = {
            'a': /one bracket expression/,
            '[a]b': /text follows/,
            '[a': /not closed/,
            '[a-]': /must be written \\-/,
            '[-a]': /must be written \\-/,
            '[a^]': /must be written \\\^/,
            '[}]': /\\u007D/,
            '[{]': /starts a reference/,
            '[{1x}]': /starts a reference/,
            '[z-a]': /out of order/,
            '[\\p{L}-z]': /category cannot start a range/,
            '[a-\\p{L}]': /character at both ends/,
            '[\\p{Script=Latin}]': /script properties/,
            '[\\p{scx=Han}]': /script properties/,
            '[\\p{Latin}]': /not a general category/,
            '[\\p{Letter}]': /not a general category/,
            '[\\p{LC}]': /not a general category/,
            '[\\P{L}]': /negate the whole class/,
            '[\\d]': /not accepted in a class/,
            '[\\w]': /not accepted in a class/,
            '[\\s]': /not accepted in a class/,
            '[\\n]': /not accepted in a class/,
            '[\\[]': /not accepted in a class/,
            '[\\uD83D\\uDE00]': /surrogate/,
            '[\\u{D800}]': /surrogate/,
            '[\\u{110000}]': /above U\+10FFFF/,
            '[\\u{1234567}]': /1 to 6/,
            '[\\u12]': /four hexadecimal/,
            '[\uD800]': /lone surrogate/,
            '{a b}': /bare reference/,
        };
        for (const [source, message] of Object.entries(cases)) {
            assert.throws(() => parseClass(source), (error) => error instanceof ClassError && message.test(error.message), source);
        }
        assert.throws(() => parseClass(null), /must be a string/);
    });

    test('knows the general categories', () => {
        assert.equal(GENERAL_CATEGORIES.length, 37);
        for (const name of GENERAL_CATEGORIES) {
            assert.doesNotThrow(() => new RegExp(`\\p{${name}}`, 'u'), name);
        }
    });
});

describe('ClassSet', () => {
    const classes = new ClassSet({
        letter: '[A-Za-z\\u00C0-\\u024F]',
        word: '[{letter}\\p{M}\\p{Nd}]',
        alias: '{word}',
        notLetter: '[^{letter}]',
        digitsOrNot: '[{notLetter}0-9]',
        harakat: '[\\u0618-\\u061A\\u064B-\\u0656\\u0670]',
        kanji: '[\\u3400-\\u4DBF\\u4E00-\\u9FFF\\u{20000}-\\u{2FA1F}]',
    });

    test('expands references inside bracket expressions', () => {
        assert.equal(classes.source('{letter}'), '[A-Za-z\\u00C0-\\u024F]');
        assert.equal(classes.source('{word}'), '[A-Za-z\\u00C0-\\u024F\\p{M}\\p{Nd}]');
        assert.equal(classes.source('{alias}'), classes.source('{word}'));
        assert.equal(classes.source('[{letter}{harakat}\\u0640]'), '[A-Za-z\\u00C0-\\u024F\\u0618-\\u061A\\u064B-\\u0656\\u0670\\u0640]');
        assert.equal(classes.source('[^{word}]'), '[^A-Za-z\\u00C0-\\u024F\\p{M}\\p{Nd}]');
        assert.deepEqual(classes.names, ['letter', 'word', 'alias', 'notLetter', 'digitsOrNot', 'harakat', 'kanji']);
        assert.ok(classes.has('word'));
        assert.ok(!classes.has('nope'));
    });

    test('lists a negated class by its members inside another class', () => {
        const source = classes.source('{digitsOrNot}');
        assert.ok(!source.includes('^'), source);
        assert.deepEqual(classes.ranges('{digitsOrNot}'), mergeRanges([[0, 64], [91, 96], [123, 191], [592, 0xD7FF], [0xE000, 0x10FFFF], [48, 57]]));
        // [^{notLetter}] is the letters again.
        assert.deepEqual(classes.ranges('[^{notLetter}]'), classes.ranges('{letter}'));
    });

    test('ranges agree with JavaScript over all of Unicode and leave out surrogates', () => {
        for (const field of ['{letter}', '{word}', '{notLetter}', '{kanji}', '[\\p{L}]', '[^\\p{Cs}]', '[\\p{Cs}]', '[\\p{Cn}]']) {
            assert.deepEqual(classes.ranges(field), bruteForce(classes.source(field)), field);
        }
        assert.deepEqual(classes.ranges('[\\p{Cs}]'), []);
        assert.deepEqual(classes.ranges('[^a]'), [[0, 96], [98, 0xD7FF], [0xE000, 0x10FFFF]]);
        assert.deepEqual(classes.ranges('[]'), []);
        assert.deepEqual(classes.ranges('{kanji}').at(-1), [0x20000, 0x2FA1F]);
    });

    test('regExp and matcher use the u flag', () => {
        const regExp = classes.regExp('{kanji}');
        assert.ok(regExp.unicode);
        assert.ok(regExp.test('\u{20B9F}'));
        const isWord = classes.matcher('{word}');
        assert.ok(isWord(0x301));
        assert.ok(isWord(0x39));
        assert.ok(!isWord(0x2D));
        assert.equal(classes.regExp('{letter}', 'g').flags, 'gu');
    });

    test('expandedClasses gives every class expanded', () => {
        const expanded = classes.expandedClasses();
        assert.equal(expanded.alias, '[A-Za-z\\u00C0-\\u024F\\p{M}\\p{Nd}]');
        for (const source of Object.values(expanded)) { assert.doesNotThrow(() => new RegExp(source, 'u')); }
    });

    test('expandSteps expands strip, within and pattern for hosts', () => {
        const steps = [{normalize: 'NFD', within: '{letter}'}, {strip: '{harakat}'}, {pattern: '{letter}+', replace: 'x', global: true}, {case: 'lower'}];
        assert.deepEqual(classes.expandSteps(steps), [
            {normalize: 'NFD', within: '[A-Za-z\\u00C0-\\u024F]'},
            {strip: '[\\u0618-\\u061A\\u064B-\\u0656\\u0670]'},
            {pattern: '[\\u0041-\\u005A\\u0061-\\u007A\\u00C0-\\u024F]+', replace: 'x', global: true},
            {case: 'lower'},
        ]);
        assert.equal(steps[1].strip, '{harakat}');
    });

    test('refuses cycles, unknown names and bad definitions', () => {
        assert.throws(() => new ClassSet({a: '[{b}]', b: '[x{a}]'}), /cycle: a -> b -> a/);
        assert.throws(() => new ClassSet({a: '{a}'}), /cycle: a -> a/);
        assert.throws(() => new ClassSet({a: '[{zz}]'}), /classes\.a: \{zz\} names no class/);
        assert.throws(() => new ClassSet({'bad name': '[a]'}), /class name/);
        assert.throws(() => new ClassSet({a: '[\\p{Script=Arab}]'}), /classes\.a: script properties/);
        assert.throws(() => new ClassSet([]), /must be an object/);
        assert.throws(() => classes.source('{missing}'), /names no class/);
        assert.deepEqual(new ClassSet(null).names, []);
        assert.deepEqual(new ClassSet().names, []);
    });
});

describe('ranges helpers', () => {
    test('rangesOfSource and rangesToItems round-trip, surrogates included on request', () => {
        const ranges = rangesOfSource('[^a-z]', {surrogates: true});
        assert.deepEqual(ranges, [[0, 96], [123, 0x10FFFF]]);
        const items = rangesToItems([[0x41, 0x5A], [0xD800, 0xDFFF], [0x1F600, 0x1F600]]);
        assert.equal(items, '\\u0041-\\u005A\\u{D800}-\\u{DFFF}\\u{1F600}');
        assert.deepEqual(rangesOfSource(`[${items}]`, {surrogates: true}), [[0x41, 0x5A], [0xD800, 0xDFFF], [0x1F600, 0x1F600]]);
    });

    test('mergeRanges sorts and joins adjacent ranges', () => {
        assert.deepEqual(mergeRanges([[5, 6], [1, 2], [3, 4], [10, 12], [11, 20]]), [[1, 6], [10, 20]]);
    });
});

describe('pattern dialect', () => {
    const classes = new ClassSet({letter: '[A-Za-z]', harakat: '[\\u064B-\\u0652]', astral: '[a\\u{20000}]', notA: '[^a]'});

    test('accepts the constructs of section 7.6', () => {
        for (const pattern of [
            'abc',
            '(l|dell|all)[\'\u2019]',
            '(\u0301[^\u0301]*)\u0301',
            '^(?:ab|cd)+?$',
            'a{2}b{1,}c{0,3}?',
            'x(?=y)(?!z)',
            '(a)(b)\\2\\1',
            '[\\u0041-\\u005A\\-\\]\\\\\\^\\[]',
            '\\.\\*\\+\\?\\(\\)\\[\\]\\{\\}\\|\\/\\^\\$\\\\',
            '{letter}+s$',
            '[{letter}0-9]',
            '.',
            '\u{1F600}',
            '(?:\u{1F600})+',
        ]) {
            assert.doesNotThrow(() => parsePattern(pattern), pattern);
        }
        assert.equal(parsePattern('(a)(?:b)(c(d))').groups, 3);
    });

    test('rejects what the dialect excludes', () => {
        const cases = {
            '(?<=a)b': /lookbehind/,
            '(?<!a)b': /lookbehind/,
            '(?<name>a)': /named groups/,
            '\\k<name>': /named back-references/,
            '\\p{L}': /\\p/,
            '\\u{41}': /\\u\{/,
            '[\\u{41}]': /\\u\{/,
            '\\s': /\\s/,
            '\\w+': /\\w/,
            '\\b': /\\b/,
            '\\d': /\\d/,
            '[\\d]': /\\d/,
            '[\\b]': /\\b/,
            '[[:alpha:]]': /POSIX/,
            '[a[b]': /must be written \\\[/,
            '[]': /empty class/,
            '[^]': /empty class/,
            '\\1(a)': /must follow the end of group 1/,
            '(a\\1)': /must follow the end of group 1/,
            '(a)\\10': /\\1 to \\9/,
            '\\0': /not in the pattern dialect/,
            '\\n': /not in the pattern dialect/,
            '\\x41': /not in the pattern dialect/,
            'a**': /nothing to repeat/,
            '*a': /nothing to repeat/,
            '^*': /nothing to repeat/,
            '(?=a)+': /nothing to repeat/,
            'a{3,1}': /m <= n/,
            'a{': /\{/,
            '{1}': /nothing to repeat/,
            'a]': /\\\]/,
            'a}': /\\\}/,
            '(a': /not closed/,
            'a)': /unmatched/,
            '(?i)a': /only \(\?:/,
            '\u{1F600}+': /half/,
            '[\u{1F600}]': /up to U\+FFFF/,
            '[\\uD800]': /surrogate/,
            '[a-]': /\\-/,
            '[z-a]': /out of order/,
        };
        for (const [pattern, message] of Object.entries(cases)) {
            assert.throws(() => parsePattern(pattern), (error) => error instanceof ClassError && message.test(error.message), pattern);
        }
    });

    test('expands references to explicit BMP ranges', () => {
        assert.equal(classes.patternSource('{letter}+s$'), '[\\u0041-\\u005A\\u0061-\\u007A]+s$');
        assert.equal(classes.patternSource('[{letter}\'\u2019]'), '[\\u0041-\\u005A\\u0061-\\u007A\'\u2019]');
        assert.equal(classes.patternSource('[^{harakat}]'), '[^\\u064B-\\u0652]');
        assert.equal(classes.patternSource('a{2}'), 'a{2}');
        const regExp = classes.patternRegExp('{letter}+s$', {global: true});
        assert.equal(regExp.flags, 'g');
        assert.equal('cats dogs'.replace(regExp, 'X'), 'cats X');
        assert.throws(() => classes.patternSource('{astral}'), /above U\+FFFF/);
        assert.throws(() => classes.patternSource('{notA}'), /above U\+FFFF/);
        assert.throws(() => classes.patternSource('{nope}'), /names no class/);
    });

    test('checks replacements', () => {
        assert.doesNotThrow(() => checkReplacement('$1-$&-x', 1));
        assert.doesNotThrow(() => checkReplacement('', 0));
        assert.throws(() => checkReplacement('$2', 1), /names a group/);
        assert.throws(() => checkReplacement('$10', 9), /a digit may not follow/);
        assert.throws(() => checkReplacement('$$', 0), /must start/);
        assert.throws(() => checkReplacement('a$', 0), /must start/);
        assert.throws(() => checkReplacement('$<n>', 1), /must start/);
        assert.throws(() => checkReplacement(1, 0), /must be a string/);
    });
});
