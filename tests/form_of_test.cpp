// SPDX-License-Identifier: GPL-3.0-or-later
// Form-of references (docs/languages.md, section 9.10): a pack whose
// lookup.formOf is "follow" reads a row's [term, [rules]] definitions as
// Yomitan's translator does, and "asTerm" (Japanese) reads the row as an
// ordinary term, exactly as the 35e2dab lookup kept in tests/reference/ does.
//
//   form-of-test <repo> <scratch dir>
//
// The fixture is tests/fixtures/form-of/ (its README lists what each row is for).
#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <random>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "hoshidicts/deinflector.hpp"
#include "hoshidicts/importer.hpp"
#include "hoshidicts/languages.hpp"
#include "hoshidicts/lookup.hpp"
#include "hoshidicts/query.hpp"
#include "hoshidicts_c.h"
#include "json/yomitan_parser.hpp"
#include "languages/pack.hpp"
#include "reference/deinflector.hpp"
#include "reference/lookup.hpp"
#include "reference/query.hpp"

namespace fs = std::filesystem;
namespace legacy = hoshidicts_legacy;

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
    put<uint16_t>(out, 0);
    put<uint16_t>(out, 0);
    put<uint16_t>(out, 0);
    put<uint16_t>(out, 0);
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

const LookupResult* find(const std::vector<LookupResult>& results, const std::string& expression) {
  for (const auto& r : results) {
    if (r.term.expression == expression) return &r;
  }
  return nullptr;
}

// Every field, in order, as the Japanese parity test compares them.
template <typename Result>
std::string describe(const Result& r) {
  std::string out = r.matched + "|" + r.deinflected + "|" + std::to_string(r.preprocessor_steps) + "|";
  for (const auto& t : r.trace) out += t.name + "~" + t.description + ";";
  const auto& term = r.term;
  out += "|" + term.expression + "|" + term.reading + "|" + term.rules + "|" + std::to_string(term.score) + "|";
  for (const auto& g : term.glossaries) {
    out += g.dict_name + "~" + g.glossary + "~" + g.definition_tags + "~" + g.term_tags + "~" + std::to_string(g.score) + ";";
  }
  out += "|";
  for (const auto& f : term.frequencies) {
    out += f.dict_name + ":";
    for (const auto& v : f.frequencies) out += std::to_string(v.value) + "~" + v.display_value + ",";
    out += ";";
  }
  out += "|";
  for (const auto& p : term.pitches) {
    out += p.dict_name + ":";
    for (const auto& x : p.pitches) out += std::to_string(x.position) + "~" + x.pattern + ",";
    for (const auto& t : p.transcriptions) out += t + ",";
    out += ";";
  }
  return out;
}

std::string frequencies(const TermResult& term) {
  std::string out;
  for (const auto& f : term.frequencies) {
    for (const auto& v : f.frequencies) out += (out.empty() ? "" : ",") + f.dict_name + ":" + v.display_value;
  }
  return out;
}

std::string transcriptions(const TermResult& term) {
  std::string out;
  for (const auto& p : term.pitches) {
    for (const auto& t : p.transcriptions) out += (out.empty() ? "" : ",") + t;
  }
  return out;
}

std::string glossaries(const TermResult& term) {
  std::string out;
  for (const auto& g : term.glossaries) out += (out.empty() ? "" : " + ") + g.dict_name + ":" + g.glossary;
  return out;
}

// A copy of a pack descriptor with one more replacement.
std::string replaced(std::string text, const std::string& from, const std::string& to) {
  const size_t at = text.find(from);
  check(at != std::string::npos, "the descriptor has " + from);
  if (at != std::string::npos) text.replace(at, from.size(), to);
  return text;
}

// --- the parser -----------------------------------------------------------------------

// What read_form_of finds: "formOf[rule,rule] formOf[...]".
std::string references(std::string_view definitions) {
  std::vector<FormOfReference> out;
  yomitan_parser::read_form_of(definitions, out);
  std::string text;
  for (const auto& r : out) {
    text += (text.empty() ? "" : " ") + r.form_of + "[";
    for (size_t i = 0; i < r.rules.size(); ++i) text += (i ? "," : "") + r.rules[i];
    text += "]";
  }
  return text;
}

void test_parser() {
  using Kind = yomitan_parser::FormOfKind;
  const auto kind = [](std::string_view definitions) { return yomitan_parser::form_of_kind(definitions); };
  const std::string_view only = R"([["walk",["simple past"]]])";
  check(references(only) == "walk[simple past]" && kind(only) == Kind::Only, "a reference-only row");
  const std::string_view beside = R"(["a",["b",["c","d"]],{"type":"text","text":"x"}])";
  check(references(beside) == "b[c,d]" && kind(beside) == Kind::WithOthers, "a reference beside definitions: " + references(beside));
  const std::string_view two = R"([["b",[]],["c",["r"]]])";
  check(references(two) == "b[] c[r]" && kind(two) == Kind::Only, "two references, in order");
  check(references(R"([["caf\u00e9",["\"q\"","a\\b"]]])") == "café[\"q\",a\\b]", "references are JSON-decoded");
  const std::string_view spaced = R"( [ [ "w" , [ "r1" , 7, "r2" ] ] , "d" ] )";
  check(references(spaced) == "w[r1,r2]" && kind(spaced) == Kind::WithOthers,
        "whitespace, a rule that is not a string: " + references(spaced));
  const std::string_view three = R"([["w",["r"],"extra"],["v",["s"]]])";
  check(references(three) == "v[s]", "an array of three elements is no reference (the schema's deinflection has two): " +
                                          references(three));
  const std::string_view none = R"([[],[5,["x"]],["",["e"]]])";
  check(references(none).empty() && kind(none) == Kind::None, "arrays that name no term are no references");
  const std::string_view no_rules = R"([["x","notarray"],["y"]])";
  check(references(no_rules).empty() && kind(no_rules) == Kind::None, "a formOf without a rule list is no reference");
  const std::string_view nested = R"([{"content":[["x",["y"]]]}])";
  check(references(nested).empty() && kind(nested) == Kind::None, "an array inside a definition is not a reference");
  check(references(R"("not an array")").empty() && kind(R"("not an array")") == Kind::None, "a value that is not an array");
  check(references(R"(["a]",["b\"]",["c"]]])") == "b\"][c]", "brackets and quotes inside strings");
  check(kind(R"(["a",{"type":"text","text":"b"}])") == Kind::None, "kind: no reference");
  check(kind(R"([["walk",["past"]],[],"d"])") == Kind::WithOthers, "kind: beside a definition");
  check(kind(R"(["d",["walk",["past"]]])") == Kind::WithOthers, "kind: a definition first");
  check(kind(R"([[],["walk",[]]])") == Kind::Only, "kind: a reference beside an array that is none");
  check(kind(R"(["a]]",{"b":"c"}])") == Kind::None, "kind: a closing pair inside a string is no reference");

  check(yomitan_parser::without_form_of(R"(["a",["b",["c"]],"d"])") == R"(["a","d"])", "references are dropped");
  check(yomitan_parser::without_form_of(R"([["b",[]]])") == "[]", "only references leave an empty list");
  check(yomitan_parser::without_form_of(R"([ "a" , {"k":[1,["x",["y"]]]} ])") == R"(["a",{"k":[1,["x",["y"]]]}])",
        "an object keeps its arrays: " + yomitan_parser::without_form_of(R"([ "a" , {"k":[1,["x",["y"]]]} ])"));
  check(yomitan_parser::without_form_of(R"(["a",[1,)") == R"(["a",[1,)", "a malformed list is unchanged");
}

// --- lookups --------------------------------------------------------------------------

struct Dictionaries {
  std::string forms;
  std::string lemmas;
  std::string japanese;
};

void test_follow(const fs::path& repo, const Dictionaries& d, DictionaryStorage storage, DictionaryIndexStorage index) {
  const std::string mode = storage == DictionaryStorage::Paged ? " (paged)" : "";
  DictionaryQuery query;
  check(query.add_term_dict(d.forms, storage, index) && query.add_freq_dict(d.forms, storage, index) &&
            query.add_pitch_dict(d.forms, storage, index) && query.add_term_dict(d.lemmas, storage, index),
        "load the form-of dictionaries" + mode);
  const fs::path packs = repo / "tests/fixtures/form-of/languages";
  hoshidicts::LanguageRegistry registry;
  std::string error;
  check(registry.add_directory(packs.string(), &error), "the form-of pack loads: " + error);
  const std::string language = read_file(packs / "fo/language.json");
  const std::string transforms = read_file(packs / "fo/transforms.json");
  // fa reads form-of rows as terms, ff follows them with traceSelection first.
  check(registry.add(replaced(replaced(language, R"("code": "fo")", R"("code": "fa")"), R"("formOf": "follow")",
                              R"("formOf": "asTerm")"),
                     transforms, &error),
        "the asTerm copy loads: " + error);
  check(registry.add(replaced(replaced(language, R"("code": "fo")", R"("code": "ff")"), R"("traceSelection": "shortest")",
                              R"("traceSelection": "first")"),
                     transforms, &error),
        "the traceSelection first copy loads: " + error);
  // fc looks up every prefix (character resolution).
  check(registry.add(replaced(replaced(language, R"("code": "fo")", R"("code": "fc")"), R"("searchResolution": "word")",
                              R"("searchResolution": "character")"),
                     transforms, &error),
        "the character resolution copy loads: " + error);
  const Lookup lookup(query, registry);
  const auto run = [&](const std::string& text, const std::string& code = "fo", LookupOptions options = {}) {
    options.language = code;
    return lookup.lookup(text, 16, 16, options);
  };
  const auto run_in = [&](const std::string& text, const std::string& dictionary, const std::string& code = "fo") {
    LookupOptions options;
    options.language = code;
    return lookup.lookup_dictionary(text, dictionary, 16, 16, options);
  };

  // A reference-only row the algorithm also reaches: one result, the lemma,
  // with the lemma's frequencies and pronunciations; the tie between the
  // algorithm's [past] and the dictionary's [simple past] (one step each)
  // goes to the first, the algorithm's.
  {
    const auto r = run("walked");
    check(brief(r) == "walk(walked;walk;past)", "walked follows to walk" + mode + ": " + brief(r));
    if (!r.empty()) {
      check(frequencies(r[0].term) == "forms:10", "the lemma's frequency, not the form's: " + frequencies(r[0].term));
      check(transcriptions(r[0].term) == "/wɔːk/", "the lemma's pronunciation: " + transcriptions(r[0].term));
      check(glossaries(r[0].term) == R"(forms:["to move on foot"] + lemmas:["(lemmas) to walk"])",
            "the lemma's glossaries in both dictionaries: " + glossaries(r[0].term));
    }
    const auto as_term = run("walked", "fa");
    check(brief(as_term) == "walked(walked;walked;) walk(walked;walk;past)",
          "asTerm: the row is an ordinary term first" + mode + ": " + brief(as_term));
    if (!as_term.empty()) {
      check(glossaries(as_term[0].term) == R"(forms:[["walk", ["simple past"]]])",
            "asTerm keeps the row's glossary as stored: " + glossaries(as_term[0].term));
      check(frequencies(as_term[0].term) == "forms:99", "asTerm: the row's own frequency");
    }
  }
  // The dictionary's trace is shorter than the algorithm's (past then neg):
  // shortest keeps it, first keeps the algorithm's, found first.
  {
    const auto shortest = run("unwalked");
    check(brief(shortest) == "walk(unwalked;walk;negative past*)", "shortest keeps the dictionary's trace: " + brief(shortest));
    if (!shortest.empty() && shortest[0].trace.size() == 1) {
      const auto& step = shortest[0].trace[0];
      check(step.from_dictionary && step.id == "negative past" && step.name == "negative past" && step.description.empty(),
            "a dictionary step: id and name the rule, no description");
    }
    const auto first = run("unwalked", "ff");
    const auto* walk = find(first, "walk");
    check(first.size() == 1 && walk != nullptr && walk->trace.size() == 2 && !walk->trace[0].from_dictionary,
          "first keeps the algorithm's trace: " + brief(first));
  }
  // Two references to one lemma: one result, the first reference's trace.
  check(brief(run("walks")) == "walk(walks;walk;third-person singular*)", "walks: " + brief(run("walks")));
  // A row with references and real glossaries stays, without its references;
  // a reference's rules each become a step.
  {
    const auto r = run("left");
    check(brief(r) == "left(left;left;) leave(left;leave;past*>participle*)", "left" + mode + ": " + brief(r));
    if (!r.empty()) {
      check(glossaries(r[0].term) == R"(forms:["opposite of right"])", "the references leave the glossary: " + glossaries(r[0].term));
      check(r[0].term.glossaries.size() == 1 && r[0].term.glossaries[0].drop_form_of, "the glossary is marked");
    }
    const auto as_term = run("left", "fa");
    check(brief(as_term) == "left(left;left;)", "asTerm reads left as a term: " + brief(as_term));
    if (!as_term.empty()) {
      check(glossaries(as_term[0].term) == R"(forms:["opposite of right", ["leave", ["past", "participle"]]])",
            "asTerm keeps the references in the glossary: " + glossaries(as_term[0].term));
    }
  }
  // Two references to two lemmas; the score orders them; the plural rule's
  // noun reading of leave fails the filter.
  check(brief(run("leaves")) == "leave(leaves;leave;third-person singular*) leaf(leaves;leaf;plural*)",
        "leaves: " + brief(run("leaves")));
  // A reference to a lemma no dictionary has: the row is dropped and nothing
  // replaces it.
  check(run("gone").empty(), "gone has no lemma: " + brief(run("gone")));
  check(brief(run("gone", "fa")) == "gone(gone;gone;)", "asTerm finds gone: " + brief(run("gone", "fa")));
  // A chain: went names wend, whose rows are all references (to wander).
  check(brief(run("went")) == "wander(went;wander;past*>archaic*)", "went: a chain of two hops, " + brief(run("went")));
  check(brief(run("wend")) == "wander(wend;wander;archaic*)", "wend: " + brief(run("wend")));
  // wty-es-en's fué names fue, whose row names ser and ir: the second hop's
  // lemmas, confirmed, come before fuera, which the voseo rule and fuer's
  // reference reach in as many steps.
  check(brief(run("fué")) ==
            "ser(fué;ser;alt-of*>third-person singular preterite*) ir(fué;ir;alt-of*>third-person singular preterite*) "
            "fuera(fué;fuera;voseo>alt-of*)",
        "fué: " + brief(run("fué")));
  // A cycle of reference-only rows ends without a result; three hops reach
  // gd, and a fourth (to he) is not taken.
  check(run("cyca").empty() && run("cycb").empty(), "a cycle ends: " + brief(run("cyca")));
  check(brief(run("ga")) == "gd(ga;gd;r1*>r2*>r3*)", "three hops: " + brief(run("ga")));
  check(run("ha").empty(), "a fourth hop is not taken: " + brief(run("ha")));
  // A chain that returns to the text whose row started it ends there: sa's
  // row names sc and sb without rules, and sb only names sa again, so sa is
  // not confirmed and sc, which is, comes first.
  check(brief(run("sa")) == "sc(sa;sc;) sa(sa;sa;)", "a chain back to its start: " + brief(run("sa")));
  // The filter applies to the row naming the reference: under booked's verb
  // reading, the reference-only row book (no part of speech) is not followed.
  check(brief(run("booked")) == "book(booked;book;past)", "booked does not follow book's reference: " + brief(run("booked")));
  {
    // A dictionary in pos_filter_exempt: its rows pass the filter, so the
    // row book's reference is followed under the verb reading too.
    LookupOptions exempt;
    exempt.pos_filter_exempt = {d.forms};
    check(brief(run("booked", "fo", exempt)) == "book(booked;book;past) bake(booked;bake;past>dialectal past*)",
          "pos_filter_exempt follows the reference: " + brief(run("booked", "fo", exempt)));
  }
  {
    const auto r = run("book");
    check(brief(r) == "book(book;book;) bake(book;bake;dialectal past*)", "book: " + brief(r));
    if (!r.empty()) {
      check(r[0].term.glossaries.size() == 1, "book has only its lemma row's glossary: " + glossaries(r[0].term));
    }
  }
  // Escaped strings in a reference are decoded.
  check(brief(run("caféd")) == "café(caféd;café;vérbéd*>\"quoted\"*)", "an escaped reference: " + brief(run("caféd")));
  // Arrays that name no term: the row is an ordinary term.
  {
    const auto r = run("oddity");
    check(r.size() == 1 && glossaries(r[0].term) == R"(forms:[[], [5, ["x"]], ["", ["empty"]], "a real definition"])",
          "oddity is an ordinary row: " + brief(r) + " " + (r.empty() ? "" : glossaries(r[0].term)));
  }
  // Capitals: the reference is followed from the preprocessed text, with its steps.
  {
    const auto r = run("Walked");
    check(brief(r) == "walk(Walked;walk;past)" && !r.empty() && r[0].preprocessor_steps == 1, "Walked: " + brief(r));
    const auto u = run("Unwalked");
    check(brief(u) == "walk(Unwalked;walk;negative past*)" && !u.empty() && u[0].preprocessor_steps == 1,
          "Unwalked keeps the processor step: " + brief(u));
  }

  // Dictionary-confirmed lemmas (9.6): the rules reach podar and poder from
  // puedo with the same length, steps and trace length; the row puedo names
  // poder, so poder comes first.
  {
    const auto r = run("puedo");
    check(brief(r) == "poder(puedo;poder;present-yo) podar(puedo;podar;present-yo)",
          "puedo: the confirmed lemma first" + mode + ": " + brief(r));
    check(brief(run_in("puedo", d.forms)) == "poder(puedo;poder;present-yo) podar(puedo;podar;present-yo)",
          "lookup_dictionary(forms): puedo: " + brief(run_in("puedo", d.forms)));
    // lemmas has no row puedo: the two tie on every key, and the one found
    // first (the -ar rule comes first) comes first.
    check(brief(run_in("puedo", d.lemmas)) == "podar(puedo;podar;present-yo) poder(puedo;poder;present-yo)",
          "a full tie keeps discovery order: " + brief(run_in("puedo", d.lemmas)));
    LookupOptions only_lemmas;
    only_lemmas.dictionaries = std::vector<std::string>{d.lemmas};
    check(brief(run("puedo", "fo", only_lemmas)) == "podar(puedo;podar;present-yo) poder(puedo;poder;present-yo)",
          "a selection without the row: discovery order");
    // A confirmed lemma never outranks a longer match ...
    check(brief(run("puedo ver")) ==
              "puedo ver(puedo ver;puedo ver;) poder(puedo;poder;present-yo) podar(puedo;podar;present-yo)",
          "a longer match first: " + brief(run("puedo ver")));
    // ... or one with fewer processor steps (Podar from Puedo as written,
    // poder from the decapitalized puedo).
    check(brief(run("Puedo")) == "Podar(Puedo;Podar;present-yo) poder(Puedo;poder;present-yo) podar(Puedo;podar;present-yo)",
          "fewer steps first: " + brief(run("Puedo")));
    // asTerm confirms nothing: the row is its first result.
    check(brief(run("puedo", "fa")).starts_with("puedo(puedo;puedo;) "), "asTerm: puedo: " + brief(run("puedo", "fa")));
    // Only a row of the matched text confirms: kits names kitten; kit, which
    // the plural rule reaches in as many steps, is also named, but by the row
    // of ki, a deinflected text, so kitten comes first.
    check(brief(run("kits")) == "kitten(kits;kitten;plural*) kit(kits;kit;plural)",
          "a deinflected text's row confirms nothing: " + brief(run("kits")));
    // ... nor a shorter trace: dogged names dog with two rules; the past rule
    // reaches dogg with one.
    check(brief(run("dogged")) == "dogg(dogged;dogg;past) dog(dogged;dog;past*>participle*)",
          "a shorter trace first: " + brief(run("dogged")));
  }
  // walkt's row has the same glossary as walked's, which the importer
  // compresses once: both are flagged.
  check(brief(run("walkt")) == "walk(walkt;walk;simple past*)", "a shared glossary is flagged for each row: " + brief(run("walkt")));
  // A tie on every key: discovery order, the order of the tie rules (d, c, b,
  // a), not the order of the terms.
  check(brief(run("zq")) == "zd(zq;zd;tie) zc(zq;zc;tie) zb(zq;zb;tie) za(zq;za;tie)",
        "a full tie keeps discovery order: " + brief(run("zq")));
  // Confirmation counts at the term's matched length only. With character
  // resolution, the row yq names ya at two code points; the tie2 rules reach
  // yb and ya from yqv at three, where nothing confirms them.
  check(brief(run("yqv", "fc")) == "yb(yqv;yb;tie2) ya(yqv;ya;tie2)",
        "a confirmation at a shorter match does not count: " + brief(run("yqv", "fc")));

  // The request's dictionary selection: the lemma is only in lemmas.
  {
    check(brief(run("strode")) == "stride(strode;stride;past*)", "strode finds stride in lemmas: " + brief(run("strode")));
    check(!run("strode").empty() && frequencies(run("strode")[0].term) == "forms:7",
          "the lemma's frequency through a reference: " + (run("strode").empty() ? "" : frequencies(run("strode")[0].term)));
    LookupOptions only_forms;
    only_forms.dictionaries = std::vector<std::string>{d.forms};
    check(run("strode", "fo", only_forms).empty(), "a selection without the lemma's dictionary: " + brief(run("strode", "fo", only_forms)));
    LookupOptions both;
    both.dictionaries = std::vector<std::string>{d.lemmas, d.forms};
    check(brief(run("strode", "fo", both)) == "stride(strode;stride;past*)", "a selection with both");
    LookupOptions only_lemmas;
    only_lemmas.dictionaries = std::vector<std::string>{d.lemmas};
    check(run("strode", "fo", only_lemmas).empty(), "a selection without the row's dictionary");
    // With metadata-only terms on, the followed lemma covers strode, so its
    // frequency row adds no term.
    LookupOptions metadata;
    metadata.metadata_only_terms = true;
    check(brief(run("strode", "fo", metadata)) == "stride(strode;stride;past*)",
          "the followed lemma is a match with glossaries: " + brief(run("strode", "fo", metadata)));
  }
  // lookup_dictionary follows references within its dictionary.
  {
    check(run_in("strode", d.forms).empty(), "lookup_dictionary(forms) does not reach lemmas");
    check(run_in("strode", d.lemmas).empty(), "lookup_dictionary(lemmas) has no strode");
    const auto in_forms = run_in("walked", d.forms);
    check(brief(in_forms) == "walk(walked;walk;past)" && !in_forms.empty() &&
              glossaries(in_forms[0].term) == R"(forms:["to move on foot"])",
          "lookup_dictionary(forms): walked: " + brief(in_forms) + " " + (in_forms.empty() ? "" : glossaries(in_forms[0].term)));
    check(brief(run_in("unwalked", d.forms)) == "walk(unwalked;walk;negative past*)", "lookup_dictionary(forms): unwalked");
    const auto in_lemmas = run_in("walked", d.lemmas);
    check(brief(in_lemmas) == "walk(walked;walk;past)" && !in_lemmas.empty() &&
              glossaries(in_lemmas[0].term) == R"(lemmas:["(lemmas) to walk"])",
          "lookup_dictionary(lemmas): walked through the rule only: " + brief(in_lemmas));
    check(run_in("gone", d.forms).empty() && brief(run_in("gone", d.forms, "fa")) == "gone(gone;gone;)",
          "lookup_dictionary: gone with follow and asTerm");
    check(brief(run_in("left", d.forms)) == "left(left;left;) leave(left;leave;past*>participle*)", "lookup_dictionary: left");
  }
}

// The C API marks dictionary steps.
void test_c_api(const fs::path& repo, const Dictionaries& d) {
  hd_query* q = hd_query_new();
  check(hd_query_add_term_dict(q, d.forms.c_str()) == 0, "C: add forms");
  hd_languages* languages = hd_languages_new();
  check(hd_languages_add_directory(languages, (repo / "tests/fixtures/form-of/languages").string().c_str()) == 0,
        "C: load the form-of pack");
  hd_lookup* l = hd_lookup_new_with_languages(q, languages);
  hd_language_request request;
  std::memset(&request, 0, sizeof request);
  request.struct_size = sizeof request;
  request.language = "fo";
  const hd_lookup_result* results = nullptr;
  size_t count = 0;
  const char* error = nullptr;
  hd_lookup_results* r = hd_lookup_run_with_language(l, "unwalked", 16, 16, nullptr, &request, &results, &count, &error);
  check(r != nullptr && count == 1 && results[0].trace_count == 1, "C: unwalked");
  if (r != nullptr && count == 1 && results[0].trace_count == 1) {
    check(hd_lookup_results_trace_from_dictionary(r, 0, 0) == 1, "C: the step is from the dictionary");
    check(std::string_view(results[0].trace[0].name.ptr, results[0].trace[0].name.len) == "negative past", "C: its name");
  }
  check(hd_lookup_results_trace_from_dictionary(r, 0, 1) == 0 && hd_lookup_results_trace_from_dictionary(r, 1, 0) == 0 &&
            hd_lookup_results_trace_from_dictionary(nullptr, 0, 0) == 0,
        "C: out of range is 0");
  hd_lookup_results_free(r);
  r = hd_lookup_run_with_language(l, "walked", 16, 16, nullptr, &request, &results, &count, &error);
  check(r != nullptr && count == 1 && results[0].trace_count == 1 && hd_lookup_results_trace_from_dictionary(r, 0, 0) == 0,
        "C: an algorithm step is not from the dictionary");
  hd_lookup_results_free(r);
  hd_lookup_free(l);
  hd_languages_free(languages);
  hd_query_free(q);
}

// Japanese reads form-of rows as terms: identical to the 35e2dab lookup. A
// copy of the pack that follows them shows what "follow" would change.
void test_japanese(const fs::path& repo, const Dictionaries& d) {
  DictionaryQuery query;
  check(query.add_term_dict(d.japanese), "load the Japanese form-of dictionary");
  legacy::DictionaryQuery old_query;
  old_query.add_term_dict(d.japanese);
  legacy::Deinflector old_deinflector;
  const legacy::Lookup old_lookup(old_query, old_deinflector);
  const auto registry = hoshidicts::LanguageRegistry::with_builtin();
  const Lookup lookup(query, registry);
  const std::vector<std::string> inputs = {"食べた", "食べたい", "食べました", "行った", "行ったら", "食べ物", "見た",
                                           "そんにゃ", "こんにゃ", "こんにゃく", "食べたにゃ"};
  for (const auto& input : inputs) {
    for (const bool neko : {false, true}) {
      LookupOptions options;
      options.neko_speech = neko;
      legacy::LookupOptions old_options;
      old_options.neko_speech = neko;
      const auto now = lookup.lookup(input, 16, 16, options);
      const auto old = old_lookup.lookup(input, 16, 16, old_options);
      bool same = now.size() == old.size();
      for (size_t i = 0; same && i < now.size(); ++i) same = describe(now[i]) == describe(old[i]);
      check(same, "Japanese (asTerm) equals the 35e2dab lookup: " + input + (neko ? " (neko)" : "") + ": " + brief(now));
      const auto now_in = lookup.lookup_dictionary(input, d.japanese, 16, 16, options);
      const auto old_in = old_lookup.lookup_dictionary(input, d.japanese, 16, 16, old_options);
      same = now_in.size() == old_in.size();
      for (size_t i = 0; same && i < now_in.size(); ++i) same = describe(now_in[i]) == describe(old_in[i]);
      check(same, "Japanese lookup_dictionary equals the 35e2dab lookup: " + input);
    }
  }
  check(brief(lookup.lookup("食べた")).starts_with("食べた(食べた;食べた;)"), "asTerm: the form-of row comes first");

  hoshidicts::LanguageRegistry follow;
  std::string error;
  check(follow.add(replaced(read_file(repo / "languages/ja/language.json"), R"("formOf": "asTerm")", R"("formOf": "follow")"),
                   read_file(repo / "languages/ja/transforms.json"), &error),
        "a Japanese copy that follows references: " + error);
  const Lookup followed(query, follow);
  // traceSelection first: the algorithm's -た, found before the reference.
  check(brief(followed.lookup("食べた")) == "食べる(食べた;食べる;-た)", "follow: 食べた: " + brief(followed.lookup("食べた")));
  check(followed.lookup("見た").empty(), "follow: 見た has no lemma: " + brief(followed.lookup("見た")));
  LookupOptions neko;
  neko.neko_speech = true;
  // A cat-speech reading that is a reference-only row: its reference is
  // followed, after the passes.
  check(brief(followed.lookup("そんにゃ", 16, 16, neko)) == "そう(そんにゃ;そう;nekoSpeech>adnominal*)",
        "follow: a pass's row is followed: " + brief(followed.lookup("そんにゃ", 16, 16, neko)));
  // A reference-only row the scan reaches covers its text, so the pass does
  // not read it.
  check(brief(followed.lookup("こんにゃ", 16, 16, neko)) == "こんな(こんにゃ;こんな;cat speech*)",
        "follow: the scan's references are followed before the passes: " + brief(followed.lookup("こんにゃ", 16, 16, neko)));
}

// --- the pack field -------------------------------------------------------------------

void test_pack_field(const fs::path& repo) {
  namespace lang = hoshidicts::lang;
  std::string error;
  const std::string tmpl = read_file(repo / "languages/_template/language.json");
  const std::string rules = read_file(repo / "languages/_template/transforms.json");
  const auto from_template = hoshidicts::parse_language_pack(tmpl, rules, &error);
  check(from_template && from_template->data().form_of == lang::FormOf::Follow, "the template follows references: " + error);
  const auto ja = hoshidicts::LanguageRegistry::with_builtin().find("ja");
  check(ja && ja->data().form_of == lang::FormOf::AsTerm, "the built-in Japanese pack reads them as terms");
  // Without the field a pack follows them, as Yomitan does.
  const auto absent = hoshidicts::parse_language_pack(replaced(tmpl, "    \"formOf\": \"follow\",\n", ""), rules, &error);
  check(absent && absent->data().form_of == lang::FormOf::Follow, "formOf defaults to follow: " + error);
  for (const char* value : {R"("maybe")", R"("asterm")", "true", "null"}) {
    error.clear();
    const auto bad = hoshidicts::parse_language_pack(replaced(tmpl, R"("formOf": "follow")", std::string(R"("formOf": )") + value),
                                                     rules, &error);
    check(!bad && error.find("lookup.formOf: ") != std::string::npos, std::string("formOf ") + value + " is refused: " + error);
  }
}

}  // namespace

int main(int argc, char** argv) {
  if (argc != 3) {
    std::fprintf(stderr, "usage: form-of-test <repo> <scratch dir>\n");
    return 2;
  }
  const fs::path repo = argv[1];
  const fs::path scratch = fs::path(argv[2]) / ("form-of-" + std::to_string(std::random_device{}()));
  fs::create_directories(scratch);

  test_parser();
  test_pack_field(repo);
  const fs::path fixtures = repo / "tests/fixtures/form-of";
  const Dictionaries d{.forms = import_fixture(fixtures / "forms", scratch),
                       .lemmas = import_fixture(fixtures / "lemmas", scratch),
                       .japanese = import_fixture(fixtures / "japanese", scratch)};
  test_follow(repo, d, DictionaryStorage::Mapped, DictionaryIndexStorage::Mapped);
  test_follow(repo, d, DictionaryStorage::Paged, DictionaryIndexStorage::Paged);
  test_c_api(repo, d);
  test_japanese(repo, d);

  fs::remove_all(scratch);
  if (failures != 0) {
    std::fprintf(stderr, "%d failures\n", failures);
    return 1;
  }
  std::printf("form-of: all checks passed\n");
  return 0;
}
