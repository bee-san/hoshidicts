// Terms without part-of-speech tags (docs/languages.md, sections 4.4, 9.4 and
// 9.10): with lookup.untaggedTerms "filter" (the default, Yomitan's
// behaviour) a dictionary row whose `rules` name no tag matches only a form
// without conditions; with "pass" it carries D, the bits of every condition
// with isDictionaryForm, so it matches every form whose conditions overlap D,
// and a form-of row without tags is followed from such forms too. Tagged rows
// are filtered as before in both modes.
//
//   untagged-terms-test <repo> <scratch dir>
//
// The fixture is tests/fixtures/untagged-terms/ (its README lists what each
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
#include "languages/pack.hpp"

namespace fs = std::filesystem;

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

// A copy of a pack descriptor with one replacement.
std::string replaced(std::string text, const std::string& from, const std::string& to) {
  const size_t at = text.find(from);
  check(at != std::string::npos, "the descriptor has " + from);
  if (at != std::string::npos) text.replace(at, from.size(), to);
  return text;
}

// --- the field ------------------------------------------------------------------------

void test_pack_field(const fs::path& repo) {
  namespace lang = hoshidicts::lang;
  std::string error;
  const std::string tmpl = read_file(repo / "languages/_template/language.json");
  const std::string rules = read_file(repo / "languages/_template/transforms.json");
  const auto from_template = hoshidicts::parse_language_pack(tmpl, rules, &error);
  check(from_template && from_template->data().untagged_terms == lang::UntaggedTerms::Filter,
        "the template filters untagged terms: " + error);
  const auto ja = hoshidicts::LanguageRegistry::with_builtin().find("ja");
  check(ja && ja->data().untagged_terms == lang::UntaggedTerms::Filter, "the built-in Japanese pack filters them");
  // Without the field a pack filters them, as Yomitan does.
  const auto absent = hoshidicts::parse_language_pack(replaced(tmpl, "    \"untaggedTerms\": \"filter\",\n", ""), rules, &error);
  check(absent && absent->data().untagged_terms == lang::UntaggedTerms::Filter, "untaggedTerms defaults to filter: " + error);
  const auto pass = hoshidicts::parse_language_pack(replaced(tmpl, R"("untaggedTerms": "filter")", R"("untaggedTerms": "pass")"),
                                                    rules, &error);
  check(pass && pass->data().untagged_terms == lang::UntaggedTerms::Pass, "untaggedTerms pass is read: " + error);
  for (const char* value : {R"("maybe")", R"("Pass")", R"("")", "true", "null", "[]"}) {
    error.clear();
    const auto bad = hoshidicts::parse_language_pack(
        replaced(tmpl, R"("untaggedTerms": "filter")", std::string(R"("untaggedTerms": )") + value), rules, &error);
    check(!bad && error.find("lookup.untaggedTerms: ") != std::string::npos,
          std::string("untaggedTerms ") + value + " is refused: " + error);
  }

  // D, the conditions an untagged row carries under "pass": v (with its
  // subConditions v_ar and v_other) and n, not the intermediate vf.
  const fs::path pack_dir = repo / "tests/fixtures/untagged-terms/languages/ut";
  const auto pack = hoshidicts::parse_language_pack(read_file(pack_dir / "language.json"),
                                                    read_file(pack_dir / "transforms.json"), &error);
  check(pack && pack->data().transforms, "the untagged-terms pack loads: " + error);
  if (pack && pack->data().transforms) {
    const auto& set = *pack->data().transforms;
    const uint32_t d = set.dictionary_form_mask();
    check(d == (set.condition_bits("v") | set.condition_bits("n")), "D is the bits of v and n: " + std::to_string(d));
    check((d & set.condition_bits("v_ar")) != 0 && (d & set.condition_bits("v_other")) != 0,
          "D holds the subConditions of v");
    check((d & set.condition_bits("vf")) == 0, "D leaves out vf, which is no dictionary form");
  }
  check(lang::untagged("") && lang::untagged(" ") && lang::untagged(" \t\n") && !lang::untagged("v") &&
            !lang::untagged(" v ") && !lang::untagged("zz"),
        "a row is untagged when its rules name no tag");
}

// --- lookups ------------------------------------------------------------------------

void test_lookups(const fs::path& repo, const std::string& dictionary, DictionaryStorage storage,
                  DictionaryIndexStorage index) {
  const std::string mode = storage == DictionaryStorage::Paged ? " (paged)" : "";
  DictionaryQuery query;
  check(query.add_term_dict(dictionary, storage, index), "load the untagged dictionary" + mode);
  const fs::path packs = repo / "tests/fixtures/untagged-terms/languages";
  hoshidicts::LanguageRegistry registry;
  std::string error;
  check(registry.add_directory(packs.string(), &error), "the untagged-terms pack loads: " + error);
  // up is the same pack with untaggedTerms "pass".
  const std::string language = read_file(packs / "ut/language.json");
  check(registry.add(replaced(replaced(language, R"("code": "ut")", R"("code": "up")"), R"("untaggedTerms": "filter")",
                              R"("untaggedTerms": "pass")"),
                     read_file(packs / "ut/transforms.json"), &error),
        "the pass copy loads: " + error);
  const Lookup lookup(query, registry);
  const auto run = [&](const std::string& text, const std::string& code) {
    LookupOptions options;
    options.language = code;
    return lookup.lookup(text, 16, 16, options);
  };
  // filter, then pass, for each text.
  const auto expect = [&](const std::string& text, const std::string& filter, const std::string& pass) {
    const std::string f = brief(run(text, "ut"));
    const std::string p = brief(run(text, "up"));
    check(f == filter, text + " with filter" + mode + ": " + f);
    check(p == pass, text + " with pass" + mode + ": " + p);
  };

  // A tagged term of the rule's part of speech: as before in both modes.
  expect("walked", "walk(walked;walk;past)", "walk(walked;walk;past)");
  expect("books", "book(books;book;plural)", "book(books;book;plural)");
  // An untagged term: only with pass, for a verb and a noun rule.
  expect("talked", "(none)", "talk(talked;talk;past)");
  expect("casas", "(none)", "casa(casas;casa;plural)");
  // rules " " names no tag either.
  expect("lifted", "(none)", "lift(lifted;lift;past)");
  // A tagged term of another part of speech, and a row whose only tag the
  // pack does not know: never.
  expect("booked", "(none)", "(none)");
  expect("picked", "(none)", "(none)");
  // pass gives every untagged term the rule reaches, here a pronoun too;
  // the score orders the two.
  expect("used", "(none)", "use(used;use;past) us(used;us;past)");
  // A term with a tagged verb row and an untagged noun row: the untagged row
  // lets the noun rule's form match the term, with both its rows.
  expect("sails", "(none)", "sail(sails;sail;plural)");
  {
    const auto sails = run("sails", "up");
    check(!sails.empty() && sails[0].term.glossaries.size() == 2, "sails keeps both rows of sail" + mode);
  }
  // The same with the untagged row first: a term's rows count together.
  expect("parks", "(none)", "park(parks;park;plural)");
  expect("parked", "park(parked;park;past)", "park(parked;park;past)");
  // D: casa-se gives casa with the intermediate vf, which is no dictionary
  // form, and casar (v_ar, a subcondition of v) from it. pass matches only
  // casar; an untagged term that matched every condition would put casa first.
  expect("casa-se", "(none)", "casar(casa-se;casar;enclitic>infinitive)");
  // The text as written has no conditions: an untagged term matches it in
  // both modes, and the infinitive rule's v_ar matches only with pass.
  expect("casa", "casa(casa;casa;)", "casa(casa;casa;) casar(casa;casar;infinitive)");

  // Form-of rows. Untagged: followed from the text as written in both modes,
  // from a conditioned form only with pass, and never from a form with only
  // intermediate conditions (mata-se gives mata with vf).
  expect("spoke", "speak(spoke;speak;past*)", "speak(spoke;speak;past*)");
  expect("unspoke", "(none)", "speak(unspoke;speak;neg>past*)");
  expect("mata", "mato(mata;mato;feminine*)", "mato(mata;mato;feminine*)");
  expect("mata-se", "(none)", "(none)");
  // An untagged form-of row a rule reaches beside the lemma: bak names bark.
  expect("baked", "(none)", "bake(baked;bake;past) bark(baked;bark;past>dialectal*)");
  // Tagged: as before in both modes.
  expect("unran", "run(unran;run;neg>past*)", "run(unran;run;neg>past*)");
  expect("undice", "(none)", "(none)");

  // lookup_dictionary runs the same filter.
  LookupOptions options;
  options.language = "up";
  const std::string within = brief(lookup.lookup_dictionary("talked", dictionary, 16, 16, options));
  check(within == "talk(talked;talk;past)", "lookup_dictionary with pass" + mode + ": " + within);
  options.language = "ut";
  const std::string within_filter = brief(lookup.lookup_dictionary("talked", dictionary, 16, 16, options));
  check(within_filter == "(none)", "lookup_dictionary with filter" + mode + ": " + within_filter);
}

}  // namespace

int main(int argc, char** argv) {
  if (argc != 3) {
    std::fprintf(stderr, "usage: untagged-terms-test <repo> <scratch dir>\n");
    return 2;
  }
  const fs::path repo = argv[1];
  const fs::path scratch = fs::path(argv[2]) / ("untagged-terms-" + std::to_string(std::random_device{}()));
  fs::create_directories(scratch);

  test_pack_field(repo);
  const std::string dictionary = import_fixture(repo / "tests/fixtures/untagged-terms/dictionary", scratch);
  test_lookups(repo, dictionary, DictionaryStorage::Mapped, DictionaryIndexStorage::Mapped);
  test_lookups(repo, dictionary, DictionaryStorage::Paged, DictionaryIndexStorage::Paged);

  fs::remove_all(scratch);
  if (failures != 0) {
    std::fprintf(stderr, "%d failures\n", failures);
    return 1;
  }
  std::printf("untagged-terms: all checks passed\n");
  return 0;
}
