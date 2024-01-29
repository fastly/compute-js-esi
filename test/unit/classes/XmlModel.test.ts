// noinspection DuplicatedCode, HtmlRequiredLangAttribute, HtmlUnknownAttribute

/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  buildTransform,
  walkXmlElements,
  XmlDocument,
  XmlElement,
  XmlElementNode
} from "../../../src/XmlModel.js";

describe('XmlModel', () => {

  it('When constructed with no namespace defs parameter is equivalent to passing in empty object', () => {
    const documentNoDefs = new XmlDocument();
    const documentEmptyDefs = new XmlDocument({});

    assert.deepStrictEqual(documentNoDefs.namespaceDefs, documentEmptyDefs.namespaceDefs);
  });

  it('When constructed with no namespace defs parameter is equivalent to passing in empty object', () => {
    const documentNullDefs = new XmlDocument(null);
    const documentEmptyDefs = new XmlDocument({});

    assert.deepStrictEqual(documentNullDefs.namespaceDefs, documentEmptyDefs.namespaceDefs);
  });

  it('can be constructed with "allow unknown namespace prefixes" parameter, defaults to false', () => {
    const documentNoAllowUnknownNamespacePrefixes = new XmlDocument();
    const documentAllowUnknownNamespacePrefixesTrue = new XmlDocument(null, true);
    const documentAllowUnknownNamespacePrefixesFalse = new XmlDocument(null, false);

    assert.deepStrictEqual(false, documentNoAllowUnknownNamespacePrefixes.allowUnknownNamespacePrefixes);
    assert.deepStrictEqual(true, documentAllowUnknownNamespacePrefixesTrue.allowUnknownNamespacePrefixes);
    assert.deepStrictEqual(false, documentAllowUnknownNamespacePrefixesFalse.allowUnknownNamespacePrefixes);
  });

  it('Can express XML model with default namespace', () => {

    // <html xmlns="nshtml" xmlns:foo="nsfoo">
    //   <div class="foo" foo:custom="yay" />
    //   <foo:hoge />
    // </html>

    const document = new XmlDocument();

    const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:foo': 'nsfoo' }, [
      new XmlElement(document, 'div', { 'class': 'foo', 'foo:custom': 'yay' }),
      new XmlElement(document, 'foo:hoge'),
    ]);

    html.applyNamespaces();

    assert.strictEqual(html.namespace, 'nshtml');
    assert.strictEqual(html.localNamespacePrefix, null);
    assert.strictEqual(html.localName, 'html');

    const div = html.children[0];
    assert.ok(div instanceof XmlElement);
    assert.strictEqual(div.namespace, 'nshtml');
    assert.strictEqual(div.localNamespacePrefix, null);
    assert.strictEqual(div.localName, 'div');

    const classAttr = div.attrs['class'];
    assert.ok(classAttr != null);
    assert.strictEqual(classAttr.namespace, null);
    assert.strictEqual(classAttr.localName, 'class');
    assert.strictEqual(classAttr.localNamespacePrefix, null);
    assert.strictEqual(classAttr.value, 'foo');

    const fooCustomAttr = div.attrs['nsfoo|custom'];
    assert.ok(fooCustomAttr != null);
    assert.strictEqual(fooCustomAttr.namespace, 'nsfoo');
    assert.strictEqual(fooCustomAttr.localName, 'custom');
    assert.strictEqual(fooCustomAttr.localNamespacePrefix, 'foo');
    assert.strictEqual(fooCustomAttr.value, 'yay');

    const hoge = html.children[1];
    assert.ok(hoge instanceof XmlElement);
    assert.strictEqual(hoge.namespace, 'nsfoo');
    assert.strictEqual(hoge.localNamespacePrefix, 'foo');
    assert.strictEqual(hoge.localName, 'hoge');

  });

  it('Can express some simple XML models', () => {

    // assume root with xmlns:abc="nsabc"
    // <abc:foo hoge="piyo">
    //   <def:bar xmlns:def="nsdef" abc:def="abcdef" />
    //   text
    // </abc:foo>

    const document = new XmlDocument({
      'abc': 'nsabc',
    });

    const foo = new XmlElement(document, 'abc:foo', { 'hoge': 'piyo' }, [
      new XmlElement(document, 'def:bar', { 'xmlns:def': 'nsdef', 'abc:def': 'abcdef' }, null),
      'text'
    ]);

    foo.applyNamespaces();

    assert.strictEqual(foo.namespace, 'nsabc');
    assert.strictEqual(foo.localNamespacePrefix, 'abc');
    assert.strictEqual(foo.localName, 'foo');

  });

  it('Dies when it encounters unknown namespace allowUnknownNamespacePrefixes is not specified', () => {

    // assume root with xmlns:abc="nsabc"
    // <abc:foo>
    //   <def:bar />
    // </abc:foo>

    const document = new XmlDocument({
      'abc': 'nsabc',
    });

    const model = new XmlElement(document, 'abc:foo', { 'hoge': 'piyo' }, [
      new XmlElement(document, 'def:bar'),
      'text'
    ]);

    assert.throws(() => {
      model.applyNamespaces();
    });

  });

  it('Does not die when it encounters unknown namespace when allowUnknownNamespacePrefixes is specified', () => {

    // assume root with xmlns:abc="nsabc"
    // <abc:foo>
    //   <def:bar />
    // </abc:foo>

    const document = new XmlDocument({
      'abc': 'nsabc',
    }, true);

    const model = new XmlElement(document, 'abc:foo', { 'hoge': 'piyo' }, [
      new XmlElement(document, 'def:bar'),
      'text'
    ]);

    model.applyNamespaces();

    assert.ok(model.children[0] instanceof XmlElement);
    assert.strictEqual(model.children[0].namespace, '');

  });

  it('can serialize opening/closing tags', () => {

    // <html xmlns="nshtml" xmlns:foo="nsfoo">
    //   <div class="foo" foo:custom="yay" />
    //   <foo:hoge />
    // </html>

    const document = new XmlDocument();

    const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:foo': 'nsfoo' }, [
      new XmlElement(document, 'div', { 'class': 'foo', 'foo:custom': 'yay' }),
      new XmlElement(document, 'foo:hoge'),
    ]);

    html.applyNamespaces();

    // noinspection XmlUnusedNamespaceDeclaration
    assert.strictEqual(html.tagOpen, '<html xmlns="nshtml" xmlns:foo="nsfoo">');
    assert.strictEqual(html.tagClose, '</html>');

    const div = html.children[0];

    assert.ok(div instanceof XmlElement);
    assert.strictEqual(div.tagOpen, '<div class="foo" foo:custom="yay" />');
    assert.strictEqual(div.tagClose, null);

  });

  it('can serialize straight out', () => {

    // <html xmlns="nshtml" xmlns:foo="nsfoo">
    //   <div class="foo" foo:custom="yay" />
    //   <foo:hoge />
    // </html>

    const document = new XmlDocument();

    const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:foo': 'nsfoo' }, [
      new XmlElement(document, 'div', { 'class': 'foo', 'foo:custom': 'yay' }),
      new XmlElement(document, 'foo:hoge'),
    ]);

    html.applyNamespaces();

    const result = html.serialize();

    assert.strictEqual(result,
      `<html xmlns="nshtml" xmlns:foo="nsfoo"><div class="foo" foo:custom="yay" /><foo:hoge /></html>`
    );

  });

  describe('XmlElement.serialize() static utility function', () => {

    it('can take strings', () => {

      const str = 'foo';

      const result = XmlElement.serialize(str);

      assert.strictEqual(result, 'foo');

    });

    it('can take elements', () => {

      const document = new XmlDocument();

      const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:foo': 'nsfoo' }, [
        new XmlElement(document, 'div', { 'class': 'foo', 'foo:custom': 'yay' }),
        new XmlElement(document, 'foo:hoge'),
      ]);

      html.applyNamespaces();

      const result = XmlElement.serialize(html);

      assert.strictEqual(result,
        `<html xmlns="nshtml" xmlns:foo="nsfoo"><div class="foo" foo:custom="yay" /><foo:hoge /></html>`
      );

    });

  });

  describe('walkXmlElements', () => {

    function buildSampleTree() {

      const document = new XmlDocument();

      return new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:foo': 'nsfoo' }, [
        'hi',
        new XmlElement(document, 'foo:pick', { 'value': '1' }, [
          new XmlElement(document, 'div', null, [ 'A-1' ]),
          new XmlElement(document, 'div', null, [ 'A-2' ]),
        ]),
        'ho',
        new XmlElement(document, 'foo:pick', { 'value': '2' }, [
          new XmlElement(document, 'div', null, [ 'B-1' ]),
          new XmlElement(document, 'div', null, [ 'B-2' ]),
        ]),
        'hello',
        new XmlElement(document, 'foo:hoge'),
        'yo',
      ]);

    }

    it('can walk the tree pre-order (parents then children)', async () => {

      const html = buildSampleTree();

      const results: string[] = [];
      await walkXmlElements(html, (el) => {

        if (typeof el === 'string') {
          results.push(el);
          return;
        }

        results.push(el.localFullname);

      }, null);

      assert.deepStrictEqual(results, [
        'html',
        'hi',
        'foo:pick',
        'div',
        'A-1',
        'div',
        'A-2',
        'ho',
        'foo:pick',
        'div',
        'B-1',
        'div',
        'B-2',
        'hello',
        'foo:hoge',
        'yo',
      ]);

    });

    it('can walk the tree post-order (children then parents)', async () => {

      const html = buildSampleTree();

      const results: string[] = [];
      await walkXmlElements(html, null, (el) => {

        if (typeof el === 'string') {
          results.push(el);
          return;
        }

        results.push(el.localFullname);

      });

      assert.deepStrictEqual(results, [
        'hi',
        'A-1',
        'div',
        'A-2',
        'div',
        'foo:pick',
        'ho',
        'B-1',
        'div',
        'B-2',
        'div',
        'foo:pick',
        'hello',
        'foo:hoge',
        'yo',
        'html',
      ]);

    });

    it('can walk tree to perform a transform', async () => {

      // <html xmlns="nshtml" xmlns:foo="nsfoo">
      //   <foo:pick value="1">
      //     <div>A-1</div>
      //     <div>A-2</div>
      //   </div>
      //   <foo:pick value="2">
      //     <div>B-1</div>
      //     <div>B-2</div>
      //   </div>
      //   <foo:hoge />
      // </html>

      // custom transform will take content of <foo:pick> tags
      // and select only the item at that index described by value

      const document = new XmlDocument();

      const html = new XmlElement(document, 'html', { 'xmlns': 'nshtml', 'xmlns:foo': 'nsfoo' }, [
        new XmlElement(document, 'foo:pick', { 'value': '1' }, [
          new XmlElement(document, 'div', null, [ 'A-1' ]),
          new XmlElement(document, 'div', null, [ 'A-2' ]),
        ]),
        new XmlElement(document, 'foo:pick', { 'value': '2' }, [
          new XmlElement(document, 'div', null, [ 'B-1' ]),
          new XmlElement(document, 'foo:pick', { 'value': '2' }, [
            new XmlElement(document, 'div', null, [ 'B-2-1' ]),
            new XmlElement(document, 'div', null, [ 'B-2-2' ]),
          ]),
        ]),
        'foo',
        new XmlElement(document, 'foo:remove', null, [
          new XmlElement(document, 'div', null, [ 'B-1' ]),
          new XmlElement(document, 'foo:pick', { 'value': '2' }, [
            new XmlElement(document, 'div', null, [ 'B-2-1' ]),
            new XmlElement(document, 'div', null, [ 'B-2-2' ]),
          ]),
        ]),
        'bar',
        new XmlElement(document, 'foo:hoge', null, [
          new XmlElement(document, 'div', null, [ 'C-1' ]),
          new XmlElement(document, 'div', null, [ 'C-2' ]),
        ]),
        'baz',
        new XmlElement(document, 'foo:piyo', null, [
          new XmlElement(document, 'div', null, [ 'D-1' ]),
          new XmlElement(document, 'div', null, [ 'D-2' ]),
        ]),
      ]);

      html.applyNamespaces();

      const applyPick = buildTransform(document, async (el: XmlElementNode) => {

        if (el instanceof XmlElement) {

          if (el.namespace === 'nsfoo' && el.localName === 'pick') {

            // Replace in-place
            const value = parseInt(el.attrs['value'].value, 10);

            const children = el.children
              .filter(x => x instanceof XmlElement);

            const pickedChild = children[value - 1];

            // recurse for picked child
            return await applyPick(pickedChild);

          }

          if (el.namespace === 'nsfoo' && el.localName === 'remove') {

            // Return null to remove it and all children
            return null;

          }

          if (el.namespace === 'nsfoo' && el.localName === 'hoge') {

            // Return a string to replace it and all children with it
            return 'hoge';

          }

          if (el.namespace === 'nsfoo' && el.localName === 'piyo') {

            // Return an array to replace it and all children with it
            return [ 'hi', 'ho' ];

          }
        }
      });

      const result = await applyPick(html);

      assert.ok(result instanceof XmlElement);
      assert.strictEqual(result.children.length, 8);

      assert.ok(result.children[0] instanceof XmlElement);
      assert.strictEqual(result.children[0].localFullname, 'div');
      assert.strictEqual(result.children[0].children.length, 1);
      assert.strictEqual(result.children[0].children[0], 'A-1');

      assert.ok(result.children[1] instanceof XmlElement);
      assert.strictEqual(result.children[1].localFullname, 'div');
      assert.strictEqual(result.children[1].children.length, 1);
      assert.strictEqual(result.children[1].children[0], 'B-2-2');

      assert.strictEqual(result.children[2], 'foo');

      assert.strictEqual(result.children[3], 'bar');
      assert.strictEqual(result.children[4], 'hoge');

      assert.strictEqual(result.children[5], 'baz');
      assert.strictEqual(result.children[6], 'hi');
      assert.strictEqual(result.children[7], 'ho');

    });

  });

});
