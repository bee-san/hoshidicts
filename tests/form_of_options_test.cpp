// SPDX-License-Identifier: GPL-3.0-or-later
// How a pack that follows form-of references refines them (docs/languages.md,
// sections 4.4, 9.6 and 9.10): lookup.formOfIgnore, lookup.formOfNormalizer,
// the whole-word rule key, the "written form equals reading" key for packs
// whose readings are not required, lookup.confirmedOrder and lookup.ownEntry.
//
//   form-of-options-test <repo> <scratch dir>
//
// The fixture is tests/fixtures/form-of-options/ (its README lists what each
// row is for).
#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <random>
#include <string>
#include <utility>
#include <vector>

#include "hoshidicts/importer.hpp"
#include "hoshidicts/languages.hpp"
#include "hoshidicts/lookup.hpp"
#include "hoshidicts/query.hpp"
#include "languages/builtin_packs.hpp"
#include "languages/pack.hpp"

namespace fs = std::filesystem;
namespace lang = hoshidicts::lang;

namespace {
int failures = 0;

void check(bool ok, const std::string& what) {
  if (!ok) {
    ++failures;
    std::fprintf(stderr, "FAIL: %s\n", what.c_str());
  }
}

std::string read_file(const fs::path& path) {
  std::ifstream file(path, std::ios::binary);
  return std::string(std::istreambuf_iterator<char>(file), {});
}

// --- a stored ZIP of a fixture directory, imported -------------------------------

uint32_t crc32(const std::string& data) {
  uint32_t crc = 0xFFFFFFFFu;
  for (unsigned char c : data) {
    crc ^= c;
    for (int i = 0; i < 8; ++i) crc = (crc >> 1) ^ (0xEDB88320u & (0u - (crc & 1u)));
  }
  return ~crc;
}

template <typename T>
void put(std::string& out, T value) {
  char buf[sizeof(T)];
  std::memcpy(buf, &value, sizeof(T));
  out.append(buf, sizeof(T));
}

std::string build_zip(const fs::path& dir) {
  std::vector<std::pair<std::string, std::string>> files;
  for (const auto& entry : fs::directory_iterator(dir)) {
    files.emplace_back(entry.path().filename().string(), read_file(entry.path()));
  }
  std::ranges::sort(files);
  std::string out;
  std::string central;
  for (const auto& [name, data] : files) {
    const auto offset = static_cast<uint32_t>(out.size());
    const uint32_t crc = crc32(data);
    const auto size = static_cast<uint32_t>(data.size());
    put<uint32_t>(out, 0x04034b50);
    put<uint16_t>(out, 20);
    for (int i = 0; i < 4; ++i) put<uint16_t>(out, 0);
    put<uint32_t>(out, crc);
    put<uint32_t>(out, size);
    put<uint32_t>(out, size);
    put<uint16_t>(out, static_cast<uint16_t>(name.size()));
    put<uint16_t>(out, 0);
    out += name;
    out += data;
    put<uint32_t>(central, 0x02014b50);
    put<uint16_t>(central, 20);
    put<uint16_t>(central, 20);
    for (int i = 0; i < 4; ++i) put<uint16_t>(central, 0);
    put<uint32_t>(central, crc);
    put<uint32_t>(central, size);
    put<uint32_t>(central, size);
    put<uint16_t>(central, static_cast<uint16_t>(name.size()));
    for (int i = 0; i < 4; ++i) put<uint16_t>(central, 0);
    put<uint32_t>(central, 0);
    put<uint32_t>(central, offset);
    central += name;
  }
  const auto central_offset = static_cast<uint32_t>(out.size());
  out += central;
  put<uint32_t>(out, 0x06054b50);
  put<uint16_t>(out, 0);
  put<uint16_t>(out, 0);
  put<uint16_t>(out, static_cast<uint16_t>(files.size()));
  put<uint16_t>(out, static_cast<uint16_t>(files.size()));
  put<uint32_t>(out, static_cast<uint32_t>(central.size()));
  put<uint32_t>(out, central_offset);
  put<uint16_t>(out, 0);
  return out;
}

std::string import_fixture(const fs::path& fixture, const fs::path& scratch) {
  const fs::path zip = scratch / (fixture.filename().string() + ".zip");
  {
    const std::string data = build_zip(fixture);
    std::ofstream(zip, std::ios::binary).write(data.data(), static_cast<std::streamsize>(data.size()));
  }
  const auto imported = dictionary_importer::import(zip.string(), scratch.string());
  check(imported.success, "import " + fixture.string() + ": " + imported.error);
  return (scratch / dictionary_importer::folder_name(imported.summary.title)).string();
}

// --- describing results -------------------------------------------------------------

std::string trace_of(const LookupResult& r) {
  std::string out;
  for (const auto& t : r.trace) out += (out.empty() ? "" : ">") + t.id + (t.from_dictionary ? "*" : "");
  return out;
}

// expression(matched; deinflected text; trace, * marking a dictionary step)
std::string brief(const std::vector<LookupResult>& results) {
  std::string out;
  for (const auto& r : results) {
    out += (out.empty() ? "" : " ") + r.term.expression + "(" + r.matched + ";" + r.deinflected + ";" + trace_of(r) + ")";
  }
  return out.empty() ? "(none)" : out;
}

std::string glossaries(const TermResult& term) {
  std::string out;
  for (const auto& g : term.glossaries) out += (out.empty() ? "" : " + ") + g.glossary;
  return out;
}

// A copy of a text with one replacement, which must apply.
std::string replaced(std::string text, const std::string& from, const std::string& to) {
  const size_t at = text.find(from);
  check(at != std::string::npos, "the text has " + from);
  if (at != std::string::npos) text.replace(at, from.size(), to);
  return text;
}

// --- the fields -----------------------------------------------------------------------

void test_pack_fields(const fs::path& repo) {
  std::string error;
  const std::string tmpl = read_file(repo / "languages/_template/language.json");
  const std::string rules = read_file(repo / "languages/_template/transforms.json");
  const auto from_template = hoshidicts::parse_language_pack(tmpl, rules, &error);
  check(from_template != nullptr, "the template loads: " + error);
  if (from_template) {
    const auto& d = from_template->data();
    check(d.form_of_ignore.empty() && !d.form_of_normalizer && d.confirmed_order == lang::ConfirmedOrder::Discovery &&
              d.own_entry == lang::OwnEntry::First && d.readings == lang::Readings::None,
          "the template ignores no reference, normalizes none, orders confirmed ties by discovery, ranks the own "
          "entry first and has readings none");
  }
  // The built-in Japanese pack is parsed as trusted, which skips the shape of
  // capabilities but still reads readings.
  const auto ja = hoshidicts::LanguageRegistry::with_builtin().find("ja");
  check(ja && ja->data().readings == lang::Readings::Required && ja->data().form_of_ignore.empty() &&
            !ja->data().form_of_normalizer && ja->data().confirmed_order == lang::ConfirmedOrder::Discovery &&
            ja->data().own_entry == lang::OwnEntry::First,
        "the built-in Japanese pack has readings required and the defaults");
  {
    const auto trusted = lang::parse_pack(
        replaced(read_file(repo / "languages/ja/language.json"), R"("readings": "required")", R"("readings": "optional")"),
        read_file(repo / "languages/ja/transforms.json"), &error, true);
    check(trusted && trusted->readings == lang::Readings::Optional, "a trusted pack's readings are read: " + error);
  }
  // Without the fields, the defaults.
  const std::string fixture = read_file(repo / "tests/fixtures/form-of-options/languages/fx/language.json");
  const std::string fixture_rules = read_file(repo / "tests/fixtures/form-of-options/languages/fx/transforms.json");
  {
    std::string bare = replaced(fixture, "    \"formOfIgnore\": [\"eumhun\", \"classifier\"],\n", "");
    bare = replaced(bare, "    \"confirmedOrder\": \"discovery\",\n    \"ownEntry\": \"first\",\n", "");
    const size_t from = bare.find("    \"formOfNormalizer\"");
    const size_t to = bare.find("    \"functionWords\"");
    check(from != std::string::npos && to != std::string::npos, "the fixture has formOfNormalizer");
    if (from != std::string::npos && to != std::string::npos) bare.erase(from, to - from);
    const auto pack = lang::parse_pack(bare, fixture_rules, &error);
    check(pack && pack->form_of_ignore.empty() && !pack->form_of_normalizer &&
              pack->confirmed_order == lang::ConfirmedOrder::Discovery && pack->own_entry == lang::OwnEntry::First,
          "absent fields take their defaults: " + error);
  }
  const auto parsed = lang::parse_pack(fixture, fixture_rules, &error);
  check(parsed && parsed->form_of_ignore == std::vector<std::string>{"eumhun", "classifier"} && parsed->form_of_normalizer &&
            parsed->form_of_normalizer->size() == 3 && parsed->readings == lang::Readings::None,
        "the fixture's fields are read: " + error);
  if (parsed) {
    // formOfNormalizer is a named step list for tests/classes.json, after
    // readingNormalizer's place, and its class fields are recorded too.
    const auto named = std::ranges::find(parsed->named_steps, std::string("lookup.formOfNormalizer"), &lang::NamedSteps::name);
    check(named != parsed->named_steps.end() && named->steps.size() == 3, "formOfNormalizer is a named step list");
  }
  const auto values = [&](const std::string& with, const std::string& from, const std::string& to) {
    error.clear();
    const auto pack = lang::parse_pack(replaced(with, from, to), fixture_rules, &error);
    return pack == nullptr ? "refused: " + error : std::string("accepted");
  };
  check(values(fixture, R"("confirmedOrder": "discovery")", R"("confirmedOrder": "references")") == "accepted",
        "confirmedOrder references is accepted");
  check(values(fixture, R"("ownEntry": "first")", R"("ownEntry": "afterReferences")") == "accepted",
        "ownEntry afterReferences is accepted");
  check(values(fixture, R"("formOfIgnore": ["eumhun", "classifier"])", R"("formOfIgnore": [])") == "accepted",
        "an empty formOfIgnore is accepted");
  check(values(fixture, R"("readings": "none")", R"("readings": "optional")") == "accepted", "readings optional");
  const auto refused = [&](const std::string& from, const std::string& to, const std::string& reason) {
    const std::string got = values(fixture, from, to);
    check(got.find("refused: fx: language.json: " + reason) == 0, to + " is refused with \"" + reason + "\": " + got);
  };
  const std::string ignore = R"("formOfIgnore": ["eumhun", "classifier"])";
  refused(ignore, R"("formOfIgnore": "eumhun")", "lookup.formOfIgnore: must be an array, not a string");
  refused(ignore, R"("formOfIgnore": null)", "lookup.formOfIgnore: must be an array, not null");
  refused(ignore, R"("formOfIgnore": ["eumhun", 7])", "lookup.formOfIgnore[1]: must be a string, not a number");
  refused(ignore, R"("formOfIgnore": ["eumhun", ""])", "lookup.formOfIgnore[1]: may not be empty");
  refused(ignore, R"("formOfIgnore": ["eumhun", "classifier", "eumhun"])",
          "lookup.formOfIgnore[2]: the rule name \"eumhun\" is listed twice");
  const std::string normalize = R"({"normalize": "NFD"},)";
  refused(normalize, R"({"builtin": "kana.toHiragana"},)", "lookup.formOfNormalizer[0]: builtins are not allowed here");
  refused(normalize, R"({"alternatives": {"a": ["b"]}},)", "lookup.formOfNormalizer[0]: alternatives are not allowed here");
  refused(normalize, R"({"strip": "[a"},)", "lookup.formOfNormalizer[0].strip: ");
  refused(normalize, R"({"normalize": "NFX"},)", "lookup.formOfNormalizer[0].normalize: must be one of NFC, NFD, NFKC, NFKD");
  {
    // A one-step list may not be alternatives either.
    std::string one = fixture;
    const size_t from = one.find("\"formOfNormalizer\": [");
    const size_t to = one.find("    \"confirmedOrder\"");
    one.replace(from, to - from, "\"formOfNormalizer\": [{\"alternatives\": {\"a\": [\"b\"]}}],\n");
    error.clear();
    check(!lang::parse_pack(one, fixture_rules, &error) &&
              error == "fx: language.json: lookup.formOfNormalizer[0]: alternatives are not allowed here",
          "formOfNormalizer has no alternatives: " + error);
  }
  refused(R"("confirmedOrder": "discovery")", R"("confirmedOrder": "bank")",
          "lookup.confirmedOrder: must be one of discovery, references, not \"bank\"");
  refused(R"("confirmedOrder": "discovery")", R"("confirmedOrder": true)", "lookup.confirmedOrder: must be a string, not a boolean");
  refused(R"("ownEntry": "first")", R"("ownEntry": "last")",
          "lookup.ownEntry: must be one of first, afterReferences, not \"last\"");
  refused(R"("readings": "none")", R"("readings": "some")",
          "capabilities.readings: must be one of required, optional, none, not \"some\"");
  // With formOf "asTerm" every one keeps its default (it follows no reference).
  const std::string as_term = replaced(fixture, R"("formOf": "follow")", R"("formOf": "asTerm")");
  std::string as_term_bare = replaced(as_term, ignore, R"("formOfIgnore": [])");
  {
    const size_t from = as_term_bare.find("\"formOfNormalizer\": [");
    const size_t to = as_term_bare.find("    \"confirmedOrder\"");
    as_term_bare.replace(from, to - from, "\"formOfNormalizer\": null,\n");
  }
  error.clear();
  check(lang::parse_pack(as_term_bare, fixture_rules, &error) != nullptr,
        "asTerm accepts an empty formOfIgnore, a null formOfNormalizer and the default orders: " + error);
  const auto as_term_refused = [&](const std::string& with, const std::string& from, const std::string& to,
                                   const std::string& reason) {
    const std::string got = values(with, from, to);
    check(got == "refused: fx: language.json: " + reason, to + " with asTerm: " + got);
  };
  const std::string why = " with lookup.formOf \"asTerm\", which follows no reference";
  as_term_refused(as_term_bare, R"("formOfIgnore": [])", R"("formOfIgnore": ["eumhun"])", "lookup.formOfIgnore: must be empty" + why);
  as_term_refused(as_term_bare, R"("formOfNormalizer": null)", R"("formOfNormalizer": [{"case": "lower"}])",
                  "lookup.formOfNormalizer: must be null" + why);
  as_term_refused(as_term_bare, R"("confirmedOrder": "discovery")", R"("confirmedOrder": "references")",
                  "lookup.confirmedOrder: must be \"discovery\"" + why);
  as_term_refused(as_term_bare, R"("ownEntry": "first")", R"("ownEntry": "afterReferences")",
                  "lookup.ownEntry: must be \"first\"" + why);
}

// --- lookups --------------------------------------------------------------------------

void test_lookups(const fs::path& repo, const std::string& dictionary, DictionaryStorage storage,
                  DictionaryIndexStorage index) {
  const std::string mode = storage == DictionaryStorage::Paged ? " (paged)" : "";
  DictionaryQuery query;
  check(query.add_term_dict(dictionary, storage, index) && query.add_freq_dict(dictionary, storage, index),
        "load the fixture dictionary" + mode);
  const fs::path packs = repo / "tests/fixtures/form-of-options/languages";
  hoshidicts::LanguageRegistry registry;
  std::string error;
  check(registry.add_directory(packs.string(), &error), "the fixture pack loads: " + error);
  const std::string language = read_file(packs / "fx/language.json");
  const std::string transforms = read_file(packs / "fx/transforms.json");
  const auto add = [&](const std::string& code, std::string text, const std::string& rules) {
    text = replaced(text, R"("code": "fx")", "\"code\": \"" + code + "\"");
    check(registry.add(text, rules, &error), "the copy " + code + " loads: " + error);
  };
  // fi: no formOfIgnore; fn: no formOfNormalizer; fw: the particle rule is a
  // suffix rule, not wholeWord; fr: confirmedOrder references; fq: readings
  // required; fe: ownEntry afterReferences.
  add("fi", replaced(language, R"("formOfIgnore": ["eumhun", "classifier"])", R"("formOfIgnore": [])"), transforms);
  {
    std::string text = language;
    const size_t from = text.find("\"formOfNormalizer\": [");
    const size_t to = text.find("    \"confirmedOrder\"");
    text.replace(from, to - from, "\"formOfNormalizer\": null,\n");
    add("fn", text, transforms);
  }
  add("fw", language,
      replaced(transforms, R"({"type": "wholeWord", "inflected": "그는")", R"({"type": "suffix", "inflected": "그는")"));
  add("fr", replaced(language, R"("confirmedOrder": "discovery")", R"("confirmedOrder": "references")"), transforms);
  add("fq", replaced(language, R"("readings": "none")", R"("readings": "required")"), transforms);
  add("fe", replaced(language, R"("ownEntry": "first")", R"("ownEntry": "afterReferences")"), transforms);
  const Lookup lookup(query, registry);
  const auto run_with = [&](const std::string& text, const std::string& code, LookupOptions options) {
    options.language = code;
    return lookup.lookup(text, 16, 16, options);
  };
  const auto run = [&](const std::string& text, const std::string& code) { return brief(run_with(text, code, {})); };
  const auto run_in = [&](const std::string& text, const std::string& code) {
    LookupOptions options;
    options.language = code;
    return brief(lookup.lookup_dictionary(text, dictionary, 16, 16, options));
  };
  const auto expect = [&](const std::string& text, const std::string& code, const std::string& expected) {
    const std::string got = run(text, code);
    check(got == expected, text + " with " + code + mode + ": " + got);
    const std::string within = run_in(text, code);
    check(within == expected, "lookup_dictionary: " + text + " with " + code + mode + ": " + within);
  };

  // lookup.formOfIgnore. 줄 수's row has two references, one with a listed
  // rule (eumhun): neither is followed, so 수 no longer comes first over two
  // words; the row is only references, so it is no term either way.
  expect("줄 수 있어", "fi", "수(줄 수;수;eumhun*) 줄(줄;줄;)");
  expect("줄 수 있어", "fx", "줄(줄;줄;)");
  // classifier rows: one row per noun, each only a reference.
  expect("cái", "fi", "cái(cái;cái;) bàn(cái;bàn;classifier*) ghế(cái;ghế;classifier*)");
  expect("cái", "fx", "cái(cái;cái;)");
  // A row with a definition and a listed reference is an ordinary row,
  // without the reference in its glossary.
  expect("chiếc", "fi", "chiếc(chiếc;chiếc;) thuyền(chiếc;thuyền;classifier*)");
  expect("chiếc", "fx", "chiếc(chiếc;chiếc;)");
  {
    const auto r = run_with("chiếc", "fx", {});
    check(!r.empty() && glossaries(r[0].term) == R"(["single; piece"])", "chiếc keeps its own glossary" + mode);
  }
  // A reference whose rules are not listed is followed.
  expect("xe", "fx", "xe(xe;xe;) 車(xe;車;Hán-Nôm*)");

  // lookup.formOfNormalizer: a reference to dȁti, a text no row has, finds
  // dati after the steps; the trace is the reference's.
  expect("davati", "fn", "(none)");
  expect("davati", "fx", "dati(davati;dati;imperfective form*)");
  // The steps keep č, ć, š, ž, whose marks follow consonants.
  expect("pokušavati", "fn", "(none)");
  expect("pokušavati", "fx", "pokušati(pokušavati;pokušati;imperfective form*)");
  // A text a row has is never normalized: vrátiti is a headword, and a
  // reference-only row of dvȃ makes it a text with a row (one hop).
  expect("vraćati", "fx", "vrátiti(vraćati;vrátiti;imperfective form*)");
  expect("dvije", "fx", "(none)");

  // Whole-word rules (9.6). 그는's row names 글다 and the particle rule reaches
  // 그, both in one step: the whole-word rule's term comes first.
  expect("그는", "fx", "그(그는;그;particle) 글다(그는;글다;formal present determiner*)");
  // Without the whole-word rule (the same rule as a suffix rule), the
  // dictionary-confirmed 글다 stays first.
  expect("그는", "fw", "글다(그는;글다;formal present determiner*) 그(그는;그;particle)");
  // A whole-word result never outranks a longer match.
  expect("그는 것", "fx", "그는 것(그는 것;그는 것;) 그(그는;그;particle) 글다(그는;글다;formal present determiner*)");
  // A term that both a whole-word trace and a reference of the matched text
  // reach comes before one only a whole-word trace reaches: ciujn names ciu,
  // and the rules reach ciuj (and, in two steps, ciu).
  expect("ciujn", "fx", "ciu(ciujn;ciu;accusative plural*) ciuj(ciujn;ciuj;acc)");
  // Only a trace that starts with the whole-word rule counts: 그는요 reaches 그
  // through polite and then particle, so the confirmed 글다 comes first.
  expect("그는요", "fx", "글다(그는요;글다;polite*>formal present determiner*) 그(그는요;그;polite>particle)");
  // A whole-word trace counts whichever trace the term keeps: the yx rule
  // reaches wy first, and the whole-word rule's wyz, whose row names wy,
  // reaches it too, so wy comes before the confirmed wyc.
  expect("wyx", "fx", "wy(wyx;wy;yx) wyc(wyx;wyc;confirming*)");

  // "Written form equals reading" counts only where readings are required:
  // sui's reading is suī, sibus's is empty and so equals its expression.
  expect("sibi", "fx", "sui(sibi;sui;dative singular*) sibus(sibi;sibus;genitive singular*)");
  expect("sibi", "fq", "sibus(sibi;sibus;genitive singular*) sui(sibi;sui;dative singular*)");

  // lookup.confirmedOrder. dedit's rows name do, then dedo; the rule reaches
  // dedo first, so discovery order puts dedo first and the references' bank
  // order do.
  expect("dedit", "fx", "dedo(dedit;dedo;pres-3s) do(dedit;do;third-person singular perfect*)");
  expect("dedit", "fr", "do(dedit;do;third-person singular perfect*) dedo(dedit;dedo;pres-3s)");
  {
    // It is the last key before discovery: a frequency still decides first.
    LookupOptions by_frequency;
    by_frequency.frequency_dictionary = std::string("form-of-options");
    by_frequency.frequency_order = LookupFrequencyOrder::Ascending;
    const std::string got = brief(run_with("dedit", "fr", by_frequency));
    check(got == "dedo(dedit;dedo;pres-3s) do(dedit;do;third-person singular perfect*)",
          "a frequency decides before the references' order" + mode + ": " + got);
  }
  // A term named by several references goes by the first: tulit's rows name
  // fero, tulo, then fero again.
  expect("tulit", "fx", "tulo(tulit;tulo;pres-3s) fero(tulit;fero;third-person singular perfect*)");
  expect("tulit", "fr", "fero(tulit;fero;third-person singular perfect*) tulo(tulit;tulo;pres-3s)");

  // lookup.ownEntry. געווען's own entry and its row's reference to זײַן.
  expect("געווען", "fx", "געווען(געווען;געווען;) זײַן(געווען;זײַן;past participle*)");
  expect("געווען", "fe", "זײַן(געווען;זײַן;past participle*) געווען(געווען;געווען;)");
  // A longer match still comes first.
  expect("געווען אַמאָל", "fe",
         "געווען אַמאָל(געווען אַמאָל;געווען אַמאָל;) זײַן(געווען;זײַן;past participle*) געווען(געווען;געווען;)");
  // The own entry goes right after the terms its references name, before a
  // rule's term with as long a trace (bila), even one with a higher score.
  expect("bilo", "fx", "bilo(bilo;bilo;) biti(bilo;biti;neuter past participle*) bila(bilo;bila;fem)");
  expect("bilo", "fe", "biti(bilo;biti;neuter past participle*) bilo(bilo;bilo;) bila(bilo;bila;fem)");
  // It ranks as if its trace were as long as the shortest of theirs (two
  // steps for dobar), so a rule's term with a shorter trace comes before both.
  expect("dobro", "fx", "dobro(dobro;dobro;) dobra(dobro;dobra;fem) dobar(dobro;dobar;neuter*>singular*)");
  expect("dobro", "fe", "dobra(dobro;dobra;fem) dobar(dobro;dobar;neuter*>singular*) dobro(dobro;dobro;)");
  // The shortest: zeta's rows name zetan in two steps and zetin in one.
  expect("zeta", "fx", "zeta(zeta;zeta;) zetin(zeta;zetin;third*) zetan(zeta;zetan;first*>second*)");
  expect("zeta", "fe", "zetin(zeta;zetin;third*) zeta(zeta;zeta;) zetan(zeta;zetan;first*>second*)");
  // Only the terms with the own entry's processor steps count: Dobro as
  // written has no form-of row, so its own entry stays before the fem rule's
  // Dobra, while decapitalized dobro's own entry goes after dobar.
  expect("Dobro", "fe",
         "Dobro(Dobro;Dobro;) Dobra(Dobro;Dobra;fem) dobra(Dobro;dobra;fem) dobar(Dobro;dobar;neuter*>singular*) "
         "dobro(Dobro;dobro;)");
  // Each step count has its own shortest: Zeta's row names zetan in two
  // steps, the decapitalized zeta's rows name zetin in one.
  expect("Zeta", "fe", "zetan(Zeta;zetan;capitalized*>form*) Zeta(Zeta;Zeta;) zetin(Zeta;zetin;third*) zeta(Zeta;zeta;)");
  // A text without form-of rows keeps its own entry first.
  expect("bila", "fe", "bila(bila;bila;)");
  expect("biti", "fe", "biti(biti;biti;)");

  // Japanese (readings required) keeps the key: of two terms that tie on
  // every other key, the one whose reading equals its written form first.
  {
    const auto japanese = hoshidicts::LanguageRegistry::with_builtin();
    const Lookup ja(query, japanese);
    const auto r = ja.lookup("日本", 16, 16);
    std::string got;
    for (const auto& x : r) got += (got.empty() ? "" : " ") + x.term.expression + "[" + x.term.reading + "]";
    check(got == "日本[日本] 日本[にほん]", "Japanese: the reading key" + mode + ": " + got);
  }
}

}  // namespace

int main(int argc, char** argv) {
  if (argc != 3) {
    std::fprintf(stderr, "usage: form-of-options-test <repo> <scratch dir>\n");
    return 2;
  }
  const fs::path repo = argv[1];
  const fs::path scratch = fs::path(argv[2]) / ("form-of-options-" + std::to_string(std::random_device{}()));
  fs::create_directories(scratch);

  test_pack_fields(repo);
  const std::string dictionary = import_fixture(repo / "tests/fixtures/form-of-options/dictionary", scratch);
  test_lookups(repo, dictionary, DictionaryStorage::Mapped, DictionaryIndexStorage::Mapped);
  test_lookups(repo, dictionary, DictionaryStorage::Paged, DictionaryIndexStorage::Paged);

  fs::remove_all(scratch);
  if (failures != 0) {
    std::fprintf(stderr, "%d failures\n", failures);
    return 1;
  }
  std::printf("form-of-options: all checks passed\n");
  return 0;
}
