// Vendor modules render plain strings (not JSX), so they read the ambient locale that
// LocaleProvider sets before rendering. Re-exported here to keep vendor imports local.
export { currentT as vt } from '../../../../shared/i18n/index.js';
