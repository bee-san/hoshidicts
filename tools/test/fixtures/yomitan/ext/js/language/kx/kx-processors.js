// SPDX-License-Identifier: GPL-3.0-or-later
// Imports a library an unbuilt checkout lacks, as Korean does.
import {Hangul} from '../../../lib/hangul-js.js';

export const disassemble = {
    name: 'Disassemble',
    description: 'Hangul to jamo',
    process: (text) => [Hangul.disassemble(text, false).join('')],
};
