// script.js - Landing Page Interactions

document.addEventListener('DOMContentLoaded', () => {
  // Sidebar tab switching for the app mockup
  const navButtons = document.querySelectorAll('.mock-nav-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // 1. Remove active state from all nav buttons
      navButtons.forEach(b => b.classList.remove('active'));
      
      // 2. Add active state to clicked button
      btn.classList.add('active');

      // 3. Get target tab ID
      const targetId = btn.getAttribute('data-target');

      // 4. Toggle visibility of tab contents
      tabContents.forEach(tab => {
        if (tab.id === targetId) {
          tab.classList.add('active');
        } else {
          tab.classList.remove('active');
        }
      });
    });
  });

  // Smooth scroll animations for landing navigation links (optional, handled by CSS mostly)
  const navLinks = document.querySelectorAll('.nav-link, .hero-actions a');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href.startsWith('#')) {
        e.preventDefault();
        const targetElement = document.querySelector(href);
        if (targetElement) {
          const offsetTop = targetElement.offsetTop - 70; // 70px offset for the navbar
          window.scrollTo({
            top: offsetTop,
            behavior: 'smooth'
          });
        }
      }
    });
  });

  // Mobile Menu Toggling
  const menuToggle = document.querySelector('.mobile-menu-toggle');
  const navMenu = document.querySelector('.nav-menu');

  if (menuToggle && navMenu) {
    menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      menuToggle.classList.toggle('active');
      navMenu.classList.toggle('active');
    });

    // Close menu when clicking any nav link
    const mobileLinks = navMenu.querySelectorAll('a');
    mobileLinks.forEach(link => {
      link.addEventListener('click', () => {
        menuToggle.classList.remove('active');
        navMenu.classList.remove('active');
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!navMenu.contains(e.target) && !menuToggle.contains(e.target)) {
        menuToggle.classList.remove('active');
        navMenu.classList.remove('active');
      }
    });
  }
});
