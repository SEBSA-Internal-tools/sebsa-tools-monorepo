const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const source = ts.transpileModule(fs.readFileSync('lib/profilePicture.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const profilePictureModule = { exports: {} };
new Function('module', 'exports', source)(profilePictureModule, profilePictureModule.exports);

const { getProfilePictureValidationError, MAX_PROFILE_PICTURE_BYTES } = profilePictureModule.exports;

test('accepts supported profile pictures below the safe Server Action limit', () => {
  assert.equal(
    getProfilePictureValidationError({ type: 'image/jpeg', size: MAX_PROFILE_PICTURE_BYTES }),
    null
  );
});

test('shows a clear error before images near or above 1 MB reach the Server Action', () => {
  assert.equal(
    getProfilePictureValidationError({ type: 'image/png', size: MAX_PROFILE_PICTURE_BYTES + 1 }),
    'Profile picture must be smaller than 1 MB.'
  );
});

test('rejects unsupported profile-picture formats', () => {
  assert.equal(
    getProfilePictureValidationError({ type: 'image/svg+xml', size: 100 }),
    'Please upload a JPG, PNG, WEBP, or GIF image.'
  );
});
