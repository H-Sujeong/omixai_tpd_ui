import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Lang = "ko" | "en";

interface UiLangState {
  lang: Lang;
  setLang: (l: Lang) => void;
}

/** Global UI language (persisted). Default Korean; toggle to English anytime. */
export const useUiLang = create<UiLangState>()(
  persist((set) => ({ lang: "ko", setLang: (lang) => set({ lang }) }), {
    name: "omixai-ui-lang",
  }),
);

/**
 * Translation helper hook. Call `const t = useT()` then `t("한글", "English")`.
 * Components using it re-render when the language changes.
 */
export function useT(): (ko: string, en: string) => string {
  const lang = useUiLang((s) => s.lang);
  return (ko, en) => (lang === "en" ? en : ko);
}
