// Long-key scan index (src/scan_index.hpp): a dictionary with keys longer than
// the scan length must still have them found when the input begins like one,
// an inflected form of such a key must be found through deinflection, and a
// scan shorter than eight code points must not extend at all.
#include "hoshidicts/deinflector.hpp"
#include "hoshidicts/importer.hpp"
#include "hoshidicts/lookup.hpp"
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

bool has_expression(const std::vector<LookupResult>& results, std::string_view expression) {
  for (const auto& r : results) {
    if (r.term.expression == expression) {
      return true;
    }
  }
  return false;
}

size_t cp_len(std::string_view s) {
  size_t n = 0;
  for (unsigned char c : s) n += (c & 0xC0) != 0x80;
  return n;
}

std::string term(std::string_view expression, std::string_view reading, std::string_view rules = "") {
  std::string t = "[\"";
  t += expression;
  t += "\",\"";
  t += reading;
  t += "\",\"\",\"";
  t += rules;
  t += "\",1,[\"gloss\"],0,\"\"]";
  return t;
}

}  // namespace

int main() {
  const std::filesystem::path root =
      std::filesystem::temp_directory_path() / ("hoshidicts-long-key-test-" + std::to_string(std::random_device{}()));
  std::filesystem::remove_all(root);
  std::filesystem::create_directories(root);

  // A 27-code-point proverb whose reading is longer still; a 17-code-point
  // phrase ending in a verb (rules v1 so 〜られなかった deinflects); a
  // two-character key sharing the proverb's first characters but not its first
  // eight; and an ordinary verb.
  const std::string proverb = "身体髪膚これを父母に受くあえて毀傷せざるは孝の始めなり";
  const std::string proverb_reading = "しんたいはっぷこれをふぼにうくあえてきしょうせざるはこうのはじめなり";
  const std::string phrase = "自分の思うところをはっきりと述べる";
  const std::string bank = "[" + term(proverb, proverb_reading) + "," +
                           term(phrase, "じぶんのおもうところをはっきりとのべる", "v1") + "," + term("身体", "しんたい") +
                           "," + term("食べる", "たべる", "v1") + "]";
  const std::string index = R"({"title":"long-key-test","format":3,"revision":"1"})";
  const std::string zip = build_zip({{"index.json", index}, {"term_bank_1.json", bank}});
  const std::filesystem::path zip_path = root / "long-key-test.zip";
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
  const std::filesystem::path dict_dir = out_dir / result.summary.title;
  check(std::filesystem::is_regular_file(dict_dir / "scan.idx"), "importer wrote scan.idx");

  DictionaryQuery query;
  check(query.add_term_dict(dict_dir.string()), "add_term_dict");
  check(query.max_long_key_length() == cp_len(proverb_reading),
        "max_long_key_length is the reading's length " + std::to_string(cp_len(proverb_reading)) + ", got " +
            std::to_string(query.max_long_key_length()));
  check(query.long_key_length(proverb) == cp_len(proverb), "long_key_length(proverb) is its length");
  check(query.long_key_length("身体髪膚これを父") == cp_len(proverb), "eight-code-point prefix resolves the proverb");
  check(query.long_key_length(proverb_reading) == cp_len(proverb_reading), "the reading is indexed too");
  check(query.long_key_length("身体") == 0, "shorter than eight code points resolves nothing");
  check(query.long_key_length("食べるのが好きです") == 0, "a prefix of no long key resolves nothing");

  Deinflector deinflector;
  Lookup lookup(query, deinflector);
  const std::string tail = "と昔から言われている。";

  // Scan 16 alone cannot see a 26-code-point key; the index extends it.
  {
    const auto results = lookup.lookup(proverb + tail, 16, 16);
    check(has_expression(results, proverb), "proverb found with scan 16 through the long-key index");
    check(has_expression(results, "身体"), "shorter matches are still reported");
    bool matched_whole = false;
    for (const auto& r : results) {
      if (r.term.expression == proverb) {
        matched_whole = r.matched == proverb;
      }
    }
    check(matched_whole, "the proverb's matched text is the whole proverb");
  }

  // An inflected form of the 17-code-point verb phrase: surface 22 code points.
  {
    const std::string inflected = "自分の思うところをはっきりと述べられなかった";
    const auto results = lookup.lookup(inflected + tail, 16, 16);
    check(has_expression(results, phrase), "inflected long phrase found through deinflection");
  }

  // Not a long-key prefix: the ordinary scan result only.
  {
    const auto results = lookup.lookup("食べられなかった" + proverb, 16, 16);
    check(has_expression(results, "食べる"), "ordinary verb still found");
    check(!has_expression(results, proverb), "no extension for a prefix that is not a long key");
  }

  // Scan shorter than the eight-code-point prefix never extends.
  {
    const auto results = lookup.lookup(proverb + tail, 16, 4);
    check(has_expression(results, "身体"), "scan 4 finds the two-character key");
    check(!has_expression(results, proverb), "scan 4 does not extend to the proverb");
  }

  // Scan 8 is the shortest that can extend.
  {
    const auto results = lookup.lookup(proverb + tail, 16, 8);
    check(has_expression(results, proverb), "scan 8 extends to the proverb");
  }

  // The text itself bounds the extension.
  {
    const auto results = lookup.lookup(proverb.substr(0, proverb.find("せざる")), 16, 16);
    check(!has_expression(results, proverb), "a truncated proverb is not matched");
    check(has_expression(results, "身体"), "truncated input still yields the short key");
  }

  // Per-dictionary lookup consults only that dictionary's index.
  {
    const auto results = lookup.lookup_dictionary(proverb + tail, dict_dir.string(), 16, 16);
    check(has_expression(results, proverb), "lookup_dictionary extends through its own index");
    const std::string other = dict_dir.string() + "-missing";
    check(query.long_key_length(proverb, &other) == 0, "an unknown dictionary path resolves nothing");
  }

  std::filesystem::remove_all(root);
  if (failures) {
    std::fprintf(stderr, "%d failure(s)\n", failures);
    return 1;
  }
  std::puts("long-key scan: ok");
  return 0;
}
