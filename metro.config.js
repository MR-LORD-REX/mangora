const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");
 
/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Bundle the onnxruntime model weights (assets/models/yolo.onnx) as an asset.
config.resolver.assetExts.push("onnx");
 
module.exports = withNativewind(config);
