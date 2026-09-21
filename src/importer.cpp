#include "hoshidicts/importer.hpp"

#include <ankerl/unordered_dense.h>
#include <xxh3.h>
#define ZDICT_STATIC_LINKING_ONLY
#include <zdict.h>
#include <zstd.h>

#include <algorithm>
#include <array>
#include <chrono>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <deque>
#include <filesystem>
#include <fstream>
#include <functional>
#include <future>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <string_view>
#include <thread>
#include <vector>

#include "hash/bloom.hpp"
#include "hash/hash.hpp"
#include "json/yomitan_parser.hpp"
#include "path_utils.hpp"
#include "scan_index.hpp"
#include "zip/zip.hpp"

namespace {
#if defined(__EMSCRIPTEN__) && !defined(__EMSCRIPTEN_PTHREADS__)
constexpr std::launch async_policy = std::launch::deferred;
#else
constexpr std::launch async_policy = std::launch::async;
#endif

// One group of threads serves the whole import: the term-bank workers first,
// then the meta and kanji banks, the offset sort, the hash table, the Bloom
// filter and the media. Spawning fresh threads for those later phases is not an
// option on Emscripten: a finished pthread returns its Web Worker to the pool
// asynchronously, so a burst of new threads right after the bank workers exit
// finds the (strictly sized) pool empty and fails. Without pthreads the pool
// has no threads and runs every task inline when it is submitted.
class WorkerPool {
 public:
  explicit WorkerPool(size_t threads) {
#if !defined(__EMSCRIPTEN__) || defined(__EMSCRIPTEN_PTHREADS__)
    threads_.reserve(threads);
    for (size_t i = 0; i < threads; ++i) {
      threads_.emplace_back([this]() { run(); });
    }
#else
    static_cast<void>(threads);
#endif
  }
  WorkerPool(const WorkerPool&) = delete;
  WorkerPool& operator=(const WorkerPool&) = delete;
  ~WorkerPool() {
    {
      std::lock_guard lock(mutex_);
      stop_ = true;
    }
    ready_.notify_all();
    for (auto& thread : threads_) {
      thread.join();
    }
  }

  size_t size() const { return threads_.size(); }

  template <class F>
  std::future<std::invoke_result_t<F&>> submit(F&& task) {
    using R = std::invoke_result_t<F&>;
    auto packaged = std::make_shared<std::packaged_task<R()>>(std::forward<F>(task));
    std::future<R> future = packaged->get_future();
    if (threads_.empty()) {
      (*packaged)();
      return future;
    }
    {
      std::lock_guard lock(mutex_);
      tasks_.emplace_back([packaged]() { (*packaged)(); });
    }
    ready_.notify_one();
    return future;
  }

 private:
  void run() {
    while (true) {
      std::function<void()> task;
      {
        std::unique_lock lock(mutex_);
        ready_.wait(lock, [&]() { return stop_ || !tasks_.empty(); });
        if (tasks_.empty()) {
          return;
        }
        task = std::move(tasks_.front());
        tasks_.pop_front();
      }
      task();
    }
  }

  std::vector<std::thread> threads_;
  std::deque<std::function<void()>> tasks_;
  std::mutex mutex_;
  std::condition_variable ready_;
  bool stop_ = false;
};

size_t max_import_threads(bool low_ram) {
#if defined(__EMSCRIPTEN__) && !defined(__EMSCRIPTEN_PTHREADS__)
  static_cast<void>(low_ram);
  return 1;
#else
  if (low_ram) {
    return 1;
  }
  const size_t detected = std::thread::hardware_concurrency();
  return std::max<size_t>(1, std::min<size_t>(detected == 0 ? 1 : detected, 8));
#endif
}

struct Files {
  std::vector<int> term_banks;
  std::vector<int> meta_banks;
  std::vector<int> kanji_banks;
  std::vector<int> kanji_meta_banks;
  std::vector<int> tag_banks;
  std::vector<int> media_files;
};

// A compressed glossary inside ProcessedFile::glossary_blob.
struct GlossarySpan {
  uint64_t offset = 0;
  uint32_t size = 0;
};

struct ProcessedFile {
  std::vector<char> data;
  std::vector<std::pair<uint64_t, uint64_t>> offsets;
  // Every distinct glossary of the bank, compressed back to back in first-use
  // order. One buffer instead of one heap vector per glossary keeps the
  // parse/compress workers out of the allocator and lets the writer emit the
  // whole blob with one write when the bank repeats nothing seen before.
  std::vector<char> glossary_blob;
  ankerl::unordered_dense::map<uint64_t, GlossarySpan> glossaries;
  std::vector<std::pair<uint64_t, uint64_t>> glossary_offsets;
  SummaryMetaCount meta_counts;
  size_t count = 0;
  // (prefix hash, code point length) of every expression or reading longer
  // than scan_index::long_key_min_codepoints; see scan_index.hpp.
  std::vector<std::pair<uint64_t, uint16_t>> long_keys;
};

void note_long_key(std::vector<std::pair<uint64_t, uint16_t>>& long_keys, std::string_view key) {
  // Keys are bounded by the uint16_t length prefix of the record, so the code
  // point count fits a uint16_t as well.
  const size_t length = scan_index::codepoint_length(key);
  if (length <= scan_index::long_key_min_codepoints) {
    return;
  }
  if (const auto hash = scan_index::prefix_hash(key)) {
    long_keys.emplace_back(*hash, static_cast<uint16_t>(length));
  }
}

void setup_stream_exceptions(std::ofstream& stream) { stream.exceptions(std::ios::failbit | std::ios::badbit); }

Files get_files(const Zip& zip) {
  Files files;
  for (int i = 0; i < static_cast<int>(zip.entries.size()); i++) {
    const auto& name = zip.entries[i].name;
    if (name.empty() || name.back() == '/') {
      continue;
    }

    if (name.starts_with("term_bank_")) {
      files.term_banks.push_back(i);
    } else if (name.starts_with("term_meta_bank_")) {
      files.meta_banks.push_back(i);
    } else if (name.starts_with("kanji_bank_")) {
      files.kanji_banks.push_back(i);
    } else if (name.starts_with("kanji_meta_bank_")) {
      files.kanji_meta_banks.push_back(i);
    } else if (name.starts_with("tag_bank_")) {
      files.tag_banks.push_back(i);
    } else if (!(name == "styles.css" || name == "index.json")) {
      files.media_files.push_back(i);
    }
  }
  return files;
}

template <typename T>
void write_val(std::vector<char>& out, T value) {
  const size_t old_size = out.size();
  out.resize(old_size + sizeof(T));
  std::memcpy(out.data() + old_size, &value, sizeof(T));
}

void write_str(std::vector<char>& out, std::string_view value) {
  if (value.empty()) {
    return;
  }
  const size_t old_size = out.size();
  out.resize(old_size + value.size());
  std::memcpy(out.data() + old_size, value.data(), value.size());
}

void write_bytes(std::vector<char>& out, const void* data, size_t n) {
  const size_t old_size = out.size();
  out.resize(old_size + n);
  std::memcpy(out.data() + old_size, data, n);
}

void radix_sort(std::vector<std::pair<uint64_t, uint64_t>>& offsets, WorkerPool& pool, size_t max_threads) {
  if (offsets.size() < 2) {
    return;
  }

  const size_t n = offsets.size();
  const size_t num_threads = std::max<size_t>(1, std::min({max_threads, offsets.size(), static_cast<size_t>(8)}));
  std::vector<std::pair<uint64_t, uint64_t>> temp(n);
  auto* src = &offsets;
  auto* dst = &temp;

  std::vector<std::array<size_t, 65536>> local_counts(num_threads);
  auto global_count = std::make_unique<std::array<size_t, 65536>>();
  auto global_pos = std::make_unique<std::array<size_t, 65536>>();

  for (uint32_t shift = 0; shift < 64; shift += 16) {
    const size_t chunk = (n + num_threads - 1) / num_threads;
    std::vector<std::future<void>> futures;
    for (size_t t = 0; t < num_threads; t++) {
      const size_t begin = t * chunk;
      const size_t end = std::min(begin + chunk, n);
      if (begin >= n) {
        break;
      }

      local_counts[t].fill(0);
      futures.push_back(pool.submit([src, shift, begin, end, &local_counts, t]() {
        for (size_t i = begin; i < end; i++) {
          local_counts[t][((*src)[i].first >> shift) & 0xffff]++;
        }
      }));
    }
    for (auto& future : futures) {
      future.get();
    }

    global_count->fill(0);
    for (size_t t = 0; t < futures.size(); t++) {
      for (size_t bucket = 0; bucket < 65536; bucket++) {
        (*global_count)[bucket] += local_counts[t][bucket];
      }
    }

    global_pos->fill(0);
    size_t total = 0;
    for (size_t bucket = 0; bucket < 65536; bucket++) {
      (*global_pos)[bucket] = total;
      total += (*global_count)[bucket];
    }

    std::vector<std::array<size_t, 65536>> thread_pos(futures.size());
    for (size_t bucket = 0; bucket < 65536; bucket++) {
      size_t pos = (*global_pos)[bucket];
      for (size_t t = 0; t < futures.size(); t++) {
        thread_pos[t][bucket] = pos;
        pos += local_counts[t][bucket];
      }
    }

    std::vector<std::future<void>> scatter_futures;
    for (size_t t = 0; t < futures.size(); t++) {
      const size_t begin = t * chunk;
      const size_t end = std::min(begin + chunk, n);
      scatter_futures.push_back(pool.submit([src, dst, shift, begin, end, &thread_pos, t]() {
        for (size_t i = begin; i < end; i++) {
          const size_t bucket = ((*src)[i].first >> shift) & 0xffff;
          (*dst)[thread_pos[t][bucket]++] = (*src)[i];
        }
      }));
    }
    for (auto& future : scatter_futures) {
      future.get();
    }

    std::swap(src, dst);
  }
}

std::vector<char> train_zstd_dict(const Zip& zip, const Files& files, bool low_ram) {
  if (files.term_banks.empty()) {
    return {};
  }

  const std::string content = zip.read(files.term_banks[0]);
  std::vector<Term> terms;
  if (!yomitan_parser::parse_term_bank(content, terms)) {
    return {};
  }

  size_t bank_bytes = 0;
  for (const auto& term : terms) {
    bank_bytes += term.glossary.str.size();
  }

  std::vector<char> samples;
  std::vector<size_t> sizes;
  constexpr size_t max_sample_bytes = 2L * 1024 * 1024;
  const size_t step = std::max<size_t>(1, bank_bytes / max_sample_bytes);
  for (size_t i = 0; i < terms.size() && samples.size() < max_sample_bytes; i += step) {
    write_str(samples, terms[i].glossary.str);
    sizes.push_back(terms[i].glossary.str.size());
  }

  if (sizes.size() < 8) {
    return {};
  }

  ZDICT_fastCover_params_t params = {};
  params.d = 8;
  params.steps = 4;
  params.splitPoint = 1.0;
  // steps=4 makes the optimiser try five values of k, each a trial that walks a
  // 2^f-entry frequency table (4 MiB at f=20) over the 2 MiB sample. The trials
  // are memory-bound: running five at once was slower than three in two rounds
  // (Jitendex, 16 cores: 8 threads 133 ms, 5 threads 133 ms, 3 threads 96 ms,
  // 2 threads 99 ms, 1 thread 210 ms), so cap the trainer at three threads. The
  // result does not depend on the thread count.
  // Five trials, so five threads finish in one round. That only pays when the
  // sample is small (short glossaries, e.g. a names dictionary): each trial then
  // spends its time on per-sample compressor setup, not on the frequency table,
  // and the three-thread cap above is about the latter.
  const size_t trial_threads = samples.size() < 512 * 1024 ? 5 : 3;
  params.nbThreads = static_cast<unsigned>(std::min<size_t>(trial_threads, max_import_threads(low_ram)));

  std::vector<char> dict(static_cast<size_t>(110 * 1024));
  const size_t dict_size = ZDICT_optimizeTrainFromBuffer_fastCover(
      dict.data(), dict.size(), samples.data(), sizes.data(), static_cast<unsigned>(sizes.size()), &params);
  if (ZDICT_isError(dict_size)) {
    return {};
  }

  dict.resize(dict_size);
  return dict;
}

ProcessedFile process_term_bank(const std::string& content, const ZSTD_CDict* cdict) {
  ProcessedFile processed;
  if (content.empty()) {
    return processed;
  }

  std::vector<Term> out;
  if (!yomitan_parser::parse_term_bank(content, out)) {
    return processed;
  }

  ZSTD_CCtx* cctx = ZSTD_createCCtx();
  if (!cctx) {
    return processed;
  }
  ZSTD_CCtx_refCDict(cctx, cdict);

  processed.glossaries.reserve(out.size());
  processed.glossary_offsets.reserve(out.size());
  processed.glossary_blob.reserve(content.size() / 4);
  // Records hold the bank's non-glossary strings plus fixed headers.
  processed.data.reserve(content.size() / 4);
  processed.offsets.reserve(out.size() * 2);
  for (auto& term : out) {
    const std::string_view glossary = term.glossary.str;
    uint64_t glossary_hash = XXH3_64bits(glossary.data(), glossary.size());
    auto [it, inserted] = processed.glossaries.try_emplace(glossary_hash);
    if (inserted) {
      const size_t start = processed.glossary_blob.size();
      const size_t bound = ZSTD_compressBound(glossary.size());
      processed.glossary_blob.resize(start + bound);
      const size_t compressed_size =
          ZSTD_compress2(cctx, processed.glossary_blob.data() + start, bound, glossary.data(), glossary.size());
      if (ZSTD_isError(compressed_size)) {
        ZSTD_freeCCtx(cctx);
        throw std::runtime_error("failed to compress glossary");
      }
      processed.glossary_blob.resize(start + compressed_size);
      it->second = GlossarySpan{start, static_cast<uint32_t>(compressed_size)};
    }

    uint64_t offset = processed.data.size();
    uint32_t blob_size = it->second.size;
    std::string_view expr = term.expression;
    std::string_view reading = term.reading.empty() ? expr : term.reading;
    std::string_view definition_tags = term.definition_tags.value_or("");

    write_val<uint8_t>(processed.data, 0);
    write_val<uint16_t>(processed.data, expr.size());
    write_str(processed.data, expr);
    write_val<uint16_t>(processed.data, reading.size());
    write_str(processed.data, reading);
    note_long_key(processed.long_keys, expr);
    if (reading != expr) {
      note_long_key(processed.long_keys, reading);
    }

    uint64_t glossary_offset = processed.data.size();
    write_val<uint64_t>(processed.data, 0);
    write_val<uint32_t>(processed.data, blob_size);
    processed.glossary_offsets.emplace_back(glossary_hash, glossary_offset);

    write_val<uint8_t>(processed.data, definition_tags.size());
    write_str(processed.data, definition_tags);
    write_val<uint8_t>(processed.data, term.rules.size());
    write_str(processed.data, term.rules);
    write_val<uint8_t>(processed.data, term.term_tags.size());
    write_str(processed.data, term.term_tags);
    write_val<uint32_t>(processed.data, 0);
    // The Yomitan schema types score as a JSON number; keep the parsed double
    // rather than truncating to int32 (fractions were collapsing, and magnitudes
    // beyond int32 were undefined behaviour in the cast). Readers select on the
    // .hoshidicts_5/_6 marker.
    write_val<double>(processed.data, term.score);

    processed.offsets.emplace_back(XXH3_64bits(expr.data(), expr.size()), offset);
    if (reading != expr) {
      processed.offsets.emplace_back(XXH3_64bits(reading.data(), reading.size()), offset);
    }
    processed.count++;
  }
  ZSTD_freeCCtx(cctx);

  return processed;
}

ProcessedFile process_meta_bank(const std::string& content) {
  ProcessedFile processed;
  if (content.empty()) {
    return processed;
  }

  std::vector<Meta> out;
  if (!yomitan_parser::parse_meta_bank(content, out)) {
    return processed;
  }

  // The records repeat the bank's strings with fixed headers, so the bank's
  // size bounds them; growing by a few bytes per field reallocated repeatedly.
  processed.data.reserve(content.size());
  processed.offsets.reserve(out.size());
  for (auto& meta : out) {
    uint64_t offset = processed.data.size();
    std::string_view expr = meta.expression;
    std::string_view mode = meta.mode;
    std::string_view data = meta.data.str;

    write_val<uint8_t>(processed.data, 1);
    write_val<uint16_t>(processed.data, expr.size());
    write_str(processed.data, expr);
    write_val<uint8_t>(processed.data, mode.size());
    write_str(processed.data, mode);
    write_val<uint32_t>(processed.data, data.size());
    write_str(processed.data, data);

    processed.offsets.emplace_back(XXH3_64bits(expr.data(), expr.size()), offset);
    processed.count++;
    processed.meta_counts[std::string(mode)]++;
  }

  processed.meta_counts["total"] = processed.count;
  return processed;
}

ProcessedFile process_kanji_bank(const std::string& content) {
  ProcessedFile processed;
  if (content.empty()) {
    return processed;
  }

  std::vector<Kanji> out;
  if (!yomitan_parser::parse_kanji_bank(content, out)) {
    return processed;
  }

  processed.data.reserve(content.size());
  processed.offsets.reserve(out.size());
  for (auto& kanji : out) {
    uint64_t offset = processed.data.size();
    std::string_view character = kanji.character;
    std::string_view onyomi = kanji.onyomi;
    std::string_view kunyomi = kanji.kunyomi;
    std::string_view tags = kanji.tags;

    write_val<uint8_t>(processed.data, 2);
    write_val<uint8_t>(processed.data, character.size());
    write_str(processed.data, character);
    write_val<uint16_t>(processed.data, onyomi.size());
    write_str(processed.data, onyomi);
    write_val<uint16_t>(processed.data, kunyomi.size());
    write_str(processed.data, kunyomi);
    write_val<uint16_t>(processed.data, tags.size());
    write_str(processed.data, tags);

    write_val<uint16_t>(processed.data, kanji.definitions.size());
    for (auto& def : kanji.definitions) {
      write_val<uint16_t>(processed.data, def.size());
      write_str(processed.data, def);
    }

    write_val<uint16_t>(processed.data, kanji.stats.size());
    for (auto& [k, v] : kanji.stats) {
      write_val<uint16_t>(processed.data, k.size());
      write_str(processed.data, k);
      write_val<uint16_t>(processed.data, v.size());
      write_str(processed.data, v);
    }

    processed.offsets.emplace_back(XXH3_64bits(character.data(), character.size()), offset);
    processed.count++;
  }

  return processed;
}

size_t count_json_array(const std::string& content) {
  if (content.empty()) {
    return 0;
  }

  std::vector<glz::raw_json> entries;
  if (glz::read<glz::opts{.error_on_unknown_keys = false, .error_on_missing_keys = false}>(entries, content)) {
    return 0;
  }
  return entries.size();
}

SummaryMetaCount count_meta_modes(const std::string& content) {
  SummaryMetaCount counts{{"total", 0}};
  if (content.empty()) {
    return counts;
  }

  std::vector<Meta> entries;
  if (!yomitan_parser::parse_meta_bank(content, entries)) {
    return counts;
  }

  for (const auto& entry : entries) {
    counts[std::string(entry.mode)]++;
    counts["total"]++;
  }
  return counts;
}

void count_unprocessed_banks(const Zip& zip, const Files& files, ImportResult& result) {
  for (int file_index : files.kanji_meta_banks) {
    SummaryMetaCount modes = count_meta_modes(zip.read(file_index));
    for (const auto& [name, count] : modes) {
      result.summary.counts.kanjiMeta[name] += count;
    }
  }

  for (int file_index : files.tag_banks) {
    result.summary.counts.tagMeta.total += count_json_array(zip.read(file_index));
  }
}

template <typename T>
std::optional<std::string> copy_optional_string(T value) {
  if (!value.has_value()) {
    return std::nullopt;
  }
  return std::string(*value);
}

bool usable_dictionary_title(std::string_view title) {
  return !title.empty() && title != "." && title != ".." && title.find('/') == std::string_view::npos &&
         title.find('\\') == std::string_view::npos && title.find('\0') == std::string_view::npos;
}

uint64_t unix_time_ms() {
  const auto now = std::chrono::system_clock::now().time_since_epoch();
  return std::chrono::duration_cast<std::chrono::milliseconds>(now).count();
}

Summary create_summary(const Index& index, std::string styles) {
  Summary summary;
  summary.title = std::string(index.title);
  summary.revision = std::string(index.revision);
  summary.sequenced = index.sequenced;
  summary.minimumYomitanVersion = copy_optional_string(index.minimumYomitanVersion);
  summary.version = index.version.value_or(index.format.value_or(3));
  summary.importDate = unix_time_ms();
  summary.prefixWildcardsSupported = false;
  summary.styles = std::move(styles);
  summary.isUpdatable = index.isUpdatable;
  summary.indexUrl = copy_optional_string(index.indexUrl);
  summary.downloadUrl = copy_optional_string(index.downloadUrl);
  summary.author = copy_optional_string(index.author);
  summary.url = copy_optional_string(index.url);
  summary.description = copy_optional_string(index.description);
  summary.attribution = copy_optional_string(index.attribution);
  summary.sourceLanguage = copy_optional_string(index.sourceLanguage);
  summary.targetLanguage = copy_optional_string(index.targetLanguage);
  summary.frequencyMode = copy_optional_string(index.frequencyMode);
  summary.importSuccess = true;
  summary.counts.termMeta["total"] = 0;
  summary.counts.kanjiMeta["total"] = 0;
  return summary;
}

using LongKeyIndex = ankerl::unordered_dense::map<uint64_t, uint16_t>;

void write_terms(std::ofstream& file, std::vector<std::pair<uint64_t, uint64_t>>& offsets, const Zip& zip,
                 const std::vector<int>& files, uint64_t& write_offset, ImportResult& result, bool low_ram,
                 const ZSTD_CDict* cdict, WorkerPool& pool, LongKeyIndex& long_keys) {
  if (files.empty()) {
    return;
  }

  const size_t max_threads = max_import_threads(low_ram);
  std::deque<std::future<ProcessedFile>> threads;

  ankerl::unordered_dense::map<uint64_t, uint64_t> glossaries;
  auto write_processed = [&](ProcessedFile&& processed) {
    if (processed.data.empty()) {
      return;
    }

    // The blob is written in place, skipping only glossaries an earlier bank
    // already wrote (the map iterates in insertion, hence blob, order).
    const char* blob = processed.glossary_blob.data();
    size_t run_start = 0;
    uint64_t skipped = 0;
    for (auto& [hash, span] : processed.glossaries) {
      auto [it, inserted] = glossaries.try_emplace(hash, write_offset + span.offset - skipped);
      if (inserted) {
        continue;
      }
      if (span.offset > run_start) {
        file.write(blob + run_start, static_cast<std::streamsize>(span.offset - run_start));
      }
      run_start = span.offset + span.size;
      skipped += span.size;
    }
    if (processed.glossary_blob.size() > run_start) {
      file.write(blob + run_start, static_cast<std::streamsize>(processed.glossary_blob.size() - run_start));
    }
    write_offset += processed.glossary_blob.size() - skipped;

    for (auto& [hash, pos] : processed.glossary_offsets) {
      uint64_t glossary_offset = glossaries[hash];
      std::memcpy(processed.data.data() + pos, &glossary_offset, sizeof(uint64_t));
    }

    file.write(processed.data.data(), static_cast<std::streamsize>(processed.data.size()));

    for (auto& [hash, offset] : processed.offsets) {
      offsets.emplace_back(hash, offset + write_offset);
    }

    write_offset += processed.data.size();
    result.summary.counts.terms.total += processed.count;
    for (const auto& [hash, length] : processed.long_keys) {
      auto [it, inserted] = long_keys.try_emplace(hash, length);
      if (!inserted && it->second < length) {
        it->second = length;
      }
    }
  };

#ifdef __EMSCRIPTEN_PTHREADS__
  const size_t worker_count = std::min(max_threads, files.size());
  const size_t max_tasks_ahead = low_ram ? worker_count : std::min(files.size(), worker_count * 2);
  const size_t max_bytes_ahead = (low_ram ? 64ULL : 256ULL) * 1024 * 1024;
  std::vector<size_t> task_bytes;
  task_bytes.reserve(files.size());
  for (int file : files) {
    task_bytes.push_back(zip.entries[static_cast<size_t>(file)].uncompressed_size);
  }
  std::vector<std::optional<ProcessedFile>> processed(files.size());
  size_t next_task = 0;
  size_t next_to_write = 0;
  size_t bytes_ahead = 0;
  bool failed = false;
  std::mutex mutex;
  std::condition_variable ready;
  std::exception_ptr worker_error;
  auto can_claim_task = [&]() {
    if (next_task >= files.size() || next_task >= next_to_write + max_tasks_ahead) {
      return false;
    }
    const size_t bytes = task_bytes[next_task];
    return bytes_ahead == 0 || bytes <= max_bytes_ahead - std::min(bytes_ahead, max_bytes_ahead);
  };
  auto worker = [&]() {
    while (true) {
      size_t index = 0;
      {
        std::unique_lock lock(mutex);
        ready.wait(lock, [&]() { return failed || next_task >= files.size() || can_claim_task(); });
        if (failed || next_task >= files.size()) {
          return;
        }
        index = next_task++;
        bytes_ahead += task_bytes[index];
      }
      try {
        auto value = process_term_bank(zip.read(files[index]), cdict);
        {
          std::lock_guard lock(mutex);
          processed[index].emplace(std::move(value));
        }
        ready.notify_all();
      } catch (...) {
        {
          std::lock_guard lock(mutex);
          if (!worker_error) {
            worker_error = std::current_exception();
          }
          failed = true;
        }
        ready.notify_all();
        return;
      }
    }
  };
  std::vector<std::future<void>> workers;
  workers.reserve(worker_count);
  try {
    for (size_t index = 0; index < worker_count; ++index) {
      workers.push_back(pool.submit(worker));
    }
  } catch (...) {
    {
      std::lock_guard lock(mutex);
      failed = true;
    }
    ready.notify_all();
    for (auto& future : workers) {
      try {
        future.get();
      } catch (...) {
      }
    }
    throw;
  }
  try {
    for (size_t index = 0; index < files.size(); ++index) {
      std::unique_lock lock(mutex);
      ready.wait(lock, [&]() { return processed[index].has_value() || worker_error; });
      if (worker_error) {
        auto error = worker_error;
        lock.unlock();
        std::rethrow_exception(error);
      }
      auto value = std::move(*processed[index]);
      processed[index].reset();
      lock.unlock();
      write_processed(std::move(value));
      {
        std::lock_guard progress_lock(mutex);
        next_to_write = index + 1;
        bytes_ahead -= task_bytes[index];
      }
      ready.notify_all();
    }
  } catch (...) {
    {
      std::lock_guard lock(mutex);
      failed = true;
    }
    ready.notify_all();
    for (auto& future : workers) {
      try {
        future.get();
      } catch (...) {
      }
    }
    throw;
  }
  for (auto& future : workers) {
    future.get();
  }
#else
  for (int file_index : files) {
    threads.push_back(std::async(
        async_policy, [&zip, file_index, cdict]() { return process_term_bank(zip.read(file_index), cdict); }));

    if (threads.size() == max_threads) {
      write_processed(threads.front().get());
      threads.pop_front();
    }
  }

  while (!threads.empty()) {
    write_processed(threads.front().get());
    threads.pop_front();
  }
#endif
}

// Sorted so the query can binary-search the mapping without loading it.
void write_scan_index(const std::filesystem::path& dict_path, const LongKeyIndex& long_keys) {
  if (long_keys.empty()) {
    return;
  }
  std::vector<std::pair<uint64_t, uint16_t>> entries(long_keys.begin(), long_keys.end());
  std::ranges::sort(entries);
  uint16_t max_length = 0;
  for (const auto& [hash, length] : entries) {
    max_length = std::max(max_length, length);
  }

  std::vector<char> out;
  out.reserve(scan_index::header_bytes + entries.size() * (sizeof(uint64_t) + sizeof(uint16_t)));
  write_val<uint32_t>(out, scan_index::magic);
  write_val<uint32_t>(out, scan_index::version);
  write_val<uint32_t>(out, static_cast<uint32_t>(entries.size()));
  write_val<uint16_t>(out, max_length);
  write_val<uint16_t>(out, 0);
  for (const auto& [hash, length] : entries) {
    write_val<uint64_t>(out, hash);
  }
  for (const auto& [hash, length] : entries) {
    write_val<uint16_t>(out, length);
  }

  std::ofstream file(dict_path / scan_index::file_name, std::ios::binary);
  setup_stream_exceptions(file);
  file.write(out.data(), static_cast<std::streamsize>(out.size()));
}

void write_meta(std::ofstream& file, std::vector<std::pair<uint64_t, uint64_t>>& offsets, const Zip& zip,
                const std::vector<int>& files, uint64_t& write_offset, ImportResult& result, bool low_ram,
                WorkerPool& pool) {
  if (files.empty()) {
    return;
  }

  const size_t max_threads = max_import_threads(low_ram);
  std::deque<std::future<ProcessedFile>> threads;
  auto write_processed = [&](ProcessedFile&& processed) {
    if (processed.data.empty()) {
      return;
    }
    file.write(processed.data.data(), static_cast<std::streamsize>(processed.data.size()));

    for (auto& [hash, offset] : processed.offsets) {
      offsets.emplace_back(hash, offset + write_offset);
    }

    write_offset += processed.data.size();
    for (const auto& [mode, count] : processed.meta_counts) {
      result.summary.counts.termMeta[mode] += count;
    }
  };

  for (int file_index : files) {
    threads.push_back(
        pool.submit([&zip, file_index]() { return process_meta_bank(zip.read(file_index)); }));

    if (threads.size() == max_threads) {
      write_processed(threads.front().get());
      threads.pop_front();
    }
  }

  while (!threads.empty()) {
    write_processed(threads.front().get());
    threads.pop_front();
  }
}

void write_kanji(std::ofstream& file, std::vector<std::pair<uint64_t, uint64_t>>& offsets, const Zip& zip,
                 const std::vector<int>& files, uint64_t& write_offset, ImportResult& result, bool low_ram,
                 WorkerPool& pool) {
  if (files.empty()) {
    return;
  }

  const size_t max_threads = max_import_threads(low_ram);
  std::deque<std::future<ProcessedFile>> threads;
  auto write_processed = [&](ProcessedFile&& processed) {
    if (processed.data.empty()) {
      return;
    }
    file.write(processed.data.data(), static_cast<std::streamsize>(processed.data.size()));

    for (auto& [hash, offset] : processed.offsets) {
      offsets.emplace_back(hash, offset + write_offset);
    }

    write_offset += processed.data.size();
    result.summary.counts.kanji.total += processed.count;
  };

  for (int file_index : files) {
    threads.push_back(
        pool.submit([&zip, file_index]() { return process_kanji_bank(zip.read(file_index)); }));

    if (threads.size() == max_threads) {
      write_processed(threads.front().get());
      threads.pop_front();
    }
  }

  while (!threads.empty()) {
    write_processed(threads.front().get());
    threads.pop_front();
  }
}

std::vector<char> build_offset_index(std::vector<std::pair<uint64_t, uint64_t>>& offsets, uint64_t& write_offset,
                                     std::vector<std::pair<uint64_t, uint64_t>>& hash_entries, bool low_ram,
                                     WorkerPool& pool, size_t sort_threads) {
  std::vector<char> offset_buf;
  if (low_ram) {
    std::ranges::sort(offsets);
  } else {
    radix_sort(offsets, pool, sort_threads);
  }
  // Every entry contributes its offset and at most one group header, so the
  // buffer is sized once and filled through a raw cursor instead of growing
  // (and zero-filling) a few bytes at a time, 6.6M times for VNDB.
  offset_buf.resize(offsets.size() * (sizeof(uint32_t) + sizeof(uint64_t)));
  char* cursor = offset_buf.data();
  const auto put = [&cursor](auto value) {
    std::memcpy(cursor, &value, sizeof(value));
    cursor += sizeof(value);
  };
  for (size_t i = 0; i < offsets.size();) {
    size_t j = i + 1;
    while (j < offsets.size() && offsets[j].first == offsets[i].first) {
      j++;
    }

    hash_entries.emplace_back(offsets[i].first, write_offset);

    auto count = static_cast<uint32_t>(j - i);
    put(count);
    for (size_t k = i; k < j; ++k) {
      put(offsets[k].second);
    }

    write_offset += sizeof(uint32_t) + count * sizeof(uint64_t);
    i = j;
  }
  offset_buf.resize(static_cast<size_t>(cursor - offset_buf.data()));
  return offset_buf;
}

size_t write_media(const std::filesystem::path& path, const Zip& zip, const std::vector<int>& files) {
  if (files.empty()) {
    return 0;
  }

  std::ofstream media(path / "media.bin", std::ios::binary);
  std::ofstream media_idx(path / "media.idx", std::ios::binary);
  setup_stream_exceptions(media);
  setup_stream_exceptions(media_idx);

  size_t media_count = 0;
  uint32_t write_pos = 0;
  std::vector<char> buf;
  std::vector<std::pair<std::string, uint32_t>> index_entries;
  for (int file_index : files) {
    auto media_file = zip.read_media(file_index);
    if (!media_file.has_value()) {
      continue;
    }

    uint32_t record_start = write_pos;
    buf.clear();
    write_val<uint16_t>(buf, media_file->path.size());
    write_str(buf, media_file->path);
    write_val<uint32_t>(buf, media_file->blob.size());
    write_bytes(buf, media_file->blob.data(), media_file->blob.size());
    media.write(buf.data(), static_cast<std::streamsize>(buf.size()));
    write_pos += buf.size();

    index_entries.emplace_back(std::move(media_file->path), record_start);
    media_count++;
  }

  std::ranges::sort(index_entries);
  std::vector<char> index_buf;
  write_val<uint32_t>(index_buf, index_entries.size());
  for (const auto& [name, offset] : index_entries) {
    write_val<uint64_t>(index_buf, offset);
  }

  media_idx.write(index_buf.data(), static_cast<std::streamsize>(index_buf.size()));
  return media_count;
}
}

ImportResult dictionary_importer::import(const std::string& zip_path, const std::string& output_dir, bool low_ram) {
  ImportResult result;
  std::filesystem::path dict_path;
  try {
    const std::filesystem::path native_zip_path = path_utils::from_utf8(zip_path);
    const std::filesystem::path native_output_dir = path_utils::from_utf8(output_dir);
    Zip zip;
    if (!zip.open(native_zip_path)) {
      throw std::runtime_error(zip.error.empty() ? "failed to open zip" : zip.error);
    }

    int index_idx = zip.find("index.json");
    if (index_idx < 0) {
      throw std::runtime_error("could not find index.json");
    }
    std::string index_content = zip.read(index_idx);
    if (index_content.empty()) {
      throw std::runtime_error("could not read index.json");
    }

    Index index;
    if (!yomitan_parser::parse_index(index_content, index)) {
      throw std::runtime_error("failed to parse index.json");
    }

    result.title = index.title;

    const std::filesystem::path native_title = path_utils::from_utf8(result.title);
    if (!usable_dictionary_title(result.title) || native_title.has_root_path() || !native_title.parent_path().empty() ||
        native_title != native_title.filename()) {
      throw std::runtime_error("dictionary title cannot be used as an output directory");
    }
    dict_path = native_output_dir / native_title;
    std::filesystem::create_directories(dict_path);

    std::string styles;
    int styles_idx = zip.find("styles.css");
    if (styles_idx >= 0) {
      styles = zip.read(styles_idx);
    }

    result.summary = create_summary(index, styles);
    const Files files = get_files(zip);

    const std::vector<char> zstd_dict = train_zstd_dict(zip, files, low_ram);
    std::unique_ptr<ZSTD_CDict, decltype(&ZSTD_freeCDict)> cdict(nullptr, ZSTD_freeCDict);
    if (!zstd_dict.empty()) {
      cdict.reset(ZSTD_createCDict(zstd_dict.data(), zstd_dict.size(), 0));

      std::ofstream dict_file(dict_path / "dict.zstd", std::ios::binary);
      setup_stream_exceptions(dict_file);
      dict_file.write(zstd_dict.data(), static_cast<std::streamsize>(zstd_dict.size()));
    }

    // The trainer has joined its own threads by now, so the pool plus this
    // thread is the whole budget.
    const size_t pool_threads = max_import_threads(low_ram);
    WorkerPool pool(pool_threads);

    std::ofstream blobs(dict_path / "blobs.bin", std::ios::binary);
    setup_stream_exceptions(blobs);
    std::vector<std::pair<uint64_t, uint64_t>> offsets;
    uint64_t write_offset = 0;
    LongKeyIndex long_keys;
    write_terms(blobs, offsets, zip, files.term_banks, write_offset, result, low_ram, cdict.get(), pool, long_keys);
    write_scan_index(dict_path, long_keys);
    write_meta(blobs, offsets, zip, files.meta_banks, write_offset, result, low_ram, pool);
    write_kanji(blobs, offsets, zip, files.kanji_banks, write_offset, result, low_ram, pool);
    count_unprocessed_banks(zip, files, result);
    if (offsets.empty()) {
      throw std::runtime_error("empty dictionary");
    }

    // Media extraction runs beside the sort; the sort keeps one thread short
    // of the pool so that it never waits behind it.
    const bool media_on_pool = pool.size() > 1 && !files.media_files.empty();
    std::future<size_t> media_thread = pool.submit(
        [&dict_path, &zip, &files]() { return write_media(dict_path, zip, files.media_files); });

    std::vector<std::pair<uint64_t, uint64_t>> hash_entries;
    auto offset_buf = build_offset_index(offsets, write_offset, hash_entries, low_ram, pool,
                                         media_on_pool ? pool.size() - 1 : std::max<size_t>(1, pool.size()));
    std::vector<std::pair<uint64_t, uint64_t>>().swap(offsets);

    // The hash table and the Bloom filter only read hash_entries. The table
    // builds on a pool thread; the filter builds here and on the remaining
    // pool threads while this thread would otherwise only wait.
    auto hash_thread = pool.submit([&hash_entries, &dict_path]() {
      hash::linear table;
      table.build_to_file(hash_entries, dict_path / "hash.table");
    });

    blobs.write(offset_buf.data(), static_cast<std::streamsize>(offset_buf.size()));
    {
      auto hashes = hash_entries | std::views::keys | std::ranges::to<std::vector>();
      hash::bloom::build_to_file(hashes, dict_path / "bloom.filter", pool.size(),
                                 [&pool](std::function<void()> task) { return pool.submit(std::move(task)); });
    }
    hash_thread.get();

    result.summary.counts.media.total = media_thread.get();

    std::string summary_json;
    if (glz::write_json(result.summary, summary_json)) {
      throw std::runtime_error("failed to write index.json");
    }
    std::ofstream index_file(dict_path / "index.json", std::ios::binary);
    setup_stream_exceptions(index_file);
    index_file.write(summary_json.data(), static_cast<std::streamsize>(summary_json.size()));

    std::ofstream sui(dict_path / (zstd_dict.empty() ? ".hoshidicts_5" : ".hoshidicts_6"), std::ios::binary);
    result.success = true;
  } catch (const std::exception& e) {
    result.success = false;
    if (!result.summary.title.empty()) {
      result.summary.importSuccess = false;
    }
    result.error = e.what();
  }

  if (!result.success && !dict_path.empty()) {
    std::error_code error;
    std::filesystem::remove_all(dict_path, error);
  }

  return result;
}
