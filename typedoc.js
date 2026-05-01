/** @type {import('typedoc').TypeDocOptions} */
module.exports = {
  entryPoints: ['src/index.ts'],
  entryPointStrategy: 'resolve',
  out: 'docs/typedoc-md',
  plugin: ['typedoc-plugin-markdown'],
  readme: 'none',
  excludePrivate: true,
  excludeProtected: false,
  excludeInternal: true,
  tsconfig: 'tsconfig.json',
};
