import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier/flat'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import storybook from 'eslint-plugin-storybook'

/**
 * Which folder may import which. The table lives in AGENTS.md; these rules
 * enforce it. `domain` is pure rules, `ui` is the design system, `features`
 * is the interface, `server` runs only on the server, `app` wires them up.
 */
const boundary = (files, patterns) => ({
  files,
  rules: {
    'no-restricted-imports': ['error', { patterns }],
  },
})

const only3d = {
  group: ['three', 'three/*', '@react-three/*'],
  message:
    'three.js may only be imported inside src/features/shelf-3d, so it stays out of every other bundle.',
}

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  ...storybook.configs['flat/recommended'],

  // Accessibility: the plugin's full recommended set, as errors.
  {
    files: ['**/*.{jsx,tsx}'],
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // The design system's inputs (src/ui/checkbox.tsx, field.tsx) are the
      // browser's own underneath: a label around one names it.
      'jsx-a11y/label-has-associated-control': [
        'error',
        { controlComponents: ['Checkbox', 'Radio', 'Switch', 'Input', 'Textarea'], depth: 3 },
      ],
    },
  },

  {
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // Interface text comes from the translation files, never from a component.
  {
    files: ['src/app/**/*.tsx', 'src/features/**/*.tsx', 'src/ui/**/*.tsx'],
    ignores: ['**/*.stories.tsx', '**/*.test.tsx'],
    rules: {
      'react/jsx-no-literals': ['error', { noStrings: false, ignoreProps: true }],
    },
  },

  // A control's words on hover are a `Tip`, never the browser's own tooltip.
  {
    files: ['src/app/**/*.tsx', 'src/features/**/*.tsx', 'src/ui/**/*.tsx'],
    rules: {
      'react/forbid-dom-props': [
        'error',
        {
          forbid: [
            {
              propName: 'title',
              message:
                'The browser’s tooltip shows late, only to a mouse, and cannot be styled: wrap the control in Tip (src/ui/tooltip.tsx).',
            },
          ],
        },
      ],
    },
  },

  // What is on its way is drawn as ghosts, never said in words or spun (spec 3.10). The words are
  // for assistive technology alone: `Loading`'s label, or a child of an element that is `sr-only`.
  {
    files: ['src/app/**/*.tsx', 'src/features/**/*.tsx', 'src/ui/**/*.tsx'],
    ignores: ['**/*.stories.tsx', '**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...[
          'JSXExpressionContainer > CallExpression',
          'JSXExpressionContainer > ConditionalExpression > CallExpression',
        ].map((said) => ({
          selector: `JSXElement:not(:has(JSXAttribute[name.name='className'][value.value=/sr-only/])) > ${said}[arguments.0.value=/(^|\\.)(loading|checking|searching)/i]`,
          message:
            'Nothing says it is loading in words: draw ghosts in the shape of what is coming, inside Loading (src/ui/ghost.tsx).',
        })),
        {
          selector: 'Literal[value=/animate-spin/]',
          message:
            'A spinner says nothing of what is coming: draw ghosts in its shape, inside Loading (src/ui/ghost.tsx).',
        },
      ],
    },
  },

  // Import boundaries.
  boundary(
    ['src/domain/**'],
    [
      {
        group: ['react', 'react-dom', 'react/*', 'next', 'next/*', 'next-intl', 'next-intl/*'],
        message: 'domain holds rules only: no React, no Next.js.',
      },
      {
        group: ['@/server/*', '@/features/*', '@/ui/*', '@/app/*', '@/i18n/*'],
        message: 'domain may not import from any other layer.',
      },
      only3d,
    ],
  ),
  boundary(
    ['src/server/**'],
    [
      { group: ['@/features/*', '@/ui/*', '@/app/*'], message: 'server may import domain only.' },
      only3d,
    ],
  ),
  boundary(
    ['src/ui/**'],
    [
      {
        group: [
          '@/domain/*',
          '@/server/*',
          '@/features/*',
          '@/app/*',
          '@/i18n/*',
          'next-intl',
          'next-intl/*',
        ],
        message: 'ui is the design system: it imports nothing of ours and takes its text as props.',
      },
      only3d,
    ],
  ),
  boundary(
    ['src/features/**'],
    [
      {
        group: ['@/server/*'],
        message:
          'features may not import server code. Call a server action, or receive data as props.',
      },
      { group: ['@/app/*'], message: 'features may not import from app.' },
      only3d,
    ],
  ),
  boundary(
    ['src/features/shelf-3d/**'],
    [
      {
        group: ['@/server/*'],
        message:
          'features may not import server code. Call a server action, or receive data as props.',
      },
      { group: ['@/app/*'], message: 'features may not import from app.' },
    ],
  ),
  boundary(['src/app/**', 'src/i18n/**', 'src/proxy.ts'], [only3d]),

  // Scripts and tests print to the terminal on purpose.
  {
    files: ['scripts/**', 'e2e/**', '**/*.test.{ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  },

  // Playwright hands each fixture a function named `use`. It is not a React hook.
  {
    files: ['e2e/**'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },

  prettier,

  globalIgnores([
    // The desktop app's own folder, where each session's worktree lives.
    '.claude/**',
    '.next/**',
    'next-env.d.ts',
    'storybook-static/**',
    'playwright-report/**',
    'test-results/**',
    'coverage/**',
    // Shelf for Windows' build, and the schemas tauri-build writes (ADR 005).
    'desktop/target/**',
    'desktop/gen/**',
  ]),
])
