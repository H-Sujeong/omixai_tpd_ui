import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="flex-1 flex items-center justify-center text-center p-6">
      <div>
        <div className="text-h1 font-semibold mb-2">404</div>
        <div className="text-ink-secondary mb-4">존재하지 않는 페이지입니다.</div>
        <Link to="/plates" className="btn btn--primary">
          분석 목록으로
        </Link>
      </div>
    </div>
  );
}
