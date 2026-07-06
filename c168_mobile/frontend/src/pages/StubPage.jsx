import { Link } from "react-router-dom";
import "./stub.css";

export default function StubPage({ title, backTo = "/login" }) {
  return (
    <div className="mobile-stub">
      <h1>{title}</h1>
      <p>此页面即将在 Mobile 版中实现。</p>
      <Link to={backTo} className="mobile-stub__link">
        返回
      </Link>
    </div>
  );
}
