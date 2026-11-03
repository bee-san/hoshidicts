// SPDX-License-Identifier: GPL-3.0-or-later
// Load time and heap of the aii pack (README.md, Measurements, item 5). Not
// built by CMake and not run by any test. Build it against a configured build:
//
//   g++ -O2 -std=c++23 -Iinclude languages/aii/sources/load-bench.cpp -o build/aii-load-bench \
//     build/libhoshidicts.a build/external/zstd/build/cmake/lib/libzstd.a \
//     build/external/libdeflate/libdeflate.a build/external/utf8proc/libutf8proc.a \
//     build/liblzokay.a build/libgumbo.a
//
//   build/aii-load-bench <languages dir> [runs]
//
// Each run adds the pack's language.json and transforms.json to a fresh
// LanguageRegistry; prints the median and range of the add() times, and the
// heap the registry holds after one add (glibc mallinfo2's uordblks before
// and after, the registry kept alive).

#include <malloc.h>

#include <algorithm>
#include <chrono>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "hoshidicts/languages.hpp"

namespace {
std::string read(const std::string& path) {
  std::ifstream f(path, std::ios::binary);
  std::stringstream s;
  s << f.rdbuf();
  return s.str();
}
}  // namespace

int main(int argc, char** argv) {
  if (argc < 2) {
    std::cerr << "usage: aii-load-bench <languages dir> [runs]\n";
    return 2;
  }
  const std::string dir = argv[1];
  const int runs = argc > 2 ? std::stoi(argv[2]) : 50;
  const std::string language = read(dir + "/aii/language.json");
  const std::string transforms = read(dir + "/aii/transforms.json");
  std::vector<double> ms;
  for (int i = 0; i < runs; ++i) {
    hoshidicts::LanguageRegistry registry;
    std::string error;
    const auto start = std::chrono::steady_clock::now();
    if (!registry.add(language, transforms, &error)) {
      std::cerr << error << "\n";
      return 1;
    }
    ms.push_back(std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start).count());
  }
  std::sort(ms.begin(), ms.end());
  const size_t before = mallinfo2().uordblks;
  size_t after = 0;
  {
    hoshidicts::LanguageRegistry registry;
    std::string error;
    registry.add(language, transforms, &error);
    after = mallinfo2().uordblks;
  }
  std::cout << "add: median " << ms[ms.size() / 2] << " ms, min " << ms.front() << " ms, max " << ms.back() << " ms over "
            << runs << " runs; registry heap " << (after - before) << " bytes\n";
  return 0;
}
