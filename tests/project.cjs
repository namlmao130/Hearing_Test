'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SELF_TEST_FILES = Object.freeze([
  'src/app/self-test/runtime.js',
  'src/app/self-test/tone-test.js',
  'src/app/self-test/speech-test.js',
  'src/app/self-test/results.js',
  'src/app/self-test/history.js',
  'src/app/self-test/calibration.js'
]);

const fromRoot = (...parts) => path.join(ROOT, ...parts);
const read = (...parts) => fs.readFileSync(fromRoot(...parts), 'utf8');
const selfTestSource = () => SELF_TEST_FILES.map(file => read(file)).join('\n');

module.exports = Object.freeze({ ROOT, SELF_TEST_FILES, fromRoot, read, selfTestSource });
