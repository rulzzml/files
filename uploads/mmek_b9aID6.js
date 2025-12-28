const axios = require('axios');
const mime = require('mime-types');
const crypto = require('crypto');
const path = require('path');

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function generateId(length = 6) {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(length);
  let id = '';
  for (let i = 0; i < length; i++) {
    id += alphabet[bytes[i] % alphabet.length];
  }
  return id;
}

function getRequestProtocol(req) {
  const forwarded = req.headers['x-forwarded-proto'];
  if (forwarded) return forwarded.split(',')[0].trim();
  if (req.secure) return 'https';
  return req.protocol || 'http';
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateString) {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return '-';
  }
}

async function checkRepoSpace(githubData) {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${githubData.owner}/${githubData.repo}`,
      {
        headers: {
          Authorization: `Bearer ${githubData.token}`,
          'User-Agent': 'RulzXD-API'
        }
      }
    );
    
    const size = response.data.size || 0;
    const maxSize = 100 * 1024 * 1024; // 100MB limit per repo
    
    return {
      success: true,
      size: size,
      available: maxSize - size,
      percentUsed: (size / maxSize) * 100
    };
  } catch (error) {
    console.error(`Error checking repo ${githubData.repo}:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

async function getAvailableRepo(githubDatas) {
  for (let i = 0; i < githubDatas.length; i++) {
    const check = await checkRepoSpace(githubDatas[i]);
    if (check.success && check.percentUsed < 95) {
      return {
        index: i,
        data: githubDatas[i],
        spaceInfo: check
      };
    }
  }
  
  return {
    index: 0,
    data: githubDatas[0],
    spaceInfo: { available: 0, percentUsed: 100 }
  };
}

async function uploadFileToGithub(file, customName = null, githubDatas) {
  if (file.size > MAX_FILE_SIZE) {
    return {
      success: false,
      error: `File size exceeds 5MB limit (${formatFileSize(file.size)})`,
      code: 'SIZE_LIMIT'
    };
  }

  try {
    const repoInfo = await getAvailableRepo(githubDatas);
    console.log(`Using repo ${repoInfo.index + 1}: ${repoInfo.data.repo}, Available: ${formatFileSize(repoInfo.spaceInfo.available)}`);
    
    const mimeType = mime.lookup(file.name) || 'application/octet-stream';
    const extension = mime.extension(mimeType) || 'bin';
    
    const id = generateId(6);
    
    let fileName;
    if (customName && customName.trim() !== '') {
      const cleanName = customName.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
      fileName = `${cleanName}_${id}.${extension}`;
    } else {
      fileName = `${id}.${extension}`;
    }
    
    const gitPath = `uploads/${fileName}`;
    const base64Content = Buffer.from(file.data).toString('base64');
    
    const response = await axios.put(
      `https://api.github.com/repos/${repoInfo.data.owner}/${repoInfo.data.repo}/contents/${gitPath}`,
      {
        message: `Upload file ${fileName}`,
        content: base64Content,
        branch: repoInfo.data.branch || 'main',
      },
      {
        headers: {
          Authorization: `Bearer ${repoInfo.data.token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'RulzXD-API-Uploader'
        },
        timeout: 30000
      }
    );
    
    return {
      success: true,
      data: {
        original_name: file.name,
        custom_name: customName || file.name,
        file_name: fileName,
        git_path: gitPath,
        size: file.size,
        type: mimeType,
        repo_index: repoInfo.index,
        repo_name: repoInfo.data.repo,
        sha: response.data.content.sha,
        download_url: response.data.content.download_url,
        html_url: response.data.content.html_url,
        uploaded_at: new Date().toISOString()
      }
    };
    
  } catch (error) {
    console.error('GitHub API Error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      code: 'GITHUB_ERROR'
    };
  }
}

async function getAllFilesFromGithub(githubDatas) {
  const allFiles = [];
  
  for (let i = 0; i < githubDatas.length; i++) {
    const githubData = githubDatas[i];
    
    try {
      const response = await axios.get(
        `https://api.github.com/repos/${githubData.owner}/${githubData.repo}/contents/uploads?ref=${githubData.branch || 'main'}`,
        {
          headers: {
            Authorization: `Bearer ${githubData.token}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'RulzXD-API'
          },
          timeout: 10000
        }
      );
      
      const files = response.data.filter(item => item.type === 'file');
      
      const fileList = files.map((file) => {
        let customName = file.name;
        const extension = path.extname(file.name);
        const nameWithoutExt = path.basename(file.name, extension);
        
        const idMatch = nameWithoutExt.match(/_([a-zA-Z0-9]{6})$/);
        if (idMatch) {
          customName = nameWithoutExt.replace(/_[a-zA-Z0-9]{6}$/, '') + extension;
        }
        
        return {
          original_name: file.name,
          custom_name: customName,
          file_name: file.name,
          url: file.download_url,
          size: file.size,
          type: mime.lookup(file.name) || 'application/octet-stream',
          uploaded_at: file.created_at || new Date().toISOString(),
          repo_index: i,
          repo_name: githubData.repo,
          sort_date: new Date(file.created_at || Date.now()).getTime()
        };
      });
      
      allFiles.push(...fileList);
      
    } catch (error) {
      if (error.response?.status !== 404) {
        console.error(`Error getting files from repo ${i + 1}:`, error.message);
      }
    }
  }
  
  return {
    success: true,
    data: allFiles,
    count: allFiles.length
  };
}

async function getFileFromGithub(fileName, repoIndex, githubDatas) {
  if (repoIndex < 0 || repoIndex >= githubDatas.length) {
    return {
      success: false,
      error: 'Invalid repo index'
    };
  }

  const githubData = githubDatas[repoIndex];
  
  try {
    const gitPath = `uploads/${fileName}`;
    
    const response = await axios.get(
      `https://api.github.com/repos/${githubData.owner}/${githubData.repo}/contents/${gitPath}?ref=${githubData.branch || 'main'}`,
      {
        headers: {
          Authorization: `Bearer ${githubData.token}`,
          Accept: 'application/vnd.github.v3.raw',
          'User-Agent': 'RulzXD-API'
        },
        responseType: 'arraybuffer',
        timeout: 10000
      }
    );
    
    return {
      success: true,
      data: response.data,
      contentType: mime.lookup(fileName) || 'application/octet-stream'
    };
    
  } catch (error) {
    console.error('Error getting file from GitHub:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

function createPublicUrl(req, fileName, repoIndex) {
  const protocol = getRequestProtocol(req);
  const baseWebUrl = `${protocol}://${req.get('host')}`;
  return `${baseWebUrl}/files/${repoIndex}/${fileName}`;
}

function createSuccessHtml(rawUrl, fileName, fileSize, repoInfo) {
  const fileSizeFormatted = formatFileSize(fileSize);
  const currentTime = formatDate(new Date().toISOString());
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Upload Successful - RulzXD API</title>
  <link rel="icon" href="https://i.ibb.co.com/LzkZDQXg/20251113-150138.png">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css" rel="stylesheet" />
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
  :root {
    --bg-1: #0a1129;
    --bg-2: #0f1a3d;
    --card: rgba(30, 58, 138, 0.15);
    --muted: #93c5fd;
    --accent-from: #2563eb;
    --accent-to: #3b82f6;
    --glass-border: rgba(59, 130, 246, 0.15);
    --text: #e0f2fe;
    --shadow: rgba(2, 8, 30, 0.6);
    --error: #ef4444;
    --success: #22c55e;
  }

  html, body {
    background-color: var(--bg-1);
    font-family: 'Poppins', system-ui, sans-serif;
    background: linear-gradient(180deg, var(--bg-1) 0%, var(--bg-2) 100%);
    color: var(--text);
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }

  .glass {
    background: var(--card);
    border: 1px solid var(--glass-border);
    border-radius: 12px;
  }

  .gradient-text {
    background: linear-gradient(90deg, var(--accent-from), var(--accent-to));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .btn-primary {
    background: linear-gradient(90deg, var(--accent-from), var(--accent-to));
    color: white;
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    font-size: 14px;
  }

  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(37, 99, 235, 0.3);
  }

  .btn-secondary {
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid var(--glass-border);
    color: var(--text);
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s ease;
    font-size: 14px;
  }

  .btn-secondary:hover {
    background: rgba(59, 130, 246, 0.2);
  }

  .copy-btn {
    background: rgba(59, 130, 246, 0.2);
    border: 1px solid rgba(59, 130, 246, 0.4);
    color: #93c5fd;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .copy-btn:hover {
    background: rgba(59, 130, 246, 0.3);
  }

  .copy-btn.copied {
    background: #10b981;
    border-color: #10b981;
    color: white;
  }

  .checkmark {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    display: block;
    stroke-width: 3;
    stroke: #10b981;
    stroke-miterlimit: 10;
    box-shadow: inset 0px 0px 0px #10b981;
    animation: fill .4s ease-in-out .4s forwards, scale .3s ease-in-out .9s both;
    position: relative;
    margin: 0 auto;
    background: rgba(16, 185, 129, 0.1);
  }

  .checkmark__circle {
    stroke-dasharray: 166;
    stroke-dashoffset: 166;
    stroke-width: 3;
    stroke-miterlimit: 10;
    stroke: #10b981;
    fill: none;
    animation: stroke .6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
  }

  .checkmark__check {
    transform-origin: 50% 50%;
    stroke-dasharray: 48;
    stroke-dashoffset: 48;
    animation: stroke .3s cubic-bezier(0.65, 0, 0.45, 1) .8s forwards;
  }

  @keyframes stroke {
    100% { stroke-dashoffset: 0; }
  }

  @keyframes scale {
    0%, 100% { transform: none; }
    50% { transform: scale3d(1.1, 1.1, 1); }
  }

  @keyframes fill {
    100% { box-shadow: inset 0px 0px 0px 40px rgba(16, 185, 129, 0.1); }
  }

  .fade-in {
    animation: fadeIn 0.5s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .url-container {
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 10px;
    padding: 1rem;
    margin: 1rem 0;
    background: rgba(0, 0, 0, 0.2);
    word-break: break-all;
  }
  
  .repo-badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: bold;
    margin-left: 8px;
  }
  
  .repo-1 { background: rgba(37, 99, 235, 0.2); color: #3b82f6; }
  .repo-2 { background: rgba(16, 185, 129, 0.2); color: #10b981; }
  .repo-3 { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
  .repo-4 { background: rgba(168, 85, 247, 0.2); color: #a855f7; }
  </style>
</head>
<body class="flex flex-col items-center justify-center min-h-screen p-4">
  <div class="glass p-8 rounded-xl shadow-2xl w-full max-w-md fade-in">
    <div class="mb-6">
      <div class="checkmark">
        <svg class="checkmark__svg" viewBox="0 0 52 52">
          <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
          <path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
        </svg>
      </div>
    </div>
    
    <h1 class="text-2xl font-bold text-center mb-4 gradient-text">Upload Successful!</h1>
    <div class="text-center mb-6 text-gray-300">
      File <span class="font-semibold">${fileName}</span> (${fileSizeFormatted}) has been uploaded successfully.
      <span class="repo-badge repo-${repoInfo.index + 1}">Repo ${repoInfo.index + 1}</span>
    </div>
    
    <div class="url-container">
      <div class="text-sm text-gray-400 mb-2">Direct URL:</div>
      <div class="font-mono text-sm break-all text-blue-300" id="url-text">${rawUrl}</div>
    </div>
    
    <div class="mb-6 text-sm">
      <div class="flex justify-between mb-1">
        <span class="text-gray-400">File Name:</span>
        <span class="font-medium">${fileName}</span>
      </div>
      <div class="flex justify-between mb-1">
        <span class="text-gray-400">Size:</span>
        <span class="font-medium">${fileSizeFormatted}</span>
      </div>
      <div class="flex justify-between mb-1">
        <span class="text-gray-400">Repository:</span>
        <span class="font-medium">${repoInfo.name} (${repoInfo.index + 1}/4)</span>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-400">Time:</span>
        <span class="font-medium">${currentTime}</span>
      </div>
    </div>
    
    <div class="flex flex-col sm:flex-row gap-3">
      <button onclick="copyUrl()" class="btn-primary flex-1">
        <i class="far fa-copy mr-2"></i> Copy URL
      </button>
      <a href="${rawUrl}" target="_blank" class="btn-secondary flex-1 text-center">
        <i class="fas fa-external-link-alt mr-2"></i> Open File
      </a>
      <a href="/upload" class="btn-secondary flex-1 text-center">
        <i class="fas fa-arrow-left mr-2"></i> Upload Again
      </a>
    </div>
  </div>
  
  <div id="copy-success" class="fixed top-20 right-4 glass border-l-4 border-green-500 px-4 py-3 rounded-lg shadow-lg hidden fade-in z-50 max-w-sm">
    <div class="flex items-center">
      <i class="fas fa-check-circle text-green-500 mr-2"></i>
      <span>URL copied to clipboard!</span>
    </div>
  </div>
  
  <script>
    const rawUrl = "${rawUrl.replace(/"/g, '\\"')}";
    
    function copyUrl() {
      navigator.clipboard.writeText(rawUrl).then(() => {
        const successEl = document.getElementById('copy-success');
        successEl.classList.remove('hidden');
        successEl.classList.add('fade-in');
        
        setTimeout(() => {
          successEl.classList.remove('fade-in');
          setTimeout(() => successEl.classList.add('hidden'), 300);
        }, 3000);
      }).catch(err => {
        console.error('Copy failed:', err);
        const textArea = document.createElement('textarea');
        textArea.value = rawUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        const successEl = document.getElementById('copy-success');
        successEl.classList.remove('hidden');
        successEl.classList.add('fade-in');
        
        setTimeout(() => {
          successEl.classList.remove('fade-in');
          setTimeout(() => successEl.classList.add('hidden'), 300);
        }, 3000);
      });
    }
    
    document.addEventListener('DOMContentLoaded', function() {
      const checkmarkCircle = document.querySelector('.checkmark__circle');
      const checkmarkCheck = document.querySelector('.checkmark__check');
      
      checkmarkCircle.style.strokeDashoffset = '166';
      checkmarkCheck.style.strokeDashoffset = '48';
      
      setTimeout(() => {
        checkmarkCircle.style.animation = 'stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards';
        checkmarkCheck.style.animation = 'stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.8s forwards';
      }, 100);
    });
  </script>
</body>
</html>`;
}

function createErrorHtml(message, code = '') {
  const escapedMessage = (message || 'An error occurred while uploading the file.').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  let errorDetails = '';
  if (code === 'SIZE_LIMIT') {
    errorDetails = '<p class="text-sm text-gray-400 mt-2">Maximum file size: 5MB</p>';
  }
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Upload Failed - RulzXD API</title>
  <link rel="icon" href="https://i.ibb.co.com/LzkZDQXg/20251113-150138.png">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css" rel="stylesheet" />
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
  <style>
  :root {
    --bg-1: #0a1129;
    --bg-2: #0f1a3d;
    --card: rgba(30, 58, 138, 0.15);
    --error: #ef4444;
  }

  html, body {
    background-color: var(--bg-1);
    background: linear-gradient(180deg, var(--bg-1) 0%, var(--bg-2) 100%);
    color: #e0f2fe;
    min-height: 100vh;
    font-family: system-ui, sans-serif;
  }

  .glass {
    background: var(--card);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 12px;
  }

  .fade-in {
    animation: fadeIn 0.5s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  </style>
</head>
<body class="flex flex-col items-center justify-center min-h-screen p-4">
  <div class="glass p-8 rounded-xl shadow-2xl w-full max-w-md fade-in">
    <div class="text-center">
      <div class="text-5xl mb-4 text-red-500">
        <i class="fas fa-exclamation-triangle"></i>
      </div>
      <h1 class="text-2xl font-bold mb-4 text-red-400">Upload Failed</h1>
      <p class="text-gray-300 mb-6">${escapedMessage}</p>
      ${errorDetails}
      <div class="flex flex-col sm:flex-row gap-3 mt-6">
        <a href="/upload" class="bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-lg transition duration-300 text-center">
          <i class="fas fa-arrow-left mr-2"></i> Try Again
        </a>
        <a href="/" class="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-6 rounded-lg transition duration-300 text-center">
          <i class="fas fa-home mr-2"></i> Go Home
        </a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

module.exports = {
  MAX_FILE_SIZE,
  generateId,
  getRequestProtocol,
  formatFileSize,
  formatDate,
  checkRepoSpace,
  getAvailableRepo,
  uploadFileToGithub,
  getAllFilesFromGithub,
  getFileFromGithub,
  createPublicUrl,
  createSuccessHtml,
  createErrorHtml
};