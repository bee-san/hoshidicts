// SPDX-License-Identifier: GPL-3.0-or-later
// Helpers shared by the command-line tools.

import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

/**
 * Whether the module with this URL is the script Node was started with.
 * @param {string} moduleUrl import.meta.url
 * @returns {boolean}
 */
export function isMain(moduleUrl) {
    if (process.argv[1] === undefined) { return false; }
    try {
        return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(process.argv[1]);
    } catch {
        return false;
    }
}
