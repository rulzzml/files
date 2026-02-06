// viewer.js - File Viewer JavaScript
class FileViewer {
    constructor() {
        this.nodes = {};
        this.fileData = null;
        this.fileUrl = null;
        this.initialize();
    }

    initialize() {
        this.nodes.notificationContainer = document.querySelector('.notification-container');
        this.nodes.passwordPrompt = document.getElementById('passwordPrompt');
        this.nodes.fileContent = document.getElementById('fileContent');
        this.nodes.errorMessage = document.getElementById('errorMessage');
        this.nodes.loading = document.getElementById('loading');
        this.nodes.accessPassword = document.getElementById('accessPassword');
        this.nodes.submitPassword = document.getElementById('submitPassword');
        this.nodes.passwordError = document.getElementById('passwordError');
        this.nodes.fileNamePrompt = document.getElementById('fileNamePrompt');
        
        // File info elements
        this.nodes.fileNameTitle = document.getElementById('fileNameTitle');
        this.nodes.fileVisibilityBadge = document.getElementById('fileVisibilityBadge');
        this.nodes.fileType = document.getElementById('fileType');
        this.nodes.fileSize = document.getElementById('fileSize');
        this.nodes.uploadDate = document.getElementById('uploadDate');
        this.nodes.repoInfo = document.getElementById('repoInfo');
        this.nodes.filePreview = document.getElementById('filePreview');
        
        // URL elements
        this.nodes.directUrl = document.getElementById('directUrl');
        this.nodes.viewerUrl = document.getElementById('viewerUrl');
        this.nodes.copyUrlBtn = document.getElementById('copyUrlBtn');
        this.nodes.downloadBtn = document.getElementById('downloadBtn');
        
        // URL Parameters
        this.urlParams = new URLSearchParams(window.location.search);
        this.fileName = this.urlParams.get('file');
        this.repoIndex = this.urlParams.get('repo');
        
        // Initialize
        this.setupMobileMenu();
        this.setupEventListeners();
        
        // Check file
        if (this.fileName && this.repoIndex) {
            this.checkFileAccess();
        } else {
            this.showError('Parameter file tidak valid');
        }
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

    setupEventListeners() {
        // Password submit
        this.nodes.submitPassword?.addEventListener('click', () => this.submitPassword());
        this.nodes.accessPassword?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.submitPassword();
        });

        // Download button
        this.nodes.downloadBtn?.addEventListener('click', () => this.downloadFile());

        // Copy URL button
        this.nodes.copyUrlBtn?.addEventListener('click', () => this.copyViewerUrl());
    }

    showNotification(message, type = 'info') {
        const container = this.nodes.notificationContainer;
        if (!container) {
            alert(message);
            return;
        }
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;

        const icon = type === 'success' ? 'check-circle' :
                    type === 'error' ? 'exclamation-circle' :
                    type === 'warning' ? 'exclamation-triangle' : 'info-circle';

        notification.innerHTML = `
            <div class="flex items-start">
                <i class="fas fa-${icon} mr-2 mt-0.5 ${type === 'success' ? 'text-green-500' : type === 'error' ? 'text-red-500' : type === 'warning' ? 'text-yellow-500' : 'text-blue-500'}"></i>
                <span class="text-xs flex-1">${message}</span>
                <button class="ml-2 text-gray-300 hover:text-white" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times text-xs"></i>
                </button>
            </div>
        `;

        container.insertBefore(notification, container.firstChild);

        setTimeout(() => {
            if (notification.parentElement) {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => notification.remove(), 300);
            }
        }, 3000);
    }

    async checkFileAccess() {
        try {
            const response = await fetch(`/api/file-info?file=${this.fileName}&repo=${this.repoIndex}`);
            const data = await response.json();
            
            if (data.success) {
                this.fileData = data.data;
                
                // Set file URL
                this.fileUrl = `/files/${this.repoIndex}/${this.fileName}`;
                
                if (this.fileData.isPrivate) {
                    // Show password prompt
                    this.nodes.loading.classList.add('hidden');
                    this.nodes.passwordPrompt.classList.remove('hidden');
                    this.nodes.fileNamePrompt.textContent = this.fileData.file_name;
                    
                    // Focus password input
                    setTimeout(() => {
                        this.nodes.accessPassword?.focus();
                    }, 100);
                } else {
                    // Show file directly
                    this.showFileContent();
                }
            } else {
                this.showError('File tidak ditemukan');
            }
        } catch (error) {
            console.error('Error:', error);
            this.showError('Gagal memuat file');
        }
    }

    async submitPassword() {
        const password = this.nodes.accessPassword?.value;
        
        if (!password || password.length < 4) {
            this.showPasswordError('Password minimal 4 karakter');
            return;
        }
        
        try {
            const response = await fetch(`/api/verify-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    file: this.fileName,
                    repo: this.repoIndex,
                    password: password
                })
            });
            
            const data = await response.json();
            
            if (data.success && data.access_granted) {
                this.showFileContent();
            } else {
                this.showPasswordError(data.message || 'Password salah');
            }
        } catch (error) {
            this.showPasswordError('Terjadi kesalahan');
        }
    }

    showPasswordError(message) {
        this.nodes.passwordError.classList.remove('hidden');
        document.getElementById('errorMessage').textContent = message;
        
        // Clear password field
        this.nodes.accessPassword.value = '';
        this.nodes.accessPassword.focus();
        
        // Auto hide error after 3 seconds
        setTimeout(() => {
            this.nodes.passwordError.classList.add('hidden');
        }, 3000);
    }

    showFileContent() {
        this.nodes.loading.classList.add('hidden');
        this.nodes.passwordPrompt.classList.add('hidden');
        this.nodes.fileContent.classList.remove('hidden');
        
        // Set file info
        this.nodes.fileNameTitle.textContent = this.fileData.file_name;
        this.nodes.fileType.textContent = this.fileData.type.toUpperCase();
        this.nodes.fileSize.textContent = this.formatFileSize(this.fileData.size);
        this.nodes.uploadDate.textContent = new Date(this.fileData.uploaded_at).toLocaleDateString('id-ID');
        this.nodes.repoInfo.textContent = `Repo ${parseInt(this.repoIndex) + 1}`;
        
        // Set visibility badge
        if (this.fileData.isPrivate) {
            this.nodes.fileVisibilityBadge.className = 'badge badge-private';
            this.nodes.fileVisibilityBadge.innerHTML = '<i class="fas fa-lock"></i> PRIVATE';
        } else {
            this.nodes.fileVisibilityBadge.className = 'badge badge-public';
            this.nodes.fileVisibilityBadge.innerHTML = '<i class="fas fa-globe"></i> PUBLIC';
        }
        
        // Set URLs
        const baseUrl = window.location.origin;
        this.nodes.directUrl.value = `${baseUrl}${this.fileUrl}`;
        this.nodes.viewerUrl.value = window.location.href;
        
        // Load preview
        this.loadFilePreview();
    }

    async loadFilePreview() {
        try {
            const response = await fetch(this.fileUrl);
            
            if (!response.ok) {
                throw new Error('Gagal memuat file');
            }
            
            if (this.fileData.type === 'image') {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                this.nodes.filePreview.innerHTML = `
                    <img src="${url}" alt="${this.fileData.file_name}" class="preview-image mx-auto">
                `;
            } else if (this.fileData.type === 'video') {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                this.nodes.filePreview.innerHTML = `
                    <video controls class="preview-video mx-auto">
                        <source src="${url}" type="video/mp4">
                        Browser Anda tidak mendukung tag video.
                    </video>
                `;
            } else if (this.fileData.type === 'audio') {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                this.nodes.filePreview.innerHTML = `
                    <audio controls class="preview-audio mx-auto">
                        <source src="${url}" type="audio/mpeg">
                        Browser Anda tidak mendukung tag audio.
                    </audio>
                `;
            } else if (this.fileData.type === 'document') {
                if (this.fileData.file_name.endsWith('.pdf')) {
                    const blob = await response.blob();
                    const url = URL.createObjectURL(blob);
                    this.nodes.filePreview.innerHTML = `
                        <iframe src="${url}" class="preview-document w-full"></iframe>
                    `;
                } else {
                    this.nodes.filePreview.innerHTML = `
                        <div class="py-8">
                            <i class="fas fa-file-alt file-icon-big"></i>
                            <p class="text-lg font-medium mb-2">File Dokumen</p>
                            <p class="text-gray-400 mb-4">${this.fileData.file_name}</p>
                            <p class="text-sm text-gray-500">Gunakan tombol download untuk melihat file</p>
                        </div>
                    `;
                }
            } else {
                this.nodes.filePreview.innerHTML = `
                    <div class="py-8">
                        <i class="fas fa-file file-icon-big"></i>
                        <p class="text-lg font-medium mb-2">${this.fileData.file_name}</p>
                        <p class="text-gray-400 mb-4">File ${this.fileData.type.toUpperCase()}</p>
                        <p class="text-sm text-gray-500">Gunakan tombol download untuk mengakses file</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading preview:', error);
            this.nodes.filePreview.innerHTML = `
                <div class="py-8 text-center">
                    <i class="fas fa-exclamation-triangle text-4xl text-red-400 mb-4"></i>
                    <p class="text-lg font-medium mb-2">Gagal memuat preview</p>
                    <p class="text-gray-400">${error.message}</p>
                </div>
            `;
        }
    }

    async downloadFile() {
        try {
            const a = document.createElement('a');
            a.href = `${this.fileUrl}?download=true`;
            a.download = this.fileData.file_name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            this.showNotification('Download dimulai', 'success');
        } catch (error) {
            this.showNotification('Gagal mengunduh file', 'error');
        }
    }

    copyViewerUrl() {
        navigator.clipboard.writeText(window.location.href).then(() => {
            this.showNotification('URL viewer berhasil disalin', 'success');
        }).catch(err => {
            console.error('Copy failed:', err);
            this.showNotification('Gagal menyalin URL', 'error');
        });
    }

    showError(message) {
        this.nodes.loading.classList.add('hidden');
        this.nodes.passwordPrompt.classList.add('hidden');
        this.nodes.fileContent.classList.add('hidden');
        this.nodes.errorMessage.classList.remove('hidden');
        
        const errorText = this.nodes.errorMessage.querySelector('h2');
        if (errorText) errorText.textContent = message;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Global functions for sharing
function copyDirectUrl() {
    const url = document.getElementById('directUrl')?.value;
    if (url) {
        navigator.clipboard.writeText(url).then(() => {
            if (window.fileViewer) {
                window.fileViewer.showNotification('URL langsung berhasil disalin', 'success');
            }
        });
    }
}

function copyViewerUrl() {
    const url = document.getElementById('viewerUrl')?.value;
    if (url) {
        navigator.clipboard.writeText(url).then(() => {
            if (window.fileViewer) {
                window.fileViewer.showNotification('URL viewer berhasil disalin', 'success');
            }
        });
    }
}

function shareToWhatsApp() {
    const url = encodeURIComponent(window.location.href);
    window.open(`https://wa.me/?text=${url}`, '_blank');
}

function shareToTelegram() {
    const url = encodeURIComponent(window.location.href);
    window.open(`https://t.me/share/url?url=${url}`, '_blank');
}

function shareToFacebook() {
    const url = encodeURIComponent(window.location.href);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
}

function copyEmbedCode() {
    const embedCode = `<iframe src="${window.location.href}" width="100%" height="500" frameborder="0"></iframe>`;
    const embedSection = document.getElementById('embedSection');
    const embedTextarea = document.getElementById('embedCode');
    
    if (embedTextarea) {
        embedTextarea.value = embedCode;
        if (embedSection) embedSection.classList.remove('hidden');
        embedTextarea.select();
        document.execCommand('copy');
        
        if (window.fileViewer) {
            window.fileViewer.showNotification('Kode embed disalin', 'success');
        }
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
    window.fileViewer = new FileViewer();
});