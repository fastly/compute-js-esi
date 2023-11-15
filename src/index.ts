/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

/// <reference types="@fastly/js-compute" />

export {
  default as EsiTransformer,
  EsiIncludeError,
  EsiTransformerOptions,
} from './EsiTransformer.js';
export { default as EsiTransformStream } from './EsiTransformStream.js';
export { default as StreamerState } from './StreamerState.js';
export { ValueOrPromise } from './util.js';
export {
  XmlProp,
  XmlDocument,
  XmlElement,
  XmlElementNode,
  WalkXmlStop,
  WalkXmlStopRecursion,
  WalkResult,
  BeforeWalkFunc,
  AfterWalkFunc,
  walkXmlElements,
  TransformFunc,
  buildTransform,
} from './XmlModel.js';
export {
  XmlStreamerParseOptions,
  XmlStreamerContext,
} from './XmlStreamer.js';
export {
  xmlEncode,
  xmlDecode,
} from './xmlUtils.js';
