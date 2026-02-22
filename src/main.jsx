import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Stats from './Stats.jsx' // 引入我們剛做好的分析頁面
import './index.css'

// 抓取目前網址後面的標籤 (Hash)
const currentHash = window.location.hash;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* 網址分流魔法：有 #stats 就去 Stats，沒有就去 App */}
    {currentHash === '#stats' ? <Stats /> : <App />}
  </React.StrictMode>,
)