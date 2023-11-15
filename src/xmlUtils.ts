/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

const encodeTokens = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&apos;",
};

export function xmlEncode(str: string) {
  return Object.entries(encodeTokens)
    .reduce((cur, [token, replacement]) => cur.replaceAll(token, replacement), str);
}

const decodeTokens = {
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": "\"",
  "&apos;": "'",
  "&amp;": "&",
};

export function xmlDecode(str: string) {
  return Object.entries(decodeTokens)
    .reduce((cur, [token, replacement]) => cur.replaceAll(token, replacement), str);
}
