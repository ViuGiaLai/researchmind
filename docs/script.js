document.addEventListener('DOMContentLoaded', function() {
  // Navbar scroll class
  const navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', function() {
      if (window.scrollY > 20) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    });
  }

  // Mobile menu toggle
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function() {
      navToggle.classList.toggle('active');
      navLinks.classList.toggle('open');
    });
    document.querySelectorAll('.nav-links a').forEach(function(link) {
      link.addEventListener('click', function() {
        navToggle.classList.remove('active');
        navLinks.classList.remove('open');
      });
    });
  }

  // Video play overlay
  var videoWrapper = document.querySelector('.hero-video-wrapper');
  var overlay = document.querySelector('.video-overlay');
  var playBtn = document.querySelector('.video-play-btn');
  var iframe = document.querySelector('.hero-video-wrapper iframe');

  if (overlay && playBtn && iframe) {
    function playVideo() {
      iframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
      overlay.classList.add('hidden');
    }
    playBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      playVideo();
    });
    overlay.addEventListener('click', function() {
      playVideo();
    });
  }

  // Anchor scrolling (không smooth)
  document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
    anchor.addEventListener('click', function(e) {
      var href = this.getAttribute('href');
      if (href === '#') return;
      e.preventDefault();
      var target = document.querySelector(href);
      if (target) {
        var offset = 72;
        var top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo(0, top);
      }
    });
  });
});