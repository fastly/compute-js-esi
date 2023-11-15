// noinspection DuplicatedCode,HttpUrlsUsage

/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { EsiTransformStream } from "../../../src/index.js";

describe('EsiTransformStream', () => {

  it('Can stream, using custom fetch', async() => {

    const esiTransformStream = new EsiTransformStream(
      'http://www.example.com/',
      {
        'host': 'www.example.com',
      },
      {
        async fetch(input) {
          const url = new URL(input instanceof Request ? input.url : String(input));
          if (url.pathname === '/foo') {
            return new Response('foo');
          }
          return new Response(null);
        }
      }
    );

    const stream = new Response(
      'abc<esi:include src="/foo" /><esi:vars>$(HTTP_HOST)</esi:vars><esi:include src="/null" />def'
    );

    assert.ok(stream.body != null);
    const transformed = new Response(
      stream.body.pipeThrough(esiTransformStream)
    );

    const transformedText = await transformed.text();

    assert.strictEqual(transformedText, 'abcfoowww.example.comdef');
  });

});
