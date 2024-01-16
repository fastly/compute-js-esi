/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { quoteString, unquoteString } from "./util.js";

const NUMBER_TEST = /^(\d+(\.\d*)?|\.\d+)$/

export interface IEsiVariable {
  getValue(): string | undefined;
  getSubValue(key: string): string | undefined;
}

export function parseAsNumber(val: string | undefined) {
  if (val === undefined || !NUMBER_TEST.test(val)) {
    return undefined;
  }
  return parseInt('0' + val, 10);
}

export class EsiStringVariable implements IEsiVariable {
  value: string;
  constructor(value: string) {
    this.value = value;
  }

  getSubValue(_key: string): string | undefined {
    return undefined;
  }

  getValue(): string | undefined {
    return quoteString(this.value);
  }
}

type EsiListDefFunc = (value: string) => { [k: string]: boolean };
export class EsiListVariable implements IEsiVariable {
  value: string;
  fn: EsiListDefFunc;
  map?: { [k: string]: boolean };

  constructor(value: string, fn: EsiListDefFunc) {
    this.value = value;
    this.fn = fn;
  }

  getSubValue(key: string): string | undefined {
    if (this.map === undefined) {
      this.map = this.fn(this.value);
    }
    return (this.map[key] ?? false) ? 'true' : 'false';
  }

  getValue(): string | undefined {
    return quoteString(this.value);
  }
}

type EsiDictionaryDefFunc = (value: string) => { [k: string]: string | undefined };
export class EsiDictionaryVariable implements IEsiVariable {
  value: string;
  fn: EsiDictionaryDefFunc;
  map?: { [k: string]: string | undefined };

  constructor(value: string, fn: EsiDictionaryDefFunc) {
    this.value = value;
    this.fn = fn;
  }

  getSubValue(key: string): string | undefined {
    if (this.map === undefined) {
      this.map = this.fn(this.value);
    }
    const value = this.map[key] ?? '';
    return quoteString(value);
  }

  getValue(): string | undefined {
    return quoteString(this.value);
  }

}

export class EsiAcceptLanguageVariable extends EsiListVariable {
  constructor(value: string) {

    super(value, (value) => {
      const langs = value.split(',')
        .map(seg => seg.split(';')[0].trim())
        .filter(Boolean);

      const map: { [k:string]: boolean } = {};
      for (const lang of langs) {
        map[decodeURIComponent(lang)] = true;
      }
      return map;
    });
  }
}

export class EsiCookieVariable extends EsiDictionaryVariable {

  constructor(value: string) {

    super(value, (value) => {
      const cookieEntries = value.split(';')
        .map(seg => {
          const pieces = seg.split('=');
          const key = pieces.shift();
          return [key, pieces.join('=')];
        });

      const map: { [k:string]: string } = {};
      for (const [key, value] of cookieEntries) {
        if (key == null || value == null) {
          continue;
        }
        const k = key.trim();
        const v = value.trim();
        if (k === '' || v === '') {
          continue;
        }
        map[decodeURIComponent(k)] = decodeURIComponent(v);
      }
      return map;

    });
  }

}

export class EsiQueryStringVariable extends EsiDictionaryVariable {

  constructor(value: string) {

    super(value, (value) => {
      const map: { [k:string]: string } = {};
      for (const [k, v] of new URLSearchParams(value)) {
        map[k] = v;
      }
      return map;

    });
  }

}

const USER_AGENT_REGEX = /^(?<browser>[^\/]+)\/(?<version>\d+(\.\d*))/;
export class EsiUserAgentVariable extends EsiDictionaryVariable {
  constructor(value: string) {
    super(value, (value) => {
      let browser: string = 'OTHER';
      let version: string | undefined = undefined;
      let os: string = 'OTHER';

      if (value.includes('Windows')) {
        os = 'WIN';
      } else if (value.includes('Mac OS X') || value.includes('Mac_PowerPC')) {
        os = 'MAC';
      } else if (
        value.includes('Linux') ||
        value.includes('Unix') ||
        value.includes('BSD') ||
        value.includes('CrOS')
      ) {
        os = 'UNIX';
      }

      const matchResult = USER_AGENT_REGEX.exec(value);
      if (matchResult != null) {
        if (matchResult.groups?.['browser']?.toUpperCase() === 'MOZILLA') {
          browser = 'MOZILLA';
        }
        version = matchResult.groups?.['version'];
      }

      if (value.includes('MSIE') || value.includes('Trident/')) {
        browser = 'MSIE';
      }

      return { browser, version, os };

    });
  }
}

export interface IEsiVariables {
  getValue(name: string, subKey: string | null): string | undefined;
}

export class EsiVariables implements IEsiVariables {

  values: { [name: string]: IEsiVariable | undefined } = {};

  constructor(url?: URL, headers?: Headers) {

    const httpAcceptLanguageValue = headers?.get('accept-language') ?? '';
    this.values['HTTP_ACCEPT_LANGUAGE'] = new EsiAcceptLanguageVariable(httpAcceptLanguageValue);

    const httpCookieValue = headers?.get('cookie') ?? '';
    this.values['HTTP_COOKIE'] = new EsiCookieVariable(httpCookieValue);

    const httpHostValue = headers?.get('host');
    if (httpHostValue != null) {
      this.values['HTTP_HOST'] = new EsiStringVariable(httpHostValue);
    }

    const httpRefererValue = headers?.get('referer');
    if (httpRefererValue != null) {
      this.values['HTTP_REFERER'] = new EsiStringVariable(httpRefererValue);
    }

    const httpUserAgentValue = headers?.get('user-agent');
    if (httpUserAgentValue != null) {
      this.values['HTTP_USER_AGENT'] = new EsiUserAgentVariable(httpUserAgentValue);
    }

    let queryStringValue = url?.search;
    while (queryStringValue?.startsWith('?')) {
      queryStringValue = queryStringValue.slice(1);
    }

    if (queryStringValue != null) {
      this.values['QUERY_STRING'] = new EsiQueryStringVariable(queryStringValue);
    }
  }

  getValue(name: string, subKey: string | null = null): string | undefined {
    if (subKey == null) {
      return this.values[name]?.getValue();
    }
    return this.values[name]?.getSubValue(subKey);
  }
}

function evaluateEsiVariableValue(groups: { [key: string]: string | undefined }, vars?: IEsiVariables) {

  const varName = groups['varName']!;
  const subkeyName = groups['subkeyName'] ?? null;

  const value = vars?.getValue(varName, subkeyName);

  if (value === undefined || value === '' || value === 'false') {
    const defaultValue = groups['defaultValue1'] ?? groups['defaultValue2'];
    if (defaultValue != null) {
      return quoteString(defaultValue);
    }
  }

  return value;
}

const ESI_VARIABLES_REGEX = /\$\((?<varName>[-_A-Z]+)(?:\{(?<subkeyName>[-_A-Za-z0-9]+)})?(?:\|(?:(?<defaultValue1>[^\s']+)|'(?<defaultValue2>[^']*)'))?\)/g;
export function applyEsiVariables(input: string | undefined, vars?: IEsiVariables): string | undefined {
  if (input == null) {
    return undefined;
  }

  return input.replace(ESI_VARIABLES_REGEX, (_, ...args: any[]) => {
    const groups: { [key: string]: string | undefined } = args[args.length - 1];
    const value = evaluateEsiVariableValue(groups, vars);
    if (value === undefined || value === '' || value === 'true' || value === 'false') {
      return '';
    }
    return unquoteString(value);
  });
}

const ESI_VARIABLE_REGEX = /^\$\((?<varName>[-_A-Z]+)(?:\{(?<subkeyName>[-_A-Za-z0-9]+)})?(?:\|(?:(?<defaultValue1>[^\s']+)|'(?<defaultValue2>[^']*)'))?\)$/;
export function evaluateEsiVariable(input: string | undefined, vars?: IEsiVariables) {
  const match = ESI_VARIABLE_REGEX.exec(input ?? '');
  if (match == null || match.groups == null) {
    throw new Error('invalid variable format');
  }

  return evaluateEsiVariableValue(match?.groups, vars);
}
