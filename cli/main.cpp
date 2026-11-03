#include <utf8.h>

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <filesystem>
#include <format>
#include <fstream>
#include <iostream>
#include <map>
#include <optional>
#include <ranges>
#include <set>
#include <string>
#include <vector>

#include "../src/languages/corpus.hpp"
#include "../src/languages/pack.hpp"
#include "../src/languages/steps.hpp"
#include "../src/path_utils.hpp"
#include "../src/query_internal.hpp"
#include "hoshidicts/deinflector.hpp"
#include "hoshidicts/importer.hpp"
#include "hoshidicts/languages.hpp"
#include "hoshidicts/lookup.hpp"
#include "hoshidicts/query.hpp"

#ifndef HOSHIDICTS_LANGUAGES_DIR
#define HOSHIDICTS_LANGUAGES_DIR "languages"
#endif

namespace {

void print_usage(const char* program) {
  std::cout << std::format("Usage: {} [--languages <dir>] <command> ...\n", program);
  std::cout << std::format("{} import <path/to/dictionary.zip|dictionary.mdx>\n", program);
  std::cout << std::format("{} languages\n", program);
  std::cout << std::format("{} deinflect <code> (<text> | --stdin) [--transforms <file>] [--options <id,...> | --all-options]\n",
                           program);
  std::cout << std::format("{} preprocess <code> (<text> | --stdin) [--options <id,...> | --all-options]\n", program);
  std::cout << std::format("{} deinflect <word>              (Japanese, human-readable)\n", program);
  std::cout << std::format("{} preprocess <word>             (Japanese, human-readable)\n", program);
  std::cout << std::format("{} query <path/to/dictionary> <word>\n", program);
  std::cout << std::format("{} lookup [--language <code>] <path/to/dictionary>... <lookup_string>\n", program);
  std::cout << std::format("{} freq <path/to/dictionary> <word> <reading>\n", program);
  std::cout << std::format("{} kanji <path/to/dictionary> <kanji>\n", program);
  std::cout << std::format(
      "{} eval-language <code> <file.tsv> [--transforms <file>] [--dictionary <imported dir>] [--per-rule]\n", program);
  std::cout << std::format("--languages defaults to {}\n", HOSHIDICTS_LANGUAGES_DIR);
}

// A JSON string, as JSON.parse reads it.
std::string json_string(std::string_view s) {
  std::string out = "\"";
  for (unsigned char c : s) {
    switch (c) {
      case '"':
        out += "\\\"";
        break;
      case '\\':
        out += "\\\\";
        break;
      case '\n':
        out += "\\n";
        break;
      case '\r':
        out += "\\r";
        break;
      case '\t':
        out += "\\t";
        break;
      case '\b':
        out += "\\b";
        break;
      case '\f':
        out += "\\f";
        break;
      default:
        if (c < 0x20) {
          out += std::format("\\u{:04x}", c);
        } else {
          out += static_cast<char>(c);
        }
    }
  }
  return out + "\"";
}

std::string json_number(std::optional<double> value) { return value ? std::format("{}", *value) : "null"; }

bool read_file(const std::string& path, std::string& out) {
  std::ifstream file(path_utils::from_utf8(path), std::ios::binary);
  if (!file) return false;
  out.assign(std::istreambuf_iterator<char>(file), {});
  return true;
}

struct Context {
  std::string languages_dir = HOSHIDICTS_LANGUAGES_DIR;
  bool languages_given = false;
  std::optional<hoshidicts::LanguageRegistry> registry;

  hoshidicts::LanguageRegistry& languages() {
    if (!registry) {
      registry = hoshidicts::LanguageRegistry::with_builtin();
      std::error_code ec;
      if (std::filesystem::is_directory(path_utils::from_utf8(languages_dir), ec)) {
        std::string error;
        if (!registry->add_directory(languages_dir, &error)) {
          std::cerr << "hoshidicts-cli: " << error << "\n";
        }
      } else if (languages_given) {
        std::cerr << "hoshidicts-cli: " << languages_dir << " is not a directory\n";
      }
    }
    return *registry;
  }

  // A pack, with its rules replaced by those of `transforms_file` when given
  // (section 10.3). The pack is first checked with its own lookup.transforms
  // file, as hosts load it; `own_ids` then receives that file's transform ids.
  std::shared_ptr<const hoshidicts::LanguagePack> pack(const std::string& code, const std::string* transforms_file,
                                                       std::vector<std::string>* own_ids = nullptr) {
    if (transforms_file == nullptr) {
      auto pack = languages().find(code);
      if (!pack) std::cerr << "hoshidicts-cli: no language pack " << code << "\n";
      return pack;
    }
    std::string language;
    const auto dir = std::filesystem::path(path_utils::from_utf8(languages_dir)) / path_utils::from_utf8(code);
    if (!read_file(path_utils::to_utf8(dir / "language.json"), language)) {
      std::cerr << "hoshidicts-cli: cannot read " << path_utils::to_utf8(dir / "language.json") << "\n";
      return nullptr;
    }
    // As LanguageRegistry::add_directory reads it; a name with a separator
    // is refused by the parse.
    const std::string own_file = hoshidicts::lang::transforms_file_name(language);
    std::string own_rules;
    if (!own_file.empty() && own_file.find_first_of("/\\") == std::string::npos &&
        !read_file(path_utils::to_utf8(dir / path_utils::from_utf8(own_file)), own_rules)) {
      std::cerr << "hoshidicts-cli: cannot read " << path_utils::to_utf8(dir / path_utils::from_utf8(own_file)) << "\n";
      return nullptr;
    }
    std::string error;
    const auto own = hoshidicts::parse_language_pack(language, own_rules, &error);
    if (!own) {
      std::cerr << "hoshidicts-cli: " << error << "\n";
      return nullptr;
    }
    std::string rules;
    if (!read_file(*transforms_file, rules)) {
      std::cerr << "hoshidicts-cli: cannot read " << *transforms_file << "\n";
      return nullptr;
    }
    auto data = hoshidicts::lang::parse_pack_with_rules(language, rules, *transforms_file, &error);
    if (!data) {
      std::cerr << "hoshidicts-cli: " << error << "\n";
      return nullptr;
    }
    if (own_ids != nullptr && own->data().transforms) {
      for (const auto& t : own->data().transforms->transforms) own_ids->push_back(t.id);
    }
    return std::make_shared<const hoshidicts::LanguagePack>(std::move(data));
  }
};

// Positional arguments and --name value options.
struct Arguments {
  std::vector<std::string> positional;
  std::map<std::string, std::string> values;
  std::set<std::string> flags;
};

Arguments parse_arguments(int argc, char** argv, int first, const std::set<std::string>& with_value,
                          const std::set<std::string>& flags) {
  Arguments a;
  for (int i = first; i < argc; ++i) {
    const std::string arg = argv[i];
    if (with_value.contains(arg) && i + 1 < argc) {
      a.values[arg] = argv[++i];
    } else if (flags.contains(arg)) {
      a.flags.insert(arg);
    } else {
      a.positional.push_back(arg);
    }
  }
  return a;
}

std::vector<std::string> input_lines(bool from_stdin, const std::vector<std::string>& rest) {
  if (!from_stdin) return rest;
  std::vector<std::string> lines;
  std::string line;
  while (std::getline(std::cin, line)) lines.push_back(line);
  return lines;
}

// The optional processors, transforms and variant passes `--options <id,...>`
// and `--all-options` turn on; without them none is on, as in a lookup
// without language options (section 10.3).
struct OptionSet {
  bool all = false;
  std::vector<std::string> ids;
  bool contains(std::string_view id) const { return all || std::ranges::find(ids, id) != ids.end(); }
};

// Reads the two options; `known` are the ids they may name (`what` describes
// them). Null after an error message.
std::optional<OptionSet> option_set(const Arguments& args, const std::vector<std::string>& known, const std::string& code,
                                    const char* what) {
  OptionSet set;
  set.all = args.flags.contains("--all-options");
  if (const auto it = args.values.find("--options"); it != args.values.end()) {
    for (const auto part : it->second | std::views::split(',')) {
      std::string id(part.begin(), part.end());
      if (id.empty()) continue;
      if (std::ranges::find(known, id) == known.end()) {
        std::cerr << "hoshidicts-cli: --options: the pack " << code << " has no " << what << " " << id << "\n";
        return std::nullopt;
      }
      set.ids.push_back(std::move(id));
    }
  }
  return set;
}

// The JSON line for an input that is not valid UTF-8: the bytes are not
// copied, so the output stays valid UTF-8.
std::string invalid_input(bool from_stdin, size_t line, const char* results) {
  const std::string where = from_stdin ? std::format("line {} of the input", line) : std::string("the text");
  std::cerr << "hoshidicts-cli: " << where << " is not valid UTF-8\n";
  return std::format("{{\"input\":null,\"{}\":[],\"error\":{}}}\n", results, json_string(where + " is not valid UTF-8"));
}

int cmd_import(const std::string& path) {
  std::filesystem::path source_path = path_utils::from_utf8(path);
  std::string output_dir = path_utils::to_utf8(source_path.parent_path());
  if (output_dir.empty()) {
    output_dir = ".";
  }
  ImportResult result = dictionary_importer::import(path, output_dir);

  if (result.success) {
    std::cout << std::format("title: {}\n", result.title);
    std::cout << std::format("term_count: {}\n", result.summary.counts.terms.total);
    std::cout << std::format("meta_count: {}\n", result.summary.counts.termMeta["total"]);
    std::cout << std::format("freq_count: {}\n", result.summary.counts.termMeta["freq"]);
    std::cout << std::format("pitch_count: {}\n",
                             result.summary.counts.termMeta["pitch"] + result.summary.counts.termMeta["ipa"]);
    std::cout << std::format("kanji_count: {}\n", result.summary.counts.kanji.total);
    std::cout << std::format("media_count: {}\n", result.summary.counts.media.total);
    std::cout << std::format("skipped_records: {}\n", result.warnings.skippedRecords);
    std::cout << std::format("unresolved_redirects: {}\n", result.warnings.unresolvedRedirects);
    std::cout << std::format("missing_resources: {}\n", result.warnings.missingResources);
    std::cout << std::format("unreadable_resources: {}\n", result.warnings.unreadableResources);
  } else {
    std::cout << std::format("could not import dictionary: {}\n", result.error);
  }
  return 0;
}

// The human-readable Japanese forms of earlier versions.
int cmd_deinflect_legacy(const std::string& inflected) {
  Deinflector deinflector;
  auto results = deinflector.deinflect(inflected);

  std::cout << std::format("deinflections for: {} length: {}\n", inflected,
                           utf8::distance(inflected.begin(), inflected.end()));
  std::cout << std::format("found {} candidates\n\n", results.size());

  for (const auto& r : results) {
    std::cout << std::format("{} (conditions: {})", r.text, r.conditions);
    if (!r.trace.empty()) {
      std::cout << std::format("  ");
      for (size_t i = 0; i < r.trace.size(); ++i) {
        std::cout << std::format("{}{}", r.trace[i].name, i < r.trace.size() - 1 ? " -> " : "");
      }
      std::cout << std::format("\n");
    }
  }
  return 0;
}

int cmd_preprocess_legacy(const std::string& text) {
  auto pack = hoshidicts::builtin_language_pack("ja");
  auto results = hoshidicts::lang::process_text(pack->data().preprocessors, text, {});

  std::cout << std::format("preproccesing for: {} length: {}\n", text, utf8::distance(text.begin(), text.end()));
  std::cout << std::format("found {} variants\n", results.size());

  for (const auto& r : results) {
    std::cout << std::format("{}\n", r.text);
  }
  return 0;
}

// `deinflect <code>`: one JSON object per input (section 10.3).
int cmd_deinflect(Context& context, const Arguments& args) {
  namespace lang = hoshidicts::lang;
  const std::string* transforms = args.values.contains("--transforms") ? &args.values.at("--transforms") : nullptr;
  std::vector<std::string> own_ids;
  const auto pack_holder = context.pack(args.positional[0], transforms, &own_ids);
  if (!pack_holder) return 1;
  const auto& pack = pack_holder->data();
  const bool from_stdin = args.flags.contains("--stdin");
  const std::vector<std::string> rest(args.positional.begin() + 1, args.positional.end());
  if (!from_stdin && rest.size() != 1) {
    std::cerr << "hoshidicts-cli: deinflect needs one text or --stdin\n";
    return 1;
  }
  // --options names transforms and variant passes. With --transforms it may
  // also name any transform of the pack's own rules file that <file> lacks,
  // optional or not (a setting can name only the optional ones): that one has
  // no effect in this run.
  std::vector<std::string> known;
  if (pack.transforms) {
    for (const auto& t : pack.transforms->transforms) known.push_back(t.id);
  }
  for (const auto& pass : pack.variant_passes) known.push_back(pass.id);
  std::vector<std::string> accepted = known;
  for (const auto& id : own_ids) {
    if (std::ranges::find(accepted, id) == accepted.end()) accepted.push_back(id);
  }
  const auto options = option_set(args, accepted, pack.code, "transform or variant pass");
  if (!options) return 1;
  for (const auto& id : options->ids) {
    if (transforms != nullptr && std::ranges::find(known, id) == known.end()) {
      std::cerr << "hoshidicts-cli: --options: " << *transforms << " has no transform " << id
                << "; it has no effect in this run\n";
    }
  }
  std::vector<bool> enabled_transforms;
  if (pack.transforms) {
    for (const auto& t : pack.transforms->transforms) enabled_transforms.push_back(t.optional && options->contains(t.id));
  }
  std::vector<const lang::VariantPass*> passes;
  for (const auto& pass : pack.variant_passes) {
    if (options->contains(pass.id)) passes.push_back(&pass);
  }
  const auto step_of = [&](uint32_t via) {
    return pack.transforms ? pack.transforms->step_of(via) : via - lang::Deinflection::step_base;
  };
  std::string out;
  size_t line = 0;
  bool invalid = false;
  for (const auto& input : input_lines(from_stdin, rest)) {
    ++line;
    std::u32string check;
    if (!lang::decode_utf8(input, check)) {
      out += invalid_input(from_stdin, line, "results");
      invalid = true;
      continue;
    }
    out += "{\"input\":" + json_string(input) + ",\"results\":[";
    lang::Deinflections list;
    if (pack.transforms) {
      pack.transforms->deinflect(input, list, &enabled_transforms);
    } else {
      list.push_back(lang::Deinflection{input, 0, lang::Deinflection::npos, lang::Deinflection::none, 0});
    }
    // An enabled variant pass's readings follow, as a corpus row sees them.
    for (const auto* pass : passes) {
      std::vector<std::string> readings;
      pass->builtin->variants(input, readings);
      for (auto& reading : readings) {
        if (pack.transforms) {
          pack.transforms->deinflect_from_step(std::move(reading), pass->step, list, &enabled_transforms);
        } else if (!reading.empty()) {
          list.push_back(lang::Deinflection{std::move(reading), 0, lang::Deinflection::npos,
                                            lang::Deinflection::step_base + pass->step, 1});
        }
      }
    }
    for (size_t i = 0; i < list.size(); ++i) {
      const auto& d = list[i];
      out += i ? ",{" : "{";
      out += "\"text\":" + json_string(d.text) + ",\"conditions\":[";
      if (pack.transforms) {
        const auto names = pack.transforms->condition_names(d.conditions);
        for (size_t k = 0; k < names.size(); ++k) out += (k ? "," : "") + json_string(names[k]);
      }
      out += "],\"trace\":[";
      // Newest first, as the corpus `reasons` column (section 12.2).
      bool first = true;
      for (const auto* n = &d;; n = &list[n->parent]) {
        if (n->via != lang::Deinflection::none) {
          out += (first ? "" : ",") + json_string(pack.trace_steps[step_of(n->via)].id);
          first = false;
        }
        if (n->parent == lang::Deinflection::npos) break;
      }
      out += "]}";
    }
    out += "]}\n";
    if (out.size() > (1 << 20)) {
      std::cout << out;
      out.clear();
    }
  }
  std::cout << out;
  return invalid ? 1 : 0;
}

// `preprocess <code>`: the preprocessor variants, one JSON object per input.
int cmd_preprocess(Context& context, const Arguments& args) {
  const auto pack_holder = context.pack(args.positional[0], nullptr);
  if (!pack_holder) return 1;
  const auto& pack = pack_holder->data();
  const bool from_stdin = args.flags.contains("--stdin");
  const std::vector<std::string> rest(args.positional.begin() + 1, args.positional.end());
  if (!from_stdin && rest.size() != 1) {
    std::cerr << "hoshidicts-cli: preprocess needs one text or --stdin\n";
    return 1;
  }
  // --options names preprocessors.
  std::vector<std::string> known;
  for (const auto& p : pack.preprocessors) known.push_back(p.id);
  const auto options = option_set(args, known, pack.code, "preprocessor");
  if (!options) return 1;
  std::vector<std::string> enabled_ids;
  for (const auto& p : pack.preprocessors) {
    if (options->contains(p.id)) enabled_ids.push_back(p.id);
  }
  const hoshidicts::lang::EnabledOptions enabled{enabled_ids};
  std::string out;
  size_t line = 0;
  bool invalid = false;
  for (const auto& input : input_lines(from_stdin, rest)) {
    ++line;
    std::u32string check;
    if (!hoshidicts::lang::decode_utf8(input, check)) {
      out += invalid_input(from_stdin, line, "variants");
      invalid = true;
      continue;
    }
    out += "{\"input\":" + json_string(input) + ",\"variants\":[";
    const auto variants = hoshidicts::lang::process_text(pack.preprocessors, input, enabled);
    for (size_t i = 0; i < variants.size(); ++i) {
      out += std::format("{}{{\"text\":{},\"steps\":{}}}", i ? "," : "", json_string(variants[i].text), variants[i].steps);
    }
    out += "]}\n";
    if (out.size() > (1 << 20)) {
      std::cout << out;
      out.clear();
    }
  }
  std::cout << out;
  return invalid ? 1 : 0;
}

int cmd_languages(Context& context) {
  for (const auto& code : context.languages().codes()) {
    const auto pack = context.languages().find(code);
    std::cout << code << "\t" << pack->name() << "\n";
  }
  return 0;
}

void cmd_query(const std::string& db_path, const std::string& expression) {
  DictionaryQuery dict_query;
  dict_query.add_term_dict(db_path);
  auto result = dict_query.query(expression);

  std::cout << std::format("query results for: {} length: {}\n", expression,
                           utf8::distance(expression.begin(), expression.end()));
  std::cout << std::format("{} entries\n", result.size());
  for (const auto& r : result) {
    std::cout << std::format("---------------------------------------------------------------\n");
    std::cout << std::format("{} {} {}\n", r.expression, r.reading, r.rules);
    std::cout << std::format("{} glossary entries\n", r.glossaries.size());
    for (const auto& g : r.glossaries) {
      std::cout << std::format("------\n");
      std::cout << std::format("{}\n", g.dict_name);
      std::cout << std::format("{}\n", g.glossary);
    }
  }
}

void cmd_freq(const std::string& path, const std::string& expression, const std::string& reading) {
  std::vector<TermResult> terms;
  terms.emplace_back(TermResult{.expression = expression, .reading = reading});

  DictionaryQuery query;
  query.add_freq_dict(path);
  query.query_freq(terms);
  std::cout << std::format("frequency entries for: {}\n", expression);
  int count = 0;
  for (auto& freq : terms[0].frequencies) {
    std::cout << std::format("dict: {}\n", freq.dict_name);
    for (auto& freq_entry : freq.frequencies) {
      std::cout << std::format("val: {} display_val: {}\n", freq_entry.value, freq_entry.display_value);
      count++;
    }
  }
  std::cout << std::format("count: {}\n", count);
}

void cmd_kanji(const std::string& path, const std::string& kanji) {
  DictionaryQuery query;
  query.add_kanji_dict(path);
  auto result = query.query_kanji(kanji);

  std::cout << std::format("kanji result for: {}\n", kanji);
  std::cout << std::format("{} entries\n", result.entries.size());

  for (const auto& e : result.entries) {
    std::cout << std::format("---------------------------------------------------------------\n");
    std::cout << std::format("dict: {}\n", e.dict_name);
    std::cout << std::format("onyomi: {}\n", e.onyomi);
    std::cout << std::format("kunyomi: {}\n", e.kunyomi);
    std::cout << std::format("tags: {}\n", e.tags);
    std::cout << std::format("definitions:\n");
    for (const auto& def : e.definitions) {
      std::cout << std::format("  - {}\n", def);
    }
    if (!e.stats.empty()) {
      std::cout << std::format("stats:\n");
      for (const auto& [k, v] : e.stats) {
        std::cout << std::format("  {}: {}\n", k, v);
      }
    }
  }
}

int cmd_lookup(Context& context, const Arguments& args, int max_results = 8, int scan_length = 16) {
  if (args.positional.size() < 2) {
    std::cerr << "hoshidicts-cli: lookup needs a dictionary and a text\n";
    return 1;
  }
  const std::vector<std::string> db_paths(args.positional.begin(), args.positional.end() - 1);
  const std::string& lookup_string = args.positional.back();
  DictionaryQuery dict_query;
  for (const auto& path : db_paths) {
    dict_query.add_term_dict(path);
  }
  LookupOptions options;
  if (args.values.contains("--language")) {
    options.language = args.values.at("--language");
  }
  Lookup lookup(dict_query, context.languages());
  std::vector<LookupResult> result;
  try {
    result = lookup.lookup(lookup_string, max_results, scan_length, options);
  } catch (const std::invalid_argument& error) {
    std::cerr << "hoshidicts-cli: " << error.what() << "\n";
    return 1;
  }

  std::cout << std::format("lookup results for: {} max_results: {} scan_length: {}\n", lookup_string, max_results,
                           scan_length);
  std::cout << std::format("{} results\n", result.size());

  for (const auto& r : result) {
    std::cout << std::format("---------------------------------------------------------------\n");
    std::cout << std::format("{}\n", r.matched);
    if (!r.trace.empty()) {
      std::cout << std::format("  ");
      for (size_t i = 0; i < r.trace.size(); ++i) {
        std::cout << std::format("{}{}", r.trace[i].name, i < r.trace.size() - 1 ? " -> " : "");
      }
      std::cout << std::format("\n");
    }
    std::cout << std::format("{} {}\n", r.term.expression, r.term.reading);
    for (const auto& g : r.term.glossaries) {
      std::cout << std::format("------\n");
      std::cout << std::format("{}\n", g.dict_name);
      std::cout << std::format("{}\n", g.glossary);
    }
  }

  std::cout << std::format("styles: \n");
  for (const auto& s : dict_query.get_styles()) {
    std::cout << std::format("{}\n", s.dict_name);
    std::cout << std::format("{}\n", s.styles);
  }
  return 0;
}

// eval-language's false candidates of one row when the pack follows form-of
// references (docs/languages.md, sections 9.10 and 10.3): the distinct texts,
// other than the source and the lemma, a lookup of the whole source shows a
// term for. A deinflected text counts when a row with definitions passes the
// filter for one of the deinflections that reach it, and the text a form-of
// reference names counts when the row naming it passes the filter for the
// deinflection that found it and the text has a row with definitions. For
// --per-rule, a text's rules are those every path to it uses; the path to a
// reference's text is the path of the deinflection that found its row.
template <typename Intersect>
void count_followed_false_candidates(const DictionaryQuery& query, const hoshidicts::lang::PackData& pack,
                                     const hoshidicts::lang::CorpusRow& row,
                                     const std::vector<hoshidicts::lang::SourceDeinflection>& list,
                                     size_t& false_candidates, std::vector<size_t>& adds, Intersect&& intersect) {
  // A row's conditions (9.4): its tags' bits, or with untaggedTerms "pass" D,
  // every dictionary-form condition, for a row without tags.
  const bool pass_untagged = pack.untagged_terms == hoshidicts::lang::UntaggedTerms::Pass;
  const auto bits_of = [&](std::string_view rules) {
    if (pass_untagged && hoshidicts::lang::untagged(rules)) return pack.transforms->dictionary_form_mask();
    uint32_t bits = 0;
    for (auto token : rules | std::views::split(' ')) {
      bits |= pack.transforms->dictionary_form_bits(std::string_view(token.begin(), token.end()));
    }
    return bits;
  };
  std::map<std::string, std::vector<size_t>> by_text;
  for (size_t i = 0; i < list.size(); ++i) by_text[list[i].text].push_back(i);
  // Each candidate text, and the deinflections whose paths reach it.
  std::map<std::string, std::vector<size_t>> candidates;
  std::map<std::string, std::vector<size_t>> referenced;
  BlobPins pins;
  std::vector<FormOfReference> references;
  std::vector<RawFormOfRow> rows;
  for (const auto& [text, which] : by_text) {
    rows.clear();
    const RawTerms raw = QueryAccess::query_raw(query, text, pins, &rows);
    for (size_t i : which) {
      const uint32_t conditions = list[i].conditions;
      const bool any = conditions == 0 || !pack.transforms;
      const auto passes = [&](std::string_view rules) { return (bits_of(rules) & conditions) != 0; };
      const bool shown = std::ranges::any_of(raw.terms, [&](const RawTerm& term) {
        if (any) return true;
        for (uint32_t g = term.first_glossary; g != UINT32_MAX; g = raw.glossaries[g].next) {
          if (passes(raw.glossaries[g].rules)) return true;
        }
        return false;
      });
      if (shown) candidates[text].push_back(i);
      for (const RawFormOfRow& row : rows) {
        if (!any && !passes(row.rules)) continue;
        references.clear();
        QueryAccess::read_form_of(row, pins, references);
        for (const auto& reference : references) referenced[reference.form_of].push_back(i);
      }
    }
  }
  for (const auto& [text, which] : referenced) {
    // Read with the form-of rows aside, so a row that is only references is no term.
    std::vector<RawFormOfRow> target_rows;
    if (QueryAccess::query_raw(query, text, pins, &target_rows).terms.empty()) continue;
    auto& paths = candidates[text];
    paths.insert(paths.end(), which.begin(), which.end());
  }
  for (auto& [text, which] : candidates) {
    if (text == row.source || text == row.term) continue;
    std::ranges::sort(which);
    which.erase(std::unique(which.begin(), which.end()), which.end());
    ++false_candidates;
    for (uint32_t r : intersect(list, which)) ++adds[r];
  }
}

// `eval-language` (section 10.3): recall and negatives over the whole source
// of each row, and with a dictionary the false candidates and first ranks,
// with every optional feature on, or with the pack's defaults for a file whose
// first line is `# options: default` (section 12.2).
int cmd_eval_language(Context& context, const Arguments& args) {
  namespace lang = hoshidicts::lang;
  if (args.positional.size() != 2) {
    std::cerr << "hoshidicts-cli: eval-language needs a code and a corpus file\n";
    return 1;
  }
  const std::string* transforms = args.values.contains("--transforms") ? &args.values.at("--transforms") : nullptr;
  const auto pack_holder = context.pack(args.positional[0], transforms);
  if (!pack_holder) return 1;
  const auto& pack = pack_holder->data();
  std::vector<lang::CorpusRow> rows;
  std::string error;
  lang::TestOptions file_options = lang::TestOptions::All;
  if (!lang::read_corpus(args.positional[1], rows, &error, &file_options)) {
    std::cerr << "hoshidicts-cli: " << error << "\n";
    return 1;
  }
  const bool all_options = file_options == lang::TestOptions::All;
  const bool per_rule = args.flags.contains("--per-rule");
  const std::string* dictionary = args.values.contains("--dictionary") ? &args.values.at("--dictionary") : nullptr;

  std::optional<DictionaryQuery> query;
  hoshidicts::LanguageRegistry registry;
  std::optional<Lookup> lookup;
  LookupOptions options;
  if (dictionary != nullptr) {
    query.emplace();
    if (!query->add_term_dict(*dictionary)) {
      std::cerr << "hoshidicts-cli: cannot load " << *dictionary << ": " << query->last_error() << "\n";
      return 1;
    }
    registry.add(pack_holder);
    lookup.emplace(*query, registry);
    options.language = pack.code;
    if (all_options) {
      for (const auto* list : {&pack.preprocessors, &pack.postprocessors}) {
        for (const auto& p : *list) options.language_options.push_back(p.id);
      }
      for (const auto& pass : pack.variant_passes) options.language_options.push_back(pass.id);
      if (pack.transforms) {
        for (const auto& t : pack.transforms->transforms) options.language_options.push_back(t.id);
      }
    }
  }

  // Per JSON rule: (transform, index in transform) of each rule.
  const size_t rule_count = pack.transforms ? pack.transforms->rules.size() : 0;
  std::vector<size_t> recovers(rule_count, 0);
  std::vector<size_t> adds(rule_count, 0);
  std::vector<size_t> breaks(rule_count, 0);
  const auto intersect = [](const std::vector<lang::SourceDeinflection>& list, const std::vector<size_t>& which) {
    std::vector<uint32_t> common = list[which.front()].rules;
    for (size_t k = 1; k < which.size(); ++k) {
      std::vector<uint32_t> next;
      std::ranges::set_intersection(common, list[which[k]].rules, std::back_inserter(next));
      common.swap(next);
    }
    return common;
  };

  size_t positives = 0;
  size_t found = 0;
  size_t negatives = 0;
  size_t passed = 0;
  size_t false_candidates = 0;
  size_t first_ranked = 0;
  for (const auto& row : rows) {
    bool limit = false;
    const auto list = lang::deinflect_source(pack, row.source, &limit, file_options);
    std::vector<size_t> matching;
    error.clear();
    const bool has = lang::row_matches(pack, row, list, &matching, &error);
    if (!error.empty()) {
      std::cerr << "hoshidicts-cli: " << args.positional[1] << ": " << error << "\n";
      return 1;
    }
    if (row.valid) {
      ++positives;
      if (has) {
        ++found;
        for (uint32_t r : intersect(list, matching)) ++recovers[r];
      }
    } else {
      ++negatives;
      if (!has) {
        ++passed;
      } else {
        for (uint32_t r : intersect(list, matching)) ++breaks[r];
      }
    }
    if (query && row.valid) {
      // Distinct deinflected texts that are headwords passing the filter, other
      // than the source and the lemma.
      if (pack.form_of == lang::FormOf::Follow) {
        count_followed_false_candidates(*query, pack, row, list, false_candidates, adds, intersect);
      } else {
        std::map<std::string, std::vector<size_t>> by_text;
        for (size_t i = 0; i < list.size(); ++i) {
          if (list[i].text != row.source && list[i].text != row.term) by_text[list[i].text].push_back(i);
        }
        for (const auto& [text, which] : by_text) {
          const auto terms = query->query(text);
          // With untaggedTerms "pass", a row without tags carries D, every
          // dictionary-form condition (9.4). A TermResult joins its rows'
          // tags, so the rows are read raw.
          uint32_t untagged_bits = 0;
          if (pack.untagged_terms == lang::UntaggedTerms::Pass && pack.transforms) {
            BlobPins pins;
            const RawTerms raw = QueryAccess::query_raw(*query, text, pins, nullptr);
            if (std::ranges::any_of(raw.glossaries, [](const RawGlossary& g) { return lang::untagged(g.rules); })) {
              untagged_bits = pack.transforms->dictionary_form_mask();
            }
          }
          std::vector<size_t> passing;
          for (size_t i : which) {
            const uint32_t conditions = list[i].conditions;
            const bool ok = std::ranges::any_of(terms, [&](const TermResult& term) {
              if (conditions == 0 || !pack.transforms || (untagged_bits & conditions) != 0) return true;
              uint32_t bits = 0;
              for (auto token : term.rules | std::views::split(' ')) {
                bits |= pack.transforms->dictionary_form_bits(std::string_view(token.begin(), token.end()));
              }
              return (bits & conditions) != 0;
            });
            if (ok) passing.push_back(i);
          }
          if (passing.empty()) continue;
          ++false_candidates;
          for (uint32_t r : intersect(list, passing)) ++adds[r];
        }
      }
      const size_t length = utf8::distance(row.source.begin(), row.source.end());
      const auto results = lookup->lookup(row.source, 16, std::max<size_t>(16, length), options);
      if (!results.empty() && results.front().term.expression == row.term) ++first_ranked;
    }
  }

  std::string out = std::format("{{{}\"rows\":{},\"positives\":{},\"negatives\":{},\"recall\":{},\"negativesPassed\":{}",
                                all_options ? "" : "\"options\":\"default\",", rows.size(), positives, negatives,
                                json_number(positives ? std::optional<double>(static_cast<double>(found) / positives) : std::nullopt),
                                json_number(negatives ? std::optional<double>(static_cast<double>(passed) / negatives) : std::nullopt));
  if (query) {
    out += std::format(",\"falseCandidates\":{},\"firstRank\":{}",
                       json_number(positives ? std::optional<double>(static_cast<double>(false_candidates) / positives) : std::nullopt),
                       json_number(positives ? std::optional<double>(static_cast<double>(first_ranked) / positives) : std::nullopt));
  }
  if (per_rule && pack.transforms) {
    // One entry per JSON rule (a cross product's rules are summed).
    std::map<std::pair<uint32_t, uint32_t>, std::array<size_t, 3>> by_rule;
    for (size_t r = 0; r < rule_count; ++r) {
      const auto& rule = pack.transforms->rules[r];
      auto& counts = by_rule[{rule.transform, rule.index_in_transform}];
      counts[0] += recovers[r];
      counts[1] += adds[r];
      counts[2] += breaks[r];
    }
    out += ",\"perRule\":[";
    bool first = true;
    for (const auto& [key, counts] : by_rule) {
      out += std::format("{}{{\"transform\":{},\"rule\":{},\"recovers\":{}", first ? "" : ",",
                         json_string(pack.transforms->transforms[key.first].id), key.second, counts[0]);
      if (query) out += std::format(",\"falseCandidates\":{}", counts[1]);
      out += std::format(",\"breaks\":{}}}", counts[2]);
      first = false;
    }
    out += "]";
  }
  out += "}\n";
  std::cout << out;
  return 0;
}

}  // namespace

int main(int argc, char* argv[]) {
  Context context;
  int first = 1;
  while (first + 1 < argc && std::string_view(argv[first]) == "--languages") {
    context.languages_dir = argv[first + 1];
    context.languages_given = true;
    first += 2;
  }
  if (first >= argc) {
    print_usage(argv[0]);
    return 1;
  }

  const auto begin = std::chrono::steady_clock::now();
  std::string_view command = argv[first];
  const int argn = argc - first;  // arguments from the command on
  bool timed = true;
  int status = 0;

  try {
    if (command == "import" && argn >= 2) {
      status = cmd_import(argv[first + 1]);
    } else if (command == "languages") {
      timed = false;
      status = cmd_languages(context);
    } else if (command == "deinflect" || command == "preprocess") {
      const auto args =
          parse_arguments(argc, argv, first + 1, {"--transforms", "--options"}, {"--stdin", "--all-options"});
      if (args.positional.size() == 1 && args.flags.empty() && args.values.empty()) {
        status = command == "deinflect" ? cmd_deinflect_legacy(args.positional[0]) : cmd_preprocess_legacy(args.positional[0]);
      } else if (args.positional.empty()) {
        print_usage(argv[0]);
        return 1;
      } else {
        timed = false;
        status = command == "deinflect" ? cmd_deinflect(context, args) : cmd_preprocess(context, args);
      }
    } else if (command == "query" && argn >= 3) {
      cmd_query(argv[first + 1], argv[first + 2]);
    } else if (command == "lookup" && argn >= 3) {
      status = cmd_lookup(context, parse_arguments(argc, argv, first + 1, {"--language"}, {}));
    } else if (command == "freq" && argn >= 4) {
      cmd_freq(argv[first + 1], argv[first + 2], argv[first + 3]);
    } else if (command == "kanji" && argn >= 3) {
      cmd_kanji(argv[first + 1], argv[first + 2]);
    } else if (command == "eval-language") {
      timed = false;
      status = cmd_eval_language(context, parse_arguments(argc, argv, first + 1, {"--transforms", "--dictionary"}, {"--per-rule"}));
    } else {
      print_usage(argv[0]);
      return 1;
    }
  } catch (const std::exception& error) {
    std::cerr << "hoshidicts-cli: " << error.what() << "\n";
    return 1;
  }

  // The runtime of a command that succeeded (an error message is the last line
  // of one that failed).
  if (timed && status == 0) {
    const auto end = std::chrono::steady_clock::now();
    std::chrono::duration<double, std::milli> duration = end - begin;
    std::cout << std::format("runtime: {}ms\n", duration.count());
  }

  return status;
}
