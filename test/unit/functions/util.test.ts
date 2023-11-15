// noinspection DuplicatedCode,HttpUrlsUsage

/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import {quoteString, unquoteString} from "../../../src/util.js";

describe('quoteString', () => {

  it('quotes strings', () => {
    const input = 'foobar';
    const result = quoteString(input);
    assert.strictEqual(result, '\'foobar\'');
  });

  it('quotes strings with quotes', () => {
    const input = "foo'ba'r";
    const result = quoteString(input);
    assert.strictEqual(result, "'foo\\'ba\\'r'");
  });

});

describe('unquoteString', () => {

  it('unquotes strings', () => {
    const input = "'foobar'";
    const result = unquoteString(input);
    assert.strictEqual(result, 'foobar');
  });

  it('unquotes strings with quotes', () => {
    const input = "'foo\\'ba\\'r'";
    const result = unquoteString(input);
    assert.strictEqual(result, "foo'ba'r");
  });

  it('throws on invalid string 1', () => {
    const input = "foobar";
    assert.throws(() => {
      unquoteString(input);
    }, (ex) => {
      assert.ok(ex instanceof Error);
      assert.strictEqual(ex.message, 'unquoteString input should start and end with single quote');
      return true;
    })
  });

  it('throws on invalid string 2', () => {
    const input = "'foo'bar'";
    assert.throws(() => {
      unquoteString(input);
    }, (ex) => {
      assert.ok(ex instanceof Error);
      assert.strictEqual(ex.message, 'unquoteString input should not contain unescaped single quotes');
      return true;
    })
  });

});
