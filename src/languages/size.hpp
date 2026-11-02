// SPDX-License-Identifier: GPL-3.0-or-later
// Load-time code (pack parsing, class and pattern checks) runs once per pack,
// so WebAssembly builds optimise it for size: it is most of what the
// language framework adds to a bundle. Native builds keep their flags.
//
//   HOSHIDICTS_LOAD_TIME_BEGIN
//   ... functions ...
//   HOSHIDICTS_LOAD_TIME_END
#pragma once

#if defined(__clang__) && defined(__EMSCRIPTEN__)
#define HOSHIDICTS_LOAD_TIME_BEGIN _Pragma("clang attribute push(__attribute__((minsize)), apply_to = function)")
#define HOSHIDICTS_LOAD_TIME_END _Pragma("clang attribute pop")
#else
#define HOSHIDICTS_LOAD_TIME_BEGIN
#define HOSHIDICTS_LOAD_TIME_END
#endif
