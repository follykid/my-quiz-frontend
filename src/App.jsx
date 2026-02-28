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
const MAX_QUESTIONS = 10;

function App() {
  const [user, setUser] = useState({ id: 'student_' + Math.floor(Math.random()*1000) }); 
  // --- 🌟 讀取真實 CSV 題庫 ---
  const [questions, setQuestions] = useState([]);

  useEffect(() => {
    Papa.parse("/data.csv", {
      download: true,
      header: true, // 假設您的 CSV 有標題列
      skipEmptyLines: true,
      complete: (results) => {
        // 將讀取到的資料轉換成遊戲需要的格式
        const loadedQuestions = results.data.map(row => ({
          question: row["題目"] || row["Question"] || row.question || "",
          originalOptions: [
            row["選項A"] || row["A"] || row.optionA,
            row["選項B"] || row["B"] || row.optionB,
            row["選項C"] || row["C"] || row.optionC,
            row["選項D"] || row["D"] || row.optionD
          ].filter(Boolean), // 過濾掉空白的選項
          correctText: row["答案"] || row["正確答案"] || row["Answer"] || row.answer || "",
          category: row["分類"] || row["Category"] || row.category || "一般"
        }));
        setQuestions(loadedQuestions);
      },
      error: (err) => {
        console.error("讀取題庫失敗，請檢查 data.csv 是否存在:", err);
      }
    });
  }, []);
  // ------------------------------
  const [roomId, setRoomId] = useState(null);
  const [myRole, setMyRole] = useState(null); 
  const [p2Joined, setP2Joined] = useState(false);
  
  const [questionOrder, setQuestionOrder] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentQ, setCurrentQ] = useState(null);
  const [shuffledOptions, setShuffledOptions] = useState([]);
  
  const [scores, setScores] = useState({ p1: 0, p2: 0 });
  const [streaks, setStreaks] = useState({ p1: 0, p2: 0 });
  const [names, setNames] = useState({ p1: "玩家一", p2: "玩家二" });
  const [playerIds, setPlayerIds] = useState({ p1: "", p2: "" });
  
  const [timeLeft, setTimeLeft] = useState(15);
  const [showResult, setShowResult] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [forfeitedBy, setForfeitedBy] = useState(null);
  const [selections, setSelections] = useState(null);

  // ----------------------------------------------------
  // 🌟 修正 1：避免選項每秒瘋狂跳動
  // ----------------------------------------------------
  useEffect(() => {
    if (questions && questions.length > 0) {
      const q = questionOrder.length > 0 ? questions[questionOrder[currentIdx]] : questions[currentIdx];
      setCurrentQ(q);
      
      if (q && q.originalOptions) {
        const opts = q.originalOptions.map(text => ({ text, isCorrect: text === q.correctText }));
        setShuffledOptions(opts.sort(() => Math.random() - 0.5));
      }
    }
  // eslint-disable-next-line
  }, [currentIdx, questions, questionOrder.join(',')]);


  // ----------------------------------------------------
  // 🌟 修正 3 & 4：防偷跑與防作弊機制
  // ----------------------------------------------------
  const onSelect = (opt) => {
    if (myRole === 'viewer' || showResult || gameOver || !roomId) return;
    
    if (!p2Joined) {
      alert("對手還沒加入，請發揮運動員精神等待喔！🏃‍♂️");
      return;
    }

    if (myRole !== 'p1' && myRole !== 'p2') return;
    if (user.id !== playerIds[myRole]) {
      alert("您不是這個房間的正式比賽選手，不可作答！");
      return; 
    }

    if (selections && selections[myRole]) return;

    if (opt.isCorrect) playSound('correct'); else playSound('wrong');
    set(ref(db, `rooms/${roomId}/selections/${myRole}`), { text: opt.text, isCorrect: opt.isCorrect, time: timeLeft });
    console.log("答案已送出:", opt.text);
  };

  const handleManualLeave = () => {
    if (myRole === 'viewer') {
      setRoomId(null);
      setMyRole(null);
    } else {
      update(ref(db, `rooms/${roomId}`), { forfeitedBy: myRole, gameOver: true });
      alert("您選擇了逃跑！");
    }
  };

  const handleReturnToLobby = () => {
    setRoomId(null);
    setMyRole(null);
    setGameOver(false);
  };

  const getBtnStyle = (opt) => {
      return { backgroundColor: '#334155', border: '1px solid #475569' };
  };

  // ==========================================
  // 畫面渲染區：大廳
  // ==========================================
  if (!roomId) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#111', color: '#fff', minHeight: '100vh' }}>
        <h1>班級知識對抗賽 🏆</h1>
        <p>歡迎來到遊戲大廳！</p>
        <button onClick={() => { setRoomId("room1"); setMyRole("p1"); setP2Joined(true); }} style={{ padding: '10px 20px', marginTop: '20px', cursor: 'pointer', borderRadius: '8px', backgroundColor: '#3b82f6', color: '#fff', border: 'none' }}>
          測試加入房間 (玩家一)
        </button>
        <ChatBoard currentUser={user.id} />
      </div>
    );
  }

  // ==========================================
  // 🌟 結算畫面
  // ==========================================
  if (gameOver) {
    let resultTitle = ""; let subMessage = ""; let titleColor = "#fbbf24"; 
    
    if (forfeitedBy) {
        if (forfeitedBy === myRole) {
            resultTitle = "🏃‍♂️ 你已逃跑，判定敗北！";
            subMessage = "中途離開會被扣除 5 點能量喔！";
            titleColor = "#ef4444";
        } else if (myRole === 'viewer') {
            resultTitle = `⚠️ 有人逃跑了！`;
            subMessage = `逃跑方已被扣除 5 點能量`;
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
            resultTitle = "🤝 平手！"; subMessage = "雙方實力相當！"; titleColor = "#60a5fa";
        } else if (myRole === winnerRole) {
            resultTitle = "🏆 你贏了！"; subMessage = "太神啦！獲得 2 點能量！"; titleColor = "#22c55e";
        } else if (myRole === 'viewer') {
            resultTitle = `🏆 獲勝者：${names[winnerRole]}`; subMessage = "精彩的對決！";
        } else {
            resultTitle = "💔 你輸了！"; subMessage = "再接再厲！扣除 1 點能量。"; titleColor = "#ef4444";
        }
    }

    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111', color: '#fff' }}>
        <h1 style={{ color: titleColor, fontSize: '3rem', marginBottom: '10px', textAlign: 'center' }}>{resultTitle}</h1>
        <p style={{ fontSize: '1.2rem', color: '#ccc', marginBottom: '30px', textAlign: 'center' }}>{subMessage}</p>
        <div style={{ display: 'flex', gap: '30px', marginBottom: '40px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', color: '#60a5fa' }}>{names.p1}</div>
            <div style={{ fontSize: '3rem', fontWeight: 'bold' }}>{scores.p1}</div>
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#555', marginTop: '30px' }}>VS</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', color: '#f87171' }}>{names.p2}</div>
            <div style={{ fontSize: '3rem', fontWeight: 'bold' }}>{scores.p2}</div>
          </div>
        </div>
        <button onClick={handleReturnToLobby} style={{ padding: '15px 40px', fontSize: '1.2rem', borderRadius: '10px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>返回大廳</button>
      </div>
    );
  }

  // ==========================================
  // 🌟 遊戲對戰介面
  // ==========================================
  return (
    <div style={{ height: '100dvh', padding: '10px 20px', backgroundColor: '#000', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      
      {/* 🏆 分數與狀態列 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', backgroundColor: '#1a1a1a', borderRadius: '15px', marginBottom: '20px' }}>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '1.2rem', color: '#60a5fa', fontWeight: 'bold' }}>{names.p1} {myRole === 'p1' && '(你)'}</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{scores.p1}</div>
          {streaks.p1 >= 3 && <div style={{ color: '#fbbf24', fontSize: '0.8rem' }}>🔥 {streaks.p1} 連勝</div>}
        </div>
        
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: timeLeft <= 5 ? '#ef4444' : '#fbbf24' }}>
            {timeLeft}s
          </div>
          <div style={{ fontSize: '0.9rem', color: '#888' }}>第 {currentIdx + 1} / {MAX_QUESTIONS} 題</div>
        </div>

        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '1.2rem', color: '#f87171', fontWeight: 'bold' }}>{names.p2} {myRole === 'p2' && '(你)'}</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{scores.p2}</div>
          {streaks.p2 >= 3 && <div style={{ color: '#fbbf24', fontSize: '0.8rem' }}>🔥 {streaks.p2} 連勝</div>}
        </div>
      </div>

      {/* 題目與選項區塊 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        {!p2Joined ? (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ color: '#fbbf24', fontSize: '2rem' }}>等待對手加入中...</h2>
            <p style={{ color: '#888' }}>請不要離開畫面</p>
          </div>
        ) : (
          <>
            <div style={{ backgroundColor: '#1a1a1a', padding: '30px', borderRadius: '15px', width: '100%', maxWidth: '800px', textAlign: 'center', marginBottom: '30px', border: '1px solid #333' }}>
              <span style={{ backgroundColor: '#3b82f6', padding: '5px 10px', borderRadius: '8px', fontSize: '0.9rem', marginBottom: '15px', display: 'inline-block' }}>{currentQ?.category || "一般"}</span>
              <h2 style={{ fontSize: '1.8rem', lineHeight: '1.4' }}>{renderContent(currentQ?.question)}</h2>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', width: '100%', maxWidth: '800px' }}>
              {shuffledOptions.map((opt, idx) => (
                <button 
                  key={idx} 
                  onClick={() => onSelect(opt)}
                  style={{ ...getBtnStyle(opt), padding: '20px', borderRadius: '12px', color: '#fff', fontSize: '1.2rem', cursor: (showResult || !p2Joined || myRole === 'viewer') ? 'not-allowed' : 'pointer', transition: 'all 0.2s', textAlign: 'center' }}
                >
                  {renderContent(opt.text)}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 離開/逃跑按鈕 */}
      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        <button onClick={handleManualLeave} style={{ backgroundColor: '#ef4444', color: '#fff', padding: '10px 20px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
          {myRole === 'viewer' ? '結束巡堂' : '逃跑 (離開遊戲)'}
        </button>
      </div>
    </div>
  );
}

export default App;