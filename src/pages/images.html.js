export const IMAGES_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>图片预加载 - 校园心愿墙</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      padding: 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding: 20px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header h1 {
      color: #333;
      margin-bottom: 10px;
    }
    .stats {
      display: flex;
      justify-content: center;
      gap: 30px;
      margin-top: 15px;
    }
    .stat-item {
      text-align: center;
    }
    .stat-value {
      font-size: 1.5rem;
      font-weight: bold;
      color: #E63946;
    }
    .stat-label {
      font-size: 0.9rem;
      color: #666;
      margin-top: 4px;
    }
    .image-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 15px;
      max-width: 1400px;
      margin: 0 auto;
    }
    .image-item {
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      transition: transform 0.2s ease;
    }
    .image-item:hover {
      transform: translateY(-2px);
    }
    .image-item img {
      width: 100%;
      height: 200px;
      object-fit: cover;
      display: block;
    }
    .image-info {
      padding: 10px;
      font-size: 0.8rem;
      color: #666;
    }
    .image-id {
      font-weight: 500;
      color: #333;
    }
    .loading {
      text-align: center;
      padding: 50px;
      color: #666;
    }
    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #f3f3f3;
      border-top: 3px solid #E63946;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 15px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .progress-bar {
      width: 100%;
      max-width: 400px;
      height: 8px;
      background: #e0e0e0;
      border-radius: 4px;
      margin: 15px auto;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: #E63946;
      border-radius: 4px;
      transition: width 0.3s ease;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🖼️ 图片预加载</h1>
    <p>正在加载所有图片到 CDN 缓存...</p>
    <div class="stats">
      <div class="stat-item">
        <div class="stat-value" id="totalCount">0</div>
        <div class="stat-label">总图片数</div>
      </div>
      <div class="stat-item">
        <div class="stat-value" id="loadedCount">0</div>
        <div class="stat-label">已加载</div>
      </div>
      <div class="stat-item">
        <div class="stat-value" id="failedCount">0</div>
        <div class="stat-label">加载失败</div>
      </div>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" id="progressFill" style="width: 0%"></div>
    </div>
  </div>

  <div id="imageGrid" class="image-grid">
    <div class="loading">
      <div class="loading-spinner"></div>
      <p>正在加载图片列表...</p>
    </div>
  </div>

  <script>
    let totalImages = 0;
    let loadedImages = 0;
    let failedImages = 0;

    // 更新统计信息
    function updateStats() {
      document.getElementById('totalCount').textContent = totalImages;
      document.getElementById('loadedCount').textContent = loadedImages;
      document.getElementById('failedCount').textContent = failedImages;
      
      const progress = totalImages > 0 ? (loadedImages + failedImages) / totalImages * 100 : 0;
      document.getElementById('progressFill').style.width = progress + '%';
    }

    // 图片加载降级逻辑
    function loadImageWithFallback(img, defaultUrl, telegramUrl) {
      let failCount = 0;
      const maxFails = 3;
      
      // 从 localStorage 获取失败记录
      const failKey = 'img_fail_' + btoa(defaultUrl);
      const storedFails = parseInt(localStorage.getItem(failKey) || '0');
      
      if (storedFails >= maxFails && telegramUrl) {
        // 已经失败超过3次，直接用 Telegram 存储
        img.src = telegramUrl;
        return;
      }
      
      // 先尝试默认存储
      img.src = defaultUrl;
      
      img.onload = function() {
        loadedImages++;
        updateStats();
      };
      
      img.onerror = function() {
        failCount++;
        const totalFails = storedFails + failCount;
        localStorage.setItem(failKey, totalFails.toString());
        
        if (totalFails >= maxFails && telegramUrl) {
          // 切换到 Telegram 存储
          img.src = telegramUrl;
          img.onerror = function() {
            failedImages++;
            updateStats();
          };
          img.onload = function() {
            loadedImages++;
            updateStats();
          };
        } else if (failCount >= maxFails) {
          // 没有备选存储，标记为失败
          failedImages++;
          updateStats();
        }
      };
    }

    // 加载所有图片
    async function loadAllImages() {
      const grid = document.getElementById('imageGrid');
      
      try {
        const res = await fetch('/api/images?pageSize=200');
        const data = await res.json();
        
        if (data.success && data.data.list) {
          const images = data.data.list;
          totalImages = images.length;
          updateStats();
          
          if (images.length === 0) {
            grid.innerHTML = '<div class="loading"><p>暂无图片</p></div>';
            return;
          }
          
          let html = '';
          images.forEach((img, index) => {
            html += \`
              <div class="image-item">
                <img id="img-\${index}" alt="图片 \${img.id}" 
                     data-default="\${img.default_url || img.primary_url}" 
                     data-telegram="\${img.telegram_url || ''}">
                <div class="image-info">
                  <div class="image-id">#\${img.id}</div>
                  <div>\${img.filename || '未知'}</div>
                </div>
              </div>
            \`;
          });
          
          grid.innerHTML = html;
          
          // 逐张加载图片
          images.forEach((img, index) => {
            const imgElement = document.getElementById('img-' + index);
            loadImageWithFallback(
              imgElement,
              img.default_url || img.primary_url,
              img.telegram_url
            );
          });
        } else {
          grid.innerHTML = '<div class="loading"><p>加载失败</p></div>';
        }
      } catch (e) {
        console.error('加载图片列表失败:', e);
        grid.innerHTML = '<div class="loading"><p>加载失败，请刷新重试</p></div>';
      }
    }

    // 页面加载完成后开始加载图片
    document.addEventListener('DOMContentLoaded', () => {
      loadAllImages();
    });
  </script>
</body>
</html>`;
