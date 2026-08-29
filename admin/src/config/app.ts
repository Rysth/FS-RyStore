export type AppVertical = "store" | "restaurant";

const rawVertical = import.meta.env.VITE_APP_VERTICAL;

export const APP_VERTICAL: AppVertical = rawVertical === "restaurant" ? "restaurant" : "store";
export const IS_RESTAURANT_VERTICAL = APP_VERTICAL === "restaurant";
