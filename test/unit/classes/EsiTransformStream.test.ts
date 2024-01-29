// noinspection DuplicatedCode,HttpUrlsUsage

/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { EsiTransformStream } from "../../../src/index.js";
import { EsiError } from "../../../src/EsiTransformer.js";

describe('EsiTransformStream', () => {

  it('ESI namespace prefix defaults to esi', async () => {

    const stream = new Response(
      'foo<esi:include src="/bar" />baz'
    );

    const esiTransformStream = new EsiTransformStream(
      'http://www.example.com/',
      {
        'host': 'www.example.com',
      },
      {
        async fetch(input) {
          const url = new URL(input instanceof Request ? input.url : String(input));
          if (url.pathname === '/bar') {
            return new Response('bar');
          }
          return new Response(null);
        }
      }
    );

    assert.ok(stream.body != null);
    const transformed = new Response(
      stream.body.pipeThrough(esiTransformStream)
    );

    const transformedText = await transformed.text();

    assert.strictEqual(transformedText, 'foobarbaz');

  });

  it('ESI namespace prefix can be set to something else', async () => {

    const stream = new Response(
      'foo<my-esi:include src="/bar" />baz'
    );

    const esiTransformStream = new EsiTransformStream(
      'http://www.example.com/',
      {
        'host': 'www.example.com',
      },
      {
        esiPrefix: 'my-esi',
        async fetch(input) {
          const url = new URL(input instanceof Request ? input.url : String(input));
          if (url.pathname === '/bar') {
            return new Response('bar');
          }
          return new Response(null);
        }
      }
    );

    assert.ok(stream.body != null);
    const transformed = new Response(
      stream.body.pipeThrough(esiTransformStream)
    );

    const transformedText = await transformed.text();

    assert.strictEqual(transformedText, 'foobarbaz');

  });

  it('doesn\'t recognize default ESI namespace prefix if set to something else', async () => {

    const stream = new Response(
      'foo<esi:include src="/bar" />baz'
    );

    const esiTransformStream = new EsiTransformStream(
      'http://www.example.com/',
      {
        'host': 'www.example.com',
      },
      {
        esiPrefix: 'my-esi',
        async fetch(input) {
          const url = new URL(input instanceof Request ? input.url : String(input));
          if (url.pathname === '/bar') {
            return new Response('bar');
          }
          return new Response(null);
        }
      }
    );

    assert.ok(stream.body != null);
    const transformed = new Response(
      stream.body.pipeThrough(esiTransformStream)
    );

    const transformedText = await transformed.text();

    // Ignores the 'unknown' ESI tag and pipes it through
    assert.strictEqual(transformedText, 'foo<esi:include src="/bar" />baz');

  });

  it('throws if ESI namespace prefix is set to some invalid identifier', () => {

    assert.throws(() => {
      new EsiTransformStream(
        'http://www.example.com/',
        {},
        {
          esiPrefix: ''
        }
      );
    }, (err) => {
      assert.ok(err instanceof EsiError);
      assert.strictEqual(err.message, `ESI namespace prefix '' is not a valid identifier.`);
      return true;
    });

    assert.throws(() => {
      new EsiTransformStream(
        'http://www.example.com/',
        {},
        {
          esiPrefix: ':'
        }
      );
    }, (err) => {
      assert.ok(err instanceof EsiError);
      assert.strictEqual(err.message, `ESI namespace prefix ':' is not a valid identifier.`);
      return true;
    });

    assert.throws(() => {
      new EsiTransformStream(
        'http://www.example.com/',
        {},
        {
          esiPrefix: '123foo'
        }
      );
    }, (err) => {
      assert.ok(err instanceof EsiError);
      assert.strictEqual(err.message, `ESI namespace prefix '123foo' is not a valid identifier.`);
      return true;
    });

  });

  it('recognizes alternate ESI namespace declaration in document', async () => {

    const stream = new Response(
      'foo<my-esi:include src="/bar" xmlns:my-esi="http://www.edge-delivery.org/esi/1.0" />baz'
    );

    const esiTransformStream = new EsiTransformStream(
      'http://www.example.com/',
      {
        'host': 'www.example.com',
      },
      {
        async fetch(input) {
          const url = new URL(input instanceof Request ? input.url : String(input));
          if (url.pathname === '/bar') {
            return new Response('bar');
          }
          return new Response(null);
        }
      }
    );

    assert.ok(stream.body != null);
    const transformed = new Response(
      stream.body.pipeThrough(esiTransformStream)
    );

    const transformedText = await transformed.text();

    assert.strictEqual(transformedText, 'foobarbaz');

  });

  it('can be set to disable default ESI namespace', async () => {

    const stream = new Response(
      'foo<esi:include src="/bar" />baz'
    );

    const esiTransformStream = new EsiTransformStream(
      'http://www.example.com/',
      {
        'host': 'www.example.com',
      },
      {
        esiPrefix: null,
        async fetch(input) {
          const url = new URL(input instanceof Request ? input.url : String(input));
          if (url.pathname === '/bar') {
            return new Response('bar');
          }
          return new Response(null);
        }
      }
    );

    assert.ok(stream.body != null);
    const transformed = new Response(
      stream.body.pipeThrough(esiTransformStream)
    );

    const transformedText = await transformed.text();

    // Ignores the 'unknown' ESI tag and pipes it through
    assert.strictEqual(transformedText, 'foo<esi:include src="/bar" />baz');

  });

  it('passes through unknown XML tags and attrs', async () => {

    const stream = new Response(
      'hoge<foo:bar hi:ho="hello" /><foo:baz x:test="yes">Yes</foo:baz>piyo'
    );

    const esiTransformStream = new EsiTransformStream(
      'http://www.example.com/',
      {},
      {
        esiPrefix: null,
      }
    );

    assert.ok(stream.body != null);
    const transformed = new Response(
      stream.body.pipeThrough(esiTransformStream)
    );

    const transformedText = await transformed.text();

    assert.strictEqual(transformedText, 'hoge<foo:bar hi:ho="hello" /><foo:baz x:test="yes">Yes</foo:baz>piyo');

  });

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
