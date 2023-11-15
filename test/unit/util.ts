/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

const textEncoder = new TextEncoder();

export function stringsToReadableStream(...strs: string[]) {

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const str of strs) {
        const chunk = textEncoder.encode(str);
        controller.enqueue(chunk);
      }
      controller.close();
    }
  });

}

export function readableStreamToString(stream: ReadableStream<Uint8Array>) {

  const tempRes = new Response(stream);
  return tempRes.text();

}
