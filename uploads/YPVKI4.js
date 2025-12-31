
class UploadManager {
  constructor() {
    this.nodes = {};
    this.initialize();
  }

  initialize() {
    this.nodes.notificationContainer = document.querySelector('.notification-container');
    this.nodes.fileDropArea = document.getElementById('fileDropArea');
    this.nodes.fileInput = document.getElementById('fileInput');
    this.nodes.previewArea = document.getElementById('previewArea');
    this.nodes.previewContent = document.getElementById('previewContent');
    this.nodes.fileName = document.getElementById('fileName');
    this.nodes.fileSize = document.getElementById('fileSize');
    this.nodes.removeFile = document.getElementById('removeFile');
    this.nodes.uploadButton = document.getElementById('uploadButton');
    this.nodes.cancelButton = document.getElementById('cancelButton');
    this.nodes.loadingIndicator = document.getElementById('loadingIndicator');
    this.nodes.uploadForm = document.getElementById('uploadForm');
    this.nodes.searchInput = document.getElementById('searchInput');
    this.nodes.searchButton = document.getElementById('searchButton');
    this.nodes.clearSearch = document.getElementById('clearSearch');
    this.nodes.searchResults = document.getElementById('searchResults');
    this.nodes.searchLoading = document.getElementById('searchLoading');
    this.nodes.noSearchResults = document.getElementById('noSearchResults');
    this.nodes.filesContainer = document.getElementById('filesContainer');
    this.nodes.totalFiles = document.getElementById('totalFiles');
    this.nodes.totalSize = document.getElementById('totalSize');

    this.setupMobileMenu();
    this.setupFileUpload();
    this.setupSearch();
    this.loadStatistics();
  }

  showNotification(message, type = 'info') {
    const container = this.nodes.notificationContainer;
    if (!container) return;
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    const icon = type === 'success' ? 'check-circle' :
                type === 'error' ? 'exclamation-circle' :
                type === 'warning' ? 'exclamation-triangle' : 'info-circle';

    notification.innerHTML = `
      <div class="flex items-start">
        <i class="fas fa-${icon} mr-2 mt-0.5 ${type === 'success' ? 'text-green-500' : type === 'error' ? 'text-red-500' : type === 'warning' ? 'text-yellow-500' : 'text-blue-500'}"></i>
        <span class="text-xs flex-1">${message}</span>
      </div>
    `;

    container.insertBefore(notification, container.firstChild || null);

    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  setupMobileMenu() {
    const hamb = document.getElementById('hamb');
    const mobileMenu = document.getElementById('mobileMenu');
    const closeMenu = document.getElementById('closeMenu');
    const mobileOverlay = document.getElementById('mobileOverlay');

    hamb?.addEventListener('click', () => {
      hamb.classList.toggle('active');
      mobileMenu.classList.toggle('open');
      mobileOverlay.classList.toggle('active');
      document.body.style.overflow = mobileMenu.classList.contains('open') ? 'hidden' : '';
    });

    closeMenu?.addEventListener('click', () => {
      hamb.classList.remove('active');
      mobileMenu.classList.remove('open');
      mobileOverlay.classList.remove('active');
      document.body.style.overflow = '';
    });

    mobileOverlay?.addEventListener('click', () => {
      hamb.classList.remove('active');
      mobileMenu.classList.remove('open');
      mobileOverlay.classList.remove('active');
      document.body.style.overflow = '';
    });
  }

  setupFileUpload() {
    const dropArea = this.nodes.fileDropArea;
    const fileInput = this.nodes.fileInput;
    const previewArea = this.nodes.previewArea;
    const removeFileBtn = this.nodes.removeFile;
    const uploadForm = this.nodes.uploadForm;

    dropArea.addEventListener('click', () => fileInput.click());

    dropArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropArea.classList.add('dragover');
    });

    dropArea.addEventListener('dragleave', () => {
      dropArea.classList.remove('dragover');
    });

    dropArea.addEventListener('drop', (e) => {
      e.preventDefault();
      dropArea.classList.remove('dragover');
      
      if (e.dataTransfer.files.length) {
        const file = e.dataTransfer.files[0];
        
        if (file.size > 5 * 1024 * 1024) {
          this.showNotification(`Ukuran file melebihi batas 5MB (${this.formatFileSize(file.size)})`, 'error');
          return;
        }
        
        fileInput.files = e.dataTransfer.files;
        this.showFilePreview(file);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) {
        const file = e.target.files[0];
        
        if (file.size > 5 * 1024 * 1024) {
          this.showNotification(`Ukuran file melebihi batas 5MB (${this.formatFileSize(file.size)})`, 'error');
          fileInput.value = '';
          return;
        }
        
        this.showFilePreview(file);
      }
    });

    removeFileBtn.addEventListener('click', () => {
      this.clearFilePreview();
    });

    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (!fileInput.files.length) {
        this.showNotification('Pilih file terlebih dahulu!', 'error');
        return;
      }

      await this.uploadFile();
    });

    this.nodes.cancelButton.addEventListener('click', () => {
      this.clearFilePreview();
    });
  }

  setupSearch() {
    this.nodes.searchButton.addEventListener('click', () => {
      this.searchFiles();
    });

    this.nodes.searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.searchFiles();
      }
    });

    this.nodes.clearSearch.addEventListener('click', () => {
      this.clearSearchResults();
    });
  }

  showFilePreview(file) {
    if (!file) return;

    const previewArea = this.nodes.previewArea;
    const previewContent = this.nodes.previewContent;
    const fileName = this.nodes.fileName;
    const fileSize = this.nodes.fileSize;
    const uploadButton = this.nodes.uploadButton;
    const cancelButton = this.nodes.cancelButton;

    previewArea.classList.remove('hidden');
    previewArea.classList.add('fade-in');

    fileName.textContent = file.name;
    fileSize.textContent = `(${this.formatFileSize(file.size)})`;

    previewContent.innerHTML = '';

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = document.createElement('img');
        img.src = e.target.result;
        img.className = 'file-preview-image';
        img.alt = 'Preview gambar';
        previewContent.appendChild(img);
      };
      reader.readAsDataURL(file);
    } else if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      video.controls = true;
      video.className = 'file-preview-image';
      previewContent.appendChild(video);
    } else if (file.type === 'application/pdf') {
      const pdfIcon = document.createElement('div');
      pdfIcon.className = 'text-center py-4';
      pdfIcon.innerHTML = `
        <div class="text-5xl mb-2 text-red-400">📄</div>
        <p class="text-lg font-medium">Dokumen PDF</p>
        <p class="text-sm text-gray-400">${this.formatFileSize(file.size)}</p>
      `;
      previewContent.appendChild(pdfIcon);
    } else {
      const fileIcon = document.createElement('div');
      fileIcon.className = 'text-center py-4';
      fileIcon.innerHTML = `
        <div class="text-5xl mb-2 text-blue-400">📁</div>
        <p class="text-lg font-medium">${file.type || 'File Tidak Dikenal'}</p>
        <p class="text-sm text-gray-400">${this.formatFileSize(file.size)}</p>
      `;
      previewContent.appendChild(fileIcon);
    }

    uploadButton.disabled = false;
    cancelButton.classList.remove('hidden');
  }

  clearFilePreview() {
    const previewArea = this.nodes.previewArea;
    const fileInput = this.nodes.fileInput;
    const uploadButton = this.nodes.uploadButton;
    const cancelButton = this.nodes.cancelButton;

    previewArea.classList.add('hidden');
    fileInput.value = '';
    uploadButton.disabled = true;
    cancelButton.classList.add('hidden');
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatDate(dateString) {
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

  async loadStatistics() {
    try {
      const response = await fetch('/api/stats', {
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const result = await response.json();

      if (result.status && result.data) {
        this.nodes.totalFiles.textContent = result.data.totalFiles || '0';
        this.nodes.totalSize.textContent = result.data.totalSize || '0 MB';
      }
    } catch (error) {
      console.error('Error loading statistics:', error);
    }
  }

  async searchFiles() {
    const searchTerm = this.nodes.searchInput.value.trim();
    
    if (!searchTerm) {
      this.showNotification('Masukkan nama file untuk mencari', 'warning');
      return;
    }

    this.nodes.searchLoading.classList.remove('hidden');
    this.nodes.noSearchResults.classList.add('hidden');
    this.nodes.filesContainer.innerHTML = '';
    this.nodes.searchResults.classList.remove('hidden');
    this.nodes.clearSearch.classList.remove('hidden');

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchTerm)}`, {
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const result = await response.json();

      this.nodes.searchLoading.classList.add('hidden');

      if (result.status && result.data && result.data.length > 0) {
        this.renderSearchResults(result.data);
      } else {
        this.nodes.noSearchResults.classList.remove('hidden');
      }
    } catch (error) {
      console.error('Error searching files:', error);
      this.nodes.searchLoading.classList.add('hidden');
      this.showNotification('Gagal mencari file', 'error');
    }
  }

  renderSearchResults(files) {
    const container = this.nodes.filesContainer;
    
    let html = '';

    files.forEach((file) => {
      const fileIcon = this.getFileIcon(file.type);
      const fileSize = this.formatFileSize(file.size);
      const uploadDate = this.formatDate(file.uploaded_at);
      const fileName = file.custom_name || file.original_name;
      
      const publicUrl = `${window.location.origin}/files/${file.repo_index}/${file.file_name}`;

      html += `
        <div class="file-item fade-in">
          <div class="flex items-start justify-between">
            <div class="flex items-start">
              <div class="file-icon text-blue-400">
                ${fileIcon}
              </div>
              <div class="flex-1">
                <div class="flex items-center">
                  <h4 class="font-bold text-white text-sm md:text-base">${this.escapeHtml(fileName)}</h4>
                </div>
                <div class="flex flex-wrap gap-3 mt-2 text-xs text-gray-400">
                  <span><i class="fas fa-hdd mr-1"></i> ${fileSize}</span>
                  <span><i class="far fa-calendar mr-1"></i> ${uploadDate}</span>
                  <span><i class="fas fa-file mr-1"></i> ${file.type || 'Tidak Dikenal'}</span>
                </div>
                <div class="mt-3">
                  <div class="text-xs text-blue-300 bg-black/20 p-2 rounded break-all mb-2">
                    ${this.escapeHtml(publicUrl)}
                  </div>
                  <div class="flex gap-2">
                    <button class="copy-btn copy-url-btn" data-url="${this.escapeAttr(publicUrl)}">
                      <i class="far fa-copy"></i> Copy URL
                    </button>
                    <a href="${this.escapeAttr(publicUrl)}" target="_blank" class="copy-btn">
                      <i class="fas fa-external-link-alt"></i> Buka
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    this.setupCopyButtons();
  }

  clearSearchResults() {
    this.nodes.searchInput.value = '';
    this.nodes.searchResults.classList.add('hidden');
    this.nodes.clearSearch.classList.add('hidden');
    this.nodes.filesContainer.innerHTML = '';
  }

  getFileIcon(fileType) {
    if (fileType.startsWith('image/')) return '<i class="fas fa-image"></i>';
    if (fileType.startsWith('video/')) return '<i class="fas fa-video"></i>';
    if (fileType.startsWith('audio/')) return '<i class="fas fa-music"></i>';
    if (fileType === 'application/pdf') return '<i class="fas fa-file-pdf"></i>';
    if (fileType.includes('text')) return '<i class="fas fa-file-alt"></i>';
    if (fileType.includes('zip') || fileType.includes('compressed')) return '<i class="fas fa-file-archive"></i>';
    return '<i class="fas fa-file"></i>';
  }

  setupCopyButtons() {
    document.querySelectorAll('.copy-url-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = btn.getAttribute('data-url');
        navigator.clipboard.writeText(url).then(() => {
          this.showCopyFeedback(btn, 'URL Disalin!');
        }).catch(err => {
          console.error('Copy failed:', err);
        });
      });
    });
  }

  showCopyFeedback(button, message) {
    const originalHTML = button.innerHTML;
    button.innerHTML = `<i class="fas fa-check"></i> ${message}`;
    button.classList.add('copied');

    setTimeout(() => {
      button.innerHTML = originalHTML;
      button.classList.remove('copied');
    }, 2000);
  }

  async uploadFile() {
    const fileInput = this.nodes.fileInput;
    const fileNameInput = document.getElementById('fileNameInput');
    const uploadButton = this.nodes.uploadButton;
    const loadingIndicator = this.nodes.loadingIndicator;

    if (!fileInput.files.length) {
      this.showNotification('Pilih file terlebih dahulu!', 'error');
      return;
    }

    const file = fileInput.files[0];
    if (file.size > 5 * 1024 * 1024) {
      this.showNotification(`Ukuran file melebihi batas 5MB (${this.formatFileSize(file.size)})`, 'error');
      return;
    }

    uploadButton.disabled = true;
    loadingIndicator.classList.remove('hidden');

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (fileNameInput.value.trim()) {
        formData.append('filename', fileNameInput.value.trim());
      }

      const response = await fetch('/uploadfile', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      
      document.open();
      document.write(html);
      document.close();
      
    } catch (error) {
      console.error('Upload error:', error);
      this.showNotification('Gagal mengupload file: ' + error.message, 'error');
      uploadButton.disabled = false;
      loadingIndicator.classList.add('hidden');
    }
  }

  escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
  
  escapeAttr(str) {
    return this.escapeHtml(str).replaceAll('"', '&quot;');
  }
}

document.addEventListener('DOMContentLoaded', function() {
  window.uploadManager = new UploadManager();
});