// @ts-check
const path = require('path');
const webpack = require('webpack');
const packageJson = require('./package.json');

/** @type {import('webpack').Configuration} */
module.exports = {
  entry: './src/index.ts',
  target: 'node',
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'csvpilot.bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
  externals: {
    // @github/copilot-sdk bundles the CLI internally; keep as external to preserve binary resolution
  },
  optimization: {
    minimize: false,
  },
  plugins: [
    new webpack.DefinePlugin({
      __VERSION__: JSON.stringify(packageJson.version),
    }),
  ],
};
