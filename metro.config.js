const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Block Node-only modules from web bundling
  if (
    moduleName === 'fs' ||
    moduleName === 'path' ||
    moduleName === 'os' ||
    moduleName === 'net' ||
    moduleName === 'tls' ||
    moduleName === 'child_process' ||
    moduleName === 'module'
  ) {
    return {
      type: 'empty',
    };
  }
  // bcryptjs calls process.cwd() which doesn't exist on web
  if (moduleName === 'bcryptjs') {
    return {
      type: 'empty',
    };
  }
  // bcryptjs calls process.cwd() which doesn't exist on web
  if (moduleName === 'bcryptjs') {
    return {
      type: 'empty',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
