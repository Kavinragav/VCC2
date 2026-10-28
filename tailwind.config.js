/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#f0f4fa",
          100: "#d9e2f2",
          200: "#b3c6e6",
          300: "#8da9d9",
          400: "#668ccc",
          500: "#406fbf",
          600: "#335999",
          700: "#264373",
          800: "#192c4d",
          900: "#0c1626",
          950: "#071328",
        },
        skyblue: "#38bdf8",
        cream: "#fef3c7",
      },
    },
  },
  plugins: [],
};
