// SPDX-License-Identifier: GPL-3.0-or-later
// A JavaScript model of the pack deinflector (docs/languages.md, section 7),
// used only by the stub hoshidicts-cli that tests the tools while the engine's
// CLI is not available. The engine is the implementation; this model follows
// the contract closely enough to exercise every rule type.

import {ClassError} from '../../lib/classes.mjs';
import {applyVariant} from '../../lib/steps.mjs';

const MAX_AFFIX = 64;

function cpLength(text) {
    let n = 0;
    for (const _ of text) { ++n; }
    return n;
}

function firstCp(text) {
    return text.codePointAt(0);
}

function lastCp(text) {
    if (text === '') { return undefined; }
    const last = text.charCodeAt(text.length - 1);
    if (last >= 0xDC00 && last <= 0xDFFF && text.length >= 2) { return text.codePointAt(text.length - 2); }
    return last;
}

/**
 * Condition bits of section 7.1: one per condition without subConditions in
 * file order, the union of their bits for the others.
 * @param {Record<string, any>} conditions
 * @returns {{flags: Map<string, number>, leaves: string[], dictionaryForms: Set<string>}}
 */
export function conditionFlags(conditions) {
    const leaves = [];
    const flags = new Map();
    for (const [name, condition] of Object.entries(conditions ?? {})) {
        if (condition.subConditions === undefined) {
            if (leaves.length >= 32) { throw new Error('more than 32 condition bits'); }
            flags.set(name, (1 << leaves.length) >>> 0);
            leaves.push(name);
        }
    }
    const resolving = new Set();
    const resolve = (name) => {
        const known = flags.get(name);
        if (known !== undefined) { return known; }
        const condition = conditions[name];
        if (condition === undefined) { throw new Error(`condition ${name} is not declared`); }
        if (resolving.has(name)) { throw new Error(`subConditions form a cycle at ${name}`); }
        resolving.add(name);
        let value = 0;
        for (const sub of condition.subConditions) { value = (value | resolve(sub)) >>> 0; }
        resolving.delete(name);
        flags.set(name, value);
        return value;
    };
    for (const name of Object.keys(conditions ?? {})) { resolve(name); }
    const dictionaryForms = new Set(Object.entries(conditions ?? {}).filter(([, c]) => c.isDictionaryForm === true).map(([name]) => name));
    return {flags, leaves, dictionaryForms};
}

/**
 * A deinflector built from a pack's transforms and classes.
 */
export class ModelDeinflector {
    /**
     * @param {any} transforms the parsed transforms.json
     * @param {import('../../lib/classes.mjs').ClassSet} classes
     * @param {{wordCharacters?: string | null, enabled?: Iterable<string>}} [options]
     */
    constructor(transforms, classes, {wordCharacters = null, enabled = []} = {}) {
        this.classes = classes;
        const {flags, leaves} = conditionFlags(transforms.conditions);
        this.flags = flags;
        this.leaves = leaves;
        this.wordLists = new Map(Object.entries(transforms.wordLists ?? {}).map(([name, words]) => [name, new Set(words)]));
        this.isWordChar = wordCharacters === null ? (cp) => /\p{L}|\p{M}|\p{N}/u.test(String.fromCodePoint(cp)) : classes.matcher(wordCharacters);
        const on = new Set(enabled);
        /** @type {any[]} */
        this.rules = [];
        (transforms.transforms ?? []).forEach((transform, t) => {
            if (transform.optional === true && !on.has(transform.id)) { return; }
            (transform.rules ?? []).forEach((rule, r) => {
                for (const expanded of this.#expand(rule)) {
                    this.rules.push(this.#compile(expanded, transform, t, r));
                }
            });
        });
    }

    #expand(rule) {
        if (rule.type === 'todo') { throw new Error('the transforms still have todo rules; map them first (section 8.3)'); }
        if (rule.type !== 'circumfix' || (rule.prefixes === undefined && rule.suffixes === undefined)) { return [rule]; }
        const out = [];
        for (const [inflectedPrefix, deinflectedPrefix] of rule.prefixes ?? [['', '']]) {
            for (const [inflectedSuffix, deinflectedSuffix] of rule.suffixes ?? [['', '']]) {
                const {prefixes: _p, suffixes: _s, ...rest} = rule;
                out.push({...rest, inflectedPrefix, deinflectedPrefix, inflectedSuffix, deinflectedSuffix});
            }
        }
        return out;
    }

    #mask(names) {
        let value = 0;
        for (const name of names ?? []) {
            const flag = this.flags.get(name);
            if (flag === undefined) { throw new Error(`condition ${name} is not declared`); }
            value = (value | flag) >>> 0;
        }
        return value;
    }

    #compile(rule, transform, transformIndex, ruleIndex) {
        const compiled = {
            ...rule,
            transformId: transform.id,
            transformIndex,
            ruleIndex,
            in: this.#mask(rule.conditionsIn),
            out: this.#mask(rule.conditionsOut),
            order: this.rules.length,
        };
        for (const key of ['inflected', 'inflectedPrefix', 'inflectedSuffix', 'anchorSuffix', 'anchorPrefix']) {
            if (typeof rule[key] === 'string' && cpLength(rule[key]) > MAX_AFFIX) { throw new Error(`${transform.id}: an affix is longer than ${MAX_AFFIX} code points`); }
        }
        const matcher = (field) => (typeof rule[field] === 'string' ? this.classes.matcher(rule[field]) : null);
        compiled.stemCharactersTest = matcher('stemCharacters');
        compiled.stemContainsTest = matcher('stemContains');
        compiled.stemStartsWithTest = matcher('stemStartsWith');
        compiled.stemEndsWithTest = matcher('stemEndsWith');
        compiled.stemNotStartsWithTest = matcher('stemNotStartsWith');
        compiled.stemNotEndsWithTest = matcher('stemNotEndsWith');
        if (rule.stemChange?.between !== undefined) { compiled.betweenTest = this.classes.matcher(rule.stemChange.between); }
        if (rule.type === 'pattern') { compiled.regExp = this.classes.patternRegExp(rule.pattern); }
        if (rule.type === 'phrasal') {
            compiled.list = this.wordLists.get(rule.followedBy);
            if (compiled.list === undefined) { throw new Error(`${transform.id}: no word list ${rule.followedBy}`); }
        }
        if (rule.type === 'interposedObject') {
            compiled.particleList = this.wordLists.get(rule.particles);
            compiled.guardList = this.wordLists.get(rule.guardWords);
            if (compiled.particleList === undefined || compiled.guardList === undefined) { throw new Error(`${transform.id}: a word list is missing`); }
            compiled.verbGuardList = rule.verbGuardWords === undefined ? null : this.wordLists.get(rule.verbGuardWords);
            if (compiled.verbGuardList === undefined) { throw new Error(`${transform.id}: no word list ${rule.verbGuardWords}`); }
        }
        if (!['suffix', 'prefix', 'wholeWord', 'circumfix', 'replace', 'phrasal', 'interposedObject', 'pattern'].includes(rule.type)) {
            throw new Error(`${transform.id}: unknown rule type ${rule.type}`);
        }
        return compiled;
    }

    #stemOk(rule, stem) {
        if (rule.stemMinLength !== undefined && cpLength(stem) < rule.stemMinLength) { return false; }
        if (rule.stemCharactersTest !== null) {
            for (const c of stem) {
                if (!rule.stemCharactersTest(c.codePointAt(0))) { return false; }
            }
        }
        if (rule.stemContainsTest !== null && ![...stem].some((c) => rule.stemContainsTest(c.codePointAt(0)))) { return false; }
        if (rule.stemStartsWithTest !== null && (stem === '' || !rule.stemStartsWithTest(firstCp(stem)))) { return false; }
        if (rule.stemEndsWithTest !== null && (stem === '' || !rule.stemEndsWithTest(lastCp(stem)))) { return false; }
        if (rule.stemNotStartsWithTest !== null && stem !== '' && rule.stemNotStartsWithTest(firstCp(stem))) { return false; }
        if (rule.stemNotEndsWithTest !== null && stem !== '' && rule.stemNotEndsWithTest(lastCp(stem))) { return false; }
        if (typeof rule.stemStartsWithText === 'string' && !stem.startsWith(rule.stemStartsWithText)) { return false; }
        if (typeof rule.stemNotStartsWithText === 'string' && stem.startsWith(rule.stemNotStartsWithText)) { return false; }
        return true;
    }

    /** @returns {string | null} the changed stem, or null when stemChange finds nothing */
    #changeStem(rule, stem) {
        const change = rule.stemChange;
        if (change === undefined) { return stem; }
        const candidates = [];
        for (let i = 0; i < stem.length; ++i) {
            for (const from of change.from) {
                if (from !== '' && stem.startsWith(from, i)) {
                    const after = stem.slice(i + from.length);
                    if (rule.betweenTest !== undefined) {
                        const cps = [...after];
                        if (cps.length < (change.betweenMinLength ?? 1) || !cps.every((c) => rule.betweenTest(c.codePointAt(0)))) { continue; }
                    }
                    candidates.push({index: i, from});
                }
            }
        }
        if (candidates.length === 0) { return null; }
        // Longest `from` at a position, then the first or last position.
        candidates.sort((a, b) => a.index - b.index || b.from.length - a.from.length);
        const pick = change.occurrence === 'last' ? candidates.filter((c) => c.index === candidates[candidates.length - 1].index)[0] : candidates[0];
        return stem.slice(0, pick.index) + change.to + stem.slice(pick.index + pick.from.length);
    }

    #finish(rule, text) {
        if (!Array.isArray(rule.then)) { return text; }
        const [out] = applyVariant(rule.then, text, this.classes);
        return out;
    }

    #words(text) {
        // Splits at single spaces; returns null when a piece is empty.
        const pieces = text.split(' ');
        return pieces.some((p) => p === '') ? null : pieces;
    }

    #allWord(piece) {
        if (piece === '') { return false; }
        for (const c of piece) {
            if (!this.isWordChar(c.codePointAt(0))) { return false; }
        }
        return true;
    }

    /**
     * Applies one rule; null when it does not match.
     * @returns {string | null}
     */
    apply(rule, text) {
        switch (rule.type) {
            case 'suffix': {
                if (!text.endsWith(rule.inflected)) { return null; }
                const stem = text.slice(0, text.length - rule.inflected.length);
                if (!this.#stemOk(rule, stem)) { return null; }
                const changed = this.#changeStem(rule, stem);
                return changed === null ? null : this.#finish(rule, changed + rule.deinflected);
            }
            case 'prefix': {
                if (!text.startsWith(rule.inflected)) { return null; }
                const stem = text.slice(rule.inflected.length);
                if (!this.#stemOk(rule, stem)) { return null; }
                const changed = this.#changeStem(rule, stem);
                return changed === null ? null : this.#finish(rule, rule.deinflected + changed);
            }
            case 'wholeWord':
                return text === rule.inflected ? this.#finish(rule, rule.deinflected) : null;
            case 'circumfix': {
                const p = rule.inflectedPrefix ?? '';
                const s = rule.inflectedSuffix ?? '';
                if (text.length < p.length + s.length || !text.startsWith(p) || !text.endsWith(s)) { return null; }
                const stem = text.slice(p.length, text.length - s.length);
                if (!this.#stemOk(rule, stem)) { return null; }
                const changed = this.#changeStem(rule, stem);
                return changed === null ? null : this.#finish(rule, (rule.deinflectedPrefix ?? '') + changed + (rule.deinflectedSuffix ?? ''));
            }
            case 'replace': {
                const found = [];
                let i = text.indexOf(rule.inflected);
                while (i >= 0 && rule.inflected !== '') {
                    if (!(rule.notAtStart === true && i === 0)) { found.push(i); }
                    i = text.indexOf(rule.inflected, i + rule.inflected.length);
                }
                if (found.length === 0) { return null; }
                const chosen = rule.occurrence === 'first' ? [found[0]] : rule.occurrence === 'last' ? [found[found.length - 1]] : found;
                let out = '';
                let last = 0;
                for (const index of chosen) {
                    out += text.slice(last, index) + rule.deinflected;
                    last = index + rule.inflected.length;
                }
                return this.#finish(rule, out + text.slice(last));
            }
            case 'phrasal': {
                const space = text.indexOf(' ');
                if (space <= 0) { return null; }
                const first = text.slice(0, space);
                const restStart = space + 1;
                let next = text.indexOf(' ', restStart);
                if (next < 0) { next = text.length; }
                const second = text.slice(restStart, next);
                if (!this.#allWord(first) || !first.endsWith(rule.inflected) || !this.#allWord(second) || !rule.list.has(second)) { return null; }
                return this.#finish(rule, first.slice(0, first.length - rule.inflected.length) + rule.deinflected + text.slice(space));
            }
            case 'interposedObject': {
                const pieces = this.#words(text);
                if (pieces === null || pieces.length < 3 || !this.#allWord(pieces[0])) { return null; }
                if (rule.verbGuardList !== null && rule.verbGuardList.has(pieces[0])) { return null; }
                for (let k = 1; k < pieces.length; ++k) {
                    const piece = pieces[k];
                    if (k >= 2 && this.#allWord(piece) && rule.particleList.has(piece)) {
                        return this.#finish(rule, [pieces[0], ...pieces.slice(k)].join(' '));
                    }
                    const parts = [];
                    let current = '';
                    for (const c of piece) {
                        if (this.isWordChar(c.codePointAt(0))) {
                            current += c;
                        } else {
                            if (current !== '') { parts.push(current); }
                            current = '';
                        }
                    }
                    if (current !== '') { parts.push(current); }
                    if (parts.some((part) => rule.guardList.has(part))) { return null; }
                }
                return null;
            }
            case 'pattern': {
                if (rule.anchorSuffix !== undefined && !text.endsWith(rule.anchorSuffix)) { return null; }
                if (rule.anchorPrefix !== undefined && !text.startsWith(rule.anchorPrefix)) { return null; }
                rule.regExp.lastIndex = 0;
                if (!rule.regExp.test(text)) { return null; }
                rule.regExp.lastIndex = 0;
                return this.#finish(rule, text.replace(rule.regExp, rule.replacement));
            }
        }
        throw new ClassError(`unknown rule type ${rule.type}`);
    }

    /** Rules in the order of section 7.4 for one text. */
    candidates(text) {
        const suffixed = [];
        const prefixed = [];
        const phrasal = [];
        const rest = [];
        for (const rule of this.rules) {
            switch (rule.type) {
                case 'suffix':
                case 'wholeWord':
                    if (text.endsWith(rule.inflected)) { suffixed.push([rule.inflected.length, rule]); }
                    break;
                case 'circumfix':
                    if (text.endsWith(rule.inflectedSuffix ?? '')) { suffixed.push([(rule.inflectedSuffix ?? '').length, rule]); }
                    break;
                case 'pattern':
                    if (rule.anchorSuffix !== undefined) {
                        if (text.endsWith(rule.anchorSuffix)) { suffixed.push([rule.anchorSuffix.length, rule]); }
                    } else if (rule.anchorPrefix !== undefined && text.startsWith(rule.anchorPrefix)) {
                        prefixed.push([rule.anchorPrefix.length, rule]);
                    }
                    break;
                case 'prefix':
                    if (text.startsWith(rule.inflected)) { prefixed.push([rule.inflected.length, rule]); }
                    break;
                case 'phrasal': {
                    const space = text.indexOf(' ');
                    if (space > 0 && text.slice(0, space).endsWith(rule.inflected)) { phrasal.push([rule.inflected.length, rule]); }
                    break;
                }
                default:
                    rest.push(rule);
            }
        }
        const byLength = (a, b) => b[0] - a[0] || a[1].order - b[1].order;
        return [...suffixed.sort(byLength), ...prefixed.sort(byLength), ...phrasal.sort(byLength)].map(([, rule]) => rule).concat(rest);
    }

    /**
     * Every deinflection of a text, depth first (section 7.4).
     * @param {string} text
     * @returns {{text: string, conditions: number, trace: string[]}[]}
     */
    deinflect(text) {
        const results = [];
        const visit = (current, conditions, trace, frames) => {
            // As the engine (and 35e2dab's deinflect_recursive): an empty text is no result.
            if (current === '') { return; }
            results.push({text: current, conditions, trace});
            for (const rule of this.candidates(current)) {
                if (conditions !== 0 && (conditions & rule.in) === 0) { continue; }
                const out = this.apply(rule, current);
                if (out === null) { continue; }
                if (frames.some((f) => f.rule === rule && f.text === current)) { continue; }
                visit(out, rule.out, [rule.transformId, ...trace], [...frames, {rule, text: current}]);
            }
        };
        visit(text, 0, [], []);
        return results;
    }

    /**
     * Names of the set condition bits in declaration order.
     * @param {number} conditions
     * @returns {string[]}
     */
    conditionNames(conditions) {
        return this.leaves.filter((name) => (conditions & /** @type {number} */ (this.flags.get(name))) !== 0);
    }

    /**
     * The condition bits of a condition name (for a corpus `rule`).
     * @param {string} name
     */
    conditionsOf(name) {
        return this.flags.get(name) ?? 0;
    }
}
