/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { XmlDocument, XmlElement, XmlElementNode } from './XmlModel.js';
import { xmlDecode } from "./xmlUtils.js";
import StreamerState from "./StreamerState.js";

export type XmlStreamerParseOptions = {
  // If true, then ignore tags that are not namespaced
  // NOTE: this will also ignore xmlns attributes on those tags
  ignoreDefaultTags?: boolean;

  // A hook to run before processing each chunk. This is a chance to
  // modify the buffered XML string and/or postpone the processing of some part.
  beforeProcess?: (streamerState: StreamerState) => void;
};

export class XmlStreamerContext {
  document: XmlDocument;
  options: XmlStreamerParseOptions;

  // Root level children
  children: XmlElementNode[] = [];

  // Stack of open elements
  openElements: XmlElement[] = [];

  streamerState: StreamerState;

  constructor(
    document?: XmlDocument | null,
    options?: XmlStreamerParseOptions,
  ) {
    this.document = document ?? new XmlDocument(null);
    this.options = options ?? {};
    this.streamerState = new StreamerState();
  }

  append(xmlString: string) {
    this.streamerState.append(xmlString);
    this.process();
  }

  process() {
    this.streamerState.applyPostponedXmlString();

    if (this.options.beforeProcess != null) {
      this.options.beforeProcess(this.streamerState);
    }

    while(true) {

      if (this.streamerState.bufferedString === '') {
        break;
      }

      const parseResult = parseXmlStringChunk(this.streamerState.bufferedString, this.options);
      this.streamerState.bufferedString = parseResult.remainingXmlString;

      if (parseResult.type === 'unknown') {
        break;
      }

      // Current top item in "open elements" stack
      const topOpenElement = this.openElements.length > 0 ? this.openElements[this.openElements.length-1] : null;

      // Current "children" list we'd be adding to
      const children = topOpenElement != null ? topOpenElement.children : this.children;

      if (parseResult.type === 'text') {
        addStringSegment(children, parseResult.content);
        continue;
      }

      if (
        parseResult.type === 'element-self-close' ||
        parseResult.type === 'element-open'
      ) {
        const xmlElement = new XmlElement(this.document, parseResult.localFullname, parseResult.attrs);
        xmlElement.parent = topOpenElement;
        children.push(xmlElement);

        if (parseResult.type === 'element-open') {
          this.openElements.push(xmlElement);
        }
        continue;
      }

      if (
        parseResult.type === 'element-close'
      ) {
        if (topOpenElement == null) {
          throw new Error('closing-empty-stack');
        }
        if (topOpenElement.localFullname !== parseResult.localFullname) {
          throw new Error('closing-unmatched');
        }
        this.openElements.pop();
        continue;
      }

      throw new Error(`unexpected parseResult type`);

    }

    this.applyNamespaces();
  }

  flush(force?: boolean) {
    this.streamerState.applyPostponedXmlString();

    // if there is anything in bufferedXmlString, this is added as string
    if (this.streamerState.bufferedString !== '') {
      // Current top item in "open elements" stack
      const topOpenElement = this.openElements.length > 0 ? this.openElements[this.openElements.length-1] : null;

      // Current "children" list we'd be adding to
      const children = topOpenElement != null ? topOpenElement.children : this.children;

      addStringSegment(children, this.streamerState.bufferedString);

      this.streamerState.bufferedString = '';
      this.streamerState.postponedString = undefined;
    }

    if (force) {
      // Close out all elements
      this.openElements = [];
    }
  }

  applyNamespaces() {
    for (const child of this.children) {
      if (child instanceof XmlElement) {
        child.applyNamespaces();
      }
    }
  }
}

const regexXmlTagOpenOrClose = /<((?<tagOpen>(?<tagOpenFullname>(?<tagOpenNamespace>[a-zA-Z][-a-zA-Z0-9]*:)?(?<tagOpenName>[a-zA-Z][-a-zA-Z0-9]*))(?<attrs>(\s+([a-zA-Z][-a-zA-Z0-9]*:)?([a-zA-Z][-a-zA-Z0-9]*)=(("[^"]*")|('[^']*')))*)\s*(?<selfClosing>\/)?)|(?<tagClose>\/(?<tagCloseFullname>(?<tagCloseNamespace>[a-zA-Z][-a-zA-Z0-9]*:)?(?<tagCloseName>[a-zA-Z][-a-zA-Z0-9]*))\s*))>/;
const regexXmlTagOpenOrCloseNoDefaultNS = /<((?<tagOpen>(?<tagOpenFullname>(?<tagOpenNamespace>[a-zA-Z][-a-zA-Z0-9]*:)(?<tagOpenName>[a-zA-Z][-a-zA-Z0-9]*))(?<attrs>(\s+([a-zA-Z][-a-zA-Z0-9]*:)?([a-zA-Z][-a-zA-Z0-9]*)=(("[^"]*")|('[^']*')))*)\s*(?<selfClosing>\/)?)|(?<tagClose>\/(?<tagCloseFullname>(?<tagCloseNamespace>[a-zA-Z][-a-zA-Z0-9]*:)(?<tagCloseName>[a-zA-Z][-a-zA-Z0-9]*))\s*))>/;
const regexXmlAttr = /(?<attrFullname>([a-zA-Z][-a-zA-Z0-9]*:)?[a-zA-Z][-a-zA-Z0-9]*)=(("(?<attrValue1>[^"]*)")|('(?<attrValue2>[^']*)'))/g;
const regexXmlTagMaybeOpenOrClose = /<((?<tagOpen>(?<tagOpenFullname>[a-zA-Z]))|(?<tagClose>\/(?<tagCloseFullname>[a-zA-Z])))[^>]*$/;

function addStringSegment(segments: XmlElementNode[], seg: string) {
  if (seg === '') {
    return;
  }
  if (segments.length > 0 && typeof segments[segments.length - 1] === 'string') {
    segments[segments.length - 1] = segments[segments.length - 1] + seg;
  } else {
    segments.push(seg);
  }
}

type ParseXmlChunkResultText = {
  type: 'text',
  content: string,
};

type ParseXmlChunkResultElementBase = {
  localFullname: string,
};
type ParseXmlChunkResultElementAttrs = {
  attrs: { [localFullname: string]: string, },
};

type ParseXmlChunkResultElementOpen =
  & ParseXmlChunkResultElementBase
  & ParseXmlChunkResultElementAttrs
  & {
    type: 'element-open'
  };

type ParseXmlChunkResultElementSelfClose =
  & ParseXmlChunkResultElementBase
  & ParseXmlChunkResultElementAttrs
  & {
    type: 'element-self-close'
  };

type ParseXmlChunkResultElementClose =
  & ParseXmlChunkResultElementBase
  & {
    type: 'element-close',
  };

type ParseXmlChunkResultUnknown =
  {
    type: 'unknown',
  };

type ParseXmlChunkResultElement =
  | ParseXmlChunkResultElementOpen
  | ParseXmlChunkResultElementSelfClose
  | ParseXmlChunkResultElementClose;

type ParseXmlChunkResultCommon = {
  remainingXmlString: string,
};

type ParseXmlChunkResult = ParseXmlChunkResultCommon & (
  | ParseXmlChunkResultText
  | ParseXmlChunkResultElement
  | ParseXmlChunkResultUnknown
);

export function parseXmlStringChunk(xmlString: string, options?: XmlStreamerParseOptions): ParseXmlChunkResult {

  let remainingXmlString = xmlString;

  const regex = options?.ignoreDefaultTags ? regexXmlTagOpenOrCloseNoDefaultNS : regexXmlTagOpenOrClose;
  const match = remainingXmlString.match(regex);
  if (match != null) {

    const pos = match.index ?? 0;
    if (pos > 0) {
      // If there is stuff before the tag then that stuff is what counts.
      const content = remainingXmlString.slice(0, pos);
      remainingXmlString = remainingXmlString.slice(pos);
      return {
        type: 'text',
        content,
        remainingXmlString,
      };
    }

    remainingXmlString = remainingXmlString.slice(match[0].length);

    if (match.groups == null) {
      throw new Error('Unexpected, match.groups is null');
    }

    if (match.groups['tagOpen'] != null) {
      if (match.groups['tagOpenFullname'] == null) {
        throw new Error('Unexpected (tagOpenFullname is null)');
      }

      const attrs: { [fullname: string]: string } = {};
      if (match.groups['attrs'] != null) {
        for (const attrMatch of match.groups['attrs'].matchAll(regexXmlAttr)) {
          const attrName = attrMatch.groups?.['attrFullname'];
          if (attrName != null) {
            attrs[attrName] = xmlDecode(attrMatch.groups?.['attrValue1'] ?? attrMatch.groups?.['attrValue2'] ?? '');
          }
        }
      }

      if (match.groups['selfClosing'] != null) {
        return {
          type: "element-self-close",
          localFullname: match.groups['tagOpenFullname'],
          attrs,
          remainingXmlString,
        };
      }

      return {
        type: "element-open",
        localFullname: match.groups['tagOpenFullname'],
        attrs,
        remainingXmlString,
      };

    }

    if (match.groups['tagClose'] != null) {
      if (match.groups['tagCloseFullname'] == null) {
        throw new Error('Unexpected (tagCloseFullname is null)');
      }

      return {
        type: "element-close",
        localFullname: match.groups['tagCloseFullname'],
        remainingXmlString,
      };
    }

    throw new Error('Unexpected (tagOpen and tagClose are both null)');
  }

  const matchTagMaybeOpenOrClose = remainingXmlString.match(regexXmlTagMaybeOpenOrClose);
  if (matchTagMaybeOpenOrClose != null) {

    const pos = matchTagMaybeOpenOrClose.index ?? 0;
    if (pos > 0) {
      // If there is stuff before the tag then that stuff is what counts.
      const content = remainingXmlString.slice(0, pos);
      remainingXmlString = remainingXmlString.slice(pos);
      return {
        type: 'text',
        content,
        remainingXmlString,
      };
    }

    return {
      type: 'unknown',
      remainingXmlString,
    };
  }

  const content = remainingXmlString;
  remainingXmlString = '';
  return {
    type: 'text',
    content,
    remainingXmlString,
  };
}
