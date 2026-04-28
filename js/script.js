// Store open/closed status – Google Places + fallback + live updates
(function () {
    var MAPS_API_KEY = 'AIzaSyC57Y_82MVoM5Gaot3Fh-7LKEBoOjsxwVk';
    var PLACE_ID = 'ChIJQ1tkAldnw0cRB18bskddtjk';
    var CACHE_TTL = 60 * 60 * 1000;
    var CACHE_KEY = 'cittel_gmb_hours';

    var fallbackSchedule = {
        1: [{ o: 9*60, c: 12*60 }, { o: 13*60, c: 18*60 }],
        2: [{ o: 9*60, c: 12*60 }, { o: 13*60, c: 18*60 }],
        3: [{ o: 9*60, c: 12*60 }, { o: 13*60, c: 18*60 }],
        4: [{ o: 9*60, c: 12*60 }, { o: 13*60, c: 18*60 }],
        5: [{ o: 9*60, c: 12*60 }, { o: 13*60, c: 18*60 }],
        6: [{ o: 10*60, c: 13*60 }],
        0: []
    };

    var dayNames = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
    var currentData = null;

    function fmt(mins) {
        var h = Math.floor(mins / 60), m = mins % 60;
        return h + ':' + (m < 10 ? '0' : '') + m;
    }

    // ── Cache ──
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

    // ── Parse Google Places response ──
    function parseGmbData(place) {
        var schedule = { 0:[], 1:[], 2:[], 3:[], 4:[], 5:[], 6:[] };
        var specialDays = [];

        if (place.regularOpeningHours && place.regularOpeningHours.periods) {
            place.regularOpeningHours.periods.forEach(function (p) {
                var day = p.open.day;
                var openMins = p.open.hour * 60 + p.open.minute;
                var closeMins = p.close ? (p.close.hour * 60 + p.close.minute) : 1440;
                schedule[day].push({ o: openMins, c: closeMins });
            });
        }

        if (place.currentOpeningHours && place.currentOpeningHours.specialDays) {
            specialDays = place.currentOpeningHours.specialDays.map(function (d) {
                // Date kan op verschillende manieren komen: { year, month, day },
                // een JS Date object, of een ISO string. Ook kan het direct op d staan.
                var raw = d.date || d;
                var dateStr = null;
                if (raw && typeof raw.year === 'number') {
                    dateStr = raw.year + '-' + String(raw.month).padStart(2,'0') + '-' + String(raw.day).padStart(2,'0');
                } else if (raw instanceof Date && !isNaN(raw)) {
                    dateStr = raw.toISOString().split('T')[0];
                } else if (typeof raw === 'string') {
                    var m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
                    if (m) dateStr = m[1] + '-' + m[2] + '-' + m[3];
                }
                if (!dateStr) return null;
                return {
                    date: dateStr,
                    closed: d.closed || false,
                    periods: (d.periods || []).map(function (p) {
                        return {
                            o: p.open.hour * 60 + p.open.minute,
                            c: p.close ? (p.close.hour * 60 + p.close.minute) : 1440
                        };
                    })
                };
            }).filter(Boolean);
        }

        return { schedule: schedule, specialDays: specialDays };
    }

    // ── Status berekenen ──
    function computeStatus(data) {
        var now = new Date();
        var tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);

        var dateStrToday = now.toISOString().split('T')[0];
        var dateStrTomorrow = tomorrow.toISOString().split('T')[0];

        var mins = now.getHours() * 60 + now.getMinutes();
        var day = now.getDay();

        var isSpecialClosed = function (s) {
            return s && (s.closed === true || !s.periods || s.periods.length === 0);
        };

        var todaySpecial = data.specialDays.find(function (d) { return d.date === dateStrToday; });
        var activeSessions = todaySpecial
            ? (isSpecialClosed(todaySpecial) ? [] : todaySpecial.periods)
            : data.schedule[day];

        var tomorrowSpecial = data.specialDays.find(function (d) { return d.date === dateStrTomorrow; });
        var extraNote = '';
        if (tomorrowSpecial) {
            extraNote = isSpecialClosed(tomorrowSpecial)
                ? ' (morgen uitzonderlijk gesloten)'
                : ' (morgen gewijzigde uren)';
        }

        // Zijn we nu open?
        for (var i = 0; i < activeSessions.length; i++) {
            var s = activeSessions[i];
            if (mins >= s.o && mins < s.c) {
                var remaining = s.c - mins;
                var detail = remaining <= 60
                    ? ', sluit over ' + remaining + ' min'
                    : ' tot ' + fmt(s.c);
                return { open: true, exception: !!todaySpecial, text: 'Nu open' + detail + extraNote };
            }
        }

        // Uitzonderlijk gesloten vandaag
        if (isSpecialClosed(todaySpecial)) {
            var nextOpen = findNextOpen(data, day, 1);
            var closedText = 'Vandaag uitzonderlijk gesloten';
            if (nextOpen) closedText += ', opent ' + nextOpen;
            return { open: false, exception: true, text: closedText + extraNote };
        }

        // Nog een sessie later vandaag?
        for (var i = 0; i < activeSessions.length; i++) {
            if (mins < activeSessions[i].o) {
                return { open: false, exception: false, text: 'Gesloten, opent om ' + fmt(activeSessions[i].o) + extraNote };
            }
        }

        // Volgende openingsdag
        var nextOpen = findNextOpen(data, day, 1);
        var text = nextOpen ? 'Gesloten, opent ' + nextOpen : 'Gesloten';
        return { open: false, exception: false, text: text + extraNote };
    }

    function findNextOpen(data, currentDay, offset) {
        for (var d = offset; d <= 7; d++) {
            var nextDay = (currentDay + d) % 7;
            var checkDate = new Date();
            checkDate.setDate(checkDate.getDate() + d);
            var dateStr = checkDate.toISOString().split('T')[0];
            var special = data.specialDays.find(function (s) { return s.date === dateStr; });

            var sessions;
            if (special) {
                if (special.closed === true || !special.periods || special.periods.length === 0) continue;
                sessions = special.periods;
            } else {
                sessions = data.schedule[nextDay];
            }

            if (sessions && sessions.length > 0) {
                var label = d === 1 ? 'morgen' : dayNames[nextDay];
                return label + ' om ' + fmt(sessions[0].o);
            }
        }
        return null;
    }

    // ── DOM updaten ──
    function applyStatus(status) {
        var cls = status.open ? 'status-open' : (status.exception ? 'status-exception' : 'status-closed');
        ['store-status-bar', 'store-status-nav', 'store-status-info', 'store-status-footer'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) {
                el.textContent = status.text;
                el.classList.remove('status-open', 'status-closed', 'status-exception');
                el.classList.add('store-status', cls);
            }
        });
    }

    // ── Closure banner: toon uitzonderlijke sluitingen binnen 7 dagen ──
    var monthNames = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];

    function formatClosureDate(dateStr) {
        // dateStr is "YYYY-MM-DD"
        var parts = dateStr.split('-');
        var d = new Date(parts[0], parts[1] - 1, parts[2]);
        return dayNames[d.getDay()] + ' ' + parseInt(parts[2], 10) + ' ' + monthNames[parts[1] - 1];
    }

    function applyClosureBanner(data) {
        var banner = document.getElementById('closureBanner');
        var textEl = document.getElementById('closureBannerText');
        if (!banner || !textEl || !data || !data.specialDays) return;

        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var horizon = new Date(today);
        horizon.setDate(today.getDate() + 7);

        var todayStr = today.toISOString().split('T')[0];

        var upcoming = data.specialDays.filter(function (d) {
            // Behandel als gesloten: closed=true OF geen periodes
            var isClosed = d.closed === true || !d.periods || d.periods.length === 0;
            if (!isClosed) return false;
            var dDate = new Date(d.date + 'T00:00:00');
            return dDate >= today && dDate <= horizon;
        }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });

        if (upcoming.length === 0) {
            banner.classList.remove('is-visible', 'is-today');
            return;
        }

        var isToday = upcoming[0].date === todayStr;
        var text;
        if (isToday && upcoming.length === 1) {
            text = 'Vandaag uitzonderlijk gesloten';
        } else if (isToday) {
            var rest = upcoming.slice(1).map(function (d) { return formatClosureDate(d.date); });
            text = 'Vandaag uitzonderlijk gesloten — ook gesloten op ' + joinDates(rest);
        } else {
            var dates = upcoming.map(function (d) { return formatClosureDate(d.date); });
            text = 'Uitzonderlijk gesloten op ' + joinDates(dates);
        }

        textEl.textContent = text;
        banner.classList.add('is-visible');
        banner.classList.toggle('is-today', isToday);
    }

    function joinDates(arr) {
        if (arr.length === 1) return arr[0];
        if (arr.length === 2) return arr[0] + ' en ' + arr[1];
        return arr.slice(0, -1).join(', ') + ' en ' + arr[arr.length - 1];
    }

    function updateStatus() {
        if (currentData) {
            applyStatus(computeStatus(currentData));
            applyClosureBanner(currentData);
        }
    }

    // ── Google Places laden ──
    async function fetchPlacesData() {
        try {
            await (function(g){var h,p,m,t="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await (p=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);p.src="https://maps.googleapis.com/maps/api/js?"+e;d[q]=f;m.head.append(p)}));d[l]?(d[l]):d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})({
                key: MAPS_API_KEY, v: "weekly", language: "nl"
            });
            var Place = (await google.maps.importLibrary("places")).Place;
            var place = new Place({ id: PLACE_ID });
            await place.fetchFields({ fields: ['regularOpeningHours', 'currentOpeningHours'] });
            currentData = parseGmbData(place);
            saveCache(currentData);
            updateStatus();
        } catch (err) {
            console.error('Google Places Error:', err);
        }
    }

    function initPlacesStatus() {
        // 1. Render direct met cached of fallback data (geen netwerk-blocking)
        var cached = loadCache();
        currentData = cached || { schedule: fallbackSchedule, specialDays: [] };
        updateStatus();
        setInterval(updateStatus, 60000);

        // 2. Verse data pas ophalen na page load (idle) — zonder LCP te blokkeren
        if (cached) return;
        var lazyLoad = function () { fetchPlacesData(); };
        if ('requestIdleCallback' in window) {
            requestIdleCallback(lazyLoad, { timeout: 5000 });
        } else {
            setTimeout(lazyLoad, 2500);
        }
    }

    if (document.readyState === 'complete') {
        initPlacesStatus();
    } else {
        window.addEventListener('load', initPlacesStatus);
    }
})();

// OS-based single download button
(function () {
    var ua = navigator.userAgent;
    var isMac = /Mac|iPhone|iPad|iPod/.test(ua) && !/Windows/.test(ua);
    
    // console.log('💻 OS Détection:', isMac ? 'Mac/iOS' : 'Windows/Overig', '| UserAgent:', ua);

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
            altLink.innerHTML = 'of <a href="download/WIN/Cittel Remote.exe"><svg class="icon" width="16" height="16" aria-hidden="true"><use href="/img/icons.svg#i-brands-windows"/></svg> download voor Windows</a>';
        } else {
            macBtn.style.display = 'none';
            dlButtons.style.gridTemplateColumns = '1fr';
            altLink.innerHTML = 'of <a href="download/MAC/Cittel Remote-MacOS.zip"><svg class="icon" width="16" height="16" aria-hidden="true"><use href="/img/icons.svg#i-brands-apple"/></svg> download voor Mac</a>';
        }
        dlButtons.parentNode.insertBefore(altLink, dlButtons.nextSibling);
    }

    // --- Nav button: correct link + icon ---
    var navTvBtns = document.querySelectorAll('.btn-nav-tv');
    navTvBtns.forEach(function (btn) {
        if (isMac) {
            btn.href = 'download/MAC/Cittel Remote-MacOS.zip';
            btn.innerHTML = '<svg class="icon" width="16" height="16" aria-hidden="true"><use href="/img/icons.svg#i-solid-download"/></svg> TeamViewer';
        } else {
            btn.href = 'download/WIN/Cittel Remote.exe';
            btn.innerHTML = '<svg class="icon" width="16" height="16" aria-hidden="true"><use href="/img/icons.svg#i-solid-download"/></svg> TeamViewer';
        }
    });

    // --- Remote support modal (shown when a download link is clicked) ---
    var modalHTML =
        '<dialog class="remote-modal" id="remoteModal">' +
            '<form method="dialog" class="remote-modal-form">' +
                '<button class="remote-modal-close" aria-label="Sluiten" value="cancel" type="submit">' +
                    '<svg class="icon" width="16" height="16" aria-hidden="true"><use href="/img/icons.svg#i-solid-xmark"/></svg>' +
                '</button>' +
                '<h2 class="remote-modal-title">Download gestart</h2>' +
                '<p class="remote-modal-sub">Uw download start automatisch. Zo niet, <a id="remoteModalManual" href="#">klik hier om opnieuw te downloaden</a>.</p>' +
                '<ol class="remote-steps" id="remoteSteps"></ol>' +
                '<a href="tel:+3250719429" class="remote-modal-call"><svg class="icon" width="16" height="16" aria-hidden="true"><use href="/img/icons.svg#i-solid-phone"/></svg> Bel nu 050 71 94 29</a>' +
                '<p class="remote-modal-terms">Door uw ID door te geven aan onze medewerker gaat u akkoord met onze voorwaarden. Tarief: <strong>\u20AC 15,00 excl. BTW per begonnen kwartier</strong>. Verifieer uw gegevens telefonisch. Vragen? <a href="tel:+3250719429">050 71 94 29</a> of <a href="mailto:support@cittel.be">support@cittel.be</a>.</p>' +
            '</form>' +
        '</dialog>';

    // Illustrations: small inline SVG visuals per step
    var illOpenWin =
        '<img src="/img/download-popup.png?v=3" alt="Cittel Remote.exe in de Edge download-balk" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:contain;display:block"/>';

    var illCall =
        '<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
            // Concentric rings
            '<circle cx="100" cy="52" r="40" fill="#FFB61B" fill-opacity="0.12"/>' +
            '<circle cx="100" cy="52" r="28" fill="#FFB61B" fill-opacity="0.25"/>' +
            '<circle cx="100" cy="52" r="18" fill="#FFB61B"/>' +
            // Centered phone (smaller, via nested SVG from FontAwesome)
            '<svg x="90" y="42" width="20" height="20" viewBox="0 0 512 512">' +
                '<path d="M164.9 24.6c-7.7-18.6-28-28.5-47.4-23.2l-88 24C12.1 30.2 0 46 0 64C0 311.4 200.6 512 448 512c18 0 33.8-12.1 38.6-29.5l24-88c5.3-19.4-4.6-39.7-23.2-47.4l-96-40c-16.3-6.8-35.2-2.1-46.3 11.6L304.7 368C234.3 334.7 177.3 277.7 144 207.3L193.3 167c13.7-11.2 18.4-30 11.6-46.3l-40-96z" fill="#ffffff"/>' +
            '</svg>' +
            '<text x="100" y="106" font-family="Inter,sans-serif" font-size="11" font-weight="800" fill="#1a1a2e" text-anchor="middle" letter-spacing="0.5">050 71 94 29</text>' +
        '</svg>';

    var illId =
        '<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
            // Window frame
            '<rect x="24" y="6" width="152" height="108" rx="3" fill="#ffffff" stroke="#d1d5db" stroke-width="1"/>' +
            // Title bar (light gray)
            '<rect x="24" y="6" width="152" height="14" fill="#f3f4f6"/>' +
            // App icon in title
            '<rect x="30" y="9" width="8" height="8" rx="1.5" fill="#2f88d1"/>' +
            '<rect x="32" y="11" width="2" height="2" fill="#ffffff"/>' +
            '<rect x="35" y="11" width="1.5" height="1.5" fill="#ffffff" fill-opacity="0.7"/>' +
            '<rect x="32" y="14" width="4" height="2" fill="#ffffff"/>' +
            '<text x="42" y="15.5" font-family="Inter,sans-serif" font-size="6.5" font-weight="600" fill="#1a1a2e">Cittel Remote Support</text>' +
            // Window controls
            '<rect x="145" y="12" width="6" height="1.5" fill="#6b7280"/>' +
            '<rect x="154" y="10" width="6" height="6" fill="none" stroke="#6b7280" stroke-width="1"/>' +
            '<path d="M164 10 L170 16 M170 10 L164 16" stroke="#6b7280" stroke-width="1.2"/>' +
            // Cittel teal brand header
            '<rect x="24" y="20" width="152" height="26" fill="#2c6372"/>' +
            // "Cittel" logotype (stylized)
            '<text x="100" y="38" font-family="Inter,sans-serif" font-size="14" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">Cittel</text>' +
            '<rect x="71" y="26" width="3" height="3" fill="#ffffff" fill-opacity="0.5"/>' +
            '<rect x="75" y="26" width="3" height="3" fill="#ffffff" fill-opacity="0.8"/>' +
            '<rect x="71" y="30" width="3" height="3" fill="#ffffff" fill-opacity="0.8"/>' +
            '<rect x="75" y="30" width="3" height="3" fill="#ffffff"/>' +
            // Allow control section (lighter gray strip)
            '<rect x="24" y="46" width="152" height="10" fill="#e5e7eb"/>' +
            '<text x="30" y="53" font-family="Inter,sans-serif" font-size="6" font-weight="500" fill="#374151">Afstandsbediening toestaan</text>' +
            '<circle cx="168" cy="51" r="2" fill="none" stroke="#6b7280" stroke-width="1"/>' +
            '<path d="M166 51 h4 M168 49 v4" stroke="#6b7280" stroke-width="0.6"/>' +
            // Dark teal ID body
            '<rect x="24" y="56" width="152" height="58" fill="#2c6372"/>' +
            // Uw ID label (blue tag)
            '<path d="M30 64 h22 l3 4 l-3 4 h-22 z" fill="#2f88d1"/>' +
            '<text x="41" y="71" font-family="Inter,sans-serif" font-size="5.5" font-weight="700" fill="#ffffff" text-anchor="middle">Uw ID</text>' +
            '<text x="168" y="73" font-family="Inter,sans-serif" font-size="12" font-weight="800" fill="#ffffff" text-anchor="end" letter-spacing="1">649 594 001</text>' +
            '<line x1="60" y1="77" x2="172" y2="77" stroke="#ffffff" stroke-opacity="0.2" stroke-width="0.5"/>' +
            // Wachtwoord label (blue tag)
            '<path d="M30 82 h30 l3 4 l-3 4 h-30 z" fill="#2f88d1"/>' +
            '<text x="45" y="89" font-family="Inter,sans-serif" font-size="5.5" font-weight="700" fill="#ffffff" text-anchor="middle">Wachtwoord</text>' +
            '<text x="168" y="91" font-family="Inter,sans-serif" font-size="10" font-weight="700" fill="#ffffff" text-anchor="end">ky1s54q4</text>' +
            // Status bar
            '<circle cx="30" cy="106" r="2" fill="#10b981"/>' +
            '<text x="36" y="108" font-family="Inter,sans-serif" font-size="5" fill="#a7c6ce">Gereed voor verbinding</text>' +
        '</svg>';

    var illOpenMac =
        '<img src="/img/CittelRemoteMac.png?v=3" alt="Cittel Remote app op macOS" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:contain;display:block"/>';

    var illPermission =
        '<img src="/img/CittelRemoteMacToegang.png?v=3" alt="macOS toestemming voor Cittel Remote" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:contain;display:block"/>';

    var illMacEnd =
        '<img src="/img/CittelRemoteMacEind.png?v=3" alt="Cittel Remote Support dialoog op macOS" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:contain;display:block"/>';

    var winSteps = [
        { t: 'Open het bestand', d: 'Klik bovenaan je browser op het gedownloade bestand om Cittel Remote te starten.', i: illOpenWin },
        { t: 'Bel ons', d: 'Bel <a href="tel:+3250719429">050 71 94 29</a>. Onze technicus begeleidt u verder.', i: illCall },
        { t: 'Geef uw ID door', d: 'Geef het getoonde ID-nummer aan onze technicus. Die neemt dan over.', i: illId }
    ];
    var macSteps = [
        { t: 'Pak uit en open', d: 'Dubbelklik op <strong>.zip</strong> en open daarna <strong>Cittel Remote</strong>.', i: illOpenMac },
        { t: 'Sta toestemming toe', d: 'Indien macOS blokkeert, ga naar <em>Systeeminstellingen &rsaquo; Privacy &amp; Beveiliging</em>.', i: illPermission },
        { t: 'Bel en geef uw ID door', d: 'Bel <a href="tel:+3250719429">050 71 94 29</a> en geef het getoonde ID-nummer door.', i: illMacEnd }
    ];

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    var modal = document.getElementById('remoteModal');
    var stepsEl = document.getElementById('remoteSteps');
    var manualLink = document.getElementById('remoteModalManual');

    function openModal(href) {
        var steps = /MAC\//i.test(href) ? macSteps : winSteps;
        stepsEl.innerHTML = steps.map(function (s, i) {
            return '<li class="remote-step"><div class="remote-step-ill">' + s.i + '</div><div class="remote-step-body"><span class="remote-step-num">' + (i + 1) + '</span><strong>' + s.t + '</strong><p>' + s.d + '</p></div></li>';
        }).join('');
        manualLink.href = href;
        if (typeof modal.showModal === 'function') {
            modal.showModal();
        } else {
            modal.setAttribute('open', '');
        }
    }

    document.addEventListener('click', function (e) {
        var a = e.target.closest('a[href*="download/WIN/"], a[href*="download/MAC/"]');
        if (!a) return;
        // Don't preventDefault — laat browser meteen downloaden
        openModal(a.getAttribute('href'));
    });

    // Close on backdrop click
    modal.addEventListener('click', function (e) {
        if (e.target === modal) modal.close();
    });
})();

// Auto-update footer year
document.getElementById('footer-year').textContent = new Date().getFullYear();

// Nav glasmorfisme → solid on scroll
(function () {
    var nav = document.querySelector('nav');
    var threshold = 50;

    function onScroll() {
        if (window.scrollY > threshold) {
            nav.classList.add('nav-scrolled');
        } else {
            nav.classList.remove('nav-scrolled');
        }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
})();

// Mobile navigation toggle
var toggle = document.querySelector('.mobile-toggle');
var navLinks = document.querySelector('.nav-links');

toggle.addEventListener('click', function () {
    var isOpen = navLinks.classList.toggle('open');
    toggle.setAttribute('aria-expanded', isOpen);
    toggle.querySelector('use').setAttribute('href', isOpen ? '/img/icons.svg#i-solid-xmark' : '/img/icons.svg#i-solid-bars');
});

// Close mobile menu when a link is clicked
document.querySelectorAll('.nav-links a').forEach(function (link) {
    link.addEventListener('click', function () {
        navLinks.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.querySelector('use').setAttribute('href', '/img/icons.svg#i-solid-bars');
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
    var photoImages = [
        document.getElementById('accordionPhotoImage'),
        document.getElementById('accordionPhotoImageAlt')
    ];
    var activeIndex = 0;
    var currentSrc = photoImages[0] ? photoImages[0].getAttribute('src') : '';

    function updatePhoto(item) {
        if (!photoImages[0] || !photoImages[1]) return;

        var nextSrc = item.getAttribute('data-photo');
        var nextAlt = item.getAttribute('data-photo-alt') || '';
        if (!nextSrc || currentSrc === nextSrc) return;

        var nextIndex = activeIndex === 0 ? 1 : 0;
        var nextImg = photoImages[nextIndex];
        var prevImg = photoImages[activeIndex];

        var loader = new Image();
        loader.onload = loader.onerror = function () {
            nextImg.setAttribute('src', nextSrc);
            nextImg.setAttribute('alt', nextAlt);
            // Force reflow so the opacity transition runs on the newly set src
            void nextImg.offsetWidth;
            nextImg.classList.add('is-active');
            prevImg.classList.remove('is-active');
            activeIndex = nextIndex;
            currentSrc = nextSrc;
        };
        loader.src = nextSrc;
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
// Op desktop: bel-knoppen verwijzen naar contactpagina i.p.v. tel:
if (!('ontouchstart' in window) && !navigator.maxTouchPoints) {
    document.querySelectorAll('a.hero-btn-primary[href^="tel:"], a.btn-cta-primary[href^="tel:"], a.nav-hours-call[href^="tel:"]').forEach(function (link) {
        link.setAttribute('href', 'contact.html');
    });
}

(function () {
    var form = document.getElementById('contact-form');
    var submitBtn = document.getElementById('submit-btn');
    var feedback = document.getElementById('form-feedback');

    if (!form || !submitBtn || !feedback) return;

    var RATE_LIMIT_KEY = 'cittel_form_sends';
    var MAX_SENDS_PER_HOUR = 3;
    var COOLDOWN_MS = 30 * 60 * 1000; // 30 minuten

    function getSendLog() {
        try {
            return JSON.parse(localStorage.getItem(RATE_LIMIT_KEY)) || [];
        } catch (e) {
            return [];
        }
    }

    function checkRateLimit() {
        var now = Date.now();
        var log = getSendLog().filter(function (t) { return now - t < 3600000; }); // bewaar alleen laatste uur
        localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(log));

        if (log.length >= MAX_SENDS_PER_HOUR) {
            return 'U heeft al ' + MAX_SENDS_PER_HOUR + ' berichten verstuurd dit uur. Probeer later opnieuw, of bel ons op 050 71 94 29.';
        }

        if (log.length > 0 && now - log[log.length - 1] < COOLDOWN_MS) {
            var minLeft = Math.ceil((COOLDOWN_MS - (now - log[log.length - 1])) / 1000 / 60);
            return 'Even geduld, u kunt over ' + minLeft + ' minuten     opnieuw een bericht sturen.';
        }

        return null;
    }

    function recordSend() {
        var now = Date.now();
        var log = getSendLog().filter(function (t) { return now - t < 3600000; });
        log.push(now);
        localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(log));
    }

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        // Rate limit check
        var limitMsg = checkRateLimit();
        if (limitMsg) {
            feedback.textContent = limitMsg;
            feedback.className = 'form-feedback form-feedback--error';
            feedback.style.display = 'block';
            return;
        }

        var formData = new FormData(form);
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<svg class="icon icon-spin" width="16" height="16" aria-hidden="true"><use href="/img/icons.svg#i-solid-spinner"/></svg> Bezig met verzenden...';
        feedback.className = 'form-feedback';
        feedback.style.display = 'none';

        try {
            var response = await fetch('https://api.web3forms.com/submit', {
                method: 'POST',
                body: formData
            });
            var data = await response.json();

            if (response.ok) {
                recordSend();
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
            submitBtn.innerHTML = '<svg class="icon" width="16" height="16" aria-hidden="true"><use href="/img/icons.svg#i-solid-paper-plane"/></svg> Verstuur bericht';
        }
    });

})();
