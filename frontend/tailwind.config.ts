import type { Config } from "tailwindcss";

const tailwindConfig: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17201c",
        paper: "#f3f6f5",
        surface: "#ffffff",
        line: "#dce5e1",
        ember: "#ed6548",
        mint: "#12a77a",
        violet: "#6958e8",
        gold: "#d99b24",
        sky: "#3d83c5"
      },
      boxShadow: {
        panel: "0 10px 28px rgba(23, 32, 28, 0.08)",
        command: "0 16px 34px rgba(23, 32, 28, 0.16)",
        action: "0 4px 0 rgba(23, 32, 28, 0.16)"
      }
    }
  },
  plugins: []
};

export default tailwindConfig;
