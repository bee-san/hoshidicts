#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Trace quality for README.md (Measurements 1): of the UniMorph kat rows a
// rule set reaches, the share whose trace (the one a lookup shows: fewest
// steps, then first found; docs/languages.md 9.6) names the transform the
// row's tags call for: the case of a noun or adjective (and plural, archaic
// plural), the tense of a verb. Not run by any test.
//
//   node languages/ka/sources/trace-quality.mjs <hoshidicts-cli> <unimorph kat file> [--transforms <file>]

import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

const repo = resolve(new URL('../../..', import.meta.url).pathname);
const [cli, file, ...rest] = process.argv.slice(2);
const transforms = rest.includes('--transforms') ? rest[rest.indexOf('--transforms') + 1] : join(repo, 'languages/ka/transforms.json');

// What a row's tags call for: every listed transform id must be in the trace.
function expected(tags) {
    const t = tags.split(';');
    if (t[0] === 'N' || t[0] === 'ADJ') {
        const need = [];
        if (t.includes('LGSPEC2')) { need.push('pl-archaic'); } else if (t.includes('PL')) { need.push('pl'); }
        const kase = {ERG: 'erg', DAT: 'dat', GEN: 'gen', INS: 'ins', LGSPEC1: 'adv', VOC: 'voc'};
        if (!t.includes('LGSPEC2')) { for (const [k, v] of Object.entries(kase)) { if (t.includes(k)) { need.push(v); } } }
        return need;
    }
    if (t[0] === 'V') {
        if (t.includes('V.MSDR')) { return null; }
        if (t.includes('IPFV') && t.includes('IND')) { return ['impf']; }
        if (t.includes('COND')) { return ['impf']; }
        if (t.includes('SBJV') && (t.includes('PRS') || t.includes('FUT'))) { return ['subj']; }
        if (t.includes('PST') && t.includes('PFV')) { return ['aor']; }
        if (t.includes('OPT')) { return ['opt']; }
        if (t.includes('IMP')) { return null; } // the aorist or the optative
        if (t.includes('PST') && t.includes('PRF')) { return ['pluperf|perf-pass']; }
        if (t.includes('SBJV') && t.includes('PRF')) { return ['perf-subj|perf-pass']; }
        if (t.includes('PRF')) { return ['perf|perf-pass']; }
        return []; // present and future: any person ending
    }
    return null;
}

const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'))
    .filter(([l, f]) => /^[\u10D0-\u10FA]+$/u.test(l) && /^[\u10D0-\u10FA]+$/u.test(f) && l !== f);
const forms = [...new Set(rows.map((r) => r[1]))];
const out = spawnSync(cli, ['--languages', join(repo, 'languages'), 'deinflect', 'ka', '--stdin', '--transforms', transforms],
    {input: forms.join('\n') + '\n', maxBuffer: 1 << 30});
const results = new Map();
for (const line of out.stdout.toString().split('\n').filter(Boolean)) {
    const j = JSON.parse(line);
    results.set(j.input, j.results);
}
const byKind = new Map();
for (const [lemmaText, form, tags] of rows) {
    const need = expected(tags);
    if (need === null) { continue; }
    const reaching = (results.get(form) ?? []).filter((r) => r.text === lemmaText);
    if (reaching.length === 0) { continue; }
    let best = reaching[0];
    for (const r of reaching) { if (r.trace.length < best.trace.length) { best = r; } }
    const ok = need.every((n) => n.split('|').some((id) => best.trace.includes(id)));
    const kind = tags.split(';')[0] === 'V' ? 'verbs' : 'nouns and adjectives';
    const e = byKind.get(kind) ?? {reached: 0, ok: 0};
    e.reached++;
    if (ok) { e.ok++; }
    byKind.set(kind, e);
}
for (const [kind, e] of byKind) {
    console.log(`${kind}: ${e.ok} of ${e.reached} reached rows (${(100 * e.ok / e.reached).toFixed(2)}%) show the expected transform`);
}
