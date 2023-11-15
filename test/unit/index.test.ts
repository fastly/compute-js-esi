import { describe, it } from 'node:test';
import assert from 'node:assert';

import foo from '../../src/index.js';

describe('foo', () => {
  it('foo returns bar', () => {
    const ret = foo();
    assert.ok(ret === 'bar');
  })
})
