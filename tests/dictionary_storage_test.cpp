// Dictionary storage (DictionaryStorage in query.hpp): a dictionary added as
// several kinds shares one copy of its files and one set of descriptors, and
// removing it releases them; media read on demand returns the stored bytes;
// and a paged dictionary, including one read through pages so small that most
// records cross a page boundary, answers every lookup, query and kanji lookup
// exactly as the mapped one does, with its cache back within budget once each
// call returns.
#include "hoshidicts/deinflector.hpp"
#include "hoshidicts/importer.hpp"
#include "hoshidicts/lookup.hpp"
#include "hoshidicts/query.hpp"

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

namespace {

uint32_t crc32(const std::string& data) {
  uint32_t crc = 0xFFFFFFFFu;
  for (unsigned char c : data) {
    crc ^= c;
    for (int i = 0; i < 8; ++i) {
      crc = (crc >> 1) ^ (0xEDB88320u & (0u - (crc & 1u)));
    }
  }
  return ~crc;
}

template <typename T>
void put(std::string& out, T value) {
  char buf[sizeof(T)];
  std::memcpy(buf, &value, sizeof(T));
  out.append(buf, sizeof(T));
}

// A stored (method 0) ZIP: local headers, then the central directory, then EOCD.
std::string build_zip(const std::vector<std::pair<std::string, std::string>>& files) {
  std::string out;
  std::string central;
  for (const auto& [name, data] : files) {
    const uint32_t offset = static_cast<uint32_t>(out.size());
    const uint32_t crc = crc32(data);
    const uint32_t size = static_cast<uint32_t>(data.size());
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
  const uint32_t central_offset = static_cast<uint32_t>(out.size());
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

int failures = 0;

void check(bool ok, const std::string& what) {
  if (!ok) {
    ++failures;
    std::fprintf(stderr, "FAIL: %s\n", what.c_str());
  }
}

std::string term(std::string_view expression, std::string_view reading, std::string_view rules, int score,
                 std::string_view glossary) {
  std::string t = "[\"";
  t += expression;
  t += "\",\"";
  t += reading;
  t += "\",\"n\",\"";
  t += rules;
  t += "\",";
  t += std::to_string(score);
  t += ",[\"";
  t += glossary;
  t += "\"],0,\"common\"]";
  return t;
}

std::string random_bytes(size_t size, uint32_t seed) {
  std::mt19937 engine(seed);
  std::string out(size, '\0');
  for (auto& c : out) {
    c = static_cast<char>(engine() & 0xFF);
  }
  return out;
}

void describe_term(const TermResult& t, std::string& out) {
  out += t.expression + "|" + t.reading + "|" + t.rules + "|" + std::to_string(t.score) + "|";
  for (const auto& g : t.glossaries) {
    out += g.dict_name + "#" + g.glossary + "#" + g.definition_tags + "#" + g.term_tags + ";";
  }
  for (const auto& f : t.frequencies) {
    out += "F" + f.dict_name + ":";
    for (const auto& v : f.frequencies) {
      out += std::to_string(v.value) + "=" + v.display_value + ",";
    }
  }
  for (const auto& p : t.pitches) {
    out += "P" + p.dict_name + ":";
    for (const auto& a : p.pitches) {
      out += std::to_string(a.position) + "/" + a.pattern + "/";
      for (int n : a.nasal) out += std::to_string(n) + ".";
      out += "/";
      for (int d : a.devoice) out += std::to_string(d) + ".";
      out += ",";
    }
    for (const auto& transcription : p.transcriptions) {
      out += transcription + ",";
    }
  }
}

std::string describe(const std::vector<LookupResult>& results) {
  std::string out;
  for (const auto& r : results) {
    out += r.matched + "|" + r.deinflected + "|" + std::to_string(r.preprocessor_steps) + "|";
    for (const auto& t : r.trace) {
      out += t.name + "," + t.description + ";";
    }
    describe_term(r.term, out);
    out += "\n";
  }
  return out;
}

std::string describe(const std::vector<TermResult>& results) {
  std::string out;
  for (const auto& t : results) {
    describe_term(t, out);
    out += "\n";
  }
  return out;
}

std::string describe(const KanjiResult& result) {
  std::string out = result.character + "\n";
  for (const auto& e : result.entries) {
    out += e.dict_name + "|" + e.onyomi + "|" + e.kunyomi + "|" + e.tags + "|";
    for (const auto& d : e.definitions) out += d + ";";
    std::vector<std::pair<std::string, std::string>> stats(e.stats.begin(), e.stats.end());
    std::ranges::sort(stats);
    for (const auto& [k, v] : stats) out += k + "=" + v + ";";
    out += "\n";
  }
  return out;
}

// Open descriptors of this process, or -1 where they cannot be listed.
long open_descriptors() {
  for (const char* dir : {"/proc/self/fd", "/dev/fd"}) {
    std::error_code error;
    std::filesystem::directory_iterator it(dir, error);
    if (error) {
      continue;
    }
    long count = 0;
    for (; it != std::filesystem::directory_iterator(); it.increment(error)) {
      if (error) {
        return -1;
      }
      ++count;
    }
    return count;
  }
  return -1;
}

bool add_all(DictionaryQuery& query, const std::string& path, DictionaryStorage storage,
             DictionaryIndexStorage index_storage = DictionaryIndexStorage::Mapped) {
  return query.add_term_dict(path, storage, index_storage) && query.add_freq_dict(path, storage, index_storage) &&
         query.add_pitch_dict(path, storage, index_storage) && query.add_kanji_dict(path, storage, index_storage);
}

}  // namespace

int main() {
  const std::filesystem::path root =
      std::filesystem::temp_directory_path() / ("hoshidicts-storage-test-" + std::to_string(std::random_device{}()));
  std::filesystem::remove_all(root);
  std::filesystem::create_directories(root);

  // Headwords that share a reading give かく an index list longer than a small
  // page, and the filler rows give blobs.bin headers and glossaries of many
  // sizes on either side of each page boundary.
  std::vector<std::string> rows = {
      term("食べる", "たべる", "v1", 120, "to eat; to live on (e.g. a salary)"),
      term("食べる", "たべる", "", 10, "(colloquial) to make a living"),
      term("漢字", "かんじ", "", 100, "Chinese character"),
      term("読む", "よむ", "v5", 60, "to read"),
      term("書く", "かく", "v5", 90, "to write"),
      term("描く", "かく", "v5", 50, "to draw; to paint"),
      term("各", "かく", "", 40, "each; every"),
      term("角", "かく", "", 30, "angle; corner"),
      term("核", "かく", "", 20, "nucleus; core"),
      term("欠く", "かく", "v5", 10, "to lack"),
      term("ありがとう", "ありがとう", "", 80, "thank you"),
  };
  std::vector<std::string> fillers;
  for (int i = 0; i < 60; ++i) {
    const std::string word = "語" + std::to_string(i);
    fillers.push_back(word);
    rows.push_back(term(word, "ご" + std::to_string(i), "", i, std::string(static_cast<size_t>(5 + i * 7), 'a' + i % 26)));
  }
  std::string terms = "[";
  for (size_t i = 0; i < rows.size(); ++i) {
    terms += (i ? "," : "") + rows[i];
  }
  terms += "]";
  const std::string meta =
      R"([["食べる","freq",{"reading":"たべる","frequency":{"value":142,"displayValue":"142位"}}],)"
      R"(["読む","freq",{"value":88,"displayValue":"88"}],)"
      R"(["書く","freq",{"reading":"かく","frequency":500}],)"
      // Text frequencies, bare and under a reading, as Yomitan's schema allows.
      R"(["漢字","freq","324/37459"],)"
      R"j(["ありがとう","freq",{"reading":"ありがとう","frequency":"five (5)"}],)j"
      R"(["角","freq","four"],)"
      R"(["食べる","pitch",{"reading":"たべる","pitches":[{"position":2},{"position":0,"nasal":1,"devoice":[1,2]}]}],)"
      R"(["食べる","ipa",{"reading":"たべる","transcriptions":[{"ipa":"tabeɾɯ"}]}])" +
      // Bare numbers: glaze reads the byte after one, which a page carries too.
      [&fillers] {
        std::string bare;
        for (size_t i = 0; i < fillers.size(); ++i) {
          bare += ",[\"" + fillers[i] + "\",\"freq\"," + std::to_string(i * 37 + 1) + "]";
        }
        return bare;
      }() +
      "]";
  const std::string kanji =
      R"([["食","ショク ジキ","く.う た.べる","jouyou",["food","eat","meal"],{"strokes":"9","grade":"2"}],)"
      R"(["書","ショ","か.く","jouyou",["write"],{"strokes":"10"}]])";
  const std::string long_path = "img/" + std::string(300, 'x') + ".png";
  const std::vector<std::pair<std::string, std::string>> media = {
      {"img/a.png", random_bytes(3000, 1)},
      {"img/b.bin", random_bytes(20000, 2)},
      {long_path, random_bytes(100, 3)},
  };
  std::vector<std::pair<std::string, std::string>> files = {
      {"index.json", R"({"title":"storage-test","format":3,"revision":"1"})"},
      {"term_bank_1.json", terms},
      {"term_meta_bank_1.json", meta},
      {"kanji_bank_1.json", kanji},
  };
  files.insert(files.end(), media.begin(), media.end());
  const std::string zip = build_zip(files);
  const std::filesystem::path zip_path = root / "storage-test.zip";
  {
    std::ofstream f(zip_path, std::ios::binary);
    f.write(zip.data(), static_cast<std::streamsize>(zip.size()));
  }

  const std::filesystem::path out_dir = root / "out";
  std::filesystem::create_directories(out_dir);
  const auto result = dictionary_importer::import(zip_path.string(), out_dir.string());
  check(result.success, "import succeeded: " + result.error);
  if (!result.success) {
    return 1;
  }
  const std::string dir = (out_dir / result.summary.title).string();
  const auto blobs_size = std::filesystem::file_size(out_dir / result.summary.title / "blobs.bin");
  check(blobs_size > 64 * 16, "blobs.bin spans many small pages");

  // Sharing: one page as large as blobs.bin holds the whole file, so a cache
  // of exactly one file's worth means every kind read the same copy.
  {
    const long before = open_descriptors();
    DictionaryQuery query(PageCacheOptions{.page_bytes = 1 << 20, .budget_bytes = 64 << 20});
    check(query.add_term_dict(dir, DictionaryStorage::Paged, DictionaryIndexStorage::Paged), "paged add_term_dict");
    const long after_one = open_descriptors();
    check(query.add_freq_dict(dir, DictionaryStorage::Paged, DictionaryIndexStorage::Paged) && query.add_pitch_dict(dir, DictionaryStorage::Paged, DictionaryIndexStorage::Paged) &&
              query.add_kanji_dict(dir, DictionaryStorage::Paged, DictionaryIndexStorage::Paged),
          "paged add of the other kinds");
    const long after_all = open_descriptors();
    if (before >= 0) {
      check(after_one == before + 3, "a paged package keeps hash.table, blobs.bin and media.bin open: " +
                                         std::to_string(before) + " -> " + std::to_string(after_one));
      check(after_all == after_one, "the other kinds open no descriptor of their own: " + std::to_string(after_one) +
                                        " -> " + std::to_string(after_all));
    }

    Deinflector deinflector;
    Lookup lookup(query, deinflector);
    const auto results = lookup.lookup("食べる", 16, 16);
    check(!results.empty() && !results[0].term.frequencies.empty() && !results[0].term.pitches.empty(),
          "the lookup read term, frequency and pitch records");
    check(!query.query_kanji("食").entries.empty(), "the kanji lookup read a kanji record");
    check(query.page_cache_bytes() == blobs_size + std::filesystem::file_size(out_dir / result.summary.title / "hash.table"),
          "the four kinds read one copy of hash.table and blobs.bin: cached " + std::to_string(query.page_cache_bytes()) + " of " +
              std::to_string(blobs_size));

    check(query.remove_dict(dir) == 4, "remove_dict drops the four kinds");
    check(query.page_cache_bytes() == 0, "removing the last kind drops its cached pages");
    if (before >= 0) {
      check(open_descriptors() == before, "removing the last kind closes its descriptors");
    }
  }

  DictionaryQuery mapped;
  check(add_all(mapped, dir, DictionaryStorage::Mapped), "mapped add of every kind");
  // Pages of 64 bytes: most records and several index lists cross a boundary.
  constexpr size_t small_budget = 512;
  DictionaryQuery small_pages(PageCacheOptions{.page_bytes = 64, .budget_bytes = small_budget});
  check(add_all(small_pages, dir, DictionaryStorage::Paged, DictionaryIndexStorage::Paged), "paged add with small pages");
  DictionaryQuery default_pages;
  check(add_all(default_pages, dir, DictionaryStorage::Paged, DictionaryIndexStorage::Paged), "paged add with the default pages");

  Deinflector deinflector;
  Lookup mapped_lookup(mapped, deinflector);
  Lookup small_lookup(small_pages, deinflector);
  Lookup default_lookup(default_pages, deinflector);

  std::vector<std::string> words = {"食べました", "食べたかった", "漢字です", "読んだ", "かく", "書いた", "描く",
                                    "角", "ありがとう", "存在しない"};
  words.insert(words.end(), fillers.begin(), fillers.end());
  for (const auto& word : words) {
    const std::string expected = describe(mapped_lookup.lookup(word, 16, 16));
    check(describe(small_lookup.lookup(word, 16, 16)) == expected, "small-page lookup matches for " + word);
    check(small_pages.page_cache_bytes() <= small_budget,
          "small-page cache back within budget after " + word + ": " + std::to_string(small_pages.page_cache_bytes()));
    check(describe(default_lookup.lookup(word, 16, 16)) == expected, "default-page lookup matches for " + word);
    const std::string expected_dictionary = describe(mapped_lookup.lookup_dictionary(word, dir, 16, 16));
    check(describe(small_lookup.lookup_dictionary(word, dir, 16, 16)) == expected_dictionary,
          "small-page lookup_dictionary matches for " + word);
    const std::string expected_query = describe(mapped.query(word));
    check(describe(small_pages.query(word)) == expected_query, "small-page query matches for " + word);
  }
  check(describe(mapped_lookup.lookup("食べました", 16, 16)).find("to eat") != std::string::npos,
        "the parity words do find entries");
  check(describe(mapped_lookup.lookup("かく", 16, 16)).find("to draw") != std::string::npos,
        "a shared reading finds every headword");
  check(describe(mapped_lookup.lookup(fillers[7], 16, 16)).find("Fstorage-test:260=260,") != std::string::npos,
        "a bare-number frequency is read");
  // Yomitan's _getFrequencyInfo: the text is displayed and its first number is the value, 0 without one.
  check(describe(mapped_lookup.lookup("漢字", 16, 16)).find("Fstorage-test:324=324/37459,") != std::string::npos,
        "a bare text frequency is read");
  check(describe(mapped_lookup.lookup("ありがとう", 16, 16)).find("Fstorage-test:5=five (5),") != std::string::npos,
        "a text frequency under a reading is read");
  check(describe(mapped_lookup.lookup("角", 16, 16)).find("Fstorage-test:0=four,") != std::string::npos,
        "a text frequency without a number is read as 0");
  for (const std::string character : {"食", "書", "無"}) {
    const std::string expected = describe(mapped.query_kanji(character));
    check(describe(small_pages.query_kanji(character)) == expected, "small-page kanji matches for " + character);
    check(describe(default_pages.query_kanji(character)) == expected, "default-page kanji matches for " + character);
  }
  check(small_pages.page_cache_bytes() <= small_budget, "small-page cache within budget after the kanji lookups");
  check(mapped.page_cache_bytes() == 0, "a mapped query has no page cache");

  for (const auto& [path, bytes] : media) {
    const std::vector<uint8_t> expected(bytes.begin(), bytes.end());
    for (DictionaryQuery* query : {&mapped, &small_pages, &default_pages}) {
      std::vector<uint8_t> out;
      check(query->read_media_file("storage-test", path, out) == bytes.size() && out == expected,
            "read_media_file returns the stored bytes of " + path.substr(0, 16));
      const auto copied = query->get_media_file("storage-test", path);
      check(std::equal(copied.begin(), copied.end(), bytes.begin(), bytes.end()),
            "get_media_file returns the stored bytes of " + path.substr(0, 16));
      out.assign(3, 0);
      check(query->read_media_file("storage-test", path, out, bytes.size() - 1) == bytes.size() && out.empty(),
            "a file over max_bytes reports its size and reads nothing");
    }
#ifndef __EMSCRIPTEN__
    const auto view = mapped.get_media_file_view("storage-test", path);
    check(view.size == bytes.size() && std::memcmp(view.data, bytes.data(), bytes.size()) == 0,
          "a mapped view is the stored bytes");
#endif
    check(small_pages.get_media_file_view("storage-test", path).data == nullptr,
          "media read on demand has no view");
  }
  for (DictionaryQuery* query : {&mapped, &small_pages}) {
    std::vector<uint8_t> out(1);
    check(query->read_media_file("storage-test", "img/missing.png", out) == 0 && out.empty(),
          "an unknown path reads nothing");
    check(query->read_media_file("no-such-dictionary", "img/a.png", out) == 0 && out.empty(),
          "an unknown dictionary reads nothing");
  }

  std::filesystem::remove_all(root);
  if (failures) {
    std::fprintf(stderr, "%d failure(s)\n", failures);
    return 1;
  }
  std::puts("dictionary storage: ok");
  return 0;
}
