// noinspection DuplicatedCode,HttpUrlsUsage

/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  applyEsiVariables,
  parseAsNumber,
  evaluateEsiVariable,
  EsiStringVariable,
  EsiListVariable,
  EsiDictionaryVariable,
  EsiAcceptLanguageVariable,
  EsiCookieVariable,
  EsiQueryStringVariable,
  EsiUserAgentVariable,
  IEsiVariables,
  EsiVariables,
} from '../../../src/EsiVariables.js';

describe('parseAsNumber', () => {

  it('non-numeric strings return undefined', () => {

    const val = parseAsNumber('foo');
    assert.strictEqual(val, undefined);

  });

  it('can parse string as a number', () => {

    const val1 = parseAsNumber('10.0');
    assert.strictEqual(val1, 10.0);

    const val2 = parseAsNumber('.0');
    assert.strictEqual(val2, 0.0);

    const val3 = parseAsNumber('10');
    assert.strictEqual(val3, 10);

  });

});

describe('EsiStringVariable', () => {

  it('can parse string as a string', () => {

    const val = new EsiStringVariable('foo');
    assert.strictEqual(val.getValue(), "'foo'");

  });

  it('can parse string as a number', () => {

    const val = new EsiStringVariable('10.0');
    assert.strictEqual(val.getValue(), "'10.0'");

  });

  it('always returns undefined for subvalue', () => {

    const val = new EsiStringVariable('foo');
    assert.strictEqual(val.getSubValue('oy'), undefined);
    assert.strictEqual(val.getSubValue('oy2'), undefined);

  });

});

describe('EsiListVariable', () => {

  it('can parse as a string', () => {

    const val = new EsiListVariable('foo', () => { return {}; });
    assert.strictEqual(val.getValue(), "'foo'");

  });

  it('can parse string as a number (though this should be rare)', () => {

    const val = new EsiListVariable('10.0', () => { return {}; });
    assert.strictEqual(val.getValue(), "'10.0'");

  });

  it('uses fn for subvalue', () => {

    const val = new EsiListVariable('foo', () => { return { 'bar': true } });
    assert.strictEqual(val.getSubValue('bar'), 'true');
    assert.strictEqual(val.getSubValue('baz'), 'false');

  });

});

describe('EsiDictionaryVariable', () => {

  it('can parse as a string', () => {

    const val = new EsiDictionaryVariable('foo', () => { return {}; });
    assert.strictEqual(val.getValue(), "'foo'");

  });

  it('can parse string as a number (though this should be rare)', () => {

    const val = new EsiDictionaryVariable('10.0', () => { return {}; });
    assert.strictEqual(val.getValue(), "'10.0'");

  });

  it('uses fn for subvalue', () => {

    const val = new EsiDictionaryVariable('foo', () => { return { 'bar': 'baz', 'hoge': '10.0' } });
    assert.strictEqual(val.getSubValue('bar'), "'baz'");
    assert.strictEqual(val.getSubValue('hoge'), "'10.0'");

  });

});

describe('EsiAcceptLanguageVariable', () => {

  it('can parse as a string', () => {

    const val = new EsiAcceptLanguageVariable('fr-CH, fr;q=0.9, , en;q=0.8, de;q=0.7, *;q=0.5');
    assert.strictEqual(val.getValue(), "'fr-CH, fr;q=0.9, , en;q=0.8, de;q=0.7, *;q=0.5'");

  });

  it('can check for subitems', () => {

    const val = new EsiAcceptLanguageVariable('fr-CH, fr;q=0.9, , en;q=0.8, de;q=0.7, *;q=0.5');
    assert.strictEqual(val.getSubValue('fr-CH'), 'true');
    assert.strictEqual(val.getSubValue('en'), 'true');
    assert.strictEqual(val.getSubValue('ja'), 'false');

  });

});

describe('EsiCookieVariable', () => {

  it('can parse as a string', () => {

    const val = new EsiCookieVariable('id=571; visits=42');
    assert.strictEqual(val.getValue(), "'id=571; visits=42'");

  });

  it('can check for subitems', () => {

    const val = new EsiCookieVariable('id=571; visits=42');
    assert.strictEqual(val.getSubValue('id'), "'571'");
    assert.strictEqual(val.getSubValue('visits'), "'42'");
    assert.strictEqual(val.getSubValue('ja'), "''");

  });

});


describe('EsiQueryStringVariable', () => {

  it('can parse as a string', () => {

    const val = new EsiQueryStringVariable('first=Robin&last=Roberts');
    assert.strictEqual(val.getValue(), "'first=Robin&last=Roberts'");

  });

  it('can check for subitems', () => {

    const val = new EsiQueryStringVariable('first=Robin&last=Roberts');
    assert.strictEqual(val.getSubValue('first'), "'Robin'");
    assert.strictEqual(val.getSubValue('last'), "'Roberts'");
    assert.strictEqual(val.getSubValue('ja'), "''");

  });

});

describe('EsiUserAgentVariable', () => {

  it('can parse as a string', () => {

    const val = new EsiUserAgentVariable('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246');
    assert.strictEqual(val.getValue(), "'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246'");

  });

  describe('Various User Agent Strings', () => {
    it('Unknown', () => {
      const val = new EsiUserAgentVariable('None');
      assert.strictEqual(val.getSubValue('browser'), "'OTHER'");
      assert.strictEqual(val.getSubValue('version'), "''");
      assert.strictEqual(val.getSubValue('os'), "'OTHER'");
    });

    it('Windows 10-based PC using Edge browser', () => {
      const val = new EsiUserAgentVariable('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246');
      assert.strictEqual(val.getSubValue('browser'), "'MOZILLA'");
      assert.strictEqual(val.getSubValue('version'), "'5.0'");
      assert.strictEqual(val.getSubValue('os'), "'WIN'");
    });

    it('Chrome OS-based laptop using Chrome browser (Chromebook)', () => {
      const val = new EsiUserAgentVariable('Mozilla/5.0 (X11; CrOS x86_64 8172.45.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.64 Safari/537.36');
      assert.strictEqual(val.getSubValue('browser'), "'MOZILLA'");
      assert.strictEqual(val.getSubValue('version'), "'5.0'");
      assert.strictEqual(val.getSubValue('os'), "'UNIX'");
    });

    it('Mac OS X-based computer using a Safari browser', () => {
      const val = new EsiUserAgentVariable('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_2) AppleWebKit/601.3.9 (KHTML, like Gecko) Version/9.0.2 Safari/601.3.9');
      assert.strictEqual(val.getSubValue('browser'), "'MOZILLA'");
      assert.strictEqual(val.getSubValue('version'), "'5.0'");
      assert.strictEqual(val.getSubValue('os'), "'MAC'");
    });

    it('Windows 7-based PC using a Chrome browser', () => {
      const val = new EsiUserAgentVariable('Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/47.0.2526.111 Safari/537.36');
      assert.strictEqual(val.getSubValue('browser'), "'MOZILLA'");
      assert.strictEqual(val.getSubValue('version'), "'5.0'");
      assert.strictEqual(val.getSubValue('os'), "'WIN'");
    });

    it('Linux-based PC using a Firefox browser', () => {
      const val = new EsiUserAgentVariable('Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:15.0) Gecko/20100101 Firefox/15.0.1');
      assert.strictEqual(val.getSubValue('browser'), "'MOZILLA'");
      assert.strictEqual(val.getSubValue('version'), "'5.0'");
      assert.strictEqual(val.getSubValue('os'), "'UNIX'");
    });

    it('Internet Explorer 11.0 on Windows', () => {
      const val = new EsiUserAgentVariable('Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; AS; rv:11.0) like Gecko');
      assert.strictEqual(val.getSubValue('browser'), "'MSIE'");
      assert.strictEqual(val.getSubValue('version'), "'5.0'");
      assert.strictEqual(val.getSubValue('os'), "'WIN'");
    });

    it('Internet Explorer 11.0 (Compat) on Windows', () => {
      const val = new EsiUserAgentVariable('Mozilla/5.0 (compatible, MSIE 11, Windows NT 6.3; Trident/7.0; rv:11.0) like Gecko');
      assert.strictEqual(val.getSubValue('browser'), "'MSIE'");
      assert.strictEqual(val.getSubValue('version'), "'5.0'");
      assert.strictEqual(val.getSubValue('os'), "'WIN'");
    });

    it('Internet Explorer 7.0 on Windows', () => {
      const val = new EsiUserAgentVariable('Mozilla/4.0 (Windows; MSIE 7.0; Windows NT 5.1; SV1; .NET CLR 2.0.50727)');
      assert.strictEqual(val.getSubValue('browser'), "'MSIE'");
      assert.strictEqual(val.getSubValue('version'), "'4.0'");
      assert.strictEqual(val.getSubValue('os'), "'WIN'");
    });

    it('Internet Explorer 5.2 on Mac', () => {
      const val = new EsiUserAgentVariable('Mozilla/4.0 (compatible; MSIE 5.2; Mac_PowerPC)');
      assert.strictEqual(val.getSubValue('browser'), "'MSIE'");
      assert.strictEqual(val.getSubValue('version'), "'4.0'");
      assert.strictEqual(val.getSubValue('os'), "'MAC'");
    });
  });

});

describe('EsiVariables', () => {

  it('Constructs from empty URL and empty headers', () => {

    new EsiVariables();

  });

  it('Empty headers gives \'empty\' AcceptLanguageVariable that returns false for all languages', () => {

    const vars = new EsiVariables();
    assert.strictEqual(vars.getValue('HTTP_ACCEPT_LANGUAGE'), "''");
    assert.strictEqual(vars.getValue('HTTP_ACCEPT_LANGUAGE', 'fr-CH'), "false");
    assert.strictEqual(vars.getValue('HTTP_ACCEPT_LANGUAGE', 'en'), "false");
    assert.strictEqual(vars.getValue('HTTP_ACCEPT_LANGUAGE', 'ja'), "false");

  });

  it('Constructs with Accept-Language header', () => {

    const headers = new Headers({
      'accept-language': 'fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5'
    });
    const vars = new EsiVariables(undefined, headers);
    assert.strictEqual(vars.getValue('HTTP_ACCEPT_LANGUAGE'), "'fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5'");
    assert.strictEqual(vars.getValue('HTTP_ACCEPT_LANGUAGE', 'fr-CH'), "true");
    assert.strictEqual(vars.getValue('HTTP_ACCEPT_LANGUAGE', 'en'), "true");
    assert.strictEqual(vars.getValue('HTTP_ACCEPT_LANGUAGE', 'ja'), "false");

  });

  it('Empty headers gives \'empty\' Cookie that returns \'\' for all keys', () => {

    const vars = new EsiVariables();
    assert.strictEqual(vars.getValue('HTTP_COOKIE'), "''");
    assert.strictEqual(vars.getValue('HTTP_COOKIE', 'id'), "''");
    assert.strictEqual(vars.getValue('HTTP_COOKIE', 'visits'), "''");
    assert.strictEqual(vars.getValue('HTTP_COOKIE', 'ja'), "''");

  });

  it('Constructs with Cookie header', () => {

    const headers = new Headers({
      'cookie': 'id=571; visits=42'
    });
    const vars = new EsiVariables(undefined, headers);
    assert.strictEqual(vars.getValue('HTTP_COOKIE'), "'id=571; visits=42'");
    assert.strictEqual(vars.getValue('HTTP_COOKIE', 'id'), "'571'");
    assert.strictEqual(vars.getValue('HTTP_COOKIE', 'visits'), "'42'");
    assert.strictEqual(vars.getValue('HTTP_COOKIE', 'ja'), "''");

  });

  it('Constructs with Host header', () => {

    const headers = new Headers({
      'host': 'esi.xyz.com'
    });
    const vars = new EsiVariables(undefined, headers);
    assert.strictEqual(vars.getValue('HTTP_HOST'), "'esi.xyz.com'");

  });

  it('Constructs with Referer header', () => {

    const headers = new Headers({
      'referer': 'http://roberts.xyz.com/'
    });
    const vars = new EsiVariables(undefined, headers);
    assert.strictEqual(vars.getValue('HTTP_REFERER'), "'http://roberts.xyz.com/'");

  });

  it('Constructs with User-Agent header', () => {

    const headers = new Headers({
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246'
    });
    const vars = new EsiVariables(undefined, headers);
    assert.strictEqual(vars.getValue('HTTP_USER_AGENT'), "'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246'");
    assert.strictEqual(vars.getValue('HTTP_USER_AGENT', 'browser'), "'MOZILLA'");
    assert.strictEqual(vars.getValue('HTTP_USER_AGENT', 'version'), "'5.0'");
    assert.strictEqual(vars.getValue('HTTP_USER_AGENT', 'os'), "'WIN'");

  });

  it('Constructs with query parameters', () => {

    const url = new URL('http://www.example.com/foo?bar=baz&hoge=piyo&_hi=/ho');
    const vars = new EsiVariables(url);

    assert.strictEqual(vars.getValue('QUERY_STRING'), "'bar=baz&hoge=piyo&_hi=/ho'");
    assert.strictEqual(vars.getValue('QUERY_STRING', 'bar'), "'baz'");
    assert.strictEqual(vars.getValue('QUERY_STRING', 'hoge'), "'piyo'");
    assert.strictEqual(vars.getValue('QUERY_STRING', '_hi'), "'/ho'");

  });

});

describe('applyEsiVariables', () => {

  it('passes undefined through', () => {
    const result = applyEsiVariables(undefined);
    assert.strictEqual(result, undefined);
  });

  it('applies nonempty variables and subkeys', () => {
    const vars: IEsiVariables = {
      getValue(name: string, subKey: string | null): string | undefined {
        if (name === 'FOO') {
          return "'foo'";
        }
        if (name === 'BAR') {
          return "'bar'";
        }
        if (name === 'BAZ' && subKey === 'GOO') {
          return "'goo'";
        }
        return undefined;
      }
    }

    const result = applyEsiVariables(`abc$(FOO)def$(BAR)ghi$(BAZ{GOO})`, vars);
    assert.strictEqual(result, 'abcfoodefbarghigoo');
  });

  it('empty or nonexistent variables evaluate to an empty string', () => {

    const vars: IEsiVariables = {
      getValue(name: string, _: string | null): string | undefined {
        if (name === 'FOO') {
          return '';
        }
        return undefined;
      }
    }

    const result = applyEsiVariables('abc$(FOO)def$(BAR)ghi$(BAZ{GOO})', vars);
    assert.strictEqual(result, 'abcdefghi');

  });

  it('empty or nonexistent variables evaluate to an empty string, and use default value', () => {

    const vars: IEsiVariables = {
      getValue(name: string, _: string | null): string | undefined {
        if (name === 'FOO') {
          return '';
        }
        return undefined;
      }
    }

    const result = applyEsiVariables('abc$(FOO|oy)def$(BAR|\'oy vey\')ghi$(BAZ{GOO}|tok)', vars);
    assert.strictEqual(result, 'abcoydefoy veyghitok');

  });

});

describe('evaluateEsiVariable', () => {

  it('throws if undefined or not a variable expression', () => {

    assert.throws(() => {
      evaluateEsiVariable(undefined);
    }, (ex) => {
      assert.ok(ex instanceof Error);
      assert.strictEqual(ex.message, 'invalid variable format');
      return true;
    });

  });

  it('applies nonempty variables and subkeys', () => {
    const vars: IEsiVariables = {
      getValue(name: string, subKey: string | null): string | undefined {
        if (name === 'FOO') {
          return "'foo'";
        }
        if (name === 'BAR') {
          return "'bar'";
        }
        if (name === 'BAZ' && subKey === 'GOO') {
          return "'goo'";
        }
        if (name === 'LIST' && subKey === 'YES') {
          return "true";
        }
        if (name === 'LIST' && subKey === 'NO') {
          return "false";
        }
        return undefined;
      }
    }

    assert.strictEqual(evaluateEsiVariable('$(FOO)', vars), "'foo'");
    assert.strictEqual(evaluateEsiVariable('$(BAR)', vars), "'bar'");
    assert.strictEqual(evaluateEsiVariable('$(BAZ{GOO})', vars), "'goo'");
    assert.strictEqual(evaluateEsiVariable('$(LIST{YES})', vars), "true");
    assert.strictEqual(evaluateEsiVariable('$(LIST{NO})', vars), "false");
    assert.strictEqual(evaluateEsiVariable('$(UNKNOWN)', vars), undefined);
  });
});
