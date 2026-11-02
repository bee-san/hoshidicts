#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes sources/own.json: English deinflection rules written for this pack
// from English grammar (docs/languages.md, section 14 step 2), before
// Yomitan's English rules were read. Run from anywhere:
//
//   node languages/en/sources/own-rules.mjs
//
// Conditions follow the dictionary tags of Yomitan-format English
// dictionaries (kaikki-to-yomitan writes `n`, `v`, `adj`, `adv`, `name`,
// `pron`, `det`, `conj` in a term's rules). `ns` and `np` split nouns so a
// plural rule never applies to its own output. Rules whose output may be any
// word name every part of speech instead of none, so a form they make never
// matches an entry without one (the non-lemma entries of kaikki-to-yomitan
// dictionaries, which only point at their lemma).

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const conditions = {
    v: {name: 'Verb', isDictionaryForm: true},
    n: {name: 'Noun', isDictionaryForm: true, subConditions: ['ns', 'np']},
    ns: {name: 'Noun, singular', isDictionaryForm: true},
    np: {name: 'Noun, plural', isDictionaryForm: true},
    adj: {name: 'Adjective', isDictionaryForm: true},
    adv: {name: 'Adverb', isDictionaryForm: true},
    name: {name: 'Proper noun', isDictionaryForm: true},
    pron: {name: 'Pronoun', isDictionaryForm: true},
    det: {name: 'Determiner', isDictionaryForm: true},
    conj: {name: 'Conjunction', isDictionaryForm: true},
};

const words = (text) => text.trim().split(/\s+/);

// Prepositions and adverb particles of phrasal and prepositional verbs.
const particles = words(`
    about above across after against ahead along alongside among apart around as aside at away back before behind
    below beneath beside between beyond by down for forth forward forwards from home in inside into like of off on
    onto out outside over past round through throughout to together toward towards under underneath up upon with
    within without`);
// Words after an inflected verb that start the multiword verb entries of
// dictionaries: particles, articles, object pronouns, possessive determiners
// and reflexives (*kicked the bucket*, *made it*, *lost his temper*).
const phrasalFollowers = [...new Set([...particles, ...words(`
    a an the no some all any and
    it me you him her us them one something someone somebody anything anyone everything nothing
    my your his its our their
    myself yourself himself herself itself ourselves yourselves themselves oneself`)])];
// Particles that can follow the verb's object (*turn it off*, *put Mary's coat on*).
const separableParticles = words(`
    about across along apart around aside away back behind by down forth forward home in off on out over round
    through together up`);
// Words that end an object before a particle: prepositions, determiners (the
// object of *put the book on the table* is a prepositional phrase more often
// than *the book* is put on), conjunctions, auxiliaries and the particles
// themselves (*look up the word in*).
const objectGuards = [...new Set([...particles, ...words(`
    a an the my your his its our their these those every each no some any all both either neither another such
    during near since than till until via
    and or nor but so yet because if unless although though whether while when where why how what which who whom whose
    am is are was were be been being have has had do does did will would shall should can could may might must
    not never`)])];

const wordLists = {phrasalFollowers, separableParticles, objectGuards};

// Spelling: a consonant doubled before -ed, -ing, -er and -est.
const doubled = 'b d f g k l m n p r s t v z'.split(' ');
const doubledComparative = 'b d g m n p t'.split(' ');

// Irregular verbs: base | past forms | past participles (forms equal to the
// base need no rule). Prefixed compounds (understood, overcame, forgave,
// withheld, mistook, foresaw, undergone, outran) are reached by the suffix
// rules these become.
const irregularVerbs = `
    bear|bore|borne born
    beat||beaten
    begin|began|begun
    bend|bent|bent
    beseech|besought|besought
    bid|bade|bidden
    bind|bound|bound
    bite|bit|bitten
    bleed|bled|bled
    blow|blew|blown
    break|broke|broken
    breed|bred|bred
    bring|brought|brought
    build|built|built
    burn|burnt|burnt
    buy|bought|bought
    catch|caught|caught
    choose|chose|chosen
    cleave|clove cleft|cloven cleft
    cling|clung|clung
    come|came|
    creep|crept|crept
    deal|dealt|dealt
    dig|dug|dug
    dive|dove|
    do|did|done
    draw|drew|drawn
    dream|dreamt|dreamt
    drink|drank|drunk
    drive|drove|driven
    dwell|dwelt|dwelt
    eat|ate|eaten
    fall|fell|fallen
    feed|fed|fed
    feel|felt|felt
    fight|fought|fought
    find|found|found
    flee|fled|fled
    fling|flung|flung
    fly|flew|flown
    forbid|forbade forbad|forbidden
    forsake|forsook|forsaken
    freeze|froze|frozen
    get|got|got gotten
    gild|gilt|gilt
    gird|girt|girt
    give|gave|given
    go|went|gone
    grind|ground|ground
    grow|grew|grown
    hang|hung|hung
    hear|heard|heard
    hew||hewn
    hide|hid|hidden
    hold|held|held
    keep|kept|kept
    kneel|knelt|knelt
    know|knew|known
    lay|laid|laid
    lead|led|led
    lean|leant|leant
    leap|leapt|leapt
    learn|learnt|learnt
    leave|left|left
    lend|lent|lent
    lie|lay|lain
    light|lit|lit
    lose|lost|lost
    make|made|made
    mean|meant|meant
    meet|met|met
    mow||mown
    pay|paid|paid
    plead|pled|pled
    prove||proven
    rend|rent|rent
    ride|rode|ridden
    ring|rang|rung
    rise|rose|risen
    run|ran|
    saw||sawn
    say|said|said
    see|saw|seen
    seek|sought|sought
    sell|sold|sold
    send|sent|sent
    sew||sewn
    shake|shook|shaken
    shear||shorn
    shine|shone|shone
    shoe|shod|shod
    shoot|shot|shot
    show||shown
    shrink|shrank|shrunk
    sing|sang|sung
    sink|sank|sunk
    sit|sat|sat
    slay|slew|slain
    sleep|slept|slept
    slide|slid|slid
    sling|slung|slung
    slink|slunk|slunk
    smell|smelt|smelt
    smite|smote|smitten
    sow||sown
    speak|spoke spake|spoken
    speed|sped|sped
    spell|spelt|spelt
    spend|spent|spent
    spill|spilt|spilt
    spin|spun|spun
    spit|spat|spat
    spoil|spoilt|spoilt
    spring|sprang|sprung
    stand|stood|stood
    steal|stole|stolen
    stick|stuck|stuck
    sting|stung|stung
    stink|stank|stunk
    strew||strewn
    stride|strode|stridden
    strike|struck|struck stricken
    string|strung|strung
    strive|strove|striven
    swear|swore|sworn
    sweep|swept|swept
    swell||swollen
    swim|swam|swum
    swing|swung|swung
    take|took|taken
    teach|taught|taught
    tear|tore|torn
    tell|told|told
    think|thought|thought
    thrive|throve|thriven
    throw|threw|thrown
    tread|trod|trodden
    wake|woke|woken
    wear|wore|worn
    weave|wove|woven
    weep|wept|wept
    win|won|won
    wind|wound|wound
    work|wrought|wrought
    write|wrote|written
    abide|abode|abode
    chide|chid|chidden
    clothe|clad|clad
    lade||laden
    shrive|shrove|shriven`;

// Forms too short or too common as word endings for a suffix rule
// (create -> creeat, play -> plie, split -> splight): whole words only.
const wholeWordForms = new Set(['ate', 'lay', 'lit', 'bit', 'hid', 'won', 'dove']);

let ruleCount = 0;
const suffix = (inflected, deinflected, conditionsIn, conditionsOut, extra = {}) => {
    ++ruleCount;
    return {type: 'suffix', inflected, deinflected, conditionsIn, conditionsOut, ...extra};
};
const wholeWord = (inflected, deinflected, conditionsIn, conditionsOut) => {
    ++ruleCount;
    return {type: 'wholeWord', inflected, deinflected, conditionsIn, conditionsOut};
};
const phrasal = (inflected, deinflected) => {
    ++ruleCount;
    return {type: 'phrasal', inflected, deinflected, followedBy: 'phrasalFollowers', conditionsIn: [], conditionsOut: ['v']};
};

/**
 * Suffix rules for irregular forms, skipping a form a shorter rule already
 * turns into the same base (sprang by rang -> ring, swore by wore -> wear).
 */
function irregularRules(pairs, conditionsIn, conditionsOut) {
    const rules = [];
    const literal = [];
    const sorted = [...pairs].sort((a, b) => a[0].length - b[0].length || a[0].localeCompare(b[0]));
    for (const [form, base] of sorted) {
        if (form === base) { continue; }
        if (wholeWordForms.has(form)) {
            rules.push(wholeWord(form, base, conditionsIn, conditionsOut));
            continue;
        }
        const covered = literal.some(([f, b]) => form.endsWith(f) && form.slice(0, form.length - f.length) + b === base);
        if (covered) { continue; }
        literal.push([form, base]);
        rules.push(suffix(form, base, conditionsIn, conditionsOut));
    }
    return rules;
}

const verbTable = irregularVerbs.trim().split('\n').map((line) => {
    const [base, past, participle] = line.trim().split('|');
    return {base, past: past ? past.split(' ') : [], participle: participle ? participle.split(' ') : []};
});
const pastPairs = verbTable.flatMap(({base, past}) => past.map((form) => [form, base]));
// Participles that are not also the verb's past form.
const participlePairs = verbTable.flatMap(({base, past, participle}) => participle.filter((form) => !past.includes(form)).map((form) => [form, base]));

const V = ['v'];
const sEndings = (conditionsIn, conditionsOut) => [
    suffix('s', '', conditionsIn, conditionsOut, {stemMinLength: 2, stemNotEndsWith: "[sS']"}),
    suffix('ses', 's', conditionsIn, conditionsOut),
    suffix('xes', 'x', conditionsIn, conditionsOut),
    suffix('zes', 'z', conditionsIn, conditionsOut),
    suffix('zzes', 'z', conditionsIn, conditionsOut),
    suffix('ches', 'ch', conditionsIn, conditionsOut),
    suffix('shes', 'sh', conditionsIn, conditionsOut),
    suffix('oes', 'o', conditionsIn, conditionsOut),
    suffix('ies', 'y', conditionsIn, conditionsOut, {stemMinLength: 1}),
    suffix('ies', 'ey', conditionsIn, conditionsOut, {stemMinLength: 1}),
];

const pluralRules = [
    ...sEndings(['np'], ['ns']),
    // -f and -fe nouns.
    suffix('lves', 'lf', ['np'], ['ns']),
    suffix('arves', 'arf', ['np'], ['ns']),
    suffix('eaves', 'eaf', ['np'], ['ns']),
    suffix('oaves', 'oaf', ['np'], ['ns']),
    suffix('ooves', 'oof', ['np'], ['ns']),
    suffix('nives', 'nife', ['np'], ['ns']),
    suffix('wives', 'wife', ['np'], ['ns']),
    suffix('lives', 'life', ['np'], ['ns']),
    suffix('thieves', 'thief', ['np'], ['ns']),
    suffix('turves', 'turf', ['np'], ['ns']),
    // Irregular plurals, with their compounds (women, grandchildren, salespeople, woodlice).
    suffix('men', 'man', ['np'], ['ns']),
    suffix('children', 'child', ['np'], ['ns']),
    suffix('feet', 'foot', ['np'], ['ns']),
    suffix('teeth', 'tooth', ['np'], ['ns']),
    suffix('geese', 'goose', ['np'], ['ns']),
    suffix('mice', 'mouse', ['np'], ['ns']),
    suffix('lice', 'louse', ['np'], ['ns']),
    suffix('oxen', 'ox', ['np'], ['ns']),
    suffix('people', 'person', ['np'], ['ns']),
    wholeWord('dice', 'die', ['np'], ['ns']),
    wholeWord('pence', 'penny', ['np'], ['ns']),
    wholeWord('brethren', 'brother', ['np'], ['ns']),
    // Latin and Greek plurals.
    suffix('i', 'us', ['np'], ['ns'], {stemMinLength: 2}),
    suffix('i', 'o', ['np'], ['ns'], {stemMinLength: 3}),
    suffix('a', 'um', ['np'], ['ns'], {stemMinLength: 2}),
    suffix('a', 'on', ['np'], ['ns'], {stemMinLength: 3}),
    suffix('ae', 'a', ['np'], ['ns'], {stemMinLength: 2}),
    suffix('mata', 'ma', ['np'], ['ns']),
    suffix('ices', 'ex', ['np'], ['ns'], {stemMinLength: 1}),
    suffix('ices', 'ix', ['np'], ['ns'], {stemMinLength: 1}),
    suffix('ses', 'sis', ['np'], ['ns'], {stemMinLength: 1}),
    wholeWord('axes', 'axis', ['np'], ['ns']),
    suffix('eaux', 'eau', ['np'], ['ns']),
    wholeWord('cherubim', 'cherub', ['np'], ['ns']),
    wholeWord('seraphim', 'seraph', ['np'], ['ns']),
    // Hyphenated compounds pluralised on their first part.
    suffix('s-in-law', '-in-law', ['np'], ['ns']),
    suffix('s-by', '-by', ['np'], ['ns']),
    suffix('s-up', '-up', ['np'], ['ns']),
    suffix('s-on', '-on', ['np'], ['ns']),
    suffix('s-general', '-general', ['np'], ['ns']),
    suffix('s-martial', '-martial', ['np'], ['ns']),
    suffix('s-in-waiting', '-in-waiting', ['np'], ['ns']),
    suffix('ies-in-waiting', 'y-in-waiting', ['np'], ['ns']),
    suffix('men-of-war', 'man-of-war', ['np'], ['ns']),
    suffix('men-at-arms', 'man-at-arms', ['np'], ['ns']),
];

const thirdPersonRules = [
    ...sEndings([], V),
    suffix('sses', 's', [], V, {stemMinLength: 1}),
    wholeWord('is', 'be', [], V),
    wholeWord('has', 'have', [], V),
];

const presentRules = [
    wholeWord('am', 'be', [], V),
    wholeWord('are', 'be', [], V),
];

const pastRules = [
    suffix('ed', '', [], V, {stemMinLength: 2}),
    suffix('d', '', [], V, {stemMinLength: 3, stemEndsWith: '[e]'}),
    suffix('ied', 'y', [], V, {stemMinLength: 1}),
    ...doubled.map((c) => suffix(`${c}${c}ed`, c, [], V, {stemMinLength: 1})),
    suffix('cked', 'c', [], V, {stemMinLength: 1}),
    wholeWord('was', 'be', [], V),
    wholeWord('were', 'be', [], V),
    wholeWord('had', 'have', [], V),
    wholeWord('could', 'can', [], V),
    wholeWord('would', 'will', [], V),
    wholeWord('should', 'shall', [], V),
    wholeWord('might', 'may', [], V),
    ...irregularRules(pastPairs, [], V),
    // Compounds of the whole-word forms.
    ...words('floodlit spotlit backlit flashlit relit').map((w) => wholeWord(w, `${w.slice(0, -3)}light`, [], V)),
    ...words('overate underate').map((w) => wholeWord(w, `${w.slice(0, -3)}eat`, [], V)),
];

const pastParticipleRules = [
    wholeWord('been', 'be', [], V),
    ...irregularRules(participlePairs, [], V),
];

const ingRules = [
    suffix('ing', '', [], V, {stemMinLength: 2}),
    // making -> make, arguing -> argue; not being -> bee, dying -> dye, seeing -> seee.
    suffix('ing', 'e', [], V, {stemMinLength: 2, stemNotEndsWith: '[aeioy]'}),
    wholeWord('eying', 'eye', [], V),
    suffix('ying', 'ie', [], V, {stemMinLength: 1}),
    ...doubled.map((c) => suffix(`${c}${c}ing`, c, [], V, {stemMinLength: 1})),
    suffix('cking', 'c', [], V, {stemMinLength: 1}),
];

const AA = ['adj', 'adv'];
const comparativeRules = [
    suffix('er', '', [], AA, {stemMinLength: 2}),
    suffix('r', '', [], AA, {stemMinLength: 2, stemEndsWith: '[e]'}),
    suffix('ier', 'y', [], AA, {stemMinLength: 1}),
    suffix('ier', 'ey', [], AA, {stemMinLength: 1}),
    ...doubledComparative.map((c) => suffix(`${c}${c}er`, c, [], AA, {stemMinLength: 1})),
    wholeWord('better', 'good', [], AA),
    wholeWord('better', 'well', [], AA),
    wholeWord('worse', 'bad', [], AA),
    wholeWord('worse', 'ill', [], AA),
    wholeWord('worse', 'badly', [], AA),
    wholeWord('more', 'much', [], AA),
    wholeWord('more', 'many', [], AA),
    wholeWord('less', 'little', [], AA),
    wholeWord('further', 'far', [], AA),
    wholeWord('farther', 'far', [], AA),
    wholeWord('elder', 'old', [], AA),
];

const superlativeRules = [
    suffix('est', '', [], AA, {stemMinLength: 2}),
    suffix('st', '', [], AA, {stemMinLength: 2, stemEndsWith: '[e]'}),
    suffix('iest', 'y', [], AA, {stemMinLength: 1}),
    suffix('iest', 'ey', [], AA, {stemMinLength: 1}),
    suffix('most', '', [], AA, {stemMinLength: 3}),
    ...doubledComparative.map((c) => suffix(`${c}${c}est`, c, [], AA, {stemMinLength: 1})),
    wholeWord('best', 'good', [], AA),
    wholeWord('best', 'well', [], AA),
    wholeWord('worst', 'bad', [], AA),
    wholeWord('worst', 'ill', [], AA),
    wholeWord('worst', 'badly', [], AA),
    wholeWord('most', 'much', [], AA),
    wholeWord('most', 'many', [], AA),
    wholeWord('least', 'little', [], AA),
    wholeWord('furthest', 'far', [], AA),
    wholeWord('farthest', 'far', [], AA),
    wholeWord('eldest', 'old', [], AA),
];

// Apostrophes reach the rules as U+0027 (the normalizeApostrophes preprocessor).
const possessor = ['n', 'name', 'pron'];
const possessiveRules = [
    suffix("'s", '', [], possessor, {stemMinLength: 1}),
    suffix("'", '', [], possessor, {stemMinLength: 1, stemEndsWith: '[sSzZ]'}),
];

// Clitics: the host word keeps its own part of speech.
const anyWord = ['n', 'name', 'pron', 'det', 'adj', 'adv', 'conj', 'v'];
const contractionRules = [
    // 's for is, has or us after words that have no possessive (it's, let's);
    // after a noun or name it is read as the possessive.
    ...words("it that there here what where who how when why he she let").map((w) => wholeWord(`${w}'s`, w, [], anyWord)),
    ...["'re", "'ve", "'ll", "'d", "'m"].map((clitic) => suffix(clitic, '', [], anyWord, {stemMinLength: 1})),
];

const negativeRules = [
    suffix("n't", '', [], V, {stemMinLength: 2}),
    wholeWord("doesn't", 'do', [], V),
    wholeWord("didn't", 'do', [], V),
    wholeWord("isn't", 'be', [], V),
    wholeWord("aren't", 'be', [], V),
    wholeWord("wasn't", 'be', [], V),
    wholeWord("weren't", 'be', [], V),
    wholeWord("hasn't", 'have', [], V),
    wholeWord("hadn't", 'have', [], V),
    wholeWord("can't", 'can', [], V),
    wholeWord('cannot', 'can', [], V),
    wholeWord("won't", 'will', [], V),
    wholeWord("shan't", 'shall', [], V),
    wholeWord("ain't", 'be', [], V),
    wholeWord("ain't", 'have', [], V),
];

const droppedGRules = [suffix("in'", 'ing', [], [], {stemMinLength: 1})];

const interposedObjectRules = [
    {type: 'interposedObject', particles: 'separableParticles', guardWords: 'objectGuards', conditionsIn: [], conditionsOut: []},
];
ruleCount += interposedObjectRules.length;

// The placeholders multiword dictionary entries are written with
// (*lose one's temper*, *let someone down*, *enjoy oneself*).
const replace = (inflected, deinflected) => {
    ++ruleCount;
    return {type: 'replace', inflected, deinflected, conditionsIn: ['v'], conditionsOut: []};
};
const possessiveDeterminers = words('my your his her its our their');
const objectPronouns = words('me you him her us them');
const reflexives = words('myself yourself himself herself itself ourselves yourselves themselves');
const placeholderRules = [
    ...possessiveDeterminers.map((w) => replace(` ${w} `, " one's ")),
    ...possessiveDeterminers.map((w) => replace(` ${w} `, " someone's ")),
    ...objectPronouns.map((w) => replace(` ${w} `, ' someone ')),
    ...reflexives.map((w) => replace(` ${w}`, ' oneself')),
];

// Early Modern English (the King James Bible, Shakespeare): optional, since
// -est and -eth endings also end ordinary words (interest, honest).
const archaicSecondPersonRules = [
    suffix('est', '', [], V, {stemMinLength: 2}),
    suffix('st', '', [], V, {stemMinLength: 2, stemEndsWith: '[e]'}),
    suffix('iest', 'y', [], V, {stemMinLength: 1}),
    wholeWord('art', 'be', [], V),
    wholeWord('wast', 'be', [], V),
    wholeWord('wert', 'be', [], V),
    wholeWord('hast', 'have', [], V),
    wholeWord('hadst', 'have', [], V),
    wholeWord('dost', 'do', [], V),
    wholeWord('didst', 'do', [], V),
    wholeWord('shalt', 'shall', [], V),
    wholeWord('wilt', 'will', [], V),
    wholeWord('canst', 'can', [], V),
    wholeWord('couldst', 'could', [], V),
    wholeWord('wouldst', 'would', [], V),
    wholeWord('shouldst', 'should', [], V),
    wholeWord('mayst', 'may', [], V),
    wholeWord('mightst', 'might', [], V),
];
const archaicThirdPersonRules = [
    suffix('eth', '', [], V, {stemMinLength: 2}),
    suffix('eth', 'e', [], V, {stemMinLength: 2}),
    suffix('ieth', 'y', [], V, {stemMinLength: 1}),
    wholeWord('hath', 'have', [], V),
    wholeWord('doth', 'do', [], V),
    wholeWord('saith', 'say', [], V),
];

/** The same endings on the first word of a multiword verb (*looked up*, *gave up on*). */
function withPhrasal(rules) {
    const seen = new Set();
    const out = [...rules];
    for (const rule of rules) {
        const key = `${rule.inflected}\u0000${rule.deinflected}`;
        if (seen.has(key)) { continue; }
        seen.add(key);
        out.push(phrasal(rule.inflected, rule.deinflected));
    }
    return out;
}

const transform = (id, name, description, rules, extra = {}) => ({id, name, description, source: 'own', ...extra, rules});

const transforms = [
    transform('plural', 'plural', 'Plural form of a noun (books, boxes, cities, wolves, children, data).', pluralRules),
    transform('thirdPerson', 'third-person singular', 'Third-person singular present of a verb (walks, watches, tries, is, has).', withPhrasal(thirdPersonRules)),
    transform('present', 'present', 'Present tense of be other than the third-person singular (am, are).', withPhrasal(presentRules)),
    transform('past', 'past', 'Past tense of a verb, and the past participle of a regular verb (walked, stopped, tried, went, could).', withPhrasal(pastRules)),
    transform('pastParticiple', 'past participle', 'Past participle of an irregular verb (taken, written, gone, been).', withPhrasal(pastParticipleRules)),
    transform('ing', '-ing', 'Present participle or gerund of a verb (walking, making, running, lying).', withPhrasal(ingRules)),
    transform('comparative', 'comparative', 'Comparative of an adjective or adverb (taller, nicer, happier, bigger, better).', comparativeRules),
    transform('superlative', 'superlative', 'Superlative of an adjective or adverb (tallest, nicest, happiest, biggest, best).', superlativeRules),
    transform('possessive', 'possessive', "Possessive of a noun or name (teacher's, James', dogs').", possessiveRules),
    transform('contraction', 'contraction', "A word with a contracted is, has, are, have, will, would, had or am ('s, 're, 've, 'll, 'd, 'm).", contractionRules),
    transform('negative', 'negative', "Negative contraction of an auxiliary (don't, isn't, can't, won't).", negativeRules),
    transform('droppedG', 'dropped g', "Informal -in' for -ing (goin', nothin').", droppedGRules),
    transform('interposedObject', 'interposed object', 'An object between a verb and its particle (turn it off, put Mary\'s coat on).', interposedObjectRules),
    transform('placeholder', 'placeholder', "A pronoun written as the placeholder of a dictionary entry (his temper -> one's temper, let him down -> let someone down, enjoy himself -> enjoy oneself).", placeholderRules),
    transform('archaicSecondPerson', 'archaic second person', 'Early Modern English second-person singular (thou walkest, thou art, thou hast).', archaicSecondPersonRules, {optional: true}),
    transform('archaicThirdPerson', 'archaic third person', 'Early Modern English third-person singular (he walketh, he hath, he doth).', archaicThirdPersonRules, {optional: true}),
];

const out = {schema: 1, conditions, wordLists, transforms};
const file = join(dirname(fileURLToPath(import.meta.url)), 'own.json');
writeFileSync(file, formatTransforms(out));
console.log(`${file}: ${transforms.length} transforms, ${ruleCount} rules`);
