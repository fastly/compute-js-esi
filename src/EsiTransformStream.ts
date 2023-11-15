/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import XmlTransformStream from "./XmlTransformStream.js";
import EsiTransformer, { EsiIncludeResult } from "./EsiTransformer.js";
import { XmlDocument } from "./XmlModel.js";
import { ValueOrPromise } from "./util.js";
import { EsiVariables, IEsiVariables } from "./EsiVariables.js";

export type EsiTransformStreamOptions = {
  vars?: IEsiVariables,
  fetch?: (input: RequestInfo, init?: RequestInit) => Promise<Response>,
  processIncludeResponse?: (esiIncludeResult: EsiIncludeResult) => ValueOrPromise<string>,
};

export default class EsiTransformStream extends XmlTransformStream {
  static document = new XmlDocument({
    // We grant this, in case the HTML tag doesn't have it
    'esi': EsiTransformer.namespace,
  });

  constructor(
    url: string | URL,
    headers: HeadersInit,
    options?: EsiTransformStreamOptions,
    depth: number = 0,
  ) {
    const transformerOpts = {
      ...options,
    };
    transformerOpts.vars ??= new EsiVariables(new URL(url), new Headers(headers));

    const esiTransformer = new EsiTransformer(
      url,
      headers,
      {
        async processIncludeResponse(result) {
          if (result.res.body == null) {
            // we have no 'body'? I guess the response can just be an empty string
            return '';
          }

          const innerEsiTransformStream = new EsiTransformStream(result.url, result.headers, transformerOpts, depth + 1);
          const innerTransformed = result.res.body.pipeThrough(innerEsiTransformStream);
          const tempResp = new Response(innerTransformed);

          return await tempResp.text();
        },
        ...transformerOpts,
      },
      depth,
    );

    // We ignore default (non-namespaced) tags. Only ESI and other namespaced tags
    // are expected to follow XML rules.
    super(EsiTransformStream.document, esiTransformer, true);
  }
}
