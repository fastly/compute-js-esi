/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { evaluateEsiVariable, IEsiVariables, parseAsNumber } from "./EsiVariables.js";
import { unquoteString } from "./util.js";

export class StringReader {

  text: string = '';
  length: number = 8;
  offset: number = 0;

  set(value: string) {
    this.text = value;
    this.length = value.length;
    this.offset = 0;
  }

  get() {
    return this.text.slice(this.offset);
  }

  addOffset(offset: number) {
    this.offset += offset;
  }

  isEOF() {
    return this.offset >= this.length;
  }

  reset() {
    this.offset = 0;
  }
}

export type LexerTokenDef =
  | RegExp
  | RegExp[]
;

export type LexerTokenDefs = {
  [type: string]: LexerTokenDef,
};

export type LexerOptions = {
  tokenDefs?: LexerTokenDefs,
};

export type LexerToken = {
  text: string,
  type: string,
};

type LexerTokenRule = {
  token: string,
  regex: RegExp[],
};

export class StringLexer {

  rules: LexerTokenRule[];

  constructor(options: LexerOptions = {}) {
    this.rules = [];
    if (options.tokenDefs != null) {
      for (const [token, rule] of Object.entries(options.tokenDefs)) {
        const regex = Array.isArray(rule) ? rule : [rule];
        this.rules.push({token, regex});
      }
    }
  }

  tokenize(text: string) {
    const reader = new StringReader();
    reader.set(text);

    const parsedTokens: LexerToken[] = [];

    while (!reader.isEOF()) {
      const text = reader.get();
      let matchedToken: LexerToken | undefined = undefined;

      for (const rule of this.rules) {
        for (const regex of rule.regex) {
          const match = text.match(regex);
          if (match != null) {
            matchedToken = {
              text: match[0],
              type: rule.token,
            };
            break;
          }
        }
        if (matchedToken != null) {
          break;
        }
      }

      if (matchedToken == null || matchedToken.text.length === 0) {
        reader.addOffset(1);
        continue;
      }

      parsedTokens.push(matchedToken);
      reader.addOffset(matchedToken.text.length);
    }

    return parsedTokens;
  }
}

export type ParserOpDef = {
  precedence: number,
  associativity: 'left' | 'right',
};

export type ParserTable = {
  [operator: string]: ParserOpDef,
};

// Shunting Yard algorithm
abstract class ExpressionEvaluatorBase<TToken> {
  table: ParserTable;

  constructor(table: ParserTable = {}) {
    this.table = table;
  }

  abstract isOpenParen(token: TToken): boolean;
  abstract isCloseParen(token: TToken): boolean;
  abstract getOperation(token: TToken): ParserOpDef | undefined;
  onPop(token: TToken, output: TToken[]): TToken {
    return token;
  }

  evaluateTokens(tokens: TToken[]) {
    const output: TToken[] = [];
    const stack: TToken[] = [];

    for (const token of tokens) {
      switch(true) {
        case this.isOpenParen(token): {
          stack.push(token);
          break;
        }
        case this.isCloseParen(token): {
          let token: TToken | undefined;
          while(stack.length > 0) {
            token = stack.pop()!;
            if (this.isOpenParen(token)) {
              break;
            }
            const result = this.onPop(token, output);
            output.push(result);
          }
          if (token == null || !this.isOpenParen(token)) {
            throw new Error("Mismatched parentheses.");
          }
          break;
        }
        case this.getOperation(token) == null: {
          output.push(token);
          break;
        }
        default: {
          while(stack.length > 0) {
            let top = stack.at(-1)!;
            if (this.isOpenParen(top)) {
              break;
            }

            const o1 = this.getOperation(token)!;
            const o2 = this.getOperation(top)!;

            if (
              o1.precedence > o2.precedence ||
              o1.precedence === o2.precedence &&
              o1.associativity === "right"
            ) {
              break;
            }

            const popped = stack.pop()!;
            const result = this.onPop(popped, output);
            output.push(result);
          }
          stack.push(token);
        }
      }
    }

    while (stack.length > 0) {
      const popped = stack.pop()!;
      if (this.isOpenParen(popped)) {
        throw new Error("Mismatched parentheses.");
      }
      const result = this.onPop(popped, output);
      output.push(result);
    }
    return output;
  }
}

export class ExpressionEvaluator extends ExpressionEvaluatorBase<string> {
  isOpenParen(token: string): boolean {
    return token === '(';
  }
  isCloseParen(token: string): boolean {
    return token === ')';
  }

  getOperation(token: string) {
    return this.table.hasOwnProperty(token) ? this.table[token] : undefined;
  }
}

export type EsiExpressionValueString = {
  type: 'string',
  value: string,
};

export type EsiExpressionValueNumber = {
  type: 'number',
  value: number,
};

export type EsiExpressionValueBoolean = {
  type: 'boolean',
  value: boolean,
};

export type EsiExpressionValueUndefined = {
  type: 'undefined',
}

export type EsiExpressionValueParen = {
  type: 'openParen' | 'closeParen',
};

export type EsiExpressionValueOperator = {
  type: 'openParen' | 'closeParen' | 'operator',
  value: string,
};

export type EsiExpressionValue =
  | EsiExpressionValueString
  | EsiExpressionValueNumber
  | EsiExpressionValueBoolean
  | EsiExpressionValueUndefined
  | EsiExpressionValueParen
  | EsiExpressionValueOperator
;

export class EsiExpressionEvaluator extends ExpressionEvaluatorBase<EsiExpressionValue> {

  static LEXER_TOKEN_DEFS: LexerTokenDefs = {
    whitespace:     /^\s+/,
    literalString:  /^'.*?[^\\]'/,
    literalNumber:  /^(\d+|(\d*\.\d+))/,
    literalBoolean: /^(true|false)/,
    operator:       /^(\(|\)|==|!=|>=|<=|>|<|!|&|\|)/,
    esiVariable:    /^\$\([-_A-Z0-9]+(\{[-_A-Za-z0-9]+})?(\|(([^\s']+)|('[^']*')))?\)/,
  };

  static PARSER_TABLE: ParserTable = {
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

  static stringLexer = new StringLexer({
    tokenDefs: this.LEXER_TOKEN_DEFS
  });

  vars?: IEsiVariables;

  constructor(
    vars?: IEsiVariables
  ) {
    super(EsiExpressionEvaluator.PARSER_TABLE);
    this.vars = vars;
  }

  static COMPARISON_OPS: { [op: string]: <T>(a: T, b: T) => boolean } = {
    '==': <T>(a: T, b: T) => a === b,
    '!=': <T>(a: T, b: T) => a !== b,
    '<=': <T>(a: T, b: T) => a <= b,
    '>=': <T>(a: T, b: T) => a >= b,
    '<': <T>(a: T, b: T) => a < b,
    '>': <T>(a: T, b: T) => a > b,
  };

  static LOGICAL_OPS: { [op: string]: (a: boolean, b: boolean) => boolean } = {
    '&': (a: boolean, b: boolean) => a && b,
    '|': (a: boolean, b: boolean) => a || b,
  };

  override onPop(token: EsiExpressionValue, output: EsiExpressionValue[]): EsiExpressionValue {

    if (token.type !== 'operator') {
      throw new Error('Unexpected! onPop should only be an operator');
    }

    const right = output.pop()!;

    // Unary
    if (token.value === '!') {
      let result: boolean | undefined;
      if (right.type === 'boolean') {
        result = !right.value;
      } else {
        // Attempting unary not on string, number, or undefined
        result = undefined;
      }
      if (result === undefined) {
        return {
          type: 'undefined',
        };
      }
      return {
        type: 'boolean',
        value: result,
      };
    }

    // Binary
    const left = output.pop()!;

    let result: boolean | undefined = undefined;

    const logicalOp = EsiExpressionEvaluator.LOGICAL_OPS[token.value];
    if (logicalOp != null) {
      if (left.type === 'boolean' && right.type === 'boolean') {
        // "Logical operators ("&", "|", "!") can be used to qualify expressions, ..."
        result = logicalOp(left.value, right.value);
      }
      // using this on other operand types will yield undefined results.
      // "but cannot be used as comparitors themselves."
    }

    const comparisonOp = EsiExpressionEvaluator.COMPARISON_OPS[token.value];
    if (comparisonOp != null) {
      if (left.type === 'undefined' || right.type === 'undefined') {
        // "If an operand is empty or undefined, the expression will always evaluate to false"
        result = false;
      } else if (left.type === 'number' && right.type === 'number') {
        // "If both operands are numeric, the expression is evaluated numerically."
        result = comparisonOp(left.value, right.value);
      } else if (
        (left.type === 'number' && right.type === 'string') ||
        (left.type === 'string' && right.type === 'number') ||
        (left.type === 'string' && right.type === 'string')
      ) {
        // "If either binary operand is non-numeric, both operands are evaluated as strings."
        result = comparisonOp(String(left.value), String(right.value));
      }
      // "The behavior of comparisons which incompatibly typed operators is undefined."
    }

    if (result != null) {
      return {
        type: 'boolean',
        value: result,
      };
    }
    return {
      type: 'undefined',
    };
  }

  tokenize(expression: string): EsiExpressionValue[] {
    const values: EsiExpressionValue[] = [];

    for (const token of EsiExpressionEvaluator.stringLexer.tokenize(expression)) {
      if (token.type === 'whitespace') {
        continue;
      }

      switch(token.type) {
        case 'literalString': {
          values.push({
            type: 'string',
            value: unquoteString(token.text),
          });
          break;
        }
        case 'literalNumber': {
          values.push({
            type: 'number',
            value: parseAsNumber(token.text)!,
          });
          break;
        }
        case 'literalBoolean': {
          values.push({
            type: 'boolean',
            value: token.text === 'true',
          });
          break;
        }
        case 'operator': {
          if (token.text === '(') {
            values.push({
              type: 'openParen'
            });
            break;
          }
          if (token.text === ')') {
            values.push({
              type: 'closeParen'
            });
            break;
          }
          values.push({
            type: 'operator',
            value: token.text,
          });
          break;
        }
        case 'esiVariable': {
          const value = evaluateEsiVariable(token.text, this.vars);
          if (value != null) {
            const valueAsNumber = parseAsNumber(value);
            if (valueAsNumber != null) {
              values.push({
                type: 'number',
                value: valueAsNumber,
              });
              break;
            }
            if (value === 'true' || value === 'false') {
              values.push({
                type: 'boolean',
                value: value === 'true',
              });
              break;
            }
            try {
              const valueAsString = unquoteString(value);
              values.push({
                type: 'string',
                value: valueAsString,
              })
              break;
            } catch(ex) {
            }
          }
          values.push({
            type: 'undefined',
          });
          break;
        }
      }
    }
    return values;
  }

  evaluate(expression: string): boolean {
    const parsedTokens = this.tokenize(expression);
    const evaluated = this.evaluateTokens(parsedTokens);
    if (evaluated.length > 1 || evaluated[0].type !== 'boolean') {
      return false;
    }
    return evaluated[0].value;
  }

  getOperation(token: EsiExpressionValue): ParserOpDef | undefined {
    if (token.type !== 'operator') {
      return undefined;
    }
    return this.table[token.value];
  }

  isCloseParen(token: EsiExpressionValue): boolean {
    return token.type === 'closeParen';
  }

  isOpenParen(token: EsiExpressionValue): boolean {
    return token.type === 'openParen';
  }
}
