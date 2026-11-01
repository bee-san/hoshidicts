// SPDX-License-Identifier: GPL-3.0-or-later
// The Japanese parity tests (docs/languages.md, section 11.3): the language
// framework against the 35e2dab pipeline kept in tests/reference/.
//
//   ja-parity-test deinflect <repo>   ja-deinflect-parity
//   ja-parity-test process <repo>     ja-process-parity
//   ja-parity-test lookup <repo> <tmp> ja-lookup-parity (and the selection case)
//
// Every comparison requires identical output, every field in the same order;
// traces compare by name and description, and each Japanese transform id must
// equal its name (the cat-speech step's id is its variant pass, nekoSpeech).
#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <map>
#include <set>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include <utf8.h>

#include "hoshidicts/deinflector.hpp"
#include "hoshidicts/importer.hpp"
#include "hoshidicts/languages.hpp"
#include "hoshidicts/lookup.hpp"
#include "hoshidicts/query.hpp"
#include "languages/pack.hpp"
#include "languages/steps.hpp"
#include "reference/deinflector.hpp"
#include "reference/lookup.hpp"
#include "reference/query.hpp"
#include "reference/text_processor.hpp"

namespace legacy = hoshidicts_legacy;
namespace fs = std::filesystem;

namespace {

size_t failures = 0;
size_t compared = 0;

void fail(const std::string& what) {
  if (++failures <= 20) {
    std::fprintf(stderr, "FAIL: %s\n", what.c_str());
  }
}

// --- inputs ---------------------------------------------------------------------

std::vector<std::string> corpus_sources(const fs::path& repo) {
  std::vector<std::string> sources;
  std::set<std::string> seen;
  for (const char* name : {"yomitan.tsv", "cases.tsv"}) {
    std::ifstream file(repo / "languages" / "ja" / "tests" / name);
    std::string line;
    while (std::getline(file, line)) {
      if (line.empty() || line[0] == '#') continue;
      const size_t a = line.find('\t');
      const size_t b = line.find('\t', a + 1);
      const size_t c = line.find('\t', b + 1);
      std::string source = line.substr(b + 1, c - b - 1);
      if (seen.insert(source).second) sources.push_back(std::move(source));
    }
  }
  return sources;
}

std::vector<std::string> prefixes(const std::vector<std::string>& texts) {
  std::vector<std::string> out;
  std::set<std::string> seen;
  for (const auto& text : texts) {
    for (auto it = text.begin(); it != text.end();) {
      utf8::next(it, text.end());
      std::string prefix(text.begin(), it);
      if (seen.insert(prefix).second) out.push_back(std::move(prefix));
    }
  }
  return out;
}

std::vector<std::string> deep_chains() {
  std::vector<std::string> out;
  for (int n = 1; n <= 40; ++n) {
    std::string s = "食べ";
    for (int i = 0; i < n; ++i) s += "させ";
    out.push_back(s + "る");
    if (n % 5 == 0) {
      out.push_back(s + "られなかった");
      std::string t = "読ま";
      for (int i = 0; i < n; ++i) t += "せ";
      out.push_back(t + "てしまいました");
    }
  }
  return out;
}

// splitmix64: the same strings on every platform.
struct Rng {
  uint64_t state;
  uint64_t next() {
    uint64_t z = (state += 0x9E3779B97F4A7C15ull);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
    return z ^ (z >> 31);
  }
  size_t below(size_t n) { return static_cast<size_t>(next() % n); }
};

// 100,000 strings from a fixed seed: rule endings chained onto kana, kanji
// and Latin stems. Each chain step either inflects the text (replaces a
// rule's deinflected ending with its inflected one) or appends an ending.
std::vector<std::string> generated(const std::vector<std::string>& sources, size_t count) {
  const auto pack = hoshidicts::builtin_language_pack("ja");
  const auto& rules = pack->data().transforms->rules;
  std::vector<std::string> kanji;
  {
    std::set<char32_t> seen;
    for (const auto& s : sources) {
      for (auto it = s.begin(); it != s.end();) {
        const char32_t c = utf8::next(it, s.end());
        if (c >= 0x4E00 && c <= 0x9FFF && seen.insert(c).second) {
          std::string u;
          utf8::append(c, std::back_inserter(u));
          kanji.push_back(u);
        }
      }
    }
  }
  const auto from = [](char32_t first, char32_t last) {
    std::vector<std::string> out;
    for (char32_t c = first; c <= last; ++c) {
      std::string u;
      utf8::append(c, std::back_inserter(u));
      out.push_back(u);
    }
    return out;
  };
  const std::vector<std::vector<std::string>> pools = {
      from(0x3041, 0x3096),  // hiragana
      from(0x30A1, 0x30FC),  // katakana and the prolonged sound mark
      kanji,
      from('a', 'z'),
      from('A', 'Z'),
      from('0', '9'),
      from(0xFF10, 0xFF19),  // full-width digits
      from(0xFF21, 0xFF3A),  // full-width Latin
      from(0xFF66, 0xFF9F),  // half-width katakana
      {"っ", "ッ", "ー", "ゝ", "ゞ", "ヽ", "ヾ", "々", "・", "〇", "にゃ", "ニャ", "\u2F49", "\u3402", "㋕", "①",
       "ｶﾞ", "\u3099", "\u309A", "。", "の", "　", " "},
  };
  Rng rng{0x6A70617269747921ull};  // "japarity!"
  std::vector<std::string> out;
  out.reserve(count);
  for (size_t i = 0; i < count; ++i) {
    std::string s;
    const size_t stem = rng.below(4);
    for (size_t k = 0; k < stem; ++k) {
      const auto& pool = pools[rng.below(pools.size())];
      if (!pool.empty()) s += pool[rng.below(pool.size())];
    }
    const size_t steps = rng.below(4);
    for (size_t k = 0; k < steps; ++k) {
      const auto& rule = rules[rng.below(rules.size())];
      if (!rule.b.empty() && s.ends_with(rule.b)) {
        s.resize(s.size() - rule.b.size());
      }
      s += rule.a;
    }
    if (rng.below(8) == 0) {
      const auto& pool = pools[rng.below(pools.size())];
      if (!pool.empty()) s += pool[rng.below(pool.size())];
    }
    out.push_back(std::move(s));
  }
  return out;
}

std::vector<std::string> all_inputs(const fs::path& repo) {
  const auto sources = corpus_sources(repo);
  std::vector<std::string> inputs = prefixes(sources);
  for (auto& s : deep_chains()) inputs.push_back(std::move(s));
  for (auto& s : generated(sources, 100000)) inputs.push_back(std::move(s));
  return inputs;
}

// --- deinflections and processors ------------------------------------------------

bool same_trace(const std::vector<TransformGroup>& a, const std::vector<legacy::TransformGroup>& b, bool neko) {
  if (a.size() != b.size()) return false;
  for (size_t i = 0; i < a.size(); ++i) {
    if (a[i].name != b[i].name || a[i].description != b[i].description) return false;
    const std::string_view expected_id = neko && i == 0 ? std::string_view("nekoSpeech") : std::string_view(a[i].name);
    if (a[i].id != expected_id) return false;
  }
  return true;
}

void compare_deinflections(const std::string& input, const std::vector<DeinflectionResult>& a,
                           const std::vector<legacy::DeinflectionResult>& b, bool neko) {
  ++compared;
  if (a.size() != b.size()) {
    fail((neko ? "neko " : "") + std::string("deinflect ") + input + ": " + std::to_string(a.size()) + " results, legacy " +
         std::to_string(b.size()));
    return;
  }
  for (size_t i = 0; i < a.size(); ++i) {
    if (a[i].text != b[i].text || a[i].conditions != b[i].conditions || !same_trace(a[i].trace, b[i].trace, neko)) {
      fail((neko ? "neko " : "") + std::string("deinflect ") + input + ": result " + std::to_string(i) + " is " + a[i].text +
           ", legacy " + b[i].text);
      return;
    }
  }
}

int run_deinflect(const fs::path& repo) {
  const Deinflector now;
  const legacy::Deinflector old;
  size_t results = 0;
  for (const auto& input : all_inputs(repo)) {
    const auto a = now.deinflect(input);
    const auto b = old.deinflect(input);
    compare_deinflections(input, a, b, false);
    results += b.size();
    const auto na = now.deinflect_neko_speech(input);
    const auto nb = old.deinflect_neko_speech(input);
    compare_deinflections(input, na, nb, true);
    results += nb.size();
  }
  std::printf("ja-deinflect-parity: %zu comparisons, %zu deinflections, %zu failures\n", compared, results, failures);
  return failures == 0 && compared > 100000 ? 0 : 1;
}

int run_process(const fs::path& repo) {
  const auto pack = hoshidicts::builtin_language_pack("ja");
  size_t variants = 0;
  for (const auto& input : all_inputs(repo)) {
    const auto a = hoshidicts::lang::process_text(pack->data().preprocessors, input, {});
    const auto b = legacy::text_processor::process(input);
    ++compared;
    variants += b.size();
    bool same = a.size() == b.size();
    for (size_t i = 0; same && i < a.size(); ++i) {
      same = a[i].text == b[i].text && a[i].steps == b[i].steps;
    }
    if (!same) {
      fail("process " + input + ": " + std::to_string(a.size()) + " variants, legacy " + std::to_string(b.size()));
    }
  }
  std::printf("ja-process-parity: %zu comparisons, %zu variants, %zu failures\n", compared, variants, failures);
  return failures == 0 && compared > 100000 ? 0 : 1;
}

// --- lookups ----------------------------------------------------------------------

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

// A stored ZIP of every file in `dir`, sorted by name.
std::string zip_directory(const fs::path& dir) {
  std::vector<std::pair<std::string, std::string>> files;
  for (const auto& entry : fs::directory_iterator(dir)) {
    if (!entry.is_regular_file()) continue;
    std::ifstream f(entry.path(), std::ios::binary);
    files.emplace_back(entry.path().filename().string(), std::string(std::istreambuf_iterator<char>(f), {}));
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
    put<uint16_t>(central, 0);
    put<uint16_t>(central, 0);
    put<uint16_t>(central, 0);
    put<uint16_t>(central, 0);
    put<uint32_t>(central, crc);
    put<uint32_t>(central, size);
    put<uint32_t>(central, size);
    put<uint16_t>(central, static_cast<uint16_t>(name.size()));
    put<uint16_t>(central, 0);
    put<uint16_t>(central, 0);
    put<uint16_t>(central, 0);
    put<uint16_t>(central, 0);
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

std::string import_fixture(const fs::path& fixture, const fs::path& tmp) {
  const fs::path zip = tmp / (fixture.filename().string() + ".zip");
  {
    const std::string data = zip_directory(fixture);
    std::ofstream(zip, std::ios::binary).write(data.data(), static_cast<std::streamsize>(data.size()));
  }
  const auto result = dictionary_importer::import(zip.string(), tmp.string());
  if (!result.success) {
    fail("import " + fixture.string() + ": " + result.error);
    return {};
  }
  return (tmp / dictionary_importer::folder_name(result.summary.title)).string();
}

struct Dict {
  std::string path;
  std::string title;
  bool freq;
  bool pitch;
  bool kanji;
};

template <typename Query>
void load(Query& query, const std::vector<const Dict*>& dicts) {
  for (const Dict* d : dicts) {
    if (!query.add_term_dict(d->path)) fail("add_term_dict " + d->path);
    if (d->freq && !query.add_freq_dict(d->path)) fail("add_freq_dict " + d->path);
    if (d->pitch && !query.add_pitch_dict(d->path)) fail("add_pitch_dict " + d->path);
    if (d->kanji && !query.add_kanji_dict(d->path)) fail("add_kanji_dict " + d->path);
  }
}

// One field-by-field description of a result, for comparing and printing.
template <typename Result>
std::string describe(const Result& r) {
  std::string out = r.matched + "|" + r.deinflected + "|" + std::to_string(r.preprocessor_steps) + "|";
  for (const auto& t : r.trace) out += t.name + "~" + t.description + ";";
  const auto& term = r.term;
  out += "|" + term.expression + "|" + term.reading + "|" + term.rules + "|" + std::to_string(term.score) + "|";
  for (const auto& g : term.glossaries) {
    out += g.dict_name + "~" + g.glossary + "~" + g.definition_tags + "~" + g.term_tags + "~" + std::to_string(g.score) + "~" +
           std::to_string(g.compressed_size) + ";";
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
    for (const auto& x : p.pitches) {
      out += std::to_string(x.position) + "~" + x.pattern + "~";
      for (int n : x.nasal) out += std::to_string(n) + ".";
      out += "~";
      for (int n : x.devoice) out += std::to_string(n) + ".";
      out += ",";
    }
    for (const auto& t : p.transcriptions) out += t + ",";
    out += ";";
  }
  return out;
}

template <typename Kanji>
std::string describe_kanji(const Kanji& k) {
  std::string out = k.character + "|";
  for (const auto& e : k.entries) {
    out += e.dict_name + "~" + e.onyomi + "~" + e.kunyomi + "~" + e.tags + "~";
    for (const auto& d : e.definitions) out += d + ",";
    std::map<std::string, std::string> stats(e.stats.begin(), e.stats.end());
    for (const auto& [key, value] : stats) out += key + "=" + value + ",";
    out += ";";
  }
  out += "|";
  for (const auto& f : k.frequencies) {
    out += f.dict_name + ":";
    for (const auto& v : f.frequencies) out += std::to_string(v.value) + "~" + v.display_value + ",";
    out += ";";
  }
  return out;
}

struct Config {
  std::string name;
  bool neko = false;
  bool metadata = false;
  LookupFrequencyOrder order = LookupFrequencyOrder::Auto;
  std::string frequency_dictionary;
  bool primary = false;
  int max_results = 16;
};

legacy::LookupFrequencyOrder legacy_order(LookupFrequencyOrder order) {
  switch (order) {
    case LookupFrequencyOrder::Auto:
      return legacy::LookupFrequencyOrder::Auto;
    case LookupFrequencyOrder::Ascending:
      return legacy::LookupFrequencyOrder::Ascending;
    case LookupFrequencyOrder::Descending:
      return legacy::LookupFrequencyOrder::Descending;
    case LookupFrequencyOrder::Disabled:
      return legacy::LookupFrequencyOrder::Disabled;
  }
  return legacy::LookupFrequencyOrder::Auto;
}

struct Pair {
  const Lookup* now;
  const legacy::Lookup* old;
};

template <typename A, typename B>
bool compare_results(const std::string& what, const A& a, const B& b) {
  ++compared;
  if (a.size() != b.size()) {
    fail(what + ": " + std::to_string(a.size()) + " results, legacy " + std::to_string(b.size()));
    return false;
  }
  for (size_t i = 0; i < a.size(); ++i) {
    const std::string da = describe(a[i]);
    const std::string db = describe(b[i]);
    if (da != db) {
      fail(what + ": result " + std::to_string(i) + "\n  new    " + da + "\n  legacy " + db);
      return false;
    }
    for (const auto& step : a[i].trace) {
      if (step.id != step.name && !(step.id == "nekoSpeech" && step.name == "neko speech")) {
        fail(what + ": trace id " + step.id + " is not its name " + step.name);
        return false;
      }
    }
  }
  return true;
}

// Looks `input` up with both engines under `config` and compares.
void compare_lookup(const Pair& pair, const std::string& input, size_t scan, const Config& config,
                    const std::string* dictionary, LookupOptions base = {}) {
  legacy::LookupOptions old_options;
  old_options.neko_speech = config.neko;
  old_options.metadata_only_terms = config.metadata;
  old_options.frequency_order = legacy_order(config.order);
  if (!config.frequency_dictionary.empty()) old_options.frequency_dictionary = config.frequency_dictionary;
  if (config.primary) {
    // A reading the default lookup returns last, so the option reorders.
    const auto plain = dictionary ? pair.old->lookup_dictionary(input, *dictionary, config.max_results, scan)
                                  : pair.old->lookup(input, config.max_results, scan);
    old_options.primary_reading = plain.empty() ? std::string("よみ") : plain.back().term.reading;
  }
  LookupOptions options = std::move(base);
  options.neko_speech = config.neko;
  options.metadata_only_terms = config.metadata;
  options.frequency_order = config.order;
  options.frequency_dictionary = old_options.frequency_dictionary;
  options.primary_reading = old_options.primary_reading;
  const std::string what = "lookup" + std::string(dictionary ? "_dictionary(" + *dictionary + ")" : "") + " [" +
                           config.name + ", scan " + std::to_string(scan) + "] " + input;
  if (dictionary != nullptr) {
    compare_results(what, pair.now->lookup_dictionary(input, *dictionary, config.max_results, scan, options),
                    pair.old->lookup_dictionary(input, *dictionary, config.max_results, scan, old_options));
  } else {
    compare_results(what, pair.now->lookup(input, config.max_results, scan, options),
                    pair.old->lookup(input, config.max_results, scan, old_options));
  }
}

const std::string long_key = "長い長い長い長い名前の付いた料理を食べる";

std::vector<std::string> special_inputs() {
  return {
      // The four benchmark words.
      "食べました", "走り出した", "美しい景色", "日本語を勉強しています",
      // The long key, an inflected form, the key followed by more text, and a
      // prefix that is not a key.
      long_key, "長い長い長い長い名前の付いた料理を食べました", long_key + "のが好きです",
      "長い長い長い長い名前の付いた料理", "長い長い長い長い名前",
      // Cat speech (README.md).
      "できにゃい", "そんにゃ", "こんにゃくって", "こんにゃく", "にゃあ", "俺にゃ", "たまにゃ", "ソーニャ", "おニャン子",
      "にゃぁ", "ですにゃ", "来ましたにゃ", "しにゃい", "わかりにゃした", "いにゃっしゃいます", "読んにゃ",
      // Terms only frequency and pitch rows have.
      "東京タワーに行く", "東京タワー", "食べ放題です", "日本語学校で", "辞書引きの", "美しい景色だ",
      // Latin and full-width text for the English dictionary.
      "walked", "Walk", "ａｂｃ", "abc def", "cats", "nya", "１２３",
  };
}

int run_lookup(const fs::path& repo, const fs::path& tmp_root) {
  const fs::path tmp = tmp_root / "ja-lookup-parity";
  fs::remove_all(tmp);
  fs::create_directories(tmp);
  const fs::path fixtures = repo / "tests" / "fixtures" / "ja-lookup-parity";
  const Dict a{import_fixture(fixtures / "main", tmp), "Parity A", true, true, true};
  const Dict b{import_fixture(fixtures / "second", tmp), "Parity B", true, false, true};
  const Dict e{import_fixture(fixtures / "english", tmp), "Parity E", true, false, false};
  if (failures != 0) return 1;

  const auto sources = corpus_sources(repo);
  const auto prefix_inputs = prefixes(sources);
  const auto gen = generated(sources, 100000);
  std::vector<std::string> sample;  // every 10th generated string
  for (size_t i = 0; i < gen.size(); i += 10) sample.push_back(gen[i]);
  std::vector<std::string> small = sources;  // the sources, every 50th generated string
  for (size_t i = 0; i < gen.size(); i += 50) small.push_back(gen[i]);
  std::vector<std::string> selection_inputs;  // every 3rd source, every 250th generated string
  for (size_t i = 0; i < sources.size(); i += 3) selection_inputs.push_back(sources[i]);
  for (size_t i = 0; i < gen.size(); i += 250) selection_inputs.push_back(gen[i]);
  const auto special = special_inputs();

  // The default path: all three dictionaries in one load order.
  DictionaryQuery query;
  legacy::DictionaryQuery old_query;
  load(query, {&a, &b, &e});
  load(old_query, {&a, &b, &e});
  const auto registry = hoshidicts::LanguageRegistry::with_builtin();
  const Lookup lookup(query, registry);
  Deinflector deinflector;
  const Lookup lookup_old_ctor(query, deinflector);
  legacy::Deinflector old_deinflector;
  const legacy::Lookup old_lookup(old_query, old_deinflector);
  const Pair pair{&lookup, &old_lookup};
  const Pair pair_old_ctor{&lookup_old_ctor, &old_lookup};

  const std::vector<Config> configs = {
      {"default"},
      {"neko speech", true},
      {"metadata only", false, true},
      {"ascending A", false, false, LookupFrequencyOrder::Ascending, "Parity A"},
      {"descending A", false, false, LookupFrequencyOrder::Descending, "Parity A"},
      {"descending B", false, false, LookupFrequencyOrder::Descending, "Parity B"},
      {"ascending unknown", false, false, LookupFrequencyOrder::Ascending, "Not loaded"},
      {"disabled", false, false, LookupFrequencyOrder::Disabled},
      {"primary reading", false, false, LookupFrequencyOrder::Auto, "", true},
      {"everything", true, true, LookupFrequencyOrder::Descending, "Parity A", true},
      {"everything, 3 results", true, true, LookupFrequencyOrder::Ascending, "Parity B", true, 3},
  };

  // Every input with the default options, below and above the long key.
  for (const std::vector<std::string>* inputs : {&prefix_inputs, &gen, &special}) {
    for (const auto& input : *inputs) {
      compare_lookup(pair, input, 16, configs[0], nullptr);
    }
  }
  for (const auto& input : prefix_inputs) compare_lookup(pair, input, 24, configs[0], nullptr);
  for (const auto& input : special) {
    for (size_t scan : {4, 8, 24, 32}) compare_lookup(pair, input, scan, configs[0], nullptr);
  }
  // Every option, on the sources, the special inputs and a sample of the
  // generated strings; lookup() and lookup_dictionary().
  for (const auto& config : configs) {
    for (const std::vector<std::string>* inputs : {&sources, &special, &std::as_const(sample)}) {
      for (const auto& input : *inputs) {
        compare_lookup(pair, input, 16, config, nullptr);
        compare_lookup(pair, input, 24, config, nullptr);
        compare_lookup(pair, input, 16, config, &a.path);
      }
    }
    for (const auto& input : special) {
      compare_lookup(pair, input, 32, config, &b.path);
      compare_lookup(pair, input, 32, config, &e.path);
    }
  }
  // Lookup(query, deinflector), the constructor existing callers use.
  for (const auto& input : small) compare_lookup(pair_old_ctor, input, 16, configs[9], nullptr);
  const size_t default_comparisons = compared;
  std::printf("ja-lookup-parity: %zu lookups compared on the default path, %zu failures\n", default_comparisons,
              failures);

  // Kanji, every loaded dictionary.
  std::vector<std::string> kanji = {"食", "猫", "長", "\u2F49", "a", "", "食べ"};
  for (const auto& s : sources) {
    for (auto it = s.begin(); it != s.end();) {
      const auto start = it;
      utf8::next(it, s.end());
      kanji.emplace_back(start, it);
    }
  }
  std::ranges::sort(kanji);
  kanji.erase(std::unique(kanji.begin(), kanji.end()), kanji.end());
  for (const auto& k : kanji) {
    ++compared;
    const std::string da = describe_kanji(query.query_kanji(k));
    const std::string db = describe_kanji(old_query.query_kanji(k));
    if (da != db) fail("query_kanji " + k + "\n  new    " + da + "\n  legacy " + db);
  }

  // The selection case (section 9.7): the new engine holds every dictionary,
  // in another order; the legacy engine holds only the selection, in its
  // order.
  DictionaryQuery all;
  load(all, {&e, &b, &a});
  const Lookup selecting(all, registry);
  const std::vector<std::vector<const Dict*>> selections = {
      {&a}, {&b}, {&e}, {&a, &b}, {&b, &a}, {&a, &e}, {&e, &a}, {&e, &b, &a}, {&b, &e, &a},
  };
  const size_t before_selection = compared;
  for (const auto& selection : selections) {
    legacy::DictionaryQuery only;
    load(only, selection);
    const legacy::Lookup only_lookup(only, old_deinflector);
    const Pair selected{&selecting, &only_lookup};
    LookupOptions base;
    base.dictionaries.emplace();
    std::string names;
    for (const Dict* d : selection) {
      base.dictionaries->push_back(d->path);
      names += d->title.substr(7) + " ";
    }
    for (const auto& config : configs) {
      for (const std::vector<std::string>* inputs : {&std::as_const(selection_inputs), &special}) {
        for (const auto& input : *inputs) {
          compare_lookup(selected, input, 16, config, nullptr, base);
          compare_lookup(selected, input, 24, config, &a.path, base);
          compare_lookup(selected, input, 16, config, &b.path, base);
        }
      }
    }
    for (const auto& k : kanji) {
      ++compared;
      std::vector<std::string> paths;
      for (const Dict* d : selection) paths.push_back(d->path);
      const std::string da = describe_kanji(all.query_kanji(k, paths));
      const std::string db = describe_kanji(only.query_kanji(k));
      if (da != db) fail("query_kanji " + k + " [" + names + "]\n  new    " + da + "\n  legacy " + db);
    }
  }
  // An empty selection finds nothing, and so does a selection of paths that
  // are not loaded.
  for (const auto& paths : {std::vector<std::string>{}, std::vector<std::string>{"/not/loaded"}}) {
    LookupOptions options;
    options.dictionaries = paths;
    for (const auto& input : special) {
      ++compared;
      if (!selecting.lookup(input, 16, 16, options).empty() || !selecting.lookup_dictionary(input, a.path, 16, 16, options).empty()) {
        fail("an empty selection found something for " + input);
      }
    }
    ++compared;
    if (!all.query_kanji("食", paths).entries.empty()) fail("an empty kanji selection found something");
  }
  std::printf("ja-lookup-parity: %zu kanji and selection comparisons (%zu selections), %zu failures\n",
              compared - before_selection, selections.size(), failures);
  fs::remove_all(tmp);
  return failures == 0 ? 0 : 1;
}

}  // namespace

int main(int argc, char** argv) {
  if (argc < 3) {
    std::fprintf(stderr, "usage: ja-parity-test deinflect|process|lookup <repo> [<tmp>]\n");
    return 2;
  }
  const std::string_view mode = argv[1];
  const fs::path repo = argv[2];
  if (mode == "deinflect") return run_deinflect(repo);
  if (mode == "process") return run_process(repo);
  if (mode == "lookup") return run_lookup(repo, argc > 3 ? fs::path(argv[3]) : fs::temp_directory_path());
  std::fprintf(stderr, "unknown mode\n");
  return 2;
}
