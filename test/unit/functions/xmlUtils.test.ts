// noinspection DuplicatedCode

/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { xmlDecode, xmlEncode } from '../../../src/xmlUtils.js';

describe('xmlEncode', () => {

  it('encodes XML entities only', () => {

    const xml = 'foo<bar;goo©';
    const result = xmlEncode(xml);

    assert.strictEqual(result, 'foo&lt;bar;goo©');

  });

});

describe('xmlDecode', () => {

  it('decodes XML entities only', () => {

    const xml = 'foo&lt;bar;goo&copy;';
    const result = xmlDecode(xml);

    assert.strictEqual(result, 'foo<bar;goo&copy;');

  });

});
