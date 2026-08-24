// Keep in sync with package.json's "version" — duplicated rather than imported
// across the src/ boundary (tsconfig's `include` is just "src", so importing
// ../package.json from here risks a rootDir error) for one constant.
export const APP_VERSION = "0.1.0";
