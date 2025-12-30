
  class HomeManager {
    constructor() {
      this.nodes = {};
      this.initialize();
    }

    initialize() {
      this.nodes.notificationContainer = document.querySelector('.notification-container');
      this.setupMobileMenu();
      this.startLiveStats();
      this.setupEventListeners();
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

    startLiveStats() {
      // Update battery indicator
      const updateBattery = () => {
        const batteryFill = document.getElementById('batteryFill');
        const batteryPercent = document.getElementById('batteryPercent');
        if (batteryFill && batteryPercent) {
          const currentPercent = parseInt(batteryFill.style.width);
          let newPercent = currentPercent + (Math.random() * 4 - 2); // +/- 2%
          newPercent = Math.max(85, Math.min(98, newPercent)); // Keep between 85-98%
          batteryFill.style.width = `${newPercent}%`;
          batteryPercent.textContent = `${Math.round(newPercent)}%`;
        }
      };

      // Update response time
      const updateResponseTime = () => {
        const responseTime = document.getElementById('responseTime');
        if (responseTime) {
          const current = parseInt(responseTime.textContent);
          const variation = Math.floor(Math.random() * 6) - 2; // -2 to +3
          const newTime = Math.max(15, Math.min(25, current + variation));
          responseTime.textContent = `${newTime}ms`;
        }
      };

      // Update active connections
      const updateConnections = () => {
        const connections = document.getElementById('activeConnections');
        if (connections) {
          const current = parseInt(connections.textContent);
          const variation = Math.floor(Math.random() * 20) - 10; // -10 to +9
          const newConnections = Math.max(120, Math.min(180, current + variation));
          connections.textContent = newConnections;
        }
      };

      // Initial updates
      updateBattery();
      updateResponseTime();
      updateConnections();

      // Update every 5 seconds
      setInterval(() => {
        updateBattery();
        updateResponseTime();
        updateConnections();
      }, 5000);
    }

    setupEventListeners() {
      // Smooth scrolling for anchor links
      document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
          e.preventDefault();
          const targetId = this.getAttribute('href');
          if (targetId === '#') return;
          
          const targetElement = document.querySelector(targetId);
          if (targetElement) {
            window.scrollTo({
              top: targetElement.offsetTop - 100,
              behavior: 'smooth'
            });
          }
        });
      });
    }
  }

  // Initialize home manager
  document.addEventListener('DOMContentLoaded', function() {
    window.homeManager = new HomeManager();
  });