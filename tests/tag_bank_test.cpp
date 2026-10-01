// Tag banks travel in the imported index.json and come back from get_tags.
// Imports a dictionary with two tag banks, then requires every row back in
// bank order from the summary and, after a reload, from get_tags: names as the
// term bank's definitionTags spell them (U+00A0 and escapes included), decoded
// notes, and fractional order and score. A dictionary first loaded as kanji
// shares its tags with the term kind, and a tag bank that does not parse
// leaves the import, and its count, as they were before tags were stored.
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

const std::string kNbsp = "\xC2\xA0";

// The rows as the summary and get_tags must return them.
std::vector<SummaryTag> expected_tags() {
  return {
      {"★", "popular", 2, "high priority entry", 2},
      {"special" + kNbsp + "reading", "expression", 1, "jukujikun \"idiomatic\" reading", 0},
      {"frequent", "frequent", 1.5, "café & bar", -0.5},
      {R"(esc\u00e9)", "name", 0, "", 0},
      {"second", "archaism", -1, "from a second bank", 0},
  };
}

bool same_tags(const std::vector<SummaryTag>& got, const std::vector<SummaryTag>& want) {
  if (got.size() != want.size()) return false;
  for (size_t i = 0; i < got.size(); ++i) {
    if (got[i].name != want[i].name || got[i].category != want[i].category || got[i].order != want[i].order ||
        got[i].notes != want[i].notes || got[i].score != want[i].score) {
      return false;
    }
  }
  return true;
}

std::string describe(const std::vector<SummaryTag>& tags) {
  std::string out;
  for (const auto& tag : tags) {
    out += "[" + tag.name + "|" + tag.category + "|" + std::to_string(tag.order) + "|" + tag.notes + "|" +
           std::to_string(tag.score) + "]";
  }
  return out;
}

}  // namespace

int main() {
  const std::filesystem::path root =
      std::filesystem::temp_directory_path() / ("hoshidicts-tag-test-" + std::to_string(std::random_device{}()));
  std::filesystem::remove_all(root);
  std::filesystem::create_directories(root);

  // The term bank refers to each tag the way Jitendex does: U+0020 between
  // tags, U+00A0 inside a name.
  const std::string term_bank = "[[\"今日\",\"きょう\",\"★ special" + kNbsp + R"(reading frequent esc\u00e9 second","",0,["today"],1,""]])";
  const std::string tag_bank_1 = "[[\"★\",\"popular\",2,\"high priority entry\",2],"
                                 "[\"special" + kNbsp + R"(reading","expression",1,"jukujikun \"idiomatic\" reading",0],)"
                                 R"(["frequent","frequent",1.5,"caf\u00e9 \u0026 bar",-0.5],)"
                                 R"(["esc\u00e9","name",0,"",0]])";
  const std::string tag_bank_2 = R"([["second","archaism",-1,"from a second bank",0]])";
  const auto result = import_archive(root, "tags", {
      {"index.json", R"({"title":"tag-test","format":3,"revision":"1"})"},
      {"term_bank_1.json", term_bank},
      {"kanji_bank_1.json", R"([["日","ニチ","ひ","",["day"],{}]])"},
      {"tag_bank_1.json", tag_bank_1},
      {"tag_bank_2.json", tag_bank_2},
  });
  check(result.success, "import succeeded: " + result.error);
  if (!result.success) {
    return 1;
  }
  check(same_tags(result.summary.tags, expected_tags()), "summary tags: " + describe(result.summary.tags));
  check(result.summary.counts.tagMeta.total == 5, "tagMeta.total counts every row");
  const std::string dict_dir = (root / "out" / "tag-test").string();

  {
    DictionaryQuery query;
    check(query.add_term_dict(dict_dir), "add_term_dict");
    const auto tags = query.get_tags();
    check(tags.size() == 1 && tags[0].dict_name == "tag-test", "get_tags names the dictionary");
    if (tags.size() == 1) {
      check(same_tags(tags[0].tags, expected_tags()), "get_tags after reload: " + describe(tags[0].tags));
    }
    // Every name matches its use in the term's definitionTags verbatim.
    const auto terms = query.query("今日");
    check(terms.size() == 1 && terms[0].glossaries.size() == 1, "one glossary for 今日");
    if (!terms.empty() && !terms[0].glossaries.empty()) {
      const std::string& uses = terms[0].glossaries[0].definition_tags;
      for (const auto& tag : expected_tags()) {
        check(uses.find(tag.name) != std::string::npos, "definitionTags uses " + tag.name);
      }
    }
  }

  {
    // Kanji first: the term kind shares the tags read when the kanji kind opened.
    DictionaryQuery query;
    check(query.add_kanji_dict(dict_dir), "add_kanji_dict");
    check(query.get_tags().empty(), "a kanji dictionary alone lists no term tags");
    check(query.add_term_dict(dict_dir), "add_term_dict after kanji");
    const auto tags = query.get_tags();
    check(tags.size() == 1 && same_tags(tags[0].tags, expected_tags()), "the term kind shares the kanji kind's tags");
  }

  {
    const auto bad = import_archive(root, "bad-tags", {
        {"index.json", R"({"title":"bad-tag-test","format":3,"revision":"1"})"},
        {"term_bank_1.json", R"([["猫","ねこ","bad","",0,["cat"],1,""]])"},
        {"tag_bank_1.json", R"([["bad","default","not a number","",0]])"},
    });
    check(bad.success, "a tag bank that does not parse does not fail the import: " + bad.error);
    check(bad.summary.tags.empty(), "a tag bank that does not parse adds no tags");
    check(bad.summary.counts.tagMeta.total == 1, "a tag bank that does not parse is still counted");
    DictionaryQuery query;
    check(query.add_term_dict((root / "out" / "bad-tag-test").string()), "add_term_dict without tags");
    check(query.get_tags().empty(), "a dictionary without tags lists none");
  }

  std::filesystem::remove_all(root);
  if (failures) {
    std::fprintf(stderr, "%d failure(s)\n", failures);
    return 1;
  }
  std::puts("tag banks: ok");
  return 0;
}
