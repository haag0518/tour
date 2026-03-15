import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot 
} from 'firebase/firestore';
import { 
  Fuel, 
  Wallet, 
  Map, 
  TrendingUp, 
  Plus, 
  Navigation,
  Info,
  Calendar,
  Calculator,
  Edit2, 
  Trash2,
  X,
  Route,
  ArrowRight,
  Clock,
  RotateCcw,
  AlertTriangle,
  Check,
  Maximize2,
  Sun,
  Moon,
  Cloud,
  RefreshCw,
  Flag
} from 'lucide-react';

// --- Firebase 초기화 ---
// 로컬(VS Code)에서는 팀장님의 설정값이, 프리뷰 화면에서는 기본 설정값이 작동하도록 똑똑하게 합쳐두었습니다.
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "AIzaSyDsxRfyZf2fvCRFN0rOsApp4R13TqB1cmk",
      authDomain: "tour-80175.firebaseapp.com",
      projectId: "tour-80175",
      storageBucket: "tour-80175.firebasestorage.app",
      messagingSenderId: "589076526642",
      appId: "1:589076526642:web:72607d7b054c207c086e2b"
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'gsa-tour-sync';

const App = () => {
  // --- 상태 관리 ---
  const [user, setUser] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // GPS 고도 관련 상태 (가짜 숫자 대신 0으로 시작)
  const [currentAltitude, setCurrentAltitude] = useState(0); 
  const [maxAltitude, setMaxAltitude] = useState(0);
  const maxAltitudeRef = useRef(0); // 실시간 비교를 위한 참조값
  
  // 실시간 환율 (구글 매매기준율 기준)
  const [rates, setRates] = useState({ MYR: 1, THB: 7.82, LAK: 4500 });
  const [rateLoading, setRateLoading] = useState(true);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [orientation, setOrientation] = useState(window.innerHeight > window.innerWidth ? 'portrait' : 'landscape');
  
  // 클라우드 데이터 상태
  const [logs, setLogs] = useState([]);
  const [startOdo, setStartOdo] = useState(0); 
  const [currentOdo, setCurrentOdo] = useState(0); 
  const [sessionStart, setSessionStart] = useState(0); 
  const [loading, setLoading] = useState(true);

  const [showOdoModal, setShowOdoModal] = useState(false);
  const [tempStartOdo, setTempStartOdo] = useState('');
  const [tempCurrentOdo, setTempCurrentOdo] = useState('');
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [newRoute, setNewRoute] = useState({ startLoc: '', endLoc: '', startTime: '', endTime: '', distance: '' });
  const [editingLog, setEditingLog] = useState(null);
  const [confirmState, setConfirmState] = useState({ show: false, message: '', onConfirm: null });

  // --- 1. 실시간 환율 로드 ---
  const fetchRealTimeRates = async () => {
    try {
      setRateLoading(true);
      const response = await fetch('https://open.er-api.com/v6/latest/MYR');
      const data = await response.json();
      if (data && data.rates) {
        setRates({
          MYR: 1,
          THB: parseFloat(data.rates.THB.toFixed(2)),
          LAK: parseFloat(data.rates.LAK.toFixed(0))
        });
      }
    } catch (error) {
      console.error("Rate load failed:", error);
    } finally {
      setRateLoading(false);
    }
  };

  // --- 2. 인증 및 초기화 ---
  useEffect(() => {
    // iOS 사파리 입력창 포커스 시 자동 확대 방지 설정
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      document.head.appendChild(meta);
    }
    meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0';

    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth Error:", error);
      }
    };
    initAuth();
    fetchRealTimeRates();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // --- 3. Firestore 데이터 동기화 ---
  useEffect(() => {
    if (!user) return;

    const configDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'state');
    const unsubscribeConfig = onSnapshot(configDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setStartOdo(data.startOdo || 0);
        setCurrentOdo(data.currentOdo || 0);
        setSessionStart(data.sessionStart || 0);
        
        // 클라우드에 저장된 최고 고도 동기화
        if (data.maxAltitude !== undefined) {
          setMaxAltitude(data.maxAltitude);
          maxAltitudeRef.current = data.maxAltitude;
        }
      }
      setLoading(false);
    }, (err) => console.error("Config fetch error:", err));

    const logsColRef = collection(db, 'artifacts', appId, 'public', 'data', 'logs');
    const unsubscribeLogs = onSnapshot(logsColRef, (querySnapshot) => {
      const logsArray = [];
      querySnapshot.forEach((doc) => {
        logsArray.push({ id: doc.id, ...doc.data() });
      });
      // 전체 로그 시간 역순 정렬
      setLogs(logsArray.sort((a, b) => b.timestamp - a.timestamp));
    }, (err) => console.error("Logs fetch error:", err));

    return () => {
      unsubscribeConfig();
      unsubscribeLogs();
    };
  }, [user]);

  // --- 4. GPS 실시간 고도 추적 ---
  useEffect(() => {
    // 브라우저가 GPS를 지원하지 않으면 종료
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const alt = position.coords.altitude;
        // GPS가 고도값을 제공할 경우에만 작동
        if (alt !== null) {
          const currentAltValue = Math.round(alt);
          setCurrentAltitude(currentAltValue); // 현재 고도 업데이트
          
          // 현재 고도가 예전 최고 고도보다 높다면? 신기록 달성!
          if (currentAltValue > maxAltitudeRef.current) {
            setMaxAltitude(currentAltValue);
            maxAltitudeRef.current = currentAltValue;
            
            // 파이어베이스에 새로운 최고 고도 저장
            if (user) {
              const configDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'state');
              setDoc(configDocRef, { maxAltitude: currentAltValue }, { merge: true })
                .catch(e => console.error("고도 저장 에러", e));
            }
          }
        }
      },
      (error) => {
        console.warn(`GPS 상태 알림 [코드 ${error.code}]: ${error.message}`);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 15000
      }
    );

    // 컴포넌트 종료 시 GPS 추적 중지
    return () => navigator.geolocation.clearWatch(watchId);
  }, [user]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      setOrientation(window.innerHeight > window.innerWidth ? 'portrait' : 'landscape');
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- 시간 계산 도우미 함수 ---
  const calculateDuration = (start, end) => {
    if (!start || !end) return '';
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let diffMins = (eh * 60 + em) - (sh * 60 + sm);
    if (diffMins < 0) diffMins += 24 * 60; // 자정 넘김 대응
    const h = Math.floor(diffMins / 60);
    const m = diffMins % 60;
    if (h === 0) return `${m}분`;
    return `${h}시간 ${m > 0 ? m + '분' : ''}`;
  };

  // --- 데이터 조작 함수 ---
  const saveConfigToCloud = async (sOdo, cOdo, sTime) => {
    if (!user) return;
    const configDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'state');
    await setDoc(configDocRef, { startOdo: sOdo, currentOdo: cOdo, sessionStart: sTime }, { merge: true });
  };

  const handleAddRoute = async () => {
    if (!newRoute.startLoc || !newRoute.endLoc || !newRoute.distance || !user) return;
    const dist = parseFloat(parseFloat(newRoute.distance).toFixed(2));
    const newCurrentOdo = parseFloat((currentOdo + dist).toFixed(2));
    await saveConfigToCloud(startOdo, newCurrentOdo, sessionStart);
    const logsColRef = collection(db, 'artifacts', appId, 'public', 'data', 'logs');
    await addDoc(logsColRef, {
      timestamp: Date.now(),
      date: todayStr, 
      type: 'route',
      title: `${newRoute.startLoc} -> ${newRoute.endLoc}`,
      startLoc: newRoute.startLoc, endLoc: newRoute.endLoc,
      startTime: newRoute.startTime, endTime: newRoute.endTime,
      distance: dist, costRM: 0, costLocal: 0, currency: '-'
    });
    setNewRoute({ startLoc: '', endLoc: '', startTime: '', endTime: '', distance: '' });
    setShowRouteModal(false);
  };

  const executeDelete = async (id) => {
    if (!user) return;
    const logToDelete = logs.find(l => l.id === id);
    if (logToDelete && logToDelete.type === 'route') {
      const newCurrentOdo = parseFloat(Math.max(0, currentOdo - logToDelete.distance).toFixed(2));
      await saveConfigToCloud(startOdo, newCurrentOdo, sessionStart);
    }
    const logDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'logs', id);
    await deleteDoc(logDocRef);
    setConfirmState({ show: false, message: '', onConfirm: null });
  };

  const executeResetSession = async () => {
    await saveConfigToCloud(startOdo, currentOdo, Date.now());
    setConfirmState({ show: false, message: '', onConfirm: null });
  };

  const executeFullReset = async () => {
    if (!user) return;
    for (const log of logs) {
      const logDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'logs', log.id);
      await deleteDoc(logDocRef);
    }
    await saveConfigToCloud(0, 0, 0);
    // 초기화 시 최고 고도도 삭제
    const configDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'state');
    await updateDoc(configDocRef, { maxAltitude: 0 }).catch(() => {});
    setMaxAltitude(0);
    maxAltitudeRef.current = 0;
    
    setConfirmState({ show: false, message: '', onConfirm: null });
    setActiveTab('dashboard');
  };

  const handleUpdateLog = async () => {
    if (!user || !editingLog) return;
    const logDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'logs', editingLog.id);
    const originalLog = logs.find(l => l.id === editingLog.id);
    if (editingLog.type === 'route') {
      const newDist = parseFloat(editingLog.distance);
      const diff = newDist - originalLog.distance;
      const newCurrentOdo = parseFloat(Math.max(0, currentOdo + diff).toFixed(2));
      await saveConfigToCloud(startOdo, newCurrentOdo, sessionStart);
      await updateDoc(logDocRef, { ...editingLog, distance: newDist, title: `${editingLog.startLoc} -> ${editingLog.endLoc}` });
    } else {
      const rm = parseFloat(editingLog.costLocal) / rates[editingLog.currency];
      await updateDoc(logDocRef, { ...editingLog, costRM: parseFloat(rm.toFixed(2)) });
    }
    setEditingLog(null);
  };

  const handleSaveStartOdo = async () => {
    const sOdo = tempStartOdo !== '' ? parseFloat(tempStartOdo) : startOdo;
    const cOdo = tempCurrentOdo !== '' ? parseFloat(tempCurrentOdo) : currentOdo;
    await saveConfigToCloud(sOdo, cOdo, sessionStart);
    setShowOdoModal(false);
  };

  // --- 실시간 수치 연산 ---
  const todayStr = new Date().toISOString().split('T')[0];
  const totalDrivenDistance = parseFloat(Math.max(0, currentOdo - startOdo).toFixed(2));
  const currentSessionLogs = logs.filter(log => log.timestamp >= sessionStart);
  
  // 오늘의 경로: 먼저 시작한 일정이 위로 가도록 정렬
  const todaysRoutes = currentSessionLogs
    .filter(l => l.type === 'route')
    .sort((a, b) => a.timestamp - b.timestamp);

  // 금일 총 소요시간 (첫 출발 ~ 마지막 도착)
  const firstRoute = todaysRoutes.length > 0 ? todaysRoutes[0] : null;
  const lastRoute = todaysRoutes.length > 0 ? todaysRoutes[todaysRoutes.length - 1] : null;
  const totalDayDuration = (firstRoute && lastRoute) ? calculateDuration(firstRoute.startTime, lastRoute.endTime) : '';

  const todayDistance = parseFloat(currentSessionLogs.filter(l => l.type === 'route').reduce((sum, log) => sum + (parseFloat(log.distance) || 0), 0).toFixed(2));
  const todayExpense = currentSessionLogs.reduce((sum, log) => sum + (log.costRM || 0), 0).toFixed(0);
  const totalExpense = logs.reduce((sum, log) => sum + (log.costRM || 0), 0).toFixed(0);

  const calculateEfficiency = () => {
    const fuelLogs = logs.filter(l => l.type === 'fuel');
    if (fuelLogs.length < 1) return 0;
    const totalFuel = fuelLogs.reduce((sum, log) => sum + (parseFloat(log.fuelLiters) || 0), 0);
    return totalFuel > 0 ? (totalDrivenDistance / totalFuel).toFixed(1) : 0;
  };

  const [calcCurrency, setCalcCurrency] = useState('THB');
  const [calcAmount, setCalcAmount] = useState('');
  const [entryType, setEntryType] = useState('fuel'); 
  const [inputCurrency, setInputCurrency] = useState('MYR'); 
  const [inputTitle, setInputTitle] = useState('');
  const [inputAmountLocal, setInputAmountLocal] = useState('');
  const [inputOdo, setInputOdo] = useState('');
  const [inputLiters, setInputLiters] = useState('');

  const handleInputFocus = (e) => e.target.select();
  const openConfirm = (msg, action) => setConfirmState({ show: true, message: msg, onConfirm: action });

  // --- 테마 스타일 설정 ---
  const theme = {
    bg: isDarkMode ? 'bg-slate-950' : 'bg-white',
    header: isDarkMode ? 'bg-slate-900 border-slate-800 shadow-lg' : 'bg-white border-slate-100 shadow-sm',
    card: isDarkMode ? 'bg-slate-800/50 border-slate-700/50' : 'bg-slate-50 border-slate-200 shadow-sm hover:shadow-md transition-shadow',
    inner: isDarkMode ? 'bg-slate-900' : 'bg-white',
    textMain: isDarkMode ? 'text-white' : 'text-slate-900',
    textSub: isDarkMode ? 'text-slate-400' : 'text-slate-500',
    input: isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300',
    nav: isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white/95 border-slate-200',
  };

  // --- UI 컴포넌트 ---
  const Header = () => (
    <div className={`${theme.header} px-3 py-2 flex justify-between items-center border-b sticky top-0 z-40 transition-colors duration-500`}>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-black leading-none text-blue-600 tracking-tight">{currentAltitude}</span>
        <span className={`${theme.textSub} text-[9px] font-bold tracking-tighter uppercase`}>m (현재고도)</span>
        {!loading && <Cloud size={10} className="text-emerald-500 ml-1 animate-pulse" title="클라우드 동기화 완료" />}
      </div>
      
      <div className="text-right flex items-center gap-2">
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-1">
            <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter leading-none mb-0.5">Rate (1 MYR)</p>
            {rateLoading && <RefreshCw size={7} className="animate-spin text-slate-300" />}
          </div>
          <p className="text-[11px] font-mono font-bold text-emerald-600 leading-none">
            {rates.THB} THB | {rates.LAK} LAK
          </p>
        </div>
        <button onClick={() => setIsDarkMode(!isDarkMode)} className={`ml-1 p-1.5 rounded-full ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'} transition-all active:scale-90`}>
           {isDarkMode ? <Moon size={12} className="text-blue-400" /> : <Sun size={12} className="text-orange-400" />}
        </button>
      </div>
    </div>
  );

  const DashboardCard = ({ title, value, unit, icon: Icon, color, onClick, bottomText }) => (
    <div onClick={onClick} className={`${theme.card} p-4 rounded-2xl border flex flex-col justify-between cursor-pointer active:scale-95 transition-all duration-300`}>
      <div className="flex justify-between items-start mb-2">
        <div className={`p-2 rounded-lg ${color} bg-opacity-20`}><Icon size={20} className={color.replace('bg-', 'text-')} /></div>
        <Info size={14} className={isDarkMode ? 'text-slate-600' : 'text-slate-300'} />
      </div>
      <div className="flex flex-col flex-1 justify-end">
        <p className={`${theme.textSub} text-[10px] font-bold uppercase tracking-wider`}>{title}</p>
        <div className="flex items-baseline gap-1">
          <span className={`${theme.textMain} text-2xl font-black leading-tight`}>{value}</span>
          <span className={`${theme.textSub} text-[10px] font-bold uppercase ml-0.5`}>{unit}</span>
        </div>
        <div className="min-h-[14px]"> 
          {bottomText && <p className="text-[9px] text-slate-400 font-mono font-bold leading-none mt-1">{bottomText}</p>}
        </div>
      </div>
    </div>
  );

  const renderDashboard = () => {
    const calculatorSection = (
      <div className={`${theme.card} p-4 rounded-2xl border flex flex-col gap-3 h-fit transition-colors duration-500`}>
        <div className="flex justify-between items-center">
          <h3 className={`${theme.textMain} text-sm font-black flex items-center gap-2`}><Calculator size={16} className="text-emerald-500" /> 환율 계산기</h3>
          <div className={`${theme.inner} flex gap-1 p-1 rounded-lg border ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
            {['THB', 'LAK'].map(c => (
              <button key={c} onClick={() => setCalcCurrency(c)} className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${calcCurrency === c ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400'}`}>{c}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-[1.2]">
            <input type="number" value={calcAmount} onFocus={handleInputFocus} onChange={(e) => setCalcAmount(e.target.value)} className={`${theme.inner} w-full border ${isDarkMode ? 'border-slate-700' : 'border-slate-200'} rounded-lg p-2.5 pr-10 ${theme.textMain} font-mono text-[16px] outline-none placeholder:text-[10px]`} placeholder="0" />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">{calcCurrency}</div>
          </div>
          <div className="text-slate-300 font-black text-lg">=</div>
          <div className={`${theme.inner} flex-1 border ${isDarkMode ? 'border-slate-700' : 'border-slate-100'} rounded-lg p-2.5 flex justify-between items-center`}>
            <span className="text-base font-black text-emerald-600">{calcAmount ? (parseFloat(calcAmount) / rates[calcCurrency]).toFixed(2) : '0.00'}</span>
            <span className="text-slate-400 text-[10px] font-bold">MYR</span>
          </div>
        </div>
      </div>
    );

    const routesSection = (
      <div className={`${theme.card} p-4 rounded-2xl border h-fit transition-colors duration-500`}>
        <div className="flex justify-between items-center mb-1">
          <h3 className={`${theme.textMain} text-xs font-bold flex items-center gap-1.5`}><Map size={14} className="text-blue-500" /> 오늘의 경로</h3>
          <div className="flex gap-2">
            <button onClick={() => openConfirm("오늘의 대시보드 기록을 초기화할까요?", executeResetSession)} className={`text-[9px] ${theme.textSub} ${theme.inner} border px-2 py-1.5 rounded-lg flex items-center gap-1 hover:text-red-500 transition-colors active:scale-95`}><RotateCcw size={10} /> 초기화</button>
            <button onClick={() => setShowRouteModal(true)} className="text-[9px] bg-blue-600/10 text-blue-600 font-bold px-2 py-1.5 rounded-lg flex items-center gap-1 hover:bg-blue-600/20 transition-colors active:scale-95"><Plus size={10}/> 추가</button>
          </div>
        </div>

        {/* 금일 총 소요시간 표시 */}
        {todaysRoutes.length > 0 && (
          <div className="mb-4 flex items-center gap-2 bg-blue-50/50 p-2 rounded-xl border border-blue-100 animate-in fade-in duration-500">
             <Clock size={12} className="text-blue-500" />
             <div className="flex-1 flex flex-col">
                <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tight leading-none mb-0.5">금일 총 소요시간</span>
                <p className="text-[10px] font-bold text-slate-700 leading-none">
                  {firstRoute.startTime} ~ {lastRoute.endTime} <span className="text-blue-600 ml-1">({totalDayDuration})</span>
                </p>
             </div>
             <Flag size={12} className="text-emerald-500" />
          </div>
        )}

        {todaysRoutes.length === 0 ? (
          <div className="py-4 flex flex-col items-center opacity-20"><Route size={24} className={`${theme.textMain} mb-1`} /><p className={`${theme.textMain} text-[10px]`}>기록이 없습니다</p></div>
        ) : (
          <div className="space-y-4">
            {todaysRoutes.map((r) => (
              <div key={r.id} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500 shadow-sm" />
                  <p className={`${theme.textMain} text-[11px] font-bold flex-1`}>출발지: {r.startLoc}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm" />
                  <p className={`${theme.textMain} text-[11px] font-bold flex-1`}>도착지: {r.endLoc}</p>
                </div>
                <div className="flex items-center justify-between pl-5 pr-1">
                   <div className="flex items-baseline gap-1.5">
                      <span className="text-slate-400 font-mono text-[10px]">{r.startTime} ~ {r.endTime}</span>
                      <span className="text-blue-500 font-bold text-[9px]">({calculateDuration(r.startTime, r.endTime)})</span>
                   </div>
                   <span className="text-blue-600 font-black text-xs">{r.distance} km</span>
                </div>
                <div className={`mt-2 border-b border-dashed ${isDarkMode ? 'border-slate-700/50' : 'border-slate-100'}`} />
              </div>
            ))}
          </div>
        )}
      </div>
    );

    const cardsSection = (
      <div className="grid grid-cols-2 gap-4">
        <DashboardCard title="오늘 달린 거리" value={todayDistance} unit="km" icon={Route} color="bg-indigo-500" onClick={() => setShowRouteModal(true)} />
        <DashboardCard title="총 누적 주행거리" value={totalDrivenDistance} unit="km" icon={Navigation} color="bg-indigo-700" onClick={() => { setTempStartOdo(startOdo); setTempCurrentOdo(currentOdo); setShowOdoModal(true); }} bottomText={`현재 ODO: ${currentOdo}`} />
        <DashboardCard title="오늘 지출" value={todayExpense} unit="MYR" icon={Wallet} color="bg-emerald-500" />
        <DashboardCard title="누적 지출" value={totalExpense} unit="MYR" icon={Wallet} color="bg-emerald-700" />
        <DashboardCard title="실연비" value={calculateEfficiency()} unit="km/L" icon={Fuel} color="bg-orange-500" />
        <DashboardCard title="최고 고도" value={maxAltitude} unit="m" icon={TrendingUp} color="bg-blue-500" />
      </div>
    );

    // 가로 모드 (아이패드 등): 왼쪽 [계산기 + 경로] / 오른쪽 [6개 카드]
    if (!isMobile && orientation === 'landscape') {
      return (
        <div className="p-4 grid grid-cols-2 gap-4 items-start pb-28">
           <div className="flex flex-col gap-4">
             {calculatorSection}
             {routesSection}
           </div>
           {cardsSection}
        </div>
      );
    }

    // 세로 모드: 계산기 -> 카드 -> 오늘의 경로 순
    return (
      <div className="p-4 flex flex-col gap-4 pb-28">
        {calculatorSection}
        {cardsSection}
        {routesSection}
      </div>
    );
  };

  const renderLogs = () => (
    <div className="p-4 space-y-4 pb-32">
      <h3 className={`${theme.textMain} font-black text-lg px-2`}>전체 일지</h3>
      {logs.length === 0 ? (
        <div className="text-center py-20 opacity-30"><Info size={40} className={`${theme.textMain} mx-auto mb-2`}/><p className={theme.textMain}>기록이 없습니다</p></div>
      ) : (
        logs.map(log => (
          <div key={log.id} className={`${theme.card} p-4 rounded-2xl border flex flex-col gap-3 transition-colors duration-500`}>
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl ${log.type === 'fuel' ? 'bg-blue-100 text-blue-600' : log.type === 'route' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}>
                {log.type === 'fuel' ? <Fuel size={18} /> : log.type === 'route' ? <Route size={18} /> : <Wallet size={18} />}
              </div>
              <div className="flex-1">
                {log.type === 'route' ? (
                  <><p className={`${theme.textMain} font-bold text-sm`}>{log.startLoc} → {log.endLoc}</p><p className="text-slate-400 text-[10px]">{log.date} • {log.startTime || '--'}~{log.endTime || '--'}</p></>
                ) : (
                  <><p className={`${theme.textMain} font-bold text-sm`}>{log.title}</p><p className="text-slate-400 text-[10px]">{log.date} • {log.odo}km</p></>
                )}
              </div>
              <div className="text-right">
                {log.type === 'route' ? <span className="text-indigo-600 font-bold">+{log.distance}km</span> : <span className="text-emerald-600 font-bold">{log.costRM} MYR</span>}
              </div>
            </div>
            <div className={`flex justify-end gap-4 pt-2 border-t ${isDarkMode ? 'border-slate-700/50' : 'border-slate-100'}`}>
              <button onClick={() => setEditingLog({...log})} className="text-[10px] font-bold text-blue-500 active:opacity-60">수정</button>
              <button onClick={() => openConfirm("이 기록을 삭제할까요? 주행거리와 지출 내역이 함께 삭제됩니다.", () => executeDelete(log.id))} className="text-[10px] font-bold text-red-500 active:opacity-60">삭제</button>
            </div>
          </div>
        ))
      )}
      {logs.length > 0 && (
        <button onClick={() => openConfirm("앱의 모든 데이터를 싹 지우고 새로 시작할까요?", executeFullReset)} className="w-full mt-10 py-4 rounded-2xl bg-red-50 border border-red-200 text-red-500 text-xs font-bold shadow-sm active:bg-red-100 transition-colors">전체 데이터 초기화</button>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className={`min-h-screen ${theme.bg} flex items-center justify-center`}>
        <div className="text-center">
          <Cloud size={48} className="text-blue-500 animate-bounce mx-auto mb-4" />
          <p className={`${theme.textMain} font-black`}>데이터 동기화 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${theme.bg} transition-colors duration-700 relative overflow-x-hidden app-container`}>
      <style>{`
        .app-container, main, div, section { scrollbar-width: none; -ms-overflow-style: none; overscroll-behavior: none; }
        .app-container::-webkit-scrollbar, main::-webkit-scrollbar, div::-webkit-scrollbar { display: none; }
        body { position: fixed; width: 100%; height: 100%; overflow: hidden; background-color: ${isDarkMode ? '#020617' : '#ffffff'}; }
        main { height: calc(100vh - 100px); overflow-y: auto; margin-top: 0px; }
      `}</style>

      <Header />
      
      <main className="max-w-4xl mx-auto">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'expense' && (
          <div className="p-4 h-full pb-40 flex justify-center">
             <div className={`${theme.card} p-4 rounded-2xl border shadow-2xl relative transition-all duration-500 w-full max-w-sm`}>
                <button onClick={() => setActiveTab('dashboard')} className={`${theme.inner} absolute right-4 top-4 p-2 rounded-full text-slate-400 hover:text-red-500 transition-colors`}><X size={18} /></button>
                <h2 className={`${theme.textMain} text-lg font-black mb-4 uppercase tracking-tight`}>기록 추가</h2>
                <div className={`${theme.inner} flex gap-2 mb-4 p-1 rounded-xl border ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                  <button onClick={() => setEntryType('fuel')} className={`flex-1 py-2.5 rounded-lg font-bold transition-all ${entryType === 'fuel' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400'}`}>주유</button>
                  <button onClick={() => setEntryType('expense')} className={`flex-1 py-2.5 rounded-lg font-bold transition-all ${entryType === 'expense' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400'}`}>지출</button>
                </div>
                <div className="space-y-3">
                  <input type="text" value={inputTitle} onChange={(e) => setInputTitle(e.target.value)} className={`${theme.input} w-full rounded-xl p-3.5 ${theme.textMain} outline-none text-[16px] focus:ring-1 focus:ring-blue-500/20`} placeholder="내용 입력" />
                  <div className={`${theme.inner} p-3 rounded-xl border ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-2 text-center tracking-widest">통화 선택</label>
                    <div className="flex gap-2 mb-3">
                      {['MYR', 'THB', 'LAK'].map(curr => (
                        <button key={curr} onClick={() => setInputCurrency(curr)} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${inputCurrency === curr ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-200 border border-transparent'}`}>{curr}</button>
                      ))}
                    </div>
                    <div className="relative">
                      <input type="number" value={inputAmountLocal} onFocus={handleInputFocus} onChange={(e) => setInputAmountLocal(e.target.value)} className={`${theme.input} w-full rounded-xl p-3 ${theme.textMain} font-mono outline-none text-center text-lg focus:ring-1 focus:ring-blue-500/20`} placeholder="0.00" />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">{inputCurrency}</div>
                    </div>
                  </div>
                  {entryType === 'fuel' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-[9px] text-slate-400 block mb-1 ml-1 font-bold uppercase">ODO (km)</label><input type="number" value={inputOdo} onFocus={handleInputFocus} onChange={(e) => setInputOdo(e.target.value)} className={`${theme.input} w-full rounded-xl p-3 ${theme.textMain} outline-none font-mono text-[16px] focus:ring-1 focus:ring-blue-500/20`} placeholder="0" /></div>
                      <div><label className="text-[9px] text-slate-400 block mb-1 ml-1 font-bold uppercase">리터(L)</label><input type="number" value={inputLiters} onFocus={handleInputFocus} onChange={(e) => setInputLiters(e.target.value)} className={`${theme.input} w-full rounded-xl p-3 ${theme.textMain} outline-none font-mono text-[16px] focus:ring-1 focus:ring-blue-500/20`} placeholder="0.0" /></div>
                    </div>
                  )}
                  <div className={`${theme.inner} p-3 rounded-xl border border-dashed ${isDarkMode ? 'border-slate-700' : 'border-slate-100'} flex justify-between items-center px-4`}>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter leading-none">MYR 환산 금액</span>
                    <span className="text-lg font-black text-emerald-600">≈ {(parseFloat(inputAmountLocal || 0) / rates[inputCurrency]).toFixed(2)} MYR</span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => setActiveTab('dashboard')} className={`${theme.inner} flex-1 py-4 rounded-xl border ${theme.textSub} font-bold text-base active:scale-95 transition-transform`}>취소</button>
                    <button 
                      onClick={async () => { 
                        if (!inputTitle || !inputAmountLocal || !user) return; 
                        const rm = parseFloat(inputAmountLocal) / rates[inputCurrency];
                        const newOdoVal = entryType === 'fuel' ? parseInt(inputOdo || currentOdo) : currentOdo;
                        if (entryType === 'fuel') await saveConfigToCloud(startOdo, newOdoVal, sessionStart);
                        const logsColRef = collection(db, 'artifacts', appId, 'public', 'data', 'logs');
                        await addDoc(logsColRef, { timestamp: Date.now(), date: todayStr, type: entryType, title: inputTitle, odo: newOdoVal, fuelLiters: entryType === 'fuel' ? parseFloat(inputLiters || 0) : 0, costLocal: parseFloat(inputAmountLocal), currency: inputCurrency, costRM: parseFloat(rm.toFixed(2)) });
                        setInputTitle(''); setInputAmountLocal(''); setInputLiters(''); setInputOdo(''); setActiveTab('logs'); 
                      }} 
                      className="flex-[2] py-4 rounded-xl bg-blue-600 text-white font-black text-base shadow-lg active:scale-95 transition-transform hover:bg-blue-500"
                    >
                      저장하기
                    </button>
                  </div>
                </div>
             </div>
          </div>
        )}
        {activeTab === 'logs' && renderLogs()}
      </main>

      <nav className={`${theme.nav} fixed bottom-0 left-0 right-0 backdrop-blur-xl border-t p-3 pb-8 flex justify-around items-center z-40 transition-colors duration-500 shadow-inner`}>
        <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-1 ${activeTab === 'dashboard' ? 'text-blue-600' : 'text-slate-400'} active:scale-110 transition-transform`}><Map size={24} /><span className="text-[10px] font-bold uppercase tracking-tighter">대시보드</span></button>
        <button onClick={() => setActiveTab('expense')} className="flex flex-col items-center gap-1 transition-transform active:scale-110"><div className="bg-blue-600 text-white p-3 rounded-2xl -mt-8 shadow-lg shadow-blue-600/30"><Plus size={24} strokeWidth={3} /></div><span className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">추가</span></button>
        <button onClick={() => setActiveTab('logs')} className={`flex flex-col items-center gap-1 ${activeTab === 'logs' ? 'text-blue-600' : 'text-slate-400'} active:scale-110 transition-transform`}><Navigation size={24} /><span className="text-[10px] font-bold uppercase tracking-tighter">일지</span></button>
      </nav>

      {/* --- 모달 등 --- */}
      {confirmState.show && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className={`${theme.card} rounded-3xl p-6 w-full max-w-sm shadow-2xl border`}>
            <AlertTriangle size={32} className="text-orange-500 mx-auto mb-4" />
            <p className={`${theme.textMain} text-center font-bold mb-6 leading-relaxed whitespace-pre-wrap`}>{confirmState.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmState({ show: false, message: '', onConfirm: null })} className={`${theme.inner} flex-1 py-4 rounded-xl font-bold ${theme.textSub} border`}>취소</button>
              <button onClick={confirmState.onConfirm} className="flex-1 py-4 bg-red-500 rounded-xl font-bold text-white shadow-lg active:scale-95">확인</button>
            </div>
          </div>
        </div>
      )}

      {showOdoModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`${theme.card} rounded-3xl p-6 w-full max-w-sm shadow-2xl border`}>
            <div className="flex justify-between items-center mb-4"><h3 className={`${theme.textMain} font-black`}>ODO 수동 교정</h3><button onClick={() => setShowOdoModal(false)} className={theme.textSub}><X size={20} /></button></div>
            <div className="space-y-4 mb-6">
              <div><label className="text-[10px] text-slate-400 block mb-1 font-bold uppercase">시작 ODO (km)</label><input type="number" value={tempStartOdo} onFocus={handleInputFocus} onChange={(e) => setTempStartOdo(e.target.value)} className={`${theme.input} w-full rounded-xl p-3 ${theme.textMain} font-mono text-[16px] outline-none border focus:ring-1 focus:ring-blue-500/20`} /></div>
              <div><label className="text-[10px] text-slate-400 block mb-1 font-bold uppercase">현재 ODO (km)</label><input type="number" value={tempCurrentOdo} onFocus={handleInputFocus} onChange={(e) => setTempCurrentOdo(e.target.value)} className={`${theme.input} w-full rounded-xl p-3 ${theme.textMain} font-mono text-[16px] outline-none border focus:ring-1 focus:ring-blue-500/20`} /></div>
            </div>
            <button onClick={handleSaveStartOdo} className="w-full bg-red-600 py-4 rounded-xl font-black text-white shadow-lg active:scale-95">적용하기</button>
          </div>
        </div>
      )}

      {showRouteModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`${theme.card} rounded-3xl p-6 w-full max-w-sm shadow-2xl border overflow-y-auto max-h-[90vh]`}>
            <div className="flex justify-between items-center mb-4"><h3 className={`${theme.textMain} font-black flex items-center gap-2 uppercase tracking-tight`}><Route size={18} className="text-indigo-500"/> 구간 기록</h3><button onClick={() => setShowRouteModal(false)} className={theme.textSub}><X size={20} /></button></div>
            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-2"><input type="text" value={newRoute.startLoc} onChange={(e) => setNewRoute({...newRoute, startLoc: e.target.value})} placeholder="출발지" className={`${theme.input} border rounded-xl p-3 ${theme.textMain} text-[16px] outline-none focus:ring-1 focus:ring-blue-500/20`} /><input type="text" value={newRoute.endLoc} onChange={(e) => setNewRoute({...newRoute, endLoc: e.target.value})} placeholder="도착지" className={`${theme.input} border rounded-xl p-3 ${theme.textMain} text-[16px] outline-none focus:ring-1 focus:ring-blue-500/20`} /></div>
              <div className="grid grid-cols-2 gap-2"><input type="time" value={newRoute.startTime} onChange={(e) => setNewRoute({...newRoute, startTime: e.target.value})} className={`${theme.input} border rounded-xl p-3 ${theme.textMain} text-[16px] outline-none`} /><input type="time" value={newRoute.endTime} onChange={(e) => setNewRoute({...newRoute, endTime: e.target.value})} className={`${theme.input} border rounded-xl p-3 ${theme.textMain} text-[16px] outline-none`} /></div>
              <div className="relative"><input type="number" value={newRoute.distance} onFocus={handleInputFocus} onChange={(e) => setNewRoute({...newRoute, distance: e.target.value})} placeholder="거리 (km)" className={`${theme.input} border w-full rounded-xl p-3 ${theme.textMain} font-mono text-[16px] outline-none focus:ring-1 focus:ring-blue-500/20`} /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">km</span></div>
            </div>
            <button onClick={handleAddRoute} className="w-full bg-indigo-600 py-4 rounded-xl font-black text-white shadow-lg active:scale-95">저장 (Sync)</button>
          </div>
        </div>
      )}

      {editingLog && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className={`${theme.card} rounded-3xl p-6 w-full max-w-sm border shadow-2xl`}>
            <div className="flex justify-between items-center mb-6"><h3 className={`${theme.textMain} font-black`}>기록 수정</h3><button onClick={() => setEditingLog(null)} className={theme.textSub}><X size={20} /></button></div>
            <div className="space-y-4">
              {editingLog.type === 'route' ? (
                <div className="space-y-3">
                  <input type="text" value={editingLog.startLoc} onChange={(e) => setEditingLog({...editingLog, startLoc: e.target.value})} className={`${theme.input} border w-full rounded-xl p-3 ${theme.textMain} text-[16px] outline-none focus:ring-1 focus:ring-blue-500/20`} />
                  <input type="text" value={editingLog.endLoc} onChange={(e) => setEditingLog({...editingLog, endLoc: e.target.value})} className={`${theme.input} border w-full rounded-xl p-3 ${theme.textMain} text-[16px] outline-none focus:ring-1 focus:ring-blue-500/20`} />
                  <input type="number" value={editingLog.distance} onFocus={handleInputFocus} onChange={(e) => setEditingLog({...editingLog, distance: e.target.value})} className={`${theme.input} border w-full rounded-xl p-3 ${theme.textMain} font-mono text-[16px] outline-none focus:ring-1 focus:ring-blue-500/20`} />
                </div>
              ) : (
                <div className="space-y-3">
                  <input type="text" value={editingLog.title} onChange={(e) => setEditingLog({...editingLog, title: e.target.value})} className={`${theme.input} border w-full rounded-xl p-3 ${theme.textMain} text-[16px] outline-none focus:ring-1 focus:ring-blue-500/20`} />
                  <div className="flex gap-2">
                    {['MYR', 'THB', 'LAK'].map(curr => (
                      <button key={curr} onClick={() => setEditingLog({...editingLog, currency: curr})} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${editingLog.currency === curr ? 'bg-slate-700 text-white shadow-sm' : 'bg-white border text-slate-400 hover:bg-slate-50'}`}>{curr}</button>
                    ))}
                  </div>
                  <input type="number" value={editingLog.costLocal} onFocus={handleInputFocus} onChange={(e) => setEditingLog({...editingLog, costLocal: e.target.value})} className={`${theme.input} border w-full rounded-xl p-3 ${theme.textMain} font-mono text-[16px] outline-none focus:ring-1 focus:ring-blue-500/20`} />
                </div>
              )}
              <button onClick={handleUpdateLog} className="w-full bg-emerald-600 py-4 rounded-xl font-black text-white shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform hover:bg-emerald-500"><Check size={18}/> 수정 완료</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;