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
                return { open: false, text: 'Gesloten ,opent om ' + fmt(sessions[i].o) };
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

    var status = getStatus();
    var cls = status.open ? 'status-open' : 'status-closed';
    ['store-status-bar', 'store-status-nav', 'store-status-info'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) {
            el.textContent = status.text;
            el.classList.add(cls);
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