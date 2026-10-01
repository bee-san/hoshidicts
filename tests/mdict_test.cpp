// End-to-end MDX import: dictionary_importer::import on the fixtures in
// tests/fixtures/mdict, then DictionaryQuery lookups against the result.
//
//   mdict_test <tests/fixtures/mdict>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <map>
#include <random>
#include <string>
#include <vector>

#include "hoshidicts/importer.hpp"
#include "hoshidicts/query.hpp"

namespace {
int failures = 0;
std::filesystem::path fixtures;

void check(bool ok, const std::string& what) {
  if (!ok) {
    std::printf("FAIL %s\n", what.c_str());
    failures++;
  }
}

void check_contains(const std::string& haystack, const std::string& needle, const std::string& what) {
  if (haystack.find(needle) == std::string::npos) {
    std::printf("FAIL %s\n  \"%s\" not in: %s\n", what.c_str(), needle.c_str(), haystack.c_str());
    failures++;
  }
}

std::filesystem::path fresh_dir(const char* tag) {
  std::random_device rd;
  const auto dir = std::filesystem::temp_directory_path() / ("hoshidicts-mdict-" + std::string(tag) + "-" +
                                                              std::to_string(rd()));
  std::filesystem::create_directories(dir);
  return dir;
}

// Copies the fixture (and its sibling MDD when present) into `dir` so MDD
// discovery runs on real neighbours and imports it there.
ImportResult import_fixture(const std::filesystem::path& dir, const char* name, bool low_ram) {
  std::filesystem::copy_file(fixtures / name, dir / name, std::filesystem::copy_options::overwrite_existing);
  std::filesystem::path mdd = fixtures / name;
  mdd.replace_extension(".mdd");
  if (std::filesystem::exists(mdd)) {
    std::filesystem::copy_file(mdd, dir / mdd.filename(), std::filesystem::copy_options::overwrite_existing);
  }
  return dictionary_importer::import((dir / name).string(), dir.string(), low_ram);
}

std::string glossary_of(const std::vector<TermResult>& results, size_t term = 0, size_t glossary = 0) {
  if (results.size() <= term || results[term].glossaries.size() <= glossary) {
    return {};
  }
  return results[term].glossaries[glossary].glossary;
}

std::string read_file(const std::filesystem::path& path) {
  std::ifstream in(path, std::ios::binary);
  return std::string(std::istreambuf_iterator<char>(in), {});
}

void test_html_import() {
  const auto dir = fresh_dir("html");
  const ImportResult result = import_fixture(dir, "v2_utf8_lzo_html.mdx", false);
  check(result.success, "html: import succeeded: " + result.error);
  if (!result.success) {
    return;
  }
  check(result.title == "HTML Fixture", "html: title from header, got " + result.title);
  // 7 non-redirect entries + 1 resolved alias; the alias to a missing target is dropped.
  check(result.summary.counts.terms.total == 8, "html: 8 term rows, got " +
                                                    std::to_string(result.summary.counts.terms.total));
  check(result.summary.sequenced, "html: sequenced");
  check(result.summary.revision == "mdx import", "html: revision");
  check(result.summary.description == "HTML fixture with links, duplicates and a stylesheet", "html: description");
  // style.css, utf16.css, a.spx (sound://), img/pic.png; ../evil.png is rejected.
  check(result.summary.counts.media.total == 4,
        "html: 4 media files, got " + std::to_string(result.summary.counts.media.total));

  const std::string dict = (dir / result.title).string();
  DictionaryQuery query;
  check(query.add_term_dict(dict), "html: dictionary loads");

  check_contains(glossary_of(query.query("entry")), R"("href":"?query=alias")", "html: entry:// link");
  check_contains(glossary_of(query.query("entry")), R"({"tag":"a","href":"#","content":["snd"]})",
                 "html: sound:// is # with audio off");
  check_contains(glossary_of(query.query("alias")), "target of a link", "html: alias resolves to its target");
  check(query.query("missing-alias").empty(), "html: alias to a missing target is dropped");
  check(query.query("@@@LINK_target").size() == 1, "html: target itself is still a headword");

  const auto dup = query.query("dup");
  check(dup.size() == 1 && dup[0].glossaries.size() == 2, "html: duplicate headwords keep both entries");
  check_contains(glossary_of(dup, 0, 0), "first dup", "html: first duplicate");
  check_contains(glossary_of(dup, 0, 1), "second dup", "html: second duplicate");

  check_contains(glossary_of(query.query("食べる")),
                 R"({"tag":"span","style":{"fontWeight":"bold"},"content":["to eat"]})",
                 "html: StyleSheet backticks expanded and converted");
  check_contains(glossary_of(query.query("ruby")), R"({"tag":"img","path":"mdict-media/img/pic.png"})",
                 "html: image path under mdict-media/");
  check_contains(glossary_of(query.query("見出し")), R"("style":{"color":"red","fontSize":"12px"})",
                 "html: inline style on a Unicode headword");

  const auto styles = query.get_styles();
  check(styles.size() == 1, "html: one stylesheet");
  if (styles.size() == 1) {
    check_contains(styles[0].styles, "/* Source: style.css */\n.mdx-red { color: red; }", "html: MDD css");
    check_contains(styles[0].styles, "/* Source: utf16.css */\n.u16::before { content: \"\xe2\x86\x92\"; }",
                   "html: BOM-less UTF-16 css decoded");
    check_contains(styles[0].styles, "/* Source: entry/inline/1.css */\n.inline-x { color: blue; }",
                   "html: inline <style> collected");
  }

  const auto png = query.get_media_file(result.title, "mdict-media/img/pic.png");
  check(png.size() == 69 && png.size() > 4 && png[1] == 'P' && png[2] == 'N' && png[3] == 'G',
        "html: PNG from the MDD, got " + std::to_string(png.size()) + " bytes");
  check(!query.get_media_file(result.title, "mdict-media/a.spx").empty(), "html: sound asset extracted");
  check(query.get_media_file(result.title, "mdict-media/evil.png").empty(), "html: traversal key not imported");
  check(query.get_media_file(result.title, "mdict-media/../evil.png").empty(), "html: traversal path not imported");

  std::filesystem::remove_all(dir);
}

void expect_text_dictionary(const char* name) {
  const auto dir = fresh_dir("text");
  const ImportResult result = import_fixture(dir, name, false);
  check(result.success, std::string(name) + ": import succeeded: " + result.error);
  if (!result.success) {
    return;
  }
  check(result.summary.counts.terms.total == 4, std::string(name) + ": 4 terms");
  DictionaryQuery query;
  query.add_term_dict((dir / result.title).string());
  check(glossary_of(query.query("alpha")) == R"(["first definition"])",
        std::string(name) + ": Format=Text glossary is a plain string, got " + glossary_of(query.query("alpha")));
  check(glossary_of(query.query("日本語")) == R"(["Japanese text \"quoted\""])",
        std::string(name) + ": Unicode key and escaped text");
  check(glossary_of(query.query("beta")) == R"(["second\ndefinition with newline"])",
        std::string(name) + ": newline kept");
  std::filesystem::remove_all(dir);
}

void expect_import_fails(const char* name, const std::string& needle) {
  const auto dir = fresh_dir("bad");
  const ImportResult result = import_fixture(dir, name, false);
  check(!result.success, std::string(name) + ": import must fail");
  check(result.error.find(needle) != std::string::npos,
        std::string(name) + ": error \"" + result.error + "\" does not mention \"" + needle + "\"");
  size_t leftovers = 0;
  for (const auto& entry : std::filesystem::directory_iterator(dir)) {
    if (entry.is_directory()) {
      leftovers++;
    }
  }
  check(leftovers == 0, std::string(name) + ": no output directory left behind");
  std::filesystem::remove_all(dir);
}

void test_malformed() {
  expect_import_fails("bad_truncated.mdx", "truncated file");
  expect_import_fails("bad_adler.mdx", "Adler-32");
  expect_import_fails("bad_huge_block.mdx", "impossible size");
  expect_import_fails("bad_encrypted1.mdx", "registration-protected");
  expect_import_fails("bad_gbk.mdx", "unsupported MDX encoding: GBK");
  expect_import_fails("bad_v3.mdx", "unsupported MDX engine version 3.0");
  expect_import_fails("v2_utf8_lzo_html.mdd", "MDD resource file");
}

// Sibling MDDs: Dict.MDD is found for Dict.mdx regardless of case, and a
// numbered Dict.1.mdd is found when there is no plain Dict.mdd.
void test_mdd_discovery() {
  for (const char* mdd_name : {"Sib.MDD", "Sib.1.mdd"}) {
    const auto dir = fresh_dir("sib");
    std::filesystem::copy_file(fixtures / "v2_utf8_lzo_html.mdx", dir / "Sib.mdx");
    std::filesystem::copy_file(fixtures / "v2_utf8_lzo_html.mdd", dir / mdd_name);
    const ImportResult result = dictionary_importer::import((dir / "Sib.mdx").string(), dir.string(), false);
    check(result.success, std::string(mdd_name) + ": import succeeded: " + result.error);
    if (result.success) {
      DictionaryQuery query;
      query.add_term_dict((dir / result.title).string());
      check(query.get_media_file(result.title, "mdict-media/img/pic.png").size() == 69,
            std::string(mdd_name) + ": MDD discovered");
    }
    std::filesystem::remove_all(dir);
  }
  // No MDD at all is fine: the glossaries still import, just without media.
  const auto dir = fresh_dir("nomdd");
  std::filesystem::copy_file(fixtures / "v2_utf8_lzo_html.mdx", dir / "Alone.mdx");
  const ImportResult result = dictionary_importer::import((dir / "Alone.mdx").string(), dir.string(), false);
  check(result.success && result.summary.counts.media.total == 0, "no mdd: import succeeds without media");
  std::filesystem::remove_all(dir);
}

// low_ram must not change a single output byte.
void test_low_ram_identical() {
  const auto normal = fresh_dir("normal");
  const auto low = fresh_dir("lowram");
  const ImportResult a = import_fixture(normal, "v2_utf8_lzo_html.mdx", false);
  const ImportResult b = import_fixture(low, "v2_utf8_lzo_html.mdx", true);
  check(a.success && b.success, "low_ram: both imports succeed");
  if (a.success && b.success) {
    for (const auto& entry : std::filesystem::directory_iterator(normal / a.title)) {
      const std::string name = entry.path().filename().string();
      if (name == "index.json") {
        continue;  // importDate
      }
      check(read_file(entry.path()) == read_file(low / b.title / name), "low_ram: " + name + " identical");
    }
  }
  std::filesystem::remove_all(normal);
  std::filesystem::remove_all(low);
}

// Imports `fixture` and hands its loaded dictionary to `inspect`.
template <class Inspect>
void with_dictionary(const char* fixture, size_t expected_rows, Inspect inspect) {
  const auto dir = fresh_dir("redirect");
  const ImportResult result = import_fixture(dir, fixture, false);
  check(result.success, std::string(fixture) + ": import succeeded: " + result.error);
  if (result.success) {
    check(result.summary.counts.terms.total == expected_rows,
          std::string(fixture) + ": " + std::to_string(expected_rows) + " term rows, got " +
              std::to_string(result.summary.counts.terms.total));
    DictionaryQuery query;
    check(query.add_term_dict((dir / result.title).string()), std::string(fixture) + ": dictionary loads");
    inspect(query);
  }
  std::filesystem::remove_all(dir);
}

// Every glossary listed under `expression`, joined, and how many there are.
std::pair<size_t, std::string> senses_of(const DictionaryQuery& query, const std::string& expression) {
  size_t count = 0;
  std::string joined;
  for (const TermResult& term : query.query(expression)) {
    for (const GlossaryEntry& entry : term.glossaries) {
      count++;
      joined += entry.glossary;
    }
  }
  return {count, joined};
}

// @@@LINK= targets match keys under the header's KeyCaseSensitive and StripKey
// rules (absent: "No" and "Yes"), and chains resolve to any depth. The cases
// are manabitan's (REDIRECT_CASES in gen_fixtures.py) plus hachidori#437's
// reproduction: `present` keys become headwords, `absent` ones do not.
void test_redirect_key_rules() {
  struct Case {
    const char* fixture;
    size_t rows;
    std::vector<std::string> present;
    std::vector<std::string> absent;
  };
  const std::vector<Case> cases = {
      {"redirect_case_target.mdx", 2, {"Alias", "Target"}, {}},
      {"redirect_case_alias.mdx", 2, {"Read", "read"}, {}},
      {"redirect_case_sensitive.mdx", 1, {"Target"}, {"Alias"}},
      {"redirect_case_chain.mdx", 3, {"AliasOne", "AliasTwo", "Target"}, {}},
      {"redirect_strip_yes.mdx", 2, {"Alias", "foo-bar"}, {}},
      {"redirect_strip_no.mdx", 1, {"foo-bar"}, {"Alias"}},
      {"redirect_strip_chain.mdx", 4, {"Alias-One", "Middle", "foo-bar", "foobar"}, {}},
      {"redirect_strip_case_sensitive.mdx", 2, {"Alias", "Foo-Bar"}, {"WrongCase", "Cycle-One", "Cycle-Two"}},
      {"redirect_exact_cycle.mdx", 1, {"Read"}, {"read", "Loop", "Alias"}},
      {"key_rules.mdx", 7, {"Tシャツ", "ティーシャツ", "Wi-Fi", "ワイファイ", "Target", "AliasTwo", "AliasOne"}, {}},
      {"key_rules_exact.mdx", 5, {"Tシャツ", "Wi-Fi", "Target", "AliasTwo", "AliasOne"},
       {"ティーシャツ", "ワイファイ"}},
  };
  for (const Case& c : cases) {
    with_dictionary(c.fixture, c.rows, [&](const DictionaryQuery& query) {
      for (const std::string& key : c.present) {
        check(!query.query(key).empty(), std::string(c.fixture) + ": " + key + " is a headword");
      }
      for (const std::string& key : c.absent) {
        check(query.query(key).empty(), std::string(c.fixture) + ": " + key + " is not a headword");
      }
    });
  }
}

// An alias carries the senses of the key it names exactly; only a target that
// no key spells exactly falls back to the keys it folds to, with every sense.
void test_redirect_identity() {
  for (const char* fixture : {"redirect_exact_case.mdx", "redirect_exact_punctuation.mdx"}) {
    with_dictionary(fixture, 8, [&](const DictionaryQuery& query) {
      for (const char* alias : {"FirstAlias", "FirstChain"}) {
        const auto [count, joined] = senses_of(query, alias);
        const std::string what = std::string(fixture) + ": " + alias;
        check(count == 2, what + " has the two senses of its target, got " + std::to_string(count));
        check_contains(joined, "first meaning", what + " first sense");
        check_contains(joined, "second sense of first", what + " second sense");
        check(joined.find("other spelling meaning") == std::string::npos, what + " not the other spelling");
      }
      const auto [count, joined] = senses_of(query, "SecondAlias");
      check(count == 1, std::string(fixture) + ": SecondAlias has one sense");
      check_contains(joined, "other spelling meaning", std::string(fixture) + ": SecondAlias sense");
    });
  }
  with_dictionary("redirect_exact_chains.mdx", 6, [](const DictionaryQuery& query) {
    for (const auto& [alias, meaning] :
         {std::pair{"ViaUpper", "top meaning"}, std::pair{"ViaLower", "bottom meaning"}}) {
      const auto [count, joined] = senses_of(query, alias);
      check(count == 1, std::string("exact chains: ") + alias + " has one sense, got " + std::to_string(count));
      check_contains(joined, meaning, std::string("exact chains: ") + alias);
    }
  });
  with_dictionary("redirect_fallback.mdx", 6, [](const DictionaryQuery& query) {
    for (const char* alias : {"Fallback", "Chain"}) {
      const auto [count, joined] = senses_of(query, alias);
      check(count == 2, std::string("fallback: ") + alias + " has both senses, got " + std::to_string(count));
      check_contains(joined, "first meaning", std::string("fallback: ") + alias + " first sense");
      check_contains(joined, "second meaning", std::string("fallback: ") + alias + " second sense");
    }
  });
}
}

int main(int argc, char** argv) {
  if (argc < 2) {
    std::printf("usage: %s <fixture dir>\n", argv[0]);
    return 2;
  }
  fixtures = argv[1];
  test_html_import();
  expect_text_dictionary("v2_utf8_zlib_text.mdx");
  expect_text_dictionary("v2_utf16_encrypted2.mdx");
  expect_text_dictionary("v1_utf8_stored.mdx");
  test_malformed();
  test_mdd_discovery();
  test_low_ram_identical();
  test_redirect_key_rules();
  test_redirect_identity();
  if (failures == 0) {
    std::printf("ok\n");
  }
  return failures == 0 ? 0 : 1;
}
