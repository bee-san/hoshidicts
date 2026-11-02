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
import {checkStep} from '../lib/steps.mjs';

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

    test('rejects what std::regex and JavaScript read differently (section 7.6)', () => {
        // The audit's cases, with what JavaScript and the engine gave: a*? on
        // baaa (global, -) -b-a-a-a- and -b-------; (a)|b\1 on b X and no
        // match; (?:(x)|y)*z with [$1] on xyz [] and [x]; (a*)*b and the last
        // pattern take exponential time in std::regex. Then the other cases
        // of the random test (three of them now fail first at a capturing
        // group inside a lookahead), and more forms of each rule.
        const cases = [
            ['a*?', true, /global pattern may not match the empty text/],
            ['a{0,2}?', true, /global pattern may not match the empty text/],
            ['(a)|b\\1', false, /may not take part/],
            ['(a)|b\\1', true, /may not take part/],
            ['(?:(a)|b)+\\1', false, /inside a repeated group/],
            ['(?:(x)|y)*z', false, /inside a repeated group/],
            ['(a*)*b', false, /may not repeat a group that can match the empty text/],
            ['(?:a|())*b', false, /may not repeat a group that can match the empty text/],
            ['い\\.*|.(((?=c{2}?aい*?|いa{0,2})|(い{0,2}|c*a{0,2}){0,2}?)*?[\\u0061-\\u0062]\\)|\\.)', false, /may not repeat a group/],
            ['((?=(a{2}c|aaい)|(?=c{0,2}a{2}?|aa*c)(ac*|c{0,2}a))|.{2}c*?((?=a{2}い*a*?|[^a]+)(?=.*.{2}.{0,2})|.*){1,3})a{0,2}(\\()*?|.\\.+?((?=cc|(?!c{2}い*|いac))|い{0,2}\\.)\\1', false, /capturing group inside a lookahead/],
            ['.{0,2}?い(((?=[^a]{1,3}c*)c{0,2}.|\\.)*?a*.*|(?=c*?a|c)(?:(a?a*い|[ab]{2}.{2}.)|a{2}い\\({2}?){2})*?|.\\1', false, /inside a repeated group/],
            ['い{0,2}?', true, /global pattern may not match the empty text/],
            ['\\.{2}(い{0,2}|.*(?=(い{0,2}?い{0,2}a{2}|い{0,2}c{0,2}))(?=\\.{1,3}?(?:c{2}い{0,2}|a{0,2}?x){0,2}?|a*))|c.{2}?.{0,2}\\1', true, /capturing group inside a lookahead/],
            ['((?=.{0,2}?[a-c](c*|い)|(?=c{0,2}[a-c].{0,2}|.x?))(?=.{2}|x??(?=c*?))|((a)\\.{2})*い{2}(?=.{1,3}\\.{2})){0,2}\\1', true, /capturing group inside a lookahead/],
            // libstdc++ reads ^ in a lookahead as the start of the lookahead:
            // [ab]+(?!^|^) on abbいいc (global, Z) gives Zいいc in JavaScript, aZいいc in the engine.
            ['[ab]+(?!^|^)', true, /\^ inside a lookahead/],
            ['あb?(?=[あい]??^)b', true, /\^ inside a lookahead/],
            ['(?=^a)a', false, /\^ inside a lookahead/],
            ['a?|b', true, /global pattern may not match the empty text/],
            ['|a', true, /global pattern may not match the empty text/],
            ['x*', true, /global pattern may not match the empty text/],
            ['$', true, /global pattern may not match the empty text/],
            ['(?=a)', true, /global pattern may not match the empty text/],
            ['(a)?\\1', false, /may not take part/],
            ['(a)*\\1', false, /may not take part/],
            ['(?!(a))\\1', false, /capturing group inside a lookahead/],
            ['(?:(a)|c)\\1', false, /may not take part/],
            ['((a)|b)\\2', false, /may not take part/],
            ['((a)|b)*', false, /inside a repeated group/],
            ['(?:a?)+', false, /may not repeat a group/],
            ['(?:a|)*', false, /may not repeat a group/],
            ['(?:(?=a))+', false, /may not repeat a group/],
            ['()\\1*', false, /may not repeat a back-reference/],
            ['a{70000}', false, /above 65535/],
        ];
        for (const [pattern, global, message] of cases) {
            assert.throws(() => parsePattern(pattern, {global}), (error) => error instanceof ClassError && message.test(error.message), `${pattern}${global ? ' (global)' : ''}`);
        }
        // What the rules leave in the dialect.
        for (const [pattern, global] of [
            ['(a|b)*c', false], ['(a)\\1', false], ['(?:(a)\\1|b)', false], ['(a)(?=b)\\1', false], ['(a)+\\1', false],
            ['((a)|b)\\1', false], ['(a)\\1|b', false], ['(a)(?:b\\1)*', false], ['(a)(\\1)+', false], ['(a)\\1*', false],
            ['(?:ab?)?', false], ['a*?', false], ['x*', false], ['$', false], ['^a', true], ['a(?=b$)', true], ['a', true], ['a*b', true],
            ['(l|dell|all)[\'\u2019]', true], ['^ge([a-z]+)t$', false], ['^(ma)([b-df-hj-np-tv-z]*[aeiou])(\\2)', false],
        ]) {
            assert.doesNotThrow(() => parsePattern(pattern, {global}), `${pattern}${global ? ' (global)' : ''}`);
        }
        assert.equal(parsePattern('a*').nullable, true);
        assert.equal(parsePattern('a+').nullable, false);
        // The global flag of a step reaches the check.
        assert.throws(() => checkStep({pattern: 'a*', replace: '-', global: true}, classes), /global pattern/);
        assert.doesNotThrow(() => checkStep({pattern: 'a*', replace: '-'}, classes));
        assert.throws(() => classes.patternRegExp('a*', {global: true}), /global pattern/);
    });

    test('rejects a capturing group or a back-reference inside a lookahead (section 7.6)', () => {
        const capture = /a capturing group inside a lookahead is not in the pattern dialect/;
        const backref = /a back-reference inside a lookahead is not in the pattern dialect/;
        // The re-audit's cases. libstdc++ keeps a capture made inside a
        // lookahead on a path that then fails, where JavaScript and libc++
        // clear it: (?=(a))ac|ab with [$1] on ab gives [] in JavaScript and
        // [a] in the engine. The last six differ in no library today.
        const cases = [
            ['(?=(a))ac|ab', false, capture],
            ['(?=(a))ac|ab', true, capture],
            ['(?!(a)b)a|ab', false, capture],
            ['(?:(?=(a))b|a)', false, capture],
            ['(?=(ab))a(?=c)|a', false, capture],
            ['(?=(a))a+c|a', false, capture],
            ['x(?=(a))ac|xa', false, capture],
            ['(?=(a)b)ab|a', true, capture],
            ['(?=(.))..x|.', true, capture],
            ['(?!(a))b|a', false, capture],
            ['(?=(a))\\1', false, capture],
            ['(?=(a))\\1c|ab', false, capture],
            ['a(?=(b))c|ab', false, capture],
            ['(a)(?=(b))c|ab', false, capture],
            ['c|(?=(a))ab|a', true, capture],
            ['(b)(?=(a))', false, capture],
            ['(b)(?=(a)(x))', false, capture],
            ['(b)(?=(a))(a)', false, capture],
            ['(?=(a))(a)\\2', false, capture],
            ['(b)(?=(a))\\2', false, capture],
            ['(b)(?!(x))a', false, capture],
            ['(?!(a))\\1', false, capture],
            ['(?=(?=(a)))a', false, capture],
            ['(?=(?:(a)))a', false, capture],
            // The ones of its random test that differ in libstdc++.
            ['[あx]*(?=(a{1,2})??a?b+|(?=[a-c]{2}|(b){0,2}(a))(x){0,2}あ{2}|ab{0,2}?)|x{0,2}?bx(c)+?', false, capture],
            ['(?=(x)|(あx?){0,2}?b)[^a]cあ{0,2}?|(?!a{2}?(あ){2}b{0,2})', false, capture],
            ['(?=a(あ+)+?)b|a', true, capture],
            ['(?!bあ|[ab](b*?(?:[^a])))[a-c]|(?!a)', false, capture],
            // libc++ numbers the groups of a lookahead from 1: (a)(?=\1) does
            // not compile there, and (a)(?=(b)\1) matches abb where JavaScript
            // and libstdc++ match aba.
            ['(a)(?=\\1)', false, backref],
            ['(a)(?!\\1)', false, backref],
            ['(a)(?=(b)\\1)', false, capture],
            ['(?=(a)\\1)', false, capture],
            ['(b)xx(?=(?:\\1+))', false, backref],
            ['(.)(?=.\\1)', true, backref],
            ['(a)(?!(?=\\1))', false, backref],
            // The ones of its random test that libc++ alone refuses.
            ['(a){2}(あ*|あ{0,2}(x)|(.)?ba{2}?)(?=\\2)', true, backref],
            ['(a){2}?(?!\\1{0,2})|b|a$', true, backref],
            ['([ab]??(b))(?:(あ+?){0,2}$|\\2+x{0,2}?[^a]*|(a)?|(?!(b){1,2}?(?:あ{2}.b|a{1,2}a|\\2{1,2}\\2*){0,2}(?:あ{2}?\\2[ab]{0,2})|(b)??.)^)', false, capture],
            ['(あ)+?(あ){1,2}?(?=(?=b)\\1{1,2}?)', false, backref],
        ];
        for (const [pattern, global, message] of cases) {
            assert.throws(() => parsePattern(pattern, {global}), (error) => error instanceof ClassError && message.test(error.message), `${pattern}${global ? ' (global)' : ''}`);
        }
        // Lookaheads without a capturing group or a back-reference inside, as
        // Yomitan's ar (?!ل) and yi (?!.*[...]) rules, stay in the dialect.
        for (const pattern of ['(?=(?:ab))a', '(?!(?:a|b)c)x', '(?=a)(a)\\1', '(a)(?=b)\\1', '(?!ل)', '(?!.*[ab])x', '(?=[(])\\(']) {
            assert.doesNotThrow(() => parsePattern(pattern), pattern);
        }
        assert.throws(() => checkStep({pattern: '(?=(a))a', replace: 'b'}, classes), capture);
        assert.throws(() => checkStep({pattern: '(a)(?=\\1)', replace: 'b'}, classes), backref);
    });

    test('knows which patterns can match the empty text (section 7.6)', () => {
        // A group in the last alternative may not take part, and a class, `.`,
        // a reference, a back-reference to a group that can match the empty
        // text, or a group, with a quantifier whose minimum is 0, can match the
        // empty text. Each shape with a regex the engine and JavaScript read
        // differently: (?:b|(a))\1 with - on b gives - in JavaScript and b in
        // the engine; [a]*?, .*?, {letter}*? and (a*?)\1 (global, -) on baaa
        // give -b-a-a-a- in JavaScript and -b------- or ---------, -b---a- in
        // the engine.
        const notTakingPart = /may not take part in the match/;
        const globalEmpty = /a global pattern may not match the empty text/;
        const repeatEmpty = /a quantifier may not repeat a group that can match the empty text/;
        for (const [pattern, global, message] of [
            ['(?:b|(a))\\1', false, notTakingPart],
            ['(?:b|c|(a))\\1', false, notTakingPart],
            ['(?:b|(a)c)\\1', false, notTakingPart],
            ['[a]*?', true, globalEmpty],
            ['[^a]*', true, globalEmpty],
            ['[a]{0,3}', true, globalEmpty],
            ['.*?', true, globalEmpty],
            ['.?', true, globalEmpty],
            ['{letter}*?', true, globalEmpty],
            ['{letter}{0,2}', true, globalEmpty],
            ['(a*?)\\1', true, globalEmpty],
            ['(?:ab)??', true, globalEmpty],
            ['(?:ab)*', true, globalEmpty],
            ['(?:ab){0,2}', true, globalEmpty],
            ['(?:(?:ab)?)*', false, repeatEmpty],
            ['(?:[a]*)+', false, repeatEmpty],
            ['(?:.?)+', false, repeatEmpty],
            ['(?:{letter}*)+', false, repeatEmpty],
            ['(a)(?:\\1*)+', false, repeatEmpty],
            ['(a*)(?:\\1)+', false, repeatEmpty],
        ]) {
            assert.throws(() => parsePattern(pattern, {global}), (error) => error instanceof ClassError && message.test(error.message), `${pattern}${global ? ' (global)' : ''}`);
        }
        // What it must not refuse: a {m,n} minimum above 0 is not empty, and
        // neither is a back-reference to a group that is not.
        for (const pattern of ['a{2}', 'a{2,}', '[a]{1,3}', '.{2}', '{letter}{2}', '(?:ab){2}', '(a{2})\\1', '(a)\\1']) {
            assert.doesNotThrow(() => parsePattern(pattern, {global: true}), `${pattern} (global)`);
        }
        assert.doesNotThrow(() => parsePattern('(?:b|(a))c'));
        for (const [pattern, nullable] of [
            ['[a]*', true], ['[a]+', false], ['[^a]?', true], ['.*?', true], ['.', false], ['{letter}{0,2}', true], ['{letter}', false],
            ['(a*?)\\1', true], ['(a)\\1', false], ['(?:ab)??', true], ['(?:ab){0,2}', true], ['(?:ab){2}', false], ['a{2}', false],
            ['a{2,}', false], ['a{0}', true], ['(?:b|(a))', false], ['(?:b|)', true], ['b|', true], ['(?=a)', true], ['^$', true],
        ]) {
            assert.equal(parsePattern(pattern).nullable, nullable, pattern);
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
