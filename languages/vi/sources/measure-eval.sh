#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later
# The eval-language numbers of README.md (Measurements 1). Not run by any test.
#
#   languages/vi/sources/measure-eval.sh <work dir> <imported wty-vi-en>
#
# Builds scratch copies of the pack with each rule set (build-pack.mjs --set),
# then runs `hoshidicts-cli eval-language --dictionary` on the sample
# (corpus.tsv and gaps.tsv together) and on cases.tsv, each as it is (every
# option on) and with a `# options: default` first line, and prints one TSV line
# per run: set, file, mode, recall, negatives passed, false candidates, first rank.
set -euo pipefail
repo=$(cd "$(dirname "$0")/../../.." && pwd)
work=$1
dict=$2
cli=$repo/build/hoshidicts-cli
tests=$repo/languages/vi/tests
mkdir -p "$work/eval"
for set in own yomitan union final; do
  node "$repo/languages/vi/sources/build-pack.mjs" --set "$set" --out "$work/eval/$set" > /dev/null
done
{ grep -v '^#' "$tests/corpus.tsv"; grep -v '^#' "$tests/gaps.tsv"; } > "$work/eval/sample.body"
{ echo '# category	valid	source	term	rule	reasons'; cat "$work/eval/sample.body"; } > "$work/eval/sample.tsv"
{ echo '# options: default'; cat "$work/eval/sample.tsv"; } > "$work/eval/sample-default.tsv"
cp "$tests/cases.tsv" "$work/eval/cases.tsv"
{ echo '# options: default'; cat "$tests/cases.tsv"; } > "$work/eval/cases-default.tsv"
printf 'set\tfile\tmode\trecall\tnegatives\tfalseCandidates\tfirstRank\n'
for set in own yomitan union final; do
  for file in sample cases; do
    for mode in all default; do
      tsv=$work/eval/$file.tsv
      [ "$mode" = default ] && tsv=$work/eval/$file-default.tsv
      "$cli" --languages "$work/eval/$set" eval-language vi "$tsv" --dictionary "$dict" |
        python3 -c "import json,sys; d=json.load(sys.stdin); f=lambda v: '-' if v is None else (f'{v:.3f}' if isinstance(v, float) else str(v)); print('\t'.join(['$set','$file','$mode']+[f(d.get(k)) for k in ('recall','negativesPassed','falseCandidates','firstRank')]))"
    done
  done
done
