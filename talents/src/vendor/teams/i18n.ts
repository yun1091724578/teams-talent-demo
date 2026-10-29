// The vendor tree reads the ambient locale through this one indirection so it never imports the app.
export { currentT as vt } from '../../../../shared/i18n/index.ts';
