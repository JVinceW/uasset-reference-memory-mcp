// Minimal glob matcher for the scan ignore-list (US-016). Supports single-star
// (any run of characters except a slash) and double-star (any run including
// slashes). A pattern is tested against both the entry's base name and its
// project-relative path, so name globs and path globs both behave intuitively.
function globToRegExp(pattern: string): RegExp {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        re += ".*";
        i++;
      } else {
        re += "[^/]*";
      }
    } else if ("\\^$.|?+()[]{}".includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

const cache = new Map<string, RegExp>();
function compiled(pattern: string): RegExp {
  let re = cache.get(pattern);
  if (!re) {
    re = globToRegExp(pattern);
    cache.set(pattern, re);
  }
  return re;
}

/** True if any pattern matches the entry's base name or its project-relative path. */
export function matchesAnyGlob(patterns: string[], name: string, path: string): boolean {
  for (const p of patterns) {
    const re = compiled(p);
    if (re.test(name) || re.test(path)) return true;
  }
  return false;
}
