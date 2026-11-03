#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes sources/own.json: Arabic deinflection rules written for this pack
// from Arabic grammar (docs/languages.md, section 14 step 2), before Yomitan's
// Arabic rules were read. Run from anywhere:
//
//   node languages/ar/sources/own-rules.mjs
//
// The rules read unvowelled Modern Standard Arabic as it is printed: the
// pack's preprocessors remove vowel marks and tatweel first, so a rule sees
// only the letters U+0621-U+064A (the `base` class of language.json).
//
// Conditions follow the dictionary tags of Yomitan-format Arabic dictionaries:
// wiktionary-to-yomitan writes `v` and `n` in a term's rules and leaves them
// empty for adjectives, names, pronouns and particles, and its form-of rows
// of adjectives have empty rules too. A row with empty rules passes the
// part-of-speech filter only for a deinflection without conditions
// (docs/languages.md 9.4 and 9.10), so every rule whose output can be such a
// word (the proclitics, the pronoun suffixes, the endings of nouns and
// adjectives) gives no conditions. The rules that conjugate verbs give `v`,
// so only verbs answer them, and nothing takes `v` in: a verb lemma is the end
// of a chain. `vf` marks a verb form that still has its person affixes (the
// output of the future prefix and of a pronoun rule that restores a verb
// ending), which the conjugation rules take in.

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const conditions = {
    v: {name: 'Verb', isDictionaryForm: true},
    n: {name: 'Noun', isDictionaryForm: true},
    vf: {name: 'Verb form with its person affixes', isDictionaryForm: false},
};

// Letters that can be a root consonant, for the rules that name one.
const RADICALS = [...'ءأإآؤئبتثجحخدذرزسشصضطظعغفقكلمنهوي'];
const STEM = '{base}';

const V_IN = ['vf'];
const V_OUT = ['v'];

function suffix(inflected, deinflected, {min = 2, out = [], into = [], extra = {}} = {}) {
    return {type: 'suffix', inflected, deinflected, conditionsIn: into, conditionsOut: out, stemMinLength: min, stemCharacters: STEM, ...extra};
}
function prefix(inflected, deinflected, {min = 2, out = [], into = [], extra = {}} = {}) {
    return {type: 'prefix', inflected, deinflected, conditionsIn: into, conditionsOut: out, stemMinLength: min, stemStartsWith: STEM, ...extra};
}
function whole(inflected, deinflected, {out = [], into = []} = {}) {
    return {type: 'wholeWord', inflected, deinflected, conditionsIn: into, conditionsOut: out};
}
function cross(prefixes, suffixes, {min = 2, out = V_OUT, into = V_IN, extra = {}} = {}) {
    const rule = {type: 'circumfix', prefixes, suffixes, conditionsIn: into, conditionsOut: out, stemCharacters: STEM, ...extra};
    if (min > 0) { rule.stemMinLength = min; }
    return rule;
}
// The hollow-verb stem change: the last و or ي before the final consonant
// becomes ا (يقول -> قال, يستطيع -> استطاع).
const HOLLOW = {from: ['و', 'ي'], to: 'ا', occurrence: 'last', between: STEM, betweenMinLength: 1};

const transforms = [];
function transform(id, name, description, rules, more = {}) {
    transforms.push({id, name, description, source: 'own', ...more, rules});
}

// ---------------------------------------------------------------- proclitics
// One-letter words written together with the next word. Each is its own
// transform, so a chain shows each one (وبالكتاب: و, بـ, الـ). Their outputs
// have no conditions, so they chain in any order; the minimum stem keeps
// them off short words (وَ in ولد is not removed from a one-letter stem).
transform('wa', 'و (and)', 'The conjunction وَ (wa, "and") written together with the next word: وكتب is و + كتب, والكتاب is و + الكتاب.', [
    prefix('و', ''),
]);
transform('fa', 'ف (so, then)', 'The conjunction فَ (fa, "so, then") written together with the next word: فقال is ف + قال.', [
    prefix('ف', ''),
]);
transform('bi', 'بـ (with, in, by)', 'The preposition بِ (bi, "with, in, by") written together with the next word: بالقلم is بـ + القلم, بيده is بـ + يده.', [
    prefix('ب', ''),
]);
transform('ka', 'كـ (like, as)', 'The preposition كَ (ka, "like, as") written together with the next word: كالبحر is كـ + البحر.', [
    prefix('ك', ''),
]);
transform('li', 'لـ (for, to)', 'The preposition or particle لِ (li, "for, to, so that") written together with the next word: لمحمد is لـ + محمد, ليكتب is لـ + يكتب. Before الـ the alif of the article is not written: للبيت is لـ + البيت, and before a word that starts with ل only two lams are written: لله is لـ + الله, لليل is لـ + الليل.', [
    prefix('ل', ''),
    prefix('لل', 'ال'),
    prefix('لل', 'الل', {min: 1}),
]);
transform('al', 'الـ (the)', 'The definite article الـ (al-, "the"): الكتاب is الـ + كتاب.', [
    prefix('ال', ''),
]);
transform('sa', 'سـ (will)', 'The future prefix سَ (sa-, "will") before a present-tense verb: سيكتب is سـ + يكتب, سأذهب is سـ + أذهب.', [
    prefix('س', '', {min: 3, out: ['v', 'vf'], extra: {stemStartsWith: '[يتنأ]'}}),
]);

// ------------------------------------------------------------ pronoun suffixes
// The attached pronouns. Each has the plain rule and the rules for the
// endings a word changes before a pronoun:
// - ة is written ت (مدرسته -> مدرسة);
// - final ى is written ا (معناه -> معنى, رماه -> رمى);
// - final hamza takes the seat of its case vowel (سماؤه, سمائه -> سماء);
// - a verb's ـوا loses its alif (كتبوه -> كتبوا) and ـتم becomes ـتمو
//   (كتبتموه -> كتبتم), and the ـتِ of "you (f.)" is written ـتي (كتبتيه).
// Particles take them too: عنه, منها, إنه are the plain rule; the one-letter
// prepositions بـ and لـ (به, لها) and على, إلى, لدى, whose ى is written ي
// (عليه), are listed whole.
const PRONOUNS = [
    ['p1s', 'ـي (my, me)', 'ي', 'my (and me after a preposition)', 'كتابي is كتاب + ـي, مني is من + ـي'],
    ['p1sObj', 'ـني (me)', 'ني', 'me, after a verb or إنّ and its sisters', 'علمني is علم + ـني, إنني is إن + ـني'],
    ['p1p', 'ـنا (our, us)', 'نا', 'our, us', 'بيتنا is بيت + ـنا'],
    ['p2s', 'ـك (your, you)', 'ك', 'your, you (one person)', 'كتابك is كتاب + ـك'],
    ['p2d', 'ـكما (your, you two)', 'كما', 'your, you (two)', 'بيتكما is بيت + ـكما'],
    ['p2mp', 'ـكم (your, you)', 'كم', 'your, you (plural)', 'بيتكم is بيت + ـكم'],
    ['p2fp', 'ـكن (your, you f.)', 'كن', 'your, you (feminine plural)', 'بيتكن is بيت + ـكن'],
    ['p3ms', 'ـه (his, him, it)', 'ه', 'his, him, its, it', 'كتابه is كتاب + ـه, كتبه is كتب + ـه'],
    ['p3fs', 'ـها (her, it)', 'ها', 'her, its, it', 'بيتها is بيت + ـها'],
    ['p3d', 'ـهما (their, them two)', 'هما', 'their, them (two)', 'بيتهما is بيت + ـهما'],
    ['p3mp', 'ـهم (their, them)', 'هم', 'their, them', 'بيتهم is بيت + ـهم'],
    ['p3fp', 'ـهن (their, them f.)', 'هن', 'their, them (feminine plural)', 'بيتهن is بيت + ـهن'],
];
for (const [id, name, p, gloss, example] of PRONOUNS) {
    const rules = [
        suffix(p, ''),
        suffix('ؤ' + p, 'ء'), suffix('ئ' + p, 'ء'), suffix('ؤ' + p, 'أ'), suffix('ئ' + p, 'أ'),
        suffix('ا' + p, 'ى'),
    ];
    if (p !== 'ني') {
        rules.push(suffix('ت' + p, 'ة'));
    }
    if (p !== 'ي') {
        // Verbs: only an object pronoun.
        rules.push(suffix('و' + p, 'وا', {min: 3, out: ['v', 'vf']}));
        rules.push(suffix('تمو' + p, 'تم', {out: ['v', 'vf']}));
        rules.push(suffix('آ' + p, 'أى', {min: 1, out: V_OUT}));
        if (p !== 'ني') {
            rules.push(suffix('تي' + p, 'ت', {out: ['v', 'vf']}));
        }
    }
    if (p !== 'ني') {
        rules.push(whole('ب' + p, 'ب'), whole('ل' + p, 'ل'));
        for (const [stem, lemma] of [['علي', 'على'], ['إلي', 'إلى'], ['الي', 'إلى'], ['لدي', 'لدى']]) {
            rules.push(whole(stem + (p === 'ي' ? '' : p), lemma));
        }
    }
    transform(id, name, `The attached pronoun ـ${p} (${gloss}): ${example}.`, rules);
}

// --------------------------------------------------------- nouns and adjectives
transform('feminine', 'feminine (ـة)', 'The feminine ending ـة of an adjective or a noun for a person: كبيرة is كبير + ـة, عربية is عربي + ـة.', [
    suffix('ة', ''),
]);
transform('accusative', 'accusative (ـًا)', 'The indefinite accusative ending ـًا, written with an alif: كتابًا (كتابا), شكرًا, شيئًا (شيئا, from شيء). Words that end in ة, ى or ا take no alif.', [
    suffix('ا', '', {extra: {stemNotEndsWith: '[اةى]'}}),
    suffix('ئا', 'ء'),
]);
transform('dual', 'dual (ـان)', 'The dual ending ـان (nominative): كتابان is two of كتاب, مدرستان of مدرسة, مستشفيان of مستشفى, عصوان of عصا, صحراوان of صحراء.', [
    suffix('ان', ''),
    suffix('تان', 'ة'),
    suffix('يان', 'ى'),
    suffix('وان', 'ا'),
    suffix('اوان', 'اء'),
    suffix('آن', 'أ'),
]);
transform('oblique', 'dual or plural (ـين)', 'The ending ـين, the dual (ـَيْن) or the masculine plural (ـِين) after a preposition or as an object: كتابين is two of كتاب, معلمين is معلم in the plural, مدرستين is two of مدرسة, عربيين is عربي in the dual or plural.', [
    suffix('ين', ''),
    suffix('تين', 'ة'),
    suffix('يين', 'ى'),
    suffix('وين', 'ا'),
    suffix('اوين', 'اء'),
]);
transform('pluralMasc', 'plural (ـون)', 'The masculine sound plural ending ـون (nominative): معلمون is معلم in the plural.', [
    suffix('ون', ''),
]);
transform('construct', 'construct (ـو)', 'The ending ـو of a masculine plural before the word it belongs to (معلمو المدرسة, "the school\'s teachers"), and of أبو and أخو.', [
    suffix('و', ''),
]);
transform('pluralFem', 'plural (ـات)', 'The feminine sound plural ending ـات: معلمات is معلمة in the plural, سيارات of سيارة, امتحانات of امتحان, مستشفيات of مستشفى, سنوات of سنة, سماوات of سماء, منشآت of منشأة.', [
    suffix('ات', 'ة'),
    suffix('ات', ''),
    suffix('يات', 'ى'),
    suffix('وات', 'ة'),
    suffix('اوات', 'اء'),
    suffix('آت', 'أة'),
]);

// --------------------------------------------------------------------- verbs
// A verb's dictionary form is its past tense "he" form (كتب, قال, رمى,
// استخدم). Unvowelled, the persons of each tense are spelled by a few
// endings, so each transform below is one tense and person, and holds the
// rules for every kind of root:
// - sound and hamzated verbs add the ending (كتبت, قرأت);
// - doubled verbs write both consonants before an ending that starts with a
//   consonant (مددت -> مد);
// - hollow verbs (قال, باع, نام; أقام, اختار, استطاع) lose the ا of the
//   dictionary form before such an ending (قلت -> قال) and in the short
//   jussive and imperative (يقل, قل), and write و or ي in the present
//   (يقول, يبيع, يستطيع);
// - defective verbs end in ا (دعا: دعوت, يدعو), ى (رمى, أعطى, اشترى: رميت,
//   يرمي) or ي (نسي: ينسى), and lose that letter in the jussive (يدع, يرم,
//   ينس);
// - in the present the person prefix replaces the أ of form IV (يكرم ->
//   أكرم), the ا of forms VII-X (يستخدم -> استخدم) and the و of verbs like
//   وصل (يصل).
// The rules read one word: their stem is Arabic letters only.

const CONSONANT_ENDINGS = ['ت', 'نا', 'تم', 'تما', 'تن', 'ن'];

function pastRules(ending, {defectiveA = [], defectiveY = [], defectiveI = [], hamza = [], consonant = false, min = 2}) {
    const rules = [suffix(ending, '', {min, into: V_IN, out: V_OUT})];
    for (const [i, d] of defectiveA) { rules.push(suffix(i, d, {into: V_IN, out: V_OUT})); }
    for (const [i, d] of defectiveY) { rules.push(suffix(i, d, {into: V_IN, out: V_OUT})); }
    for (const [i, d] of defectiveI) { rules.push(suffix(i, d, {into: V_IN, out: V_OUT})); }
    for (const [i, d, m = 1] of hamza) { rules.push(suffix(i, d, {min: m, into: V_IN, out: V_OUT})); }
    if (consonant) {
        // Hollow: the ا of the dictionary form returns before the last consonant.
        for (const c of RADICALS) { rules.push(suffix(c + ending, 'ا' + c, {min: 1, into: V_IN, out: V_OUT})); }
        // Doubled: both consonants are written.
        for (const c of RADICALS) { rules.push(suffix(c + c + ending, c, {min: 1, into: V_IN, out: V_OUT})); }
    }
    return rules;
}

transform('pastI', 'past (I, you, she)', 'The past tense ending ـت: كتبتُ "I wrote", كتبتَ and كتبتِ "you wrote", كتبتْ "she wrote" (all كتبت). Hollow verbs: قلت -> قال, but قالت "she said"; defective verbs: دعوت -> دعا, رميت -> رمى, and دعت, رمت "she called, threw".', [
    ...pastRules('ت', {
        defectiveA: [['وت', 'ا'], ['ت', 'ا']], defectiveY: [['يت', 'ى'], ['ت', 'ى']],
        hamza: [['ئت', 'اء']], consonant: true,
    }),
    // A last ت merges with the ending (متّ -> مات).
    suffix('ت', 'ات', {min: 1, into: V_IN, out: V_OUT}),
    whole('لست', 'ليس', {into: V_IN, out: V_OUT}),
]);
transform('pastTheyTwo', 'past (they two)', 'The past tense ending ـا "they (two) did": كتبا, دعوا (from دعا), رميا (from رمى), قرآ (from قرأ).', [
    ...pastRules('ا', {defectiveA: [['وا', 'ا']], defectiveY: [['يا', 'ى']], hamza: [['آ', 'أ', 2]]}),
]);
transform('pastTheyTwoF', 'past (they f. two)', 'The past tense ending ـتا "they (two women) did": كتبتا, دعتا (from دعا), رمتا (from رمى).', [
    ...pastRules('تا', {defectiveA: [['تا', 'ا']], defectiveY: [['تا', 'ى']]}),
]);
transform('pastThey', 'past (they)', 'The past tense ending ـوا "they did": كتبوا, قالوا; دعوا (from دعا), رموا (from رمى), نسوا (from نسي), قرؤوا (from قرأ), جاؤوا (from جاء).', [
    ...pastRules('وا', {
        defectiveA: [['وا', 'ا']], defectiveY: [['وا', 'ى']], defectiveI: [['وا', 'ي']],
        hamza: [['ؤوا', 'أ', 2], ['ءوا', 'أ', 2], ['ؤوا', 'ء', 2]],
    }),
]);
transform('pastTheyF', 'past (they f.)', 'The past tense ending ـن "they (women) did": كتبن; قلن (from قال), مددن (from مد), دعون (from دعا), رمين (from رمى).', [
    ...pastRules('ن', {defectiveA: [['ون', 'ا']], defectiveY: [['ين', 'ى']], hamza: [['ئن', 'اء']], consonant: true}),
    suffix('ن', 'ان', {min: 1, into: V_IN, out: V_OUT}),
    whole('لسن', 'ليس', {into: V_IN, out: V_OUT}),
]);
for (const [id, ending, who, name, lis] of [
    ['pastYouTwo', 'تما', 'you (two)', 'past (you two)', 'لستما'],
    ['pastYouPl', 'تم', 'you (plural)', 'past (you pl.)', 'لستم'],
    ['pastYouFPl', 'تن', 'you (feminine plural)', 'past (you f. pl.)', 'لستن'],
]) {
    transform(id, name,
        `The past tense ending ـ${ending} "${who} did": كتب${ending}; قل${ending} (from قال), مدد${ending} (from مد), دعو${ending} (from دعا), رمي${ending} (from رمى).`, [
            ...pastRules(ending, {defectiveA: [['و' + ending, 'ا']], defectiveY: [['ي' + ending, 'ى']], hamza: [['ئ' + ending, 'اء']], consonant: true}),
            // A last ت merges with the ending (متّم -> مات, سكتّم -> سكت).
            suffix(ending, 'ات', {min: 1, into: V_IN, out: V_OUT}),
            suffix(ending, 'ت', {into: V_IN, out: V_OUT}),
            whole(lis, 'ليس', {into: V_IN, out: V_OUT}),
        ]);
}
transform('pastWe', 'past (we)', 'The past tense ending ـنا "we did": كتبنا; قلنا (from قال), كنا (from كان), مددنا (from مد), دعونا (from دعا), رمينا (from رمى). Also "us" after a verb (ـنا).', [
    ...pastRules('نا', {defectiveA: [['ونا', 'ا']], defectiveY: [['ينا', 'ى']], hamza: [['ئنا', 'اء']], consonant: true}),
    // A last ن merges with the ending (كنّا -> كان, سكنّا -> سكن).
    suffix('نا', 'ان', {min: 1, into: V_IN, out: V_OUT}),
    suffix('نا', 'ن', {into: V_IN, out: V_OUT}),
    whole('لسنا', 'ليس', {into: V_IN, out: V_OUT}),
]);

// Passive past tense, where it is spelled differently from the active.
const PASSIVE_ENDINGS = [['', 'he'], ['ت', 'she'], ['تا', 'they f. two'], ['ا', 'they two'], ['وا', 'they']];
{
    const rules = [];
    for (const [ending] of PASSIVE_ENDINGS) {
        for (const c of RADICALS) {
            // Hollow: قيل -> قال, أقيم -> أقام, اختير -> اختار.
            rules.push(suffix('ي' + c + ending, 'ا' + c, {min: 1, into: V_IN, out: V_OUT}));
            // Hamza in the middle: سئل -> سأل.
            rules.push(suffix('ئ' + c + ending, 'أ' + c, {min: 1, into: V_IN, out: V_OUT}));
        }
    }
    // Defective: رمي -> رمى, دعي -> دعا, أعطي -> أعطى; دعيت -> دعا.
    rules.push(suffix('ي', 'ى', {into: V_IN, out: V_OUT}), suffix('ي', 'ا', {into: V_IN, out: V_OUT}));
    rules.push(suffix('يت', 'ا', {into: V_IN, out: V_OUT}), suffix('يا', 'ا', {into: V_IN, out: V_OUT}));
    // Form III and VI: كوتب -> كاتب, تقوبل -> تقابل.
    const formThree = [];
    for (const c of RADICALS) { formThree.push([c + 'و', c + 'ا'], ['ت' + c + 'و', 'ت' + c + 'ا']); }
    rules.push(cross(formThree, [['', ''], ...['ت', 'تا', 'ا', 'وا', ...CONSONANT_ENDINGS.filter((e) => e !== 'ت')].map((e) => [e, ''])]));
    transform('pastPassive', 'past passive', 'The passive past tense where it is spelled differently from the active: قيل "it was said" (قال), أقيم (أقام), اختير (اختار), سئل (سأل), رمي (رمى), دعي (دعا), كوتب (كاتب), with the endings ـت, ـتا, ـا and ـوا.', rules);
}

// The present tense. Person prefixes, each with what it replaces at the start
// of the dictionary form: nothing (form I, II, III, V, VI), the أ of form IV,
// the ا of forms VII-X, the و of verbs like وصل; ؤ after the prefix is the
// hamza of أكد and آمن (يؤكد, يؤمن).
function personPrefixes(p) {
    if (p === 'أ') {
        // I: أكرمُ is the dictionary form itself, so أ never gives أ; آكل is أ + أكل.
        return [['أ', ''], ['أ', 'ا'], ['أ', 'و'], ['أؤ', 'آ'], ['أؤ', 'أ'], ['أؤا', 'آ'], ['آ', 'أ']];
    }
    return [[p, ''], [p, 'أ'], [p, 'ا'], [p, 'و'], [p + 'ؤ', 'آ'], [p + 'ؤ', 'أ'], [p + 'ؤا', 'آ']];
}
const PRESENT = {
    ي: personPrefixes('ي'), ت: personPrefixes('ت'), أ: personPrefixes('أ'), ن: personPrefixes('ن'),
};

// The endings of each person, and the dictionary-form ending each gives for
// the kinds of root (sound, ا, ى, ي, hamza, جاء).
function presentRules(prefixes, ending, {defective = [], hamza = [], hollow = true, short = false} = {}) {
    const rules = [cross(prefixes, [[ending, '']])];
    if (defective.length > 0) { rules.push(cross(prefixes, defective)); }
    if (hamza.length > 0) { rules.push(cross(prefixes, hamza, {min: 1})); }
    if (hollow) { rules.push(cross(prefixes, [[ending, '']], {extra: {stemChange: HOLLOW}})); }
    if (short) {
        // Hollow verbs without their long vowel (يقل, يقلن) and doubled verbs
        // with both consonants (يمدد, يمددن).
        rules.push(cross(prefixes, RADICALS.map((c) => [c + ending, 'ا' + c]), {min: 1}));
        rules.push(cross(prefixes, RADICALS.map((c) => [c + c + ending, c]), {min: 1}));
    }
    return rules;
}

const SEE = 'رأى';
function seeRules(prefixes, endings) {
    // رأى drops its hamza in the present: يرى, ترون, ير.
    return [cross(prefixes.filter(([, d]) => d === ''), endings.map((e) => [e, SEE]), {min: 0, extra: {stemCharacters: '[]'}})];
}

const PRESENT_PERSONS = [
    ['presentHe', 'present (he)', 'ي', 'he does', 'يكتب', ['رى']],
    ['presentSheYou', 'present (she, you)', 'ت', 'she does, you (one man) do', 'تكتب', ['رى']],
    ['presentI', 'present (I)', 'أ', 'I do', 'أكتب', ['رى']],
    ['presentWe', 'present (we)', 'ن', 'we do', 'نكتب', ['رى']],
];
for (const [id, name, p, gloss, example, see] of PRESENT_PERSONS) {
    transform(id, name, `The present tense "${gloss}", which is also its subjunctive and jussive: ${example} (كتب); يقول (قال), يدعو (دعا), يرمي (رمى), ينسى (نسي), يكرم (أكرم), يستخدم (استخدم), يصل (وصل), يرى (رأى).`, [
        ...presentRules(PRESENT[p], '', {defective: [['و', 'ا'], ['ي', 'ى'], ['ى', 'ي'], ['ى', 'ا']], hamza: [['أ', 'ئ']]}),
        ...seeRules(PRESENT[p], see),
    ]);
}
for (const [id, name, p, gloss, example] of [
    ['jussiveHe', 'jussive (he)', 'ي', 'he', 'لم يقل'],
    ['jussiveSheYou', 'jussive (she, you)', 'ت', 'she, you (one man)', 'لا تقل'],
    ['jussiveI', 'jussive (I)', 'أ', 'I', 'لم أقل'],
    ['jussiveWe', 'jussive (we)', 'ن', 'we', 'لم نقل'],
]) {
    transform(id, name, `The short jussive "${gloss}" after لم, لا, لـ and in conditions, where a hollow, defective or doubled verb loses a letter or writes both consonants: ${example} (قال), يدع (دعا), يرم (رمى), ينس (نسي), يمدد (مد), يشأ (شاء), ير (رأى).`, [
        cross(PRESENT[p], [['', 'ا'], ['', 'ى'], ['', 'ي']]),
        cross(PRESENT[p], [['أ', 'اء'], ['ئ', 'اء']], {min: 1}),
        cross(PRESENT[p], RADICALS.map((c) => [c, 'ا' + c]), {min: 1}),
        cross(PRESENT[p], RADICALS.map((c) => [c + c, c]), {min: 1}),
        ...seeRules(PRESENT[p], ['ر']),
    ]);
}
const BOTH = [...PRESENT['ي'], ...PRESENT['ت']];
transform('presentTheyTwo', 'present (they two)', 'The present tense ending يـان "they (two) do": يكتبان; يقولان (قال), يدعوان (دعا), يرميان (رمى), ينسيان (نسي), يقرآن (قرأ).', [
    ...presentRules(PRESENT['ي'], 'ان', {defective: [['وان', 'ا'], ['يان', 'ى'], ['يان', 'ي']], hamza: [['آن', 'أ'], ['يئان', 'اء']]}),
    ...seeRules(PRESENT['ي'], ['ريان']),
]);
transform('presentYouTwo', 'present (you two, they f. two)', 'The present tense ending تـان "you (two) do, they (two women) do": تكتبان; تقولان (قال), تدعوان (دعا), ترميان (رمى).', [
    ...presentRules(PRESENT['ت'], 'ان', {defective: [['وان', 'ا'], ['يان', 'ى'], ['يان', 'ي']], hamza: [['آن', 'أ'], ['يئان', 'اء']]}),
    ...seeRules(PRESENT['ت'], ['ريان']),
]);
for (const [id, name, p, gloss, example] of [
    ['presentThey', 'present (they)', 'ي', 'they do', 'يكتبون'],
    ['presentYouPl', 'present (you pl.)', 'ت', 'you (plural) do', 'تكتبون'],
]) {
    transform(id, name, `The present tense ending ${p}ـون "${gloss}": ${example}; يقولون (قال), يدعون (دعا), يرمون (رمى), ينسون (نسي), يقرؤون (قرأ), يجيئون (جاء), يرون (رأى).`, [
        ...presentRules(PRESENT[p], 'ون', {defective: [['ون', 'ا'], ['ون', 'ى'], ['ون', 'ي']], hamza: [['ؤون', 'أ'], ['ءون', 'أ'], ['يئون', 'اء']]}),
        ...seeRules(PRESENT[p], ['رون']),
    ]);
}
for (const [id, name, p, gloss, example] of [
    ['presentTheyF', 'present (they f.)', 'ي', 'they (women) do', 'يكتبن'],
    ['presentYouFPl', 'present (you f. pl.)', 'ت', 'you (women) do', 'تكتبن'],
]) {
    transform(id, name, `The present tense ending ${p}ـن "${gloss}": ${example}; يقلن (قال), يمددن (مد), يدعون (دعا), يرمين (رمى), ينسين (نسي), يرين (رأى).`, [
        ...presentRules(PRESENT[p], 'ن', {defective: [['ون', 'ا'], ['ين', 'ى'], ['ين', 'ي']], hamza: [['ئن', 'اء']], hollow: false, short: true}),
        ...seeRules(PRESENT[p], ['رين']),
    ]);
}
transform('presentYouF', 'present (you f.)', 'The present tense ending تـين "you (one woman) do": تكتبين; تقولين (قال), تدعين (دعا), ترمين (رمى), تنسين (نسي), تقرئين (قرأ), ترين (رأى).', [
    ...presentRules(PRESENT['ت'], 'ين', {defective: [['ين', 'ا'], ['ين', 'ى'], ['ين', 'ي']], hamza: [['ئين', 'أ'], ['يئين', 'اء']]}),
    ...seeRules(PRESENT['ت'], ['رين']),
]);
transform('subjunctiveTheyTwo', 'subjunctive (they two)', 'The subjunctive and jussive ending يـا "they (two)": لن يكتبا; يقولا (قال), يدعوا (دعا), يرميا (رمى), يقرآ (قرأ).', [
    ...presentRules(PRESENT['ي'], 'ا', {defective: [['وا', 'ا'], ['يا', 'ى'], ['يا', 'ي']], hamza: [['آ', 'أ']]}),
    ...seeRules(PRESENT['ي'], ['ريا']),
]);
transform('subjunctiveYouTwo', 'subjunctive (you two, they f. two)', 'The subjunctive and jussive ending تـا "you (two), they (two women)": لن تكتبا; تقولا (قال), تدعوا (دعا), ترميا (رمى).', [
    ...presentRules(PRESENT['ت'], 'ا', {defective: [['وا', 'ا'], ['يا', 'ى'], ['يا', 'ي']], hamza: [['آ', 'أ']]}),
    ...seeRules(PRESENT['ت'], ['ريا']),
]);
for (const [id, name, p, gloss, example] of [
    ['subjunctiveThey', 'subjunctive (they)', 'ي', 'they', 'لن يكتبوا'],
    ['subjunctiveYouPl', 'subjunctive (you pl.)', 'ت', 'you (plural)', 'لن تكتبوا'],
]) {
    transform(id, name, `The subjunctive and jussive ending ${p}ـوا "${gloss}": ${example}; يقولوا (قال), يدعوا (دعا), يرموا (رمى), ينسوا (نسي), يقرؤوا (قرأ), يروا (رأى).`, [
        ...presentRules(PRESENT[p], 'وا', {defective: [['وا', 'ا'], ['وا', 'ى'], ['وا', 'ي']], hamza: [['ؤوا', 'أ'], ['ءوا', 'أ'], ['يئوا', 'اء']]}),
        ...seeRules(PRESENT[p], ['روا']),
    ]);
}
transform('subjunctiveYouF', 'subjunctive (you f.)', 'The subjunctive and jussive ending تـي "you (one woman)": لن تكتبي; تقولي (قال), تدعي (دعا), ترمي (رمى), تقرئي (قرأ), تري (رأى).', [
    ...presentRules(PRESENT['ت'], 'ي', {defective: [['ي', 'ا'], ['ي', 'ى']], hamza: [['ئي', 'أ'], ['يئي', 'اء']]}),
    ...seeRules(PRESENT['ت'], ['ري']),
]);

// The imperative. Form I starts with ا (اكتب); the other forms are spelled
// like the dictionary form (كلّم, أكرم, استخدم), so only their endings are
// removed. Hollow verbs drop their long vowel before no ending or ـن (قل,
// قلن) and keep it before the others (قولي); verbs like وصل drop their و
// (صل, قف, ضع).
const FORM_I = [['ا', '']];
const ASSIMILATED = [['', 'و']];
function imperativeRules(ending, {defective = [], others = [], hollowShort = false, assimilated = true} = {}) {
    const rules = [cross(FORM_I, [[ending, '']], {min: 3})];
    if (defective.length > 0) { rules.push(cross(FORM_I, defective)); }
    if (assimilated) { rules.push(cross(ASSIMILATED, [[ending, '']], {min: 2})); }
    if (hollowShort) {
        for (const c of RADICALS) { rules.push(suffix(c + ending, 'ا' + c, {min: 1, into: V_IN, out: V_OUT})); }
        rules.push(cross(FORM_I, RADICALS.map((c) => [c + c + ending, c]), {min: 1}));
    } else {
        rules.push(suffix(ending, '', {into: V_IN, out: V_OUT, extra: {stemChange: HOLLOW}}));
    }
    for (const [i, d, m = 3] of others) { rules.push(suffix(i, d, {min: m, into: V_IN, out: V_OUT})); }
    return rules;
}
transform('imperativeYou', 'imperative (you)', 'The imperative "do!" to one man: اكتب (كتب), قل (قال), ادع (دعا), ارم (رمى), انس (نسي), امدد (مد), قف (وقف), أعط (أعطى), اشتر (اشترى), كل (أكل), خذ (أخذ), مر (أمر), ر (رأى).', [
    ...imperativeRules('', {defective: [['', 'ا'], ['', 'ى'], ['', 'ي']], hollowShort: true, others: [['', 'ى']]}),
    ...[['كل', 'أكل'], ['خذ', 'أخذ'], ['مر', 'أمر'], ['ر', SEE], ['ائت', 'أتى'], ['جئ', 'جاء']].map(([i, d]) => whole(i, d, {into: V_IN, out: V_OUT})),
]);
transform('imperativeYouF', 'imperative (you f.)', 'The imperative "do!" to one woman, ending in ـي: اكتبي (كتب), قولي (قال), ادعي (دعا), ارمي (رمى), قفي (وقف), علمي (علم), أعطي (أعطى), كلي (أكل), ري (رأى).', [
    ...imperativeRules('ي', {defective: [['ي', 'ا'], ['ي', 'ى']], others: [['ي', '', 2], ['ي', 'ى']]}),
    ...[['كلي', 'أكل'], ['خذي', 'أخذ'], ['مري', 'أمر'], ['ري', SEE]].map(([i, d]) => whole(i, d, {into: V_IN, out: V_OUT})),
]);
transform('imperativeYouTwo', 'imperative (you two)', 'The imperative "do!" to two people, ending in ـا: اكتبا (كتب), قولا (قال), ادعوا (دعا), ارميا (رمى).', [
    ...imperativeRules('ا', {defective: [['وا', 'ا'], ['يا', 'ى'], ['يا', 'ي']]}),
    ...[['كلا', 'أكل'], ['خذا', 'أخذ'], ['مرا', 'أمر'], ['ريا', SEE]].map(([i, d]) => whole(i, d, {into: V_IN, out: V_OUT})),
]);
transform('imperativeYouPl', 'imperative (you pl.)', 'The imperative "do!" to several people, ending in ـوا: اكتبوا (كتب), قولوا (قال), ادعوا (دعا), ارموا (رمى), انسوا (نسي), قفوا (وقف), كلوا (أكل), روا (رأى).', [
    ...imperativeRules('وا', {defective: [['وا', 'ا'], ['وا', 'ى'], ['وا', 'ي']]}),
    ...[['كلوا', 'أكل'], ['خذوا', 'أخذ'], ['مروا', 'أمر'], ['روا', SEE]].map(([i, d]) => whole(i, d, {into: V_IN, out: V_OUT})),
]);
transform('imperativeYouFPl', 'imperative (you f. pl.)', 'The imperative "do!" to several women, ending in ـن: اكتبن (كتب), قلن (قال), ادعون (دعا), ارمين (رمى).', [
    ...imperativeRules('ن', {defective: [['ون', 'ا'], ['ين', 'ى'], ['ين', 'ي']], hollowShort: true}),
]);

// ----------------------------------------------- participles and verbal nouns
// Derivation rather than inflection, and dictionaries list most of these words
// on their own, so both transforms are optional (the derivedForms setting).
{
    const rules = [];
    // Forms II-X: م replaces the person prefix (مستخدم, يستخدم -> استخدم).
    rules.push(prefix('م', '', {min: 3, out: V_OUT}), prefix('م', 'أ', {min: 3, out: V_OUT}), prefix('م', 'ا', {min: 3, out: V_OUT}));
    rules.push(cross([['م', 'أ'], ['م', 'ا']], [['', '']], {into: [], extra: {stemChange: HOLLOW}}));
    rules.push(cross([['م', ''], ['م', 'أ'], ['م', 'ا']], [['', 'ى'], ['ي', 'ى']], {into: []}));
    // Form I active فاعل: كاتب -> كتب, قائل -> قال, داع -> دعا, رام -> رمى.
    rules.push(cross(RADICALS.map((c) => [c + 'ا', c]), [['', ''], ['ي', 'ى'], ['ي', 'ا']], {into: []}));
    rules.push(cross(RADICALS.map((c) => [c + 'ا', c]), [['', 'ا'], ['', 'ى']], {min: 1, into: []}));
    rules.push(cross(RADICALS.map((c) => [c + 'ائ', c + 'ا']), [['', '']], {min: 1, into: []}));
    // Form I passive مفعول: مكتوب -> كتب, مقول -> قال, مبيع -> باع, مدعو -> دعا, مرمي -> رمى.
    rules.push(cross([['م', '']], RADICALS.map((c) => ['و' + c, c]), {into: []}));
    rules.push(cross([['م', '']], RADICALS.flatMap((c) => [['و' + c, 'ا' + c], ['ي' + c, 'ا' + c]]), {min: 1, into: []}));
    rules.push(cross([['م', '']], [['و', 'ا'], ['ي', 'ى']], {into: []}));
    transform('participle', 'participle', 'An active or passive participle read as its verb: كاتب and مكتوب (كتب), قائل and مقول (قال), مستخدم (استخدم), مقيم (أقام), معط (أعطى). Off unless the derivedForms setting is on.', rules, {optional: true});
}
{
    const rules = [];
    // II تفعيل, تفعية: تكليم -> كلم, تسمية -> سمى.
    rules.push(cross([['ت', '']], RADICALS.map((c) => ['ي' + c, c]), {into: []}));
    rules.push(cross([['ت', '']], [['ية', 'ى']], {into: []}));
    // III مفاعلة: مساعدة -> ساعد.
    rules.push(cross([['م', '']], [['ة', '']], {min: 3, into: []}));
    // IV إفعال, إفالة, إفعاء: إكرام -> أكرم, إقامة -> أقام, إعطاء -> أعطى.
    rules.push(cross([['إ', 'أ']], RADICALS.map((c) => ['ا' + c, c]), {into: []}));
    rules.push(cross([['إ', 'أ']], RADICALS.map((c) => ['ا' + c + 'ة', 'ا' + c]), {min: 1, into: []}));
    rules.push(cross([['إ', 'أ']], [['اء', 'ى']], {into: []}));
    // VII-X انفعال, افتعال, استفعال: انكسار -> انكسر, اجتماع -> اجتمع, استخدام -> استخدم,
    // استقالة -> استقال, انتهاء -> انتهى, استدعاء -> استدعى.
    rules.push(cross([['ا', 'ا']], RADICALS.map((c) => ['ا' + c, c]), {min: 3, into: []}));
    rules.push(cross([['ا', 'ا']], [['اء', 'ى']], {min: 3, into: []}));
    rules.push(cross([['است', 'است']], RADICALS.map((c) => ['ا' + c + 'ة', 'ا' + c]), {min: 1, into: []}));
    transform('verbalNoun', 'verbal noun', 'The verbal noun of a derived verb read as the verb: تكليم (كلم), مساعدة (ساعد), إكرام (أكرم), إقامة (أقام), اجتماع (اجتمع), استخدام (استخدم), استقالة (استقال), انتهاء (انتهى). Off unless the derivedForms setting is on.', rules, {optional: true});
}

const descriptor = {schema: 1, conditions, transforms};
const out = join(dirname(fileURLToPath(import.meta.url)), 'own.json');
writeFileSync(out, formatTransforms(descriptor));
let count = 0;
for (const t of transforms) {
    for (const r of t.rules) {
        count += r.type === 'circumfix' && r.prefixes ? r.prefixes.length * r.suffixes.length : 1;
    }
}
console.log(`${out}: ${transforms.length} transforms, ${transforms.reduce((n, t) => n + t.rules.length, 0)} JSON rules, ${count} rules expanded`);
