// A Yomitan dictionary whose only bank is a kanji_meta_bank (MarvNC's kanji
// frequency lists, bee-san/hachidori#512) imports, counts its rows under
// kanjiMeta, and answers query_kanji with each row's frequency when it is
// loaded as a frequency dictionary. A kanji frequency is not a term frequency:
// a term with the same text gets none of it.
#include "hoshidicts/importer.hpp"
#include "hoshidicts/query.hpp"

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
    put<uint16_t>(out, 0);  // stored
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

ImportResult import_archive(const std::filesystem::path& root, const std::string& name,
                            const std::vector<std::pair<std::string, std::string>>& files) {
  const std::filesystem::path zip_path = root / (name + ".zip");
  {
    const std::string zip = build_zip(files);
    std::ofstream f(zip_path, std::ios::binary);
    f.write(zip.data(), static_cast<std::streamsize>(zip.size()));
  }
  const std::filesystem::path out_dir = root / "out";
  std::filesystem::create_directories(out_dir);
  return dictionary_importer::import(zip_path.string(), out_dir.string());
}

}  // namespace

int main() {
  const std::filesystem::path root =
      std::filesystem::temp_directory_path() / ("hoshidicts-kanji-meta-test-" + std::to_string(std::random_device{}()));
  std::filesystem::remove_all(root);
  std::filesystem::create_directories(root);

  const auto result = import_archive(root, "kanji-meta", {
      {"index.json", R"({"title":"kanji-freq","format":3,"revision":"1","frequencyMode":"rank-based"})"},
      {"kanji_meta_bank_1.json",
       R"json([["人","freq",1],["日","freq",{"value":4,"displayValue":"4 (12732)"}],["日","freq","6"]])json"},
  });
  check(result.success, "a kanji_meta_bank-only dictionary imports: " + result.error);
  if (!result.success) {
    std::filesystem::remove_all(root);
    return 1;
  }
  const auto& kanji_meta = result.summary.counts.kanjiMeta;
  check(kanji_meta.contains("total") && kanji_meta.at("total") == 3, "kanjiMeta.total counts every row");
  check(kanji_meta.contains("freq") && kanji_meta.at("freq") == 3, "kanjiMeta.freq counts every freq row");
  check(!result.summary.counts.termMeta.contains("freq"), "no row counts as a term frequency");

  DictionaryQuery query;
  check(query.add_freq_dict((root / "out" / "kanji-freq").string()), "add_freq_dict");

  const KanjiResult day = query.query_kanji("日");
  check(day.entries.empty(), "a frequency dictionary adds no kanji entry");
  check(day.frequencies.size() == 1 && day.frequencies[0].dict_name == "kanji-freq",
        "日 has one frequency group from kanji-freq");
  if (day.frequencies.size() == 1) {
    const auto& values = day.frequencies[0].frequencies;
    check(values.size() == 2, "日 keeps both of its rows, got " + std::to_string(values.size()));
    if (values.size() == 2) {
      check(values[0].value == 4 && values[0].display_value == "4 (12732)", "the object row's value and display");
      check(values[1].value == 6 && values[1].display_value == "6", "the string row's value");
    }
  }
  const KanjiResult person = query.query_kanji("人");
  check(person.frequencies.size() == 1 && person.frequencies[0].frequencies.size() == 1 &&
            person.frequencies[0].frequencies[0].value == 1,
        "人 has rank 1");
  check(query.query_kanji("月").frequencies.empty(), "a kanji without a row has no frequency");

  std::vector<TermResult> terms(1);
  terms[0].expression = "日";
  terms[0].reading = "ひ";
  query.query_freq(terms);
  check(terms[0].frequencies.empty(), "a term spelled like the kanji gets no kanji frequency");

  std::filesystem::remove_all(root);
  if (failures == 0) {
    std::printf("kanji-meta: all checks passed\n");
  }
  return failures == 0 ? 0 : 1;
}
