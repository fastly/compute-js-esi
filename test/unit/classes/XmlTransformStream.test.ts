// noinspection DuplicatedCode

/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { readableStreamToString, stringsToReadableStream } from "../util.js";

import XmlTransformStream, { IXmlTransformer } from "../../../src/XmlTransformStream.js";
import { XmlDocument, XmlElementNode } from "../../../src/XmlModel.js";

describe('XmlTransformStream', () => {

  it('Constructs', () => {

    const document = new XmlDocument({});
    const transformer: IXmlTransformer = {
      async transformElementNode(_: XmlElementNode): Promise<XmlElementNode | null> {
        return null;
      }
    };

    new XmlTransformStream(document, transformer);

  });

  it('Pipes stuff', async () => {
    const document = new XmlDocument({});
    const transformer: IXmlTransformer = {
      async transformElementNode(xmlElementNode: XmlElementNode): Promise<XmlElementNode | null> {
        return xmlElementNode;
      }
    };
    const xmlTransformStream = new XmlTransformStream(document, transformer);

    const stringStream = stringsToReadableStream('Hello, ', 'world!');
    const transformed = stringStream.pipeThrough(xmlTransformStream);

    const res = await readableStreamToString(transformed);

    assert.strictEqual(res, 'Hello, world!');
  });

  it('pre-transforms string', async() => {
    const document = new XmlDocument({});
    const transformer: IXmlTransformer = {
      async xmlStreamerBeforeProcess(streamerState) {
        streamerState.bufferedString = streamerState.bufferedString.replaceAll('l', 'z');
      },
      async transformElementNode(xmlElementNode: XmlElementNode): Promise<XmlElementNode | null> {
        return xmlElementNode;
      }
    };
    const xmlTransformStream = new XmlTransformStream(document, transformer);

    const stringStream = stringsToReadableStream('Hello, ', 'world!');
    const transformed = stringStream.pipeThrough(xmlTransformStream);

    const res = await readableStreamToString(transformed);

    assert.strictEqual(res, 'Hezzo, worzd!');
  });

  it('combines XML tags', async() => {
    const document = new XmlDocument({});
    const transformer: IXmlTransformer = {
      async transformElementNode(xmlElementNode: XmlElementNode): Promise<XmlElementNode | null> {
        return xmlElementNode;
      }
    };
    const xmlTransformStream = new XmlTransformStream(document, transformer);

    const stringStream = stringsToReadableStream('Hello, <div xmlns="nshtml">', 'world!</div>');
    const transformed = stringStream.pipeThrough(xmlTransformStream);

    const res = await readableStreamToString(transformed);

    assert.strictEqual(res, 'Hello, <div xmlns="nshtml">world!</div>');
  });

  it('closes XML tag that is not closed', async() => {
    const document = new XmlDocument({});
    const transformer: IXmlTransformer = {
      async transformElementNode(xmlElementNode: XmlElementNode): Promise<XmlElementNode | null> {
        return xmlElementNode;
      }
    };
    const xmlTransformStream = new XmlTransformStream(document, transformer);

    const stringStream = stringsToReadableStream('Hello, <div xmlns="nshtml">', 'world!');
    const transformed = stringStream.pipeThrough(xmlTransformStream);

    const res = await readableStreamToString(transformed);

    assert.strictEqual(res, 'Hello, <div xmlns="nshtml">world!</div>');
  });

  it('rejects streams that are not Uint8Array', async() => {
    const document = new XmlDocument({});
    const transformer: IXmlTransformer = {
      async transformElementNode(xmlElementNode: XmlElementNode): Promise<XmlElementNode | null> {
        return xmlElementNode;
      }
    };
    const xmlTransformStream = new XmlTransformStream(document, transformer);

    const stream = new ReadableStream<Uint16Array>({
      start(controller) {
        controller.enqueue(new Uint16Array([21, 31]));
      }
    });

    // @ts-ignore - intentionally mismatch array type
    const transformed = stream.pipeThrough(xmlTransformStream);

    await assert.rejects(
      async() => {
        await readableStreamToString(transformed);
      },
      (ex) => {
        assert.ok(ex instanceof Error);
        assert.strictEqual(ex.message, 'Received non-Uint8Array chunk');
        return true;
      });
  });

});
