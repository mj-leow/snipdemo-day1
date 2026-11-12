'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { run } = require('./cli');

function stream() {
  let value = '';
  return {
    write(text) { value += text; },
    text() { return value; },
  };
}

function response(status, payload, headers = {}) {
  return {
    status,
    statusText: '',
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    async text() { return payload === null ? '' : JSON.stringify(payload); },
  };
}

describe('Snip CLI', () => {
  it('prints help when no command is provided', async () => {
    const stdout = stream();
    const exitCode = await run([], { stdout, stderr: stream() });
    assert.equal(exitCode, 0);
    assert.match(stdout.text(), /snip add <url>/);
  });

  it('rejects invalid URLs without calling the API', async () => {
    let called = false;
    const stderr = stream();
    const exitCode = await run(['add', 'ftp://example.com'], {
      fetch: async () => { called = true; },
      stdout: stream(),
      stderr,
    });
    assert.equal(exitCode, 1);
    assert.equal(called, false);
    assert.match(stderr.text(), /HTTP\(S\)/);
  });

  it('creates a link and prints its short URL', async () => {
    const stdout = stream();
    let requestOptions;
    const exitCode = await run(['add', 'https://example.com/path'], {
      fetch: async (_url, options) => {
        requestOptions = options;
        return response(201, { shortUrl: 'http://localhost:3000/abc123' });
      },
      stdout,
      stderr: stream(),
    });
    assert.equal(exitCode, 0);
    assert.equal(JSON.parse(requestOptions.body).url, 'https://example.com/path');
    assert.equal(stdout.text(), 'http://localhost:3000/abc123\n');
  });

  it('prints an empty-list message', async () => {
    const stdout = stream();
    const exitCode = await run(['ls'], {
      fetch: async () => response(200, []),
      stdout,
      stderr: stream(),
    });
    assert.equal(exitCode, 0);
    assert.equal(stdout.text(), 'No links yet.\n');
  });

  it('reports API errors to stderr with exit code 1', async () => {
    const stderr = stream();
    const exitCode = await run(['ls'], {
      fetch: async () => response(503, { error: 'Service unavailable' }),
      stdout: stream(),
      stderr,
    });
    assert.equal(exitCode, 1);
    assert.match(stderr.text(), /Service unavailable/);
  });

  it('does not follow redirects and opens the returned Location', async () => {
    const stdout = stream();
    let requestOptions;
    let opened;
    const exitCode = await run(['open', 'abc123'], {
      fetch: async (_url, options) => {
        requestOptions = options;
        return response(302, null, { location: 'https://example.com/original' });
      },
      launchBrowser: async (url) => { opened = url; },
      stdout,
      stderr: stream(),
    });
    assert.equal(exitCode, 0);
    assert.equal(requestOptions.redirect, 'manual');
    assert.equal(opened, 'https://example.com/original');
    assert.match(stdout.text(), /Opened https:\/\/example\.com\/original/);
  });

  it('reports unknown short codes', async () => {
    const stderr = stream();
    const exitCode = await run(['open', 'abc123'], {
      fetch: async () => response(404, { error: 'Not found' }),
      stdout: stream(),
      stderr,
    });
    assert.equal(exitCode, 1);
    assert.match(stderr.text(), /No link found/);
  });
});
