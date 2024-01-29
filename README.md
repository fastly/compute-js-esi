# Edge Side Includes (ESI) for Fastly Compute JavaScript

Run [Edge Side Includes (ESI)](https://www.w3.org/TR/esi-lang/) at the edge in your Fastly Compute JavaScript application.

## Usage

```
npm install @fastly/esi
```

This is designed to be very easy to use:

```javascript
/// <reference types="@fastly/js-compute" />
import { EsiTransformStream } from "@fastly/esi";

addEventListener("fetch", (event) => event.respondWith(handleRequest(event)));

async function handleRequest(event) {
  const req = event.request;

  // Perform a backend request
  const url = new URL(req.url);
  const headers = new Headers(req.headers);

  const beresp = await fetch(url, {
    headers,
    backend: 'origin_0'
  });

  // Initialize the ESI Transformation
  const esiTransformStream = new EsiTransformStream(url, headers, {
    fetch(input, init) {
      return fetch(input, { ...init, backend: 'origin_0' });
    },
  });
  
  // Simply use pipeThrough
  const transformedResponse = beresp.body.pipeThrough(esiTransformStream); 

  return new Response(transformedResponse, {
    status: beresp.status,
    headers: beresp.headers,
  });
}
```

> NOTE: `@fastly/esi` is provided as a Fastly Labs product. Visit the [Fastly Labs](https://www.fastlylabs.com/) site for terms of use.

## API

### `EsiTransformStream` constructor

```javascript
const esiTransformStream = new EsiTransformStream(url, headers, options);
```

Initializes the ESI transformation stream using the following values. These values are used in handling
`esi:include` tags as well as providing values for ESI variables.

For predictable results, pass the same values as you used to make the backend request.
In most cases, the only value you need to pass for `options` is `fetch` &mdash; to provide the
`backend` used by `fetch()` resulting from `esi:include` tags.

* `url` - the absolute URL where the resource was fetched from, used to resolve relative URLs, as well
    as used by ESI variables.
* `headers` - the headers, which will be sent along with the subrequests caused by `esi:include`, as
    well as used by ESI variables. 
* `options` - an object with the following keys:

  * `fetch(input, init)` (optional)
    
    The `fetch()` function called whenever an `esi:include` tag is encountered. If not specified, the
    global `fetch()` function is used.
      - It will be called with the resolved, absolute URL of the resource being requested, along with
        the `headers` passed in to the constructor, with the exception that if the resource is being
        requested from a different host, then the `host` header is set to that of the resource being
        requested.
      - A common use of providing this function in Fastly Compute is to add the `backend` value as
        a fetch is being made. This is not needed when you're using dynamic backends.
        ```javascript
          const esiTransformStream = new EsiTransformStream(url, headers, {
            fetch(input, init) {
              return fetch(input, { ...init, backend: 'origin_0' });
            },
          });
        ```

  * `processIncludeResponse(esiIncludeResult)` (optional)
  
    A function called after a `fetch()` from `esi:include` has succeeded. It is called with an object
    that contains the following keys:
      - `url` - the resolved, absolute URL of the document obtained by the `esi:include` tag.
      - `headers` - the HTTP headers used when fetching the resource requested by the `esi:include` tag.
        > Note: The above values are as they were when the `fetch` function was called.
        If you provided an override `fetch` function that caused the resource to be obtained
        from another location, or using modified headers, those are not reflected in the above values.
      - `response` - the `Response` object returned by the `fetch()` call.

    This function is expected to return a `string`, or a `Promise` resolving to a `string`, which
    is used by the transformer to replace the entire `esi:include` tag in the stream.
    This value is optional, and should only be used in advanced cases, with care.

    > The default functionality recursively passes the response through another `EsiTransformationStream`
    such that templates may call into additional templates.
   
  * `handleIncludeError(xmlElement)` (optional)

    A function called when resources requested by both the `src` and `alt` (if provided) values of an
    `esi:include` tag have been tried, and have resulted in errors. The function can return a `string`
    or a `Promise` that resolves to a `string` that will be used to replace the entire `esi:include`
    tag, or `null`.

    > If this is not specified, or if this returns `null` or a `Promise` that resolves to `null`, then
    the default behavior is to throw an `EsiIncludeError` error.

  * `esiPrefix` (optional, advanced)

    A string value or `null`, used to specify a default XML prefix identifier to interpret as an ESI tag.

    > The default value is `'esi'` for convenience. If you wish to suppress this functionality altogether,
    set this value to `null`. See [XML Namespacing](#xml-namespacing) below for details.

## Notes

### Supported tags

At the current time, the following tags are supported as [described in the specification](https://www.w3.org/TR/esi-lang/):

* esi:include
* esi:comment
* esi:remove
* esi:try / esi:attempt / esi:except
* esi:choose / esi:when / esi:otherwise
* esi:vars

ESI Variables are supported in the attributes of ESI tags.
ESI Expressions are supported in the `test` attribute of `esi:when`.

Additionally, the &lt;!--esi ...--&gt; comment is supported.

The following tags are not supported:

* esi:inline

### Errors

If an error from `esi:include` is not handled, or you handle it and return `null` (via the
`handleIncludeError` option), the stream will throw a `EsiIncludeError`. Note that if this happens
on a stream that is being read by `event.respondWith()`, then the platform has already sent the
status code and headers, and is already streaming to the client. Therefore, it is too late to
respond to this error or send alternate status codes or headers.

If you wish to return an alternate status code, then you must stream the entire response to memory,
make sure there are no errors, and then return that buffer.

```javascript
  const value = new Response(beresp.body.pipeThrough(esiTransformStream));

  let buffer;
  try {
    buffer = await value.arrayBuffer();
  } catch(ex) {
    if(!(ex instanceof EsiIncludeError)) {
      throw ex;
    }

    return new Response(
      'esi:include error',
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
```

Because this could result in a longer TTFB, it is ideal to handle the errors from `esi:include`.

### Backend requests

This library currently does not impose limits on the number or depth of esi:include tags that can be processed
during a single request, but as esi:include tags will cause a backend request,
[they are subject to constraints](https://developer.fastly.com/learning/compute/#limitations-and-constraints)
at the platform level.

### XML tags in HTML

ESI tags are [defined as an XML-based language](https://www.w3.org/TR/esi-lang/). This means they must follow
all the strict rules of XML, such as attribute quoting and matching closing tags.  However, because this library is
designed to work in an HTML context, it only processes and enforces these rules for non-default tags (only if
they appear in an XML namespace). All non-namespaced HTML tags, as well as their attributes and content, are
ignored by the transformation and passed straight through to the output stream.

Non-default tags not recognized by this library (i.e., those that belong to other namespaces) are checked for conformity
with XML rules but are passed through to the output without any processing.

### XML Namespacing

This is advanced information provided for completeness.

ESI tags are defined as XML tags that live in the `http://www.edge-delivery.org/esi/1.0` namespace.
This means that formally, the namespace needs to be declared in the tag itself or in any parent tag, e.g.:

```html
foo<esi:include src="/bar" xmlns:esi="http://www.edge-delivery.org/esi/1.0"/>baz
```
or
```html
<html xmlns:esi="http://www.edge-delivery.org/esi/1.0">
foo<esi:include src="/bar" />baz
</html>
```

However, because this library is designed to be usable as a drop-in replacement for contexts that don't require
this declaration, the document model used by `EsiTransformStream` is initialized by default to declare this namespace
declaration.

If you'd like to use a different identifier than `'esi'`, provide it as the `esiPrefix` value to the constructor of
`EsiTransformStream`. This may be useful if you are using multiple this library in conjunction with another library that
uses the `esi` prefix for its own use.

For example, if you set up your transform stream like this:
```javascript
const esiTransformStream = new EsiTransformStream(url, headers, {
  esiPrefix: 'my-esi'
});
```

Then, if you have a document like this, its various tags will be handled as described:
```html
<!-- EsiTransformStream knows about my-esi, so this is treated as an ESI include -->
<my-esi:include src="/foo" />
<!-- EsiTransform does not know about esi, so this is not handled -->  
<esi:include src="/bar" />
<!-- Attribute on the tag explicitly sets namespace, so this is treated as an ESI include -->
<esi:include src="/bar" xmlns:esi="http://www.edge-delivery.org/esi/1.0" />
```

If you wish to disable to feature altogether, it's also possible to set the value to `null`:
```javascript
const esiTransformStream = new EsiTransformStream(url, headers, {
  esiPrefix: null
});
```

Note that if you do this, then `EsiTransformStream` will not know about any ESI namespaces,
so you will need to specify the namespace in your document.

* IMPORTANT: If you use this feature, keep in mind that this library does not (currently) process default tags (such
as HTML tags). Unfortunately, this also includes XML namespace attributes on such tags. If you use this feature, be sure
to put the `xmlns` declaration on the ESI tag itself. 

  For example, at the moment, the following `xmlns:esi` attribute will not be acknowledged:
  ```html
  <html xmlns:esi="http://www.edge-delivery.org/esi/1.0">
    <esi:include src="/foo" /> <!-- Won't be recognized! -->
  </html>
  ```

  Instead, do this:
  ```html
  <html>
    <esi:include src="/foo" xmlns:esi="http://www.edge-delivery.org/esi/1.0" /> <!-- Works! -->
  </html>
  ```

## Issues

If you encounter any non-security-related bug or unexpected behavior, please [file an issue][bug]
using the bug report template.

[bug]: https://github.com/fastly/compute-js-esi/issues/new?labels=bug

### Security issues

Please see our [SECURITY.md](./SECURITY.md) for guidance on reporting security-related issues.

## License

[MIT](./LICENSE).
