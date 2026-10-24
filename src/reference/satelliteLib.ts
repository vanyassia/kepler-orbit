/**
 * Нужные части satellite.js без WebAssembly-сборки: корневой вход пакета реэкспортирует
 * WASM-модуль, который импортирует node:module и не собирается для браузера.
 */
export { json2satrec, twoline2satrec } from '../../node_modules/satellite.js/dist/io.js';
export { propagate } from '../../node_modules/satellite.js/dist/propagation/propagate.js';
