#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');

const DEFAULT_API = 'http://localhost:3000';
const REQUEST_TIMEOUT_MS = 10000;
const CODE_PATTERN = /^[A-Za-z0-9]{6}$/;

const USAGE = `Usage:
  snip add <url>    Create a short link
  snip ls           List links and hit counts
  snip open <code>  Open the original URL in your browser
  snip help         Show this help

Set SNIP_API to use a different API base URL (default: ${DEFAULT_API}).`;

function normalizeApiBase(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('SNIP_API must be a valid HTTP(S) URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('SNIP_API must be a valid HTTP(S) URL.');
  }
  return url.href.replace(/\/+$/, '');
}

function validateUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('URL must be a valid HTTP(S) URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('URL must be a valid HTTP(S) URL.');
  }
  return url.href;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function apiError(response, payload) {
  const message = payload && typeof payload.error === 'string'
    ? payload.error
    : `API request failed (${response.status} ${response.statusText || 'HTTP error'}).`;
  return new Error(message);
}

async function request(fetchImpl, url, options = {}) {
  try {
    return await fetchImpl(url, {
      ...options,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error('API request timed out.');
    }
    throw new Error(`Could not reach the Snip API: ${error.message}`);
  }
}

function launchBrowser(url, platform = process.platform) {
  let command;
  let args;
  let env = process.env;

  if (platform === 'win32') {
    command = 'powershell.exe';
    args = ['-NoProfile', '-NonInteractive', '-Command', 'Start-Process -FilePath $env:SNIP_OPEN_URL'];
    env = { ...process.env, SNIP_OPEN_URL: url };
  } else if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      env,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('error', (error) => reject(new Error(`Could not open the browser: ${error.message}`)));
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

async function run(argv, dependencies = {}) {
  const stdout = dependencies.stdout || process.stdout;
  const stderr = dependencies.stderr || process.stderr;
  const fetchImpl = dependencies.fetch || globalThis.fetch;
  const openBrowser = dependencies.launchBrowser || launchBrowser;
  const writeError = (message) => stderr.write(`${message}\n`);

  const [command, ...args] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    stdout.write(`${USAGE}\n`);
    return 0;
  }

  let apiBase;
  try {
    apiBase = normalizeApiBase(process.env.SNIP_API || DEFAULT_API);
  } catch (error) {
    writeError(error.message);
    return 1;
  }

  try {
    if (command === 'add') {
      if (args.length !== 1) throw new Error('Usage: snip add <url>');
      const url = validateUrl(args[0]);
      const response = await request(fetchImpl, `${apiBase}/api/links`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw apiError(response, payload);
      if (!payload || typeof payload.shortUrl !== 'string') {
        throw new Error('The API returned an invalid link response.');
      }
      stdout.write(`${payload.shortUrl}\n`);
      return 0;
    }

    if (command === 'ls') {
      if (args.length !== 0) throw new Error('Usage: snip ls');
      const response = await request(fetchImpl, `${apiBase}/api/links`);
      const payload = await readJson(response);
      if (!response.ok) throw apiError(response, payload);
      if (!Array.isArray(payload)) throw new Error('The API returned an invalid link list.');
      if (payload.length === 0) {
        stdout.write('No links yet.\n');
        return 0;
      }
      const codeWidth = Math.max(4, ...payload.map((link) => String(link.code).length));
      const hitsWidth = Math.max(4, ...payload.map((link) => String(link.hits).length));
      stdout.write(`${'CODE'.padEnd(codeWidth)}  ${'HITS'.padStart(hitsWidth)}  URL\n`);
      for (const link of payload) {
        if (!link || typeof link.code !== 'string' || typeof link.url !== 'string') {
          throw new Error('The API returned an invalid link list.');
        }
        stdout.write(`${link.code.padEnd(codeWidth)}  ${String(link.hits).padStart(hitsWidth)}  ${link.url}\n`);
      }
      return 0;
    }

    if (command === 'open') {
      if (args.length !== 1 || !CODE_PATTERN.test(args[0])) {
        throw new Error('Usage: snip open <6-character-code>');
      }
      const response = await request(fetchImpl, `${apiBase}/${encodeURIComponent(args[0])}`, {
        redirect: 'manual',
      });
      if (response.status === 404) throw new Error(`No link found for code "${args[0]}".`);
      if (response.status !== 302) throw apiError(response, await readJson(response));
      const location = response.headers.get('location');
      if (!location) throw new Error('The API redirect did not include a destination.');
      let destination;
      try {
        destination = new URL(location, apiBase);
      } catch {
        throw new Error('The API returned an invalid redirect destination.');
      }
      if (destination.protocol !== 'http:' && destination.protocol !== 'https:') {
        throw new Error('The API returned an invalid redirect destination.');
      }
      await openBrowser(destination.href);
      stdout.write(`Opened ${destination.href}\n`);
      return 0;
    }

    throw new Error(`Unknown command: ${command}\n${USAGE}`);
  } catch (error) {
    writeError(error.message);
    return 1;
  }
}

if (require.main === module) {
  run(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { launchBrowser, normalizeApiBase, run, validateUrl };
