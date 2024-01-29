/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

// A lightweight representation of XML Elements.
// Not as heavy as @xmldom/xmldom.
// Attributes are stored as "props", similar to how they are handled
// in React.

import { xmlEncode } from "./xmlUtils.js";
import { ValueOrPromise } from "./util.js";

export type XmlProp = {
  localName: string;
  namespace: string | null | undefined;
  localNamespacePrefix: string | null;
  value: string;
};

export class XmlDocument {
  constructor(
    namespaceDefs?: { [prefix: string]: string } | null
  ) {
    this.namespaceDefs = namespaceDefs ?? {};
  }
  namespaceDefs: { [prefix: string]: string };
}

export class XmlElement {

  constructor(
    document: XmlDocument,
    name: string,
    props: { [fullname: string]: string } | null = null,
    children: XmlElementNode[] | null = null,
  ) {
    this.document = document;
    this.parent = null;

    this.namespaceDefs = {};
    this.props = {};
    if (props != null) {
      for (const [key, value] of Object.entries(props)) {
        if (key === 'xmlns') {
          this.namespaceDefs[''] = value;
        } else if (key.startsWith('xmlns:')) {
          this.namespaceDefs[key.slice(6)] = value;
        } else {
          this.addProp(key, value, false);
        }
      }
    }

    [ this.localNamespacePrefix, this.localName ] = this.parseName(name);

    this.children = [];
    if (children != null) {
      for (const child of children) {
        this.children.push(child);
        if (child instanceof XmlElement) {
          child.parent = this;
        }
      }
    }
  }

  document: XmlDocument;
  parent: XmlElement | null;

  localName: string;
  localNamespacePrefix: string | null; // null for default namespace
  get localFullname() {
    return (this.localNamespacePrefix != null ? this.localNamespacePrefix + ':' : '') +
      this.localName;
  }
  namespace: string | undefined;

  namespaceDefs: { [prefix: string]: string };

  props: { [fullname: string]: XmlProp };
  children: XmlElementNode[];

  applyNamespaces() {
    for (const child of this.children) {
      if (child instanceof XmlElement) {
        child.applyNamespaces();
      }
    }
    if (this.namespace === undefined) {
      this.namespace = this.lookupNamespace(this.localNamespacePrefix);
    }
    for (const [key, xmlProp] of Object.entries(this.props)) {
      if (xmlProp.namespace === undefined) {
        delete this.props[key];
        xmlProp.namespace = xmlProp.localNamespacePrefix != null ? this.lookupNamespace(xmlProp.localNamespacePrefix) : null;
        this.props[(xmlProp.namespace ?? '') + '|' + xmlProp.localName] = xmlProp;
      }
    }
  }

  lookupNamespace(prefix: string | null): string {
    const namespace = this.namespaceDefs[prefix ?? ''];
    if (namespace != null) {
      return namespace;
    }
    if (this.parent != null) {
      return this.parent.lookupNamespace(prefix);
    }
    const documentNamespace = this.document.namespaceDefs[prefix ?? ''];
    if (documentNamespace == null) {
      throw new Error(`Unknown namespace prefix '${prefix ?? ''}'`);
    }
    return documentNamespace;
  }

  parseName(name: string): [ string | null, string ] {
    let prefix: string | null;
    let localName: string;
    [prefix, localName] = name.split(':');
    if (localName == null) {
      localName = prefix;
      prefix = null;
    }
    return [ prefix, localName ];
  }

  addProp(key: string, value: string, resolveNamespace: boolean) {

    const [localNamespacePrefix, localName] = this.parseName(key);

    let namespace;
    if (localNamespacePrefix == null) {
      namespace = null;
    } else if (resolveNamespace) {
      namespace = this.lookupNamespace(localNamespacePrefix);
    }

    const xmlProp: XmlProp = {
      localName,
      localNamespacePrefix,
      namespace,
      value,
    }

    if (namespace === null) {
      this.props[localName] = xmlProp;
    } else if (resolveNamespace) {
      this.props[namespace + '|' + localName] = xmlProp;
    } else {
      this.props[localNamespacePrefix + ':' + localName] = xmlProp;
    }

  }

  get tagOpen() {
    return '<' +
      this.localFullname +
      Object.values(this.props)
        .map(xmlProp => {
          return ' ' +
            (xmlProp.localNamespacePrefix != null ? xmlProp.localNamespacePrefix + ':' : '') +
            xmlProp.localName +
            '="' + xmlEncode(xmlProp.value) + '"'
        })
        .join('') +
      Object.entries(this.namespaceDefs)
        .map(([prefix, value]) => {
          return ' xmlns' +
            (prefix != '' ? ':' + prefix : '') +
            '="' + xmlEncode(value) + '"'
        })
        .join('') +
      (this.children.length === 0 ? ' /' : '') +
      '>'
    ;
  }

  get tagClose() {
    if (this.children.length === 0) {
      return null;
    }
    return '</' + this.localFullname + '>';
  }

  serialize() {

    const results: string[] = [];

    results.push(this.tagOpen);

    for (const child of this.children) {

      if (typeof child === 'string') {
        results.push(child);
        break;
      }

      results.push(child.serialize());

    }

    results.push(this.tagClose ?? '');

    return results.join('');

  }

  static serialize(el: XmlElementNode | null): string {
    if (el == null) {
      return '';
    }
    if (el instanceof XmlElement) {
      if (el.localName === '_replace') {
        return el.children
          .map(x => XmlElement.serialize(x))
          .join('');
      }
      return el.serialize();
    }
    return el;
  }

}

export type XmlElementNode = XmlElement | string;

export const WalkXmlStop = Symbol();
export const WalkXmlStopRecursion = Symbol();

export type WalkResult<TResult> = undefined | TResult | typeof WalkXmlStop;

export type BeforeWalkFunc<TContext> = (this: TContext | undefined, node: XmlElementNode, parent: XmlElement | null, index: number) => ValueOrPromise<void | typeof WalkXmlStop | typeof WalkXmlStopRecursion>;
export type AfterWalkFunc<TContext, TResult> = (this: TContext | undefined, node: XmlElementNode, parent: XmlElement | null, index: number, results: undefined | (TResult | undefined)[]) => ValueOrPromise<WalkResult<TResult>>;

export async function walkXmlElements<TContext, TResult>(xmlElement: XmlElement, beforeFunc: BeforeWalkFunc<TContext> | null | undefined = null, afterFunc: AfterWalkFunc<TContext, TResult> | null | undefined = null, context: TContext | undefined = undefined, collectResults: boolean = false): Promise<undefined | TResult | typeof WalkXmlStop> {
  async function walkXmlElementWorker(stack: XmlElement[], node: XmlElementNode, parent: XmlElement | null, index: number): Promise<undefined | TResult | typeof WalkXmlStop> {
    if (node instanceof XmlElement && stack.includes(node)) {
      throw new Error('A cycle was detected at ' + JSON.stringify(node));
    }

    if (beforeFunc != null) {
      const result = await beforeFunc.call(context, node, parent, index);
      if (result === WalkXmlStop) {
        return WalkXmlStop;
      }
      if (result === WalkXmlStopRecursion) {
        return undefined;
      }
    }

    let subResults: (TResult | undefined)[] | undefined;

    // Collect results from subtrees
    if (node instanceof XmlElement) {
      if (collectResults) {
        subResults = [];
      }
      for (const [index, child] of node.children.entries()) {
        const result = await walkXmlElementWorker([...stack, node], child, node, index);
        if (result === WalkXmlStop) {
          return WalkXmlStop;
        }
        if (subResults != null) {
          subResults.push(result);
        }
      }
    }

    if (afterFunc != null) {
      return afterFunc.call(context, node, parent, index, subResults);
    }
  }

  return walkXmlElementWorker([], xmlElement, null, -1);
}

export type TransformFunc = (el: XmlElementNode, parent: XmlElement) => ValueOrPromise<void | null | XmlElementNode | XmlElementNode[]>;

export function buildTransform(document: XmlDocument, fn: TransformFunc) {
  async function applyTransform(el: XmlElementNode) {

    if (!(el instanceof XmlElement)) {
      return el;
    }

    const prevParent = el.parent;
    try {
      // Wrap in a temporary parent to simplify processing
      const root = new XmlElement(document, '_root', null, [
        el
      ]);

      await walkXmlElements(
        root,
        async (el, parent, index) => {
          if (parent == null) {
            return;
          }

          const result = await fn(el, parent);

          if (result !== undefined) {
            if (result === null) {
              parent.children[index] = new XmlElement(document, '_replace', null, []);
            } else if (Array.isArray(result)) {
              parent.children[index] = new XmlElement(document, '_replace', null, result);
            } else {
              parent.children[index] = result;
            }
            return WalkXmlStopRecursion;
          }

        },
        (el) => {
          if (el instanceof XmlElement) {
            el.children = el.children
              .reduce<XmlElementNode[]>((acc, el) => {
                if (el instanceof XmlElement && el.localName === '_replace') {
                  acc.push(...el.children);
                } else {
                  acc.push(el);
                }
                return acc;
              }, []);
          }
        },
      );

      if (root.children.length > 1) {
        return new XmlElement(document, '_replace', null, root.children);
      }
      if (root.children.length === 1) {
        return root.children[0];
      }
      return null;
    } finally {
      // Detach from temporary parent
      el.parent = prevParent;
    }

  }

  return applyTransform;

}
