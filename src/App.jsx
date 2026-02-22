import { useState, useEffect, useCallback, useRef } from 'react';
import Papa from "papaparse";
import { db } from './firebase'; 
import { ref, onValue, update, set, onDisconnect, get, runTransaction } from "firebase/database";
import { STUDENTS, TOTAL_ROOMS } from './students'; 

// --- 音效處理 ---
const playSound = (type) => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    if (type === 'correct') {
      osc.frequency.setValueAtTime(523, now); osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(0.3, now); osc.start(now); osc.stop(now + 0.5);
    } else if (type === 'wrong') {
      osc.frequency.setValueAtTime(220, now); gain.gain.setValueAtTime(0.2, now);
      osc.start(now); osc.stop(now + 0.4);
    }
  } catch (e) {}
};

// --- 圖片與文字處理 ---
const renderContent = (text) => {
    if (!text) return null;
    const str = String(text);
    if (str.includes('[IMG]')) {
        const [textContent, imgName] = str.split('[IMG]');
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                {textContent && <span>{textContent}</span>}
                {imgName && <img src={`/imgs/${imgName.trim()}`} alt="圖片" style={{ maxWidth: '100%', maxHeight: '180px', borderRadius: '10px', objectFit: 'contain' }} />}
            </div>
        );
    }
    return str;
};

// ==========================================
// 🌟 留言板元件 (具備自動重連機制) 🌟
// ==========================================
function ChatBoard({ currentUser }) {
  const [msgs, setMsgs] = useState([]);
  const [msgCount, setMsgCount] = useState(0);
  const [input, setInput] = useState("");
  const [serverStatus, setServerStatus] = useState("loading"); // loading, online, offline
  const API_BASE = "https://quiz-api-backend-hn0s.onrender.com/api";

  const refreshData = async () => {
    try {
      // 嘗試獲取留言數量作為心跳檢測，設定 5 秒超時
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const resCount = await fetch(`${API_BASE}/message_count`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (resCount.ok) {
        const countData = await resCount.json();
        setMsgCount(countData.count);
        
        const resMsg = await fetch(`${API_BASE}/messages`);
        if (resMsg.ok) {
          setMsgs(await resMsg.json());
          setServerStatus("online");
        }
      } else {
        setServerStatus("offline");
      }
    } catch (e) { 
        setServerStatus("offline");
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 10000); // 每 10 秒自動檢查一次
    return () => clearInterval(interval);
  }, []);

  const handlePost = async () => {
    if (!input.trim() || serverStatus === "offline") return;
    try {
      const res = await fetch(`${API_BASE}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: currentUser, content: input })
      });
      if (res.ok) {
        setInput("");
        refreshData();
      }
    } catch (e) { 
        alert("留言發送失敗，伺服器可能正在啟動中，請稍候。"); 
    }
  };

  return (
    <div style={{ marginTop: '30px', backgroundColor: '#1a1a1a', padding: '20px', borderRadius: '15px', border: '1px solid #333' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3 style={{ color: '#fbbf24', margin: 0, textAlign: 'left' }}>
          💬 學生討論區 
          {serverStatus === "offline" && <span style={{ fontSize: '0.8rem', color: '#ef4444', marginLeft: '10px' }}>(伺服器啟動中...)</span>}
        </h3>
        <span style={{ backgroundColor: '#333', padding: '4px 10px', borderRadius: '10px', fontSize: '0.8rem', color: '#9ca3af' }}>
          目前共有 {msgCount} 則留言
        </span>
      </div>
      
      <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
        <input 
          value={input} 
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handlePost()}
          placeholder={serverStatus === "offline" ? "等待伺服器喚醒..." : "輸入留言內容..."}
          disabled={serverStatus === "offline"}
          style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: '#222', color: '#fff', fontSize: '1rem', opacity: serverStatus === "offline" ? 0.5 : 1 }}
        />
        <button 
          onClick={handlePost} 
          disabled={serverStatus === "offline"}
          style={{ padding: '0 20px', backgroundColor: serverStatus === "offline" ? '#444' : '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight:'bold' }}
        >送出</button>
      </div>

      <div style={{ maxHeight: '250px', overflowY: 'auto', textAlign: 'left', paddingRight: '5px' }}>
        {serverStatus === "loading" ? <p style={{color: '#555'}}>正在連線...</p> : 
         (serverStatus === "offline" && msgs.length === 0) ? <p style={{color: '#888'}}>討論區伺服器正在從休眠中醒來，請稍候約 30 秒...</p> :
         msgs.length === 0 ? <p style={{color: '#555'}}>目前尚無留言...</p> : msgs.map(m => (
          <div key={m.id} style={{ padding: '10px 0', borderBottom: '1px solid #333' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ color: '#60a5fa', fontWeight: 'bold', fontSize: '0.9rem' }}>{m.nickname}</span>
              <span style={{ color: '#555', fontSize: '0.7rem' }}>{m.time}</span>
            </div>
            <div style={{ color: '#eee', fontSize: '1rem', lineHeight: '1.4' }}>{m.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 🌟 遊戲主程式 (App) 🌟
// ==========================================
function App() {
  const MAX_QUESTIONS = 10; 
  const bgmRef = useRef(null);

  const [user, setUser] = useState(null); 
  const [loginId, setLoginId] = useState(""); 
  const [password, setPassword] = useState(""); 
  const [userData, setUserData] = useState(null); 
  const [roomsStatus, setRoomsStatus] = useState({}); 
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [roomId, setRoomId] = useState(null); 
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState(null); 
  const [currentIdx, setCurrentIdx] = useState(0);
  const [scores, setScores] = useState({ p1: 0, p2: 0 });
  const [names, setNames] = useState({ p1: "P1", p2: "P2" }); 
  const [playerIds, setPlayerIds] = useState({ p1: null, p2: null }); 
  const [streaks, setStreaks] = useState({ p1: 0, p2: 0 });
  const [selections, setSelections] = useState({ p1: null, p2: null });
  const [timeLeft, setTimeLeft] = useState(30);
  const [showResult, setShowResult] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [shuffledOptions, setShuffledOptions] = useState([]);
  const [p2Joined, setP2Joined] = useState(false);

  // 🛡️ 防止遊戲中途跳出
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (roomId && myRole !== 'viewer' && !gameOver) {
        e.preventDefault();
        e.returnValue = '遊戲尚未結束，離開將判定為斷線！';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [roomId, myRole, gameOver]);

  useEffect(() => {
    bgmRef.current = new Audio('/bgm.mp3'); 
    bgmRef.current.loop = true;
    bgmRef.current.volume = 0.4;
  }, []);

  const startBGM = () => { 
      if (bgmRef.current) {
          bgmRef.current.currentTime = 0; 
          bgmRef.current.play().catch(e => console.log("等待互動")); 
      }
  };

  useEffect(() => {
    Papa.parse("/data.csv", {
      download: true, header: true, skipEmptyLines: true, encoding: "UTF-8",
      complete: (results) => {
        const formatted = results.data.map(item => ({
          category: item.category || "一般", question: item.question,
          originalOptions: [item.option1, item.option2, item.option3, item.option4],
          correctText: [item.option1, item.option2, item.option3, item.option4][parseInt(item.correct) - 1]
        })).filter(q => q.question && q.correctText);
        if (formatted.length > 0) { setQuestions(formatted); setLoading(false); }
      }
    });
  }, []);

  useEffect(() => {
      if (user) {
          const userRef = ref(db, `users/${user.id}`);
          const unsubscribe = onValue(userRef, (snap) => {
              if (snap.exists()) setUserData(snap.val());
          });
          return () => unsubscribe();
      }
  }, [user]);

  useEffect(() => {
    if (user && !roomId) {
      const allRoomsRef = ref(db, 'rooms');
      const unsubscribe = onValue(allRoomsRef, (snapshot) => { setRoomsStatus(snapshot.val() || {}); });
      return () => unsubscribe();
    }
  }, [user, roomId]);

  useEffect(() => {
    if (!roomId || !myRole || questions.length === 0) return;
    const roomRef = ref(db, `rooms/${roomId}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setCurrentIdx(data.currentIdx || 0); setScores(data.scores || { p1: 0, p2: 0 });
        setNames(data.names || { p1: "P1", p2: "P2" }); setPlayerIds(data.playerIds || { p1: null, p2: null }); 
        setStreaks(data.streaks || { p1: 0, p2: 0 }); setGameOver(data.gameOver || false);
        const safeSelections = data.selections || {};
        setSelections({ p1: safeSelections.p1 || null, p2: safeSelections.p2 || null });
        setTimeLeft(data.timeLeft ?? 30); setShowResult(data.showResult || false); setP2Joined(data.p2Present || false);
        const q = questions[data.currentIdx || 0];
        if (q) {
          const opts = q.originalOptions.map(text => ({ text, isCorrect: text === q.correctText }));
          setShuffledOptions(opts);
        }
      }
    });
    return () => unsubscribe();
  }, [roomId, myRole, questions]); 

  useEffect(() => {
    if (gameOver && myRole === 'p1' && roomId && playerIds.p1 && playerIds.p2) {
        const roomRef = ref(db, `rooms/${roomId}`);
        get(roomRef).then((snap) => {
            if (snap.exists() && !snap.val().statsSaved) {
                update(roomRef, { statsSaved: true });
                const p1Win = scores.p1 > scores.p2 ? 1 : 0; 
                const p2Win = scores.p2 > scores.p1 ? 1 : 0;
                const p1EnergyChange = scores.p1 > scores.p2 ? 2 : (scores.p1 < scores.p2 ? -1 : 0);
                const p2EnergyChange = scores.p2 > scores.p1 ? 2 : (scores.p2 < scores.p1 ? -1 : 0);
                runTransaction(ref(db, `users/${playerIds.p1}`), (d) => { 
                    if(!d) d={name:names.p1, totalWins:0, totalScore:0, energy:10}; 
                    d.totalWins=(d.totalWins||0)+p1Win; d.totalScore=(d.totalScore||0)+scores.p1; 
                    d.energy = Math.max(0, (d.energy !== undefined ? d.energy : 10) + p1EnergyChange);
                    return d; 
                });
                runTransaction(ref(db, `users/${playerIds.p2}`), (d) => { 
                    if(!d) d={name:names.p2, totalWins:0, totalScore:0, energy:10}; 
                    d.totalWins=(d.totalWins||0)+p2Win; d.totalScore=(d.totalScore||0)+scores.p2; 
                    d.energy = Math.max(0, (d.energy !== undefined ? d.energy : 10) + p2EnergyChange);
                    return d; 
                });
            }
        });
    }
  }, [gameOver, myRole, roomId, playerIds, scores, names]);

  const fetchLeaderboard = () => {
    get(ref(db, 'users')).then((snapshot) => {
        if (snapshot.exists()) {
            const list = Object.keys(snapshot.val()).map(key => ({ id: key, ...snapshot.val()[key] }));
            list.sort((a, b) => b.totalWins !== a.totalWins ? b.totalWins - a.totalWins : b.totalScore - a.totalScore);
            setLeaderboardData(list); setShowLeaderboard(true);
        } else { setLeaderboardData([]); setShowLeaderboard(true); }
    });
  };

  const handleReveal = useCallback(() => {
    if (showResult || gameOver || !roomId || myRole === 'viewer') return;
    const roomRef = ref(db, `rooms/${roomId}`);
    let newScores = { ...scores }; let newStreaks = { ...streaks };
    
    if (myRole === 'p1') {
        const currentQ = questions[currentIdx];
        if (currentQ) {
            const safeKey = currentQ.question.replace(/[.#$\[\]]/g, "_");
            runTransaction(ref(db, `questionStats/${safeKey}`), (data) => {
                if (!data) data = { question: currentQ.question, category: currentQ.category, wrongCount: 0, totalCount: 0 };
                if (selections?.p1) { data.totalCount++; if (!shuffledOptions[selections.p1.idx].isCorrect) data.wrongCount++; }
                if (selections?.p2) { data.totalCount++; if (!shuffledOptions[selections.p2.idx].isCorrect) data.wrongCount++; }
                return data;
            });
        }
    }

    if (selections?.p1 && shuffledOptions[selections.p1.idx]?.isCorrect) {
      newStreaks.p1 += 1; newScores.p1 += (selections.p1.time * 10 + (newStreaks.p1 >= 6 ? 100 : (newStreaks.p1 >= 3 ? 50 : 0)));
      if (myRole === 'p1') playSound('correct');
    } else { newStreaks.p1 = 0; }
    if (selections?.p2 && shuffledOptions[selections.p2.idx]?.isCorrect) {
      newStreaks.p2 += 1; newScores.p2 += (selections.p2.time * 10 + (newStreaks.p2 >= 6 ? 100 : (newStreaks.p2 >= 3 ? 50 : 0)));
      if (myRole === 'p2') playSound('correct');
    } else { newStreaks.p2 = 0; }

    update(roomRef, { showResult: true, scores: newScores, streaks: newStreaks });
    setTimeout(() => {
      const nextIdx = currentIdx + 1;
      if (nextIdx >= MAX_QUESTIONS) update(roomRef, { gameOver: true }); 
      else update(roomRef, { currentIdx: nextIdx, scores: newScores, streaks: newStreaks, selections: { p1: null, p2: null }, timeLeft: 30, showResult: false, gameOver: false });
    }, 3000);
  }, [roomId, currentIdx, scores, streaks, selections, shuffledOptions, showResult, gameOver, myRole, questions]);

  useEffect(() => {
    if (myRole !== 'p1' || showResult || gameOver || !roomId || !p2Joined) return;
    const timer = setInterval(() => {
      if (timeLeft > 0) update(ref(db, `rooms/${roomId}`), { timeLeft: timeLeft - 1 });
      else handleReveal();
    }, 1000);
    return () => clearInterval(timer);
  }, [myRole, timeLeft, showResult, gameOver, roomId, p2Joined, handleReveal]);

  useEffect(() => {
    if (myRole === 'p1' && !showResult && !gameOver && p2Joined && roomId) {
      if (selections?.p1 && selections?.p2) handleReveal();
    }
  }, [selections, myRole, showResult, gameOver, p2Joined, roomId, handleReveal]);

  const onSelect = (idx) => {
    if (myRole === 'viewer' || showResult || gameOver || !roomId || (selections && selections[myRole])) return;
    if (shuffledOptions[idx]?.isCorrect) playSound('correct'); else playSound('wrong');
    set(ref(db, `rooms/${roomId}/selections/${myRole}`), { idx: idx, time: timeLeft });
  };

  const handleLogin = () => {
    const student = STUDENTS.find(s => s.id === loginId && s.password === password);
    if (student) { 
      const today = new Date().toDateString(); 
      const userRef = ref(db, `users/${student.id}`);
      get(userRef).then((snapshot) => {
          if (snapshot.exists()) {
              const data = snapshot.val();
              if (data.lastLoginDate !== today) {
                  const currentEnergy = data.energy !== undefined ? data.energy : 0;
                  const newEnergy = Math.max(10, currentEnergy);
                  update(userRef, { energy: newEnergy, lastLoginDate: today });
              }
          } else {
              set(userRef, { name: student.name, totalWins: 0, totalScore: 0, energy: 10, lastLoginDate: today });
          }
          setUser(student); 
      });
    } else { alert("登入失敗！"); }
  };
// --- 真正的返回大廳邏輯 ---
  const handleReturnToLobby = () => {
    // 離開時清理 Firebase 上的狀態，改用 update 避免覆蓋整個房間資料
    if (roomId) {
        if (myRole === 'p1') {
            update(ref(db, `rooms/${roomId}`), { p1Present: false });
        } else if (myRole === 'p2') {
            update(ref(db, `rooms/${roomId}`), { p2Present: false });
        }
    }

    // 關閉背景音樂
    if (bgmRef.current) {
        bgmRef.current.pause();
        bgmRef.current.currentTime = 0;
    }

    // 重置本地狀態
    setRoomId(null);
    setMyRole(null);
    setGameOver(false);
    setCurrentIdx(0);
    setShowResult(false);
    setP2Joined(false);
    setScores({ p1: 0, p2: 0 });
    setStreaks({ p1: 0, p2: 0 });
    setSelections({ p1: null, p2: null });
  };
  const handleJoinRoom = (selectedRoomId) => {
    if (user.id === "teacher") {
        setMyRole('viewer'); setRoomId(selectedRoomId); startBGM(); return;
    }
    const currentEnergy = userData?.energy !== undefined ? userData.energy : 10;
    if (currentEnergy <= 0) { alert("能量耗盡囉！💔"); return; }
    const roomRef = ref(db, `rooms/${selectedRoomId}`);
    get(roomRef).then((snapshot) => {
      const data = snapshot.val() || {};
      if (!data.p1Present) {
        setMyRole('p1'); setRoomId(selectedRoomId); startBGM();
        set(roomRef, { p1Present: true, names: { p1: user.name, p2: "等待中..." }, playerIds: { p1: user.id, p2: null }, currentIdx: 0, scores: { p1: 0, p2: 0 }, streaks: { p1: 0, p2: 0 }, selections: { p1: null, p2: null }, timeLeft: 30, showResult: false, gameOver: false, statsSaved: false });
        onDisconnect(ref(db, `rooms/${selectedRoomId}/p1Present`)).remove(); onDisconnect(ref(db, `rooms/${selectedRoomId}/names/p1`)).set("斷線");
      } 
      else if (!data.p2Present) {
        setMyRole('p2'); setRoomId(selectedRoomId); startBGM();
        update(roomRef, { p2Present: true, "names/p2": user.name, "playerIds/p2": user.id, timeLeft: 30 });
        onDisconnect(ref(db, `rooms/${selectedRoomId}/p2Present`)).remove(); onDisconnect(ref(db, `rooms/${selectedRoomId}/names/p2`)).set("斷線");
      } 
      else { alert("房間已滿！"); }
    });
  };

  if (!user) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', color: '#fff' }}>
        <h1 style={{fontSize: '2.5rem', marginBottom: '20px'}}>班級知識對抗賽 🎓</h1>
        <input type="text" placeholder="學號" value={loginId} onChange={(e) => setLoginId(e.target.value)} style={{ padding: '15px', fontSize: '1.2rem', borderRadius: '10px', textAlign: 'center', marginBottom: '15px', width:'250px' }} />
        <input type="password" placeholder="密碼" value={password} onChange={(e) => setPassword(e.target.value)} style={{ padding: '15px', fontSize: '1.2rem', borderRadius: '10px', textAlign: 'center', marginBottom: '30px', width:'250px' }} />
        <button onClick={handleLogin} style={{ padding: '15px 40px', fontSize: '1.2rem', borderRadius: '10px', backgroundColor: '#3b82f6', color: '#fff', border:'none', cursor: 'pointer', fontWeight:'bold' }}>進入賽場</button>
      </div>
    );
  }

  if (showLeaderboard) {
    return (
        <div style={{ minHeight: '100vh', padding: '20px', backgroundColor: '#111', color: '#fff' }}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'30px'}}>
                <h2>🏆 榮譽榜</h2>
                <button onClick={() => setShowLeaderboard(false)} style={{padding:'10px 20px', background:'#444', color:'white', border:'none', borderRadius:'5px'}}>返回大廳</button>
            </div>
            <div style={{maxWidth:'700px', margin:'0 auto'}}>
                <table style={{width:'100%', borderCollapse:'collapse', textAlign:'center'}}>
                    <thead>
                        <tr style={{borderBottom:'2px solid #555', color:'#fbbf24'}}>
                            <th style={{padding:'15px'}}>名次</th><th>姓名</th><th>勝場</th><th>總分</th><th>能量</th>
                        </tr>
                    </thead>
                    <tbody>
                        {leaderboardData.map((s, idx) => (
                            <tr key={s.id} style={{borderBottom:'1px solid #333', backgroundColor: idx < 3 ? 'rgba(251, 191, 36, 0.1)' : 'transparent'}}>
                                <td style={{padding:'15px'}}>{idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : idx + 1))}</td>
                                <td>{s.name}</td><td>{s.totalWins || 0}</td><td>{s.totalScore || 0}</td>
                                <td style={{color:'#ec4899'}}>❤️ {s.energy !== undefined ? s.energy : 10}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
  }

  if (!roomId) {
    const currentEnergy = userData?.energy !== undefined ? userData.energy : 10;
    return (
      <div style={{ minHeight: '100vh', padding: '20px', backgroundColor: '#111', color: '#fff' }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'30px'}}>
            <h2>👋 {user.name}{user.id === 'teacher' ? '老師' : '同學'} 
                {user.id !== 'teacher' && <span style={{fontSize:'1rem', color:'#ec4899', marginLeft:'15px'}}>❤️ {currentEnergy}</span>}
            </h2>
            <div>
                <button onClick={fetchLeaderboard} style={{padding:'10px 20px', marginRight:'10px', background:'#f59e0b', color:'white', borderRadius:'5px', fontWeight:'bold', border:'none', cursor:'pointer'}}>🏆 排行榜</button>
                <button onClick={() => window.location.reload()} style={{padding:'10px', background:'#333', color:'white', borderRadius:'5px', border:'none', cursor:'pointer'}}>登出</button>
            </div>
        </div>
        <div className="rooms-grid">
          {Array.from({ length: TOTAL_ROOMS }, (_, i) => i + 1).map(num => {
            const rId = String(num); const rData = roomsStatus[rId] || {};
            const isFull = rData.p1Present && rData.p2Present;
            const isEmpty = !rData.p1Present;
            const canJoin = user.id === 'teacher' || !isFull;
            return (
              <button key={num} onClick={() => handleJoinRoom(rId)} disabled={!canJoin} className={`room-btn ${isFull ? 'full' : (isEmpty ? 'empty' : 'waiting')}`}>
                <div style={{fontSize:'1.5rem', fontWeight:'bold'}}>Room {num}</div>
                <div style={{fontSize:'0.9rem'}}>{isFull ? (user.id === 'teacher' ? '👁️ 巡堂' : '已滿') : (isEmpty ? '空房' : '等待中')}</div>
              </button>
            );
          })}
        </div>

        <ChatBoard currentUser={user.name} />

        <style>{`
            .rooms-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px; }
            .room-btn { padding: 20px; border: none; border-radius: 12px; color: white; cursor: pointer; }
            .room-btn.empty { background-color: #22c55e; }
            .room-btn.waiting { background-color: #eab308; }
            .room-btn.full { background-color: #ef4444; }
        `}</style>
      </div>
    );
  }

  if (loading) return <div style={{color:'white', padding:'20px', backgroundColor:'#000', height:'100vh'}}>⏳ 載入中...</div>;

  const currentQ = questions[currentIdx];
  const mySelIdx = selections && selections[myRole] ? selections[myRole].idx : null;

  const getBtnStyle = (idx) => {
    let bgColor = '#222';
    let borderColor = '#444'; // 新增邊框顏色變數，預設為暗灰

    if (showResult) {
        // 開獎後：顯示正確答案(綠)與雙方選擇(紅)，並亮白框
        bgColor = shuffledOptions[idx]?.isCorrect ? '#22c55e' : (mySelIdx === idx || selections?.p1?.idx === idx || selections?.p2?.idx === idx ? '#ef4444' : '#333');
        borderColor = (selections?.p1?.idx === idx || selections?.p2?.idx === idx) ? '#fff' : '#444';
    } else {
        // 還沒開獎時
        if (myRole === 'viewer') {
            // 老師視角：可以看見雙方選擇
            if (selections?.p1?.idx === idx) bgColor = '#1e40af';
            if (selections?.p2?.idx === idx) bgColor = '#991b1b';
            borderColor = (selections?.p1?.idx === idx || selections?.p2?.idx === idx) ? '#fff' : '#444';
        } else {
            // 🔒 玩家視角：絕對防作弊，背景與邊框都只能看到「自己」選的
            bgColor = mySelIdx === idx ? '#3b82f6' : '#222';
            borderColor = mySelIdx === idx ? '#fff' : '#444'; 
        }
    }
    // 統一返回樣式
    return { backgroundColor: bgColor, border: `3px solid ${borderColor}` };
  };

if (gameOver) {
    let resultTitle = "";
    let subMessage = "";
    let titleColor = "#fbbf24"; // 平手預設黃色

    // 1. 判斷誰是贏家
    let winnerRole = "tie";
    if (scores.p1 > scores.p2) winnerRole = "p1";
    if (scores.p2 > scores.p1) winnerRole = "p2";

    // 2. 根據「當前看螢幕的人 (myRole)」給專屬訊息
    if (winnerRole === "tie") {
      resultTitle = "🤝 雙方勢均力敵，平手！ 🤝";
      subMessage = "兩位同學都非常優秀！";
    } else if (winnerRole === myRole) {
      // 自己贏了
      resultTitle = `🎉 恭喜你獲勝！ 🎉`;
      subMessage = "太厲害了，繼續保持！";
      titleColor = myRole === 'p1' ? "#60a5fa" : "#f87171"; 
    } else if (myRole === 'p1' || myRole === 'p2') {
      // 自己輸了
      resultTitle = `😢 挑戰失敗... 😢`;
      subMessage = `不要灰心，再接再厲下次一定贏！ 💪`;
      titleColor = "#9ca3af"; // 低調灰色
    } else {
      // 老師/旁觀者視角
      const winnerName = winnerRole === 'p1' ? names.p1 : names.p2;
      resultTitle = `🎉 恭喜 ${winnerName} 獲勝！ 🎉`;
      subMessage = "一場精彩的對決！";
      titleColor = winnerRole === 'p1' ? "#60a5fa" : "#f87171";
    }

    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', color: '#fff', textAlign: 'center' }}>
        <h1 style={{fontSize: '3rem', color: titleColor, marginBottom: '10px'}}>
            {resultTitle}
        </h1>
        <p style={{fontSize: '1.5rem', color: '#9ca3af', marginBottom: '30px'}}>
            {subMessage}
        </p>
        <div style={{display:'flex', gap:'50px', margin:'20px 0', fontSize:'2.5rem', fontWeight: 'bold'}}>
            <div style={{color: '#60a5fa'}}>{names.p1}<br/><span style={{fontSize:'4rem'}}>{scores.p1}</span></div>
            <div style={{alignSelf:'center', fontSize:'1.5rem', color:'#555'}}>VS</div>
            <div style={{color: '#f87171'}}>{names.p2}<br/><span style={{fontSize:'4rem'}}>{scores.p2}</span></div>
        </div>
        <button onClick={handleReturnToLobby} style={{marginTop: '40px', padding:'15px 40px', fontSize:'1.2rem', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius:'10px', cursor:'pointer', fontWeight:'bold', transition: '0.2s'}}>
          返回大廳
        </button>
      </div>
    );
  }

  return (
    <div className="game-container">
      <div className="header">
        <div className={`player-info p1 ${selections?.p1 ? 'done' : ''}`}>🔵 {names.p1}<br/>{selections?.p1 ? '已作答' : '思考中'}</div>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="timer">{!p2Joined ? '等待中' : `${timeLeft}s`}</div>
            {/* 🌟 新增：遊戲進行中的緊急退出按鈕 */}
            <button onClick={handleReturnToLobby} style={{ marginTop: '5px', padding: '2px 8px', fontSize: '0.8rem', background: '#444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                離開
            </button>
        </div>

        <div className={`player-info p2 ${selections?.p2 ? 'done' : ''}`}>🔴 {names.p2}<br/>{selections?.p2 ? '已作答' : '思考中'}</div>
      </div>
      
      <div className="main-area">
  {!p2Joined ? (
        // 👇 這裡是你原本的等待畫面，我幫它加上了排版和退出按鈕
        <div className="waiting-screen" style={{ flexDirection: 'column', gap: '20px' }}>
            <div>⏳ 等待對手加入...</div>
            <button 
                onClick={handleReturnToLobby} 
                style={{ padding: '10px 20px', fontSize: '1.2rem', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                🚪 退出房間
            </button>
        </div>
      ) : (
        // 👇 這裡完全保留你原本的程式碼，一字不漏！
        <>
            <div className="question-box">
                <div style={{ color: '#9ca3af', fontSize:'0.9rem' }}>Room {roomId} | Q{currentIdx + 1}/{MAX_QUESTIONS}</div>
                <div className="question-text">{renderContent(currentQ?.question)}</div>
            </div>
            <div className="options-grid">
                {shuffledOptions.map((opt, idx) => (
                    <button key={idx} onClick={() => onSelect(idx)} style={getBtnStyle(idx)} className="option-btn">
                        {renderContent(opt.text)}
                        {myRole === 'viewer' && (
                            <div style={{fontSize:'0.75rem', marginTop:'5px', display:'flex', justifyContent:'center', gap:'5px'}}>
                                {selections?.p1?.idx === idx && <span>🔵 P1選</span>}
                                {selections?.p2?.idx === idx && <span>🔴 P2選</span>}
                            </div>
                        )}
                    </button>
                ))}
            </div>
        </>
      )}
      </div>

      <div className="footer-scores">
        <div className="score-p1">{scores.p1}{streaks.p1 >= 3 && <span className="combo">🔥{streaks.p1}</span>}</div>
        <div className="score-p2">{scores.p2}{streaks.p2 >= 3 && <span className="combo">🔥{streaks.p2}</span>}</div>
      </div>

      <style>{`
        .game-container { height: 100vh; width: 100vw; background: #000; color: white; display: flex; flex-direction: column; overflow: hidden; }
        .header { height: 12%; display: flex; justify-content: space-between; align-items: center; padding: 0 20px; border-bottom: 2px solid #333; }
        .timer { font-size: 2rem; font-weight: bold; }
        .player-info { font-size: 0.8rem; transition: opacity 0.3s; }
        .player-info.done { opacity: 1; font-weight: bold; }
        .main-area { flex: 1; display: flex; flex-direction: column; padding: 15px; overflow-y: auto; }
        .question-box { background: #111; padding: 15px; border-radius: 15px; text-align: center; margin-bottom: 15px; border: 1px solid #333; }
        .question-text { font-size: 1.4rem; font-weight: bold; margin-top: 5px; }
        .options-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; flex: 1; }
        @media (max-width: 768px) { .options-grid { grid-template-columns: 1fr; } }
        .option-btn { padding: 15px; font-size: 1.2rem; font-weight: bold; border-radius: 12px; color: white; cursor: pointer; transition: 0.2s; min-height: 70px; display: flex; flex-direction: column; justify-content: center; align-items: center; }
        .footer-scores { height: 15%; display: flex; border-top: 2px solid #333; }
        .score-p1, .score-p2 { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 3rem; font-weight: 900; position: relative; }
        .score-p1 { background: #0a192f; color: #60a5fa; }
        .score-p2 { background: #2d0a0a; color: #f87171; }
        .combo { position: absolute; top: 5px; font-size: 1rem; color: #fbbf24; }
        .waiting-screen { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; color: #fbbf24; }
      `}</style>
    </div>
  );
}

export default App;