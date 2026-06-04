import { Link } from "react-router-dom";
import { useT } from "@/store/uiLang";

export function NotFoundPage() {
  const t = useT();
  return (
    <div className="flex-1 flex items-center justify-center text-center p-6">
      <div>
        <div className="text-h1 font-semibold mb-2">404</div>
        <div className="text-ink-secondary mb-4">
          {t("존재하지 않는 페이지입니다.", "This page does not exist.")}
        </div>
        <Link to="/plates" className="btn btn--primary">
          {t("분석 목록으로", "To analysis list")}
        </Link>
      </div>
    </div>
  );
}
