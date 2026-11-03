// SPDX-License-Identifier: GPL-3.0-or-later
// Exact stems that rules leave out (README.md, Rule provenance), and the
// function that writes a rule without them. Imported by build-own.mjs,
// build-final.mjs and build-guards.mjs.
//
// A name or a loanword the dictionary lacks is read by the rules as a
// derived word, and with no other result that reading comes first: the
// lowercase variant that `decapitalize` adds goes through every rule, so the
// rules' capital guard does not stop it (Karolino → karolino → karolo, the
// whole note, + -in-). `sources/measure.py names` lists these first results
// on the four books, the capitalised words inside Tatoeba's sentences and the
// 10,000 most frequent words. A stem below is one whose wrong first results
// (all words and rules of that stem) number at least 4 in Tatoeba or the
// frequency list, or 2 in the books, and at least three times the uses of
// the word as the derived word in the same texts: *kate* (like a cat) is
// used 3 times in Tatoeba, against 45 wrong first results for *Kate*. Kept,
// with their counts in README.md (Known gaps): *grace* (graciously, 3 uses
// against 6 for *Grace*), *mame* (by breast, 1 use against 2 for *Mame*) and
// *luiĝi* (to be for rent, a word of the ordinary vocabulary, against 7 for
// *Luiĝi*). Only the exact stem is left out: *kate* is not read as *kata*,
// while *katolike* still is *katolika*.

/** Exact stems left out, by transform id ('accusativeEn' is the -en rule of
 * the accusative): [stem, the words it stops]. */
export const EXCLUDED_STEMS = {
    adverbClass: [['kat', 'Kate'], ['kab', 'KABE'], ['ann', 'Anne, anne'], ['zo', 'Zoe'], ['juli', 'Julie, Julien'],
        ['ros', 'rose'], ['gal', 'Gale'], ['pag', 'Page']],
    accusativeEn: [['bid', 'Biden'], ['hel', 'Helen'], ['rub', 'Ruben'], ['kar', 'Karen'], ['lad', 'Laden'],
        ['virtan', 'Virtanen']],
    in: [['karol', 'Karolino'], ['tor', 'Torino'], ['lad', 'Ladino'], ['mart', 'Martino, Martine'], ['malv', 'Malvino'],
        ['juli', 'Juliino'], ['salam', 'Salamino'], ['od', 'odino (Odin)']],
    il: [['em', 'Emilo'], ['baz', 'Bazilo']],
    id: [['far', 'Farido'], ['amor', 'Amoridoj'], ['perd', 'perdido']],
    eg: [['di', 'Diego, diego']],
    an: [['di', 'Diano'], ['al', 'Alano'], ['salt', 'saltano'], ['mil', 'milano (the kite)'], ['ir', 'irano'],
        ['juli', 'Juliano']],
    ul: [['drak', 'Drakulo'], ['tusk', 'Tuskulo']],
    et: [['nazar', 'Nazareto'], ['juli', 'Julieto'], ['go', 'Goeto (Goethe)'], ['tajg', 'Tajgeto (Taygetus)']],
    ar: [['boj', 'bojaro (a boyar)'], ['barb', 'barbaro (a barbarian)'], ['solid', 'solidareco']],
    ato: [['pen', 'Penatoj (the Penates)']],
    ita: [['grav', 'gravita (gravitational)']],
    estr: [['sem', 'semestro']],
    de: [['leg', 'delegato']],
    mal: [['vin', 'Malvino']],
    'el-': [['ena', 'Elena']],
};

/** The key of EXCLUDED_STEMS for a rule of a transform. */
export function exclusionKey(transformId, rule) {
    return transformId === 'accusative' && rule.inflected === 'en' ? 'accusativeEn' : transformId;
}

function commonPrefix(words) {
    let p = words[0];
    for (const w of words) {
        while (!w.startsWith(p)) { p = p.slice(0, -1); }
    }
    return p;
}

/**
 * Copies of `rule` that together take every stem the rule takes except the
 * stems in `stems` exactly, written with stemStartsWithText,
 * stemNotStartsWithText, stemNotStartsWith, stemEndsWith, stemNotEndsWith
 * and stemMinLength (a stem constraint takes one literal string, so a rule
 * is split by the text its stem starts with). The copies take disjoint sets
 * of stems, so no deinflection is made twice.
 */
export function withoutStems(rule, stems) {
    for (const field of ['stemStartsWithText', 'stemNotStartsWithText', 'stemEndsWith', 'stemNotEndsWith']) {
        if (rule[field] !== undefined) {
            throw new Error(`withoutStems: the rule already has ${field}, which a copy would replace`);
        }
    }
    const min = rule.stemMinLength ?? 0;
    const out = [];
    const firsts = [...new Set(stems.map((s) => s[0]))].sort();
    // Stems that start with another letter: the rule as it is, with those
    // first letters added to its stemNotStartsWith class.
    const not = rule.stemNotStartsWith;
    const inner = not === undefined ? '' : not.startsWith('[') ? not.slice(1, -1) : not;
    out.push({...rule, stemNotStartsWith: `[${inner}${firsts.join('')}]`});
    const base = {...rule};
    delete base.stemNotStartsWith;
    const push = (fields, atLeast) => {
        const r = {...base, ...fields};
        if (atLeast > min) { r.stemMinLength = atLeast; }
        out.push(r);
    };
    // Every stem that starts with p, except the excluded ones (all start with
    // p, and p is excluded when it is one of them).
    const cover = (p, excluded) => {
        const atLeast = excluded.includes(p) ? p.length + 1 : 0;
        const rest = excluded.filter((s) => s !== p);
        if (rest.length === 0) {
            push({stemStartsWithText: p}, atLeast);
            return;
        }
        const q = commonPrefix(rest);
        if (q.length > p.length) {
            push({stemStartsWithText: p, stemNotStartsWithText: q}, atLeast);
            cover(q, rest);
            return;
        }
        const letters = [...new Set(rest.map((s) => s[p.length]))].sort().join('');
        if (rest.every((s) => s.length === p.length + 1) && atLeast === 0 && !letters.includes(p.at(-1))) {
            // p + one letter each: a stem that ends with one of those letters
            // needs two letters after p, and every other stem is taken (p
            // itself ends with none of them). The two copies take disjoint
            // stems.
            push({stemStartsWithText: p, stemNotEndsWith: `[${letters}]`}, 0);
            push({stemStartsWithText: p, stemEndsWith: `[${letters}]`}, p.length + 2);
            return;
        }
        // The excluded stems branch after p: split the stems by their last
        // letter. Stems that end with none of the excluded stems' last
        // letters are all taken; for each such letter, the stems that end
        // with it are taken except the excluded ones that do.
        const lasts = [...new Set(rest.map((s) => s.at(-1)))].sort();
        push({stemStartsWithText: p, stemNotEndsWith: `[${lasts.join('')}]`}, atLeast);
        for (const last of lasts) {
            coverEnding(p, rest.filter((s) => s.at(-1) === last), last, atLeast);
        }
    };
    // Every stem of at least atLeast letters that starts with p and ends with
    // `last`, except the excluded ones (all longer than p, starting with p
    // and ending with `last`).
    const coverEnding = (p, excluded, last, atLeast) => {
        const end = `[${last}]`;
        const q = commonPrefix(excluded);
        if (excluded.length === 1) {
            push({stemStartsWithText: p, stemEndsWith: end, stemNotStartsWithText: q}, atLeast);
            push({stemStartsWithText: q, stemEndsWith: end}, Math.max(atLeast, q.length + 1));
            return;
        }
        if (q.length > p.length && !excluded.includes(q)) {
            push({stemStartsWithText: p, stemEndsWith: end, stemNotStartsWithText: q}, atLeast);
            coverEnding(q, excluded, last, atLeast);
            return;
        }
        // Two excluded stems that end with the same letter and branch after
        // p, or one that another continues: no pair of the list does.
        throw new Error(`withoutStems: ${excluded.join(', ')} cannot be split exactly`);
    };
    for (const first of firsts) {
        cover(first, stems.filter((s) => s[0] === first));
    }
    return out;
}
