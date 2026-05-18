import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        YT: 'readonly',
        RTCIceServer: 'readonly',
        RTCSessionDescriptionInit: 'readonly',
        RTCIceCandidateInit: 'readonly'
      }
    }
  },
  {
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-declaration-merging': 'off'
    }
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser
      }
    },
    rules: {
      // svelte-check already validates Svelte code; don't duplicate compiler warnings as errors
      'svelte/valid-compile': ['error', { ignoreWarnings: true }]
    }
  },
  {
    ignores: ['build/', '.svelte-kit/', 'dist/', 'node_modules/']
  }
];
