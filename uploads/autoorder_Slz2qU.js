// upload-manager.js
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
    this.nodes.visibilityRadios = document.querySelectorAll('input[name="visibility"]');
    this.nodes.passwordField = document.getElementById('passwordField');
    this.nodes.filePassword = document.getElementById('filePassword');

    this.setupMobileMenu();
    this.setupFileUpload();
    this.setupSearch();
    this.setupVisibilityToggle();
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

  setupVisibilityToggle() {
    const visibilityRadios = this.nodes.visibilityRadios;
    const passwordField = this.nodes.passwordField;
    const filePassword = this.nodes.filePassword;

    if (!visibilityRadios || !passwordField || !filePassword) return;

    visibilityRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.value === 'private') {
          passwordField.classList.remove('hidden');
          filePassword.required = true;
        } else {
          passwordField.classList.add('hidden');
          filePassword.required = false;
          filePassword.value = '';
        }
      });
    });
  }

  setupFileUpload() {
    const dropArea = this.nodes.fileDropArea;
    const fileInput = this.nodes.fileInput;
    const removeFileBtn = this.nodes.removeFile;
    const uploadForm = this.nodes.uploadForm;

    if (!dropArea || !fileInput || !uploadForm) return;

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

    if (removeFileBtn) {
      removeFileBtn.addEventListener('click', () => {
        this.clearFilePreview();
      });
    }

    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (!fileInput.files.length) {
        this.showNotification('Pilih file terlebih dahulu!', 'error');
        return;
      }

      await this.uploadFile();
    });

    if (this.nodes.cancelButton) {
      this.nodes.cancelButton.addEventListener('click', () => {
        this.clearFilePreview();
      });
    }
  }

  setupSearch() {
    const searchButton = this.nodes.searchButton;
    const searchInput = this.nodes.searchInput;
    const clearSearch = this.nodes.clearSearch;

    if (searchButton) {
      searchButton.addEventListener('click', () => {
        this.searchFiles();
      });
    }

    if (searchInput) {
      searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.searchFiles();
        }
      });
    }

    if (clearSearch) {
      clearSearch.addEventListener('click', () => {
        this.clearSearchResults();
      });
    }
  }

  showFilePreview(file) {
    if (!file) return;

    const previewArea = this.nodes.previewArea;
    const previewContent = this.nodes.previewContent;
    const fileName = this.nodes.fileName;
    const fileSize = this.nodes.fileSize;
    const uploadButton = this.nodes.uploadButton;
    const cancelButton = this.nodes.cancelButton;

    if (!previewArea || !previewContent || !fileName || !fileSize || !uploadButton || !cancelButton) return;

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
      video.className = 'file-preview-video max-h-64';
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

    if (!previewArea || !fileInput || !uploadButton || !cancelButton) return;

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
        if (this.nodes.totalFiles) {
          this.nodes.totalFiles.textContent = result.data.totalFiles || '0';
        }
        if (this.nodes.totalSize) {
          this.nodes.totalSize.textContent = result.data.totalSize || '0 MB';
        }
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
      const fileName = file.custom_name || file.original_name || file.file_name;
      
      // Tentukan apakah file private atau public
      const isPrivate = file.isPrivate || false;
      const visibilityClass = isPrivate ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300';
      const visibilityText = isPrivate ? 'PRIVATE' : 'PUBLIC';
      
      const publicUrl = `${window.location.origin}/files/${file.repo_index}/${file.file_name}`;
      const viewerUrl = `/viewer.html?file=${encodeURIComponent(file.file_name)}&repo=${file.repo_index}`;

      html += `
        <div class="file-item fade-in">
          <div class="flex flex-col sm:flex-row sm:items-start justify-between p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
            <div class="flex items-start mb-3 sm:mb-0">
              <div class="file-icon text-blue-400 mr-3 text-lg">
                ${fileIcon}
              </div>
              <div class="flex-1">
                <div class="flex items-center mb-2">
                  <h4 class="font-bold text-white text-sm md:text-base mr-3">${this.escapeHtml(fileName)}</h4>
                  <span class="px-2 py-0.5 rounded-full text-xs ${visibilityClass}">
                    ${visibilityText}
                  </span>
                </div>
                <div class="flex flex-wrap gap-3 text-xs text-gray-400">
                  <span><i class="fas fa-hdd mr-1"></i> ${fileSize}</span>
                  <span><i class="far fa-calendar mr-1"></i> ${uploadDate}</span>
                  <span><i class="fas fa-box mr-1"></i> Repo ${file.repo_index + 1}</span>
                </div>
                <div class="mt-3">
                  <div class="text-xs text-blue-300 bg-black/20 p-2 rounded break-all mb-2">
                    ${this.escapeHtml(publicUrl)}
                  </div>
                </div>
              </div>
            </div>
            <div class="flex gap-2 self-end sm:self-center">
              <button class="copy-btn copy-url-btn px-3 py-1 text-xs" data-url="${this.escapeAttr(publicUrl)}">
                <i class="far fa-copy mr-1"></i> Copy URL
              </button>
              <a href="${this.escapeAttr(viewerUrl)}" target="_blank" class="copy-btn px-3 py-1 text-xs">
                <i class="fas fa-external-link-alt mr-1"></i> Lihat
              </a>
              <button class="copy-btn px-3 py-1 text-xs bg-purple-500/20 hover:bg-purple-500/30" onclick="viewFile('${this.escapeAttr(file.file_name)}', ${file.repo_index})">
                <i class="fas fa-eye mr-1"></i> Preview
              </button>
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
    if (!fileType) return '<i class="fas fa-file"></i>';
    if (fileType.startsWith('image/')) return '<i class="fas fa-image"></i>';
    if (fileType.startsWith('video/')) return '<i class="fas fa-video"></i>';
    if (fileType.startsWith('audio/')) return '<i class="fas fa-music"></i>';
    if (fileType === 'application/pdf') return '<i class="fas fa-file-pdf"></i>';
    if (fileType.includes('text')) return '<i class="fas fa-file-alt"></i>';
    if (fileType.includes('zip') || fileType.includes('compressed')) return '<i class="fas fa-file-archive"></i>';
    if (fileType.includes('word') || fileType.includes('document')) return '<i class="fas fa-file-word"></i>';
    if (fileType.includes('excel') || fileType.includes('spreadsheet')) return '<i class="fas fa-file-excel"></i>';
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
          this.showNotification('Gagal menyalin URL', 'error');
        });
      });
    });
  }

  showCopyFeedback(button, message) {
    const originalHTML = button.innerHTML;
    const originalClass = button.className;
    button.innerHTML = `<i class="fas fa-check"></i> ${message}`;
    button.className = originalClass.replace('bg-blue-500/20', 'bg-green-500/20');

    setTimeout(() => {
      button.innerHTML = originalHTML;
      button.className = originalClass;
    }, 2000);
  }
  
  // Di metode uploadFile() di upload-manager.js, ganti:
async uploadFile() {
  const fileInput = this.nodes.fileInput;
    const fileNameInput = document.getElementById('fileNameInput');
    const uploadButton = this.nodes.uploadButton;
    const loadingIndicator = this.nodes.loadingIndicator;
    const visibilityRadios = this.nodes.visibilityRadios;
    const filePassword = this.nodes.filePassword;

    if (!fileInput.files.length) {
      this.showNotification('Pilih file terlebih dahulu!', 'error');
      return;
    }

    const file = fileInput.files[0];
    if (file.size > 5 * 1024 * 1024) {
      this.showNotification(`Ukuran file melebihi batas 5MB (${this.formatFileSize(file.size)})`, 'error');
      return;
    }

    // Cek apakah private tapi password kosong
    let visibility = 'public';
    let password = null;
    
    if (visibilityRadios) {
      const selectedVisibility = Array.from(visibilityRadios).find(radio => radio.checked);
      if (selectedVisibility) {
        visibility = selectedVisibility.value;
        
        if (visibility === 'private' && filePassword) {
          password = filePassword.value.trim();
          if (!password || password.length < 4) {
            this.showNotification('Password harus minimal 4 karakter untuk file private', 'error');
            return;
          }
        }
      }
    }

    uploadButton.disabled = true;
    loadingIndicator.classList.remove('hidden');
    
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    if (fileNameInput && fileNameInput.value.trim()) {
      formData.append('filename', fileNameInput.value.trim());
    }
    
    formData.append('visibility', visibility);
    if (password) {
      formData.append('password', password);
    }

    // Gunakan endpoint yang benar
    const response = await fetch('/api/upload-with-metadata', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }

    const result = await response.json();
    
    if (result.success) {
      this.showNotification('File berhasil diupload!', 'success');
      
      // Redirect ke viewer jika ada URL
        if (result.data && result.data.viewer_url) {
          setTimeout(() => {
            window.open(result.data.viewer_url, '_blank');
          }, 1000);
        }
        
        // Reset form
        this.clearFilePreview();
        if (fileNameInput) fileNameInput.value = '';
        if (filePassword) filePassword.value = '';
        
        // Reset radio button ke public
        if (visibilityRadios) {
          const publicRadio = Array.from(visibilityRadios).find(radio => radio.value === 'public');
          if (publicRadio) {
            publicRadio.checked = true;
            if (this.nodes.passwordField) {
              this.nodes.passwordField.classList.add('hidden');
            }
          }
        }
        
        // Refresh statistics
        this.loadStatistics();
    } else {
      throw new Error(result.message || 'Upload gagal');
    }
    
  } catch (error) {
    console.error('Upload error:', error);
    this.showNotification('Gagal mengupload file: ' + error.message, 'error');
  } finally {
    uploadButton.disabled = false;
    loadingIndicator.classList.add('hidden');
  }
}

  escapeHtml(str) {
    if (str === undefined || str === null) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  
  escapeAttr(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }
}

// Fungsi helper global untuk melihat file
function viewFile(fileName, repoIndex) {
  const viewerUrl = `/viewer.html?file=${encodeURIComponent(fileName)}&repo=${repoIndex}`;
  window.open(viewerUrl, '_blank');
}

// Fungsi helper global untuk copy URL
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    if (window.uploadManager) {
      window.uploadManager.showNotification('URL berhasil disalin', 'success');
    } else {
      alert('URL berhasil disalin');
    }
  }).catch(err => {
    console.error('Copy failed:', err);
    alert('Gagal menyalin URL');
  });
}

// Di dalam upload-manager.js atau tambahkan di akhir uploader.html sebelum </body>
document.addEventListener('DOMContentLoaded', function() {
  // Handle visibility radio buttons
  const visibilityRadios = document.querySelectorAll('input[name="visibility"]');
  const passwordField = document.getElementById('passwordField');
  const filePasswordInput = document.getElementById('filePassword');
  
  visibilityRadios.forEach(radio => {
    radio.addEventListener('change', function() {
      if (this.value === 'private') {
        passwordField.classList.remove('hidden');
        filePasswordInput.required = true;
      } else {
        passwordField.classList.add('hidden');
        filePasswordInput.required = false;
        filePasswordInput.value = '';
      }
    });
  });
  
  // Handle upload form submission
  const uploadForm = document.getElementById('uploadForm');
  const uploadButton = document.getElementById('uploadButton');
  const cancelButton = document.getElementById('cancelButton');
  
  uploadForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const fileInput = document.getElementById('fileInput');
    const fileNameInput = document.getElementById('fileNameInput');
    const visibility = document.querySelector('input[name="visibility"]:checked').value;
    const password = filePasswordInput.value;
    
    if (!fileInput.files[0]) {
      showNotification('Pilih file terlebih dahulu', 'error');
      return;
    }
    
    if (visibility === 'private' && (!password || password.length < 4)) {
      showNotification('Password harus minimal 4 karakter untuk file private', 'error');
      return;
    }
    
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('filename', fileNameInput.value);
    formData.append('visibility', visibility);
    formData.append('password', password);
    
    // Show loading
    uploadButton.disabled = true;
    document.getElementById('loadingIndicator').classList.remove('hidden');
    
    try {
      const response = await fetch('/api/upload-with-metadata', {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success) {
        showNotification('File berhasil diupload!', 'success');
        
        // Show file info
        const fileData = result.data;
        const html = `
          <div class="p-4 rounded-lg bg-green-500/10 border border-green-500/20 mb-4">
            <h3 class="font-bold text-lg mb-2">File Uploaded Successfully!</h3>
            <div class="space-y-2 text-sm">
              <p><strong>Nama:</strong> ${fileData.file.name}</p>
              <p><strong>Tipe:</strong> ${fileData.file.type}</p>
              <p><strong>Ukuran:</strong> ${(fileData.file.size / 1024).toFixed(2)} KB</p>
              <p><strong>Visibilitas:</strong> ${fileData.file.isPrivate ? 'Private' : 'Public'}</p>
              <p><strong>URL:</strong> <a href="${fileData.public_url}" target="_blank" class="text-blue-400 hover:underline">${fileData.public_url}</a></p>
              <p><strong>Viewer:</strong> <a href="${fileData.viewer_url}" target="_blank" class="text-blue-400 hover:underline">Lihat File</a></p>
              ${fileData.file.isPrivate ? '<p class="text-yellow-400"><i class="fas fa-lock mr-1"></i> File ini dilindungi password</p>' : ''}
            </div>
          </div>
        `;
        
        // Insert success message
        const uploadSection = document.querySelector('.upload-section');
        const existingSuccess = uploadSection.querySelector('.upload-success');
        if (existingSuccess) existingSuccess.remove();
        
        const successDiv = document.createElement('div');
        successDiv.className = 'upload-success';
        successDiv.innerHTML = html;
        uploadSection.insertBefore(successDiv, uploadSection.firstChild.nextSibling);
        
        // Reset form
        uploadForm.reset();
        document.getElementById('previewArea').classList.add('hidden');
        fileInput.value = '';
        passwordField.classList.add('hidden');
        
      } else {
        showNotification(result.message || 'Upload gagal', 'error');
      }
    } catch (error) {
      showNotification('Terjadi kesalahan: ' + error.message, 'error');
    } finally {
      uploadButton.disabled = false;
      document.getElementById('loadingIndicator').classList.add('hidden');
    }
  });
  
  // Notification function
  function showNotification(message, type = 'success') {
    const container = document.querySelector('.notification-container');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <div class="flex items-center justify-between">
        <span>${message}</span>
        <button onclick="this.parentElement.parentElement.remove()" class="ml-4">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;
    
    container.appendChild(notification);
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 3000);
  }
});

// Inisialisasi saat DOM siap
document.addEventListener('DOMContentLoaded', function() {
  window.uploadManager = new UploadManager();
});

// Export untuk penggunaan modular (jika diperlukan)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { UploadManager, viewFile, copyToClipboard };
}