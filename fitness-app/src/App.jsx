import { useEffect, useState } from "react";
import { api, storage } from "./api";
import Onboarding from "./components/Onboarding";
import RoutineRecommendation from "./components/RoutineRecommendation";
import Dashboard from "./components/Dashboard";
import LogPanel from "./components/LogPanel";
import WeeklyReport from "./components/WeeklyReport";
import Achievements from "./components/Achievements";
import ExerciseGuide from "./components/ExerciseGuide";
import SafetyNotice from "./components/SafetyNotice";
import appLogo from "./assets/images.jpg";
import "./App.css";

const TABS = [
  { id: "plan", label: "계획", icon: "📅" },
  { id: "log", label: "기록", icon: "✏️" },
  { id: "report", label: "리포트", icon: "📊" },
  { id: "growth", label: "성장", icon: "🏅" },
  { id: "guide", label: "운동", icon: "📖" },
];

export default function App() {
  const [currentView, setCurrentView] = useState("loading");
  const [userProfile, setUserProfile] = useState(null);
  const [userId, setUserId] = useState(null);
  const [plan, setPlan] = useState(null);
  const [safety, setSafety] = useState(null);
  const [tab, setTab] = useState("plan");
  const [dataVersion, setDataVersion] = useState(0);
  const [logDate, setLogDate] = useState(null);

  // 새로고침해도 저장된 계획으로 돌아온다.
  useEffect(() => {
    const controller = new AbortController();

    const restore = async () => {
      const savedId = storage.getUserId();
      if (!savedId) {
        if (!controller.signal.aborted) setCurrentView("onboarding");
        return;
      }

      let restored = null;
      try {
        restored = await api.activePlan(savedId, controller.signal);
      } catch {
        // 서버가 없으면 설문부터 다시 시작한다.
      }

      if (controller.signal.aborted) return;

      if (restored?.plan && restored?.profile) {
        setUserId(savedId);
        setUserProfile(restored.profile);
        setPlan(restored.plan);
        setCurrentView("dashboard");
      } else {
        setCurrentView("onboarding");
      }
    };

    restore();
    return () => controller.abort();
  }, []);

  const handleOnboardingComplete = ({ profile, userId: nextUserId, safety: nextSafety }) => {
    setUserProfile(profile);
    setUserId(nextUserId);
    setSafety(nextSafety);

    if (nextSafety?.blocked) {
      setCurrentView("blocked");
      return;
    }
    setCurrentView("routine-recommendation");
  };

  const handlePlanSelect = (savedPlan) => {
    setPlan(savedPlan);
    setTab("plan");
    setCurrentView("dashboard");
  };

  const handleRestart = () => {
    storage.clear();
    setUserProfile(null);
    setUserId(null);
    setPlan(null);
    setSafety(null);
    setCurrentView("onboarding");
  };

  const handlePlanRegenerated = (nextPlan) => {
    setPlan(nextPlan);
    setDataVersion((prev) => prev + 1);
  };

  const handlePlanChange = (schedule) => {
    setPlan((prev) => (prev ? { ...prev, schedule } : prev));
    setDataVersion((prev) => prev + 1);
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <img className="app-logo" src={appLogo} alt="AI Fitness Planner 로고" />
          <div>
            <p className="eyebrow">AI Fitness Planner</p>
            <h1>운동 루틴 추천 서비스</h1>
          </div>
        </div>
        <div className="stepper" aria-label="진행 단계">
          <span className={currentView === "onboarding" ? "active" : ""}>설문</span>
          <span className={currentView === "routine-recommendation" ? "active" : ""}>추천</span>
          <span className={currentView === "dashboard" ? "active" : ""}>관리</span>
        </div>
      </header>

      {currentView === "loading" && (
        <div className="panel loading-state">저장된 계획을 불러오는 중입니다.</div>
      )}

      {currentView === "onboarding" && <Onboarding onComplete={handleOnboardingComplete} />}

      {currentView === "blocked" && (
        <SafetyNotice safety={safety} onBack={handleRestart} />
      )}

      {currentView === "routine-recommendation" && userProfile && (
        <RoutineRecommendation
          userProfile={userProfile}
          userId={userId}
          onSelect={handlePlanSelect}
          onBack={() => setCurrentView("onboarding")}
        />
      )}

      {currentView === "dashboard" && plan && (
        <>
          <nav className="tab-bar" aria-label="화면 전환">
            {TABS.map((item) => (
              <button
                type="button"
                key={item.id}
                className={tab === item.id ? "tab active" : "tab"}
                onClick={() => setTab(item.id)}
              >
                <span className="tab-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="tab-label">{item.label}</span>
              </button>
            ))}
          </nav>

          {tab === "plan" && (
            <Dashboard
              userProfile={userProfile}
              userId={userId}
              routine={plan}
              onRestart={handleRestart}
              onPlanChange={handlePlanChange}
              onPlanSwitch={handlePlanRegenerated}
              dataVersion={dataVersion}
              onOpenLog={(date) => {
                setLogDate(date);
                setTab("log");
              }}
            />
          )}

          {tab === "log" && (
            <LogPanel
              key={logDate ?? "today"}
              userId={userId}
              plan={plan}
              initialDate={logDate}
              weightKg={userProfile?.weight ?? 70}
              onLogged={() => setDataVersion((prev) => prev + 1)}
            />
          )}

          {tab === "report" && (
            <WeeklyReport
              userId={userId}
              weekStart={plan.weekStart}
              refreshToken={dataVersion}
              onPlanRegenerated={handlePlanRegenerated}
            />
          )}

          {tab === "growth" && <Achievements userId={userId} refreshToken={dataVersion} />}

          {tab === "guide" && <ExerciseGuide />}
        </>
      )}
    </main>
  );
}
