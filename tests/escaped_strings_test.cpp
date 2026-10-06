// A bank may spell any string with JSON escapes: Python's json.dump writes
// every non-ASCII character as \\uXXXX by default, which is how 萌典 and the
// other Chinese dictionaries in MarvNC's list are built, and TheKanjiMap writes
// astral characters as surrogate pairs (bee-san/hachidori#512). The strings a
// lookup matches are decoded, so such a dictionary answers the text itself;
// glossaries stay raw JSON for the renderer.
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
      std::filesystem::temp_directory_path() / ("hoshidicts-escape-test-" + std::to_string(std::random_device{}()));
  std::filesystem::remove_all(root);
  std::filesystem::create_directories(root);

  // 食べる/たべる, 𠀋 (U+2000B) and 食, every one escaped.
  const auto result = import_archive(root, "escaped", {
      {"index.json", R"({"title":"escaped-banks","format":3,"revision":"1"})"},
      {"term_bank_1.json",
       R"([["\u98df\u3079\u308b","\u305f\u3079\u308b","v1","\u52d5\u8a5e",0,["to \"eat\""],1,"\u2605"],)"
       R"(["\ud840\udc0b","\u3058\u3087\u3046","","",0,["astral"],2,""]])"},
      {"term_meta_bank_1.json",
       R"([["\u98df\u3079\u308b","freq",{"reading":"\u305f\u3079\u308b","frequency":7}],)"
       R"(["\u98df\u3079\u308b","pitch",{"reading":"\u305f\u3079\u308b","pitches":[{"position":2}]}],)"
       R"(["\u98df\u3079\u308b","ipa",{"reading":"\u305f\u3079\u308b","transcriptions":[{"ipa":"tabe\u027e\u026f"}]}]])"},
      {"kanji_bank_1.json", R"([["\u98df","\u30b7\u30e7\u30af","\u304f.\u3046","",["eat"],{}]])"},
      {"kanji_meta_bank_1.json", R"([["\u98df","freq",3]])"},
      {"tag_bank_1.json", R"([["\u52d5\u8a5e","partOfSpeech",0,"verb",0]])"},
  });
  check(result.success, "an escaped dictionary imports: " + result.error);
  const std::string dir = (root / "out" / "escaped-banks").string();
  DictionaryQuery query;
  check(query.add_term_dict(dir) && query.add_freq_dict(dir) && query.add_pitch_dict(dir) && query.add_kanji_dict(dir),
        "every kind loads");

  auto terms = query.query("食べる");
  check(terms.size() == 1, "the decoded expression answers a lookup");
  if (terms.size() == 1) {
    check(terms[0].reading == "たべる", "the reading is decoded: " + terms[0].reading);
    check(terms[0].rules == "動詞" && terms[0].glossaries.size() == 1 && terms[0].glossaries[0].term_tags == "★",
          "the rules and term tags are decoded");
  }
  check(query.query("\\u98df\\u3079\\u308b").empty(), "the escape spelling is not a key");
  check(query.query("𠀋").size() == 1, "a surrogate pair decodes to the astral character");

  // query() attaches the frequencies and pitches of the loaded dictionaries.
  check(!terms.empty() && terms[0].frequencies.size() == 1 && terms[0].frequencies[0].frequencies[0].value == 7,
        "a reading-scoped frequency matches the decoded reading");
  check(!terms.empty() && terms[0].pitches.size() == 1 && terms[0].pitches[0].pitches.size() == 1 &&
            terms[0].pitches[0].transcriptions == std::vector<std::string>{"tabeɾɯ"},
        "a reading-scoped pitch and IPA match the decoded reading");

  const KanjiResult kanji = query.query_kanji("食");
  check(kanji.entries.size() == 1 && kanji.entries[0].onyomi == "ショク" && kanji.entries[0].kunyomi == "く.う",
        "the kanji entry is decoded");
  check(kanji.frequencies.size() == 1, "the kanji frequency is keyed by the decoded character");
  check(result.summary.tags.size() == 1 && result.summary.tags[0].name == "動詞", "the tag name is decoded");

  std::filesystem::remove_all(root);
  if (failures == 0) {
    std::printf("escaped-strings: all checks passed\n");
  }
  return failures == 0 ? 0 : 1;
}
