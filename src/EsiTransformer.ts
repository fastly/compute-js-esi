/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

// Currently supported:
// <esi:comment>
// <esi:remove>
// <esi:include>
// <esi:try> <esi:attempt> <esi:except>
// <esi:choose> <esi:when> <esi:otherwise>
// <esi:vars>
// ESI comments <!--esi and -->
// ESI Variables
// ESI Expressions

// Currently unsupported:
// <esi:inline>

import { buildTransform, XmlElement, XmlElementNode } from "./XmlModel.js";
import { IXmlTransformer } from "./XmlTransformStream.js";
import StreamerState from "./StreamerState.js";
import { ValueOrPromise } from "./util.js";
import { applyEsiVariables, IEsiVariables } from "./EsiVariables.js";
import {EsiExpressionEvaluator} from "./EsiExpressions.js";

export class EsiError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class EsiElementError extends EsiError {
  el: XmlElement;
  constructor(el: XmlElement, message: string) {
    super(message);
    this.el = el;
  }
}

export class EsiIncludeError extends EsiElementError {
  constructor(el: XmlElement, message: string) {
    super(el, message);
  }
}

export class EsiStructureError extends EsiElementError {
  constructor(el: XmlElement, message: string) {
    super(el, message);
  }
}

export type EsiIncludeResult = {
  url: URL,
  headers: Headers,
  res: Response,
};

export type ProcessIncludeResponseFunc = (esiIncludeResult: EsiIncludeResult) => ValueOrPromise<string>;
export interface HandleIncludeErrorEvent {
  url: URL;
  headers: Headers;
  el: XmlElement;
  customErrorString: string | null;
}
export type HandleIncludeErrorFunc = (e: HandleIncludeErrorEvent) => ValueOrPromise<void>;

export type EsiTransformerOptions = {
  vars?: IEsiVariables,
  fetch?: (input: RequestInfo, init?: RequestInit) => Promise<Response>,
  processIncludeResponse?: ProcessIncludeResponseFunc,
  handleIncludeError?: HandleIncludeErrorFunc,
};

export default class EsiTransformer implements IXmlTransformer {
  // noinspection HttpUrlsUsage - this is a public constant
  static namespace = 'http://www.edge-delivery.org/esi/1.0';

  url: URL;
  headers: Headers;
  options: EsiTransformerOptions;
  depth: number;
  expressionEvaluator?: EsiExpressionEvaluator;

  applyVars: boolean = false;

  /**
   * Construct an instance of EsiTransformer.
   * @param url Absolute URL of request that was used when fetching the stream
   * @param headers The request headers that were used when fetching the stream
   * @param options Transformer options
   * @param depth Depth of recursion
   */
  constructor(
    url: string | URL,
    headers?: HeadersInit,
    options?: EsiTransformerOptions,
    depth: number = 0,
  ) {
    this.url = new URL(url);
    this.headers = new Headers(headers);
    this.options = options ?? {};
    this.depth = depth;
  }

  async transformChildElements(el: XmlElement) {
    const results: XmlElementNode[] = [];
    for (const child of el.children) {
      const result = await this.transformElementNode(child);
      if (result == null) {
        continue;
      }
      if (result instanceof XmlElement && result.localName === '_replace') {
        results.push(...result.children);
      } else {
        results.push(result);
      }
    }

    return results;
  }

  async transformElementNode(node: XmlElementNode) {
    if (typeof node === 'string') {
      return this.applyVars ? applyEsiVariables(node, this.options.vars)! : node;
    }

    const transformFunc = buildTransform(node.document, async (el) => {

      if (el instanceof XmlElement && el.namespace === EsiTransformer.namespace) {

        if (el.localName === 'comment') {

          // Remove node entirely
          return null;

          // TODO: validation
          // * must not have any children
          // * text attr is optional

        }

        if (el.localName === 'remove') {

          // Remove node entirely
          return null;

          // TODO: validation
          // * must not have other esi elements in children
          // * no attrs

        }

        if (el.localName === 'include') {

          const srcs: string[] = [];

          const src = applyEsiVariables(el.attrs['src'].value, this.options.vars);
          const alt = applyEsiVariables(el.attrs['alt']?.value, this.options.vars);

          if (src != null) {
            srcs.push(src);
          }
          if (alt != null) {
            srcs.push(alt);
          }

          let esiIncludeResult: EsiIncludeResult | undefined = undefined;
          for (const src of srcs) {
            // The URL and headers to use for this include.
            const url = new URL(src, this.url);
            const headers = new Headers(this.headers);

            // add host header if host has changed
            const host = url.host.toLowerCase();
            if (host !== this.url.host.toLowerCase()) {
              headers.set('host', host);
            }

            // esi:include is ALWAYS done using the GET verb
            const init: RequestInit = {
              method: 'GET',
              headers,
            };

            const res = await (this.options.fetch ?? fetch)(String(url), init);
            if (res.status >= 200 && res.status < 300) {
              esiIncludeResult = { url, headers, res };
              break;
            }
          }

          if (esiIncludeResult == null) {
            if (this.options.handleIncludeError != null) {
              const event: HandleIncludeErrorEvent = {
                url: this.url,
                headers: this.headers,
                el,
                customErrorString: null,
              };
              await this.options.handleIncludeError(event);
              if (event.customErrorString != null) {
                return event.customErrorString;
              }
            }

            const swallowErrors = applyEsiVariables(el.attrs['onerror']?.value, this.options.vars) === 'continue';

            if (swallowErrors) {
              // Swallow and remove node entirely
              return null;
            }

            throw new EsiIncludeError(el, `Could not include ${el.serialize()}`);
          }

          if (this.options.processIncludeResponse == null) {
            return await esiIncludeResult.res.text();
          }

          return await this.options.processIncludeResponse(esiIncludeResult);

          // TODO: validation
          // * src attr is required
          // * alt attr is optional

        }

        if (el.localName === 'try') {

          const attemptTags = el.children
            .filter(tag => {
              return tag instanceof XmlElement &&
                tag.namespace === EsiTransformer.namespace &&
                tag.localName === 'attempt'
            });

          if (attemptTags.length != 1) {
            throw new EsiStructureError(el, 'esi:try requires exactly one esi:attempt tag as a direct child');
          }

          const attemptTag = attemptTags[0] as XmlElement;

          const exceptTags = el.children.filter(tag => {
            return tag instanceof XmlElement &&
              tag.namespace === EsiTransformer.namespace &&
              tag.localName === 'except'
          });

          if (exceptTags.length != 1) {
            throw new EsiStructureError(el, 'esi:try requires exactly one esi:except tag as a direct child');
          }

          const exceptTag = exceptTags[0] as XmlElement;

          let applyVarsPrev = this.applyVars;
          try {
            this.applyVars = true;

            try {
              return await this.transformChildElements(attemptTag);
            } catch(ex) {
              if (!(ex instanceof EsiIncludeError)) {
                throw ex;
              }
            }

            return await this.transformChildElements(exceptTag);

          } finally {
            this.applyVars = applyVarsPrev;
          }

        }

        if (el.localName === 'attempt') {
          throw new EsiStructureError(el, 'esi:attempt must be direct child of esi:try');
        }

        if (el.localName === 'except') {
          throw new EsiStructureError(el, 'esi:except must be direct child of esi:try');
        }

        if (el.localName === 'vars') {

          let applyVarsPrev = this.applyVars;
          try {
            this.applyVars = true;
            return await this.transformChildElements(el);
          } finally {
            this.applyVars = applyVarsPrev;
          }

        }

        if (el.localName === 'choose') {
          this.expressionEvaluator ??= new EsiExpressionEvaluator(this.options.vars);

          const whenTags = el.children
            .filter(tag => {
              return tag instanceof XmlElement &&
                tag.namespace === EsiTransformer.namespace &&
                tag.localName === 'when'
            }) as XmlElement[];

          if (whenTags.length === 0) {
            throw new EsiStructureError(el, 'esi:choose must have at least one esi:when as direct child');
          }

          if (whenTags.some(whenTag => whenTag.attrs['test'] == null)) {
            throw new EsiStructureError(el, 'esi:when tags are required to have a test attribute.');
          }

          const otherwiseTags = el.children
            .filter(tag => {
              return tag instanceof XmlElement &&
                tag.namespace === EsiTransformer.namespace &&
                tag.localName === 'otherwise'
            }) as XmlElement[];

          if (otherwiseTags.length > 1) {
            throw new EsiStructureError(el, 'esi:choose must not have more than one esi:otherwise');
          }

          const otherwiseTag = otherwiseTags.length === 1 ? otherwiseTags[0] : null;

          let activeBranch: XmlElement | null = null;
          for (const whenTag of whenTags) {
            if (this.expressionEvaluator.evaluate(whenTag.attrs['test'].value)) {
              activeBranch = whenTag;
              break;
            }
          }
          activeBranch ??= otherwiseTag;
          if (activeBranch == null) {
            return null;
          }

          let applyVarsPrev = this.applyVars;
          try {
            this.applyVars = true;

            return await this.transformChildElements(activeBranch);

          } finally {
            this.applyVars = applyVarsPrev;
          }

          return null;

        }

        if (el.localName === 'when') {
          throw new EsiStructureError(el, 'esi:when must be direct child of esi:choose');
        }

        if (el.localName === 'otherwise') {
          throw new EsiStructureError(el, 'esi:otherwise must be direct child of esi:choose');
        }

        throw new EsiStructureError(el, 'Unknown esi tag esi:' + el.localName);
      }
    });

    return await transformFunc(node);
  }

  isInEsiComment: boolean = false;

  xmlStreamerBeforeProcess(streamerState: StreamerState) {

    let pos = 0;
    while(true) {
      if (!this.isInEsiComment) {
        pos = streamerState.bufferedString.indexOf('<!--esi', pos);
        if (pos < 0) {
          break;
        }
        streamerState.bufferedString =
          streamerState.bufferedString.slice(0, pos) +
          streamerState.bufferedString.slice(pos + 7);
        this.isInEsiComment = true;
      }

      if (this.isInEsiComment) {
        pos = streamerState.bufferedString.indexOf('-->', pos);
        if (pos < 0) {
          break;
        }
        streamerState.bufferedString =
          streamerState.bufferedString.slice(0, pos) +
          streamerState.bufferedString.slice(pos + 3);
        this.isInEsiComment = false;
      }
    }

    let sepPos = -1;

    if (this.isInEsiComment) {
      if (streamerState.bufferedString.endsWith('--')) {
        sepPos = streamerState.bufferedString.lastIndexOf('--');
      } else if (streamerState.bufferedString.endsWith('-')) {
        sepPos = streamerState.bufferedString.lastIndexOf('-');
      }
    } else {
      if (
        streamerState.bufferedString.endsWith('<') ||
        streamerState.bufferedString.endsWith('<!') ||
        streamerState.bufferedString.endsWith('<!-') ||
        streamerState.bufferedString.endsWith('<!--') ||
        streamerState.bufferedString.endsWith('<!--e') ||
        streamerState.bufferedString.endsWith('<!--es')
      ) {
        sepPos = streamerState.bufferedString.lastIndexOf('<');
      }
    }
    if (sepPos > 0) {
      streamerState.postponedString = streamerState.bufferedString.slice(sepPos);
      streamerState.bufferedString = streamerState.bufferedString.slice(0, sepPos);
    }
  }
}
