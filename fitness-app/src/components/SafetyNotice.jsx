const SEVERITY_LABEL = {
  block: "확인 필요",
  warn: "주의",
  info: "안내",
};

export default function SafetyNotice({ safety, onBack }) {
  if (!safety || !safety.findings?.length) return null;

  const blocked = safety.blocked;

  return (
    <section className={`panel safety-notice${blocked ? " blocked" : ""}`}>
      <header className="page-head">
        <div>
          <span className="page-eyebrow">SAFETY CHECK</span>
          <h1>{blocked ? "루틴 생성을 중단했습니다" : "안전 점검 결과"}</h1>
        </div>
      </header>
      <p className="page-lede">{safety.summary}</p>

      <ul className="safety-list">
        {safety.findings.map((finding) => (
          <li key={finding.code} className={`safety-item ${finding.severity}`}>
            <span className="safety-badge">{SEVERITY_LABEL[finding.severity]}</span>
            <p>{finding.message}</p>
          </li>
        ))}
      </ul>

      {blocked && (
        <div className="safety-actions">
          <p className="safety-disclaimer">
            이 서비스는 의료 행위를 대신하지 않습니다. 위 항목은 전문가의 확인이 먼저
            필요한 상태라 운동 계획을 만들지 않았습니다.
          </p>
          {onBack && (
            <button type="button" className="secondary-button" onClick={onBack}>
              설문 다시하기
            </button>
          )}
        </div>
      )}
    </section>
  );
}
