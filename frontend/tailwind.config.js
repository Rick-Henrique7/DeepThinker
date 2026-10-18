/** @type {import('tailwindcss').Config} */

/*
 * Temas do Deep thinker (Abismo, Glaciar, Grafite).
 *
 * Truque: as classes que o app já usa (bg-black, text-white, bg-neutral-900, text-emerald-400...)
 * não apontam mais para uma cor fixa, e sim para uma variável CSS. Cada tema (em src/index.css)
 * define os valores dessas variáveis. Trocar de tema = trocar o atributo data-theme no <html>,
 * e o app inteiro muda de uma vez, sem editar componente por componente.
 *
 * As variáveis guardam só "R G B" (ex.: "13 34 54") para o Tailwind conseguir aplicar
 * transparência: bg-neutral-900/70 vira rgb(13 34 54 / 0.7).
 */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      screens: {
        // Celular deitado: tela baixa e ainda sem o layout de desktop (>= lg).
        baixa: { raw: '(max-height: 560px) and (max-width: 1023px)' },
        // Só mouse/trackpad. Em tela de toque os botões mantêm os 44px mínimos, seja qual for a largura.
        fino: { raw: '(pointer: fine)' },
      },
      colors: {
        black: v('black'),
        white: v('white'),
        neutral: {
          50: v('neutral-50'),
          100: v('neutral-100'),
          200: v('neutral-200'),
          300: v('neutral-300'),
          400: v('neutral-400'),
          500: v('neutral-500'),
          600: v('neutral-600'),
          700: v('neutral-700'),
          800: v('neutral-800'),
          900: v('neutral-900'),
          950: v('neutral-950'),
        },
        red: {
          50: v('red-50'),
          100: v('red-100'),
          200: v('red-200'),
          300: v('red-300'),
          400: v('red-400'),
          500: v('red-500'),
          600: v('red-600'),
          700: v('red-700'),
          800: v('red-800'),
          900: v('red-900'),
          950: v('red-950'),
        },
        emerald: {
          50: v('emerald-50'),
          100: v('emerald-100'),
          200: v('emerald-200'),
          300: v('emerald-300'),
          400: v('emerald-400'),
          500: v('emerald-500'),
          600: v('emerald-600'),
          700: v('emerald-700'),
          800: v('emerald-800'),
          900: v('emerald-900'),
          950: v('emerald-950'),
        },
        sky: {
          50: v('sky-50'),
          100: v('sky-100'),
          200: v('sky-200'),
          300: v('sky-300'),
          400: v('sky-400'),
          500: v('sky-500'),
          600: v('sky-600'),
          700: v('sky-700'),
          800: v('sky-800'),
          900: v('sky-900'),
          950: v('sky-950'),
        },
        amber: {
          50: v('amber-50'),
          100: v('amber-100'),
          200: v('amber-200'),
          300: v('amber-300'),
          400: v('amber-400'),
          500: v('amber-500'),
          600: v('amber-600'),
          700: v('amber-700'),
          800: v('amber-800'),
          900: v('amber-900'),
          950: v('amber-950'),
        },
        accent: {
          DEFAULT: v('accent'),
          soft: 'rgb(var(--accent) / 0.12)',
          glow: 'rgb(var(--accent) / 0.35)',
        },
        line: {
          DEFAULT: 'rgb(var(--white) / 0.08)',
          strong: 'rgb(var(--white) / 0.16)',
        },
      },
      fontFamily: {
        sans: ['"Geist Variable"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        // A fonte "de destaque" muda com o tema (Grafite usa a própria Geist)
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
      },
      backgroundImage: {
        app: 'var(--app-bg)',
      },
      transitionTimingFunction: {
        // Curvas do Emil Kowalski: ease-out forte para o que entra na tela
        out: 'cubic-bezier(0.23, 1, 0.32, 1)',
        'in-out': 'cubic-bezier(0.77, 0, 0.175, 1)',
      },
    },
  },
  plugins: [],
};
