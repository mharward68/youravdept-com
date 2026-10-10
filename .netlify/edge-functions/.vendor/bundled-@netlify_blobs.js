/// <reference types="..\..\..\node_modules\@netlify\blobs\dist\main.d.ts" />

  import __nfyProcess from "node:process";
  import {setImmediate as __nfySetImmediate, clearImmediate as __nfyClearImmediate} from "node:timers";
  import {Buffer as __nfyBuffer} from "node:buffer";
  import {createRequire as ___nfyCreateRequire} from "node:module";
  import {fileURLToPath as ___nfyFileURLToPath} from "node:url";
  import {dirname as ___nfyPathDirname} from "node:path";
  let __filename=___nfyFileURLToPath(import.meta.url);
  let __dirname=___nfyPathDirname(___nfyFileURLToPath(import.meta.url));
  let require=___nfyCreateRequire(import.meta.url);
  globalThis.process = __nfyProcess;
  globalThis.setImmediate = __nfySetImmediate;
  globalThis.clearImmediate = __nfyClearImmediate;
  globalThis.Buffer = __nfyBuffer;
  
import {
  bundled_netlify_blobs_default,
  connectLambda,
  getDeployStore,
  getStore,
  listStores,
  setEnvironmentContext
} from "./chunk-BIX4QH74.js";
export {
  connectLambda,
  bundled_netlify_blobs_default as default,
  getDeployStore,
  getStore,
  listStores,
  setEnvironmentContext
};
