#include "hoshidicts/query.hpp"

#include <ankerl/unordered_dense.h>
#define ZSTD_STATIC_LINKING_ONLY
#include <zstd.h>

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <memory>
#include <ranges>
#include <stdexcept>
#include <string_view>
#include <vector>

#include "blob_file.hpp"
#include "hash/hash.hpp"
#include "hoshidicts/importer.hpp"
#include "json/yomitan_parser.hpp"
#include "memory/memory.hpp"
#include "memory/page_cache.hpp"
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

// Emscripten's mmap copies the whole file into linear memory, so media.bin,
// which is read only when a media file is asked for, is read on demand there
// whatever the storage. Natively a mapping costs nothing until it is read.
#ifdef __EMSCRIPTEN__
constexpr bool media_always_on_demand = true;
#else
constexpr bool media_always_on_demand = false;
#endif

// A media.bin record is [u16 path length][path][u32 size][bytes]. One read of
// this many bytes covers the header of a record whose path is 256 bytes or
// shorter, which is nearly every one.
constexpr size_t media_probe_bytes = sizeof(uint16_t) + 256 + sizeof(uint32_t);

// Reads a whole file as std::ifstream(path, mode) and an istreambuf_iterator
// would, but a non-empty regular file with one read (memory::read_file)
// instead of one per stream buffer: through WasmFS's OPFS backend each is an
// asynchronous round trip. Every other path is left to the stream, so what it
// gives is unchanged, down to libstdc++'s exception for a directory; so is a
// Windows text-mode read, which turns CRLF into LF. When the one read fails,
// the stream reads the file again: an error that happens again ends it as it
// ends the stream (libstdc++ throws, libc++ stops there), and only one that
// does not lets the add read what the stream alone would have refused. False,
// with `out` empty, when the stream cannot open the file.
bool read_whole(const std::filesystem::path& path, std::string& out, std::ios::openmode mode) {
  out.clear();
#ifdef _WIN32
  const bool raw = (mode & std::ios::binary) != 0;
#else
  constexpr bool raw = true;
#endif
  if (raw && memory::read_file(path, out)) {
    return true;
  }
  std::ifstream file(path, mode);
  if (!file) {
    return false;
  }
  out.assign(std::istreambuf_iterator<char>(file), {});
  return true;
}
}

struct DictionaryQuery::DictionaryData {
  int version;
#ifdef HOSHIDICTS_YOMITAN
  // The term records hold the fields for Yomitan's host after the score
  // (.hoshidicts_yomitan_1).
  bool yomitan_rows = false;
#endif
  // The imported summary's tag-bank rows (empty before they were stored).
  std::vector<SummaryTag> tags;
  hash::linear table;
  hash::bloom bloom;
  BlobFile blobs;
  memory::mapped_file bloom_filter;
  // media.bin is either mapped or read on demand (see media_always_on_demand).
  memory::mapped_file media;
  memory::file_reader media_reader;
  memory::mapped_file media_index;
  // Optional long-key scan index (see src/scan_index.hpp); absent for
  // dictionaries imported before it existed and for ones without long keys.
  memory::mapped_file scan_index;
  ZSTD_DDict* zstd_dict = nullptr;

  ~DictionaryData() {
    memory::unmap(bloom_filter);
    memory::unmap(media);
    memory::unmap(media_index);
    memory::unmap(scan_index);
    ZSTD_freeDDict(zstd_dict);
  }

  struct MediaRecord {
    bool found = false;
    // Where the file's bytes start in media.bin.
    uint64_t offset = 0;
    uint32_t size = 0;
  };

  // Binary search over media.idx, which lists the records' offsets sorted by
  // path. Each probe compares the record's path, from the mapping or with one
  // read of its header.
  MediaRecord find_media(std::string_view media_path) const {
    MediaRecord result;
    if ((!media && !media_reader) || !media_index) {
      return result;
    }
    const uint8_t* ptr = media_index.data;
    auto count = read_val<uint32_t>(ptr);

    std::array<uint8_t, media_probe_bytes> probe;
    std::string long_header;
    size_t left = 0;
    size_t right = count;
    while (left < right) {
      const size_t mid = left + (right - left) / 2;
      uint64_t record_offset;
      std::memcpy(&record_offset, media_index.data + sizeof(uint32_t) + mid * sizeof(uint64_t), sizeof(uint64_t));

      const uint8_t* record;
      if (media) {
        record = media.data + record_offset;
      } else {
        if (record_offset >= media_reader.size()) {
          throw std::runtime_error("media.idx points past the end of media.bin");
        }
        const auto head = static_cast<size_t>(std::min<uint64_t>(probe.size(), media_reader.size() - record_offset));
        if (head < sizeof(uint16_t) || !media_reader.read(probe.data(), head, record_offset)) {
          throw std::runtime_error("could not read media.bin");
        }
        uint16_t path_size;
        std::memcpy(&path_size, probe.data(), sizeof(path_size));
        record = probe.data();
        if (sizeof(uint16_t) + path_size + sizeof(uint32_t) > head) {
          long_header.resize(sizeof(uint16_t) + path_size + sizeof(uint32_t));
          if (!media_reader.read(long_header.data(), long_header.size(), record_offset)) {
            throw std::runtime_error("could not read media.bin");
          }
          record = reinterpret_cast<const uint8_t*>(long_header.data());
        }
      }

      const uint8_t* cursor = record;
      auto path_size = read_val<uint16_t>(cursor);
      std::string_view indexed_path = read_str(cursor, path_size);
      if (indexed_path < media_path) {
        left = mid + 1;
      } else if (indexed_path > media_path) {
        right = mid;
      } else {
        result.found = true;
        result.size = read_val<uint32_t>(cursor);
        result.offset = record_offset + static_cast<uint64_t>(cursor - record);
        return result;
      }
    }
    return result;
  }

  bool read_media(uint8_t* out, size_t size, uint64_t offset) const {
    if (media) {
      std::memcpy(out, media.data + offset, size);
      return true;
    }
    return media_reader.read(out, size, offset);
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

template <typename F>
void DictionaryQuery::each_term(const Selection& selection, F&& f) const {
  const auto visit = [&](const Dictionary& dict) {
    if (selection.term_path == nullptr || dict.path == *selection.term_path) {
      f(dict);
    }
  };
  if (selection.all) {
    for (const auto& dict : term_dicts_) visit(dict);
  } else {
    for (const Dictionary* dict : selection.term) visit(*dict);
  }
}

template <typename F>
void DictionaryQuery::each_of(const std::vector<Dictionary>& all, const std::vector<const Dictionary*>& chosen,
                              const Selection& selection, F&& f) {
  if (selection.all) {
    for (const auto& dict : all) f(dict);
  } else {
    for (const Dictionary* dict : chosen) f(*dict);
  }
}

DictionaryQuery::DictionaryQuery() = default;
DictionaryQuery::DictionaryQuery(const PageCacheOptions& page_cache) : page_cache_options_(page_cache) {}
DictionaryQuery::~DictionaryQuery() = default;

DictionaryQuery::DictionaryQuery(DictionaryQuery&&) noexcept = default;
DictionaryQuery& DictionaryQuery::operator=(DictionaryQuery&&) noexcept = default;

DictionaryQuery::Dictionary::Dictionary() = default;
DictionaryQuery::Dictionary::~Dictionary() = default;

DictionaryQuery::Dictionary::Dictionary(Dictionary&&) noexcept = default;
DictionaryQuery::Dictionary& DictionaryQuery::Dictionary::operator=(Dictionary&&) noexcept = default;

bool DictionaryQuery::add_dict(const std::string& path_utf8, DictionaryType type, DictionaryStorage storage, DictionaryIndexStorage index_storage) {
  last_error_.clear();
  try {
    return add_dict_(path_utf8, type, storage, index_storage);
  } catch (const std::exception& error) {
    last_error_ = error.what();
    return false;
  }
}

const DictionaryQuery::Dictionary* DictionaryQuery::find_loaded(const std::string& path) const {
  for (const auto* dicts : {&term_dicts_, &freq_dicts_, &pitch_dicts_, &kanji_dicts_}) {
    for (const auto& dict : *dicts) {
      if (dict.path == path) {
        return &dict;
      }
    }
  }
  return nullptr;
}

bool DictionaryQuery::add_dict_(const std::string& path_utf8, DictionaryType type, DictionaryStorage storage, DictionaryIndexStorage index_storage) {
  const std::filesystem::path path = path_utils::from_utf8(path_utf8);
  Dictionary dict;
  dict.path = path_utf8;
  if (const Dictionary* other = find_loaded(path_utf8)) {
    // Another kind of this dictionary is loaded: the kinds read the same files,
    // so they share one copy of them (and one set of descriptors).
    dict.name = other->name;
    dict.styles = other->styles;
    dict.data = other->data;
  } else if (!open_dict_(path_utf8, dict, storage, index_storage)) {
    return false;
  }

  // Only term lookups read the scan index, so a dictionary first loaded as
  // another kind maps it when it is added as a term dictionary.
  if (type == TERM && !dict.data->scan_index && std::filesystem::is_regular_file(path / scan_index::file_name)) {
    dict.data->scan_index = memory::map_rd(path / scan_index::file_name);
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

bool DictionaryQuery::open_dict_(const std::string& path_utf8, Dictionary& dict, DictionaryStorage storage, DictionaryIndexStorage index_storage) {
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

  Summary summary;
  std::string buf;
  if (!read_whole(path / "index.json", buf, std::ios::binary)) {
    return false;
  }
  if (glz::read<glz::opts{.error_on_unknown_keys = false}>(summary, buf)) {
    return false;
  }

  dict.name = summary.title.empty() ? path_utils::to_utf8(path.stem()) : summary.title;
  dict.styles = summary.styles;
  if (dict.styles.empty() && std::filesystem::exists(path / "styles.css")) {
    read_whole(path / "styles.css", dict.styles, std::ios::in);
  }

  dict.data = std::make_shared<DictionaryData>();
  dict.data->version = version;
#ifdef HOSHIDICTS_YOMITAN
  dict.data->yomitan_rows = std::filesystem::is_regular_file(path / ".hoshidicts_yomitan_1");
#endif
  dict.data->tags = std::move(summary.tags);

  const bool index_paged = index_storage == DictionaryIndexStorage::Paged;
  const bool paged = storage == DictionaryStorage::Paged;
  if ((paged || index_paged) && !page_cache_) {
    page_cache_ = std::make_shared<memory::page_cache>(page_cache_options_.page_bytes, page_cache_options_.budget_bytes);
  }
  auto hash_file = index_paged ? BlobFile::open(path / "hash.table", page_cache_, memory::page_kind::index)
                              : BlobFile::map(path / "hash.table");
  if (!dict.data->table.load(std::move(hash_file))) {
    throw std::runtime_error(path_utf8 + "/hash.table: invalid capacity, length or inaccessible file");
  }

  dict.data->bloom_filter = memory::map_rd(path / "bloom.filter");
  if (!dict.data->bloom_filter) {
    return false;
  }
  if (!dict.data->bloom.load(dict.data->bloom_filter.data, dict.data->bloom_filter.size)) {
    return false;
  }
  dict.data->table.set_bloom(&dict.data->bloom);

  if (paged) {
    dict.data->blobs = BlobFile::open(path / "blobs.bin", page_cache_);
  } else {
    dict.data->blobs = BlobFile::map(path / "blobs.bin");
  }
  if (!dict.data->blobs) {
    return false;
  }

  if (paged || media_always_on_demand) {
    dict.data->media_reader = memory::file_reader::open(path / "media.bin");
  } else {
    dict.data->media = memory::map_rd(path / "media.bin");
  }
  if (dict.data->media || dict.data->media_reader) {
    dict.data->media_index = memory::map_rd(path / "media.idx");
  }

  if (version == 4 || version == 6) {
    std::string blob;
    read_whole(path / "dict.zstd", blob, std::ios::binary);
    dict.data->zstd_dict =
        ZSTD_createDDict_advanced(blob.data(), blob.size(), ZSTD_dlm_byCopy, ZSTD_dct_fullDict, ZSTD_defaultCMem);
    if (dict.data->zstd_dict == nullptr) {
      return false;
    }
  }
  return true;
}

bool DictionaryQuery::add_term_dict(const std::string& path, DictionaryStorage storage, DictionaryIndexStorage index_storage) {
  return add_dict(path, DictionaryQuery::DictionaryType::TERM, storage, index_storage);
}

bool DictionaryQuery::add_freq_dict(const std::string& path, DictionaryStorage storage, DictionaryIndexStorage index_storage) {
  return add_dict(path, DictionaryQuery::DictionaryType::FREQ, storage, index_storage);
}

bool DictionaryQuery::add_pitch_dict(const std::string& path, DictionaryStorage storage, DictionaryIndexStorage index_storage) {
  return add_dict(path, DictionaryQuery::DictionaryType::PITCH, storage, index_storage);
}

bool DictionaryQuery::add_kanji_dict(const std::string& path, DictionaryStorage storage, DictionaryIndexStorage index_storage) {
  return add_dict(path, DictionaryQuery::DictionaryType::KANJI, storage, index_storage);
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
  Selection selection;
  selection.term_path = term_dictionary_path;
  return long_key_length(text, selection);
}

size_t DictionaryQuery::long_key_length(std::string_view text, const Selection& selection) const {
  const auto hash = scan_index::prefix_hash(text);
  if (!hash) {
    return 0;
  }
  size_t longest = 0;
  each_term(selection, [&](const Dictionary& dict) { longest = std::max(longest, dict.data->long_key_length(*hash)); });
  return longest;
}

DictionaryQuery::Selection DictionaryQuery::select(const std::optional<std::vector<std::string>>& paths,
                                                   const std::string* term_path) const {
  if (!paths.has_value()) {
    Selection selection;
    selection.term_path = term_path;
    return selection;
  }
  return select(std::span<const std::string>(*paths), term_path);
}

DictionaryQuery::Selection DictionaryQuery::select(std::span<const std::string> paths,
                                                   const std::string* term_path) const {
  Selection selection;
  selection.all = false;
  selection.term_path = term_path;
  const auto pick = [&paths](const std::vector<Dictionary>& dicts, std::vector<const Dictionary*>& out) {
    for (const auto& path : paths) {
      for (const auto& dict : dicts) {
        if (dict.path == path) {
          if (std::ranges::find(out, &dict) == out.end()) out.push_back(&dict);
          break;
        }
      }
    }
  };
  pick(term_dicts_, selection.term);
  pick(freq_dicts_, selection.freq);
  pick(pitch_dicts_, selection.pitch);
  pick(kanji_dicts_, selection.kanji);
  return selection;
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
  BlobPins pins;
  RawTerms raw = query_raw(expression, pins);
  std::vector<TermResult> results;
  results.reserve(raw.terms.size());
  for (auto& term : raw.terms) {
    results.push_back(build_term(raw, term, pins));
  }
  std::ranges::sort(results, [](const TermResult& a, const TermResult& b) {
    return a.expression != b.expression ? a.expression < b.expression : a.reading < b.reading;
  });
  for (auto& term : results) {
    materialize(term);
  }
  return results;
}

RawTerms DictionaryQuery::query_raw(const std::string& expression, BlobPins& pins,
                                    const std::string* term_dictionary_path, bool with_metadata) const {
  Selection selection;
  selection.term_path = term_dictionary_path;
  return query_raw(expression, pins, selection, with_metadata);
}

RawTerms DictionaryQuery::query_raw(const std::string& expression, BlobPins& pins, const Selection& selection,
                                    bool with_metadata, const ReadingNormalizer* normalizer,
                                    std::vector<RawFormOfRow>* form_of_rows) const {
  RawTerms raw;
  if (normalizer != nullptr) {
    raw.normalized = std::make_unique<NormalizedReadings>();
  }
  std::string normalized_reading;
  auto find_term = [&raw, normalizer, &normalized_reading](std::string_view expr, std::string_view reading) -> RawTerm* {
    if (normalizer != nullptr) {
      normalized_reading = normalizer->normalize(reading);
      for (auto& term : raw.terms) {
        if (term.expression == expr && raw.normalized->normalized[term.merged] == normalized_reading) {
          return &term;
        }
      }
      return nullptr;
    }
    for (auto& term : raw.terms) {
      if (term.expression == expr && term.reading == reading) {
        return &term;
      }
    }
    return nullptr;
  };
  each_term(selection, [&](const Dictionary& dict) {
    const auto& name = dict.name;
    const auto& data = dict.data;
    uint64_t offset_addr = data->table(expression);
    if (offset_addr == 0) {
      return;
    }
    visit_blobs(data->blobs, pins, [&](auto open) {
      auto index = open(offset_addr);

      auto count = read_value<uint32_t>(index);
      raw.terms.reserve(raw.terms.size() + count);
      raw.glossaries.reserve(raw.glossaries.size() + count);
      for (uint32_t i = 0; i < count; i++) {
        auto offset = read_value<uint64_t>(index);
        auto blob = open(offset);

        // first byte encodes term (0) or meta (1) entry
        auto type = read_value<uint8_t>(blob);
        if (type != 0) {
          continue;
        }

        auto expr_len = read_value<uint16_t>(blob);
        std::string_view expr = blob.str(expr_len);

        auto reading_len = read_value<uint16_t>(blob);
        std::string_view reading = blob.str(reading_len);

        if (expr != expression && reading != expression) {
          continue;
        }

        auto glossary_offset = read_value<uint64_t>(blob);
        auto glossary_size = read_value<uint32_t>(blob);

        auto def_tags_size = read_value<uint8_t>(blob);
        std::string_view definition_tags = blob.str(def_tags_size);

        auto rules_size = read_value<uint8_t>(blob);
        std::string_view rules = blob.str(rules_size);

        auto term_tag_size = read_value<uint8_t>(blob);
        std::string_view term_tags = blob.str(term_tag_size);

        // The form-of slot (src/json/form_of.hpp): no entry for a row
        // without form-of references, otherwise the flag, one entry with an
        // empty formOf whose rule count says whether the row also has other
        // definitions. Read only for a pack that follows references.
        bool form_of = false;
        bool only_references = false;
        if (data->version >= 2) {
          auto redirect_count = read_value<uint32_t>(blob);
          const bool flagged = form_of_rows != nullptr && data->version >= 3;
          for (uint32_t r = 0; r < redirect_count; r++) {
            auto form_of_len = read_value<uint32_t>(blob);
            blob.skip(form_of_len);
            auto rule_count = read_value<uint32_t>(blob);
            for (uint32_t j = 0; j < rule_count; j++) {
              auto rule_len = read_value<uint32_t>(blob);
              blob.skip(rule_len);
            }
            if (flagged && form_of_len == 0) {
              form_of = true;
              only_references = rule_count == form_of_slot::only_references;
            }
          }
        }
        if (form_of) {
          form_of_rows->push_back(RawFormOfRow{.dict_name = &name,
                                                  .rules = rules,
                                                  .blobs = &data->blobs,
                                                  .compressed_offset = glossary_offset,
                                                  .compressed_size = glossary_size,
                                                  .zstd_dict = data->zstd_dict});
          if (only_references) {
            continue;
          }
        }

        double score = 0;
        if (data->version >= 5) {
          score = read_value<double>(blob);
        } else if (data->version >= 3) {
          score = read_value<int32_t>(blob);
        }

        const auto glossary_index = static_cast<uint32_t>(raw.glossaries.size());
        raw.glossaries.push_back(RawGlossary{.dict_name = &name,
                                             .definition_tags = definition_tags,
                                             .term_tags = term_tags,
                                             .rules = rules,
                                             .score = score,
                                             .blobs = &data->blobs,
                                             .compressed_offset = glossary_offset,
                                             .compressed_size = glossary_size,
                                             .zstd_dict = data->zstd_dict,
                                             .next = UINT32_MAX,
                                             .drop_form_of = form_of});

        RawTerm* term = find_term(expr, reading);
        if (term == nullptr) {
          raw.terms.push_back(RawTerm{.expression = expr,
                                      .reading = reading,
                                      .score = score,
                                      .first_glossary = glossary_index,
                                      .last_glossary = glossary_index,
                                      .frequencies = {},
                                      .pitches = {}});
          if (normalizer != nullptr) {
            raw.terms.back().merged = static_cast<uint32_t>(raw.normalized->normalized.size());
            raw.normalized->normalized.push_back(normalized_reading);
            raw.normalized->merged_readings.push_back({reading});
          }
        } else {
          raw.glossaries[term->last_glossary].next = glossary_index;
          term->last_glossary = glossary_index;
          term->score = std::max(term->score, score);
          if (normalizer != nullptr) {
            auto& readings = raw.normalized->merged_readings[term->merged];
            if (std::ranges::find(readings, reading) == readings.end()) readings.push_back(reading);
          }
        }
      }
    });
  });

  if (with_metadata) {
    for (auto& term : raw.terms) {
      if (term.merged != UINT32_MAX) {
        collect_frequencies(term.expression, raw.normalized->merged_readings[term.merged], term.frequencies, pins,
                            selection);
        collect_pitches(term.expression, raw.normalized->merged_readings[term.merged], term.pitches, pins, selection);
      } else if (selection.all) {
        collect_frequencies(term.expression, term.reading, term.frequencies, pins);
        collect_pitches(term.expression, term.reading, term.pitches, pins);
      } else {
        const std::string_view reading = term.reading;
        collect_frequencies(term.expression, std::span(&reading, 1), term.frequencies, pins, selection);
        collect_pitches(term.expression, std::span(&reading, 1), term.pitches, pins, selection);
      }
    }
  }

  return raw;
}

TermResult DictionaryQuery::build_term(const RawTerms& raw, RawTerm& term, BlobPins& pins, bool compressed) const {
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
    if (compressed) {
      entry.compressed_data = g.blobs->range(g.compressed_offset, g.compressed_size, pins);
      entry.compressed_size = g.compressed_size;
      entry.zstd_dict = g.zstd_dict;
    }
    entry.score = g.score;
    entry.drop_form_of = g.drop_form_of;
  }
  // Dictionary order takes precedence over score. Within each dictionary,
  // higher-scored definitions come first, with original order kept for ties.
  for (auto first = result.glossaries.begin(); first != result.glossaries.end();) {
    const auto last = std::find_if(first, result.glossaries.end(), [&](const auto& entry) {
      return entry.dict_name != first->dict_name;
    });
    if (last - first > 1) {
      std::stable_sort(first, last, [](const auto& left, const auto& right) { return left.score > right.score; });
    }
    first = last;
  }
  return result;
}

void DictionaryQuery::query_freq(std::vector<TermResult>& terms) const {
  BlobPins pins;
  for (auto& term : terms) {
    collect_frequencies(term.expression, term.reading, term.frequencies, pins);
  }
}

namespace {
// The frequency rows of one dictionary for `expression` whose reading
// `matches` accepts.
template <typename Dict, typename Matches>
void frequencies_from(const Dict& dict, std::string_view expression, Matches&& matches, std::vector<FrequencyEntry>& out,
                      BlobPins& pins) {
  const auto& [path, name, styles, data] = dict;
  {
    uint64_t offset_addr = data->table(expression);
    if (offset_addr == 0) {
      return;
    }
    visit_blobs(data->blobs, pins, [&](auto open) {
      auto index = open(offset_addr);
      auto count = read_value<uint32_t>(index);

      std::vector<Frequency> frequencies;
      for (uint32_t i = 0; i < count; i++) {
        auto offset = read_value<uint64_t>(index);
        auto blob = open(offset);

        auto type = read_value<uint8_t>(blob);
        if (type != 1) {
          continue;
        }

        auto expr_len = read_value<uint16_t>(blob);
        std::string_view expr = blob.str(expr_len);
        if (expr != expression) {
          continue;
        }

        auto mode_len = read_value<uint8_t>(blob);
        std::string_view mode = blob.str(mode_len);
        if (mode != "freq") {
          continue;
        }

        auto freq_data_size = read_value<uint32_t>(blob);
        std::string_view freq_data = blob.str(freq_data_size);

        ParsedFrequency parsed;
        if (yomitan_parser::parse_frequency(freq_data, parsed)) {
          if (!matches(parsed.reading)) {
            continue;
          }
          frequencies.emplace_back(
              Frequency{.value = parsed.value, .display_value = std::string(parsed.display_value)});
        }
      }
      if (!frequencies.empty()) {
        out.emplace_back(FrequencyEntry{.dict_name = name, .frequencies = std::move(frequencies)});
      }
    });
  }
}
}  // namespace

void DictionaryQuery::collect_frequencies(std::string_view expression, std::string_view reading,
                                        std::vector<FrequencyEntry>& out, BlobPins& pins) const {
  for (const auto& dict : freq_dicts_) {
    frequencies_from(dict, expression, [reading](std::string_view row) { return row.empty() || row == reading; }, out,
                     pins);
  }
}

void DictionaryQuery::collect_frequencies(std::string_view expression, std::span<const std::string_view> readings,
                                          std::vector<FrequencyEntry>& out, BlobPins& pins,
                                          const Selection& selection) const {
  each_of(freq_dicts_, selection.freq, selection, [&](const Dictionary& dict) {
    frequencies_from(
        dict, expression,
        [readings](std::string_view row) { return row.empty() || std::ranges::find(readings, row) != readings.end(); },
        out, pins);
  });
}

void DictionaryQuery::query_pitch(std::vector<TermResult>& terms) const {
  BlobPins pins;
  for (auto& term : terms) {
    collect_pitches(term.expression, term.reading, term.pitches, pins);
  }
}

namespace {
template <typename Dict, typename Matches>
void pitches_from(const Dict& dict, std::string_view expression, Matches&& matches, std::vector<PitchEntry>& out,
                  BlobPins& pins) {
  const auto& [path, name, styles, data] = dict;
  {
    uint64_t offset_addr = data->table(expression);
    if (offset_addr == 0) {
      return;
    }
    visit_blobs(data->blobs, pins, [&](auto open) {
      auto index = open(offset_addr);
      auto count = read_value<uint32_t>(index);

      std::vector<Pitch> pitches;
      std::vector<std::string> transcriptions;
      for (uint32_t i = 0; i < count; i++) {
        auto offset = read_value<uint64_t>(index);
        auto blob = open(offset);

        auto type = read_value<uint8_t>(blob);
        if (type != 1) {
          continue;
        }

        auto expr_len = read_value<uint16_t>(blob);
        std::string_view expr = blob.str(expr_len);
        if (expr != expression) {
          continue;
        }

        auto mode_len = read_value<uint8_t>(blob);
        std::string_view mode = blob.str(mode_len);
        ParsedPitch parsed;
        if (mode == "pitch") {
          auto pitch_data_size = read_value<uint32_t>(blob);
          std::string_view pitch_data = blob.str(pitch_data_size);

          if (yomitan_parser::parse_pitch(pitch_data, parsed)) {
            if (!matches(parsed.reading)) {
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
          auto transcriptions_data_size = read_value<uint32_t>(blob);
          std::string_view transcriptions_data = blob.str(transcriptions_data_size);
          if (yomitan_parser::parse_ipa(transcriptions_data, parsed)) {
            if (!matches(parsed.reading)) {
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
    });
  }
}
}  // namespace

void DictionaryQuery::collect_pitches(std::string_view expression, std::string_view reading,
                                    std::vector<PitchEntry>& out, BlobPins& pins) const {
  for (const auto& dict : pitch_dicts_) {
    pitches_from(dict, expression, [reading](std::string_view row) { return row.empty() || row == reading; }, out, pins);
  }
}

void DictionaryQuery::collect_pitches(std::string_view expression, std::span<const std::string_view> readings,
                                      std::vector<PitchEntry>& out, BlobPins& pins, const Selection& selection) const {
  each_of(pitch_dicts_, selection.pitch, selection, [&](const Dictionary& dict) {
    pitches_from(
        dict, expression,
        [readings](std::string_view row) { return row.empty() || std::ranges::find(readings, row) != readings.end(); },
        out, pins);
  });
}

std::vector<std::string> DictionaryQuery::metadata_readings(std::string_view expression, BlobPins& pins,
                                                            const Selection& selection, bool& reading_less) const {
  std::vector<std::string> readings;
  reading_less = false;
  const auto add = [&](std::string& reading) {
    if (reading.empty()) {
      reading_less = true;
    } else if (std::ranges::find(readings, reading) == readings.end()) {
      readings.push_back(std::move(reading));
    }
  };
  // The mode and data of every term meta row keyed by `expression`, laid out
  // as collect_frequencies and collect_pitches read them.
  const auto visit_rows = [&](const std::vector<Dictionary>& dicts, const std::vector<const Dictionary*>& chosen,
                              auto&& row) {
    each_of(dicts, chosen, selection, [&](const Dictionary& dict) {
      const auto& data = dict.data;
      uint64_t offset_addr = data->table(expression);
      if (offset_addr == 0) {
        return;
      }
      visit_blobs(data->blobs, pins, [&](auto open) {
        auto index = open(offset_addr);
        auto count = read_value<uint32_t>(index);
        for (uint32_t i = 0; i < count; i++) {
          auto offset = read_value<uint64_t>(index);
          auto blob = open(offset);

          auto type = read_value<uint8_t>(blob);
          if (type != 1) {
            continue;
          }

          auto expr_len = read_value<uint16_t>(blob);
          if (blob.str(expr_len) != expression) {
            continue;
          }

          auto mode_len = read_value<uint8_t>(blob);
          std::string_view mode = blob.str(mode_len);
          auto data_size = read_value<uint32_t>(blob);
          row(mode, blob.str(data_size));
        }
      });
    });
  };
  visit_rows(freq_dicts_, selection.freq, [&](std::string_view mode, std::string_view row_data) {
    ParsedFrequency parsed;
    if (mode == "freq" && yomitan_parser::parse_frequency(row_data, parsed)) {
      add(parsed.reading);
    }
  });
  visit_rows(pitch_dicts_, selection.pitch, [&](std::string_view mode, std::string_view row_data) {
    ParsedPitch parsed;
    if ((mode == "pitch" && yomitan_parser::parse_pitch(row_data, parsed)) ||
        (mode == "ipa" && yomitan_parser::parse_ipa(row_data, parsed))) {
      add(parsed.reading);
    }
  });
  return readings;
}

KanjiResult DictionaryQuery::query_kanji(const std::string& kanji) const { return query_kanji(kanji, Selection{}); }

KanjiResult DictionaryQuery::query_kanji(const std::string& kanji, std::span<const std::string> dictionaries) const {
  return query_kanji(kanji, select(dictionaries, nullptr));
}

KanjiResult DictionaryQuery::query_kanji(const std::string& kanji, const Selection& selection) const {
  KanjiResult result;
  result.character = kanji;

  // Everything taken from a record is copied out before the pins go.
  BlobPins pins;
  each_of(kanji_dicts_, selection.kanji, selection, [&](const Dictionary& dict) {
    const auto& name = dict.name;
    const auto& data = dict.data;
    uint64_t offset_addr = data->table(kanji);
    if (offset_addr == 0) {
      return;
    }
    visit_blobs(data->blobs, pins, [&](auto open) {
      auto index = open(offset_addr);
      auto count = read_value<uint32_t>(index);

      for (uint32_t i = 0; i < count; i++) {
        auto offset = read_value<uint64_t>(index);
        auto blob = open(offset);

        auto type = read_value<uint8_t>(blob);
        if (type != 2) {
          continue;
        }

        auto char_len = read_value<uint8_t>(blob);
        std::string_view char_sv = blob.str(char_len);
        if (char_sv != kanji) {
          continue;
        }

        auto onyomi_len = read_value<uint16_t>(blob);
        std::string_view onyomi = blob.str(onyomi_len);

        auto kunyomi_len = read_value<uint16_t>(blob);
        std::string_view kunyomi = blob.str(kunyomi_len);

        auto tags_len = read_value<uint16_t>(blob);
        std::string_view tags = blob.str(tags_len);

        KanjiEntry entry;
        entry.dict_name = name;
        entry.onyomi = onyomi;
        entry.kunyomi = kunyomi;
        entry.tags = tags;

        auto def_count = read_value<uint16_t>(blob);
        for (uint16_t j = 0; j < def_count; j++) {
          auto def_len = read_value<uint16_t>(blob);
          std::string_view def = blob.str(def_len);
          entry.definitions.emplace_back(def);
        }

        auto stat_count = read_value<uint16_t>(blob);
        for (uint16_t j = 0; j < stat_count; j++) {
          auto key_len = read_value<uint16_t>(blob);
          std::string_view key = blob.str(key_len);
          auto val_len = read_value<uint16_t>(blob);
          std::string_view val = blob.str(val_len);
          entry.stats.emplace(key, val);
        }

        result.entries.push_back(std::move(entry));
      }
    });
  });

  each_of(freq_dicts_, selection.freq, selection, [&](const Dictionary& dict) {
    const auto& name = dict.name;
    const auto& data = dict.data;
    uint64_t offset_addr = data->table(kanji);
    if (offset_addr == 0) {
      return;
    }
    visit_blobs(data->blobs, pins, [&](auto open) {
      auto index = open(offset_addr);
      auto count = read_value<uint32_t>(index);

      std::vector<Frequency> frequencies;
      for (uint32_t i = 0; i < count; i++) {
        auto offset = read_value<uint64_t>(index);
        auto blob = open(offset);

        // Type 3 is a kanji_meta_bank row, laid out like a term meta row.
        auto type = read_value<uint8_t>(blob);
        if (type != 3) {
          continue;
        }

        auto char_len = read_value<uint16_t>(blob);
        if (blob.str(char_len) != kanji) {
          continue;
        }

        auto mode_len = read_value<uint8_t>(blob);
        if (blob.str(mode_len) != "freq") {
          continue;
        }

        auto freq_data_size = read_value<uint32_t>(blob);
        ParsedFrequency parsed;
        if (yomitan_parser::parse_frequency(blob.str(freq_data_size), parsed)) {
          frequencies.emplace_back(
              Frequency{.value = parsed.value, .display_value = std::string(parsed.display_value)});
        }
      }
      if (!frequencies.empty()) {
        result.frequencies.emplace_back(FrequencyEntry{.dict_name = name, .frequencies = std::move(frequencies)});
      }
    });
  });

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
    if (g.drop_form_of) {
      g.glossary = yomitan_parser::without_form_of(g.glossary);
    }
  }
}

void DictionaryQuery::read_form_of(const RawFormOfRow& row, BlobPins& pins, std::vector<FormOfReference>& out) {
  const uint8_t* compressed = row.blobs->range(row.compressed_offset, row.compressed_size, pins);
  yomitan_parser::read_form_of(decompress_glossary(compressed, row.compressed_size, row.zstd_dict), out);
}

std::vector<char> DictionaryQuery::get_media_file(const std::string& dict_name, const std::string& media_path) const {
  std::vector<uint8_t> bytes;
  read_media_file(dict_name, media_path, bytes);
  return {bytes.begin(), bytes.end()};
}

MediaFileView DictionaryQuery::get_media_file_view(const std::string& dict_name, const std::string& media_path) const {
  for (const auto& [path, name, styles, data] : term_dicts_) {
    if (name != dict_name) {
      continue;
    }
    if (!data->media) {
      return {};
    }
    const auto record = data->find_media(media_path);
    if (!record.found) {
      return {};
    }
    return {.data = reinterpret_cast<const char*>(data->media.data + record.offset), .size = record.size};
  }
  return {};
}

size_t DictionaryQuery::read_media_file(const std::string& dict_name, const std::string& media_path,
                                        std::vector<uint8_t>& out, size_t max_bytes) const {
  out.clear();
  for (const auto& [path, name, styles, data] : term_dicts_) {
    if (name != dict_name) {
      continue;
    }
    const auto record = data->find_media(media_path);
    if (!record.found || record.size > max_bytes) {
      return record.size;
    }
    out.resize(record.size);
    if (!data->read_media(out.data(), record.size, record.offset)) {
      out.clear();
      throw std::runtime_error("could not read media.bin");
    }
    return record.size;
  }
  return 0;
}

size_t DictionaryQuery::page_cache_bytes() const { return page_cache_ ? page_cache_->resident_bytes() : 0; }

std::vector<DictionaryStyle> DictionaryQuery::get_styles() const {
  return term_dicts_ | std::views::filter([](const auto& d) { return !d.styles.empty(); }) |
         std::views::transform([](const auto& d) { return DictionaryStyle{d.name, d.styles}; }) |
         std::ranges::to<std::vector>();
}

std::vector<DictionaryTags> DictionaryQuery::get_tags() const {
  return term_dicts_ | std::views::filter([](const auto& d) { return !d.data->tags.empty(); }) |
         std::views::transform([](const auto& d) { return DictionaryTags{d.name, d.data->tags}; }) |
         std::ranges::to<std::vector>();
}

std::vector<std::string> DictionaryQuery::get_freq_dict_order() const {
  return freq_dicts_ | std::views::transform([](const auto& d) { return d.name; }) | std::ranges::to<std::vector>();
}

PageCacheStatistics DictionaryQuery::page_cache_statistics() const {
  if (!page_cache_) return {};
  const auto entries = page_cache_->stats(memory::page_kind::entries);
  const auto indexes = page_cache_->stats(memory::page_kind::index);
  return {{entries.bytes, entries.hits, entries.reads, entries.read_bytes},
          {indexes.bytes, indexes.hits, indexes.reads, indexes.read_bytes}};
}

bool DictionaryQuery::hash_index_paged(const std::string& path) const {
  const auto* dict = find_loaded(path);
  return dict && dict->data->table.paged();
}

#ifdef HOSHIDICTS_YOMITAN
std::vector<DictionaryFiles> QueryAccess::dictionaries(const DictionaryQuery& query, DictionaryKind kind) {
  const std::vector<DictionaryQuery::Dictionary>* list = nullptr;
  switch (kind) {
    case DictionaryKind::Term:
      list = &query.term_dicts_;
      break;
    case DictionaryKind::Frequency:
      list = &query.freq_dicts_;
      break;
    case DictionaryKind::Pitch:
      list = &query.pitch_dicts_;
      break;
    case DictionaryKind::Kanji:
      list = &query.kanji_dicts_;
      break;
  }
  std::vector<DictionaryFiles> files;
  files.reserve(list->size());
  for (const auto& dict : *list) {
    const auto& data = *dict.data;
    files.push_back(DictionaryFiles{.name = &dict.name,
                                    .data = &data,
                                    .table = &data.table,
                                    .blobs = &data.blobs,
                                    .zstd_dict = data.zstd_dict,
                                    .yomitan_rows = data.yomitan_rows});
  }
  return files;
}

std::string QueryAccess::decompress_glossary(const DictionaryFiles& dict, uint64_t offset, uint32_t size,
                                             BlobPins& pins) {
  return DictionaryQuery::decompress_glossary(dict.blobs->range(offset, size, pins), size, dict.zstd_dict);
}
#endif
