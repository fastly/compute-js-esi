/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import XmlTransformStream from "./XmlTransformStream.js";
import EsiTransformer, { EsiError, EsiIncludeResult } from "./EsiTransformer.js";
import { XmlDocument } from "./XmlModel.js";
import { ValueOrPromise } from "./util.js";
import { EsiVariables, IEsiVariables } from "./EsiVariables.js";

export type EsiTransformStreamOptions = {
  vars?: IEsiVariables,
  fetch?: (input: RequestInfo, init?: RequestInit) => Promise<Response>,
  processIncludeResponse?: (esiIncludeResult: EsiIncludeResult) => ValueOrPromise<string>,
  esiPrefix?: string | null,
};

export default class EsiTransformStream extends XmlTransformStream {
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

    const esiPrefix = options?.esiPrefix;
    const namespaceDefs: Record<string, string> = {};
    if (esiPrefix === null) {
      // We create a document with no namespace definitions
    } else {
      if (esiPrefix != null && !/^[a-zA-Z][-a-zA-Z0-9]*$/.test(esiPrefix)) {
        throw new EsiError(`ESI namespace prefix '${esiPrefix}' is not a valid identifier.`);
      }
      // If esiPrefix is undefined, we use the default of 'esi'.
      namespaceDefs[esiPrefix ?? 'esi'] = EsiTransformer.namespace;
    }
    const document = new XmlDocument(namespaceDefs);

    // We ignore default (non-namespaced) tags. Only ESI and other namespaced tags
    // are expected to follow XML rules.
    const ignoreDefaultTags = true;

    super(document, esiTransformer, ignoreDefaultTags);
  }
}
