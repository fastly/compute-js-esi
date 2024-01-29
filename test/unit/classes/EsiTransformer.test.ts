// noinspection DuplicatedCode,HttpUrlsUsage

/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';

import EsiTransformer, {
  EsiIncludeError,
  EsiIncludeResult,
  EsiStructureError,
  HandleIncludeErrorEvent
} from "../../../src/EsiTransformer.js";
import { XmlDocument, XmlElement } from "../../../src/XmlModel.js";
import StreamerState from "../../../src/StreamerState.js";
import { IEsiVariables } from "../../../src/EsiVariables.js";

describe('EsiTransformer', () => {

  it('Exposes esiTransformer namespace', () => {

    // noinspection HttpUrlsUsage
    assert.strictEqual(EsiTransformer.namespace, 'http://www.edge-delivery.org/esi/1.0');

  });

  it('Constructor copies URL', () => {

    const url = new URL('https://www.example.com/foo?bar=baz');
    const esiTransformer = new EsiTransformer(url);

    assert.strictEqual(String(esiTransformer.url), String(url));

  });

  it('constructor stores options', () => {

    const url = new URL('https://www.example.com/foo?bar=baz');
    const options = {};
    const esiTransformer = new EsiTransformer(url, undefined, options);

    assert.strictEqual(esiTransformer.options, options);

  });

  it('constructor creates default options if not specified', () => {

    const url = new URL('https://www.example.com/foo?bar=baz');
    const esiTransformer = new EsiTransformer(url);

    assert.notEqual(esiTransformer.options, null);

  });

  describe('EsiTransformer#transformElementNode', () => {

    it('passes strings directly through', async () => {

      const url = new URL('https://www.example.com/foo?bar=baz');
      const esiTransformer = new EsiTransformer(url);

      const result = await esiTransformer.transformElementNode('foo');

      assert.strictEqual(result, 'foo');

    });

    it('passes unknown XML tags directly through', async () => {

      const url = new URL('https://www.example.com/foo?bar=baz');
      const esiTransformer = new EsiTransformer(url);

      const document = new XmlDocument();

      const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:foo': 'nsfoo' }, [
        'asdf',
        new XmlElement(document, 'foo:hoge', null, [
          new XmlElement(document, 'div', null, [ 'hi' ]),
          new XmlElement(document, 'div', null, [ 'ho' ]),
        ]),
        'jkl;'
      ]);

      html.applyNamespaces();

      const result = await esiTransformer.transformElementNode(html);

      assert.ok(result instanceof XmlElement);
      assert.strictEqual(result.localFullname, 'html');
      assert.strictEqual(result.namespace, 'nshtml');
      assert.strictEqual(result.children.length, 3);

      assert.strictEqual(result.children[0], 'asdf');

      assert.ok(result.children[1] instanceof XmlElement);
      assert.strictEqual(result.children[1].localFullname, 'foo:hoge');
      assert.strictEqual(result.children[1].namespace, 'nsfoo');
      assert.strictEqual(result.children[1].children.length, 2);
      assert.ok(result.children[1].children[0] instanceof XmlElement);
      assert.strictEqual(result.children[1].children[0].localFullname, 'div');
      assert.strictEqual(result.children[1].children[0].namespace, 'nshtml');
      assert.strictEqual(result.children[1].children[0].children.length, 1);
      assert.strictEqual(result.children[1].children[0].children[0], 'hi');
      assert.ok(result.children[1].children[1] instanceof XmlElement);
      assert.strictEqual(result.children[1].children[1].localFullname, 'div');
      assert.strictEqual(result.children[1].children[1].namespace, 'nshtml');
      assert.strictEqual(result.children[1].children[1].children.length, 1);
      assert.strictEqual(result.children[1].children[1].children[0], 'ho');

      assert.strictEqual(result.children[2], 'jkl;');

    });

    describe('esi:comment', () => {

      it('simply removes the node', async () => {

        const url = new URL('https://www.example.com/foo?bar=baz');
        const esiTransformer = new EsiTransformer(url);

        const document = new XmlDocument();

        const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
          'asdf',
          new XmlElement(document, 'esi:comment', { 'text': 'hi, ho, hello' }),
          'jkl;'
        ]);

        html.applyNamespaces();

        const result = await esiTransformer.transformElementNode(html);

        assert.ok(result instanceof XmlElement);
        assert.strictEqual(result.localFullname, 'html');
        assert.strictEqual(result.namespace, 'nshtml');
        assert.strictEqual(result.children.length, 2);

        assert.strictEqual(result.children[0], 'asdf');
        assert.strictEqual(result.children[1], 'jkl;');

      });

    });

    describe('esi:remove', () => {

      it('simply removes the node (and children)', async () => {

        const url = new URL('https://www.example.com/foo?bar=baz');
        const esiTransformer = new EsiTransformer(url);

        const document = new XmlDocument();

        const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
          'asdf',
          new XmlElement(document, 'esi:remove', null, [
            new XmlElement(document, 'div', null, [ 'hi' ]),
            new XmlElement(document, 'div', null, [ 'ho' ]),
          ]),
          'jkl;'
        ]);

        html.applyNamespaces();

        const result = await esiTransformer.transformElementNode(html);

        assert.ok(result instanceof XmlElement);
        assert.strictEqual(result.localFullname, 'html');
        assert.strictEqual(result.namespace, 'nshtml');
        assert.strictEqual(result.children.length, 2);

        assert.strictEqual(result.children[0], 'asdf');
        assert.strictEqual(result.children[1], 'jkl;');

      });

    });

    describe('esi:include', () => {

      it('calls include handler and inlines src document', async () => {

        async function fetch(req: RequestInfo, init?: RequestInit) {
          const r = new Request(req, init);
          if (r.url === 'https://www.example.com/templates/header.html') {
            return new Response('handle-include-called');
          }

          return new Response(null, { status: 404 });
        }

        const url = new URL('https://www.example.com/foo?bar=baz');
        const esiTransformer = new EsiTransformer(url, undefined, { fetch });

        const document = new XmlDocument();

        const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
          'asdf',
          new XmlElement(document, 'esi:include', { 'src': '/templates/header.html' }),
          'jkl;'
        ]);

        html.applyNamespaces();

        const result = await esiTransformer.transformElementNode(html);

        assert.ok(result instanceof XmlElement);
        assert.strictEqual(result.localFullname, 'html');
        assert.strictEqual(result.namespace, 'nshtml');
        assert.strictEqual(result.children.length, 3);

        assert.strictEqual(result.children[0], 'asdf');
        assert.strictEqual(result.children[1], 'handle-include-called');
        assert.strictEqual(result.children[2], 'jkl;');

      });

      it('calls include handler and inlines src document applying string replacements', async () => {

        async function fetch(req: RequestInfo, init?: RequestInit) {
          const r = new Request(req, init);
          if (r.url === 'https://www.example.com/templates/baz.html') {
            return new Response('baz');
          }

          return new Response(null, { status: 404 });
        }

        const url = new URL('https://www.example.com/foo?bar=baz');
        const vars: IEsiVariables = {
          getValue(name: string, subKey: string | null): string | undefined {
            if (name === 'QUERY_STRING' && subKey === 'bar') {
              return "'baz'";
            }
            return undefined;
          }
        };
        const esiTransformer = new EsiTransformer(url, undefined, { fetch, vars });

        const document = new XmlDocument();

        const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
          'asdf',
          new XmlElement(document, 'esi:include', { 'src': '/templates/$(QUERY_STRING{bar}).html' }),
          'jkl;'
        ]);

        html.applyNamespaces();

        const result = await esiTransformer.transformElementNode(html);

        assert.ok(result instanceof XmlElement);
        assert.strictEqual(result.localFullname, 'html');
        assert.strictEqual(result.namespace, 'nshtml');
        assert.strictEqual(result.children.length, 3);

        assert.strictEqual(result.children[0], 'asdf');
        assert.strictEqual(result.children[1], 'baz');
        assert.strictEqual(result.children[2], 'jkl;');

      });

      it('calls include handler and inlines alt document when src fails', async () => {

        async function fetch(req: RequestInfo | URL, init?: RequestInit) {
          const r = new Request(req, init);
          if (r.url === 'https://www.example.com/templates/header-alt.html') {
            return new Response('handle-include-alt-called');
          }

          return new Response(null, { status: 404 });
        }

        const url = new URL('https://www.example.com/foo?bar=baz');
        const esiTransformer = new EsiTransformer(url, undefined, { fetch });

        const document = new XmlDocument();

        const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
          'asdf',
          new XmlElement(document, 'esi:include', { 'src': '/templates/header.html', 'alt': '/templates/header-alt.html' }),
          'jkl;'
        ]);

        html.applyNamespaces();

        const result = await esiTransformer.transformElementNode(html);

        assert.ok(result instanceof XmlElement);
        assert.strictEqual(result.localFullname, 'html');
        assert.strictEqual(result.namespace, 'nshtml');
        assert.strictEqual(result.children.length, 3);

        assert.strictEqual(result.children[0], 'asdf');
        assert.strictEqual(result.children[1], 'handle-include-alt-called');
        assert.strictEqual(result.children[2], 'jkl;');

      });

      it('calls include handler and removes the node if src and alt both fail and onerror has continue value', async () => {

        async function fetch() {
          return new Response(null, { status: 404 });
        }

        const url = new URL('https://www.example.com/foo?bar=baz');
        const esiTransformer = new EsiTransformer(url, undefined, { fetch });

        const document = new XmlDocument();

        const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
          'asdf',
          new XmlElement(document, 'esi:include', { 'src': '/templates/header.html', 'alt': '/templates/header-alt.html', 'onerror': 'continue' }),
          'jkl;'
        ]);

        html.applyNamespaces();

        const result = await esiTransformer.transformElementNode(html);

        assert.ok(result instanceof XmlElement);
        assert.strictEqual(result.localFullname, 'html');
        assert.strictEqual(result.namespace, 'nshtml');
        assert.strictEqual(result.children.length, 2);

        assert.strictEqual(result.children[0], 'asdf');
        assert.strictEqual(result.children[1], 'jkl;');

      });

      it('calls include handler and throws if src and alt both fail', async () => {

        async function fetch() {
          return new Response(null, { status: 404 });
        }

        const url = new URL('https://www.example.com/foo?bar=baz');
        const esiTransformer = new EsiTransformer(url, undefined, { fetch });

        const document = new XmlDocument();

        const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
          'asdf',
          new XmlElement(document, 'esi:include', { 'src': '/templates/header.html', 'alt': '/templates/header-alt.html' }),
          'jkl;'
        ]);

        html.applyNamespaces();

        const includeEl = html.children[1];

        await assert.rejects(
          async () => {
            await esiTransformer.transformElementNode(html);
          },
          (err) => {
            assert.ok(err instanceof EsiIncludeError);
            assert.strictEqual(err.el, includeEl);
            return true;
          });

      });

      it('allows handleIncludeError to produce an error', async () => {

        async function fetch() {
          return new Response(null, { status: 404 });
        }

        function handleIncludeError(event: HandleIncludeErrorEvent) {
          const src = event.el.props['src'].value;
          if (src === '/templates/header.html') {
            event.customErrorString = 'header';
          }
        }

        const url = new URL('https://www.example.com/foo?bar=baz');
        const esiTransformer = new EsiTransformer(url, undefined, { fetch, handleIncludeError });

        const document = new XmlDocument();

        const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
          'asdf',
          new XmlElement(document, 'esi:include', { 'src': '/templates/header.html' }),
          'jkl;'
        ]);

        html.applyNamespaces();

        await esiTransformer.transformElementNode(html);

        assert.strictEqual(html.children[1], 'header');

      });

      it('allows for handleIncludeError to cause an EsiIncludeError by doing nothing', async () => {

        async function fetch() {
          return new Response(null, { status: 404 });
        }

        function handleIncludeError() {}

        const url = new URL('https://www.example.com/foo?bar=baz');
        const esiTransformer = new EsiTransformer(url, undefined, { fetch, handleIncludeError });

        const document = new XmlDocument();

        const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
          'asdf',
          new XmlElement(document, 'esi:include', { 'src': '/templates/footer.html' }),
          'jkl;'
        ]);

        html.applyNamespaces();

        const includeEl = html.children[1];

        await assert.rejects(
          async () => {
            await esiTransformer.transformElementNode(html);
          },
          (err) => {
            assert.ok(err instanceof EsiIncludeError);
            assert.strictEqual(err.el, includeEl);
            return true;
          });

      });

      it('allows processIncludeResponse to produce a custom output from a response', async () => {

        async function fetch(req: RequestInfo | URL, init?: RequestInit) {
          const r = new Request(req, init);
          if (r.url === 'https://www.example.com/templates/header.html') {
            return new Response('header-text');
          }

          return new Response(null, { status: 404 });
        }

        async function processIncludeResponse(esiIncludeResult: EsiIncludeResult) {
          return 'processed[' + await esiIncludeResult.res.text() + ']';
        }

        const url = new URL('https://www.example.com/foo?bar=baz');
        const esiTransformer = new EsiTransformer(url, undefined, { fetch, processIncludeResponse });

        const document = new XmlDocument();

        const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
          new XmlElement(document, 'esi:include', { 'src': '/templates/header.html' }),
        ]);

        html.applyNamespaces();

        const result = await esiTransformer.transformElementNode(html);

        assert.ok(result instanceof XmlElement);
        assert.strictEqual(result.children[0], 'processed[header-text]');

      });

    });

    describe('esi:try / esi:attempt / esi.except', () => {

      describe('structure', () => {

        it('esi:try requires exactly one attempt tag as a direct child', async() => {

          const url = new URL('https://www.example.com/foo?bar=baz');
          const esiTransformer = new EsiTransformer(url);

          const document = new XmlDocument();

          const html1 = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
            'asdf',
            new XmlElement(document, 'esi:try'),
            'jkl;'
          ]);

          html1.applyNamespaces();

          const tryEl1 = html1.children[1];

          await assert.rejects(
            async() => {
              await esiTransformer.transformElementNode(html1);
            },
            (err) => {
              assert.ok(err instanceof EsiStructureError);
              assert.strictEqual(err.message, 'esi:try requires exactly one esi:attempt tag as a direct child');
              assert.strictEqual(err.el, tryEl1);
              return true;
            }
          );

          const html2 = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
            'asdf',
            new XmlElement(document, 'esi:try', null, [
              new XmlElement(document, 'esi:attempt'),
              new XmlElement(document, 'esi:attempt'),
            ]),
            'jkl;'
          ]);

          html2.applyNamespaces();

          const tryEl2 = html2.children[1];

          await assert.rejects(
            async() => {
              await esiTransformer.transformElementNode(html2);
            },
            (err) => {
              assert.ok(err instanceof EsiStructureError);
              assert.strictEqual(err.message, 'esi:try requires exactly one esi:attempt tag as a direct child');
              assert.strictEqual(err.el, tryEl2);
              return true;
            }
          );

        });

        it('esi:try requires exactly one except tag as a direct child', async() => {

          const url = new URL('https://www.example.com/foo?bar=baz');
          const esiTransformer = new EsiTransformer(url);

          const document = new XmlDocument();

          const html1 = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
            'asdf',
            new XmlElement(document, 'esi:try', null, [
              new XmlElement(document, 'esi:attempt'),
            ]),
            'jkl;'
          ]);

          html1.applyNamespaces();

          const tryEl1 = html1.children[1];

          await assert.rejects(
            async() => {
              await esiTransformer.transformElementNode(html1);
            },
            (err) => {
              assert.ok(err instanceof EsiStructureError);
              assert.strictEqual(err.message, 'esi:try requires exactly one esi:except tag as a direct child');
              assert.strictEqual(err.el, tryEl1);
              return true;
            }
          );

          const html2 = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
            'asdf',
            new XmlElement(document, 'esi:try', null, [
              new XmlElement(document, 'esi:attempt'),
              new XmlElement(document, 'esi:except'),
              new XmlElement(document, 'esi:except'),
            ]),
            'jkl;'
          ]);

          html2.applyNamespaces();

          const tryEl2 = html2.children[1];

          await assert.rejects(
            async() => {
              await esiTransformer.transformElementNode(html2);
            },
            (err) => {
              assert.ok(err instanceof EsiStructureError);
              assert.strictEqual(err.message, 'esi:try requires exactly one esi:except tag as a direct child');
              assert.strictEqual(err.el, tryEl2);
              return true;
            }
          );

        });

        it('esi:attempt can\'t appear at lop level', async() => {

          const url = new URL('https://www.example.com/foo?bar=baz');
          const esiTransformer = new EsiTransformer(url);

          const document = new XmlDocument();

          const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
            new XmlElement(document, 'esi:attempt'),
          ]);

          html.applyNamespaces();

          const el = html.children[0];

          await assert.rejects(
            async() => {
              await esiTransformer.transformElementNode(html);
            },
            (err) => {
              assert.ok(err instanceof EsiStructureError);
              assert.strictEqual(err.message, 'esi:attempt must be direct child of esi:try');
              assert.strictEqual(err.el, el);
              return true;
            }
          );

        });

        it('esi:except can\'t appear at lop level', async() => {

          const url = new URL('https://www.example.com/foo?bar=baz');
          const esiTransformer = new EsiTransformer(url);

          const document = new XmlDocument();

          const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
            new XmlElement(document, 'esi:except'),
          ]);

          html.applyNamespaces();

          const el = html.children[0];

          await assert.rejects(
            async() => {
              await esiTransformer.transformElementNode(html);
            },
            (err) => {
              assert.ok(err instanceof EsiStructureError);
              assert.strictEqual(err.message, 'esi:except must be direct child of esi:try');
              assert.strictEqual(err.el, el);
              return true;
            }
          );

        });

      });

      describe('Basic functionality', () => {

        it('esi:try evaluates to contents of esi:attempt so long as no error occurs', async() => {

          async function fetch(req: RequestInfo, init?: RequestInit) {
            const r = new Request(req, init);
            if (r.url === 'https://www.example.com/templates/header.html') {
              return new Response('foo');
            }

            return new Response(null, { status: 404 });
          }

          const url = new URL('https://www.example.com/foo?bar=baz');
          const esiTransformer = new EsiTransformer(url, undefined, { fetch });

          const document = new XmlDocument();

          const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
            'asdf',
            new XmlElement(document, 'esi:try', null, [
              new XmlElement(document, 'esi:attempt', null, [
                'hoge',
                new XmlElement(document, 'esi:include', { 'src': '/templates/header.html' }),
                'piyo',
              ]),
              new XmlElement(document, 'esi:except', null, [
                'bar',
              ]),
            ]),
            'jkl;'
          ]);

          html.applyNamespaces();

          const result = await esiTransformer.transformElementNode(html);

          assert.ok(result instanceof XmlElement);
          assert.strictEqual(result.localFullname, 'html');
          assert.strictEqual(result.namespace, 'nshtml');
          assert.strictEqual(result.children.length, 5);

          assert.strictEqual(result.children[0], 'asdf');
          assert.strictEqual(result.children[1], 'hoge');
          assert.strictEqual(result.children[2], 'foo');
          assert.strictEqual(result.children[3], 'piyo');
          assert.strictEqual(result.children[4], 'jkl;');

        });

        it('esi:try evaluates to contents of esi:attempt when onerror="continue"', async() => {

          async function fetch(req: RequestInfo, init?: RequestInit) {
            const r = new Request(req, init);
            if (r.url === 'https://www.example.com/templates/header.html') {
              return new Response('foo');
            }

            return new Response(null, { status: 404 });
          }

          const url = new URL('https://www.example.com/foo?bar=baz');
          const esiTransformer = new EsiTransformer(url, undefined, { fetch });

          const document = new XmlDocument();

          const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
            'asdf',
            new XmlElement(document, 'esi:try', null, [
              new XmlElement(document, 'esi:attempt', null, [
                'hoge',
                new XmlElement(document, 'esi:include', { 'src': '/templates/header-2.html', 'onerror': 'continue' }),
                'piyo',
              ]),
              new XmlElement(document, 'esi:except', null, [
                'bar',
              ]),
            ]),
            'jkl;'
          ]);

          html.applyNamespaces();

          const result = await esiTransformer.transformElementNode(html);

          assert.ok(result instanceof XmlElement);
          assert.strictEqual(result.localFullname, 'html');
          assert.strictEqual(result.namespace, 'nshtml');
          assert.strictEqual(result.children.length, 4);

          assert.strictEqual(result.children[0], 'asdf');
          assert.strictEqual(result.children[1], 'hoge');
          assert.strictEqual(result.children[2], 'piyo');
          assert.strictEqual(result.children[3], 'jkl;');

        });

        it('esi:try evaluates to contents of esi:except if attempt causes error', async() => {

          async function fetch() {
            return new Response(null, { status: 404 });
          }

          const url = new URL('https://www.example.com/foo?bar=baz');
          const esiTransformer = new EsiTransformer(url, undefined, { fetch });

          const document = new XmlDocument();

          const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
            'asdf',
            new XmlElement(document, 'esi:try', null, [
              new XmlElement(document, 'esi:attempt', null, [
                'hoge',
                new XmlElement(document, 'esi:include', { 'src': '/templates/header.html' }),
                'piyo',
              ]),
              new XmlElement(document, 'esi:except', null, [
                'bar',
              ]),
            ]),
            'jkl;'
          ]);

          html.applyNamespaces();

          const result = await esiTransformer.transformElementNode(html);

          assert.ok(result instanceof XmlElement);
          assert.strictEqual(result.localFullname, 'html');
          assert.strictEqual(result.namespace, 'nshtml');
          assert.strictEqual(result.children.length, 3);

          assert.strictEqual(result.children[0], 'asdf');
          assert.strictEqual(result.children[1], 'bar');
          assert.strictEqual(result.children[2], 'jkl;');

        });

      });

      describe('Nested case', () => {

        let esiTransformer: EsiTransformer;
        let document: XmlDocument;

        before(() => {
          async function fetch(req: RequestInfo, init?: RequestInit) {
            const r = new Request(req, init);
            if (r.url === 'https://www.example.com/templates/header.html') {
              return new Response('#header');
            }
            if (r.url === 'https://www.example.com/templates/footer.html') {
              return new Response('#footer');
            }
            return new Response(null, { status: 404 });
          }

          const url = new URL('https://www.example.com/foo?bar=baz');
          esiTransformer = new EsiTransformer(url, undefined, { fetch });

          document = new XmlDocument();
        });

        it('works when outer except is not triggered', async() => {

          const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
            'asdf',
            new XmlElement(document, 'esi:try', null, [
              new XmlElement(document, 'esi:attempt', null, [
                new XmlElement(document, 'esi:try', null, [
                  new XmlElement(document, 'esi:attempt', null, [
                    new XmlElement(document, 'esi:include', { 'src': '/templates/header-2.html' }),
                  ]),
                  new XmlElement(document, 'esi:except', null, [
                    new XmlElement(document, 'esi:include', { 'src': '/templates/header.html' }),
                  ]),
                ]),
              ]),
              new XmlElement(document, 'esi:except', null, [
                'bar',
              ]),
            ]),
            'jkl;'
          ]);

          html.applyNamespaces();

          const result = await esiTransformer.transformElementNode(html);

          assert.ok(result instanceof XmlElement);
          assert.strictEqual(result.localFullname, 'html');
          assert.strictEqual(result.namespace, 'nshtml');
          assert.strictEqual(result.children.length, 3);

          assert.strictEqual(result.children[0], 'asdf');
          assert.strictEqual(result.children[1], '#header');
          assert.strictEqual(result.children[2], 'jkl;');

        });

        it('works when outer except is triggered', async() => {

          const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
            'asdf',
            new XmlElement(document, 'esi:try', null, [
              new XmlElement(document, 'esi:attempt', null, [
                new XmlElement(document, 'esi:try', null, [
                  new XmlElement(document, 'esi:attempt', null, [
                    new XmlElement(document, 'esi:include', { 'src': '/templates/header-2.html' }),
                  ]),
                  new XmlElement(document, 'esi:except', null, [
                    new XmlElement(document, 'esi:include', { 'src': '/templates/header-3.html' }),
                  ]),
                ]),
              ]),
              new XmlElement(document, 'esi:except', null, [
                'bar',
              ]),
            ]),
            'jkl;'
          ]);

          html.applyNamespaces();

          const result = await esiTransformer.transformElementNode(html);

          assert.ok(result instanceof XmlElement);
          assert.strictEqual(result.localFullname, 'html');
          assert.strictEqual(result.namespace, 'nshtml');
          assert.strictEqual(result.children.length, 3);

          assert.strictEqual(result.children[0], 'asdf');
          assert.strictEqual(result.children[1], 'bar');
          assert.strictEqual(result.children[2], 'jkl;');

        });

      });

    });

    describe('esi:vars', () => {

      const document = new XmlDocument();
      const url = new URL('https://www.example.com/foo?bar=baz');
      const vars: IEsiVariables = {
        getValue(name: string, subKey: string | null): string | undefined {
          if (name === 'FOO' && subKey === null) {
            return "'foo'";
          }
          if (name === 'BAR' && subKey === 'baz') {
            return "'baz'";
          }
          return undefined;
        }
      };
      const esiTransformer = new EsiTransformer(url, undefined, { vars });

      it('outside esi:vars, the variable syntax does nothing', async() => {

        const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
          'asdf$(FOO)<div class="$(BAR{baz})">oy</div>',
        ]);

        html.applyNamespaces();

        const result = await esiTransformer.transformElementNode(html);

        assert.ok(result instanceof XmlElement);
        assert.strictEqual(result.localFullname, 'html');
        assert.strictEqual(result.namespace, 'nshtml');
        assert.strictEqual(result.children.length, 1);

        assert.strictEqual(result.children[0], 'asdf$(FOO)<div class="$(BAR{baz})">oy</div>');

      });

      it('in esi:vars, the variable syntax applies', async() => {

        const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
          new XmlElement(document, 'esi:vars', null, [
            'asdf$(FOO)<div class="$(BAR{baz})">oy</div>',
          ]),
        ]);

        html.applyNamespaces();

        const result = await esiTransformer.transformElementNode(html);

        assert.ok(result instanceof XmlElement);
        assert.strictEqual(result.localFullname, 'html');
        assert.strictEqual(result.namespace, 'nshtml');
        assert.strictEqual(result.children.length, 1);

        assert.strictEqual(result.children[0], 'asdffoo<div class="baz">oy</div>');

      });

    });

    describe('esi:choose / esi:when / esi:otherwise', () => {

      const document = new XmlDocument();
      const url = new URL('https://www.example.com/foo?bar=baz');
      const vars: IEsiVariables = {
        getValue(name: string, subKey: string | null): string | undefined {
          if (name === 'FOO' && subKey === null) {
            return "'foo'";
          }
          if (name === 'BAR' && subKey === 'baz') {
            return "'baz'";
          }
          return undefined;
        }
      };
      const esiTransformer = new EsiTransformer(url, undefined, { vars });

      it('esi:when cannot appear at the top level', async() => {

        const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
          'asdf',
          new XmlElement(document, 'esi:when'),
          'jkl;'
        ]);
        html.applyNamespaces();

        await assert.rejects(async() => {
          await esiTransformer.transformElementNode(html);
        }, (ex) => {
          assert.ok(ex instanceof EsiStructureError);
          assert.strictEqual(ex.message, 'esi:when must be direct child of esi:choose');
          return true;
        });

      });

      it('esi:otherwise cannot appear at the top level', async() => {

        const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
          'asdf',
          new XmlElement(document, 'esi:otherwise'),
          'jkl;'
        ]);
        html.applyNamespaces();

        await assert.rejects(async() => {
          await esiTransformer.transformElementNode(html);
        }, (ex) => {
          assert.ok(ex instanceof EsiStructureError);
          assert.strictEqual(ex.message, 'esi:otherwise must be direct child of esi:choose');
          return true;
        });

      });

      it('esi:choose cannot appear without at least one child esi:when', async() => {

        const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
          'asdf',
          new XmlElement(document, 'esi:choose'),
          'jkl;'
        ]);
        html.applyNamespaces();

        await assert.rejects(async() => {
          await esiTransformer.transformElementNode(html);
        }, (ex) => {
          assert.ok(ex instanceof EsiStructureError);
          assert.strictEqual(ex.message, 'esi:choose must have at least one esi:when as direct child');
          return true;
        });

      });

      it('esi:choose may appear with more than one child esi:when', async() => {

        const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
          'asdf',
          new XmlElement(document, 'esi:choose', null, [
            new XmlElement(document, 'esi:when', { 'test': '1==1' }),
            new XmlElement(document, 'esi:when', { 'test': '1==1' }),
            new XmlElement(document, 'esi:when', { 'test': '1==1' }),
          ]),
          'jkl;'
        ]);
        html.applyNamespaces();

        await esiTransformer.transformElementNode(html);
      });

      it('esi:choose may appear with one child esi:otherwise', async() => {

        const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
          'asdf',
          new XmlElement(document, 'esi:choose', null, [
            new XmlElement(document, 'esi:when', { 'test': '1==1' }),
            new XmlElement(document, 'esi:otherwise'),
          ]),
          'jkl;'
        ]);
        html.applyNamespaces();

        await esiTransformer.transformElementNode(html);

      });

      it('esi:choose cannot appear with more than one child esi:otherwise', async() => {

        const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
          'asdf',
          new XmlElement(document, 'esi:choose', null, [
            new XmlElement(document, 'esi:when', { 'test': '1==1' }),
            new XmlElement(document, 'esi:otherwise'),
            new XmlElement(document, 'esi:otherwise'),
          ]),
          'jkl;'
        ]);
        html.applyNamespaces();

        await assert.rejects(async() => {
          await esiTransformer.transformElementNode(html);
        }, (ex) => {
          assert.ok(ex instanceof EsiStructureError);
          assert.strictEqual(ex.message, 'esi:choose must not have more than one esi:otherwise');
          return true;
        });

      });

      it('if when condition is true, resolves to it', async() => {

        const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
          'asdf',
          new XmlElement(document, 'esi:choose', null, [
            new XmlElement(document, 'esi:when', { 'test': "$(FOO)=='foo'" }, [
              'foo',
            ]),
            new XmlElement(document, 'esi:otherwise', null, [
              'bar',
            ]),
          ]),
          'jkl;'
        ]);
        html.applyNamespaces();

        const result = await esiTransformer.transformElementNode(html);

        assert.ok(result instanceof XmlElement);
        assert.strictEqual(result.localFullname, 'html');
        assert.strictEqual(result.namespace, 'nshtml');
        assert.strictEqual(result.children.length, 3);

        assert.strictEqual(result.children[0], 'asdf');
        assert.strictEqual(result.children[1], 'foo');
        assert.strictEqual(result.children[2], 'jkl;');

      });

      it('if more than one when condition is present, resolves to first one that is true', async() => {

        const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
          'asdf',
          new XmlElement(document, 'esi:choose', null, [
            new XmlElement(document, 'esi:when', { 'test': "$(FOO)=='bar'" }, [
              'result=1',
            ]),
            new XmlElement(document, 'esi:when', { 'test': "$(FOO)=='foo'" }, [
              'result=2',
            ]),
            new XmlElement(document, 'esi:when', { 'test': "$(FOO)=='foo'" }, [
              'result=3',
            ]),
            new XmlElement(document, 'esi:otherwise', null, [
              'result=4',
            ]),
          ]),
          'jkl;'
        ]);
        html.applyNamespaces();

        const result = await esiTransformer.transformElementNode(html);

        assert.ok(result instanceof XmlElement);
        assert.strictEqual(result.localFullname, 'html');
        assert.strictEqual(result.namespace, 'nshtml');
        assert.strictEqual(result.children.length, 3);

        assert.strictEqual(result.children[0], 'asdf');
        assert.strictEqual(result.children[1], 'result=2');
        assert.strictEqual(result.children[2], 'jkl;');

      });

      it('if no when condition is true, resolves to otherwise', async() => {

        const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
          'asdf',
          new XmlElement(document, 'esi:choose', null, [
            new XmlElement(document, 'esi:when', { 'test': "$(FOO)=='bar'" }, [
              'bar',
            ]),
            new XmlElement(document, 'esi:when', { 'test': "$(FOO)=='baz'" }, [
              'baz',
            ]),
            new XmlElement(document, 'esi:otherwise', null, [
              'otherwise',
            ]),
          ]),
          'jkl;'
        ]);
        html.applyNamespaces();

        const result = await esiTransformer.transformElementNode(html);

        assert.ok(result instanceof XmlElement);
        assert.strictEqual(result.localFullname, 'html');
        assert.strictEqual(result.namespace, 'nshtml');
        assert.strictEqual(result.children.length, 3);

        assert.strictEqual(result.children[0], 'asdf');
        assert.strictEqual(result.children[1], 'otherwise');
        assert.strictEqual(result.children[2], 'jkl;');

      });

      it('if no when condition is not true, and no otherwise is present, node is simply removed', async() => {

        const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:esi': 'http://www.edge-delivery.org/esi/1.0' }, [
          'asdf',
          new XmlElement(document, 'esi:choose', null, [
            new XmlElement(document, 'esi:when', { 'test': "$(FOO)=='bar'" }, [
              'bar',
            ]),
            new XmlElement(document, 'esi:when', { 'test': "$(FOO)=='baz'" }, [
              'baz',
            ]),
          ]),
          'jkl;'
        ]);
        html.applyNamespaces();

        const result = await esiTransformer.transformElementNode(html);

        assert.ok(result instanceof XmlElement);
        assert.strictEqual(result.localFullname, 'html');
        assert.strictEqual(result.namespace, 'nshtml');
        assert.strictEqual(result.children.length, 2);

        assert.strictEqual(result.children[0], 'asdf');
        assert.strictEqual(result.children[1], 'jkl;');

      });

    });

  });

  describe('EsiTransformer#xmlStreamerBeforeProcess', () => {

    it('streams right through for normal strings', () => {

      const streamerState = new StreamerState('Hello, world!');

      const url = new URL('https://www.example.com/foo?bar=baz');
      const esiTransformer = new EsiTransformer(url);

      esiTransformer.xmlStreamerBeforeProcess(streamerState);

      assert.strictEqual(streamerState.bufferedString, 'Hello, world!');
      assert.strictEqual(streamerState.postponedString, undefined);

    });

    it('removes "<!--esi" and "-->" in input string', () => {

      const streamerState = new StreamerState('He-->llo, <!--esi world! <!--esi -->');

      const url = new URL('https://www.example.com/foo?bar=baz');
      const esiTransformer = new EsiTransformer(url);

      esiTransformer.xmlStreamerBeforeProcess(streamerState);

      assert.ok(!esiTransformer.isInEsiComment);
      assert.strictEqual(streamerState.bufferedString, 'He-->llo,  world! <!--esi ');
      assert.strictEqual(streamerState.postponedString, undefined);

    });

    it('removes "<!--esi" and "-->" in chunked strings', () => {

      const streamerState = new StreamerState('<!--esi yo');

      const url = new URL('https://www.example.com/foo?bar=baz');
      const esiTransformer = new EsiTransformer(url);

      esiTransformer.xmlStreamerBeforeProcess(streamerState);

      assert.ok(esiTransformer.isInEsiComment);
      assert.strictEqual(streamerState.bufferedString, ' yo');
      assert.strictEqual(streamerState.postponedString, undefined);

      streamerState.bufferedString = '';
      streamerState.append(' hi ho --> foo bar --><!-');
      esiTransformer.xmlStreamerBeforeProcess(streamerState);

      assert.ok(!esiTransformer.isInEsiComment);
      assert.strictEqual(streamerState.bufferedString, ' hi ho  foo bar -->');
      assert.strictEqual(streamerState.postponedString, '<!-');

      streamerState.bufferedString = '';
      streamerState.append('-esi baz --> asdf jkl; <!-');
      esiTransformer.xmlStreamerBeforeProcess(streamerState);

      assert.ok(!esiTransformer.isInEsiComment);
      assert.strictEqual(streamerState.bufferedString, ' baz  asdf jkl; ');
      assert.strictEqual(streamerState.postponedString, '<!-');

      streamerState.bufferedString = '';
      streamerState.append('- 12345 --> <!-- <!--esi fff -->');
      esiTransformer.xmlStreamerBeforeProcess(streamerState);

      assert.ok(!esiTransformer.isInEsiComment);
      assert.strictEqual(streamerState.bufferedString, '<!-- 12345 --> <!--  fff ');
      assert.strictEqual(streamerState.postponedString, undefined);

    });

  });

});
