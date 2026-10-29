import { materialRoot } from './service-config.ts';
import { resolveICodeBinary, selectICodeBinary } from './icode-binary.ts';
export * from './service-config.ts';
const icode = resolveICodeBinary({ materialRoot });
export const binary = icode.path;
export const icodeBinarySource = icode.source;
export const icodeBinaryNotes = icode.notes;
/** The launcher that actually answered `--version`; resolved once per process, re-probed when the file changes. */
export const selectICode = () => selectICodeBinary({ materialRoot });
