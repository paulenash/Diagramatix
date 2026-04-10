export interface ChevronTheme {
  name: string;
  colours: readonly string[];
}

export const CHEVRON_THEMES: readonly ChevronTheme[] = [
  {
    name: "Sunrise",
    colours: ["#fef3c7", "#fde68a", "#fdba74", "#fca5a5", "#f9a8d4", "#d8b4fe", "#a5b4fc", "#93c5fd"],
  },
  {
    name: "Ocean",
    colours: ["#cffafe", "#a5f3fc", "#7dd3fc", "#93c5fd", "#a5b4fc", "#c4b5fd", "#d8b4fe", "#f0abfc"],
  },
  {
    name: "Garden",
    colours: ["#d9f99d", "#bef264", "#a3e635", "#86efac", "#6ee7b7", "#5eead4", "#67e8f9", "#7dd3fc"],
  },
  {
    name: "Berry",
    colours: ["#fce7f3", "#fbcfe8", "#f9a8d4", "#f0abfc", "#d8b4fe", "#c4b5fd", "#a5b4fc", "#93c5fd"],
  },
  {
    name: "Earth",
    colours: ["#fef9c3", "#fde68a", "#fcd34d", "#fdba74", "#fed7aa", "#fecaca", "#e5e7eb", "#d1d5db"],
  },
];
