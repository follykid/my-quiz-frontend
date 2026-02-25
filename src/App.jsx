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
// 🌟 留言板元件 
// ==========================================
function ChatBoard({ currentUser }) {
  const [msgs, setMsgs] = useState([]);
  const [msgCount, setMsgCount] = useState(0);
  const [input, setInput] = useState("");
  const [serverStatus, setServerStatus] = useState("loading"); 
  const API_BASE = "https://quiz-api-backend-hn0s.onrender.com/api";

  const refreshData = async () => {
    try {
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
    const interval = setInterval(refreshData, 10000); 
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
// 🌟 遊戲主程式 (App)
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
  
  // 老師專屬的統計狀態
  const [showStats, setShowStats] = useState(false);
  const [statsData, setStatsData] = useState([]);

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
  const [questionOrder, setQuestionOrder] = useState([]); 
  
  // 🌟 新增：記錄是誰中途逃跑（'p1' 或 'p2'）
  const [forfeitedBy, setForfeitedBy] = useState(null);

  // 防呆：處理手機關閉網頁或重整
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (roomId && myRole !== 'viewer' && !gameOver) {
        e.preventDefault();
        e.returnValue = '遊戲尚未結束，離開將判定為斷線！';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }, [roomId, myRole, gameOver]);

  // 🌟 修改：防呆與自動踢除機制 (改為觸發對手投降)
  useEffect(() => {
    if (!roomId || myRole === 'viewer' || gameOver || !p2Joined) return;
    const oppRole = myRole === 'p1' ? 'p2Present' : 'p1Present';
    let disconnectTimer = null;

    const unsub = onValue(ref(db, `rooms/${roomId}/${oppRole}`), (snap) => {
        if (snap.val() === false) {
            disconnectTimer = setTimeout(() => {
                // 對手離線超過 4 秒，判定對手逃跑！
                const leaverRole = myRole === 'p1' ? 'p2' : 'p1';
                update(ref(db, `rooms/${roomId}`), { gameOver: true, forfeitedBy: leaverRole });
            }, 4000);
        } else {
            if (disconnectTimer) clearTimeout(disconnectTimer);
        }
    });

    return () => {
        unsub();
        if (disconnectTimer) clearTimeout(disconnectTimer);
    };
  // eslint-disable-next-line
  }, [roomId, myRole, p2Joined, gameOver]);

  // 背景音樂
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

  // 載入題庫
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

  // 選項隨機打亂
  useEffect(() => {
    const q = questionOrder.length > 0 ? questions[questionOrder[currentIdx]] : questions[currentIdx];
    if (q) {
        const opts = q.originalOptions.map(text => ({ text, isCorrect: text === q.correctText }));
        setShuffledOptions(opts.sort(() => Math.random() - 0.5));
    }
  }, [currentIdx, questions, questionOrder]);

  useEffect(() => {
      if (user) {
          const unsub = onValue(ref(db, `users/${user.id}`), (snap) => {
              if (snap.exists()) setUserData(snap.val());
          });
          return () => unsub();
      }
  }, [user]);

  useEffect(() => {
    if (user && !roomId) {
      const unsub = onValue(ref(db, 'rooms'), (snapshot) => { setRoomsStatus(snapshot.val() || {}); });
      return () => unsub();
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
        setQuestionOrder(data.questionOrder || []); 
        setForfeitedBy(data.forfeitedBy || null); // 🌟 新增：讀取是否有人逃跑
      }
    });
    return () => unsubscribe();
  }, [roomId, myRole, questions]); 

  // 🌟 修改：結算分數 (加入逃跑扣 5 點能量機制的計算)
  useEffect(() => {
    if (gameOver && roomId && playerIds.p1 && playerIds.p2) {
        const isForfeit = !!forfeitedBy;
        // 如果有人逃跑，就由「沒逃跑」的那方負責結算成績；如果是正常結束，由 p1 負責
        const isMyResponsibility = isForfeit ? (myRole !== forfeitedBy) : (myRole === 'p1');

        if (isMyResponsibility) {
            const roomRef = ref(db, `rooms/${roomId}`);
            get(roomRef).then((snap) => {
                if (snap.exists() && !snap.val().statsSaved) {
                    update(roomRef, { statsSaved: true });
                    
                    let p1Win = 0, p2Win = 0, p1EnergyChange = 0, p2EnergyChange = 0;
                    
                    if (isForfeit) {
                        // 逃跑結算：逃跑者扣 5，勝利者得 2
                        if (forfeitedBy === 'p1') {
                            p2Win = 1; p1EnergyChange = -5; p2EnergyChange = 2; 
                        } else {
                            p1Win = 1; p2EnergyChange = -5; p1EnergyChange = 2; 
                        }
                    } else {
                        // 正常結算
                        p1Win = scores.p1 > scores.p2 ? 1 : 0; 
                        p2Win = scores.p2 > scores.p1 ? 1 : 0;
                        p1EnergyChange = scores.p1 > scores.p2 ? 2 : (scores.p1 < scores.p2 ? -1 : 0);
                        p2EnergyChange = scores.p2 > scores.p1 ? 2 : (scores.p2 < scores.p1 ? -1 : 0);
                    }

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
    }
  }, [gameOver, myRole, roomId, playerIds, scores, names, forfeitedBy]);

  // 讀取排行榜
  const fetchLeaderboard = () => {
    get(ref(db, 'users')).then((snapshot) => {
        if (snapshot.exists()) {
            const list = Object.keys(snapshot.val()).map(key => ({ id: key, ...snapshot.val()[key] }));
            list.sort((a, b) => b.totalWins !== a.totalWins ? b.totalWins - a.totalWins : b.totalScore - a.totalScore);
            setLeaderboardData(list); setShowLeaderboard(true);
        } else { setLeaderboardData([]); setShowLeaderboard(true); }
    });
  };

  // 讀取題目統計資料 (老師專用)
  const fetchStats = () => {
    get(ref(db, 'questionStats')).then((snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const list = Object.keys(data).map(key => data[key]);
            list.sort((a, b) => {
                const rateA = a.totalCount > 0 ? (a.wrongCount / a.totalCount) : 0;
                const rateB = b.totalCount > 0 ? (b.wrongCount / b.totalCount) : 0;
                return rateB - rateA || b.totalCount - a.totalCount;
            });
            setStatsData(list); setShowStats(true);
        } else {
            alert("目前還沒有任何學生的作答紀錄喔！");
        }
    });
  };

  const handleReveal = useCallback(() => {
    if (showResult || gameOver || !roomId || myRole === 'viewer') return;
    const roomRef = ref(db, `rooms/${roomId}`);
    let newScores = { ...scores }; let newStreaks = { ...streaks };
    
    if (myRole === 'p1') {
        const currentQ = questionOrder.length > 0 ? questions[questionOrder[currentIdx]] : questions[currentIdx];
        if (currentQ) {
            const safeKey = currentQ.question.replace(/[.#$\[\]]/g, "_");
            runTransaction(ref(db, `questionStats/${safeKey}`), (data) => {
                if (!data) data = { question: currentQ.question, category: currentQ.category, wrongCount: 0, totalCount: 0 };
                if (selections?.p1) { data.totalCount++; if (!selections.p1.isCorrect) data.wrongCount++; }
                if (selections?.p2) { data.totalCount++; if (!selections.p2.isCorrect) data.wrongCount++; }
                return data;
            });
        }
    }

    if (selections?.p1 && selections.p1.isCorrect) {
      newStreaks.p1 += 1; newScores.p1 += (selections.p1.time * 10 + (newStreaks.p1 >= 6 ? 100 : (newStreaks.p1 >= 3 ? 50 : 0)));
      if (myRole === 'p1') playSound('correct');
    } else { newStreaks.p1 = 0; }
    if (selections?.p2 && selections.p2.isCorrect) {
      newStreaks.p2 += 1; newScores.p2 += (selections.p2.time * 10 + (newStreaks.p2 >= 6 ? 100 : (newStreaks.p2 >= 3 ? 50 : 0)));
      if (myRole === 'p2') playSound('correct');
    } else { newStreaks.p2 = 0; }

    update(roomRef, { showResult: true, scores: newScores, streaks: newStreaks });
    setTimeout(() => {
      const nextIdx = currentIdx + 1;
      if (nextIdx >= MAX_QUESTIONS) update(roomRef, { gameOver: true }); 
      else update(roomRef, { currentIdx: nextIdx, scores: newScores, streaks: newStreaks, selections: { p1: null, p2: null }, timeLeft: 30, showResult: false, gameOver: false });
    }, 3000);
  }, [roomId, currentIdx, scores, streaks, selections, showResult, gameOver, myRole, questions, questionOrder]);

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

  const onSelect = (opt) => {
    if (myRole === 'viewer' || showResult || gameOver || !roomId || (selections && selections[myRole])) return;
    if (opt.isCorrect) playSound('correct'); else playSound('wrong');
    set(ref(db, `rooms/${roomId}/selections/${myRole}`), { text: opt.text, isCorrect: opt.isCorrect, time: timeLeft });
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
    } else { alert("登入失敗！請確認學號密碼"); }
  };

  const handleReturnToLobby = () => {
    if (roomId) {
        if (myRole === 'p1') update(ref(db, `rooms/${roomId}`), { p1Present: false, "selections/p1": null });
        else if (myRole === 'p2') update(ref(db, `rooms/${roomId}`), { p2Present: false, "selections/p2": null });
    }
    if (bgmRef.current) {
        bgmRef.current.pause(); bgmRef.current.currentTime = 0;
    }
    setRoomId(null); setMyRole(null); setGameOver(false); setCurrentIdx(0);
    setShowResult(false); setP2Joined(false); setScores({ p1: 0, p2: 0 });
    setStreaks({ p1: 0, p2: 0 }); setSelections({ p1: null, p2: null }); setForfeitedBy(null);
  };

  // 🌟 新增：玩家手動點擊「離開」按鈕時的處理
  const handleManualLeave = () => {
    if (p2Joined && !gameOver && myRole !== 'viewer') {
        const confirmLeave = window.confirm("⚠️ 警告！遊戲正在進行中，現在離開將會被扣除 5 點能量，並直接判定為敗北！\n\n確定要離開嗎？");
        if (confirmLeave) {
            // 宣告自己投降
            update(ref(db, `rooms/${roomId}`), { gameOver: true, forfeitedBy: myRole });
            handleReturnToLobby(); // 放棄後直接回到大廳
        }
    } else {
        handleReturnToLobby();
    }
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
        if (!data.p2Present) {
            let randomIndices = [];
            while (randomIndices.length < 10 && randomIndices.length < questions.length) {
                let r = Math.floor(Math.random() * questions.length);
                if (!randomIndices.includes(r)) randomIndices.push(r);
            }
            
            set(roomRef, { 
                p1Present: true, p2Present: false, names: { p1: user.name, p2: "等待中..." }, 
                playerIds: { p1: user.id, p2: null }, currentIdx: 0, scores: { p1: 0, p2: 0 }, 
                streaks: { p1: 0, p2: 0 }, selections: { p1: null, p2: null }, 
                timeLeft: 30, showResult: false, gameOver: false, statsSaved: false,
                questionOrder: randomIndices, forfeitedBy: null
            });
        } else {
            update(roomRef, { p1Present: true, "names/p1": user.name, "playerIds/p1": user.id });
        }
        onDisconnect(ref(db, `rooms/${selectedRoomId}/p1Present`)).set(false); 
      } 
      else if (!data.p2Present) {
        if (data.currentIdx > 0 && user.id !== 'teacher') {
            alert("該房間的遊戲已經開始，無法加入！"); return;
        }
        setMyRole('p2'); setRoomId(selectedRoomId); startBGM();
        update(roomRef, { p2Present: true, "names/p2": user.name, "playerIds/p2": user.id, timeLeft: 30 });
        onDisconnect(ref(db, `rooms/${selectedRoomId}/p2Present`)).set(false);
      } 
      else { alert("房間已滿！"); }
    });
  };

  if (!user) {
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', color: '#fff' }}>
        <h1 style={{fontSize: '2.5rem', marginBottom: '20px'}}>班級知識對抗賽 🎓</h1>
        <input type="text" placeholder="學號" value={loginId} onChange={(e) => setLoginId(e.target.value)} style={{ padding: '15px', fontSize: '1.2rem', borderRadius: '10px', textAlign: 'center', marginBottom: '15px', width:'250px' }} />
        <input type="password" placeholder="密碼" value={password} onChange={(e) => setPassword(e.target.value)} style={{ padding: '15px', fontSize: '1.2rem', borderRadius: '10px', textAlign: 'center', marginBottom: '30px', width:'250px' }} />
        <button onClick={handleLogin} style={{ padding: '15px 40px', fontSize: '1.2rem', borderRadius: '10px', backgroundColor: '#3b82f6', color: '#fff', border:'none', cursor: 'pointer', fontWeight:'bold' }}>進入賽場</button>
      </div>
    );
  }

  if (showStats) {
    return (
        <div style={{ height: '100dvh', padding: '20px', backgroundColor: '#111', color: '#fff', overflowY: 'auto' }}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'30px'}}>
                <h2>📊 題目答對率分析</h2>
                <button onClick={() => setShowStats(false)} style={{padding:'10px 20px', background:'#444', color:'white', border:'none', borderRadius:'5px', cursor:'pointer'}}>返回大廳</button>
            </div>
            <div style={{maxWidth:'900px', margin:'0 auto', overflowX:'auto'}}>
                <table style={{width:'100%', borderCollapse:'collapse', textAlign:'center', minWidth: '600px'}}>
                    <thead>
                        <tr style={{borderBottom:'2px solid #555', color:'#fbbf24'}}>
                            <th style={{padding:'15px'}}>領域</th>
                            <th style={{textAlign:'left'}}>題目內容</th>
                            <th>總作答次數</th>
                            <th>答錯次數</th>
                            <th>答錯率</th>
                        </tr>
                    </thead>
                    <tbody>
                        {statsData.map((s, idx) => {
                            const wrongRate = s.totalCount > 0 ? Math.round((s.wrongCount / s.totalCount) * 100) : 0;
                            return (
                                <tr key={idx} style={{borderBottom:'1px solid #333', backgroundColor: wrongRate >= 50 ? 'rgba(239, 68, 68, 0.1)' : 'transparent'}}>
                                    <td style={{padding:'15px', whiteSpace:'nowrap'}}>{s.category}</td>
                                    <td style={{textAlign:'left', padding:'10px'}}>{renderContent(s.question)}</td>
                                    <td>{s.totalCount}</td>
                                    <td style={{color:'#f87171'}}>{s.wrongCount}</td>
                                    <td style={{color: wrongRate >= 50 ? '#ef4444' : '#22c55e', fontWeight:'bold'}}>{wrongRate}%</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
  }

  if (showLeaderboard) {
    return (
        <div style={{ height: '100dvh', padding: '20px', backgroundColor: '#111', color: '#fff', overflowY: 'auto' }}>
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
      <div style={{ height: '100dvh', padding: '20px', backgroundColor: '#111', color: '#fff', overflowY: 'auto' }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'30px', flexWrap:'wrap', gap:'10px'}}>
            <h2>👋 {user.name}{user.id === 'teacher' ? '老師' : '同學'} 
                {user.id !== 'teacher' && <span style={{fontSize:'1rem', color:'#ec4899', marginLeft:'15px'}}>❤️ {currentEnergy}</span>}
            </h2>
            <div>
                {user.id === 'teacher' && (
                    <button onClick={fetchStats} style={{padding:'10px 20px', marginRight:'10px', background:'#8b5cf6', color:'white', borderRadius:'5px', fontWeight:'bold', border:'none', cursor:'pointer'}}>📊 答錯率分析</button>
                )}
                <button onClick={fetchLeaderboard} style={{padding:'10px 20px', marginRight:'10px', background:'#f59e0b', color:'white', borderRadius:'5px', fontWeight:'bold', border:'none', cursor:'pointer'}}>🏆 排行榜</button>
                <button onClick={() => window.location.reload()} style={{padding:'10px', background:'#333', color:'white', borderRadius:'5px', border:'none', cursor:'pointer'}}>登出</button>
            </div>
        </div>
        <div className="rooms-grid">
          {Array.from({ length: TOTAL_ROOMS }, (_, i) => i + 1).map(num => {
            const rId = String(num); const rData = roomsStatus[rId] || {};
            const isFull = rData.p1Present && rData.p2Present;
            const isEmpty = !rData.p1Present && !rData.p2Present;
            
            const inProgress = (rData.currentIdx > 0 || rData.gameOver) && !isEmpty; 
            const canJoin = user.id === 'teacher' || (!isFull && !inProgress);
            
            return (
              <button key={num} onClick={() => handleJoinRoom(rId)} disabled={!canJoin} className={`room-btn ${isFull || inProgress ? 'full' : (isEmpty ? 'empty' : 'waiting')}`}>
                <div style={{fontSize:'1.5rem', fontWeight:'bold'}}>Room {num}</div>
                <div style={{fontSize:'0.9rem'}}>
                    {(isFull || inProgress) ? (user.id === 'teacher' ? '👁️ 巡堂' : '遊戲中') : (isEmpty ? '空房' : '等待中')}
                </div>
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

  if (loading) return <div style={{color:'white', padding:'20px', backgroundColor:'#000', height:'100dvh'}}>⏳ 載入中...</div>;

  const currentQ = questionOrder.length > 0 ? questions[questionOrder[currentIdx]] : questions[currentIdx];

  const getBtnStyle = (opt) => {
    let bgColor = '#222'; let borderColor = '#444'; 
    const isP1Selected = selections?.p1?.text === opt.text;
    const isP2Selected = selections?.p2?.text === opt.text;
    const isMySelected = myRole === 'p1' ? isP1Selected : (myRole === 'p2' ? isP2Selected : false);

    if (showResult) {
        bgColor = opt.isCorrect ? '#22c55e' : ((isP1Selected || isP2Selected) ? '#ef4444' : '#333');
        borderColor = (isP1Selected || isP2Selected) ? '#fff' : '#444';
    } else {
        if (myRole === 'viewer') {
            if (isP1Selected) bgColor = '#1e40af';
            if (isP2Selected) bgColor = '#991b1b';
            borderColor = (isP1Selected || isP2Selected) ? '#fff' : '#444';
        } else {
            bgColor = isMySelected ? '#3b82f6' : '#222';
            borderColor = isMySelected ? '#fff' : '#444'; 
        }
    }
    return { backgroundColor: bgColor, border: `3px solid ${borderColor}` };
  };

  if (gameOver) {
    let resultTitle = ""; let subMessage = ""; let titleColor = "#fbbf24"; 
    
    // 🌟 修改：遊戲結束畫面根據「是否有人逃跑」改變顯示內容
    if (forfeitedBy) {
        if (forfeitedBy === myRole) {
            resultTitle = "🏃‍♂️ 你已逃跑，判定敗北！";
            subMessage = "中途離開會被扣除 5 點能量喔！";
            titleColor = "#ef4444";
        } else {
            resultTitle = "🎉 對手逃跑了！你獲勝了！ 🎉";
            subMessage = "不戰而勝！對手已被扣除 5 點能量。";
            titleColor = "#22c55e";
        }
    } else {
        let winnerRole = "tie";
        if (scores.p1 > scores.p2) winnerRole = "p1";
        if (scores.p2 > scores.p1) winnerRole = "p2";

        if (winnerRole === "tie") {
          resultTitle = "🤝 雙方勢均力敵，平手！ 🤝"; subMessage = "兩位同學都非常優秀！";
        } else if (winnerRole === myRole) {
          resultTitle = `🎉 恭喜你獲勝！ 🎉`; subMessage = "太厲害了，繼續保持！";
          titleColor = myRole === 'p1' ? "#60a5fa" : "#f87171"; 
        } else if (myRole === 'p1' || myRole === 'p2') {
          resultTitle = `😢 挑戰失敗... 😢`; subMessage = `不要灰心，再接再厲下次一定贏！ 💪`; titleColor = "#9ca3af"; 
        } else {
          const winnerName = winnerRole === 'p1' ? names.p1 : names.p2;
          resultTitle = `🎉 恭喜 ${winnerName} 獲勝！ 🎉`; subMessage = "一場精彩的對決！";
          titleColor = winnerRole === 'p1' ? "#60a5fa" : "#f87171";
        }
    }

    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', color: '#fff', textAlign: 'center' }}>
        <h1 style={{fontSize: '3rem', color: titleColor, marginBottom: '10px'}}>{resultTitle}</h1>
        <p style={{fontSize: '1.5rem', color: '#9ca3af', marginBottom: '30px'}}>{subMessage}</p>
        <div style={{display:'flex', gap:'50px', margin:'20px 0', fontSize:'2.5rem', fontWeight: 'bold'}}>
            <div style={{color: '#60a5fa'}}>{names.p1}<br/><span style={{fontSize:'4rem'}}>{scores.p1}</span></div>
            <div style={{alignSelf:'center', fontSize:'1.5rem', color:'#555'}}>VS</div>
            <div style={{color: '#f87171'}}>{names.p2}<br/><span style={{fontSize:'4rem'}}>{scores.p2}</span></div>
        </div>
        <button onClick={handleReturnToLobby} style={{marginTop: '40px', padding:'15px 40px', fontSize:'1.2rem', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius:'10px', cursor:'pointer', fontWeight:'bold', transition: '0.2s'}}>返回大廳</button>
      </div>
    );
  }

  // 對戰畫面
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', backgroundColor: '#111', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '15px', backgroundColor: '#222', alignItems: 'center' }}>
        <div style={{ color: '#60a5fa', fontWeight: 'bold' }}>🔵 {names.p1}<br/><span style={{fontSize:'0.8rem', color:'#888'}}>{selections?.p1 ? '已作答' : '思考中'}</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fbbf24' }}>{!p2Joined ? '等待中' : `${timeLeft}s`}</div>
            {/* 🌟 修改：將直接回大廳改為觸發警告的 handleManualLeave */}
            <button onClick={handleManualLeave} style={{ marginTop: '5px', padding: '5px 15px', fontSize: '0.9rem', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>離開</button>
        </div>
        <div style={{ color: '#f87171', fontWeight: 'bold', textAlign: 'right' }}>🔴 {names.p2}<br/><span style={{fontSize:'0.8rem', color:'#888'}}>{selections?.p2 ? '已作答' : '思考中'}</span></div>
      </div>
      
      {/* 題目與選項區 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '30px', color: '#fbbf24' }}>Q{currentIdx + 1}: {currentQ ? renderContent(currentQ.question) : '載入中...'}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '100%', maxWidth: '400px' }}>
            {shuffledOptions.map((opt, i) => (
                <button key={i} onClick={() => onSelect(opt)} style={{ ...getBtnStyle(opt), padding: '15px', borderRadius: '10px', color: 'white', fontSize: '1.2rem', cursor: myRole === 'viewer' || showResult ? 'default' : 'pointer' }}>
                    {renderContent(opt.text)}
                </button>
            ))}
        </div>
      </div>
    </div>
  );
}

export default App;