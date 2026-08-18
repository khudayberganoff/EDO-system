/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // WAFA GROUP dashboardidagi chuqur yashil-teal palitraga moslashtirilgan
        brand: {
          950: "#07231A",
          900: "#0B3327",
          800: "#0F4A38",
          700: "#166049",
          600: "#1C7A5C",
          500: "#239873",
          100: "#DDEFE7",
          accent: "#2DD4A7",
        },
        // Reference dizayndagi kabi oltin - juda tejamkor ishlatiladi (faqat urg'u nuqtalarida)
        gold: {
          100: "#F6EEDA",
          300: "#E4C77E",
          500: "#C9A227",
          600: "#A9841A",
          700: "#8A6B15",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
