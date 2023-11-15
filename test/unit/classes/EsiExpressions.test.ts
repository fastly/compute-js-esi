// noinspection DuplicatedCode

/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import {
  EsiExpressionEvaluator, EsiExpressionValue,
  ExpressionEvaluator, LexerToken,
  LexerTokenDefs,
  ParserOpDef, ParserTable,
  StringLexer,
  StringReader
} from "../../../src/EsiExpressions.js";
import {IEsiVariables} from "../../../src/EsiVariables.js";

describe('StringReader', () => {

  it('Constructs', () => {
    new StringReader();
  });

  it('Can set data', () => {
    const stringReader = new StringReader();
    stringReader.set('foo');
    assert.strictEqual(stringReader.text, 'foo');
    assert.strictEqual(stringReader.length, 'foo'.length);
    assert.strictEqual(stringReader.offset, 0);
  });

  it('can add offset', () => {
    const stringReader = new StringReader();
    stringReader.set('foo');
    assert.strictEqual(stringReader.offset, 0);
    stringReader.addOffset(1);
    assert.strictEqual(stringReader.offset, 1);
  });

  it('can reset', () => {
    const stringReader = new StringReader();
    stringReader.set('foo');
    assert.strictEqual(stringReader.offset, 0);
    stringReader.addOffset(1);
    assert.strictEqual(stringReader.offset, 1);
    stringReader.reset();
    assert.strictEqual(stringReader.offset, 0);
  });

  it('can get', () => {
    const stringReader = new StringReader();
    stringReader.set('foo');
    assert.strictEqual(stringReader.get(), 'foo');
  });

  it('can get after addOffset', () => {
    const stringReader = new StringReader();
    stringReader.set('foo');
    stringReader.addOffset(1);
    assert.strictEqual(stringReader.get(), 'oo');
  });

  it('can tell us if we\'ve overrun EOF', () => {
    const stringReader = new StringReader();
    stringReader.set('foo');
    assert.ok(!stringReader.isEOF());
    stringReader.addOffset(1);
    assert.ok(!stringReader.isEOF());
    stringReader.addOffset(1);
    assert.ok(!stringReader.isEOF());
    stringReader.addOffset(1);
    assert.ok(stringReader.isEOF());
    stringReader.addOffset(1);
    assert.ok(stringReader.isEOF());
  });

});

describe('StringLexer', () => {

  it('can construct', () => {
    new StringLexer();
  });

  it('can construct with token definitions', () => {

    const tokenDefs: LexerTokenDefs = {
      words:       /^[a-z][a-z0-9]*/i,
      whitespaces: /^\s+/,
      numbers:     /^\d+/,
      string: [
        /^".*?[^\\]"/,
        /^'.*?[^\\]'/
      ]
    };

    new StringLexer({tokenDefs});

  });

  it('can tokenize sample text', () => {

    const tokenDefs: LexerTokenDefs = {
      words:       /^[a-z][a-z0-9]*/i,
      whitespaces: /^\s+/,
      numbers:     /^\d+/,
      string: [
        /^".*?[^\\]"/,
        /^'.*?[^\\]'/
      ]
    };

    const stringLexer = new StringLexer({tokenDefs});

    const tokenized = stringLexer.tokenize('test123 1500 "foo bar"');

    assert.deepStrictEqual(tokenized, [
      { type: 'words', text: 'test123' },
      { type: 'whitespaces', text: ' ' },
      { type: 'numbers', text: '1500' },
      { type: 'whitespaces', text: ' ' },
      { type: 'string', text: '"foo bar"' },
    ]);
  });

  it('can tokenize expression', () => {

    const tokenDefs: LexerTokenDefs = {
      whitespace:  /^\s+/,
      variables:   /^[a-z]+/,
      operators:   /^[(+\-*\/)]/,
    };

    const stringLexer = new StringLexer({tokenDefs});

    const tokenized = stringLexer.tokenize('e*((a*(b+c))+d)');

    const tokens = tokenized
      .filter(x => x.type !== 'whitespace')
      .map(x => x.text);

    assert.deepStrictEqual(tokens, [
      'e', '*', '(', '(', 'a', '*', '(', 'b', '+', 'c', ')', ')', '+', 'd', ')'
    ]);
  });

  describe('ESI expressions', () => {
    const stringLexer = new StringLexer({tokenDefs: EsiExpressionEvaluator.LEXER_TOKEN_DEFS});

    function stripWhitespaceAndFlatten(tokens: LexerToken[]) {
      return tokens.filter(x => x.type !== 'whitespace')
        .map(x => x.text)
    }

    it('test case 1', () => {
      const tokens = stringLexer.tokenize("$(HTTP_HOST) == 'example.com'");
      const tokensFlat = stripWhitespaceAndFlatten(tokens);

      assert.deepStrictEqual(tokensFlat, [
        '$(HTTP_HOST)', '==', "'example.com'",
      ]);
    });

    it('test case 2', () => {
      const tokens = stringLexer.tokenize('!(1==1)');
      const tokensFlat = stripWhitespaceAndFlatten(tokens);

      assert.deepStrictEqual(tokensFlat, [
        '!', '(', '1', '==', '1', ')'
      ]);
    });

    it('test case 3', () => {
      const tokens = stringLexer.tokenize("!('a'<='c')");
      const tokensFlat = stripWhitespaceAndFlatten(tokens);

      assert.deepStrictEqual(tokensFlat, [
        '!', '(', "'a'", '<=', "'c'", ')'
      ]);
    });

    it('test case 4', () => {
      const tokens = stringLexer.tokenize("(1==1)|('abc'=='def')");
      const tokensFlat = stripWhitespaceAndFlatten(tokens);

      assert.deepStrictEqual(tokensFlat, [
        '(', '1', '==', '1', ')', '|', '(', "'abc'", '==', "'def'", ')'
      ]);
    });

    it('test case 5', () => {
      const tokens = stringLexer.tokenize('(4!=5)&(4==5)');
      const tokensFlat = stripWhitespaceAndFlatten(tokens);

      assert.deepStrictEqual(tokensFlat, [
        '(', '4', '!=', '5', ')', '&', '(', '4', '==', '5', ')'
      ]);
    });

    it('test case 5a', () => {
      const tokens = stringLexer.tokenize('(4!=5)&!(4==5)');
      const tokensFlat = stripWhitespaceAndFlatten(tokens);

      assert.deepStrictEqual(tokensFlat, [
        '(', '4', '!=', '5', ')', '&', '!', '(', '4', '==', '5', ')'
      ]);
    });

    it('test case 6', () => {
      const tokens = stringLexer.tokenize("$(HTTP_COOKIE{group})=='Advanced'");
      const tokensFlat = stripWhitespaceAndFlatten(tokens);

      assert.deepStrictEqual(tokensFlat, [
        '$(HTTP_COOKIE{group})', '==', "'Advanced'"
      ]);
    });

  });

});

describe('ExpressionParser', () => {
  it('constructs', () => {
    new ExpressionEvaluator();
  });

  it('parses tokens', () => {

    const factor: ParserOpDef = {
      precedence: 2,
      associativity: 'left',
    };

    const addend: ParserOpDef = {
      precedence: 1,
      associativity: 'left',
    };

    const evaluator = new ExpressionEvaluator({
      '+': addend,
      '-': addend,
      '*': factor,
      '/': factor,
    });

    const tokens = [
      'e', '*', '(', '(', 'a', '*', '(', 'b', '+', 'c', ')', ')', '+', 'd', ')'
    ];

    const parsedTokens = evaluator.evaluateTokens(tokens);

    assert.deepStrictEqual(parsedTokens, [
      'e', 'a', 'b', 'c', '+', '*', 'd', '+', '*'
    ]);
  });

  describe('tokens for ESI', () => {

    const table: ParserTable = {
      '==': {
        precedence: 4,
        associativity: 'left',
      },
      '!=': {
        precedence: 4,
        associativity: 'left',
      },
      '<=': {
        precedence: 4,
        associativity: 'left',
      },
      '>=': {
        precedence: 4,
        associativity: 'left',
      },
      '<': {
        precedence: 4,
        associativity: 'left',
      },
      '>': {
        precedence: 4,
        associativity: 'left',
      },
      '!': {
        precedence: 3,
        associativity: 'right',
      },
      '&': {
        precedence: 2,
        associativity: 'left',
      },
      '|': {
        precedence: 1,
        associativity: 'left',
      },
    };

    const evaluator = new ExpressionEvaluator(table);

    it('test case 1', () => {
      const tokens = [
        '$(HTTP_HOST)', '==', "'example.com'"
      ];

      const parsedTokens = evaluator.evaluateTokens(tokens);
      assert.deepStrictEqual(parsedTokens, [
        '$(HTTP_HOST)', "'example.com'", '=='
      ]);
    });

    it('test case 2', () => {
      const tokens = [
        '!', '(', '1', '==', '1', ')'
      ];

      const parsedTokens = evaluator.evaluateTokens(tokens);
      assert.deepStrictEqual(parsedTokens, [
        '1', '1', '==', '!'
      ]);
    });

    it('test case 3', () => {
      const tokens = [
        '!', '(', "'a'", '<=', "'c'", ')'
      ];

      const parsedTokens = evaluator.evaluateTokens(tokens);
      assert.deepStrictEqual(parsedTokens, [
        "'a'", "'c'", '<=', '!'
      ]);
    });

    it('test case 4', () => {
      const tokens = [
        '(', '1', '==', '1', ')', '|', '(', "'abc'", '==', "'def'", ')'
      ];

      const parsedTokens = evaluator.evaluateTokens(tokens);
      assert.deepStrictEqual(parsedTokens, [
        '1', '1', '==', "'abc'", "'def'", '==', '|'
      ]);
    });

    it('test case 5', () => {
      const tokens = [
        '(', '4', '!=', '5', ')', '&', '(', '4', '==', '5', ')'
      ];

      const parsedTokens = evaluator.evaluateTokens(tokens);
      assert.deepStrictEqual(parsedTokens, [
        '4', '5', '!=', '4', '5', '==', '&'
      ]);
    });

    it('test case 5a', () => {
      const tokens = [
        '(', '4', '!=', '5', ')', '&', '!', '(', '4', '==', '5', ')'
      ];

      const parsedTokens = evaluator.evaluateTokens(tokens);
      assert.deepStrictEqual(parsedTokens, [
        '4', '5', '!=', '4', '5', '==', '!', '&'
      ]);
    });

    it('test case 6', () => {
      const tokens = [
        '$(HTTP_COOKIE{group})', '==', "'Advanced'"
      ];

      const parsedTokens = evaluator.evaluateTokens(tokens);
      assert.deepStrictEqual(parsedTokens, [
        '$(HTTP_COOKIE{group})', "'Advanced'", '=='
      ]);
    });
  });
});

describe('EsiExpressionEvaluator', () => {

  const vars: IEsiVariables = {
    getValue(name: string, subKey: string | null): string | undefined {
      if (name === 'HTTP_HOST') {
        return "'example.com'";
      }
      if (name === 'HTTP_COOKIE' && subKey === 'group') {
        return "'standard'";
      }
      return undefined;
    }
  }

  const evaluator = new EsiExpressionEvaluator(vars);

  describe('Tokenization', () => {

    it('test case 1', () => {
      const parsedTokens = evaluator.tokenize("$(HTTP_HOST) == 'example.com'");
      assert.deepStrictEqual(parsedTokens, [
        { type: 'string', value: 'example.com' },
        { type: 'operator', value: '==' },
        { type: 'string', value: 'example.com' },
      ]);
    });

    it('test case 2', () => {
      const parsedTokens = evaluator.tokenize('!(1==1)');
      assert.deepStrictEqual(parsedTokens, [
        { type: 'operator', value: '!' },
        { type: 'openParen' },
        { type: 'number', value: 1 },
        { type: 'operator', value: '==' },
        { type: 'number', value: 1 },
        { type: 'closeParen' },
      ]);
    });

    it('test case 3', () => {
      const parsedTokens = evaluator.tokenize("!('a'<='c')");
      assert.deepStrictEqual(parsedTokens, [
        { type: 'operator', value: '!' },
        { type: 'openParen' },
        { type: 'string', value: 'a' },
        { type: 'operator', value: '<=' },
        { type: 'string', value: 'c' },
        { type: 'closeParen' },
      ]);
    });

    it('test case 4', () => {
      const parsedTokens = evaluator.tokenize("(1==1)|('abc'=='def')");
      assert.deepStrictEqual(parsedTokens, [
        { type: 'openParen' },
        { type: 'number', value: 1 },
        { type: 'operator', value: '==' },
        { type: 'number', value: 1 },
        { type: 'closeParen' },
        { type: 'operator', value: '|' },
        { type: 'openParen' },
        { type: 'string', value: 'abc' },
        { type: 'operator', value: '==' },
        { type: 'string', value: 'def' },
        { type: 'closeParen' },
      ]);
    });

    it('test case 5', () => {
      const parsedTokens = evaluator.tokenize('(4!=5)&(4==5)');
      assert.deepStrictEqual(parsedTokens, [
        { type: 'openParen' },
        { type: 'number', value: 4 },
        { type: 'operator', value: '!=' },
        { type: 'number', value: 5 },
        { type: 'closeParen' },
        { type: 'operator', value: '&' },
        { type: 'openParen' },
        { type: 'number', value: 4 },
        { type: 'operator', value: '==' },
        { type: 'number', value: 5 },
        { type: 'closeParen' },
      ]);
    });

    it('test case 5a', () => {
      const parsedTokens = evaluator.tokenize('(4!=5)&!(4==5)');
      assert.deepStrictEqual(parsedTokens, [
        { type: 'openParen' },
        { type: 'number', value: 4 },
        { type: 'operator', value: '!=' },
        { type: 'number', value: 5 },
        { type: 'closeParen' },
        { type: 'operator', value: '&' },
        { type: 'operator', value: '!' },
        { type: 'openParen' },
        { type: 'number', value: 4 },
        { type: 'operator', value: '==' },
        { type: 'number', value: 5 },
        { type: 'closeParen' },
      ]);
    });

    it('test case 6', () => {
      const parsedTokens = evaluator.tokenize("$(HTTP_COOKIE{group})=='Advanced'");
      assert.deepStrictEqual(parsedTokens, [
        { type: 'string', value: 'standard' },
        { type: 'operator', value: '==' },
        { type: 'string', value: 'Advanced' },
      ]);
    });

  });

  describe('Evaluation of Parsed Tokens', () => {

    const evaluator = new EsiExpressionEvaluator(vars);

    it('test case 1', () => {
      const parsedTokens: EsiExpressionValue[] = [
        { type: 'string', value: 'example.com' },
        { type: 'operator', value: '==' },
        { type: 'string', value: 'example.com' },
      ];
      const evaluated = evaluator.evaluateTokens(parsedTokens);
      assert.strictEqual(evaluated.length, 1);
      assert.strictEqual(evaluated[0].type, 'boolean');
      assert.strictEqual(evaluated[0].value, true);
    });

    it('test case 2', () => {
      const parsedTokens: EsiExpressionValue[] = [
        { type: 'operator', value: '!' },
        { type: 'openParen' },
        { type: 'number', value: 1 },
        { type: 'operator', value: '==' },
        { type: 'number', value: 1 },
        { type: 'closeParen' },
      ];
      const evaluated = evaluator.evaluateTokens(parsedTokens);
      assert.strictEqual(evaluated.length, 1);
      assert.strictEqual(evaluated[0].type, 'boolean');
      assert.strictEqual(evaluated[0].value, false);
    });

    it('test case 3', () => {
      const parsedTokens: EsiExpressionValue[] = [
        { type: 'operator', value: '!' },
        { type: 'openParen' },
        { type: 'string', value: 'a' },
        { type: 'operator', value: '<=' },
        { type: 'string', value: 'c' },
        { type: 'closeParen' },
      ];
      const evaluated = evaluator.evaluateTokens(parsedTokens);
      assert.strictEqual(evaluated.length, 1);
      assert.strictEqual(evaluated[0].type, 'boolean');
      assert.strictEqual(evaluated[0].value, false);
    });

    it('test case 4', () => {
      const parsedTokens: EsiExpressionValue[] = [
        { type: 'openParen' },
        { type: 'number', value: 1 },
        { type: 'operator', value: '==' },
        { type: 'number', value: 1 },
        { type: 'closeParen' },
        { type: 'operator', value: '|' },
        { type: 'openParen' },
        { type: 'string', value: 'abc' },
        { type: 'operator', value: '==' },
        { type: 'string', value: 'def' },
        { type: 'closeParen' },
      ];
      const evaluated = evaluator.evaluateTokens(parsedTokens);
      assert.strictEqual(evaluated.length, 1);
      assert.strictEqual(evaluated[0].type, 'boolean');
      assert.strictEqual(evaluated[0].value, true);
    });

    it('test case 5', () => {
      const parsedTokens: EsiExpressionValue[] = [
        { type: 'openParen' },
        { type: 'number', value: 4 },
        { type: 'operator', value: '!=' },
        { type: 'number', value: 5 },
        { type: 'closeParen' },
        { type: 'operator', value: '&' },
        { type: 'openParen' },
        { type: 'number', value: 4 },
        { type: 'operator', value: '==' },
        { type: 'number', value: 5 },
        { type: 'closeParen' },
      ];
      const evaluated = evaluator.evaluateTokens(parsedTokens);
      assert.strictEqual(evaluated.length, 1);
      assert.strictEqual(evaluated[0].type, 'boolean');
      assert.strictEqual(evaluated[0].value, false);
    });

    it('test case 5a', () => {
      const parsedTokens: EsiExpressionValue[] = [
        { type: 'openParen' },
        { type: 'number', value: 4 },
        { type: 'operator', value: '!=' },
        { type: 'number', value: 5 },
        { type: 'closeParen' },
        { type: 'operator', value: '&' },
        { type: 'operator', value: '!' },
        { type: 'openParen' },
        { type: 'number', value: 4 },
        { type: 'operator', value: '==' },
        { type: 'number', value: 5 },
        { type: 'closeParen' },
      ];
      const evaluated = evaluator.evaluateTokens(parsedTokens);
      assert.strictEqual(evaluated.length, 1);
      assert.strictEqual(evaluated[0].type, 'boolean');
      assert.strictEqual(evaluated[0].value, true);
    });

    it('test case 6', () => {
      const parsedTokens: EsiExpressionValue[] = [
        { type: 'string', value: 'standard' },
        { type: 'operator', value: '==' },
        { type: 'string', value: 'Advanced' },
      ];
      const evaluated = evaluator.evaluateTokens(parsedTokens);
      assert.strictEqual(evaluated.length, 1);
      assert.strictEqual(evaluated[0].type, 'boolean');
      assert.strictEqual(evaluated[0].value, false);
    });

  });

  describe('Evaluation of String Expressions', () => {

    it('test case 1', () => {
      const result = evaluator.evaluate("$(HTTP_HOST) == 'example.com'")
      assert.strictEqual(result, true);
    });

    it('test case 2', () => {
      const result = evaluator.evaluate('!(1==1)')
      assert.strictEqual(result, false);
    });

    it('test case 3', () => {
      const result = evaluator.evaluate("!('a'<='c')")
      assert.strictEqual(result, false);
    });

    it('test case 4', () => {
      const result = evaluator.evaluate("(1==1)|('abc'=='def')")
      assert.strictEqual(result, true);
    });

    it('test case 5', () => {
      const result = evaluator.evaluate('(4!=5)&(4==5)')
      assert.strictEqual(result, false);
    });

    it('test case 5a', () => {
      const result = evaluator.evaluate('(4!=5)&!(4==5)')
      assert.strictEqual(result, true);
    });

    it('test case 6', () => {
      const result = evaluator.evaluate("$(HTTP_COOKIE{group})=='Advanced'")
      assert.strictEqual(result, false);
    });
  });
});
