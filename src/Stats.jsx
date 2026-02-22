// src/Stats.jsx
import { useState, useEffect } from 'react';
import { db } from './firebase'; 
import { ref, get } from "firebase/database";

function Stats() {
    const [statsData, setStatsData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = () => {
            const statsRef = ref(db, 'questionStats');
            get(statsRef).then((snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    const list = Object.keys(data).map(key => {
                        const item = data[key];
                        // 計算錯誤率
                        const errorRate = item.totalCount > 0 ? (item.wrongCount / item.totalCount) * 100 : 0;
                        return { ...item, errorRate };
                    });
                    // 依照錯誤率由高到低排序
                    list.sort((a, b) => b.errorRate - a.errorRate);
                    setStatsData(list);
                } else {
                    setStatsData([]);
                }
                setLoading(false);
            });
        };
        
        fetchStats();
    }, []);

    if (loading) return <div style={{color:'white', padding:'20px', backgroundColor:'#111', height:'100vh'}}>⏳ 載入數據中...</div>;

    return (
        <div style={{ minHeight: '100vh', padding: '20px', backgroundColor: '#111', color: '#fff' }}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'30px'}}>
                <h2>📊 易錯題分析 (教師專用後臺)</h2>
                {/* 關閉分頁按鈕 */}
                <button onClick={() => window.close()} style={{padding:'10px 20px', background:'#444', color:'white', border:'none', borderRadius:'5px', cursor:'pointer'}}>關閉此頁面</button>
            </div>
            
            <div style={{maxWidth:'800px', margin:'0 auto'}}>
                <table style={{width:'100%', borderCollapse:'collapse'}}>
                    <thead>
                        <tr style={{borderBottom:'2px solid #555', color:'#3b82f6', fontSize:'1.1rem', textAlign:'left'}}>
                            <th style={{padding:'15px'}}>錯誤率</th>
                            <th>答錯/總數</th>
                            <th>題目內容</th>
                        </tr>
                    </thead>
                    <tbody>
                        {statsData.map((s, idx) => {
                            const isHighRisk = s.errorRate >= 50;
                            return (
                                <tr key={idx} style={{borderBottom:'1px solid #333', fontSize:'1rem', backgroundColor: isHighRisk ? 'rgba(239, 68, 68, 0.15)' : 'transparent'}}>
                                    <td style={{padding:'15px', color: isHighRisk ? '#ef4444' : '#22c55e', fontWeight:'bold', fontSize:'2rem'}}>
                                        {s.errorRate.toFixed(0)}%
                                    </td>
                                    <td style={{color:'#9ca3af', fontSize:'1.2rem'}}>
                                        {s.wrongCount} / {s.totalCount}
                                    </td>
                                    <td style={{padding:'15px'}}>
                                        <div style={{fontWeight:'bold', marginBottom:'5px', fontSize:'1.2rem'}}>{s.question}</div>
                                        <div style={{fontSize:'0.9rem', color:'#666'}}>分類: {s.category}</div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {statsData.length === 0 && <div style={{textAlign:'center', marginTop:'30px', color:'#666', fontSize:'1.5rem'}}>目前還沒有學生答題數據喔！</div>}
            </div>
        </div>
    );
}

export default Stats;