/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

/// <reference types="@fastly/js-compute" />

import { EsiIncludeError, EsiTransformStream } from "@fastly/esi";

addEventListener("fetch", (event) => event.respondWith(handleRequest(event)));

async function handleRequest(event) {

  const req = event.request;

  const headers = new Headers(req.headers);
  headers.set('host', 'localhost:8080');

  const beresp = await fetch(req.url, {
    headers,
    backend: 'origin_0'
  });

  const esiTransformStream = new EsiTransformStream(req.url, headers, {
    fetch(input, init) {
      const urlToFetch = new URL(input instanceof Request ? input.url : input);

      init ??= {};
      if (urlToFetch.host === new URL(req.url).host) {
        init.backend = 'origin_0';
      }

      return fetch(input, init);
    }
  });

  // If we want to follow ESI Processor's spec of emitting with a status code greater than 400 and
  // an error message, we must stream the entire result first

  // We can make a handler for when there is an error.  That would allow you to insert arbitrary
  // text. But since we are already streaming, it's too late to change status codes or emit other headers etc

  // It might also be cool to allow you to specify a custom "on include" handler to esi stream

  const value = new Response(beresp.body.pipeThrough(esiTransformStream));

  let buffer;
  try {
    buffer = await value.arrayBuffer();
  } catch(ex) {
    const errorMessage = ex instanceof EsiIncludeError ? 'esi-include-error' : 'general-error';

    return new Response(
      errorMessage,
      {
        status: 500,
      },
    );
  }

  return new Response(
    buffer,
    {
      status: beresp.status,
      headers: beresp.headers,
    },
  );
}
