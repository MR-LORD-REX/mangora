const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");
 
/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// ONNX model weights are downloaded at runtime and are not Metro assets.

module.exports = withNativewind(config);
