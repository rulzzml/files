
        const togglePassword = document.getElementById('togglePassword');
        const passwordInput = document.getElementById('password');

        if (togglePassword && passwordInput) {
            togglePassword.addEventListener('click', function() {
                const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                passwordInput.setAttribute('type', type);
                
                // Toggle eye icon
                const icon = this.querySelector('i');
                if (type === 'password') {
                    icon.classList.remove('fa-eye-slash');
                    icon.classList.add('fa-eye');
                } else {
                    icon.classList.remove('fa-eye');
                    icon.classList.add('fa-eye-slash');
                }
            });
        }

        // Check if already logged in
        document.addEventListener('DOMContentLoaded', function() {
            checkSession();
            setupForm();
            addGlowEffect();
            updateCopyright();
        });

        async function checkSession() {
            try {
                const response = await fetch('/api/check-session');
                const data = await response.json();
                
                if (data.loggedIn) {
                    // Redirect to dashboard if already logged in
                    window.location.href = '/dashboard-admin';
                }
            } catch (error) {
                // Ignore error, continue with login form
                console.log('Session check skipped');
            }
        }

        function setupForm() {
            const loginForm = document.getElementById('loginForm');
            const loginBtn = document.getElementById('loginBtn');
            const btnText = document.getElementById('btnText');
            const loadingSpinner = document.getElementById('loadingSpinner');
            const errorAlert = document.getElementById('errorAlert');
            const errorMessage = document.getElementById('errorMessage');

            // Auto-focus username field
            setTimeout(() => {
                const usernameField = document.getElementById('username');
                if (usernameField) {
                    usernameField.focus();
                }
            }, 300);

            loginForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                
                const username = document.getElementById('username').value.trim();
                const password = document.getElementById('password').value;
                
                // Validate inputs
                if (!username || !password) {
                    showError('Username dan password harus diisi!');
                    return;
                }
                
                // Hide previous error
                hideError();
                
                // Show loading state
                loginBtn.disabled = true;
                btnText.textContent = 'Authenticating...';
                loadingSpinner.style.display = 'inline-block';
                
                // Add pulse animation
                loginForm.classList.remove('shake');
                void loginForm.offsetWidth; // Trigger reflow
                loginForm.classList.add('pulse');
                
                try {
                    const response = await fetch('/api/login', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ username, password })
                    });
                    
                    const data = await response.json();
                    
                    if (response.ok && data.success) {
                        // Success - redirect to dashboard
                        loginBtn.classList.add('pulse');
                        setTimeout(() => {
                            window.location.href = '/dashboard-admin';
                        }, 500);
                    } else {
                        // Show error with shake animation
                        showError(data.message || 'Login gagal!');
                        loginForm.classList.remove('pulse');
                        loginForm.classList.add('shake');
                        
                        // Reset button
                        resetLoginButton();
                    }
                } catch (error) {
                    console.error('Login error:', error);
                    showError('Terjadi kesalahan pada server. Coba lagi.');
                    loginForm.classList.remove('pulse');
                    loginForm.classList.add('shake');
                    
                    // Reset button
                    resetLoginButton();
                }
            });

            function showError(message) {
                errorMessage.textContent = message;
                errorAlert.classList.add('show');
            }

            function hideError() {
                errorAlert.classList.remove('show');
            }

            function resetLoginButton() {
                loginBtn.disabled = false;
                btnText.textContent = 'Login';
                loadingSpinner.style.display = 'none';
            }
        }

        function addGlowEffect() {
            const inputs = document.querySelectorAll('.form-input');
            inputs.forEach(input => {
                input.addEventListener('focus', function() {
                    this.parentElement.classList.add('pulse');
                });
                
                input.addEventListener('blur', function() {
                    this.parentElement.classList.remove('pulse');
                });
            });
        }

        function showInfo() {
            const info = `
                <div style="padding: 1.5rem; max-width: 400px;">
                    <h3 style="color: var(--text); margin-bottom: 1rem; font-size: 1.2rem; display: flex; align-items: center; gap: 0.5rem;">
                        <i class="fas fa-info-circle" style="color: var(--accent-from);"></i>
                        System Information
                    </h3>
                    <div style="color: var(--muted); font-size: 0.9rem; line-height: 1.6;">
                        <p>🔐 <strong>Secure Admin Panel</strong></p>
                        <p>• Session-based authentication</p>
                        <p>• File management system</p>
                        <p>• API monitoring</p>
                        <p>• Real-time statistics</p>
                        <br>
                        <p>📞 <strong>Support Contacts:</strong></p>
                        <p>• Telegram: @rulzzofficial</p>
                        <p>• Email: rulzzofficial628@gmail.com</p>
                    </div>
                </div>
            `;
            
            alertCustom(info, 'info');
        }

        function alertCustom(content, type = 'info') {
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
                backdrop-filter: blur(8px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2000;
                padding: 20px;
                animation: fadeIn 0.3s ease;
            `;
            
            const modalContent = document.createElement('div');
            modalContent.style.cssText = `
                background: var(--card);
                border: 1px solid var(--glass-border);
                border-radius: 16px;
                backdrop-filter: blur(20px);
                animation: slideUp 0.3s ease;
            `;
            
            modalContent.innerHTML = content;
            
            const closeBtn = document.createElement('button');
            closeBtn.style.cssText = `
                position: absolute;
                top: 1rem;
                right: 1rem;
                background: none;
                border: none;
                color: var(--muted);
                font-size: 1.5rem;
                cursor: pointer;
                padding: 0.25rem;
            `;
            closeBtn.innerHTML = '×';
            closeBtn.onclick = () => document.body.removeChild(modal);
            
            modalContent.appendChild(closeBtn);
            modal.appendChild(modalContent);
            modal.onclick = (e) => {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                }
            };
            
            document.body.appendChild(modal);
        }

        function updateCopyright() {
            const year = new Date().getFullYear();
            document.getElementById('copyrightText').innerHTML = 
                `&copy; ${year} RulzXD API - Secure Admin Authentication System`;
        }

        // Add some dynamic effects
        document.querySelectorAll('.btn, .footer-link').forEach(el => {
            el.addEventListener('mouseenter', function() {
                this.style.transform = 'translateY(-2px)';
            });
            
            el.addEventListener('mouseleave', function() {
                this.style.transform = 'translateY(0)';
            });
        });