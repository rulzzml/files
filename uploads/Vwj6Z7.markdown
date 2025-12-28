/* Reset & Base Styles */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

body {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px;
    color: #333;
}

/* Container */
.container {
    max-width: 1200px;
    width: 100%;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-radius: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    padding: 30px;
    margin-top: 20px;
    margin-bottom: 40px;
}

/* Header */
.header {
    text-align: center;
    margin-bottom: 40px;
    padding-bottom: 20px;
    border-bottom: 2px solid #e0e0e0;
}

.header h1 {
    font-size: 3rem;
    background: linear-gradient(45deg, #667eea, #764ba2);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 10px;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
}

.header p {
    color: #666;
    font-size: 1.1rem;
    max-width: 600px;
    margin: 0 auto;
}

/* Database Container */
.database-container {
    background: #fff;
    border-radius: 15px;
    padding: 25px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
    margin-bottom: 30px;
    border: 1px solid #e8e8e8;
}

.database-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 25px;
    flex-wrap: wrap;
    gap: 15px;
}

.database-header h2 {
    font-size: 1.8rem;
    color: #333;
    display: flex;
    align-items: center;
    gap: 10px;
}

.database-header h2::before {
    content: '📊';
    font-size: 1.5rem;
}

.count-container {
    display: flex;
    align-items: center;
    gap: 20px;
    background: #f8f9fa;
    padding: 10px 20px;
    border-radius: 50px;
    border: 1px solid #e9ecef;
}

#numbersCount {
    font-weight: bold;
    color: #667eea;
    font-size: 1.1rem;
}

#lastUpdated {
    color: #6c757d;
    font-size: 0.9rem;
    font-style: italic;
}

/* Numbers Grid */
.numbers-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 20px;
    min-height: 200px;
}

.number-card {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 20px;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    transition: all 0.3s ease;
    box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.number-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 10px 25px rgba(102, 126, 234, 0.4);
}

.number {
    font-size: 1.4rem;
    font-weight: bold;
    font-family: 'Courier New', monospace;
    letter-spacing: 1px;
    margin-bottom: 10px;
    word-break: break-all;
}

.date {
    font-size: 0.85rem;
    opacity: 0.9;
    font-style: italic;
}

/* Loading State */
.loading-state {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    text-align: center;
}

.loading-state i {
    font-size: 3rem;
    color: #667eea;
    margin-bottom: 20px;
}

.loading-state p {
    color: #666;
    font-size: 1.2rem;
}

.loading-state small {
    color: #dc3545;
    margin-top: 10px;
    font-size: 0.9rem;
}

/* Controls */
.controls {
    display: flex;
    justify-content: center;
    gap: 15px;
    flex-wrap: wrap;
    margin-top: 30px;
    padding-top: 30px;
    border-top: 1px solid #e0e0e0;
}

/* Buttons */
.btn {
    padding: 14px 28px;
    border: none;
    border-radius: 50px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-width: 160px;
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
}

.btn:hover:not(:disabled) {
    transform: translateY(-3px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
}

.btn:active:not(:disabled) {
    transform: translateY(-1px);
}

.btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.btn-primary {
    background: linear-gradient(45deg, #667eea, #764ba2);
    color: white;
}

.btn-primary:hover:not(:disabled) {
    background: linear-gradient(45deg, #5a67d8, #6b46c1);
}

.btn-danger {
    background: linear-gradient(45deg, #f56565, #e53e3e);
    color: white;
}

.btn-danger:hover:not(:disabled) {
    background: linear-gradient(45deg, #e53e3e, #c53030);
}

.btn-secondary {
    background: linear-gradient(45deg, #a0aec0, #718096);
    color: white;
}

.btn-secondary:hover:not(:disabled) {
    background: linear-gradient(45deg, #718096, #4a5568);
}

.btn-info {
    background: linear-gradient(45deg, #4299e1, #3182ce);
    color: white;
}

.btn-info:hover:not(:disabled) {
    background: linear-gradient(45deg, #3182ce, #2c5282);
}

/* Modal */
.modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
}

.modal.show {
    display: flex;
    animation: fadeIn 0.3s ease;
}

.modal-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(5px);
}

.modal-content {
    background: white;
    border-radius: 20px;
    width: 100%;
    max-width: 500px;
    z-index: 1001;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
    animation: slideUp 0.3s ease;
    overflow: hidden;
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 25px 30px;
    background: linear-gradient(45deg, #667eea, #764ba2);
    color: white;
}

.modal-header h3 {
    font-size: 1.5rem;
    font-weight: 600;
}

.modal-header button {
    background: none;
    border: none;
    color: white;
    font-size: 2rem;
    cursor: pointer;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: background 0.3s;
}

.modal-header button:hover {
    background: rgba(255, 255, 255, 0.1);
}

.modal-body {
    padding: 30px;
}

.modal-footer {
    padding: 20px 30px;
    background: #f8f9fa;
    border-top: 1px solid #e9ecef;
    display: flex;
    justify-content: flex-end;
    gap: 15px;
}

/* Form Groups */
.form-group {
    margin-bottom: 25px;
}

.form-group label {
    display: block;
    margin-bottom: 8px;
    font-weight: 600;
    color: #333;
    font-size: 0.95rem;
}

.form-group input {
    width: 100%;
    padding: 14px 18px;
    border: 2px solid #e0e0e0;
    border-radius: 10px;
    font-size: 1rem;
    transition: all 0.3s;
    background: #f8f9fa;
}

.form-group input:focus {
    outline: none;
    border-color: #667eea;
    background: white;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.input-group {
    display: flex;
    gap: 10px;
}

.input-group input {
    flex: 1;
}

.input-group button {
    background: #e9ecef;
    border: 2px solid #dee2e6;
    border-radius: 10px;
    width: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.3s;
    color: #6c757d;
}

.input-group button:hover {
    background: #dee2e6;
    color: #333;
}

/* Error Messages */
.error-message {
    color: #dc3545;
    font-size: 0.9rem;
    margin-top: 10px;
    padding: 10px 15px;
    background: #f8d7da;
    border: 1px solid #f5c6cb;
    border-radius: 8px;
    display: none;
}

.error-message.show {
    display: block;
    animation: shake 0.5s;
}

/* Preview Box */
.preview-box {
    margin-top: 20px;
    padding: 15px;
    background: #f8f9fa;
    border-radius: 10px;
    border: 1px solid #dee2e6;
    display: none;
}

.preview-box.show {
    display: block;
    animation: fadeIn 0.3s;
}

.preview-box small {
    color: #6c757d;
    font-size: 0.85rem;
}

.preview-number {
    font-family: 'Courier New', monospace;
    font-size: 1.2rem;
    color: #28a745;
    margin-top: 8px;
    font-weight: bold;
}

/* Toast Notification */
.toast {
    position: fixed;
    bottom: 30px;
    right: 30px;
    z-index: 9999;
    display: none;
}

.toast.show {
    display: block;
    animation: slideInRight 0.3s ease;
}

.toast-content {
    background: white;
    padding: 18px 25px;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    gap: 15px;
    border-left: 4px solid #28a745;
    min-width: 300px;
}

.toast-content.success {
    border-left-color: #28a745;
}

.toast-content.error {
    border-left-color: #dc3545;
}

.toast-content.warning {
    border-left-color: #ffc107;
}

.toast-content.info {
    border-left-color: #17a2b8;
}

.toast-content i {
    font-size: 1.2rem;
}

.toast-content.success i { color: #28a745; }
.toast-content.error i { color: #dc3545; }
.toast-content.warning i { color: #ffc107; }
.toast-content.info i { color: #17a2b8; }

/* Environment Status */
.env-status {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 15px;
    font-size: 0.9rem;
    background: #e8f4fd;
    padding: 10px 15px;
    border-radius: 8px;
    border: 1px solid #b8daff;
    color: #004085;
    max-width: 400px;
    margin: 15px auto 0;
}

.env-status i {
    color: #17a2b8;
}

/* Copyright Footer */
.copyright {
    text-align: center;
    color: rgba(255, 255, 255, 0.8);
    padding: 20px;
    font-size: 0.9rem;
    margin-top: auto;
}

.copyright span {
    font-weight: bold;
    color: white;
}

.bujug {
    font-size: 0.8rem;
    opacity: 0.6;
    margin-top: 5px;
}

/* Animations */
@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes slideUp {
    from { 
        opacity: 0;
        transform: translateY(50px);
    }
    to { 
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes slideInRight {
    from { 
        opacity: 0;
        transform: translateX(100px);
    }
    to { 
        opacity: 1;
        transform: translateX(0);
    }
}

@keyframes shake {
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
    20%, 40%, 60%, 80% { transform: translateX(5px); }
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}

/* Responsive Design */
@media (max-width: 768px) {
    .container {
        padding: 20px;
        margin-top: 10px;
    }
    
    .header h1 {
        font-size: 2.2rem;
    }
    
    .numbers-grid {
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    }
    
    .database-header {
        flex-direction: column;
        align-items: flex-start;
    }
    
    .count-container {
        width: 100%;
        justify-content: space-between;
    }
    
    .controls {
        flex-direction: column;
        align-items: stretch;
    }
    
    .btn {
        width: 100%;
        justify-content: center;
    }
    
    .modal-content {
        margin: 10px;
    }
    
    .toast {
        bottom: 20px;
        right: 20px;
        left: 20px;
    }
    
    .toast-content {
        min-width: auto;
    }
}

@media (max-width: 480px) {
    .header h1 {
        font-size: 1.8rem;
    }
    
    .header p {
        font-size: 1rem;
    }
    
    .database-header h2 {
        font-size: 1.5rem;
    }
    
    .numbers-grid {
        grid-template-columns: 1fr;
    }
    
    .btn {
        padding: 12px 20px;
        font-size: 0.95rem;
    }
    
    .modal-body {
        padding: 20px;
    }
    
    .modal-footer {
        padding: 15px 20px;
        flex-direction: column;
    }
    
    .modal-footer .btn {
        width: 100%;
    }
}

/* Scrollbar Styling */
::-webkit-scrollbar {
    width: 10px;
}

::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 10px;
}

::-webkit-scrollbar-thumb {
    background: linear-gradient(45deg, #667eea, #764ba2);
    border-radius: 10px;
}

::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(45deg, #5a67d8, #6b46c1);
}

/* Selection Color */
::selection {
    background: rgba(102, 126, 234, 0.3);
    color: #333;
}

/* Focus Outline */
:focus {
    outline: 2px solid #667eea;
    outline-offset: 2px;
}

/* Disabled State */
:disabled {
    opacity: 0.6;
    cursor: not-allowed !important;
}

/* Print Styles */
@media print {
    .controls,
    .btn,
    .modal,
    .toast {
        display: none !important;
    }
    
    .container {
        box-shadow: none;
        background: white;
    }
    
    .database-container {
        box-shadow: none;
        border: 1px solid #ddd;
    }
    
    .number-card {
        break-inside: avoid;
        box-shadow: none;
        border: 1px solid #ddd;
        color: black;
        background: white !important;
    }
}