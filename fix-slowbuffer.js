// Polyfill SlowBuffer for Node 25+ compatibility
// Older packages (buffer-equal-constant-time used by jwa → octokit)
// assume require('buffer').SlowBuffer exists.
const bufferModule = require('buffer');

if (!bufferModule.SlowBuffer) {
  class SlowBuffer extends bufferModule.Buffer {}
  bufferModule.SlowBuffer = SlowBuffer;
}
