// A Yomitan title is any string, and MarvNC's own dictionaries include
// "Nico/Pixiv", "Japanese-Mongolian/日・モ辞典" and "TheKanjiMap Kanji
// Radicals/Composition" (bee-san/hachidori#512). folder_name keeps every title
// that already is one plain path component and turns any other into one; the
// importer writes there, and a query still names the dictionary by its title.
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
  using dictionary_importer::folder_name;
  for (const std::string title : {"JMdict", "青空文庫漢字", ".hidden", "a b", "Jitendex.org [2026-10-03]"}) {
    check(folder_name(title) == title, "a plain title is its own folder: " + title);
  }
  // FNV-1a 32 of the UTF-8 title, computed independently.
  check(folder_name("Nico/Pixiv") == "Nico_Pixiv #c747f3db", "Nico/Pixiv: " + folder_name("Nico/Pixiv"));
  check(folder_name("TheKanjiMap Kanji Radicals/Composition") ==
            "TheKanjiMap Kanji Radicals_Composition #45a8e7ea",
        "TheKanjiMap: " + folder_name("TheKanjiMap Kanji Radicals/Composition"));
  for (const std::string& title : std::vector<std::string>{"Nico/Pixiv", "a\\b", ".", "..", std::string("nul\0byte", 8), "/", "a/b/c"}) {
    const std::string folder = folder_name(title);
    check(folder.find_first_of(std::string("/\\\0", 3)) == std::string::npos && folder != "." && folder != "..",
          "a folder is one path component for " + title + ": " + folder);
    check(folder.size() == title.size() + 10 && folder.substr(title.size(), 2) == " #", "the hash suffix: " + folder);
  }
  check(folder_name("a/b") != folder_name("a\\b"), "titles that differ in a separator get different folders");
  check(folder_name("a/b") == folder_name("a/b"), "the folder is stable");
  check(folder_name("") != "", "even an empty title has a folder");

  const std::filesystem::path root =
      std::filesystem::temp_directory_path() / ("hoshidicts-title-test-" + std::to_string(std::random_device{}()));
  std::filesystem::remove_all(root);
  std::filesystem::create_directories(root);
  for (const std::string title : {"Nico/Pixiv", "..", "Japanese-Mongolian/日・モ辞典"}) {
    const auto result = import_archive(root, "title", {
        {"index.json", R"({"title":")" + title + R"(","format":3,"revision":"1"})"},
        {"term_bank_1.json", R"([["辞書","じしょ","","",0,["dictionary"],1,""]])"},
    });
    check(result.success, "a title of " + title + " imports: " + result.error);
    check(result.title == title, "the import reports the title unchanged");
    const std::filesystem::path folder = root / "out" / folder_name(title);
    check(std::filesystem::is_regular_file(folder / "index.json"), "it is written to its folder " + folder.string());
    DictionaryQuery query;
    check(query.add_term_dict(folder.string()), "add_term_dict " + title);
    const auto terms = query.query("辞書");
    check(terms.size() == 1 && !terms[0].glossaries.empty() && terms[0].glossaries[0].dict_name == title,
          "a query names the dictionary by its title");
    std::filesystem::remove_all(root / "out");
  }
  {
    // Python's json.dump escapes every non-ASCII character by default, and
    // descriptions carry "\n": index.json's strings are decoded.
    const auto result = import_archive(root, "escaped", {
        {"index.json", R"json({"title":"\u9752\u7a7a\/\"q\"","format":3,"revision":"r\u00e9v",)json"
                       R"json("description":"line 1\nline 2","attribution":"caf\u00e9"})json"},
        {"term_bank_1.json", R"([["辞書","じしょ","","",0,["dictionary"],1,""]])"},
    });
    const std::string title = "青空/\"q\"";
    check(result.success && result.title == title, "an escaped title is decoded: " + result.title + " " + result.error);
    check(result.summary.revision == "rév", "an escaped revision is decoded: " + result.summary.revision);
    check(result.summary.description == "line 1\nline 2", "an escaped description is decoded");
    check(result.summary.attribution == "café", "an escaped attribution is decoded");
    if (result.success) {
      DictionaryQuery query;
      check(query.add_term_dict((root / "out" / folder_name(title)).string()), "add_term_dict for the escaped title");
      const auto terms = query.query("辞書");
      check(terms.size() == 1 && terms[0].glossaries[0].dict_name == title, "the reloaded index keeps the decoded title");
    }
    std::filesystem::remove_all(root / "out");
  }
  {
    const auto result = import_archive(root, "untitled", {
        {"index.json", R"({"title":"","format":3,"revision":"1"})"},
        {"term_bank_1.json", R"([["辞書","じしょ","","",0,["dictionary"],1,""]])"},
    });
    check(!result.success && result.error == "index.json declares no dictionary title", "an empty title is refused: " + result.error);
  }

  std::filesystem::remove_all(root);
  if (failures == 0) {
    std::printf("title-folder: all checks passed\n");
  }
  return failures == 0 ? 0 : 1;
}
