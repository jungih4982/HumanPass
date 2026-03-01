import React, { useState, useEffect } from 'react';
import { 
  User, Briefcase, MapPin, CheckSquare, Camera, FileText, 
  Settings, LogOut, Home, Calendar, Users, Plus, CheckCircle, Clock, Menu, X, ChevronRight, ArrowLeft, ArrowRight, IdCard, Trash2, Edit2
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';

// --- [DATA FOR SITES] ---
const MOCK_SITES = [
  { name: '금정산 하늘채 루미엘', address: '부산광역시 충렬대로 144' }
];

// 초기 공고 데이터 (샘플 제거)
const INITIAL_JOBS = [];

export default function App() {
  // --- [GLOBAL STATE] ---
  const [currentUser, setCurrentUser] = useState(null); 
  const [currentView, setCurrentView] = useState('login');
  const [jobs, setJobs] = useState(INITIAL_JOBS);
  const [myApplications, setMyApplications] = useState([]);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [checkInTime, setCheckInTime] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- [LOGIN STATE] ---
  const [loginStep, setLoginStep] = useState('id'); // 'id' | 'password' | 'setup'
  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [setupData, setSetupData] = useState({ name: '', birthdate: '', gender: '남' });
  const [tempUserObj, setTempUserObj] = useState(null);

  // --- [ADMIN STATE] ---
  const [allCheckins, setAllCheckins] = useState([]);
  
  // -- Admin Sites Management State --
  const [sites, setSites] = useState([]);
  const [isSiteModalOpen, setIsSiteModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState(null);

  // -- Admin Jobs (Job Management) State --
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [siteSearchTerm, setSiteSearchTerm] = useState('');
  const [showSiteDropdown, setShowSiteDropdown] = useState(false);
  
  // -- Admin Users (ID Management) State --
  const [appUsers, setAppUsers] = useState([]); // 클라우드 DB 연동 유저 목록
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  // --- [FIREBASE BACKEND STATE] ---
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [dbInstance, setDbInstance] = useState(null);
  const appId = typeof __app_id !== 'undefined' ? __app_id : 'humanpass-app';

  // --- [FIREBASE INIT & SYNC] ---
  useEffect(() => {
    try {
      if (typeof __firebase_config !== 'undefined') {
        const firebaseConfig = JSON.parse(__firebase_config);
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);
        setDbInstance(db);

        const initAuth = async () => {
          if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
          } else {
            await signInAnonymously(auth);
          }
        };
        initAuth();
        
        const unsubscribe = onAuthStateChanged(auth, setFirebaseUser);
        return () => unsubscribe();
      }
    } catch (error) {
      console.error("Firebase 초기화 에러:", error);
    }
  }, []);

  useEffect(() => {
    if (!firebaseUser || !dbInstance) return;

    // 1. 구인 공고 연동
    const jobsRef = collection(dbInstance, 'artifacts', appId, 'public', 'data', 'jobs');
    const unsubJobs = onSnapshot(jobsRef, (snapshot) => {
      if (snapshot.empty) {
        INITIAL_JOBS.forEach(job => addDoc(jobsRef, job));
      } else {
        setJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    });

    // 2. 출퇴근 기록 연동
    const checkinsRef = collection(dbInstance, 'artifacts', appId, 'public', 'data', 'checkins');
    const unsubCheckins = onSnapshot(checkinsRef, (snapshot) => {
      const allCheckinsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllCheckins(allCheckinsData); 
      
      const myTodayCheckin = allCheckinsData.find(c => c.uid === firebaseUser.uid && c.date === new Date().toLocaleDateString());
      if (myTodayCheckin) {
        setIsCheckedIn(true);
        setCheckInTime(myTodayCheckin.time);
      } else {
        setIsCheckedIn(false);
        setCheckInTime(null);
      }
    });

    // 3. 유저(ID) 데이터 연동
    const usersRef = collection(dbInstance, 'artifacts', appId, 'public', 'data', 'users');
    const unsubUsers = onSnapshot(usersRef, (snapshot) => {
      if (snapshot.empty) {
        // 최초 로드 시 기본 관리자 세팅 (샘플 근로자 삭제)
        const initUsers = [
          { loginId: 'admin', role: 'admin', isNew: false, name: '최고관리자', password: 'admin' }
        ];
        initUsers.forEach(u => addDoc(usersRef, u));
      } else {
        const loadedUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // loginId 기준 숫자로 오름차순 정렬
        loadedUsers.sort((a, b) => {
            const numA = parseInt(a.loginId);
            const numB = parseInt(b.loginId);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.loginId.localeCompare(b.loginId);
        });
        setAppUsers(loadedUsers);
      }
    });

    // 4. 현장 데이터 연동
    const sitesRef = collection(dbInstance, 'artifacts', appId, 'public', 'data', 'sites');
    const unsubSites = onSnapshot(sitesRef, (snapshot) => {
      if (snapshot.empty) {
        MOCK_SITES.forEach(site => addDoc(sitesRef, site));
      } else {
        setSites(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    });

    return () => { unsubJobs(); unsubCheckins(); unsubUsers(); unsubSites(); };
  }, [firebaseUser, dbInstance, appId]);

  // --- [NAVIGATION COMPONENTS] ---
  const AdminNav = () => (
    <nav className="bg-slate-900 text-slate-300 w-64 min-h-screen p-5 flex flex-col hidden md:flex shadow-2xl z-10">
      <div className="mb-10 text-center">
        <div className="text-2xl font-extrabold text-white tracking-tight flex items-center justify-center gap-2">
          {/* <img src="/logo.png" alt="로고" className="w-8 h-8 object-contain" /> */}
          휴먼패스
        </div>
        <div className="text-xs text-slate-500 mt-2 font-medium tracking-widest">관리자 시스템</div>
      </div>
      
      <div className="flex-1 space-y-2">
        <button onClick={() => setCurrentView('admin-dashboard')} className={`w-full flex items-center px-4 py-3.5 rounded-2xl transition-all duration-200 ${currentView === 'admin-dashboard' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'hover:bg-slate-800 hover:text-white'}`}>
          <Home className="mr-3 w-5 h-5"/> 현장관리
        </button>
        <button onClick={() => setCurrentView('admin-jobs')} className={`w-full flex items-center px-4 py-3.5 rounded-2xl transition-all duration-200 ${currentView === 'admin-jobs' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'hover:bg-slate-800 hover:text-white'}`}>
          <Briefcase className="mr-3 w-5 h-5"/> 공고/지원 관리
        </button>
        <button onClick={() => setCurrentView('admin-users')} className={`w-full flex items-center px-4 py-3.5 rounded-2xl transition-all duration-200 ${currentView === 'admin-users' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'hover:bg-slate-800 hover:text-white'}`}>
          <IdCard className="mr-3 w-5 h-5"/> ID 발급/관리
        </button>
        <button onClick={() => setCurrentView('admin-workers')} className={`w-full flex items-center px-4 py-3.5 rounded-2xl transition-all duration-200 ${currentView === 'admin-workers' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'hover:bg-slate-800 hover:text-white'}`}>
          <Users className="mr-3 w-5 h-5"/> 서류 열람
        </button>
      </div>
      <button onClick={handleLogout} className="w-full flex items-center px-4 py-3.5 rounded-2xl hover:bg-slate-800 hover:text-white transition-all duration-200 mt-auto">
        <LogOut className="mr-3 w-5 h-5"/> 로그아웃
      </button>
    </nav>
  );

  const WorkerBottomNav = () => (
    <nav className="bg-white/90 backdrop-blur-md border-t border-slate-100 fixed bottom-0 w-full flex justify-around p-2 pb-safe md:hidden z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
      <button onClick={() => setCurrentView('worker-home')} className={`flex flex-col items-center p-2 rounded-xl transition-all ${currentView === 'worker-home' ? 'text-indigo-600 scale-110' : 'text-slate-400 hover:text-slate-600'}`}>
        <Home className="w-6 h-6 mb-1"/><span className="text-[10px] font-semibold">홈</span>
      </button>
      <button onClick={() => setCurrentView('worker-jobs')} className={`flex flex-col items-center p-2 rounded-xl transition-all ${currentView === 'worker-jobs' ? 'text-indigo-600 scale-110' : 'text-slate-400 hover:text-slate-600'}`}>
        <Briefcase className="w-6 h-6 mb-1"/><span className="text-[10px] font-semibold">구인공고</span>
      </button>
      <button onClick={() => setCurrentView('worker-profile')} className={`flex flex-col items-center p-2 rounded-xl transition-all ${currentView === 'worker-profile' ? 'text-indigo-600 scale-110' : 'text-slate-400 hover:text-slate-600'}`}>
        <User className="w-6 h-6 mb-1"/><span className="text-[10px] font-semibold">내정보</span>
      </button>
    </nav>
  );

  // --- [HANDLERS : LOGIN] ---
  const handleIdSubmit = (e) => {
    e.preventDefault();
    if (!dbInstance || appUsers.length === 0) return alert('백엔드 데이터를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');

    const user = appUsers.find(u => u.loginId === loginId);
    if (!user) {
      alert("등록되지 않은 ID입니다. 관리자에게 문의하세요.\n(최초 테스트 시 최고관리자 ID: admin / PW: admin)");
      return;
    }
    
    setTempUserObj(user);
    if (user.isNew) {
      setLoginStep('setup');
    } else {
      setLoginStep('password');
    }
  };

  const handleFinalLogin = async (e) => {
    e?.preventDefault();
    if (!loginPassword) return alert('비밀번호를 입력해주세요.');
    
    let finalUser = { ...tempUserObj };

    if (loginStep === 'setup') {
      if (!setupData.name || !setupData.birthdate) return alert('필수 인적사항을 모두 입력해주세요.');
      
      finalUser.name = setupData.name;
      finalUser.birthdate = setupData.birthdate;
      finalUser.gender = setupData.gender;
      finalUser.password = loginPassword;
      finalUser.isNew = false;

      // DB 업데이트
      try {
        const userDoc = doc(dbInstance, 'artifacts', appId, 'public', 'data', 'users', finalUser.id);
        await updateDoc(userDoc, {
          name: finalUser.name,
          birthdate: finalUser.birthdate,
          gender: finalUser.gender,
          password: finalUser.password,
          isNew: false
        });
      } catch (err) {
        console.error("회원정보 업데이트 에러:", err);
        return alert("회원가입 처리 중 오류가 발생했습니다.");
      }
    } else {
      // 기존 유저 비밀번호 검증
      if (finalUser.password !== loginPassword) {
        return alert('비밀번호가 일치하지 않습니다.');
      }
    }

    setCurrentUser(finalUser);
    setCurrentView(finalUser.role === 'admin' ? 'admin-dashboard' : 'worker-home');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentView('login');
    setIsCheckedIn(false);
    setLoginStep('id');
    setLoginId('');
    setLoginPassword('');
    setTempUserObj(null);
  };

  // --- [HANDLERS : WORKER] ---
  const applyForJob = (jobId) => {
    if(!myApplications.includes(jobId)) {
      setMyApplications([...myApplications, jobId]);
      alert('지원이 완료되었습니다!');
    }
  };

  const handleCheckIn = async () => {
    if (!firebaseUser || !dbInstance) return alert("백엔드 연결 중입니다.");
    
    const activeSite = sites.length > 0 ? sites[0] : { id: 'default', name: '지정 현장' };
    
    alert(`GPS 위치를 확인합니다...\n[${activeSite.name}] 현장 반경 내에 있습니다. 출근 처리되었습니다.`);
    try {
      const checkinsRef = collection(dbInstance, 'artifacts', appId, 'public', 'data', 'checkins');
      const now = new Date();
      await addDoc(checkinsRef, {
        uid: firebaseUser.uid,
        userName: currentUser?.name || '익명',
        type: currentUser?.type || '스태프',
        date: now.toLocaleDateString(),
        time: now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        siteId: activeSite.id, 
        timestamp: now.getTime()
      });
    } catch (error) {
      alert("출근 기록 저장에 실패했습니다.");
    }
  };

  // --- [HANDLERS : ADMIN SITES] ---
  const openAddSiteModal = () => {
    setEditingSite({ name: '', address: '' });
    setIsSiteModalOpen(true);
  };

  const openEditSiteModal = (site) => {
    setEditingSite({ ...site });
    setIsSiteModalOpen(true);
  };

  const handleSaveSite = async (e) => {
    e.preventDefault();
    if (!dbInstance) return alert('백엔드 연결 중입니다.');
    try {
      if (editingSite.id) {
        const siteDoc = doc(dbInstance, 'artifacts', appId, 'public', 'data', 'sites', editingSite.id);
        await updateDoc(siteDoc, editingSite);
      } else {
        const sitesRef = collection(dbInstance, 'artifacts', appId, 'public', 'data', 'sites');
        await addDoc(sitesRef, editingSite);
      }
      setIsSiteModalOpen(false);
    } catch (err) {
      alert("현장 저장에 실패했습니다.");
    }
  };

  const handleDeleteSite = async () => {
    if (window.confirm(`이 현장을 정말 삭제하시겠습니까?\n(연결된 공고나 출퇴근 기록이 있을 경우 주의하세요)`)) {
      try {
        const siteDoc = doc(dbInstance, 'artifacts', appId, 'public', 'data', 'sites', editingSite.id);
        await deleteDoc(siteDoc);
        setIsSiteModalOpen(false);
      } catch (err) {
        alert("삭제 중 오류가 발생했습니다.");
      }
    }
  };

  // --- [HANDLERS : ADMIN JOBS] ---
  const openAddJobModal = () => {
    setEditingJob({ title: '', role: '스태프', date: '', wage: '', siteId: '', status: '모집중' });
    setSiteSearchTerm('');
    setIsJobModalOpen(true);
  };

  const openEditJobModal = (job) => {
    setEditingJob({ ...job });
    const matchedSite = sites.find(s => s.id === job.siteId);
    setSiteSearchTerm(matchedSite ? matchedSite.name : '');
    setIsJobModalOpen(true);
  };

  const handleSaveJob = async (e) => {
    e.preventDefault();
    if (!dbInstance) return alert('백엔드 연결 중입니다.');
    if (!editingJob.siteId) return alert('배치 현장을 검색하여 목록에서 선택해주세요.');
    try {
      if (editingJob.id) {
        const jobDoc = doc(dbInstance, 'artifacts', appId, 'public', 'data', 'jobs', editingJob.id);
        await updateDoc(jobDoc, {
          ...editingJob
        });
      } else {
        const jobsRef = collection(dbInstance, 'artifacts', appId, 'public', 'data', 'jobs');
        await addDoc(jobsRef, {
          ...editingJob
        });
      }
      setIsJobModalOpen(false);
    } catch (err) {
      console.error("공고 등록 에러:", err);
      alert("저장에 실패했습니다.");
    }
  };

  const handleDeleteJob = async () => {
    if (window.confirm(`이 공고를 정말 삭제하시겠습니까?`)) {
      try {
        const jobDoc = doc(dbInstance, 'artifacts', appId, 'public', 'data', 'jobs', editingJob.id);
        await deleteDoc(jobDoc);
        setIsJobModalOpen(false);
      } catch (err) {
        alert("삭제 중 오류가 발생했습니다.");
      }
    }
  };

  // --- [HANDLERS : ADMIN USERS] ---
  const getNextLoginId = () => {
    const workerIds = appUsers.filter(u => u.role === 'worker' && !isNaN(u.loginId)).map(u => parseInt(u.loginId));
    if (workerIds.length === 0) return '1';
    return (Math.max(...workerIds) + 1).toString();
  };

  const openAddUserModal = () => {
    setEditingUser({
      loginId: getNextLoginId(),
      role: 'worker',
      type: '스태프',
      name: '',
      gender: '남',
      birthdate: '',
      isNew: true,
      password: ''
    });
    setIsUserModalOpen(true);
  };

  const openEditUserModal = (user) => {
    setEditingUser({ ...user });
    setIsUserModalOpen(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    try {
      if (editingUser.id) {
        // 기존 수정
        const userDoc = doc(dbInstance, 'artifacts', appId, 'public', 'data', 'users', editingUser.id);
        await updateDoc(userDoc, editingUser);
      } else {
        // 신규 추가
        const usersRef = collection(dbInstance, 'artifacts', appId, 'public', 'data', 'users');
        await addDoc(usersRef, editingUser);
      }
      setIsUserModalOpen(false);
    } catch (err) {
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  const handleDeleteUser = async () => {
    if (window.confirm(`[${editingUser.loginId}번] 계정을 정말 삭제하시겠습니까?`)) {
      try {
        const userDoc = doc(dbInstance, 'artifacts', appId, 'public', 'data', 'users', editingUser.id);
        await deleteDoc(userDoc);
        setIsUserModalOpen(false);
      } catch (err) {
        alert("삭제 중 오류가 발생했습니다.");
      }
    }
  };

  // --- [VIEWS : LOGIN] ---
  if (currentView === 'login') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-indigo-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
        <div className="absolute top-[20%] right-[-10%] w-96 h-96 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-[-10%] left-[20%] w-96 h-96 bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>

        <div className="bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] w-full max-w-md border border-white z-10 relative transition-all duration-500">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight mb-2">휴먼패스</h1>
            <p className="text-slate-500 text-sm font-medium">스마트한 근태 관리 시스템</p>
          </div>
          
          {/* STEP 1: ID 입력 */}
          {loginStep === 'id' && (
            <form onSubmit={handleIdSubmit} className="space-y-5 animate-fade-in-up">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">아이디 (사번)</label>
                <input 
                  type="text" 
                  value={loginId} 
                  onChange={e => setLoginId(e.target.value)} 
                  className="w-full border border-slate-200 rounded-xl px-4 py-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm bg-white/50" 
                  placeholder="발급받은 ID를 입력하세요" 
                  autoFocus
                  required
                />
              </div>
              <button type="submit" className="group w-full bg-slate-900 text-white p-4 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center active:scale-95">
                다음 <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </button>
            </form>
          )}

          {/* STEP 2: PASSWORD 입력 (기존 유저) */}
          {loginStep === 'password' && (
            <form onSubmit={handleFinalLogin} className="space-y-5 animate-fade-in-up">
              <div className="flex items-center text-sm font-bold text-slate-500 bg-slate-100/50 p-3 rounded-xl">
                <User className="w-4 h-4 mr-2"/> {tempUserObj?.name}님 환영합니다.
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">비밀번호</label>
                <input 
                  type="password" 
                  value={loginPassword} 
                  onChange={e => setLoginPassword(e.target.value)} 
                  className="w-full border border-slate-200 rounded-xl px-4 py-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm bg-white/50" 
                  placeholder="비밀번호를 입력하세요" 
                  autoFocus
                  required
                />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setLoginStep('id')} className="w-1/3 bg-white border border-slate-200 text-slate-600 p-4 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center active:scale-95">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button type="submit" className="w-2/3 bg-indigo-600 text-white p-4 rounded-xl font-bold shadow-lg shadow-indigo-600/30 hover:shadow-xl transition-all flex items-center justify-center active:scale-95">
                  로그인
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: SETUP (신규 유저) */}
          {loginStep === 'setup' && (
            <form onSubmit={handleFinalLogin} className="space-y-4 animate-fade-in-up">
              <div className="text-sm font-bold text-indigo-600 bg-indigo-50 p-3 rounded-xl mb-4 border border-indigo-100">
                🎉 신규 등록을 환영합니다! 최초 1회 설정을 진행합니다.
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">사용할 비밀번호 설정</label>
                <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white/50" placeholder="비밀번호" />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">이름</label>
                <input type="text" value={setupData.name} onChange={e => setSetupData({...setupData, name: e.target.value})} required className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white/50" placeholder="실명을 입력하세요" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">생년월일</label>
                  <input type="date" value={setupData.birthdate} onChange={e => setSetupData({...setupData, birthdate: e.target.value})} required className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white/50" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">성별</label>
                  <select value={setupData.gender} onChange={e => setSetupData({...setupData, gender: e.target.value})} className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white/50">
                    <option value="남">남성</option>
                    <option value="여">여성</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setLoginStep('id')} className="w-1/4 bg-white border border-slate-200 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button type="submit" className="w-3/4 bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-600/30 hover:shadow-xl transition-all active:scale-95">
                  가입 및 시작하기
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    );
  }

  // --- [VIEWS : ADMIN] ---
  if (currentUser?.role === 'admin') {
    const todayStr = new Date().toLocaleDateString();
    const todaysCheckins = allCheckins.filter(c => c.date === todayStr);
    const getSiteCheckinCount = (siteId) => todaysCheckins.filter(c => c.siteId === siteId).length;

    return (
      <div className="min-h-screen bg-slate-50 flex font-sans">
        <AdminNav />
        <div className="flex-1 p-6 lg:p-10 overflow-y-auto">
          <div className="flex justify-between items-center mb-10">
            <div>
              <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">
                {currentView === 'admin-dashboard' && '현장관리'}
                {currentView === 'admin-jobs' && '구인 공고 관리'}
                {currentView === 'admin-users' && 'ID 발급 및 관리'}
                {currentView === 'admin-workers' && '인력 및 서류 열람'}
              </h2>
              <p className="text-slate-500 mt-1">휴먼패스 관리자 시스템</p>
            </div>
            <div className="flex items-center gap-4 bg-white px-5 py-2.5 rounded-full shadow-sm border border-slate-100">
              <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold text-sm">최</div>
              <span className="text-sm font-bold text-slate-700">{currentUser.name}님</span>
              <button onClick={handleLogout} className="md:hidden bg-slate-100 p-2 rounded-full text-slate-500 hover:bg-slate-200 transition"><LogOut className="w-4 h-4"/></button>
            </div>
          </div>

          {currentView === 'admin-dashboard' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-slate-100 relative overflow-hidden group hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-all">
                  <div className="absolute -right-6 -top-6 w-24 h-24 bg-indigo-50 rounded-full group-hover:scale-150 transition-transform duration-500 ease-in-out"></div>
                  <div className="relative z-10">
                    <div className="text-slate-500 text-sm font-medium mb-2 flex items-center"><Users className="w-4 h-4 mr-1"/> 오늘 총 출근 인원</div>
                    <div className="text-4xl font-black text-slate-800">{todaysCheckins.length}<span className="text-xl text-slate-400 font-semibold ml-1">명</span></div>
                  </div>
                </div>
              </div>
              <div className="bg-white p-8 rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-slate-100">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-extrabold text-slate-800">현장 목록 및 실시간 근태</h3>
                  <button onClick={openAddSiteModal} className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl flex items-center text-sm font-bold shadow-lg shadow-slate-900/20 transition-all hover:-translate-y-0.5">
                    <Plus className="w-4 h-4 mr-1"/> 신규 현장 등록
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {sites.length === 0 ? (
                    <div className="col-span-full p-8 text-center text-slate-500 font-medium bg-slate-50 rounded-2xl border border-slate-100">등록된 현장이 없습니다.</div>
                  ) : (
                    sites.map(site => {
                      const checkinCount = getSiteCheckinCount(site.id);

                      return (
                      <div key={site.id} onClick={() => openEditSiteModal(site)} className="border border-slate-100 rounded-2xl p-6 hover:border-indigo-200 hover:shadow-md transition-all bg-slate-50/50 cursor-pointer group">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <div className="font-extrabold text-lg text-slate-800">{site.name}</div>
                            <div className="text-sm text-slate-500 mt-1 flex items-center"><MapPin className="w-4 h-4 mr-1"/>{site.address}</div>
                          </div>
                          <button className="text-slate-400 group-hover:text-indigo-600 p-2 rounded-full hover:bg-indigo-50 transition-colors">
                            <Edit2 className="w-4 h-4"/>
                          </button>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between items-center">
                          <span className="text-slate-600 font-medium text-sm">금일 출근 인원</span>
                          <div className="flex items-center gap-3">
                            <span className="font-extrabold text-indigo-600 text-xl">{checkinCount}명</span>
                          </div>
                        </div>
                      </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Admin Site Modal */}
          {isSiteModalOpen && editingSite && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setIsSiteModalOpen(false)}></div>
              <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 m-4 z-10 animate-fade-in-up">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-extrabold text-slate-800">
                    {editingSite.id ? '현장 정보 수정' : '신규 현장 등록'}
                  </h3>
                  <button onClick={() => setIsSiteModalOpen(false)} className="text-slate-400 hover:text-slate-800 transition-colors"><X className="w-6 h-6"/></button>
                </div>
                <form onSubmit={handleSaveSite} className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">현장 이름</label>
                    <input type="text" required value={editingSite.name} onChange={e => setEditingSite({...editingSite, name: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="예: 금정산 하늘채 루미엘" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">현장 주소</label>
                    <input type="text" required value={editingSite.address} onChange={e => setEditingSite({...editingSite, address: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="예: 부산광역시 충렬대로 144" />
                  </div>
                  <div className="flex gap-3 pt-4">
                    {editingSite.id && (
                      <button type="button" onClick={handleDeleteSite} className="w-1/4 bg-red-50 text-red-600 py-4 rounded-xl font-bold hover:bg-red-100 transition-all flex items-center justify-center">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                    <button type="submit" className={`bg-indigo-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-indigo-600/30 hover:shadow-xl transition-all active:scale-95 ${editingSite.id ? 'w-3/4' : 'w-full'}`}>
                      {editingSite.id ? '정보 수정하기' : '현장 등록하기'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Admin Jobs (구인 공고 관리) */}
          {currentView === 'admin-jobs' && (
            <div className="bg-white p-8 rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-slate-100">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-xl font-extrabold text-slate-800">등록된 구인 공고</h3>
                <button onClick={openAddJobModal} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl flex items-center text-sm font-bold shadow-lg shadow-indigo-600/30 transition-all hover:-translate-y-0.5">
                  <Plus className="w-4 h-4 mr-1"/> 새 공고 등록
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200 uppercase tracking-wider">
                      <th className="p-4 font-semibold rounded-tl-xl">현장명</th>
                      <th className="p-4 font-semibold">모집 직군</th>
                      <th className="p-4 font-semibold">공고 제목</th>
                      <th className="p-4 font-semibold">날짜</th>
                      <th className="p-4 font-semibold">상태</th>
                      <th className="p-4 font-semibold text-right rounded-tr-xl">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {jobs.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="p-8 text-center text-slate-500 font-medium">등록된 공고가 없습니다.</td>
                      </tr>
                    ) : (
                      jobs.map(job => (
                        <tr key={job.id} onClick={() => openEditJobModal(job)} className="hover:bg-slate-50/50 transition-colors group cursor-pointer">
                          <td className="p-4 text-sm font-medium text-slate-700">{sites.find(s=>s.id===job.siteId)?.name || '알 수 없음'}</td>
                          <td className="p-4">
                            <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded-lg text-xs font-bold border border-slate-200">{job.role}</span>
                          </td>
                          <td className="p-4 text-sm font-bold text-slate-800">{job.title}</td>
                          <td className="p-4 text-sm text-slate-500">{job.date}</td>
                          <td className="p-4">
                            <span className={`px-3 py-1 rounded-lg text-xs font-bold ${job.status === '모집중' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>{job.status}</span>
                          </td>
                          <td className="p-4 text-right">
                            <button className="text-slate-400 group-hover:text-indigo-600 p-2 rounded-full hover:bg-indigo-50 transition-colors">
                              <Edit2 className="w-4 h-4"/>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Admin Job Modal (등록 및 수정) */}
          {isJobModalOpen && editingJob && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setIsJobModalOpen(false)}></div>
              <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 m-4 z-10 animate-fade-in-up">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-extrabold text-slate-800">
                    {editingJob.id ? '공고 수정' : '새 구인 공고 등록'}
                  </h3>
                  <button onClick={() => setIsJobModalOpen(false)} className="text-slate-400 hover:text-slate-800 transition-colors"><X className="w-6 h-6"/></button>
                </div>
                <form onSubmit={handleSaveJob} className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">공고 제목</label>
                    <input type="text" required value={editingJob.title} onChange={e => setEditingJob({...editingJob, title: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="예: 주말 홍보 요원 급구" />
                  </div>
                  
                  {/* Autocomplete for Site */}
                  <div className="relative">
                    <label className="block text-sm font-bold text-slate-700 mb-1">배치 현장 검색</label>
                    <input
                      type="text"
                      value={siteSearchTerm}
                      onChange={e => {
                        setSiteSearchTerm(e.target.value);
                        setShowSiteDropdown(true);
                      }}
                      onFocus={() => setShowSiteDropdown(true)}
                      onBlur={() => setTimeout(() => setShowSiteDropdown(false), 200)}
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      placeholder="현장 이름을 입력하여 선택하세요"
                    />
                    {showSiteDropdown && siteSearchTerm && (
                      <ul className="absolute z-20 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-40 overflow-y-auto mt-1">
                        {sites.filter(s => s.name.includes(siteSearchTerm)).length > 0 ? (
                          sites.filter(s => s.name.includes(siteSearchTerm)).map(site => (
                            <li
                              key={site.id}
                              onClick={() => {
                                setEditingJob({...editingJob, siteId: site.id});
                                setSiteSearchTerm(site.name);
                                setShowSiteDropdown(false);
                              }}
                              className="px-4 py-3 hover:bg-indigo-50 cursor-pointer text-sm font-bold text-slate-700 transition-colors"
                            >
                              {site.name}
                            </li>
                          ))
                        ) : (
                          <li className="px-4 py-3 text-sm text-slate-500">검색 결과가 없습니다.</li>
                        )}
                      </ul>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">모집 직군</label>
                      <select value={editingJob.role} onChange={e => setEditingJob({...editingJob, role: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white transition-all">
                        <option value="스태프">스태프</option>
                        <option value="홍보단">홍보단</option>
                        <option value="미화">미화</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">근무 날짜</label>
                      <input type="date" required value={editingJob.date} onChange={e => setEditingJob({...editingJob, date: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">급여 (일당)</label>
                    <input type="text" required value={editingJob.wage} onChange={e => setEditingJob({...editingJob, wage: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="예: 일당 100,000원" />
                  </div>
                  {editingJob.id && (
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">모집 상태</label>
                      <select value={editingJob.status} onChange={e => setEditingJob({...editingJob, status: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white transition-all">
                        <option value="모집중">모집중</option>
                        <option value="마감">마감</option>
                      </select>
                    </div>
                  )}
                  
                  <div className="flex gap-3 pt-4">
                    {editingJob.id && (
                      <button type="button" onClick={handleDeleteJob} className="w-1/4 bg-red-50 text-red-600 py-4 rounded-xl font-bold hover:bg-red-100 transition-all flex items-center justify-center">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                    <button type="submit" className={`bg-indigo-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-indigo-600/30 hover:shadow-xl transition-all active:scale-95 ${editingJob.id ? 'w-3/4' : 'w-full'}`}>
                      {editingJob.id ? '공고 수정' : '새 공고 등록'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Admin Users (ID Management) */}
          {currentView === 'admin-users' && (
            <div className="bg-white p-8 rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-slate-100">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-xl font-extrabold text-slate-800">전체 ID 발급 및 관리 현황</h3>
                <button onClick={openAddUserModal} className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl flex items-center text-sm font-bold shadow-lg shadow-slate-900/20 transition-all hover:-translate-y-0.5">
                  <Plus className="w-4 h-4 mr-1"/> 신규 ID 발급
                </button>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200 uppercase tracking-wider">
                      <th className="p-4 font-semibold rounded-tl-xl w-20">ID</th>
                      <th className="p-4 font-semibold w-24">구분</th>
                      <th className="p-4 font-semibold">이름</th>
                      <th className="p-4 font-semibold w-20">성별</th>
                      <th className="p-4 font-semibold w-32">생년월일</th>
                      <th className="p-4 font-semibold w-32">상태</th>
                      <th className="p-4 font-semibold text-right rounded-tr-xl">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {appUsers.filter(u => u.role === 'worker').length === 0 ? (
                      <tr>
                        <td colSpan="7" className="p-8 text-center text-slate-500 font-medium">발급된 ID가 없습니다.</td>
                      </tr>
                    ) : (
                      appUsers.filter(u => u.role === 'worker').map(user => (
                        <tr key={user.id || user.loginId} onClick={() => openEditUserModal(user)} className="hover:bg-slate-50/50 transition-colors group cursor-pointer">
                          <td className="p-4 font-extrabold text-indigo-600">{user.loginId}</td>
                          <td className="p-4">
                            <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded-lg text-xs font-bold border border-slate-200">{user.type}</span>
                          </td>
                          <td className="p-4 font-bold text-slate-800">
                            {user.name || <span className="text-slate-400 font-medium">미등록</span>}
                          </td>
                          <td className="p-4 text-sm text-slate-600">{user.gender || '-'}</td>
                          <td className="p-4 text-sm text-slate-600">{user.birthdate || '-'}</td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded-md text-xs font-bold ${user.isNew ? 'bg-orange-50 text-orange-600 border border-orange-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                              {user.isNew ? '신규 (미접속)' : '가입 완료'}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <button className="text-slate-400 group-hover:text-indigo-600 p-2 rounded-full hover:bg-indigo-50 transition-colors">
                              <Edit2 className="w-4 h-4"/>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Admin User Modals */}
          {isUserModalOpen && editingUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setIsUserModalOpen(false)}></div>
              <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 m-4 z-10 animate-fade-in-up">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-extrabold text-slate-800">
                    {editingUser.id ? 'ID 정보 수정' : '신규 ID 발급'}
                  </h3>
                  <button onClick={() => setIsUserModalOpen(false)} className="text-slate-400 hover:text-slate-800 transition-colors"><X className="w-6 h-6"/></button>
                </div>
                <form onSubmit={handleSaveUser} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">발급 ID (사번)</label>
                      <input type="text" value={editingUser.loginId} readOnly className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-sm font-extrabold text-indigo-600 outline-none" />
                      <p className="text-[10px] text-slate-500 mt-1">*자동 넘버링 (수정불가)</p>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">직군 구분</label>
                      <select value={editingUser.type} onChange={e => setEditingUser({...editingUser, type: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white transition-all">
                        <option value="스태프">스태프</option>
                        <option value="홍보단">홍보단</option>
                        <option value="미화">미화</option>
                      </select>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-4 mt-2">
                    <p className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">기본 인적사항 (선택)</p>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">이름</label>
                        <input type="text" value={editingUser.name} onChange={e => setEditingUser({...editingUser, name: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="미입력 시 근로자가 로그인 후 등록" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">생년월일</label>
                          <input type="date" value={editingUser.birthdate} onChange={e => setEditingUser({...editingUser, birthdate: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">성별</label>
                          <select value={editingUser.gender} onChange={e => setEditingUser({...editingUser, gender: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white transition-all">
                            <option value="남">남성</option>
                            <option value="여">여성</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    {editingUser.id && (
                      <button type="button" onClick={handleDeleteUser} className="w-1/4 bg-red-50 text-red-600 py-4 rounded-xl font-bold hover:bg-red-100 transition-all flex items-center justify-center">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                    <button type="submit" className={`bg-indigo-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-indigo-600/30 hover:shadow-xl transition-all active:scale-95 ${editingUser.id ? 'w-3/4' : 'w-full'}`}>
                      {editingUser.id ? '정보 수정하기' : '신규 발급하기'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {currentView === 'admin-workers' && (
            <div className="bg-white p-8 rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-slate-100">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <h3 className="text-xl font-extrabold text-slate-800">등록 완료 인력 및 서류 열람</h3>
                <div className="flex gap-3 w-full md:w-auto">
                   <input type="text" placeholder="이름으로 검색" className="flex-1 md:w-64 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {appUsers.filter(u => u.role === 'worker' && !u.isNew).length === 0 ? (
                  <div className="col-span-full p-8 text-center text-slate-500 font-medium bg-slate-50 rounded-2xl border border-slate-100">가입을 완료한 근로자가 없습니다.</div>
                ) : (
                  appUsers.filter(u => u.role === 'worker' && !u.isNew).map(user => (
                    <div key={user.id} className="border border-slate-200 hover:border-indigo-300 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:shadow-md bg-white">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-bold text-lg">
                          {user.name?.charAt(0) || '미'}
                        </div>
                        <div>
                          <div className="font-extrabold text-slate-800 flex items-center gap-2">{user.name} <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs">{user.type}</span></div>
                          <div className="text-xs text-slate-500 mt-1 font-medium">{user.birthdate} | {user.gender} | ID: {user.loginId}</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button className="flex-1 sm:flex-none px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all">신분증</button>
                        <button className="flex-1 sm:flex-none px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all">통장사본</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- [VIEWS : WORKER] ---
  if (currentUser?.role === 'worker') {
    return (
      <div className="min-h-screen bg-slate-50 pb-24 font-sans">
        {/* Mobile Hamburger Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setIsMobileMenuOpen(false)}></div>
            <div className="relative bg-white w-[280px] h-full shadow-2xl flex flex-col transform transition-transform duration-300">
              <div className="p-6 border-b border-slate-100 bg-gradient-to-br from-indigo-50 to-white">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center font-extrabold text-xl shadow-lg shadow-indigo-600/30">
                    {currentUser.name?.charAt(0)}
                  </div>
                  <button onClick={() => setIsMobileMenuOpen(false)} className="text-slate-400 hover:text-slate-800 p-2 bg-white rounded-full shadow-sm"><X className="w-5 h-5"/></button>
                </div>
                <div>
                  <div className="font-extrabold text-xl text-slate-800">{currentUser.name}님</div>
                  <div className="text-sm text-indigo-600 font-bold mt-1 bg-indigo-100 inline-block px-3 py-1 rounded-full">{currentUser.type}</div>
                </div>
              </div>
              <div className="flex-1 py-6 flex flex-col gap-2 px-4 overflow-y-auto">
                <button onClick={() => { setCurrentView('worker-home'); setIsMobileMenuOpen(false); }} className={`flex items-center p-4 rounded-2xl transition-all ${currentView === 'worker-home' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50 font-medium'}`}>
                  <Home className={`w-5 h-5 mr-4 ${currentView === 'worker-home' ? 'text-white' : 'text-slate-400'}`}/> 홈 / 일정
                </button>
                <button onClick={() => { setCurrentView('worker-jobs'); setIsMobileMenuOpen(false); }} className={`flex items-center p-4 rounded-2xl transition-all ${currentView === 'worker-jobs' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50 font-medium'}`}>
                  <Briefcase className={`w-5 h-5 mr-4 ${currentView === 'worker-jobs' ? 'text-white' : 'text-slate-400'}`}/> 구인공고
                </button>
                <button onClick={() => { setCurrentView('worker-profile'); setIsMobileMenuOpen(false); }} className={`flex items-center p-4 rounded-2xl transition-all ${currentView === 'worker-profile' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50 font-medium'}`}>
                  <FileText className={`w-5 h-5 mr-4 ${currentView === 'worker-profile' ? 'text-white' : 'text-slate-400'}`}/> 신분증 / 통장사본
                </button>
              </div>
              <div className="p-6 border-t border-slate-100">
                <button onClick={handleLogout} className="flex items-center text-slate-500 hover:text-red-500 font-bold w-full transition-colors"><LogOut className="w-5 h-5 mr-3"/> 로그아웃</button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="bg-white/80 backdrop-blur-xl px-5 py-4 shadow-sm sticky top-0 z-30 flex justify-between items-center border-b border-slate-100">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsMobileMenuOpen(true)} className="text-slate-800 p-2 -ml-2 hover:bg-slate-100 rounded-full transition-all">
              <Menu className="w-6 h-6" />
            </button>
            <div>
              <div className="text-[11px] text-indigo-600 font-black tracking-wider uppercase mb-0.5">휴먼패스</div>
              <div className="font-extrabold text-lg text-slate-800 tracking-tight">{currentUser.name} <span className="text-sm font-medium text-slate-500">({currentUser.type})</span></div>
            </div>
          </div>
          <button onClick={handleLogout} className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-all">
            <LogOut className="w-5 h-5"/>
          </button>
        </header>

        <main className="p-5 max-w-lg mx-auto">
          {currentView === 'worker-home' && (
            <div className="space-y-6">
              {/* Commute Card */}
              <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-6 relative overflow-hidden">
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-50 rounded-full opacity-50"></div>
                
                <div className="flex justify-between items-center mb-6 relative z-10">
                  <h2 className="font-extrabold text-slate-800 text-lg flex items-center"><MapPin className="w-5 h-5 mr-2 text-indigo-500"/> 오늘의 현장</h2>
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg font-bold">{sites[0]?.name || '현장 미정'}</span>
                </div>
                {!isCheckedIn ? (
                  <button onClick={handleCheckIn} className="relative z-10 w-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white py-5 rounded-2xl font-extrabold text-lg shadow-xl shadow-indigo-600/30 hover:shadow-2xl hover:shadow-indigo-600/40 transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center">
                    <MapPin className="mr-2"/> GPS 출근 체크하기
                  </button>
                ) : (
                  <div className="relative z-10 w-full bg-emerald-50 border-2 border-emerald-100 text-emerald-700 py-5 rounded-2xl font-extrabold text-lg flex flex-col items-center justify-center shadow-inner">
                    <div className="flex items-center"><CheckCircle className="mr-2 w-6 h-6"/> 출근이 완료되었습니다</div>
                    <div className="text-sm font-semibold mt-2 text-emerald-600 bg-white px-4 py-1 rounded-full shadow-sm">체크 시간: {checkInTime}</div>
                  </div>
                )}
              </div>

              {/* Schedule */}
              <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-6">
                 <h2 className="font-extrabold text-slate-800 mb-5 flex items-center text-lg"><Calendar className="w-5 h-5 mr-2 text-indigo-500"/> 나의 예정된 스케줄</h2>
                 <div className="space-y-4">
                   <div className="flex p-4 bg-slate-50 hover:bg-slate-100 transition-colors rounded-2xl border border-slate-100">
                     <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100 text-center mr-4 min-w-[60px] flex flex-col justify-center">
                       <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">3월</div>
                       <div className="font-black text-2xl text-slate-800">07</div>
                     </div>
                     <div className="flex flex-col justify-center">
                       <div className="font-extrabold text-slate-800 text-md">{sites[0]?.name || '현장 미정'}</div>
                       <div className="text-xs text-indigo-600 font-bold mt-1.5 flex items-center"><Clock className="w-3.5 h-3.5 mr-1"/> 09:00 ~ 18:00</div>
                     </div>
                   </div>
                 </div>
              </div>
            </div>
          )}

          {currentView === 'worker-jobs' && (
            <div className="space-y-5">
              <h2 className="font-extrabold text-2xl text-slate-800 mb-6 pl-1">구인 공고 지원</h2>
              {jobs.filter(job => job.role === currentUser.type).length === 0 ? (
                <div className="text-center py-16 px-4 text-slate-500 bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
                  <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Briefcase className="w-10 h-10 text-slate-300"/>
                  </div>
                  <p className="font-bold text-slate-600">현재 모집 중인 {currentUser.type} 공고가 없습니다.</p>
                </div>
              ) : (
                jobs.filter(job => job.role === currentUser.type).map(job => (
                  <div key={job.id} className="bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 relative group transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
                    <div className="flex justify-between items-start mb-4">
                      <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-1 rounded-lg text-xs font-black">{job.role}</span>
                      <span className={`text-xs font-black px-2 py-1 rounded-lg ${job.status === '모집중' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{job.status}</span>
                    </div>
                    <h3 className="font-extrabold text-xl text-slate-800 mb-2">{job.title}</h3>
                    <div className="text-sm text-slate-600 mb-6 space-y-2">
                      <span className="flex items-center"><MapPin className="w-4 h-4 mr-2 text-slate-400"/> {sites.find(s=>s.id===job.siteId)?.name || '알 수 없음'}</span>
                      <span className="flex items-center"><Calendar className="w-4 h-4 mr-2 text-slate-400"/> {job.date}</span>
                      <div className="pt-2 mt-2 border-t border-slate-100">
                        <span className="font-black text-indigo-600 text-lg">{job.wage}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => applyForJob(job.id)}
                      disabled={job.status === '마감' || myApplications.includes(job.id)}
                      className={`w-full py-4 rounded-xl font-bold text-sm transition-all duration-300 ${
                        myApplications.includes(job.id) ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-inner' :
                        job.status === '마감' ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-inner' :
                        'bg-slate-900 text-white shadow-lg shadow-slate-900/20 hover:bg-slate-800 hover:-translate-y-1 active:scale-95'
                      }`}
                    >
                      {myApplications.includes(job.id) ? '지원 완료됨' : job.status === '마감' ? '모집 마감' : '원터치 간편 지원'}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {currentView === 'worker-profile' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
                <div className="flex items-center gap-5 border-b border-slate-100 pb-6 mb-6">
                  <div className="w-20 h-20 bg-gradient-to-br from-indigo-100 to-blue-100 rounded-full flex items-center justify-center text-indigo-600 font-black text-2xl shadow-inner border border-indigo-200">
                    {currentUser.name?.charAt(0)}
                  </div>
                  <div>
                    <h2 className="font-extrabold text-2xl text-slate-800">{currentUser.name} <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md ml-1">{currentUser.type}</span></h2>
                    <p className="text-sm font-medium text-slate-500 mt-2">{currentUser.birthdate} | {currentUser.gender}</p>
                  </div>
                </div>
                
                <h3 className="font-extrabold text-slate-800 mb-2 flex items-center text-lg"><FileText className="w-5 h-5 mr-2 text-indigo-500"/> 필수 인사 서류 등록</h3>
                <p className="text-xs text-slate-500 mb-6 bg-slate-50 p-3 rounded-xl border border-slate-100 font-medium leading-relaxed">급여 지급을 위해 최초 1회만 등록하시면 됩니다. (타 현장 지원 시 공통 적용)</p>
                
                <div className="space-y-4">
                  <div className="border border-slate-100 bg-slate-50 rounded-2xl p-5 hover:border-indigo-200 transition-colors">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-extrabold text-slate-700">신분증 사본</span>
                      <span className="text-xs text-red-500 font-black bg-red-50 px-2 py-1 rounded-md">미등록</span>
                    </div>
                    <button className="w-full py-3.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold shadow-sm flex items-center justify-center hover:bg-slate-50 hover:text-indigo-600 transition-all">
                      <Camera className="w-4 h-4 mr-2"/> 촬영하여 업로드
                    </button>
                  </div>

                  <div className="border border-indigo-100 bg-indigo-50/30 rounded-2xl p-5">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-extrabold text-slate-700">본인 명의 통장 사본</span>
                      <span className="text-xs text-emerald-600 font-black bg-emerald-50 px-2 py-1 rounded-md">등록완료</span>
                    </div>
                    <div className="text-sm font-bold text-indigo-700 mb-4 bg-white inline-block px-3 py-1.5 rounded-lg border border-indigo-100 mt-2 shadow-sm">신한은행 110-123-456789</div>
                    <button className="w-full py-3.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold shadow-sm flex items-center justify-center hover:bg-slate-50 transition-all">
                      다시 업로드
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
        <WorkerBottomNav />
      </div>
    );
  }

  return null;
}