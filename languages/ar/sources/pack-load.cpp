// SPDX-License-Identifier: GPL-3.0-or-later
// Pack load time and heap for README.md (Measurements). Not built by CMake and
// not run by any test. Build it against a configured build (Linux, glibc):
//
//   g++ -O2 -std=c++23 -Iinclude languages/ar/sources/pack-load.cpp -o build/pack-load-ar \
//     build/libhoshidicts.a build/external/zstd/build/cmake/lib/libzstd.a \
//     build/external/libdeflate/libdeflate.a build/external/utf8proc/libutf8proc.a \
//     build/liblzokay.a build/libgumbo.a
//
//   build/pack-load-ar languages/ar [runs]
//
// Reads the pack's language.json and transforms.json once, then times
// LanguageRegistry::add into a fresh registry `runs` times (default 50) and
// prints the median, and the heap the registry holds after one add
// (mallinfo2's in-use bytes before and after, the files' text excluded).

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
    std::cerr << "usage: pack-load-ar <pack dir> [runs]\n";
    return 2;
  }
  const std::string dir = argv[1];
  const int runs = argc > 2 ? std::stoi(argv[2]) : 50;
  const std::string language = read(dir + "/language.json");
  const std::string transforms = read(dir + "/transforms.json");
  std::vector<double> ms;
  for (int i = 0; i < runs; ++i) {
    hoshidicts::LanguageRegistry registry;
    std::string error;
    const auto start = std::chrono::steady_clock::now();
    const bool ok = registry.add(language, transforms, &error);
    const auto end = std::chrono::steady_clock::now();
    if (!ok) {
      std::cerr << error << "\n";
      return 1;
    }
    ms.push_back(std::chrono::duration<double, std::milli>(end - start).count());
  }
  std::sort(ms.begin(), ms.end());
  const size_t before = mallinfo2().uordblks;
  size_t after = 0;
  {
    auto* registry = new hoshidicts::LanguageRegistry;
    std::string error;
    registry->add(language, transforms, &error);
    after = mallinfo2().uordblks;
    delete registry;
  }
  std::cout << "add: median " << ms[ms.size() / 2] << " ms, min " << ms.front() << " ms, max " << ms.back() << " ms over " << runs
            << " runs\nheap held by the registry after one add: " << (after - before) << " bytes\n";
  return 0;
}
