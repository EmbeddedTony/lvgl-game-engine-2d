const { test } = require('node:test');
const assert = require('node:assert/strict');
const { referenceUrl } = require('../../desktop/reference-links.cjs');
const catalog = require('../../src/targets/catalog.json');
test('only official HTTPS references open externally; project/file/executable URLs cannot escape the app', () => {
  for (const profile of catalog.profiles)
    assert.equal(referenceUrl(profile.source), new URL(profile.source).href);
  for (const value of [
    'file:///tmp/unsafe',
    'javascript:alert(1)',
    'https://st.com.evil.test/',
    'https://evil-st.com/',
    'https://user:secret@www.st.com/',
    'http://www.nxp.com/',
    'https://www.nxp.com:3000/',
    'not a URL',
    null,
  ])
    assert.throws(() => referenceUrl(value));
});
