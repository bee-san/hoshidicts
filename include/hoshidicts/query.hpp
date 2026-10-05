#pragma once

#include <cstdint>
#include <memory>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

#include "importer.hpp"

#if defined(__clang__) && defined(__APPLE__)
#define SWIFT_IMPORT_UNSAFE __attribute__((swift_attr("import_unsafe")))
#else
#define SWIFT_IMPORT_UNSAFE
#endif

struct Frequency {
  int value;
  std::string display_value;
};

struct DictionaryStyle {
  std::string dict_name;
  std::string styles;
};

struct DictionaryTags {
  std::string dict_name;
  std::vector<SummaryTag> tags;
};

struct MediaFileView {
  const char* data;
  size_t size;
};

struct ZSTD_DDict_s;

struct GlossaryEntry {
  std::string dict_name;
  std::string glossary;
  std::string definition_tags;
  std::string term_tags;
  const uint8_t* compressed_data = nullptr;
  uint32_t compressed_size = 0;
  const ZSTD_DDict_s* zstd_dict = nullptr;
  double score = 0;
};

struct FrequencyEntry {
  std::string dict_name;
  std::vector<Frequency> frequencies;
};

struct Pitch {
  int position = 0;
  std::string pattern;
  std::vector<int> nasal;
  std::vector<int> devoice;
};

struct PitchEntry {
  std::string dict_name;
  std::vector<Pitch> pitches;
  std::vector<std::string> transcriptions;
};

struct TermResult {
  std::string expression;
  std::string reading;
  std::string rules;
  double score = 0;
  std::vector<GlossaryEntry> glossaries;
  std::vector<FrequencyEntry> frequencies;
  std::vector<PitchEntry> pitches;
};

struct KanjiEntry {
  std::string dict_name;
  std::string onyomi;
  std::string kunyomi;
  std::string tags;
  std::vector<std::string> definitions;
  std::unordered_map<std::string, std::string> stats;
};

struct KanjiResult {
  std::string character;
  std::vector<KanjiEntry> entries;
};

struct RawTerm;
struct RawTerms;
struct BlobPins;

namespace memory {
class page_cache;
}

// Entry storage is independent of hash-index storage. Small Bloom filters,
// media/scan indexes and trained zstd data remain resident in either mode.
//  Mapped: blobs.bin, which holds the entries, is mapped too, and so is
//          media.bin except under Emscripten, whose mmap copies a whole file
//          into linear memory: there media is read from the file only when a
//          media file is asked for.
//  Paged:  blobs.bin is read on demand through a page cache the query's paged
//          dictionaries share, and media.bin is read on demand. Results are
//          the same; a lookup that reads pages the cache does not hold costs
//          a read per page.
enum class DictionaryStorage : uint8_t { Mapped, Paged };
enum class DictionaryIndexStorage : uint8_t { Mapped, Paged };

struct PageCacheActivity {
  size_t bytes = 0;
  uint64_t hits = 0;
  uint64_t reads = 0;
  uint64_t read_bytes = 0;
};
struct PageCacheStatistics {
  PageCacheActivity entries;
  PageCacheActivity indexes;
};

struct PageCacheOptions {
  // A dictionary's records are small and scattered (a key's entries sit in
  // different banks), so small pages waste the least of each read and keep the
  // most distinct records within the budget.
  size_t page_bytes = 4 * 1024;
  // Pages beyond this are dropped, least recently used first, once no query
  // holds them; a single query may hold more until it returns.
  size_t budget_bytes = 32 * 1024 * 1024;
};

class DictionaryQuery {
 public:
  DictionaryQuery();
  explicit DictionaryQuery(const PageCacheOptions& page_cache);
  ~DictionaryQuery();

  DictionaryQuery(const DictionaryQuery&) = delete;
  DictionaryQuery& operator=(const DictionaryQuery&) = delete;

  DictionaryQuery(DictionaryQuery&&) noexcept;
  DictionaryQuery& operator=(DictionaryQuery&&) noexcept;

  // A dictionary added as several kinds is loaded once: the later kinds share
  // the files the first one opened, whatever `storage` they ask for, so a
  // path's files must not change while any kind of it is loaded.
  bool add_term_dict(const std::string& path, DictionaryStorage storage = DictionaryStorage::Mapped,
                     DictionaryIndexStorage index_storage = DictionaryIndexStorage::Mapped);
  bool add_freq_dict(const std::string& path, DictionaryStorage storage = DictionaryStorage::Mapped,
                     DictionaryIndexStorage index_storage = DictionaryIndexStorage::Mapped);
  bool add_pitch_dict(const std::string& path, DictionaryStorage storage = DictionaryStorage::Mapped,
                     DictionaryIndexStorage index_storage = DictionaryIndexStorage::Mapped);
  bool add_kanji_dict(const std::string& path, DictionaryStorage storage = DictionaryStorage::Mapped,
                     DictionaryIndexStorage index_storage = DictionaryIndexStorage::Mapped);

  // Drops every loaded kind of the dictionary at `path` and returns how many
  // entries were removed (0 when the path is not loaded). The other
  // dictionaries keep their relative order, so a caller can reshape the loaded
  // set without rebuilding it.
  size_t remove_dict(const std::string& path);

  // Reorders every kind so the dictionaries appear in the order of `paths`.
  // Dictionaries not listed keep their relative order after the listed ones.
  // Returns false, changing nothing, when a listed path is not loaded.
  bool set_dict_order(const std::vector<std::string>& paths);

  // Long-key scan index (see src/scan_index.hpp). `long_key_length` returns
  // the longest term-dictionary key, in code points, that begins with the
  // first eight code points of `text` and is longer than 16, or 0 when there
  // is none or `text` is shorter than eight code points. `max_long_key_length`
  // is the longest such key any loaded term dictionary records, so a host can
  // size the text it hands to Lookup; 0 when no dictionary has an index.
  // Both accept a term dictionary path to consult that dictionary alone.
  size_t long_key_length(std::string_view text, const std::string* term_dictionary_path = nullptr) const;
  size_t max_long_key_length(const std::string* term_dictionary_path = nullptr) const;

  void query_freq(std::vector<TermResult>& terms) const;
  void query_pitch(std::vector<TermResult>& terms) const;
  KanjiResult query_kanji(const std::string& kanji) const;

  std::vector<TermResult> query(const std::string& expression) const;

  std::vector<char> get_media_file(const std::string& dict_name, const std::string& media_path) const;
  // A view into the mapped media.bin; empty when the file is missing and when
  // media is read on demand (see DictionaryStorage), where read_media_file
  // still finds it.
  SWIFT_IMPORT_UNSAFE
  MediaFileView get_media_file_view(const std::string& dict_name, const std::string& media_path) const;
  // Finds `media_path` in the term dictionary named `dict_name` and returns its
  // stored size, 0 when there is no such file. The bytes are copied into `out`
  // only when they are at most `max_bytes` long; otherwise `out` is left empty
  // and nothing more is read. Throws std::runtime_error when the file cannot
  // be read.
  size_t read_media_file(const std::string& dict_name, const std::string& media_path, std::vector<uint8_t>& out,
                         size_t max_bytes = SIZE_MAX) const;
  std::vector<DictionaryStyle> get_styles() const;
  // Each term dictionary's tag-bank rows, for those that have any.
  std::vector<DictionaryTags> get_tags() const;
  std::vector<std::string> get_freq_dict_order() const;

  // Combined payload of entry and hash-index pages in the shared cache.
  size_t page_cache_bytes() const;
  PageCacheStatistics page_cache_statistics() const;
  bool hash_index_paged(const std::string& path) const;
  const std::string& last_error() const { return last_error_; }

 private:
  friend class Lookup;
  std::string last_error_;
  // The raw terms, and the compressed glossaries build_term points its result
  // at, are views into the dictionaries' files: they stay valid while `pins`,
  // which holds what they read of paged files, lives.
  RawTerms query_raw(const std::string& expression, BlobPins& pins,
                     const std::string* term_dictionary_path = nullptr) const;
  TermResult build_term(const RawTerms& raw, RawTerm& term, BlobPins& pins) const;
  void collect_frequencies(std::string_view expression, std::string_view reading,
                           std::vector<FrequencyEntry>& out, BlobPins& pins) const;
  void collect_pitches(std::string_view expression, std::string_view reading, std::vector<PitchEntry>& out,
                       BlobPins& pins) const;
  void materialize(TermResult& term) const;

  struct DictionaryData;
  struct Dictionary {
    Dictionary();
    ~Dictionary();

    Dictionary(const Dictionary&) = delete;
    Dictionary& operator=(const Dictionary&) = delete;

    Dictionary(Dictionary&&) noexcept;
    Dictionary& operator=(Dictionary&&) noexcept;

    std::string path;
    std::string name;
    std::string styles;
    // Shared by every kind the path is loaded as.
    std::shared_ptr<DictionaryData> data;
  };
  enum DictionaryType : uint8_t { TERM, FREQ, PITCH, KANJI };

  bool add_dict(const std::string& path, DictionaryType, DictionaryStorage, DictionaryIndexStorage);
  bool add_dict_(const std::string& path, DictionaryType, DictionaryStorage, DictionaryIndexStorage);
  bool open_dict_(const std::string& path, Dictionary& dict, DictionaryStorage storage, DictionaryIndexStorage index_storage);
  const Dictionary* find_loaded(const std::string& path) const;

  static std::string decompress_glossary(const void* data, size_t size, const ZSTD_DDict_s* dict);
  PageCacheOptions page_cache_options_;
  // Created by the first paged add.
  std::shared_ptr<memory::page_cache> page_cache_;
  std::vector<Dictionary> term_dicts_;
  std::vector<Dictionary> freq_dicts_;
  std::vector<Dictionary> pitch_dicts_;
  std::vector<Dictionary> kanji_dicts_;
};
