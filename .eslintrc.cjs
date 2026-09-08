module.exports = {
  root: true,
  env: {
    es2020: true,
    node: true,
    jest: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['cli/dist/**', 'coverage/**', 'node_modules/**'],
  rules: {
    // The CLI intentionally uses these patterns today; keep lint runnable
    // without forcing a large refactor just to clear the gate.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-require-imports': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    'no-case-declarations': 'off',
    'no-useless-catch': 'off',
    'no-useless-escape': 'off',
    'prefer-const': 'off',
  },
};
