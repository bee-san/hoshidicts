// The files DictionaryQuery::open_dict_ reads whole: index.json, dict.zstd and
// styles.css. Imports a dictionary whose zstd dictionary is trained and whose
// summary has no stylesheet, then opens it with each of the three files
// missing, empty, present, cut in half, replaced by other bytes, a directory,
// an unreadable file, a symlink to itself or a file that stat sizes as 0
// (/proc/self/cmdline), in every combination, under a .hoshidicts_6 and a
// .hoshidicts_5 marker. Each case must give what the 35e2dab query
// (tests/reference/, whose open_dict_ reads them with std::ifstream) gives for
// the same files: whether the add succeeds and its error, the styles, the tags
// and the decompressed glossaries. A few results are also required outright:
// a missing, empty or cut index.json fails; under .hoshidicts_6 a missing,
// empty or corrupt dict.zstd fails, and under .hoshidicts_5 it is not read; a
// missing styles.css leaves no styles, a summary's own styles win over
// styles.css, and a styles.css that stat sizes as 0 is still read.
#include "hoshidicts/importer.hpp"
#include "hoshidicts/query.hpp"
#include "reference/query.hpp"

#include <cstdint>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <map>
#include <random>
#include <string>
#include <utility>
#include <vector>

namespace fs = std::filesystem;

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

void write_file(const fs::path& path, const std::string& data) {
  std::ofstream f(path, std::ios::binary);
  f.write(data.data(), static_cast<std::streamsize>(data.size()));
}

std::string slurp(const fs::path& path) {
  std::ifstream f(path, std::ios::binary);
  return {std::istreambuf_iterator<char>(f), {}};
}

enum class State { missing, empty, present, cut, other, directory, unreadable, loop, unsized };

const char* state_name(State state) {
  switch (state) {
    case State::missing:
      return "missing";
    case State::empty:
      return "empty";
    case State::present:
      return "present";
    case State::cut:
      return "cut";
    case State::other:
      return "other";
    case State::directory:
      return "directory";
    case State::unreadable:
      return "unreadable";
    case State::loop:
      return "loop";
    case State::unsized:
      return "unsized";
  }
  return "?";
}

// Removes whatever `file` is, including an unreadable file or a symlink.
void clear(const fs::path& file) {
  std::error_code error;
  if (!fs::is_symlink(fs::symlink_status(file, error))) {
    fs::permissions(file, fs::perms::owner_all, error);
  }
  fs::remove_all(file, error);
}

// Puts `file` in `state`: `present` is its own content and `other` the content
// of State::other. False when the state cannot be made here (an unreadable file
// for a process that reads it anyway, a symlink without the right to make one).
bool make(const fs::path& file, State state, const std::string& present, const std::string& other) {
  switch (state) {
    case State::missing:
      return true;
    case State::empty:
      write_file(file, "");
      return true;
    case State::present:
      write_file(file, present);
      return true;
    case State::cut:
      write_file(file, present.substr(0, present.size() / 2));
      return true;
    case State::other:
      write_file(file, other);
      return true;
    case State::directory:
      return fs::create_directory(file);
    case State::unreadable: {
      write_file(file, present);
      std::error_code error;
      fs::permissions(file, fs::perms::none, error);
      std::ifstream probe(file, std::ios::binary);
      return !error && !probe;
    }
    case State::loop: {
      std::error_code error;
      fs::create_symlink(file.filename(), file, error);
      return !error;
    }
    case State::unsized: {
      // Content whose size stat gives as 0, as procfs does.
      std::error_code error;
      const fs::path proc = "/proc/self/cmdline";
      if (!fs::is_regular_file(proc, error) || fs::file_size(proc, error) != 0 || slurp(proc).empty()) {
        return false;
      }
      fs::create_symlink(proc, file, error);
      return !error;
    }
  }
  return false;
}

// What a caller sees of the add: its result and error, the styles, the tags and
// the glossaries of `words`, which dict.zstd decompresses.
template <typename Query>
std::string describe(const std::string& dir, const std::vector<std::string>& words) {
  Query query;
  std::string out = query.add_term_dict(dir) ? "added" : "refused";
  out += " error=" + query.last_error() + "\n";
  for (const auto& style : query.get_styles()) {
    out += "styles " + style.dict_name + " [" + style.styles + "]\n";
  }
  for (const auto& tags : query.get_tags()) {
    out += "tags " + tags.dict_name + ":";
    for (const auto& tag : tags.tags) {
      out += " " + tag.name + "/" + tag.category + "/" + std::to_string(tag.order) + "/" + tag.notes + "/" +
             std::to_string(tag.score);
    }
    out += "\n";
  }
  for (const auto& word : words) {
    for (const auto& term : query.query(word)) {
      out += term.expression + "|" + term.reading + "|" + term.rules + "|" + std::to_string(term.score) + "|";
      for (const auto& g : term.glossaries) {
        out += g.dict_name + "#" + g.glossary + "#" + g.definition_tags + "#" + g.term_tags + ";";
      }
      out += "\n";
    }
  }
  return out;
}

std::string term(const std::string& expression, const std::string& reading, const std::string& rules, int score,
                 const std::string& glossary) {
  return "[\"" + expression + "\",\"" + reading + "\",\"n\",\"" + rules + "\"," + std::to_string(score) + ",[\"" +
         glossary + "\"],0,\"P\"]";
}

std::string case_label(const std::string& marker, State index_state, State zstd_state, State styles_state) {
  return marker + ", index.json " + state_name(index_state) + ", dict.zstd " + state_name(zstd_state) +
         ", styles.css " + state_name(styles_state);
}

}  // namespace

int main(int argc, char** argv) {
  // --print lists each case and the first line of what it gives.
  const bool print = argc > 1 && std::strcmp(argv[1], "--print") == 0;
  const fs::path root =
      fs::temp_directory_path() / ("hoshidicts-open-dict-files-" + std::to_string(std::random_device{}()));
  fs::remove_all(root);
  fs::create_directories(root);

  // Enough glossaries for the zstd trainer (src/importer.cpp's train_zstd_dict)
  // to make dict.zstd, and a description that makes index.json several
  // stream buffers long.
  std::string terms = "[";
  for (int i = 0; i < 48; ++i) {
    terms += (i ? "," : "") + term("見出し" + std::to_string(i), "みだし" + std::to_string(i), "", 100 - i,
                                   "語釈 " + std::to_string(i) +
                                       ": これはテスト用の見出し語の説明文です。同じ語尾を繰り返します。"
                                       "同じ語尾を繰り返します。同じ語尾を繰り返します。");
  }
  terms += "," + term("食べる", "たべる", "v1", 50, "to eat") + "]";
  std::string description;
  while (description.size() < 20000) {
    description += "Opened in one read. ";
  }
  const std::vector<std::pair<std::string, std::string>> files = {
      {"index.json", R"({"title":"open-dict-files","revision":"1","format":3,"description":")" + description + "\"}"},
      {"term_bank_1.json", terms},
      {"tag_bank_1.json", R"([["n","partOfSpeech",-3,"noun",0],["P","popular",-10,"common",10]])"},
  };
  const fs::path zip_path = root / "open-dict-files.zip";
  write_file(zip_path, build_zip(files));
  const fs::path out_dir = root / "out";
  fs::create_directories(out_dir);
  const auto result = dictionary_importer::import(zip_path.string(), out_dir.string());
  check(result.success, "import succeeded: " + result.error);
  if (!result.success) {
    return 1;
  }
  const fs::path dir = out_dir / "open-dict-files";
  check(fs::is_regular_file(dir / ".hoshidicts_6") && fs::is_regular_file(dir / "dict.zstd"),
        "the import trained dict.zstd (.hoshidicts_6)");
  check(!fs::exists(dir / "styles.css"), "the import wrote no styles.css");
  if (failures) {
    return 1;
  }

  const fs::path index = dir / "index.json";
  const fs::path zstd = dir / "dict.zstd";
  const fs::path styles = dir / "styles.css";
  const std::string index_present = slurp(index);
  const std::string zstd_present = slurp(zstd);
  const std::string no_styles = R"("styles":"")";
  const size_t at = index_present.find(no_styles);
  check(at != std::string::npos, "index.json has an empty \"styles\"");
  if (at == std::string::npos) {
    return 1;
  }
  // A summary with its own styles, which win over styles.css.
  const std::string summary_styles = ".from-index { color: blue; }";
  const std::string index_styled =
      std::string(index_present).replace(at, no_styles.size(), R"("styles":")" + summary_styles + "\"");
  // Not a zstd dictionary: ZSTD_dct_fullDict refuses it.
  const std::string zstd_corrupt(64, '\xAB');
  // A sheet several stream buffers long, with CRLF line ends, non-ASCII text,
  // a NUL and a DOS Ctrl-Z at its end.
  std::string styles_present;
  for (int i = 0; styles_present.size() < 70000; ++i) {
    styles_present += ".rule-" + std::to_string(i) + " { content: \"見出し\"; }\r\n";
  }
  styles_present += std::string("/* \0 */\r\n\x1A", 10);

  const std::vector<State> index_states = {State::missing,    State::empty, State::present,
                                           State::cut,        State::other, State::directory,
                                           State::unreadable, State::loop,  State::unsized};
  const std::vector<State> zstd_states = index_states;
  const std::vector<State> styles_states = {State::missing,    State::empty, State::present, State::directory,
                                            State::unreadable, State::loop,  State::unsized};
  const std::vector<std::string> words = {"見出し0", "見出し17", "食べる", "存在しない"};
  const std::vector<std::string> markers = {".hoshidicts_6", ".hoshidicts_5"};

  std::map<std::string, std::string> seen;
  size_t compared = 0;
  size_t skipped = 0;
  for (const auto& marker : markers) {
    for (State index_state : index_states) {
      for (State zstd_state : zstd_states) {
        for (State styles_state : styles_states) {
          for (const auto& file : {index, zstd, styles, dir / markers[0], dir / markers[1]}) {
            clear(file);
          }
          write_file(dir / marker, "");
          if (!make(index, index_state, index_present, index_styled) ||
              !make(zstd, zstd_state, zstd_present, zstd_corrupt) || !make(styles, styles_state, styles_present, "")) {
            ++skipped;
            continue;
          }
          const std::string label = case_label(marker, index_state, zstd_state, styles_state);
          const std::string expected = describe<hoshidicts_legacy::DictionaryQuery>(dir.string(), words);
          const std::string actual = describe<DictionaryQuery>(dir.string(), words);
          check(actual == expected,
                label + " gives what 35e2dab gives:\n--- 35e2dab\n" + expected + "--- now\n" + actual);
          if (print) {
            std::printf("%s: %s\n", label.c_str(), actual.substr(0, actual.find('\n')).c_str());
          }
          seen[label] = actual;
          ++compared;
        }
      }
    }
  }
  for (const auto& file : {index, zstd, styles}) {
    clear(file);
  }

  // Results required outright, whatever the oracle says.
  const auto result_of = [&seen](const std::string& marker, State index_state, State zstd_state, State styles_state) {
    const std::string label = case_label(marker, index_state, zstd_state, styles_state);
    const auto it = seen.find(label);
    check(it != seen.end(), label + " was compared");
    return it == seen.end() ? std::string() : it->second;
  };
  const std::string refused = "refused error=\n";
  const std::string added = "added error=\n";
  const std::string glossary = "語釈 17: これはテスト用の見出し語の説明文です。";
  const std::string styles_line = "styles open-dict-files [";
  for (State bad : {State::missing, State::empty, State::cut}) {
    check(result_of(".hoshidicts_6", bad, State::present, State::missing) == refused,
          std::string("a ") + state_name(bad) + " index.json fails");
  }
  const std::string normal = result_of(".hoshidicts_6", State::present, State::present, State::missing);
  check(normal.starts_with(added) && normal.find(glossary) != std::string::npos &&
            normal.find("tags open-dict-files: n/partOfSpeech") != std::string::npos,
        "a complete dictionary opens, with its tags and decompressed glossaries:\n" + normal);
  check(normal.find(styles_line) == std::string::npos, "a missing styles.css leaves no styles");
  for (State bad : {State::missing, State::empty, State::other}) {
    check(result_of(".hoshidicts_6", State::present, bad, State::missing) == refused,
          std::string("under .hoshidicts_6 a ") + state_name(bad) + " dict.zstd fails");
  }
  check(result_of(".hoshidicts_5", State::present, State::missing, State::missing).starts_with(added),
        "under .hoshidicts_5 dict.zstd is not read");
  // A directory is what the standard library's stream makes of it (libstdc++
  // throws, libc++ reads nothing), which the comparison above covers.
  const std::string empty_styles = result_of(".hoshidicts_6", State::present, State::present, State::empty);
  check(empty_styles.starts_with(added) && empty_styles.find(styles_line) == std::string::npos,
        "an empty styles.css gives no styles");
#ifndef _WIN32
  // Windows reads styles.css in text mode (CRLF to LF, Ctrl-Z ends it), as
  // 35e2dab did; elsewhere the sheet is its bytes.
  check(result_of(".hoshidicts_6", State::present, State::present, State::present)
                .find(styles_line + styles_present + "]\n") != std::string::npos,
        "styles.css is read whole when the summary has no styles");
#endif
  check(result_of(".hoshidicts_6", State::other, State::present, State::present)
                .find(styles_line + summary_styles + "]\n") != std::string::npos,
        "a summary's own styles win over styles.css");
  // A file that stat sizes as 0 is still read to its end.
  if (const auto it = seen.find(case_label(".hoshidicts_6", State::present, State::present, State::unsized));
      it != seen.end()) {
    check(it->second.find(styles_line) != std::string::npos,
          "a styles.css that stat sizes as 0 is read:\n" + it->second);
  }

  fs::remove_all(root);
  if (failures) {
    std::fprintf(stderr, "%d failure(s)\n", failures);
    return 1;
  }
  std::printf(
      "open dict files: %zu cases match the 35e2dab query (%zu skipped: an unreadable file, a symlink or "
      "/proc/self/cmdline is not possible here)\n",
      compared, skipped);
  return 0;
}
