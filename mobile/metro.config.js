const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * The app imports the PWA's judge from the repository's `src` and its models manifest from `models`, and resolves
 * packages from its own `node_modules` only.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [path.resolve(__dirname, '../src'), path.resolve(__dirname, '../models')],
  resolver: { nodeModulesPaths: [path.resolve(__dirname, 'node_modules')] },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
