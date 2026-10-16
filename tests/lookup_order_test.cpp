// Ordering of distinct expression+reading candidates in Lookup::lookup
// (bee-san/hachidori#575). A name such as 神原 reads かんばら in the caller's
// top-priority dictionaries (JP Wikipedia Proper Nouns, VNDB Names) and かみはら
// in the bottom one (Pixiv). A surface-form corpus frequency (CC100) stores one
// value for the surface 神原 with no reading, so it is handed to every reading:
// the frequency comparison ties and cannot separate the readings.
//
// The comparator must then fall through to the caller's dictionary order, as
// Yomitan ranks dictionaryIndex after frequencyOrder and before score
// (yomidevs/yomitan@67db60d), so the reading from the dictionary the caller
// ranked highest comes first. This test imports tiny synthetic dictionaries and
// checks that order under the user's explicit ascending surface-frequency sort,
// under Auto (no sort dictionary, which goes straight to dictionary order), and
// reversed; and that a per-reading frequency that genuinely separates the
// readings still outranks dictionary order. Last, it checks that NekoPara's cat
// speech (the deinflector's "neko speech" results) is used only where it reads
// further than every ordinary reading.
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

// Imports a one-component dictionary archive into out_dir and returns the folder
// the importer wrote it to.
std::string import_dict(const std::filesystem::path& root, const std::filesystem::path& out_dir,
                        const std::string& title, const std::vector<std::pair<std::string, std::string>>& files) {
  const std::string zip = build_zip(files);
  const std::filesystem::path zip_path = root / (title + ".zip");
  {
    std::ofstream f(zip_path, std::ios::binary);
    f.write(zip.data(), static_cast<std::streamsize>(zip.size()));
  }
  const auto result = dictionary_importer::import(zip_path.string(), out_dir.string());
  check(result.success, "import " + title + ": " + result.error);
  return (out_dir / result.summary.title).string();
}

// A one-term term dictionary: 神原 with the given reading and gloss.
std::vector<std::pair<std::string, std::string>> term_dict(const std::string& title, const std::string& reading,
                                                           const std::string& gloss) {
  const std::string index = R"({"title":")" + title + R"(","format":3,"revision":"1"})";
  const std::string bank = R"([["神原",")" + reading + R"(","","",0,[")" + gloss + R"("],0,""]])";
  return {{"index.json", index}, {"term_bank_1.json", bank}};
}

// The readings a lookup returns for 神原, in order.
std::vector<std::string> readings(const Lookup& lookup, const LookupOptions& options) {
  std::vector<std::string> out;
  for (const auto& result : lookup.lookup("神原", 32, 16, options)) {
    out.push_back(result.term.reading);
  }
  return out;
}

bool same(const std::vector<std::string>& got, const std::vector<std::string>& want) { return got == want; }

std::string join(const std::vector<std::string>& v) {
  std::string out = "[";
  for (size_t i = 0; i < v.size(); ++i) {
    if (i) out += ", ";
    out += v[i];
  }
  return out + "]";
}

}  // namespace

int main() {
  const std::filesystem::path root =
      std::filesystem::temp_directory_path() / ("hoshidicts-lookup-order-test-" + std::to_string(std::random_device{}()));
  std::filesystem::remove_all(root);
  std::filesystem::create_directories(root);
  const std::filesystem::path out_dir = root / "out";
  std::filesystem::create_directories(out_dir);

  Deinflector deinflector;

  // --- The #575 case: a surface frequency ties the readings. -----------------
  {
    // かんばら lives in the two top-priority dictionaries, かみはら in the bottom one.
    const std::string wiki = import_dict(root, out_dir, "wiki-proper-nouns",
                                         term_dict("wiki-proper-nouns", "かんばら", "Kanbara (surname)"));
    const std::string vndb =
        import_dict(root, out_dir, "vndb-names", term_dict("vndb-names", "かんばら", "VNDB name"));
    const std::string pixiv =
        import_dict(root, out_dir, "pixiv", term_dict("pixiv", "かみはら", "A Japanese surname."));
    // A reading-less surface frequency: one rank for the surface 神原, so both
    // readings read it. rank-based so Auto and Ascending both sort ascending.
    const std::string freq = import_dict(
        root, out_dir, "surface-frequency",
        {{"index.json", R"({"title":"surface-frequency","format":3,"revision":"1","frequencyMode":"rank-based"})"},
         {"term_meta_bank_1.json", R"([["神原","freq",{"value":8988,"displayValue":"8988"}]])"}});

    DictionaryQuery query;
    check(query.add_term_dict(wiki), "add wiki");
    check(query.add_term_dict(vndb), "add vndb");
    check(query.add_term_dict(pixiv), "add pixiv");
    check(query.add_freq_dict(freq), "add surface frequency");
    // The caller's priority: Wikipedia, then VNDB, then Pixiv.
    check(query.set_dict_order({wiki, vndb, pixiv}), "set dict order");

    Lookup lookup(query, deinflector);

    // The user's own setting: an explicit ascending sort by the surface
    // frequency. The tie resolves to the top dictionary's reading.
    LookupOptions ascending;
    ascending.frequency_order = LookupFrequencyOrder::Ascending;
    ascending.frequency_dictionary = "surface-frequency";
    const auto asc = readings(lookup, ascending);
    check(same(asc, {"かんばら", "かみはら"}),
          "explicit ascending surface frequency: expected [かんばら, かみはら], got " + join(asc));

    // Auto (no sort dictionary) goes straight to dictionary order, as Yomitan
    // does when no sort frequency dictionary is set.
    LookupOptions automatic;
    automatic.frequency_order = LookupFrequencyOrder::Auto;
    const auto aut = readings(lookup, automatic);
    check(same(aut, {"かんばら", "かみはら"}), "auto: expected [かんばら, かみはら], got " + join(aut));

    // Reversing the caller's dictionary order reverses the tie, so the order is
    // the dictionaries' and not a fixed reading or insertion order. Both the
    // explicit sort and Auto follow it.
    check(query.set_dict_order({pixiv, vndb, wiki}), "reverse dict order");
    const auto asc_rev = readings(lookup, ascending);
    check(same(asc_rev, {"かみはら", "かんばら"}),
          "reversed priority, explicit ascending: expected [かみはら, かんばら], got " + join(asc_rev));
    const auto aut_rev = readings(lookup, automatic);
    check(same(aut_rev, {"かみはら", "かんばら"}),
          "reversed priority, auto: expected [かみはら, かんばら], got " + join(aut_rev));
  }

  // --- A frequency that separates the readings still outranks dictionary order.
  {
    const std::filesystem::path out2 = root / "out2";
    std::filesystem::create_directories(out2);
    // かんばら is top priority, かみはら is bottom; but the frequency rates かみはら
    // (100) far more common than かんばら (90000, rank-based: larger is rarer).
    const std::string top =
        import_dict(root, out2, "sep-top", term_dict("sep-top", "かんばら", "top-priority reading"));
    const std::string bottom =
        import_dict(root, out2, "sep-bottom", term_dict("sep-bottom", "かみはら", "bottom-priority reading"));
    const std::string freq = import_dict(
        root, out2, "per-reading-frequency",
        {{"index.json",
          R"({"title":"per-reading-frequency","format":3,"revision":"1","frequencyMode":"rank-based"})"},
         {"term_meta_bank_1.json",
          R"([["神原","freq",{"reading":"かみはら","frequency":{"value":100,"displayValue":"100"}}],)"
          R"(["神原","freq",{"reading":"かんばら","frequency":{"value":90000,"displayValue":"90000"}}]])"}});

    DictionaryQuery query;
    check(query.add_term_dict(top), "add sep-top");
    check(query.add_term_dict(bottom), "add sep-bottom");
    check(query.add_freq_dict(freq), "add per-reading frequency");
    check(query.set_dict_order({top, bottom}), "set sep dict order");

    Lookup lookup(query, deinflector);
    LookupOptions ascending;
    ascending.frequency_order = LookupFrequencyOrder::Ascending;
    ascending.frequency_dictionary = "per-reading-frequency";
    const auto got = readings(lookup, ascending);
    check(same(got, {"かみはら", "かんばら"}),
          "a per-reading frequency keeps the more common reading first across dictionary order: "
          "expected [かみはら, かんばら], got " +
              join(got));
  }

  // --- NekoPara cat speech: read only where it explains more than any ordinary
  // reading (Deinflector's "neko speech" results). --------------------------
  {
    const std::filesystem::path out3 = root / "out3";
    std::filesystem::create_directories(out3);
    // こんじゃく, こんだく, なあ and まあ are what にゃ -> じゃ/だ/な/ま would make of
    // the ordinary words こんにゃく and にゃあ.
    const std::string bank =
        R"([["蒟蒻","こんにゃく","","",0,["konnyaku"],1,""],)"
        R"(["コンニャク","コンニャク","","",0,["konnyaku, in katakana"],2,""],)"
        R"(["今昔","こんじゃく","","",0,["past and present"],3,""],)"
        R"(["混濁","こんだく","","",0,["turbidity"],4,""],)"
        R"(["にゃあ","にゃあ","","",0,["meow"],5,""],)"
        R"(["なあ","なあ","","",0,["hey"],6,""],)"
        R"(["まあ","まあ","","",0,["well"],7,""],)"
        R"(["出来る","できる","","v1",0,["to be able"],8,""],)"
        R"(["出来","でき","","",0,["workmanship"],9,""],)"
        R"(["そんな","そんな","","",0,["such"],10,""],)"
        R"(["損","そん","","",0,["loss"],11,""],)"
        R"(["なんで","なんで","","",0,["why"],12,""],)"
        // 19 code points: a long key, found only by the scan past scan_length.
        R"(["にゃんであいうえおかきくけこさしすせそ","にゃんであいうえおかきくけこさしすせそ","","",0,["long"],13,""]])";
    const std::string dict = import_dict(
        root, out3, "neko",
        {{"index.json", R"({"title":"neko","format":3,"revision":"1"})"}, {"term_bank_1.json", bank}});
    DictionaryQuery query;
    check(query.add_term_dict(dict), "add neko dictionary");
    Lookup lookup(query, deinflector);
    const auto expressions = [&](const std::string& text) {
      std::vector<std::string> out;
      for (const auto& result : lookup.lookup(text, 32, 16)) {
        out.push_back(result.term.expression);
      }
      return out;
    };

    // Ordinary words with にゃ keep exactly their ordinary results.
    const auto konnyaku = expressions("こんにゃく");
    check(same(konnyaku, {"蒟蒻", "コンニャク"}), "こんにゃく: expected [蒟蒻, コンニャク], got " + join(konnyaku));
    const auto meow = expressions("にゃあ");
    check(same(meow, {"にゃあ"}), "にゃあ: expected [にゃあ], got " + join(meow));

    // Cat speech reads further than any ordinary reading, so it comes first.
    const auto dekinyai = lookup.lookup("できにゃい", 32, 16);
    check(!dekinyai.empty() && dekinyai[0].term.expression == "出来る" && dekinyai[0].matched == "できにゃい" &&
              dekinyai[0].trace.size() == 2 && dekinyai[0].trace[0].name == Deinflector::neko_speech &&
              dekinyai[0].trace[1].name == "negative",
          "できにゃい: expected 出来る over the whole input by neko speech -> negative");
    const auto sonnya = expressions("そんにゃ");
    check(same(sonnya, {"そんな", "損"}), "そんにゃ: expected [そんな, 損], got " + join(sonnya));

    // Within scan_length only にゃんで -> なんで matches, by neko speech; the
    // long-key scan then finds the whole input as an ordinary key, which reads
    // further, so なんで goes.
    const std::string long_key = "にゃんであいうえおかきくけこさしすせそ";
    const auto long_result = expressions(long_key);
    check(same(long_result, {long_key}), "long key: expected [" + long_key + "], got " + join(long_result));
  }

  std::filesystem::remove_all(root);
  if (failures) {
    std::fprintf(stderr, "%d failure(s)\n", failures);
    return 1;
  }
  std::puts("lookup order: ok");
  return 0;
}
