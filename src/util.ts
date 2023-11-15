/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

export type ValueOrPromise<TVal> = TVal | Promise<TVal>;

export function quoteString(input: string) {

  return "'" + input.replaceAll("'", "\\'") + "'";

}

export function unquoteString(input: string) {

  if (!input.startsWith("'") || !input.endsWith("'")) {
    throw new Error('unquoteString input should start and end with single quote');
  }

  let str = input.slice(1, input.length-1);

  let p = -1;
  while(true) {
    p = str.indexOf("'", p+1);
    if (p === -1) {
      break;
    }
    if(str.charAt(p-1) !== '\\') {
      throw new Error('unquoteString input should not contain unescaped single quotes');
    }
  }

  return input.slice(1, -1).replaceAll("\\'", "'");
}
