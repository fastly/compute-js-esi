// noinspection DuplicatedCode

/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import url from 'node:url';

import { ComputeApplication } from "@fastly/compute-testing";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

describe('Compute Test Suite', () => {

  // Represents the app running in the local development environment
  const app = new ComputeApplication();

  before(async () => {

    // Start the app
    await app.start({
      // Set 'appRoot' to the directory in which to start the app.  This is usually
      // the directory that contains the 'fastly.toml' file.
      appRoot: path.join(__dirname, '../edge'),
    });

  });

  after(async() => {
    // Shut down the app
    await app.shutdown();
  });

  describe('esi', () => {

    it('01 - basic esi:include testing', async() => {
      const response = await app.fetch('/01.html');
      assert.strictEqual(response.status, 200);

      const bodyText = await response.text();
      let p = 0;

      p = bodyText.indexOf('HEADER', p);
      assert.ok(p > 0);

      p = bodyText.indexOf('BODY', p);
      assert.ok(p > 0);

      p = bodyText.indexOf('FOOTER', p);
      assert.ok(p > 0);
    });

    it('02 - include with alt attribute, and onerror=continue', async() => {
      const response = await app.fetch('/02.html');
      assert.strictEqual(response.status, 200);

      const bodyText = await response.text();
      let p = 0;

      p = bodyText.indexOf('HEADER', p);
      assert.ok(p > 0);

      p = bodyText.indexOf('BODY', p);
      assert.ok(p > 0);
    });

    it('03 - failing include should throw error', async() => {
      const response = await app.fetch('/03.html');
      assert.strictEqual(response.status, 500);
    });

    it('04 - esi:remove, esi:comment, esi comment', async() => {
      const response = await app.fetch('/04.html');
      assert.strictEqual(response.status, 200);

      const bodyText = await response.text();
      let p = 0, p1;

      p = bodyText.indexOf('HEADER', p);
      assert.ok(p > 0);

      p = bodyText.indexOf('BODY', p);
      assert.ok(p > 0);

      p1 = bodyText.indexOf('This is a comment and should not be in the resulting stream', p);
      assert.ok(p1 < 0);

      p1 = bodyText.indexOf('This text should not end up in the resulting stream either.', p);
      assert.ok(p1 < 0);

      p = bodyText.indexOf('This is inside an ESI comment', p);
      assert.ok(p > 0);
    });

    it('05 - esi:try', async() => {
      const response = await app.fetch('/05.html');
      assert.strictEqual(response.status, 200);

      const bodyText = await response.text();
      let p = 0, p1;

      p1 = bodyText.indexOf('This include (1) should fail', p);
      assert.ok(p1 < 0);

      p = bodyText.indexOf('exception handler (1)', p);
      assert.ok(p > 0);

      p = bodyText.indexOf('This text (2)', p);
      assert.ok(p > 0);

      p1 = bodyText.indexOf('exception handler (2)', p);
      assert.ok(p1 < 0);

      p1 = bodyText.indexOf('this text (3a)', p);
      assert.ok(p1 < 0);

      p = bodyText.indexOf('exception handler (3a)', p);
      assert.ok(p > 0);

      p1 = bodyText.indexOf('exception handler (3b)', p);
      assert.ok(p1 < 0);
    });

    describe('esi variables', () => {

      it('HTTP_COOKIE makes esi:include succeed', async() => {
        const response = await app.fetch('/06.html?img=hello.jpg&alt=Hello+alt+text', {
          headers: {
            'cookie': 'foo=header'
          }
        });
        const bodyText = await response.text();

        let p = 0, p1;

        p = bodyText.indexOf('This request was for', p);
        assert.ok(p > 0);

        p = bodyText.indexOf('HEADER', p);
        assert.ok(p > 0);

        p1 = bodyText.indexOf('exception handler', p);
        assert.ok(p1 < 0);

        // noinspection HtmlUnknownTarget
        p = bodyText.indexOf('<img src="/images/hello.jpg" alt="Hello alt text" />', p);
        assert.ok(p > 0);
      });

      it('HTTP_COOKIE makes esi:include fail', async() => {
        const response = await app.fetch('/06.html', {
          headers: {
            'cookie': 'foo=header-missing'
          }
        });
        const bodyText = await response.text();

        let p = 0, p1;

        p1 = bodyText.indexOf('This request was for', p);
        assert.ok(p1 < 0);

        p1 = bodyText.indexOf('HEADER', p);
        assert.ok(p1 < 0);

        p = bodyText.indexOf('exception handler', p);
        assert.ok(p > 0);

        // noinspection HtmlUnknownTarget
        p = bodyText.indexOf('<img src="/images/" alt="" />', p);
        assert.ok(p > 0);
      });

    });

    describe('07 - esi:choose, esi:when, esi:otherwise', () => {

      it('something else + dark', async() => {
        const response = await app.fetch('/07.html');
        const bodyText = await response.text();

        let p = 0, p1;

        p1 = bodyText.indexOf('a partridge in a pear tree', p);
        assert.ok(p1 < 0);

        p1 = bodyText.indexOf('two turtle doves', p);
        assert.ok(p1 < 0);

        p = bodyText.indexOf('something else', p);
        assert.ok(p > 0);

        p = bodyText.indexOf('Nesting', p);
        assert.ok(p > 0);

        p1 = bodyText.indexOf('very bright', p);
        assert.ok(p1 < 0);

        p1 = bodyText.indexOf('kinda bright', p);
        assert.ok(p1 < 0);

        p = bodyText.indexOf('dark', p);
        assert.ok(p > 0);
      });

      it('query with foo', async() => {
        const response = await app.fetch('/07.html?foo=1');
        const bodyText = await response.text();

        let p = 0;

        p = bodyText.indexOf('a partridge in a pear tree', p);
        assert.ok(p > 0);

        p = bodyText.indexOf('Nesting', p);
        assert.ok(p > 0);
      });

      it('brightness 40', async() => {
        const response = await app.fetch('/07.html?brightness=40');
        const bodyText = await response.text();

        let p = 0;

        p = bodyText.indexOf('kinda bright', p);
        assert.ok(p > 0);
      });

      it('brightness 70, drills into nested esi:choose!', async() => {
        const response = await app.fetch('/07.html?brightness=70', {
          headers: {
            'accept-language': 'ja, en',
          }
        });
        const bodyText = await response.text();

        let p = 0;

        p = bodyText.indexOf('very bright', p);
        assert.ok(p > 0);

        p = bodyText.indexOf('English', p);
        assert.ok(p > 0);
      });

    });

  });

});
