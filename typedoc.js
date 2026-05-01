// @ts-check

/** @type {import('typedoc').TypeDocOptions} */
module.exports = {
  entryPoints: ['src/index.ts'],
  out: 'docs/typedoc-md',
  plugin: ['typedoc-plugin-markdown'],
};
