import { useEffect, useState } from "react";
import { api, storage } from "./api";
import Onboarding from "./components/Onboarding";
import RoutineRecommendation from "./components/RoutineRecommendation";
import TodayPanel from "./components/TodayPanel";
import Dashboard from "./components/Dashboard";
import LogPanel from "./components/LogPanel";
import WeeklyReport from "./components/WeeklyReport";
import Achievements from "./components/Achievements";
import ExerciseGuide from "./components/ExerciseGuide";
import MusicPanel from "./components/MusicPanel";
import SafetyNotice from "./components/SafetyNotice";
import AuthPanel from "./components/AuthPanel";
import SideRail from "./components/SideRail";
import { supabase } from "./api/supabaseClient";
import "./styles/App.css";
import "./styles/theme-1a.css";

const TABS = [
  { id: "today", label: "오늘", icon: "🏋️" },
  { id: "plan", label: "주간 계획", icon: "📅" },
  { id: "log", label: "기록", icon: "✏️" },
  { id: "growth", label: "성장", icon: "🏅" },
  { id: "guide", label: "운동 도감", icon: "📖" },
  { id: "music", label: "음악", icon: "🎧" },
];

/** 사이드바 항목 옆 숫자. 아직 안 들어온 값은 빈칸으로 둔다. */
function tabMeta(id, stats) {
  if (id === "today") return stats.totalDays ? `${stats.doneDays}/${stats.totalDays}` : "";
  if (id === "plan") return stats.weekNo ? `${stats.weekNo}주차` : "";
  if (id === "log") return stats.sets ? `${stats.sets}세트` : "";
  if (id === "growth") return stats.level ? `LV.${stats.level}` : "";
  if (id === "guide") return stats.exerciseCount ? `${stats.exerciseCount}종` : "";
  if (id === "music") return (stats.musicChips?.[0] ?? "").split(" · ")[0];
  return "";
}

export default function App() {
  const [currentView, setCurrentView] = useState("loading");
  const [userProfile, setUserProfile] = useState(null);
  const [userId, setUserId] = useState(null);
  const [plan, setPlan] = useState(null);
  const [safety, setSafety] = useState(null);
  const [tab, setTab] = useState("today");
  const [dataVersion, setDataVersion] = useState(0);
  const [logDate, setLogDate] = useState(null);
  const [authSession, setAuthSession] = useState(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [authError, setAuthError] = useState("");
  // 계획에서 운동을 눌렀을 때 운동 탭에서 바로 펼칠 동작.
  const [guideSlug, setGuideSlug] = useState(null);
  // 사이드바 항목 옆에 붙는 숫자와 세션 음악 칩.
  const [railStats, setRailStats] = useState({});

  useEffect(() => {
    if (!supabase) return;

    let alive = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) setAuthError(error.message);
      setAuthSession(data.session ?? null);
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session);
      setAuthReady(true);
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  // 새로고침해도 저장된 계획으로 돌아온다.
  useEffect(() => {
    if (!authReady) return;

    const controller = new AbortController();

    const restore = async () => {
      let savedId = storage.getUserId();

      // 계정 확인은 서버가 한다. 여기서 보낸 계정 id를 서버가 그냥 믿으면
      // 남의 id를 적어 보내 그 사람 기록을 열 수 있다.
      if (authSession?.access_token) {
        try {
          const linked = await api.linkSupabaseUser(
            { accessToken: authSession.access_token, claimUserId: savedId },
            controller.signal,
          );

          if (linked.userId) {
            savedId = linked.userId;
            storage.setUserId(savedId);
          } else {
            // 이 계정으로는 아직 설문을 안 했다. 게스트 기록을 물려주지 않는다.
            savedId = null;
            storage.clear();
          }
          if (!controller.signal.aborted) setAuthError("");
        } catch (err) {
          if (!controller.signal.aborted) {
            // 로그인 확인이 안 되면 게스트로 계속 쓴다. 앱을 멈출 이유는 없다.
            setAuthError(err.message);
          }
        }
      }

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
  }, [authReady, authSession?.user?.id, authSession?.access_token]);

  // 사이드바에 걸 값들. 실패해도 화면은 그대로 돌아가야 하므로 조용히 넘긴다.
  useEffect(() => {
    if (!userId || !plan?.weekStart) return undefined;

    const controller = new AbortController();

    const load = async () => {
      const today = new Date();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      const todayIso = `${today.getFullYear()}-${month}-${day}`;

      const [logs, game, plans, exercises, music] = await Promise.allSettled([
        api.logs(userId, plan.weekStart, controller.signal),
        api.gamification(userId, controller.signal),
        api.plans(userId, controller.signal),
        api.exercises("", controller.signal),
        api.music(userId, todayIso, controller.signal),
      ]);

      if (controller.signal.aborted) return;

      const val = (r) => (r.status === "fulfilled" ? r.value : null);
      const daily = val(logs)?.daily ?? [];
      const summary = val(game)?.summary ?? null;
      const weekStarts = [...new Set((val(plans)?.plans ?? []).map((item) => item.weekStart))].sort();
      const weekIndex = weekStarts.indexOf(plan.weekStart);
      const mixes = val(music)?.mixLists ?? {};
      const recommended = Object.values(mixes)
        .flat()
        .filter((mix) => mix.recommended);

      const rpeValues = daily.map((d) => d.rpe).filter((v) => typeof v === "number" && v > 0);

      setRailStats({
        daily,
        doneDays: daily.filter((d) => d.workoutStatus === "done").length,
        totalDays: daily.filter((d) => !d.isRestDay).length || daily.length || 7,
        sets: daily.reduce((total, d) => total + (d.loggedSets ?? 0), 0),
        level: summary?.level ?? null,
        streak: summary?.currentStreak ?? null,
        volume: summary?.totalVolume ?? null,
        rpe: rpeValues.length
          ? (rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length).toFixed(1)
          : null,
        weekNo: weekIndex >= 0 ? weekIndex + 1 : null,
        exerciseCount: (val(exercises)?.exercises ?? []).length,
        musicChips: recommended.slice(0, 2).map((mix) => mix.label),
      });
    };

    load().catch(() => {});
    return () => controller.abort();
  }, [userId, plan?.weekStart, dataVersion]);

  // 설문으로 새로 만들어진 사용자를 지금 로그인한 계정에 묶는다.
  const linkCurrentAuth = async (nextUserId) => {
    if (!authSession?.access_token || !nextUserId) return;

    try {
      await api.linkSupabaseUser({
        accessToken: authSession.access_token,
        claimUserId: nextUserId,
      });
      setAuthError("");
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleOnboardingComplete = ({ profile, userId: nextUserId, safety: nextSafety }) => {
    setUserProfile(profile);
    setUserId(nextUserId);
    setSafety(nextSafety);
    linkCurrentAuth(nextUserId);

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

  /**
   * 로그아웃하면 이 기기에 남은 사용자 id도 지운다.
   * 안 지우면 로그아웃한 뒤에도 그 계정의 계획이 그대로 보인다 — 공용 PC에서는
   * 남의 기록을 보게 되는 셈이고, 다음 로그인 때 남의 기록을 가져가려는
   * 요청이 되어 서버에서 거절당한다.
   */
  const handleSignedOut = () => {
    storage.clear();
    setAuthError("");
    setUserProfile(null);
    setUserId(null);
    setPlan(null);
    setSafety(null);
    setCurrentView("onboarding");
  };

  const handleRestart = () => {
    storage.clear();
    setUserProfile(null);
    setUserId(null);
    setPlan(null);
    setSafety(null);
    setCurrentView("onboarding");
  };

  const handleChangePlan = () => {
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
        <AuthPanel
          session={authSession}
          busy={!authReady}
          error={authError}
          onSignOut={handleSignedOut}
        />
      </header>

      {currentView === "loading" && (
        <div className="panel loading-state">저장된 계획을 불러오는 중입니다.</div>
      )}

      {currentView === "onboarding" && <Onboarding onComplete={handleOnboardingComplete} />}

      {currentView === "blocked" && (
        <SafetyNotice safety={safety} onBack={plan ? () => setCurrentView("dashboard") : handleRestart} />
      )}

      {currentView === "routine-recommendation" && userProfile && (
        <RoutineRecommendation
          userProfile={userProfile}
          userId={userId}
          onSelect={handlePlanSelect}
          onBack={() => setCurrentView(plan ? "dashboard" : "onboarding")}
        />
      )}

      {currentView === "dashboard" && plan && (
        <>
          <nav className="tab-bar" aria-label="화면 전환">
            <div className="rail-brand">
              <span className="rail-brand-mark">AI FITNESS</span>
              <strong className="rail-brand-name">트레이닝 데스크</strong>
            </div>

            {TABS.map((item) => (
              <button
                type="button"
                key={item.id}
                className={tab === item.id ? "tab active" : "tab"}
                onClick={() => {
                  // 탭을 직접 누른 경우에는 목록부터 보여준다.
                  if (item.id === "guide") setGuideSlug(null);
                  setTab(item.id);
                }}
              >
                <span className="tab-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="tab-label">{item.label}</span>
                <span className="tab-meta">{tabMeta(item.id, railStats)}</span>
              </button>
            ))}

            <SideRail
              userProfile={userProfile}
              plan={plan}
              musicChips={railStats.musicChips}
              userId={userId}
              authSlot={
                <AuthPanel
                  session={authSession}
                  busy={!authReady}
                  error={authError}
                  onSignOut={handleSignedOut}
                />
              }
              signedIn={Boolean(authSession?.user)}
              onPlanSwitched={handlePlanRegenerated}
              onRestart={handleChangePlan}
              onShowRoutines={userProfile ? () => setCurrentView("routine-recommendation") : undefined}
              onShowSafety={safety ? () => setCurrentView("blocked") : undefined}
            />
          </nav>

          {tab === "today" && (
            <TodayPanel
              userId={userId}
              routine={plan}
              stats={railStats}
              weightKg={userProfile?.weight ?? 70}
              onPlanChange={handlePlanChange}
              onOpenLog={(date) => {
                setLogDate(date);
                setTab("log");
              }}
              onOpenPlan={() => setTab("plan")}
              onOpenGuide={(slug) => {
                setGuideSlug(slug);
                setTab("guide");
              }}
            />
          )}

          {tab === "plan" && (
            <Dashboard
              userProfile={userProfile}
              userId={userId}
              routine={plan}
              onPlanChange={handlePlanChange}
              onPlanSwitch={handlePlanRegenerated}
              dataVersion={dataVersion}
              onOpenLog={(date) => {
                setLogDate(date);
                setTab("log");
              }}
              onOpenGuide={(slug) => {
                setGuideSlug(slug);
                setTab("guide");
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

          {tab === "growth" && (
            <>
              <Achievements userId={userId} refreshToken={dataVersion} />
              <WeeklyReport
                userId={userId}
                weekStart={plan.weekStart}
                refreshToken={dataVersion}
                onPlanRegenerated={handlePlanRegenerated}
              />
            </>
          )}

          {tab === "guide" && (
            <ExerciseGuide key={guideSlug ?? "browse"} initialSlug={guideSlug} />
          )}

          {tab === "music" && <MusicPanel userId={userId} />}
        </>
      )}
    </main>
  );
}
