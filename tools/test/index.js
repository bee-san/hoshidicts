// SPDX-License-Identifier: GPL-3.0-or-later
// `node --test tools/test/` loads this file: Node 22 reads a directory
// argument as a module path, not as a directory to search. It imports every
// tools/test/*.test.mjs, so that command runs the whole suite; so does
// `node --test tools/test/*.test.mjs`, one process per file.
'use strict';

const {readdirSync} = require('node:fs');
const {pathToFileURL} = require('node:url');
const {join} = require('node:path');

(async () => {
    const files = readdirSync(__dirname).filter((name) => name.endsWith('.test.mjs')).sort();
    for (const name of files) {
        await import(pathToFileURL(join(__dirname, name)).href);
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
