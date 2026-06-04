import { useUiLang } from "@/store/uiLang";

/** Compact language toggle for the icon rail — shows the current language,
 *  click switches between Korean and English. */
export function LangToggle() {
  const { lang, setLang } = useUiLang();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "ko" ? "en" : "ko")}
      className="sidebar-item text-meta font-semibold"
      title={lang === "ko" ? "English로 전환" : "한국어로 전환"}
      aria-label="Toggle language"
    >
      {lang === "ko" ? "한" : "EN"}
    </button>
  );
}
