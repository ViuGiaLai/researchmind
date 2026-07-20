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

  // Hero video — click to play
  var heroVideo = document.getElementById('heroVideo');
  if (heroVideo) {
    var vid = heroVideo.querySelector('video');
    var barFill = document.getElementById('videoBarFill');
    var barTime = document.getElementById('videoBarTime');
    var barTrack = heroVideo.querySelector('.video-bar-track');

    function fmt(t){ var m=Math.floor(t/60); var s=Math.floor(t%60); return m+':'+(s<10?'0':'')+s; }

    heroVideo.addEventListener('click', function(e) {
      if (e.target.closest('.video-bar-track,.video-bar-time')) return;
      if (vid.paused) {
        vid.play();
        this.classList.add('playing');
      } else {
        vid.pause();
        this.classList.remove('playing');
      }
    });

    vid.addEventListener('timeupdate', function() {
      var pct = (vid.currentTime / vid.duration) * 100;
      barFill.style.width = pct + '%';
      barTime.textContent = fmt(vid.currentTime);
    });

    vid.addEventListener('ended', function() {
      heroVideo.classList.remove('playing');
      barFill.style.width = '0%';
      barTime.textContent = '0:00';
    });

    if (barTrack) {
      barTrack.addEventListener('click', function(e) {
        var rect = this.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var pct = x / rect.width;
        vid.currentTime = pct * vid.duration;
      });
    }
  }

  // Anchor scrolling (smooth)
  document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
    anchor.addEventListener('click', function(e) {
      var href = this.getAttribute('href');
      if (href === '#') return;
      e.preventDefault();
      var target = document.querySelector(href);
      if (target) {
        var offset = 72;
        var top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: top, behavior: 'smooth' });
      }
    });
  });
});