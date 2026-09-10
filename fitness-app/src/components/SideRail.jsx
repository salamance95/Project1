import PlanSwitcher from "./PlanSwitcher";

/**
 * 사이드바 아래쪽 블록 — 1A 트레이닝 데스크 안.
 * 탭 버튼만 있던 .tab-bar 안에 세션 음악·체성분·계정·플랜을 함께 세운다.
 * 화면 전환은 전부 App.jsx 가 들고 있으므로 여기서는 표시만 한다.
 *
 * BMI·체지방·체형은 프로필이 아니라 플랜에 실려 온다(서버가 계획을 만들 때
 * 같이 계산해 둔다). 플랜이 없을 때만 키·체중으로 직접 BMI 를 낸다.
 */
export default function SideRail({
  userProfile,
  plan,
  userId,
  authSlot,
  signedIn,
  musicChips,
  onPlanSwitched,
  onRestart,
  onShowRoutines,
  onShowSafety,
}) {
  const bmi =
    plan?.bmi ??
    (userProfile?.height && userProfile?.weight
      ? Number((userProfile.weight / (userProfile.height / 100) ** 2).toFixed(1))
      : null);

  const bodyNote = [
    bmi ? `BMI ${bmi}${plan?.bmiCategory ? `(${plan.bmiCategory})` : ""}` : "BMI —",
    plan?.bodyFat ? `체지방 ${plan.bodyFat}%` : null,
    plan?.bodyType ?? null,
    plan?.split ? `${plan.split}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="side-rail">
      {musicChips?.length > 0 && (
        <div className="side-block">
          <span className="side-label">SESSION MUSIC</span>
          <div className="side-chips">
            {musicChips.map((chip) => (
              <span className="side-chip" key={chip}>
                {chip}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="side-card">
        <span className="side-label">체성분</span>
        <strong className="side-figure">
          {userProfile?.height ?? "—"}cm · {userProfile?.weight ?? "—"}kg
        </strong>
        <span className="side-note">{bodyNote}</span>
      </div>

      <div className="side-block">
        <span className="side-label">계정</span>
        <div className="side-account">
          {!signedIn && <span className="side-account-state">게스트로 사용 중</span>}
          {authSlot}
        </div>
        <span className="side-note">로그인은 선택입니다. 기록은 이 기기에 남습니다.</span>
      </div>

      <div className="side-block side-plan">
        <PlanSwitcher userId={userId} onSwitched={onPlanSwitched} onRestart={onRestart} />
      </div>

      <div className="side-foot">
        <button type="button" className="side-restart" onClick={onRestart}>
          설문 다시 하기
        </button>
        {onShowRoutines && (
          <button type="button" className="side-restart" onClick={onShowRoutines}>
            루틴 추천 3안
          </button>
        )}
        {onShowSafety && (
          <button type="button" className="side-restart" onClick={onShowSafety}>
            안전 점검 결과
          </button>
        )}
      </div>
    </div>
  );
}
