// Store open/closed status
(function () {
    var schedule = {
        1: [{ o: 9*60, c: 12*60 }, { o: 13*60, c: 18*60 }],
        2: [{ o: 9*60, c: 12*60 }, { o: 13*60, c: 18*60 }],
        3: [{ o: 9*60, c: 12*60 }, { o: 13*60, c: 18*60 }],
        4: [{ o: 9*60, c: 12*60 }, { o: 13*60, c: 18*60 }],
        5: [{ o: 9*60, c: 12*60 }, { o: 13*60, c: 18*60 }],
        6: [{ o: 10*60, c: 13*60 }],
        0: []
    };
    var dayNames = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

    function fmt(mins) {
        var h = Math.floor(mins / 60), m = mins % 60;
        return h + ':' + (m < 10 ? '0' : '') + m;
    }

    function getStatus() {
        var now = new Date();
        var day = now.getDay();
        var mins = now.getHours() * 60 + now.getMinutes();
        var sessions = schedule[day];

        for (var i = 0; i < sessions.length; i++) {
            var s = sessions[i];
            if (mins >= s.o && mins < s.c) {
                var remaining = s.c - mins;
                var detail = remaining <= 60
                    ? ', sluit over ' + remaining + ' min'
                    : ' tot ' + fmt(s.c);
                return { open: true, text: 'Nu open' + detail };
            }
        }
        for (var i = 0; i < sessions.length; i++) {
            if (mins < sessions[i].o) {
                return { open: false, text: 'Gesloten, opent om ' + fmt(sessions[i].o) };
            }
        }
        for (var d = 1; d <= 7; d++) {
            var nextDay = (day + d) % 7;
            var next = schedule[nextDay];
            if (next && next.length > 0) {
                var label = d === 1 ? 'morgen' : dayNames[nextDay];
                return { open: false, text: 'Gesloten, opent ' + label + ' om ' + fmt(next[0].o) };
            }
        }
        return { open: false, text: 'Gesloten' };
    }

    function updateStatus() {
        var status = getStatus();
        var cls = status.open ? 'status-open' : 'status-closed';
        ['store-status-bar', 'store-status-nav', 'store-status-info'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) {
                el.textContent = status.text;
                el.classList.remove('status-open', 'status-closed');
                el.classList.add(cls);
            }
        });
    }

    updateStatus();
    setInterval(updateStatus, 60000);
})();

// OS-based single download button
(function () {
    var ua = navigator.userAgent;
    var isMac = /Mac|iPhone|iPad|iPod/.test(ua) && !/Windows/.test(ua);

    // --- Download section: show primary button, add small alt link ---
    var winBtn = document.querySelector('.download-btn.windows');
    var macBtn = document.querySelector('.download-btn.mac');
    if (winBtn && macBtn) {
        var dlButtons = document.querySelector('.remote-dl-buttons');
        var altLink = document.createElement('p');
        altLink.className = 'remote-dl-alt';

        if (isMac) {
            winBtn.style.display = 'none';
            dlButtons.style.gridTemplateColumns = '1fr';
            altLink.innerHTML = 'of <a href="download/WIN/Cittel Remote.exe"><i class="fa-brands fa-windows"></i> download voor Windows</a>';
        } else {
            macBtn.style.display = 'none';
            dlButtons.style.gridTemplateColumns = '1fr';
            altLink.innerHTML = 'of <a href="download/MAC/Cittel Remote-MacOS.zip"><i class="fa-brands fa-apple"></i> download voor Mac</a>';
        }
        dlButtons.parentNode.insertBefore(altLink, dlButtons.nextSibling);
    }

    // --- Nav button: correct link + icon ---
    var navTvBtns = document.querySelectorAll('.btn-nav-tv');
    navTvBtns.forEach(function (btn) {
        if (isMac) {
            btn.href = 'download/MAC/Cittel Remote-MacOS.zip';
            btn.innerHTML = '<i class="fa-solid fa-download"></i> TeamViewer';
        } else {
            btn.href = 'download/WIN/Cittel Remote.exe';
            btn.innerHTML = '<i class="fa-solid fa-download"></i> TeamViewer';
        }
    });
})();

// Auto-update footer year
document.getElementById('footer-year').textContent = new Date().getFullYear();

// Mobile navigation toggle
var toggle = document.querySelector('.mobile-toggle');
var navLinks = document.querySelector('.nav-links');

toggle.addEventListener('click', function () {
    var isOpen = navLinks.classList.toggle('open');
    toggle.setAttribute('aria-expanded', isOpen);
    toggle.querySelector('i').className = isOpen ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
});

// Close mobile menu when a link is clicked
document.querySelectorAll('.nav-links a').forEach(function (link) {
    link.addEventListener('click', function () {
        navLinks.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.querySelector('i').className = 'fa-solid fa-bars';
    });
});

// Scroll-reveal animation
var revealObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
        if (entry.isIntersecting) {
            var el = entry.target;
            var delay = el.dataset.delay ? parseInt(el.dataset.delay) : 0;
            setTimeout(function () { el.classList.add('visible'); }, delay);
            revealObserver.unobserve(el);
        }
    });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach(function (el) {
    revealObserver.observe(el);
});

// Reviews carousel
(function () {
    var trackOuter = document.querySelector('.reviews-track-outer');
    var track = document.querySelector('.reviews-track');
    if (!track || !trackOuter) return;

    var cards = Array.prototype.slice.call(track.querySelectorAll('.review-card'));
    var totalCards = cards.length;
    var currentIndex = 0;
    var prevBtn = document.querySelector('.carousel-btn--prev');
    var nextBtn = document.querySelector('.carousel-btn--next');
    var dotsContainer = document.getElementById('reviewsDots');
    var swipeHint = document.getElementById('swipeHint');

    // Build dots
    var dots = [];
    if (dotsContainer) {
        for (var i = 0; i < totalCards; i++) {
            var dot = document.createElement('span');
            dot.className = 'reviews-dot';
            dot.setAttribute('aria-hidden', 'true');
            dotsContainer.appendChild(dot);
            dots.push(dot);
        }
    }

    function getPerPage() {
        return window.innerWidth <= 900 ? 1 : 3;
    }

    function getSlideWidth() {
        if (!cards.length) return 0;
        var gap = parseFloat(window.getComputedStyle(track).columnGap) || 24;
        return cards[0].offsetWidth + gap;
    }

    function updateDots() {
        dots.forEach(function (dot, i) {
            dot.classList.toggle('active', i === currentIndex);
        });
    }

    function updateCarousel() {
        var perPage = getPerPage();
        var maxIndex = Math.max(0, totalCards - perPage);
        currentIndex = Math.min(currentIndex, maxIndex);
        track.style.transform = 'translateX(-' + (currentIndex * getSlideWidth()) + 'px)';
        prevBtn.disabled = currentIndex === 0;
        nextBtn.disabled = currentIndex >= maxIndex;
        updateDots();
    }

    prevBtn.addEventListener('click', function () {
        currentIndex = Math.max(0, currentIndex - getPerPage());
        updateCarousel();
    });

    nextBtn.addEventListener('click', function () {
        var perPage = getPerPage();
        var maxIndex = Math.max(0, totalCards - perPage);
        currentIndex = Math.min(maxIndex, currentIndex + perPage);
        updateCarousel();
    });

    // Touch / swipe support
    var touchStartX = 0;
    var touchStartY = 0;
    var isDragging = false;

    trackOuter.addEventListener('touchstart', function (e) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isDragging = true;
        track.style.transition = 'none';
    }, { passive: true });

    trackOuter.addEventListener('touchmove', function (e) {
        if (!isDragging) return;
        var dx = e.touches[0].clientX - touchStartX;
        var dy = e.touches[0].clientY - touchStartY;
        if (Math.abs(dx) > Math.abs(dy) + 5) {
            e.preventDefault();
        }
    }, { passive: false });

    trackOuter.addEventListener('touchend', function (e) {
        if (!isDragging) return;
        isDragging = false;
        track.style.transition = '';
        var dx = e.changedTouches[0].clientX - touchStartX;
        var threshold = 50;
        if (dx < -threshold) {
            var perPage = getPerPage();
            var maxIndex = Math.max(0, totalCards - perPage);
            currentIndex = Math.min(maxIndex, currentIndex + 1);
        } else if (dx > threshold) {
            currentIndex = Math.max(0, currentIndex - 1);
        }
        // Hide swipe hint after first interaction
        if (swipeHint) {
            swipeHint.style.opacity = '0';
            setTimeout(function () { swipeHint.style.display = 'none'; }, 400);
        }
        updateCarousel();
    }, { passive: true });

    var resizeTimer;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            currentIndex = 0;
            updateCarousel();
        }, 150);
    });

    updateCarousel();
})();

(function () {
    var accordionList = document.querySelector('.accordion-list');
    if (!accordionList) return;

    var items = accordionList.querySelectorAll('.acc-item');
    if (!items.length) return;
    var photoImage = document.getElementById('accordionPhotoImage');

    function updatePhoto(item) {
        if (!photoImage) return;

        var nextSrc = item.getAttribute('data-photo');
        var nextAlt = item.getAttribute('data-photo-alt') || '';
        if (!nextSrc || photoImage.getAttribute('src') === nextSrc) return;

        photoImage.classList.add('is-changing');
        setTimeout(function () {
            photoImage.setAttribute('src', nextSrc);
            photoImage.setAttribute('alt', nextAlt);
            photoImage.classList.remove('is-changing');
        }, 120);
    }

    function closeItem(item) {
        var btn = item.querySelector('.acc-trigger');
        var panel = item.querySelector('.acc-body');
        item.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
        panel.style.maxHeight = null;
    }

    function openItem(item) {
        var btn = item.querySelector('.acc-trigger');
        var panel = item.querySelector('.acc-body');
        item.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
        panel.style.maxHeight = panel.scrollHeight + 'px';
        updatePhoto(item);
    }

    // Initialize max-heights from markup state
    items.forEach(function (item) {
        var panel = item.querySelector('.acc-body');
        if (item.classList.contains('is-open')) {
            panel.style.maxHeight = panel.scrollHeight + 'px';
            updatePhoto(item);
        } else {
            panel.style.maxHeight = null;
        }
    });

    items.forEach(function (item) {
        var trigger = item.querySelector('.acc-trigger');

        trigger.addEventListener('click', function () {
            var isOpen = item.classList.contains('is-open');
            var currentOpen = accordionList.querySelector('.acc-item.is-open');

            if (isOpen) {
                closeItem(item);
                return;
            }

            if (currentOpen && currentOpen !== item) {
                closeItem(currentOpen);
                // Apply closed layout first so old and new items never overlap open state
                accordionList.offsetHeight;
            }

            openItem(item);
        });
    });

    window.addEventListener('resize', function () {
        var openItemEl = accordionList.querySelector('.acc-item.is-open');
        if (!openItemEl) return;
        var panel = openItemEl.querySelector('.acc-body');
        panel.style.maxHeight = panel.scrollHeight + 'px';
    });
})();