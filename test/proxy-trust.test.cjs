/* eslint-disable @typescript-eslint/no-require-imports -- standalone dependency regression */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const proxyAddress = require('proxy-addr');

test('an incorrectly shortened IPv4-mapped trust subnet never trusts external IPv4 clients', () => {
  const trust = proxyAddress.compile('::ffff:10.0.0.0/8');
  assert.equal(trust('203.0.113.42', 0), false);
});

test('normal IPv4 trust subnets still distinguish internal and external clients', () => {
  const trust = proxyAddress.compile('10.0.0.0/8');
  assert.equal(trust('10.23.42.1', 0), true);
  assert.equal(trust('203.0.113.42', 0), false);
});
