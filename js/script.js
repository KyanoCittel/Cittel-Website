// ============================================================
// Store status & Google Maps Logic (INCL. UITZONDERINGEN)
// ============================================================
(function () {
    var MAPS_API_KEY = 'AIzaSyC57Y_82MVoM5Gaot3Fh-7LKEBoOjsxwVk';
    var PLACE_ID = 'ChIJQ1tkAldnw0cRB18bskddtjk';
    var CACHE_TTL = 60 * 60 * 1000;
    var CACHE_KEY = 'cittel_gmb_hours';

    var fallbackSchedule = {
        1: [{ o: 9 * 60, c: 12 * 60 }, { o: 13 * 60, c: 18 * 60 }],
        2: [{ o: 9 * 60, c: 12 * 60 }, { o: 13 * 60, c: 18 * 60 }],
        3: [{ o: 9 * 60, c: 12 * 60 }, { o: 13 * 60, c: 18 * 60 }],
        4: [{ o: 9 * 60, c: 12 * 60 }, { o: 13 * 60, c: 18 * 60 }],
        5: [{ o: 9 * 60, c: 12 * 60 }, { o: 13 * 60, c: 18 * 60 }],
        6: [{ o: 10 * 60, c: 13 * 60 }],
        0: []
    };

    function fmt(mins) {
        var h = Math.floor(mins / 60), m = mins % 60;
        return h + ':' + (m < 10 ? '0' : '') + m;
    }

    function saveCache(data) {
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data })); } catch (e) {}
    }

    function loadCache() {
        try {
            var raw = sessionStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            var obj = JSON.parse(raw);
            return (Date.now() - obj.ts > CACHE_TTL) ? null : obj.data;
        } catch (e) { return null; }
    }

function parseGmbData(place) {
    var schedule = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    var specialDays = [];

    // 1. Haal de STANDAARD uren op (voor de algemene weergave)
    if (place.regularOpeningHours && place.regularOpeningHours.periods) {
        place.regularOpeningHours.periods.forEach(p => {
            var day = p.open.day;
            var openMins = p.open.hour * 60 + p.open.minute;
            var closeMins = p.close ? (p.close.hour * 60 + p.close.minute) : 1440;
            schedule[day].push({ o: openMins, c: closeMins });
        });
    }

    // 2. Haal de UITZONDERLIJKE uren op (voor vandaag en morgen)
    if (place.currentOpeningHours && place.currentOpeningHours.specialDays) {
        specialDays = place.currentOpeningHours.specialDays.map(d => ({
            date: d.date.year + '-' + String(d.date.month).padStart(2, '0') + '-' + String(d.date.day).padStart(2, '0'),
            closed: d.closed || false,
            periods: (d.periods || []).map(p => ({
                o: p.open.hour * 60 + p.open.minute,
                c: p.close ? (p.close.hour * 60 + p.close.minute) : 1440
            }))
        }));
    }

    return { schedule: schedule, specialDays: specialDays };
}

    function computeStatus(data) {
        var now = new Date();
        var tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
        
        var dateStrToday = now.toISOString().split('T')[0];
        var dateStrTomorrow = tomorrow.toISOString().split('T')[0];
        
        var mins = now.getHours() * 60 + now.getMinutes();
        var day = now.getDay();

        // 1. Check of er VANDAAG een uitzondering is
        var todaySpecial = data.specialDays.find(d => d.date === dateStrToday);
        var activeSessions = todaySpecial ? (todaySpecial.closed ? [] : todaySpecial.periods) : data.schedule[day];

        // 2. Check of er MORGEN een uitzondering is (voor de melding)
        var tomorrowSpecial = data.specialDays.find(d => d.date === dateStrTomorrow);
        var extraNote = "";
        if (tomorrowSpecial) {
            extraNote = tomorrowSpecial.closed ? " (Morgen uitzonderlijk gesloten)" : " (Morgen gewijzigde uren)";
        }

        // Bepaal huidige status
        for (var s of activeSessions) {
            if (mins >= s.o && mins < s.c) {
                return { open: true, text: 'Nu open tot ' + fmt(s.c) + extraNote };
            }
        }

        var statusText = todaySpecial && todaySpecial.closed ? 'Vandaag uitzonderlijk gesloten' : 'Nu gesloten';
        return { open: false, exception: !!todaySpecial, text: statusText + extraNote };
    }

    function applyStatus(status) {
        var cls = status.open ? 'status-open' : (status.exception ? 'status-exception' : 'status-closed');
        ['store-status-bar', 'store-status-nav', 'store-status-info'].forEach(id => {
            var el = document.getElementById(id);
            if (el) {
                el.textContent = status.text;
                el.classList.remove('status-open', 'status-closed', 'status-exception');
                el.classList.add('store-status', cls);
            }
        });
    }

    async function initPlacesStatus() {
        var cached = loadCache();
        if (cached) { applyStatus(computeStatus(cached)); return; }

        try {
            await (function(g){var h,p,m,p,t="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await (p=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);p.src=`https://maps.googleapis.com/maps/api/js?`+e;d[q]=f;m.head.append(p)}));d[l]?(d[l]):d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})({
                key: MAPS_API_KEY, v: "weekly", language: "nl"
            });

            const { Place } = await google.maps.importLibrary("places");
            const place = new Place({ id: PLACE_ID });
            // We halen nu ook 'specialOpeningHours' op!
            await place.fetchFields({ fields: ['regularOpeningHours', 'currentOpeningHours'] });

            const parsed = parseGmbData(place);
            saveCache(parsed);
            applyStatus(computeStatus(parsed));
        } catch (err) {
            console.error('Maps Error:', err);
            applyStatus(computeStatus({ schedule: fallbackSchedule, specialDays: [] }));
        }
    }

    initPlacesStatus();
})();

// OS-based single download button
(function () {
    var ua = navigator.userAgent;
    var isMac = /Mac|iPhone|iPad|iPod/.test(ua) && !/Windows/.test(ua);
    
    console.log('💻 OS Détection:', isMac ? 'Mac/iOS' : 'Windows/Overig', '| UserAgent:', ua);

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

// Contact form submit handler (moved from inline script in contact.html)
(function () {
    var form = document.getElementById('contact-form');
    var submitBtn = document.getElementById('submit-btn');
    var feedback = document.getElementById('form-feedback');

    if (!form || !submitBtn || !feedback) return;

    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var formData = new FormData(form);
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Bezig met verzenden...';
        feedback.className = 'form-feedback';
        feedback.style.display = 'none';

        try {
            var response = await fetch('https://api.web3forms.com/submit', {
                method: 'POST',
                body: formData
            });
            var data = await response.json();

            if (response.ok) {
                feedback.textContent = '✓ Bericht verzonden! Wij nemen zo snel mogelijk contact met u op.';
                feedback.className = 'form-feedback form-feedback--success';
                feedback.style.display = 'block';
                form.reset();
            } else {
                throw new Error(data.message || 'Onbekende fout');
            }
        } catch (err) {
            feedback.textContent = '✗ Er is iets misgegaan. Probeer het opnieuw of bel ons op 050 71 94 29.';
            feedback.className = 'form-feedback form-feedback--error';
            feedback.style.display = 'block';
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Verstuur bericht';
        }
    });
})();
