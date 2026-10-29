// HTML fragments are bundled as text (tools/build.mjs: loader '.html': 'text').
declare module '*.html' { const html: string; export default html; }
