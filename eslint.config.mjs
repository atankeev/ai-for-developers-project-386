import vue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';

// Oxlint checks scripts; ESLint adds Vue template checks.
export default [
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
];
