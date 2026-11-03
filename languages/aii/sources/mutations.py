#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Mutation checks for the aii pack (docs/languages.md, section 14 step 7).

    python3 languages/aii/sources/mutations.py <scratch dir> [--only name,...]

Each mutation edits a copy of languages/aii/transforms.json (or, for the
names starting with "language:", of language.json) in
<scratch dir>/<name>/aii/: it deletes one stem constraint from every rule of
one transform that has it, loosens one pattern, adds back a letter the rules
leave out, drops a word a pattern keeps out, drops the conditions that keep
chains short, or moves transforms in the file. For each, the
script writes the copy's tests/classes.json (tools/check-classes.mjs
--write) and runs build/language-conformance-test on it. A mutation that
every test still passes is a "survivor": either a row is missing, or the
edit changes nothing the tests can see (the README lists those). The
identity mutation (no edit) must survive.
"""
import argparse
import copy
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PACK = ROOT / 'languages' / 'aii'
CONSTRAINTS = ['stemMinLength', 'stemCharacters', 'stemContains', 'stemStartsWith', 'stemEndsWith',
               'stemNotStartsWith', 'stemNotEndsWith', 'stemStartsWithText', 'stemNotStartsWithText']
NODE = str(Path.home() / '.local/share/mise/installs/node/22.23.1/bin/node')


def mutations(t):
    """(name, function editing a transforms object) pairs."""
    out = [('identity', lambda x: None)]
    for tr in t['transforms']:
        keys = sorted({k for r in tr['rules'] for k in r if k in CONSTRAINTS})
        for k in keys:
            def edit(x, tid=tr['id'], key=k):
                for tt in x['transforms']:
                    if tt['id'] == tid:
                        for r in tt['rules']:
                            r.pop(key, None)
            out.append((f'{tr["id"]}:-{k}', edit))
        if any(r.get('stemMinLength', 0) > 1 for r in tr['rules']):
            def lower(x, tid=tr['id']):
                for tt in x['transforms']:
                    if tt['id'] == tid:
                        for r in tt['rules']:
                            if r.get('stemMinLength', 0) > 1:
                                r['stemMinLength'] -= 1
            out.append((f'{tr["id"]}:stemMinLength-1', lower))
    # The -ē endings and participle: any stem instead of a verb-shaped one.
    def loose_weak(x):
        for tt in x['transforms']:
            for r in tt['rules']:
                if r['type'] == 'pattern' and r.get('replacement') == '$1ܐ' and r['pattern'].startswith('^(['):
                    end = r['pattern'][r['pattern'].index(')') + 1:]
                    r['pattern'] = '^([\\u0710-\\u072C]{2,})' + end
    out.append(('weakStem:any', loose_weak))
    # The strong pointed pattern: ܝ allowed as the middle radical; the strong
    # and hollow ones: ܝ allowed as the last radical.
    NO_YOD = '[\\u0710\\u0712-\\u071C\\u071E-\\u072C]'
    ANY_C = '[\\u0710\\u0712-\\u072C]'

    def strong(r):
        return r['type'] == 'pattern' and r.get('replacement') == '$1$2$3' and r['pattern'].count(NO_YOD) == 2

    def hollow(r):
        return r['type'] == 'pattern' and r.get('replacement') == '$1ܐ$2' and NO_YOD in r['pattern']

    def middle_yod(x):
        for tt in x['transforms']:
            for r in tt['rules']:
                if strong(r):
                    r['pattern'] = r['pattern'].replace(NO_YOD, ANY_C, 1)
    out.append(('pointed:middleYod', middle_yod))

    def last_yod(x):
        for tt in x['transforms']:
            for r in tt['rules']:
                if strong(r):
                    i = r['pattern'].rindex(NO_YOD)
                    r['pattern'] = r['pattern'][:i] + ANY_C + r['pattern'][i + len(NO_YOD):]
                elif hollow(r):
                    r['pattern'] = r['pattern'].replace(NO_YOD, ANY_C)
    out.append(('pointed:lastYod', last_yod))

    # The hollow pointed pattern: any middle letter instead of ܝ.
    def hollow_any(x):
        for tt in x['transforms']:
            for r in tt['rules']:
                if hollow(r):
                    r['pattern'] = r['pattern'].replace('\\u071D', ANY_C, 1)
    out.append(('pointed:hollowAnyMiddle', hollow_any))

    # The words kept out of the pointed patterns and the gerund (NOT_VERBS in
    # own-rules.mjs): none kept out.
    def no_exclusions(x):
        import re
        for tt in x['transforms']:
            for r in tt['rules']:
                if r['type'] == 'pattern':
                    r['pattern'] = re.sub(r'\(\?!\(\?:.*?\)\)', '', r['pattern'])
                    r['pattern'] = re.sub(r'\(\?![^()]*\)', '', r['pattern'])
    out.append(('pointed:noExclusions', no_exclusions))

    # Each excluded word let in alone (its lookahead alternative removed),
    # and the exclusions matched exactly instead of with any marks between
    # the letters.
    import re as _re
    N_RE = '[\\u0303\\u0307\\u0308\\u0323\\u032E\\u0330\\u0740-\\u0742\\u0747]*'

    def lookaheads(pattern):
        return _re.findall(r'\(\?!\(\?:(.*?)\)\)', pattern)
    words = []
    for tt in t['transforms']:
        for r in tt['rules']:
            if r['type'] == 'pattern':
                for alts in lookaheads(r['pattern']):
                    for a in alts.split('|'):
                        if a not in words:
                            words.append(a)
    for a in words:
        name = ''.join(chr(int(h, 16)) for h in _re.findall(r'\\u(07[12][0-9A-F])', a.replace(N_RE, '')))
        def drop_word(x, a=a):
            for tt in x['transforms']:
                for r in tt['rules']:
                    if r['type'] == 'pattern':
                        for alts in lookaheads(r['pattern']):
                            rest = [b for b in alts.split('|') if b != a]
                            new = f'(?!(?:{"|".join(rest)}))' if rest else ''
                            r['pattern'] = r['pattern'].replace(f'(?!(?:{alts}))', new)
        out.append((f'pointed:letIn-{name}', drop_word))

    def exact(x):
        for tt in x['transforms']:
            for r in tt['rules']:
                if r['type'] == 'pattern':
                    for alts in lookaheads(r['pattern']):
                        new = '|'.join(b.replace(N_RE, '') for b in alts.split('|'))
                        r['pattern'] = r['pattern'].replace(f'(?!(?:{alts}))', f'(?!(?:{new}))')
    out.append(('pointed:exactExclusions', exact))

    # Each pointed pattern of the verbs in -ē removed alone.
    for tid, end in (('3fs', '\u071D\u0735\u0710'), ('3p', '\u071D\u073C'), ('2ms', '\u0739\u071D\u072C'), ('2fs', '\u071D\u0732\u072C\u071D'),
                     ('2fs', '\u071D\u0735\u072C\u071D'), ('2p', '\u0732\u071D\u072C\u0718\u073F\u0722'), ('1s', '\u0739\u071D\u0722'),
                     ('1s', '\u071D\u0732\u0722'), ('1p', '\u0739\u071D\u071A')):
        def drop_weak(x, tid=tid, end=end):
            for tt in x['transforms']:
                if tt['id'] == tid:
                    tt['rules'] = [r for r in tt['rules'] if not (r['type'] == 'pattern' and r.get('anchorSuffix') == end and r.get('replacement') == '$1$2ܐ')]
        out.append((f'pointed:weak{tid}-{"".join(chr(ord(c)) for c in end)}Removed', drop_weak))

    # The conditions the new transforms give.
    for tid, cond in (('spelling', ['n_f']), ('spelling', ['v_f']), ('pastContracted', []), ('pastContracted', ['v_l'])):
        def set_out(x, tid=tid, cond=cond):
            for tt in x['transforms']:
                if tt['id'] == tid:
                    for r in tt['rules']:
                        r['conditionsOut'] = list(cond)
        out.append((f'{tid}:conditionsOut[{",".join(cond)}]', set_out))

    # The pointed patterns of one ending removed: the -ē feminine (ܕܵܪܝܵܐ) and
    # the first person singular (ܐܵܡܪܹܢ).
    for name, tid, anchors in (('weak3fs', '3fs', ('\u071D\u0735\u0710',)),
                               ('1s', '1s', ('\u0739\u0722', '\u0735\u0722', '\u0738\u0722', '\u0739\u071D\u0722', '\u071D\u0732\u0722')),
                               ('zlama1s', '1s', ('\u0738\u0722',)), ('zlama2ms', '2ms', ('\u0738\u072C',))):
        def drop(x, tid=tid, anchors=anchors):
            for tt in x['transforms']:
                if tt['id'] == tid:
                    tt['rules'] = [r for r in tt['rules'] if not (r['type'] == 'pattern' and r.get('anchorSuffix') in anchors)]
        out.append((f'pointed:{name}Removed', drop))

    # The Stem III imperative: a root of one letter.
    def imp_one(x):
        for tt in x['transforms']:
            if tt['id'] == 'imperativeM':
                for r in tt['rules']:
                    if r['type'] == 'pattern':
                        r['pattern'] = r['pattern'].replace('{2,4}?', '{1,4}?')
    out.append(('imperativeM:oneLetter', imp_one))

    # The contracted past: each constraint of its patterns loosened, or the
    # transform removed.
    NV = '[\\u0303\\u0307\\u0323\\u032E\\u0330\\u0740-\\u0742\\u0747]*'
    for name, old, new, count in (
            ('firstVowel', NV, '[\\u0303-\\u074A]*', 1),
            ('firstWaw', '([\\u0710\\u0712-\\u0717\\u0719-\\u072C])', '([\\u0710\\u0712-\\u072C])', 1),
            ('seyame', NV, NV.replace('\\u0303', '\\u0303\\u0308'), 99),
            ('secondAlaph', '([\\u0712-\\u0717\\u0719-\\u072C])', '([\\u0710\\u0712-\\u0717\\u0719-\\u072C])', 1),
            ('secondWaw', '([\\u0712-\\u0717\\u0719-\\u072C])', '([\\u0712-\\u072C])', 1),
            ('anyVowel', '\\u0738', '[\\u0730-\\u073F]', 1),
            ('anyLast', '([\\u072A\\u0720])', '([\\u0710-\\u072C])', 1)):
        def loosen(x, old=old, new=new, count=count):
            for tt in x['transforms']:
                if tt['id'] == 'pastContracted':
                    for r in tt['rules']:
                        r['pattern'] = r['pattern'].replace(old, new, count)
        out.append((f'pastContracted:{name}', loosen))
    for tid in ('pastContracted', 'spelling'):
        def remove(x, tid=tid):
            x['transforms'] = [tt for tt in x['transforms'] if tt['id'] != tid]
        out.append((f'{tid}:removed', remove))
    # ܬܪܵܝ read unpointed too.
    def spelling_unpointed(x):
        for tt in x['transforms']:
            if tt['id'] == 'spelling':
                tt['rules'] = [r for r in tt['rules'] if r['type'] != 'pattern']
                tt['rules'].append({'type': 'wholeWord', 'inflected': 'ܬܪܝ', 'deinflected': 'ܬܪܝܢ', 'conditionsIn': [], 'conditionsOut': []})
    out.append(('spelling:unpointed', spelling_unpointed))

    # The possessive suffix of the first person gives no condition (a verb
    # could take it).
    def poss1s_open(x):
        for tt in x['transforms']:
            if tt['id'] == 'poss1s':
                for r in tt['rules']:
                    r['conditionsOut'] = []
    out.append(('poss1s:noCondition', poss1s_open))

    # Transform order (ties go to the reading found first, docs/languages.md
    # 9.6; the trie finds the longest suffix first and prefix rules after
    # suffix rules, 7.4, so only rules at one trie node depend on it).
    def move(ids, after=None, before=None):
        def edit(x):
            ts = x['transforms']
            moved = [tt for tt in ts if tt['id'] in ids]
            rest = [tt for tt in ts if tt['id'] not in ids]
            if after is not None:
                j = next(i for i, tt in enumerate(rest) if tt['id'] == after) + 1
            elif before is not None:
                j = next(i for i, tt in enumerate(rest) if tt['id'] == before)
            else:
                j = len(rest)
            x['transforms'] = rest[:j] + moved + rest[j:]
        return edit
    PERSON = ('3fs', '3p', '2ms', '2fs', '2p', '1s', '1p')
    out.append(('order:endingsAfterPossessives', move(PERSON, after='poss3p')))
    out.append(('order:3pAfterPoss1s', move(('3p',), after='poss1s')))
    out.append(('order:pastBaseAfterEndings', move(('pastBase', 'hollow'), after='1p')))
    out.append(('order:hollowBeforePastBase', move(('hollow',), before='pastBase')))
    out.append(('order:constructBeforePoss1s', move(('construct',), before='poss1s')))
    out.append(('order:participleBefore3fs', move(('passiveParticiple',), before='3fs')))
    out.append(('order:procliticsLast', move(('w-', 'd-', 'b-', 'l-', 'k-', 'bd-'))))
    # The pointed patterns: any vowel instead of zqapha after the first radical.
    def any_vowel(x):
        for tt in x['transforms']:
            for r in tt['rules']:
                if r['type'] == 'pattern' and '\\u0735' in r['pattern'] and r['pattern'].count('\\u0735') >= 1:
                    # After the lookahead of the excluded words, if any.
                    head, body = '', r['pattern']
                    if body.startswith('^(?!(?:'):
                        end = body.index('))') + 2
                        head, body = body[:end], body[end:]
                    r['pattern'] = head + body.replace('*\\u0735[', '*[\\u0730-\\u073F][', 1)
    out.append(('pointed:anyVowel', any_vowel))
    # The Stem I gerund: a stem of any length.
    def gerund_any(x):
        for tt in x['transforms']:
            if tt['id'] == 'gerund':
                for r in tt['rules']:
                    r['pattern'] = r['pattern'].replace('{3}', '{3,}').replace('{2}', '{2,}')
    out.append(('gerund:anyLength', gerund_any))
    # The Stem III imperative: a stem of any length.
    def imp_any(x):
        for tt in x['transforms']:
            if tt['id'] == 'imperativeM':
                for r in tt['rules']:
                    if r['type'] == 'pattern':
                        r['pattern'] = r['pattern'].replace('{2,4}?', '+?').replace('{2,3}', '+')
    out.append(('imperativeM:anyLength', imp_any))
    # ܐ as a last radical of the strong past base, participle and imperative.
    def alaph_radical(x):
        for tt in x['transforms']:
            if tt['id'] in ('pastBase', 'passiveParticiple', 'imperative', 'hollow') or tt['id'].startswith('past') and len(tt['id']) <= 7:
                extra = []
                for r in tt['rules']:
                    if r['type'] == 'suffix' and 'ܒ' in r['inflected'] and r['deinflected'].endswith('ܒ'):
                        rr = copy.deepcopy(r)
                        rr['inflected'] = r['inflected'].replace('ܒ', 'ܐ')
                        rr['deinflected'] = r['deinflected'][:-1] + 'ܐ'
                        extra.append(rr)
                tt['rules'].extend(extra)
    out.append(('radicals:+alaph', alaph_radical))
    # No conditions: every rule takes any text and gives one.
    def no_conditions(x):
        for tt in x['transforms']:
            for r in tt['rules']:
                r['conditionsIn'] = []
                r['conditionsOut'] = []
    out.append(('conditions:none', no_conditions))
    # Conditions kept on outputs, but every rule takes every text.
    def open_inputs(x):
        names = [c for c in x['conditions']]
        for tt in x['transforms']:
            for r in tt['rules']:
                r['conditionsIn'] = names
    out.append(('conditions:anyInput', open_inputs))
    # The L-suffix outputs are not verbs: noun rules may read them.
    def lsuf_open(x):
        for tt in x['transforms']:
            if tt['id'] in ('l1s', 'l2ms', 'l2fs', 'l3s', 'l1p', 'l2p', 'l3p', 'lJoined'):
                for r in tt['rules']:
                    r['conditionsOut'] = []
    out.append(('lsuffix:noCondition', lsuf_open))
    # Each optional transform made non-optional (defaults.tsv must notice).
    for tid in ('lJoined', 'pastBaseUrmia'):
        def required(x, tid=tid):
            for tt in x['transforms']:
                if tt['id'] == tid:
                    tt.pop('optional', None)
        out.append((f'{tid}:notOptional', required))
    # language.json: character resolution; the setting without one of its
    # transforms.
    def char_resolution(x):
        x['lookup']['searchResolution'] = 'character'
    out.append(('language:searchResolutionCharacter', char_resolution))

    def untagged_filter(x):
        x['lookup']['untaggedTerms'] = 'filter'
    out.append(('language:untaggedTermsFilter', untagged_filter))

    def setting_short(x):
        for st in x['settings']:
            st['effect']['transforms'] = [t for t in st['effect']['transforms'] if t != 'pastBaseUrmia']
    out.append(('language:olderSpellingsWithoutUrmia', setting_short))
    # The Stem II imperative before the noun rules.
    def imp2_first(x):
        ts = x['transforms']
        i = next(i for i, tt in enumerate(ts) if tt['id'] == 'imperativeII')
        tt = ts.pop(i)
        j = next(i for i, t2 in enumerate(ts) if t2['id'] == 'poss1s')
        ts.insert(j, tt)
    out.append(('imperativeII:beforeNouns', imp2_first))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scratch')
    ap.add_argument('--only')
    args = ap.parse_args()
    base = json.loads((PACK / 'transforms.json').read_text(encoding='utf-8'))
    lang = json.loads((PACK / 'language.json').read_text(encoding='utf-8'))
    only = set(args.only.split(',')) if args.only else None
    survivors = []
    for name, edit in mutations(base):
        if only and name not in only:
            continue
        file, original = ('language.json', lang) if name.startswith('language:') else ('transforms.json', base)
        safe = name.replace(':', '_').replace('/', '_')
        target = Path(args.scratch) / safe
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(PACK, target / 'aii')
        t = copy.deepcopy(original)
        edit(t)
        if name != 'identity' and t == original:
            print(f'{name}: no change (skipped)')
            continue
        (target / 'aii' / file).write_text(json.dumps(t, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        w = subprocess.run([NODE, str(ROOT / 'tools/check-classes.mjs'), 'aii', '--write', '--languages', str(target)],
                           capture_output=True, text=True)
        if w.returncode != 0:
            print(f'{name}: KILLED (classes: {w.stderr.strip()[:200]})')
            continue
        r = subprocess.run([str(ROOT / 'build/language-conformance-test'), str(target / 'aii')], capture_output=True, text=True)
        fails = [l for l in (r.stdout + r.stderr).splitlines() if l.startswith('FAIL')]
        if r.returncode == 0:
            survivors.append(name)
            print(f'{name}: SURVIVED')
        else:
            print(f'{name}: killed by {len(fails)} failures, e.g. {fails[0][:160] if fails else (r.stdout + r.stderr)[-200:]}')
        shutil.rmtree(target)
    print(f'survivors: {survivors}')


if __name__ == '__main__':
    main()
