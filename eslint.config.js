import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

const baseLanguageOptions = {
  ...js.configs.recommended.languageOptions,
  ecmaVersion: 'latest',
  sourceType: 'module',
  globals: {
    ...globals.browser,
    ...globals.es2021
  }
};

const baseConfig = {
  ...js.configs.recommended,
  languageOptions: baseLanguageOptions,
  rules: {
    ...js.configs.recommended.rules,
    'no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
        varsIgnorePattern: '^_'
      }
    ]
  }
};

export default [
  {
    ignores: ['node_modules/', 'dist/', 'coverage/']
  },
  baseConfig,
  prettier,
  {
    files: ['*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ['workers/**/*.js'],
    languageOptions: {
      ...baseLanguageOptions,
      globals: {
        ...baseLanguageOptions.globals,
        ...globals.worker
      }
    }
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.jest,
        ...globals.node
      }
    }
  }
];
