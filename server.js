const express = require('express');
const { YoutubeTranscript } = require('youtube-transcript');
const app = express();
const port = process.env.PORT || 3000;

// --- 核心分段算法 ---
// 使用长停顿（默认为 1.5 秒）来推断舞蹈学习片段的边界
function segmentTranscript(transcriptData, longPauseThresholdMs = 1500) {
  if (transcriptData.length === 0) return [];

  const segments = [];
  let currentSegment = {
    startTimeMs: transcriptData[0].offset,
    texts: []
  };

  for (let i = 0; i < transcriptData.length; i++) {
    const currentLine = transcriptData[i];
    currentSegment.texts.push(currentLine.text);

    if (i < transcriptData.length - 1) {
      const nextLine = transcriptData[i + 1];

      const currentEndMs = currentLine.offset + currentLine.duration;
      const nextStartMs = nextLine.offset;
      const pauseDuration = nextStartMs - currentEndMs;

      // 判断是否达到长停顿阈值
      if (pauseDuration >= longPauseThresholdMs) {
        segments.push(currentSegment);

        currentSegment = {
          startTimeMs: nextLine.offset,
          texts: []
        };
      }
    }
  }

  // 确保最后一个片段也被加入
  if (currentSegment.texts.length > 0) {
    segments.push(currentSegment);
  }

  // 格式化输出，供前端使用
  return segments.map(seg => ({
    startTime: Math.floor(seg.startTimeMs / 1000), // 转换为秒
    text: seg.texts.join(' ') // 将片段内的歌词合并成一个文本
  }));
}

// --- HTML 页面生成函数 ---
function generatePlayerHtml(videoId, segments) {
  let segmentsHtml = segments.map((segment, index) => {
    // 格式化时间 00:00:00
    const timeDisplay = new Date(segment.startTime * 1000).toISOString().substr(11, 8); 
    const segmentDuration = 8; // 默认循环时长 8秒，对应一个八拍

    return `
      <div class="segment">
        <div class="segment-header">
          <button class="play-btn" 
                  onclick="playSegment(${segment.startTime}, ${segmentDuration});">
            ▶️ 片段 ${index + 1} (${timeDisplay})
          </button>
          <button class="loop-btn" 
                  onclick="loopSegment(${segment.startTime}, ${segment.startTime + segmentDuration});">
            🔄 循环 ${segmentDuration}s
          </button>
          <span class="segment-text">${segment.text}</span>
        </div>
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>K-pop 扒舞工具 - 片段学习</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; background-color: #f0f2f5; }
        h1 { color: #ff0000; }
        #player { margin-bottom: 20px; border-radius: 8px; overflow: hidden; max-width: 640px; }
        .segment { background-color: white; border-radius: 8px; margin-bottom: 10px; padding: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .segment-header { display: flex; align-items: center; flex-wrap: wrap; }
        .play-btn, .loop-btn { 
          background-color: #ff0000; color: white; border: none; 
          padding: 8px 12px; margin-right: 10px; margin-bottom: 5px; cursor: pointer; 
          border-radius: 4px; transition: background-color 0.3s;
        }
        .play-btn:hover, .loop-btn:hover { background-color: #cc0000; }
        .segment-text { flex-grow: 1; font-size: 1em; color: #333; margin-left: 10px; }
        /* 响应式调整 */
        @media (max-width: 600px) {
            .segment-header { flex-direction: column; align-items: flex-start; }
            .play-btn, .loop-btn { margin-bottom: 10px; width: 100%; }
            .segment-text { margin-left: 0; margin-top: 10px; }
        }
      </style>
    </head>
    <body>
      <h1>K-pop 扒舞片段学习工具</h1>
      <p>视频ID: ${videoId} | 分段阈值: 1.5秒停顿</p>
      
      <div id="player"></div>
      
      <h3>🎵 自动分段时间线 (基于长停顿)</h3>
      <div id="segments-container">${segmentsHtml}</div>

      <script>
        // --- YouTube IFrame Player API 初始化 ---
        var player;
        var loopInterval;
        var loopEndTime = 0;
        var loopStartTime = 0; // 新增起始时间变量，用于循环跳回

        function onYouTubeIframeAPIReady() {
          player = new YT.Player('player', {
            height: '390',
            width: '100%',
            videoId: '${videoId}', 
            playerVars: {
              'playsinline': 1 
            },
            events: {
              'onStateChange': onPlayerStateChange
            }
          });
        }
        
        // --- 核心播放控制函数 ---

        // 1. 跳转并播放指定时长
        function playSegment(startTime, duration = 8) {
          clearLoop(); 
          player.seekTo(startTime, true); 
          player.playVideo();
          // 设置定时器，到时间后暂停
          setTimeout(() => { 
             // 检查是否还在播放，防止用户手动操作
             if (player.getPlayerState() === YT.PlayerState.PLAYING) {
                player.pauseVideo(); 
             }
          }, duration * 1000); 
        }

        // 2. 循环播放指定片段
        function loopSegment(startTime, endTime) {
          clearLoop(); 
          loopStartTime = startTime;
          loopEndTime = endTime;
          player.seekTo(startTime, true); 
          player.playVideo();
          
          // 每 100 毫秒检查一次是否到达循环终点
          loopInterval = setInterval(checkLoop, 100);
        }

        // 3. 循环检查和重置
        function checkLoop() {
          // 检查播放时间是否达到或超过循环终点
          if (player.getCurrentTime() >= loopEndTime) {
            // 跳回到循环起点
            player.seekTo(loopStartTime, true); 
          }
        }
        
        // 4. 清除循环
        function clearLoop() {
          if (loopInterval) {
            clearInterval(loopInterval);
            loopInterval = null;
          }
          loopEndTime = 0;
          loopStartTime = 0;
        }
        
        // 5. 状态变化事件，用于在用户手动暂停时清除循环
        function onPlayerStateChange(event) {
          if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
            clearLoop();
          }
        }

        // 确保加载 YouTube Iframe API
        var tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        var firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      </script>
    </body>
    </html>
  `;
}

// --- Express 路由 (主入口) ---
app.get('/', async (req, res) => {
  const url = req.query.url;
  
  // 1. 如果没有 URL，显示输入表单 (前端)
  if (!url) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>K-pop 扒舞工具</title>
        <style>
          body { font-family: sans-serif; padding: 50px; text-align: center; background-color: #f0f2f5; }
          h1 { color: #ff0000; }
          input[type="text"] { padding: 10px; width: 80%; max-width: 500px; margin-bottom: 20px; border: 1px solid #ccc; border-radius: 4px; }
          button { background-color: #ff0000; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
          button:hover { background-color: #cc0000; }
        </style>
      </head>
      <body>
        <h1>💃 K-pop 扒舞工具 - 输入</h1>
        <form action="/" method="GET">
          <input type="text" name="url" placeholder="输入 YouTube 舞蹈视频 URL" required>
          <button type="submit">开始分段学习</button>
        </form>
        <p>该工具将自动尝试获取视频的自动字幕，并根据**长停顿 (>= 1.5秒)** 智能划分学习片段。</p>
        <p>适合具有自动字幕的 K-pop 练习室视频或 M/V。</p>
      </body>
      </html>
    `);
  }

  // 2. 提取视频 ID
  let videoId = null;
  try {
    // 处理各种 YouTube URL 格式
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('youtube.com')) {
      videoId = urlObj.searchParams.get('v');
    } else if (urlObj.hostname.includes('youtu.be')) {
      videoId = urlObj.pathname.replace('/', '');
    }
  } catch (e) {
    return res.send(`
      <h1>处理错误</h1>
      <p>请检查您输入的 URL 格式是否正确。</p>
      <p><a href="/">返回输入页</a></p>
    `);
  }
  
  if (!videoId) {
    return res.send('无效的 YouTube URL，请确保是正确的格式。');
  }

  // 3. 获取并分段字幕 (后端核心操作)
  let segmentedData = [];
  try {
    const transcriptData = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'ko' }); // 尝试优先获取韩语字幕
    segmentedData = segmentTranscript(transcriptData);
    
    if (segmentedData.length < 2) { // 至少需要两个片段才有意义
      return res.send(`
        <h1>无法分段</h1>
        <p>该视频无法获取到足够的自动字幕，或字幕过于稀疏导致无法有效分段。请尝试其他具有清晰自动字幕的视频。</p>
        <p><a href="/">返回输入页</a></p>
      `);
    }
  } catch (error) {
    console.error('获取或分段字幕失败:', error);
    return res.send(`
      <h1>处理错误</h1>
      <p>在获取字幕时发生错误，可能是该视频没有自动字幕或 API 访问问题。</p>
      <p><a href="/">返回输入页</a></p>
    `);
  }

  // 4. 生成最终页面
  res.send(generatePlayerHtml(videoId, segmentedData));
});

// 启动服务器
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
