import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config([
  // Ignore patterns
  {
    ignores: ['dist/**', '*.d.ts'],
  },
  // Base config for all files
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // TypeScript specific settings
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
]);
