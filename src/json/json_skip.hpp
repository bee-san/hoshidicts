#pragma once
#include <glaze/glaze.hpp>
#include <string_view>

namespace hoshidicts {

// Given `begin` pointing at the '[' that opens a JSON array, returns the
// pointer one past its matching ']', or nullptr when the input ends first.
// Strings are honoured (quotes, backslash escapes); nothing else is validated,
// which is also what glaze's non-validating skip does for raw_json_view. The
// scan classifies 64 bytes at a time (wasm simd128 or SSE2 where available).
const char* skip_json_array(const char* begin, const char* end) noexcept;

// A raw JSON value captured as a view, like glz::raw_json_view, whose reader
// uses skip_json_array when the value is an array. Term glossaries are arrays
// and make up most of a term bank's bytes; glaze's byte-and-switch skip was the
// largest item in the import profile.
struct raw_array_view {
  std::string_view str;
};

}  // namespace hoshidicts

template <>
struct glz::from<glz::JSON, hoshidicts::raw_array_view> {
  template <auto Opts>
  GLZ_ALWAYS_INLINE static void op(hoshidicts::raw_array_view& value, glz::is_context auto&& ctx, auto&& it,
                                   auto end) {
    if (*it == '[') {
      const char* const start = it;
      const char* const stop = hoshidicts::skip_json_array(start, end);
      if (stop == nullptr) [[unlikely]] {
        ctx.error = glz::error_code::unexpected_end;
        return;
      }
      value.str = {start, static_cast<size_t>(stop - start)};
      it = stop;
      return;
    }
    glz::raw_json_view other;
    glz::from<glz::JSON, glz::raw_json_view>::template op<Opts>(other, ctx, it, end);
    if (bool(ctx.error)) [[unlikely]] {
      return;
    }
    value.str = other.str;
  }
};
