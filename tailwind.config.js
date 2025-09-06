/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'studymate-blue': {
          50: '#eff6ff',
          500: '#3b82f6',
          800: '#1e40af',
        },
        'studymate-green': {
          50: '#f0fdf4',
          500: '#22c55e',
          600: '#16a34a',
        }
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}