/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

// XML Transformation Stream

// Base class for applying transformation to streaming XML.
// As items stream in, we check for completed top level items.
// Whenever one of the items in this gets "completed", it is dispatched. When it is dispatched, it is
// removed from the array.

import { XmlStreamerContext } from "./XmlStreamer.js";
import { XmlDocument, XmlElement, XmlElementNode } from "./XmlModel.js";
import StreamerState from "./StreamerState.js";
import { ValueOrPromise } from "./util.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface IXmlTransformer {
  transformElementNode(xmlElementNode: XmlElementNode): ValueOrPromise<XmlElementNode | null>,
  xmlStreamerBeforeProcess?(streamerState: StreamerState): void;
}

export default class XmlTransformStream extends TransformStream<Uint8Array, Uint8Array> {
  constructor(document: XmlDocument, xmlTransformer: IXmlTransformer, ignoreDefaultTags: boolean = false) {
    const xmlStreamerContext = new XmlStreamerContext(document, { ignoreDefaultTags, beforeProcess: xmlTransformer.xmlStreamerBeforeProcess });

    async function dispatchCompleteTopLevelChildren(enqueueFunc: (chunk: Uint8Array) => void) {

      while(xmlStreamerContext.children.length > 0) {
        const firstChild = xmlStreamerContext.children.shift()!;
        if (firstChild instanceof XmlElement && xmlStreamerContext.openElements.includes(firstChild)) {
          // If the item is an open element, we will not dispatch this one yet,
          // and break the loop
          xmlStreamerContext.children.unshift(firstChild);
          break;
        }

        // Dispatch the item
        const transformResult = await xmlTransformer.transformElementNode(firstChild);
        const transformResultString = XmlElement.serialize(transformResult);

        const chunk = textEncoder.encode(transformResultString);
        enqueueFunc(chunk);
      }

    }

    const transformer: Transformer<Uint8Array, Uint8Array> = {
      async transform(chunk: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>) {
        // noinspection SuspiciousTypeOfGuard
        if (!(chunk instanceof Uint8Array)) {
          // Guard anyway in case someone uses this TransformStream with an unexpected stream type
          throw new Error('Received non-Uint8Array chunk');
        }
        let chunkAsString = textDecoder.decode(chunk);

        // Whenever a chunk is added, it is added to the currently processing chunk, and an attempt is made to
        // parse it.
        // Whenever one of the items in this gets "completed", it is dispatched. When it is dispatched, it is
        // removed from the array.
        xmlStreamerContext.append(chunkAsString);

        await dispatchCompleteTopLevelChildren(chunk => {
          controller.enqueue(chunk);
        });
      },
      async flush(controller: TransformStreamDefaultController<Uint8Array>) {
        xmlStreamerContext.flush(true);

        await dispatchCompleteTopLevelChildren(chunk => {
          controller.enqueue(chunk);
        });
      },
    };

    super(transformer);
  }
}
