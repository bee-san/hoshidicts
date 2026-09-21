#include "hoshidicts/query.hpp"

#include <ankerl/unordered_dense.h>
#define ZSTD_STATIC_LINKING_ONLY
#include <zstd.h>

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <memory>
#include <ranges>
#include <string_view>
#include <vector>

#include "hash/hash.hpp"
#include "hoshidicts/importer.hpp"
#include "json/yomitan_parser.hpp"
#include "memory/memory.hpp"
#include "path_utils.hpp"
#include "query_internal.hpp"
#include "scan_index.hpp"

namespace {
template <typename T>
T read_val(const uint8_t*& addr) {
  T val;
  std::memcpy(&val, addr, sizeof(T));
  addr += sizeof(T);
  return val;
}

std::string_view read_str(const uint8_t*& addr, uint32_t len) {
  std::string_view result(reinterpret_cast<const char*>(addr), len);
  addr += len;
  return result;
}

ZSTD_DCtx* thread_dctx() {
  static thread_local std::unique_ptr<ZSTD_DCtx, decltype(&ZSTD_freeDCtx)> ctx(ZSTD_createDCtx(), ZSTD_freeDCtx);
  return ctx.get();
}
}

struct DictionaryQuery::DictionaryData {
  int version;
  hash::linear table;
  hash::bloom bloom;
  memory::mapped_file blobs;
  memory::mapped_file hash_table;
  memory::mapped_file bloom_filter;
  memory::mapped_file media;
  memory::mapped_file media_index;
  // Optional long-key scan index (see src/scan_index.hpp); absent for
  // dictionaries imported before it existed and for ones without long keys.
  memory::mapped_file scan_index;
  ZSTD_DDict* zstd_dict = nullptr;

  ~DictionaryData() {
    memory::unmap(blobs);
    memory::unmap(hash_table);
    memory::unmap(bloom_filter);
    memory::unmap(media);
    memory::unmap(media_index);
    memory::unmap(scan_index);
    ZSTD_freeDDict(zstd_dict);
  }

  struct ScanIndexView {
    uint32_t count = 0;
    uint16_t max_key_length = 0;
    const uint8_t* hashes = nullptr;
    const uint8_t* lengths = nullptr;
  };

  // A view over the mapped file, or an empty one when the file is missing,
  // has an unknown version, or is not the size its header claims.
  ScanIndexView scan_index_view() const {
    ScanIndexView view;
    if (!scan_index || scan_index.size < scan_index::header_bytes) {
      return view;
    }
    const uint8_t* addr = scan_index.data;
    if (read_val<uint32_t>(addr) != scan_index::magic || read_val<uint32_t>(addr) != scan_index::version) {
      return view;
    }
    const auto count = read_val<uint32_t>(addr);
    const auto max_key_length = read_val<uint16_t>(addr);
    const size_t expected = scan_index::header_bytes + static_cast<size_t>(count) * (sizeof(uint64_t) + sizeof(uint16_t));
    if (scan_index.size != expected) {
      return view;
    }
    view.count = count;
    view.max_key_length = max_key_length;
    view.hashes = scan_index.data + scan_index::header_bytes;
    view.lengths = view.hashes + static_cast<size_t>(count) * sizeof(uint64_t);
    return view;
  }

  // Longest key sharing the hashed prefix, or 0.
  size_t long_key_length(uint64_t prefix_hash) const {
    const ScanIndexView view = scan_index_view();
    size_t lo = 0;
    size_t hi = view.count;
    while (lo < hi) {
      const size_t mid = lo + (hi - lo) / 2;
      uint64_t hash;
      std::memcpy(&hash, view.hashes + mid * sizeof(uint64_t), sizeof(hash));
      if (hash < prefix_hash) {
        lo = mid + 1;
      } else if (hash > prefix_hash) {
        hi = mid;
      } else {
        uint16_t length;
        std::memcpy(&length, view.lengths + mid * sizeof(uint16_t), sizeof(length));
        return length;
      }
    }
    return 0;
  }
};

DictionaryQuery::DictionaryQuery() = default;
DictionaryQuery::~DictionaryQuery() = default;

DictionaryQuery::DictionaryQuery(DictionaryQuery&&) noexcept = default;
DictionaryQuery& DictionaryQuery::operator=(DictionaryQuery&&) noexcept = default;

DictionaryQuery::Dictionary::Dictionary() = default;
DictionaryQuery::Dictionary::~Dictionary() = default;

DictionaryQuery::Dictionary::Dictionary(Dictionary&&) noexcept = default;
DictionaryQuery::Dictionary& DictionaryQuery::Dictionary::operator=(Dictionary&&) noexcept = default;

bool DictionaryQuery::add_dict(const std::string& path_utf8, DictionaryType type) {
  try {
    return add_dict_(path_utf8, type);
  } catch (const std::exception&) {
    return false;
  }
}

bool DictionaryQuery::add_dict_(const std::string& path_utf8, DictionaryType type) {
  const std::filesystem::path path = path_utils::from_utf8(path_utf8);
  // Marker layout: _1/_2 are legacy; _3 and _4 store the term score as an int32
  // and differ only in whether dict.zstd was trained (_4); _5 and _6 are the
  // same pair with the score stored as a double, which is what the Yomitan
  // schema's JSON number can hold (fractions, and magnitudes beyond int32).
  int version = 0;
  if (std::filesystem::is_regular_file(path / ".hoshidicts_6")) {
    version = 6;
  } else if (std::filesystem::is_regular_file(path / ".hoshidicts_5")) {
    version = 5;
  } else if (std::filesystem::is_regular_file(path / ".hoshidicts_4")) {
    version = 4;
  } else if (std::filesystem::is_regular_file(path / ".hoshidicts_3")) {
    version = 3;
  } else if (std::filesystem::is_regular_file(path / ".hoshidicts_2")) {
    version = 2;
  } else if (std::filesystem::is_regular_file(path / ".hoshidicts_1")) {
    version = 1;
  } else {
    return false;
  }

  Dictionary dict;
  dict.path = path_utf8;
  Summary summary;
  std::ifstream index_file(path / "index.json", std::ios::binary);
  if (!index_file) {
    return false;
  }
  std::string buf(std::istreambuf_iterator<char>(index_file), {});
  if (glz::read<glz::opts{.error_on_unknown_keys = false}>(summary, buf)) {
    return false;
  }

  dict.name = summary.title.empty() ? path_utils::to_utf8(path.stem()) : summary.title;
  dict.styles = summary.styles;
  if (dict.styles.empty() && std::filesystem::exists(path / "styles.css")) {
    std::ifstream f(path / "styles.css");
    dict.styles = std::string(std::istreambuf_iterator<char>(f), {});
  }

  dict.data = std::make_unique<DictionaryData>();
  dict.data->version = version;

  dict.data->hash_table = memory::map_rd(path / "hash.table");
  if (!dict.data->hash_table) {
    return false;
  }
  if (!dict.data->table.load(dict.data->hash_table.data, dict.data->hash_table.size)) {
    return false;
  }

  dict.data->bloom_filter = memory::map_rd(path / "bloom.filter");
  if (!dict.data->bloom_filter) {
    return false;
  }
  if (!dict.data->bloom.load(dict.data->bloom_filter.data, dict.data->bloom_filter.size)) {
    return false;
  }
  dict.data->table.set_bloom(&dict.data->bloom);

  dict.data->blobs = memory::map_rd(path / "blobs.bin");
  if (!dict.data->blobs) {
    return false;
  }

  dict.data->media = memory::map_rd(path / "media.bin");
  if (dict.data->media) {
    dict.data->media_index = memory::map_rd(path / "media.idx");
  }
  if (type == TERM && std::filesystem::is_regular_file(path / scan_index::file_name)) {
    dict.data->scan_index = memory::map_rd(path / scan_index::file_name);
  }

  if (version == 4 || version == 6) {
    std::ifstream f(path / "dict.zstd", std::ios::binary);
    const std::string blob(std::istreambuf_iterator<char>(f), {});
    dict.data->zstd_dict =
        ZSTD_createDDict_advanced(blob.data(), blob.size(), ZSTD_dlm_byCopy, ZSTD_dct_fullDict, ZSTD_defaultCMem);
    if (dict.data->zstd_dict == nullptr) {
      return false;
    }
  }

  switch (type) {
    case TERM:
      term_dicts_.push_back(std::move(dict));
      break;
    case FREQ:
      freq_dicts_.push_back(std::move(dict));
      break;
    case PITCH:
      pitch_dicts_.push_back(std::move(dict));
      break;
    case KANJI:
      kanji_dicts_.push_back(std::move(dict));
      break;
  }
  return true;
}

bool DictionaryQuery::add_term_dict(const std::string& path) {
  return add_dict(path, DictionaryQuery::DictionaryType::TERM);
}

bool DictionaryQuery::add_freq_dict(const std::string& path) {
  return add_dict(path, DictionaryQuery::DictionaryType::FREQ);
}

bool DictionaryQuery::add_pitch_dict(const std::string& path) {
  return add_dict(path, DictionaryQuery::DictionaryType::PITCH);
}

bool DictionaryQuery::add_kanji_dict(const std::string& path) {
  return add_dict(path, DictionaryQuery::DictionaryType::KANJI);
}

size_t DictionaryQuery::remove_dict(const std::string& path) {
  size_t removed = 0;
  for (auto* dicts : {&term_dicts_, &freq_dicts_, &pitch_dicts_, &kanji_dicts_}) {
    removed += std::erase_if(*dicts, [&path](const Dictionary& d) { return d.path == path; });
  }
  return removed;
}

bool DictionaryQuery::set_dict_order(const std::vector<std::string>& paths) {
  // A listed path is rejected unless some kind of it is loaded; otherwise the
  // caller's view of the loaded set has drifted and it should rebuild instead.
  for (const auto& path : paths) {
    const auto loaded = [&path](const std::vector<Dictionary>& dicts) {
      return std::ranges::any_of(dicts, [&path](const Dictionary& d) { return d.path == path; });
    };
    if (!loaded(term_dicts_) && !loaded(freq_dicts_) && !loaded(pitch_dicts_) && !loaded(kanji_dicts_)) {
      return false;
    }
  }
  const auto rank = [&paths](const Dictionary& d) {
    const auto it = std::ranges::find(paths, d.path);
    return it == paths.end() ? paths.size() : static_cast<size_t>(it - paths.begin());
  };
  for (auto* dicts : {&term_dicts_, &freq_dicts_, &pitch_dicts_, &kanji_dicts_}) {
    std::ranges::stable_sort(*dicts, {}, rank);
  }
  return true;
}

size_t DictionaryQuery::long_key_length(std::string_view text, const std::string* term_dictionary_path) const {
  const auto hash = scan_index::prefix_hash(text);
  if (!hash) {
    return 0;
  }
  size_t longest = 0;
  for (const auto& dict : term_dicts_) {
    if (term_dictionary_path != nullptr && dict.path != *term_dictionary_path) {
      continue;
    }
    longest = std::max(longest, dict.data->long_key_length(*hash));
  }
  return longest;
}

size_t DictionaryQuery::max_long_key_length(const std::string* term_dictionary_path) const {
  size_t longest = 0;
  for (const auto& dict : term_dicts_) {
    if (term_dictionary_path != nullptr && dict.path != *term_dictionary_path) {
      continue;
    }
    longest = std::max<size_t>(longest, dict.data->scan_index_view().max_key_length);
  }
  return longest;
}

std::vector<TermResult> DictionaryQuery::query(const std::string& expression) const {
  RawTerms raw = query_raw(expression);
  std::vector<TermResult> results;
  results.reserve(raw.terms.size());
  for (auto& term : raw.terms) {
    results.push_back(build_term(raw, term));
  }
  std::ranges::sort(results, [](const TermResult& a, const TermResult& b) {
    return a.expression != b.expression ? a.expression < b.expression : a.reading < b.reading;
  });
  for (auto& term : results) {
    materialize(term);
  }
  return results;
}

RawTerms DictionaryQuery::query_raw(const std::string& expression,
                                    const std::string* term_dictionary_path) const {
  RawTerms raw;
  auto find_term = [&raw](std::string_view expr, std::string_view reading) -> RawTerm* {
    for (auto& term : raw.terms) {
      if (term.expression == expr && term.reading == reading) {
        return &term;
      }
    }
    return nullptr;
  };
  for (const auto& [path, name, styles, data] : term_dicts_) {
    if (term_dictionary_path != nullptr && path != *term_dictionary_path) {
      continue;
    }
    uint64_t offset_addr = data->table(expression);
    if (offset_addr == 0) {
      continue;
    }
    const uint8_t* index_addr = data->blobs.data + offset_addr;

    auto count = read_val<uint32_t>(index_addr);
    raw.terms.reserve(raw.terms.size() + count);
    raw.glossaries.reserve(raw.glossaries.size() + count);
    for (uint32_t i = 0; i < count; i++) {
      auto offset = read_val<uint64_t>(index_addr);
      const uint8_t* blob_addr = data->blobs.data + offset;

      // first byte encodes term (0) or meta (1) entry
      auto type = read_val<uint8_t>(blob_addr);
      if (type != 0) {
        continue;
      }

      auto expr_len = read_val<uint16_t>(blob_addr);
      std::string_view expr = read_str(blob_addr, expr_len);

      auto reading_len = read_val<uint16_t>(blob_addr);
      std::string_view reading = read_str(blob_addr, reading_len);

      if (expr != expression && reading != expression) {
        continue;
      }

      auto glossary_offset = read_val<uint64_t>(blob_addr);
      auto glossary_size = read_val<uint32_t>(blob_addr);

      auto def_tags_size = read_val<uint8_t>(blob_addr);
      std::string_view definition_tags = read_str(blob_addr, def_tags_size);

      auto rules_size = read_val<uint8_t>(blob_addr);
      std::string_view rules = read_str(blob_addr, rules_size);

      auto term_tag_size = read_val<uint8_t>(blob_addr);
      std::string_view term_tags = read_str(blob_addr, term_tag_size);

      if (data->version >= 2) {
        auto redirect_count = read_val<uint32_t>(blob_addr);
        for (uint32_t r = 0; r < redirect_count; r++) {
          auto form_of_len = read_val<uint32_t>(blob_addr);
          read_str(blob_addr, form_of_len);
          auto rule_count = read_val<uint32_t>(blob_addr);
          for (uint32_t j = 0; j < rule_count; j++) {
            auto rule_len = read_val<uint32_t>(blob_addr);
            read_str(blob_addr, rule_len);
          }
        }
      }

      double score = 0;
      if (data->version >= 5) {
        score = read_val<double>(blob_addr);
      } else if (data->version >= 3) {
        score = read_val<int32_t>(blob_addr);
      }

      const auto glossary_index = static_cast<uint32_t>(raw.glossaries.size());
      raw.glossaries.push_back(RawGlossary{.dict_name = &name,
                                           .definition_tags = definition_tags,
                                           .term_tags = term_tags,
                                           .rules = rules,
                                           .compressed_data = data->blobs.data + glossary_offset,
                                           .compressed_size = glossary_size,
                                           .zstd_dict = data->zstd_dict,
                                           .next = UINT32_MAX});

      RawTerm* term = find_term(expr, reading);
      if (term == nullptr) {
        raw.terms.push_back(RawTerm{.expression = expr,
                                    .reading = reading,
                                    .score = score,
                                    .first_glossary = glossary_index,
                                    .last_glossary = glossary_index,
                                    .frequencies = {},
                                    .pitches = {}});
      } else {
        raw.glossaries[term->last_glossary].next = glossary_index;
        term->last_glossary = glossary_index;
        term->score = std::max(term->score, score);
      }
    }
  }

  for (auto& term : raw.terms) {
    collect_frequencies(term.expression, term.reading, term.frequencies);
    collect_pitches(term.expression, term.reading, term.pitches);
  }

  return raw;
}

TermResult DictionaryQuery::build_term(const RawTerms& raw, RawTerm& term) const {
  TermResult result{.expression = std::string(term.expression),
                    .reading = std::string(term.reading),
                    .rules = {},
                    .score = term.score,
                    .glossaries = {},
                    .frequencies = std::move(term.frequencies),
                    .pitches = std::move(term.pitches)};
  size_t glossary_count = 0;
  for (uint32_t i = term.first_glossary; i != UINT32_MAX; i = raw.glossaries[i].next) {
    ++glossary_count;
  }
  result.glossaries.reserve(glossary_count);
  for (uint32_t i = term.first_glossary; i != UINT32_MAX; i = raw.glossaries[i].next) {
    const RawGlossary& g = raw.glossaries[i];
    if (!g.rules.empty()) {
      if (!result.rules.empty()) {
        result.rules += " ";
      }
      result.rules += g.rules;
    }
    GlossaryEntry& entry = result.glossaries.emplace_back();
    entry.dict_name = *g.dict_name;
    entry.definition_tags = g.definition_tags;
    entry.term_tags = g.term_tags;
    entry.compressed_data = g.compressed_data;
    entry.compressed_size = g.compressed_size;
    entry.zstd_dict = g.zstd_dict;
  }
  return result;
}

void DictionaryQuery::query_freq(std::vector<TermResult>& terms) const {
  for (auto& term : terms) {
    collect_frequencies(term.expression, term.reading, term.frequencies);
  }
}

void DictionaryQuery::collect_frequencies(std::string_view expression, std::string_view reading,
                                        std::vector<FrequencyEntry>& out) const {
  for (const auto& [path, name, styles, data] : freq_dicts_) {
    uint64_t offset_addr = data->table(expression);
    if (offset_addr == 0) {
      continue;
    }
    const uint8_t* index_addr = data->blobs.data + offset_addr;
    auto count = read_val<uint32_t>(index_addr);

    std::vector<Frequency> frequencies;
    for (uint32_t i = 0; i < count; i++) {
      auto offset = read_val<uint64_t>(index_addr);
      const uint8_t* blob_addr = data->blobs.data + offset;

      auto type = read_val<uint8_t>(blob_addr);
      if (type != 1) {
        continue;
      }

      auto expr_len = read_val<uint16_t>(blob_addr);
      std::string_view expr = read_str(blob_addr, expr_len);
      if (expr != expression) {
        continue;
      }

      auto mode_len = read_val<uint8_t>(blob_addr);
      std::string_view mode = read_str(blob_addr, mode_len);
      if (mode != "freq") {
        continue;
      }

      auto freq_data_size = read_val<uint32_t>(blob_addr);
      std::string_view freq_data = read_str(blob_addr, freq_data_size);

      ParsedFrequency parsed;
      if (yomitan_parser::parse_frequency(freq_data, parsed)) {
        if (!parsed.reading.empty() && parsed.reading != reading) {
          continue;
        }
        frequencies.emplace_back(
            Frequency{.value = parsed.value, .display_value = std::string(parsed.display_value)});
      }
    }
    if (!frequencies.empty()) {
      out.emplace_back(FrequencyEntry{.dict_name = name, .frequencies = std::move(frequencies)});
    }
  }
}

void DictionaryQuery::query_pitch(std::vector<TermResult>& terms) const {
  for (auto& term : terms) {
    collect_pitches(term.expression, term.reading, term.pitches);
  }
}

void DictionaryQuery::collect_pitches(std::string_view expression, std::string_view reading,
                                    std::vector<PitchEntry>& out) const {
  for (const auto& [path, name, styles, data] : pitch_dicts_) {
    uint64_t offset_addr = data->table(expression);
    if (offset_addr == 0) {
      continue;
    }
    const uint8_t* index_addr = data->blobs.data + offset_addr;
    auto count = read_val<uint32_t>(index_addr);

    std::vector<Pitch> pitches;
    std::vector<std::string> transcriptions;
    for (uint32_t i = 0; i < count; i++) {
      auto offset = read_val<uint64_t>(index_addr);
      const uint8_t* blob_addr = data->blobs.data + offset;

      auto type = read_val<uint8_t>(blob_addr);
      if (type != 1) {
        continue;
      }

      auto expr_len = read_val<uint16_t>(blob_addr);
      std::string_view expr = read_str(blob_addr, expr_len);
      if (expr != expression) {
        continue;
      }

      auto mode_len = read_val<uint8_t>(blob_addr);
      std::string_view mode = read_str(blob_addr, mode_len);
      ParsedPitch parsed;
      if (mode == "pitch") {
        auto pitch_data_size = read_val<uint32_t>(blob_addr);
        std::string_view pitch_data = read_str(blob_addr, pitch_data_size);

        if (yomitan_parser::parse_pitch(pitch_data, parsed)) {
          if (!parsed.reading.empty() && parsed.reading != reading) {
            continue;
          }
          for (auto& accent : parsed.pitches) {
            pitches.emplace_back(Pitch{.position = accent.position,
                                       .pattern = std::move(accent.pattern),
                                       .nasal = std::move(accent.nasal),
                                       .devoice = std::move(accent.devoice)});
          }
        }
      } else if (mode == "ipa") {
        auto transcriptions_data_size = read_val<uint32_t>(blob_addr);
        std::string_view transcriptions_data = read_str(blob_addr, transcriptions_data_size);
        if (yomitan_parser::parse_ipa(transcriptions_data, parsed)) {
          if (!parsed.reading.empty() && parsed.reading != reading) {
            continue;
          }
          for (std::string_view transcription : parsed.transcriptions) {
            transcriptions.emplace_back(transcription);
          }
        }
      }
    }
    if (!pitches.empty() || !transcriptions.empty()) {
      out.emplace_back(PitchEntry{
          .dict_name = name,
          .pitches = std::move(pitches),
          .transcriptions = std::move(transcriptions),
      });
    }
  }
}

KanjiResult DictionaryQuery::query_kanji(const std::string& kanji) const {
  KanjiResult result;
  result.character = kanji;

  for (const auto& [path, name, styles, data] : kanji_dicts_) {
    uint64_t offset_addr = data->table(kanji);
    if (offset_addr == 0) {
      continue;
    }
    const uint8_t* index_addr = data->blobs.data + offset_addr;
    auto count = read_val<uint32_t>(index_addr);

    for (uint32_t i = 0; i < count; i++) {
      auto offset = read_val<uint64_t>(index_addr);
      const uint8_t* blob_addr = data->blobs.data + offset;

      auto type = read_val<uint8_t>(blob_addr);
      if (type != 2) {
        continue;
      }

      auto char_len = read_val<uint8_t>(blob_addr);
      std::string_view char_sv = read_str(blob_addr, char_len);
      if (char_sv != kanji) {
        continue;
      }

      auto onyomi_len = read_val<uint16_t>(blob_addr);
      std::string_view onyomi = read_str(blob_addr, onyomi_len);

      auto kunyomi_len = read_val<uint16_t>(blob_addr);
      std::string_view kunyomi = read_str(blob_addr, kunyomi_len);

      auto tags_len = read_val<uint16_t>(blob_addr);
      std::string_view tags = read_str(blob_addr, tags_len);

      KanjiEntry entry;
      entry.dict_name = name;
      entry.onyomi = onyomi;
      entry.kunyomi = kunyomi;
      entry.tags = tags;

      auto def_count = read_val<uint16_t>(blob_addr);
      for (uint16_t j = 0; j < def_count; j++) {
        auto def_len = read_val<uint16_t>(blob_addr);
        std::string_view def = read_str(blob_addr, def_len);
        entry.definitions.emplace_back(def);
      }

      auto stat_count = read_val<uint16_t>(blob_addr);
      for (uint16_t j = 0; j < stat_count; j++) {
        auto key_len = read_val<uint16_t>(blob_addr);
        std::string_view key = read_str(blob_addr, key_len);
        auto val_len = read_val<uint16_t>(blob_addr);
        std::string_view val = read_str(blob_addr, val_len);
        entry.stats.emplace(key, val);
      }

      result.entries.push_back(std::move(entry));
    }
  }

  return result;
}

std::string DictionaryQuery::decompress_glossary(const void* data, size_t size, const ZSTD_DDict_s* dict) {
  if (!data || size == 0) {
    return "";
  }

  unsigned long long decompressed_size = ZSTD_getFrameContentSize(data, size);
  if (decompressed_size == ZSTD_CONTENTSIZE_ERROR || decompressed_size == ZSTD_CONTENTSIZE_UNKNOWN) {
    return "";
  }

  std::string result;
  size_t actual_size = 0;
  result.resize_and_overwrite(decompressed_size, [&](char* buf, size_t capacity) {
    actual_size = ZSTD_decompress_usingDDict(thread_dctx(), buf, capacity, data, size, dict);
    return ZSTD_isError(actual_size) ? size_t{0} : actual_size;
  });
  if (ZSTD_isError(actual_size)) {
    return "";
  }
  return result;
}

void DictionaryQuery::materialize(TermResult& term) const {
  for (auto& g : term.glossaries) {
    g.glossary = decompress_glossary(g.compressed_data, g.compressed_size, g.zstd_dict);
  }
}

std::vector<char> DictionaryQuery::get_media_file(const std::string& dict_name, const std::string& media_path) const {
  auto view = get_media_file_view(dict_name, media_path);
  return {view.data, view.data + view.size};
}

MediaFileView DictionaryQuery::get_media_file_view(const std::string& dict_name, const std::string& media_path) const {
  for (const auto& [path, name, styles, data] : term_dicts_) {
    if (name != dict_name) {
      continue;
    }

    if (!data->media || !data->media_index) {
      return {};
    }

    const uint8_t* ptr = data->media_index.data;
    auto count = read_val<uint32_t>(ptr);

    size_t left = 0;
    size_t right = count;
    while (left < right) {
      const size_t mid = left + (right - left) / 2;
      uint64_t record_offset;
      std::memcpy(&record_offset, data->media_index.data + sizeof(uint32_t) + mid * sizeof(uint64_t), sizeof(uint64_t));

      const uint8_t* record = data->media.data + record_offset;
      auto path_size = read_val<uint16_t>(record);
      std::string_view indexed_path = read_str(record, path_size);
      if (indexed_path < media_path) {
        left = mid + 1;
      } else if (indexed_path > media_path) {
        right = mid;
      } else {
        auto blob_size = read_val<uint32_t>(record);
        const char* blob_data = reinterpret_cast<const char*>(record);
        return {.data = blob_data, .size = blob_size};
      }
    }
    return {};
  }
  return {};
}

std::vector<DictionaryStyle> DictionaryQuery::get_styles() const {
  return term_dicts_ | std::views::filter([](const auto& d) { return !d.styles.empty(); }) |
         std::views::transform([](const auto& d) { return DictionaryStyle{d.name, d.styles}; }) |
         std::ranges::to<std::vector>();
}

std::vector<std::string> DictionaryQuery::get_freq_dict_order() const {
  return freq_dicts_ | std::views::transform([](const auto& d) { return d.name; }) | std::ranges::to<std::vector>();
}
