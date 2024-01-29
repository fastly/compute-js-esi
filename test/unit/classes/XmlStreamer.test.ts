// noinspection DuplicatedCode

/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { parseXmlStringChunk, XmlStreamerContext } from '../../../src/XmlStreamer.js';
import { XmlElement } from '../../../src/XmlModel.js';

describe('parseXmlStringChunk', () => {

  it('Can read text from segment', () => {

    const xml = `foo`;
    const result = parseXmlStringChunk(xml);

    assert.strictEqual(result.remainingXmlString, '');
    assert.strictEqual(result.type, 'text');
    assert.strictEqual(result.content, 'foo');

  });

  it('Can read opening tag from segment', () => {

    const xml = `<foo>bar</foo>`;
    const result = parseXmlStringChunk(xml);

    assert.strictEqual(result.remainingXmlString, 'bar</foo>');
    assert.strictEqual(result.type, 'element-open');
    assert.strictEqual(result.localFullname, 'foo');
    assert.strictEqual(Object.entries(result.attrs).length, 0);

  });

  it('Can read closing tag from segment', () => {

    const xml = `</foo>bar</foo>`;
    const result = parseXmlStringChunk(xml);

    assert.strictEqual(result.remainingXmlString, 'bar</foo>');
    assert.strictEqual(result.type, 'element-close');
    assert.strictEqual(result.localFullname, 'foo');

  });

  it('Can read text from segment up to opening tag', () => {

    const xml = `foo<bar>`;
    const result = parseXmlStringChunk(xml);

    assert.strictEqual(result.remainingXmlString, '<bar>');
    assert.strictEqual(result.type, 'text');
    assert.strictEqual(result.content, 'foo');

  });

  it('Can read text from segment up to closing tag', () => {

    const xml = `foo</bar>`;
    const result = parseXmlStringChunk(xml);

    assert.strictEqual(result.remainingXmlString, '</bar>');
    assert.strictEqual(result.type, 'text');
    assert.strictEqual(result.content, 'foo');

  });

  it('ignores default tags for opening tags when ignoreDefaultTags is set', () => {

    const xml = `foo<bar><foo:bar>asdf</foo:bar>`;
    const result = parseXmlStringChunk(xml, { ignoreDefaultTags: true });

    assert.strictEqual(result.remainingXmlString, '<foo:bar>asdf</foo:bar>');
    assert.strictEqual(result.type, 'text');
    assert.strictEqual(result.content, 'foo<bar>');

  });

  it('default tag handled as string when ignoreDefaultTags is set', () => {

    const xml = `<bar>asdf</bar>`;
    const result = parseXmlStringChunk(xml, { ignoreDefaultTags: true });

    assert.strictEqual(result.remainingXmlString, '');
    assert.strictEqual(result.type, 'text');
    assert.strictEqual(result.content, `<bar>asdf</bar>`);

  });

  it('ignores default tags for closing tags when ignoreDefaultTags is set', () => {

    const xml = `foo</bar><foo:bar>asdf</foo:bar>`;
    const result = parseXmlStringChunk(xml, { ignoreDefaultTags: true });

    assert.strictEqual(result.remainingXmlString, '<foo:bar>asdf</foo:bar>');
    assert.strictEqual(result.type, 'text');
    assert.strictEqual(result.content, 'foo</bar>');

  });

  it('unknown opening tag in mid-xml is not consumed', () => {

    const xml = `foo<ba`;
    const result = parseXmlStringChunk(xml, { ignoreDefaultTags: true });

    assert.strictEqual(result.remainingXmlString, '<ba');
    assert.strictEqual(result.type, 'text');
    assert.strictEqual(result.content, 'foo');

  });

  it('unknown opening tag at start is not consumed', () => {

    const xml = `<ba`;
    const result = parseXmlStringChunk(xml, { ignoreDefaultTags: true });

    assert.strictEqual(result.remainingXmlString, '<ba');
    assert.strictEqual(result.type, 'unknown');

  });

  it('unknown closing tag in mid-xml is not consumed', () => {

    const xml = `foo</ba`;
    const result = parseXmlStringChunk(xml, { ignoreDefaultTags: true });

    assert.strictEqual(result.remainingXmlString, '</ba');
    assert.strictEqual(result.type, 'text');
    assert.strictEqual(result.content, 'foo');

  });

  it('unknown closing tag at start is not consumed', () => {

    const xml = `</ba`;
    const result = parseXmlStringChunk(xml, { ignoreDefaultTags: true });

    assert.strictEqual(result.remainingXmlString, '</ba');
    assert.strictEqual(result.type, 'unknown');

  });

  it('consumes attributes', () => {

    // noinspection HtmlUnknownAttribute
    const xml = '<div class="foo&gt;" abc:bar="baz">yoyo</div>';

    const result = parseXmlStringChunk(xml);
    assert.strictEqual(result.type, 'element-open');
    assert.strictEqual(result.localFullname, 'div');
    assert.strictEqual(Object.entries(result.attrs).length, 2);
    assert.strictEqual(result.attrs['class'], 'foo>');
    assert.strictEqual(result.attrs['abc:bar'], 'baz');

  });

});

describe('XmlStreamerContext', () => {

  it('Can read text from segment', () => {

    const ctx = new XmlStreamerContext();

    const xml = `foo`;
    ctx.append(xml);

    assert.strictEqual(ctx.children.length, 1);
    assert.strictEqual(ctx.children[0], 'foo');
    assert.strictEqual(ctx.streamerState.bufferedString, '');

  });

  it('Can read single self-closing XML tag from segment', () => {

    const xml = `<html xmlns="nshtml" lang='en' />`;
    const ctx = new XmlStreamerContext();
    ctx.append(xml);

    assert.strictEqual(ctx.children.length, 1);
    assert.ok(ctx.children[0] instanceof XmlElement);

    ctx.children[0].applyNamespaces();

    assert.strictEqual(ctx.children[0].localName, 'html');
    assert.strictEqual(ctx.children[0].localNamespacePrefix, null);
    assert.strictEqual(ctx.children[0].namespace, 'nshtml');

    assert.strictEqual(Object.entries(ctx.children[0].attrs).length, 1);

    const langAttr = ctx.children[0].attrs['lang'];
    assert.ok(langAttr != null)
    assert.strictEqual(langAttr.namespace, null);
    assert.strictEqual(langAttr.localNamespacePrefix, null);
    assert.strictEqual(langAttr.localName, 'lang');

    assert.strictEqual(ctx.children[0].children.length, 0);

    assert.strictEqual(ctx.openElements.length, 0);
    assert.strictEqual(ctx.streamerState.bufferedString, '');

  });

  it('Can read single XML tag from segment', () => {

    const xml = `asdf<foo:abc xmlns:foo="nsfoo">boo</foo:abc>jkl;`;
    const ctx = new XmlStreamerContext();
    ctx.append(xml);

    assert.strictEqual(ctx.children.length, 3);
    assert.ok(ctx.children[0], 'asdf');

    assert.ok(ctx.children[1] instanceof XmlElement);

    ctx.children[1].applyNamespaces();

    assert.strictEqual(ctx.children[1].localName, 'abc');
    assert.strictEqual(ctx.children[1].localNamespacePrefix, 'foo');
    assert.strictEqual(ctx.children[1].namespace, 'nsfoo');

    assert.strictEqual(Object.entries(ctx.children[1].attrs).length, 0);

    assert.strictEqual(ctx.children[1].children.length, 1);
    assert.strictEqual(ctx.children[1].children[0], 'boo');

    assert.strictEqual(ctx.children[2], 'jkl;');

    assert.strictEqual(ctx.openElements.length, 0);
    assert.strictEqual(ctx.streamerState.bufferedString, '');

  });

  it('Can read XML tag and continue', () => {

    const xmls = [
      `asdf<foo:abc xmlns:foo="nsfoo">b`,
      `oo</foo:abc>jkl;`
    ];

    const ctx = new XmlStreamerContext();
    ctx.append(xmls[0]);

    assert.strictEqual(ctx.children.length, 2);
    assert.ok(ctx.children[0], 'asdf');
    assert.ok(ctx.children[1] instanceof XmlElement);
    ctx.children[1].applyNamespaces();

    assert.strictEqual(ctx.children[1].localName, 'abc');
    assert.strictEqual(ctx.children[1].localNamespacePrefix, 'foo');
    assert.strictEqual(ctx.children[1].namespace, 'nsfoo');

    assert.strictEqual(Object.entries(ctx.children[1].attrs).length, 0);

    assert.strictEqual(ctx.children[1].children.length, 1);
    assert.strictEqual(ctx.children[1].children[0], 'b');

    assert.strictEqual(ctx.openElements.length, 1);
    assert.strictEqual(ctx.openElements[0], ctx.children[1]);
    assert.strictEqual(ctx.streamerState.bufferedString, '');

    ctx.append(xmls[1]);

    assert.strictEqual(ctx.children.length, 3);
    assert.ok(ctx.children[0], 'asdf');

    assert.ok(ctx.children[1] instanceof XmlElement);

    ctx.children[1].applyNamespaces();

    assert.strictEqual(ctx.children[1].localName, 'abc');
    assert.strictEqual(ctx.children[1].localNamespacePrefix, 'foo');
    assert.strictEqual(ctx.children[1].namespace, 'nsfoo');

    assert.strictEqual(Object.entries(ctx.children[1].attrs).length, 0);

    assert.strictEqual(ctx.children[1].children.length, 1);
    assert.strictEqual(ctx.children[1].children[0], 'boo');

    assert.strictEqual(ctx.children[2], 'jkl;');

    assert.strictEqual(ctx.openElements.length, 0);
    assert.strictEqual(ctx.streamerState.bufferedString, '');
  });

  it('Won\'t read if starting tag is incomplete', () => {

    const xml = `a<html xmlns="nshtml" lang="en"`;

    const ctx = new XmlStreamerContext();
    ctx.append(xml);

    assert.strictEqual(ctx.children.length, 1);
    assert.strictEqual(ctx.children[0], 'a')

    assert.strictEqual(ctx.openElements.length, 0);
    assert.strictEqual(ctx.streamerState.bufferedString, '<html xmlns="nshtml" lang="en"');

    // Can be flushed
    ctx.flush();

    assert.strictEqual(ctx.children.length, 1);
    assert.strictEqual(ctx.children[0], 'a<html xmlns="nshtml" lang="en"')

    assert.strictEqual(ctx.openElements.length, 0);
    assert.strictEqual(ctx.streamerState.bufferedString, '');

  });

  it('Won\'t read default tag if ignore flag is enabled', () => {

    const xml = `<html xmlns="nshtml" lang="en" />`;

    const ctx = new XmlStreamerContext(null, { ignoreDefaultTags: true });
    ctx.append(xml);

    assert.strictEqual(ctx.children.length, 1);

    assert.strictEqual(ctx.children[0], `<html xmlns="nshtml" lang="en" />`);

    assert.strictEqual(ctx.openElements.length, 0);
    assert.strictEqual(ctx.streamerState.bufferedString, '');

  });

  it('Won\'t read default tag if ignore flag is enabled, with segments', () => {

    const xml = `asdf<abc:foo xmlns:abc="nsabc" abc:hello="yes" hi="ho">1<div />2</abc:foo>jkl;`;
    const ctx = new XmlStreamerContext(null, { ignoreDefaultTags: true });
    ctx.append(xml);

    assert.strictEqual(ctx.children.length, 3);

    assert.strictEqual(ctx.children[0], 'asdf');
    assert.ok(ctx.children[1] instanceof XmlElement);
    assert.strictEqual(ctx.children[1].namespace, 'nsabc');
    assert.strictEqual(ctx.children[1].localNamespacePrefix, 'abc');
    assert.strictEqual(ctx.children[1].localName, 'foo');
    assert.strictEqual(ctx.children[1].localFullname, 'abc:foo');

    assert.strictEqual(Object.entries(ctx.children[1].attrs).length, 2);

    const helloAttr = ctx.children[1].attrs['nsabc|hello'];
    assert.strictEqual(helloAttr.localName, 'hello');
    assert.strictEqual(helloAttr.localNamespacePrefix, 'abc');
    assert.strictEqual(helloAttr.namespace, 'nsabc');
    assert.strictEqual(helloAttr.value, 'yes');

    const hiAttr = ctx.children[1].attrs['hi'];
    assert.strictEqual(hiAttr.localName, 'hi');
    assert.strictEqual(hiAttr.localNamespacePrefix, null);
    assert.strictEqual(hiAttr.namespace, null);
    assert.strictEqual(hiAttr.value, 'ho');

    assert.strictEqual(ctx.children[1].children.length, 1);
    assert.strictEqual(ctx.children[1].children[0], `1<div />2`);

    assert.strictEqual(ctx.children[2], 'jkl;');

    assert.strictEqual(ctx.openElements.length, 0);
    assert.strictEqual(ctx.streamerState.bufferedString, '');

  });

  it('Can read XML in a single string', () => {

    const xml = // language=XML
      `\
<html xmlns="nshtml" xmlns:foo="nsfoo">
  <div class="foo" foo:custom="yay" />
  <foo:hoge />
</html>`;

    const ctx = new XmlStreamerContext();
    ctx.append(xml);

    assert.strictEqual(ctx.children.length, 1);
    const html = ctx.children[0];

    assert.ok(html instanceof XmlElement);
    assert.strictEqual(html.namespace, 'nshtml');
    assert.strictEqual(html.localNamespacePrefix, null);
    assert.strictEqual(html.localName, 'html');
    assert.strictEqual(html.children.length, 5);

    const div = html.children[1];
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

    const hoge = html.children[3];
    assert.ok(hoge instanceof XmlElement);
    assert.strictEqual(hoge.namespace, 'nsfoo');
    assert.strictEqual(hoge.localNamespacePrefix, 'foo');
    assert.strictEqual(hoge.localName, 'hoge');

  });

});
