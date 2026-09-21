// Term scores are JSON numbers in the Yomitan schema. Import a tiny dictionary
// whose scores are fractional, negative, signed zero, spelt with exponents, and
// beyond int32 in both directions, then look every term up and require the
// exact double back. Also requires that two terms whose scores differ only in
// the fraction sort in score order, which is what int32 storage broke.
#include "hoshidicts/deinflector.hpp"
#include "hoshidicts/importer.hpp"
#include "hoshidicts/lookup.hpp"
#include "hoshidicts/query.hpp"

#include <cmath>
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

struct Case {
  const char* expression;
  const char* json_score;  // as it appears in the bank
  double expected;
};

// Each expression is unique so a lookup returns exactly one candidate.
const Case kCases[] = {
    {"甲", "1.5", 1.5},
    {"乙", "-2.25", -2.25},
    {"丙", "0.1", 0.1},
    {"丁", "1099511627776.5", 1099511627776.5},
    {"戊", "-0", -0.0},
    {"己", "2147483648", 2147483648.0},
    {"庚", "-2147483649", -2147483649.0},
    {"辛", "1e0", 1.0},
    {"壬", "1.25e2", 125.0},
    {"癸", "5e-1", 0.5},
    {"子", "9007199254740993", 9007199254740992.0},  // beyond 2^53: rounds like JS Number
};

int failures = 0;

void check(bool ok, const std::string& what) {
  if (!ok) {
    ++failures;
    std::fprintf(stderr, "FAIL: %s\n", what.c_str());
  }
}

}  // namespace

int main() {
  const std::filesystem::path root =
      std::filesystem::temp_directory_path() /
      ("hoshidicts-score-test-" + std::to_string(std::random_device{}()));
  std::filesystem::remove_all(root);
  std::filesystem::create_directories(root);

  std::string bank = "[";
  for (size_t i = 0; i < std::size(kCases); ++i) {
    if (i) bank += ",";
    bank += "[\"";
    bank += kCases[i].expression;
    bank += "\",\"よみ\",\"\",\"\",";
    bank += kCases[i].json_score;
    bank += ",[\"gloss\"],0,\"\"]";
  }
  // Two same-reading terms whose scores differ only by a fraction: 2.75 must
  // rank above 2.25 once fractions survive; both truncated to 2 before.
  bank += ",[\"高\",\"おなじ\",\"\",\"\",2.25,[\"low\"],0,\"\"]";
  bank += ",[\"高\",\"おなじ\",\"\",\"\",2.75,[\"high\"],0,\"\"]";
  bank += "]";

  const std::string index = R"({"title":"score-test","format":3,"revision":"1"})";
  const std::string zip = build_zip({{"index.json", index}, {"term_bank_1.json", bank}});
  const std::filesystem::path zip_path = root / "score-test.zip";
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
  check(std::filesystem::is_regular_file(dict_dir / ".hoshidicts_5") ||
            std::filesystem::is_regular_file(dict_dir / ".hoshidicts_6"),
        "importer wrote a double-score marker");

  DictionaryQuery query;
  check(query.add_term_dict(dict_dir.string()), "add_dict");

  for (const auto& c : kCases) {
    const auto terms = query.query(c.expression);
    check(terms.size() == 1, std::string("one result for ") + c.expression);
    if (terms.empty()) continue;
    const double got = terms[0].score;
    const bool same = got == c.expected && std::signbit(got) == std::signbit(c.expected);
    check(same, std::string("score for ") + c.expression + " json=" + c.json_score + " expected=" +
                    std::to_string(c.expected) + " got=" + std::to_string(got));
  }

  // The merged term keeps the maximum score of its glossaries, which is now
  // the fractional 2.75 rather than 2.
  {
    const auto terms = query.query("高");
    check(terms.size() == 1, "one merged result for 高");
    if (!terms.empty()) {
      check(terms[0].score == 2.75, "merged score is max(2.25, 2.75)=2.75, got " + std::to_string(terms[0].score));
      check(terms[0].glossaries.size() == 2, "merged term keeps both glossaries");
    }
  }

  // The lookup path (deinflection + ranking) surfaces the same double.
  {
    Deinflector deinflector;
    Lookup lookup(query, deinflector);
    const auto results = lookup.lookup("丁");
    check(!results.empty(), "lookup finds 丁");
    if (!results.empty()) {
      check(results[0].term.score == 1099511627776.5,
            "lookup score for 丁 got " + std::to_string(results[0].term.score));
    }
  }

  std::filesystem::remove_all(root);
  if (failures) {
    std::fprintf(stderr, "%d failure(s)\n", failures);
    return 1;
  }
  std::puts("score round-trip: ok");
  return 0;
}
