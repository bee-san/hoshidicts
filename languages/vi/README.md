# Vietnamese (`vi`)

Draft written with the own rules (step 2 of docs/languages.md section 14);
the measurements and the final rule set come in later commits.

Vietnamese words do not inflect. A lookup has to undo two things:

- **Reduplication.** A word said twice, often with a levelled tone, softens or
  repeats it: *xanh xanh* (bluish) from *xanh*, *đo đỏ* (reddish) from *đỏ*,
  *man mát* from *mát*, *đi đi lại lại* from *đi lại*, *lôi tha lôi thôi* from
  *lôi thôi*. `sources/own.json` has four transforms for these.
- **Spelling variation.** The pack's processors compose decomposed letters
  (NFC), replace a mis-encoded `Ð`, read hyphenated compounds of older texts
  as words (*Hồng-bàng*), try both tone-mark styles (*hoà* / *hòa*), both i
  and y in Sino-Vietnamese syllables (*kĩ thuật* / *kỹ thuật*), and lower or
  capitalised forms (*VIỆT NAM* → *Việt Nam*).

## Sources and licences

- `sources/own.json`, `sources/own-processors.json` and the scripts in
  `sources/`: written for this pack (GPL-3.0-or-later) from the standard
  description of Vietnamese orthography and reduplication, before Yomitan's
  Vietnamese file was read.

## Rule provenance

To be measured.

## Measurements

To be measured.

## Known gaps

To be measured.
