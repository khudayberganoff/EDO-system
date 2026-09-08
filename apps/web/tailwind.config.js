/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Yangi (oq fon + ko'k urg'u) dizayn tizimiga moslashtirilgan ko'k palitra.
        // Eski "brand" nomi butun ilova bo'ylab (tugmalar, matn, ramkalar) qayta
        // ishlatilgani uchun shu yerda faqat qiymatlarni almashtirish kifoya -
        // JSX'dagi minglab bg-brand-800 kabi klasslarni birma-bir o'zgartirish shart emas.
        brand: {
          950: "#0B2A54",
          900: "#123B72",
          800: "#1D4FA6",
          700: "#1E6FE0",
          600: "#2B7DE9",
          500: "#4B92ED",
          300: "#93C5F5",
          100: "#DCEAFC",
          50: "#EFF6FF",
          accent: "#1E6FE0",
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
        display: ['"Playfair Display"', "Georgia", "serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
