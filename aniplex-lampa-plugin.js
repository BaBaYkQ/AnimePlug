(function () {
    'use strict';

    // ══════════════════════════════════════════════════════════════════
    //  КОНФІГ
    // ══════════════════════════════════════════════════════════════════
    var CFG = {
        anilibria: { api: 'https://api.anilibria.tv/v3', img: 'https://www.anilibria.tv' },
        kodik:     { search: 'https://kodikapi.com/search', token: 'd7b9c4e3a1f8e2d6c0b5a9f3e7d1c8b4' }
    };

    // ══════════════════════════════════════════════════════════════════
    //  УТИЛІТИ
    // ══════════════════════════════════════════════════════════════════
    function get(url, cb, errCb) {
        fetch(url)
            .then(function (r) { return r.json(); })
            .then(cb)
            .catch(function (e) { console.warn('[AniPlex]', e); if (errCb) errCb(e); });
    }

    function esc(s) {
        return String(s || '').replace(/[&<>"']/g, function (c) {
            return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
        });
    }

    function img(path, base) {
        if (!path) return './img/img_error.svg';
        return path.startsWith('http') ? path : (base || '') + path;
    }

    // ══════════════════════════════════════════════════════════════════
    //  ANILIBRIA
    // ══════════════════════════════════════════════════════════════════
    var AniLibria = {
        buildCard: function (item) {
            var poster = img(item.posters && item.posters.medium && item.posters.medium.url, CFG.anilibria.img);
            var title  = (item.names && item.names.ru) || (item.names && item.names.en) || '—';
            return {
                id:             item.id,
                title:          title,
                original_title: (item.names && item.names.en) || '',
                poster:         poster,
                backdrop:       img(item.posters && item.posters.original && item.posters.original.url, CFG.anilibria.img),
                overview:       item.description || '',
                score:          item.rating ? Number(item.rating.average || 0).toFixed(1) : '0',
                year:           item.season && item.season.year ? String(item.season.year) : '',
                genres:         (item.genres || []).join(', '),
                _raw:           item
            };
        },

        listUrl: function (mode, page, query) {
            var f = '&filter=id,names,posters,description,genres,season,rating,player';
            if (mode === 'search' && query)
                return CFG.anilibria.api + '/title/search?search=' + encodeURIComponent(query) + '&limit=20&page=' + page + f;
            if (mode === 'updates')
                return CFG.anilibria.api + '/title/updates?limit=20&page=' + page + f;
            return CFG.anilibria.api + '/title/list?limit=20&page=' + page + f + '&order_by=rating_votes&sort_direction=1';
        },

        episodes: function (raw) {
            if (!raw || !raw.player || !raw.player.list) return [];
            var host = raw.player.host ? 'https://' + raw.player.host : 'https://cache.libria.fun';
            return Object.keys(raw.player.list)
                .sort(function (a, b) { return parseInt(a) - parseInt(b); })
                .map(function (n) {
                    var ep  = raw.player.list[n];
                    var hls = ep.hls || {};
                    var q   = {};
                    if (hls.fhd) q['1080p'] = host + hls.fhd;
                    if (hls.hd)  q['720p']  = host + hls.hd;
                    if (hls.sd)  q['480p']  = host + hls.sd;
                    return { num: n, title: ep.name || ('Серія ' + n), file: q['1080p'] || q['720p'] || q['480p'] || '', quality: q };
                });
        }
    };

    // ══════════════════════════════════════════════════════════════════
    //  KODIK
    // ══════════════════════════════════════════════════════════════════
    var Kodik = {
        search: function (title, cb) {
            var url = CFG.kodik.search +
                '?token=' + CFG.kodik.token +
                '&title=' + encodeURIComponent(title) +
                '&limit=8&with_episodes=true&types=anime-serial,anime';
            get(url, function (d) { cb(d && d.results ? d.results : []); }, function () { cb([]); });
        },

        episodes: function (result) {
            var eps = [];
            if (!result || !result.seasons) return eps;
            Object.keys(result.seasons).sort(function(a,b){return parseInt(a)-parseInt(b);}).forEach(function (sn) {
                var s = result.seasons[sn];
                if (!s.episodes) return;
                Object.keys(s.episodes).sort(function(a,b){return parseInt(a)-parseInt(b);}).forEach(function (en) {
                    var ep = s.episodes[en];
                    eps.push({ num: en, season: sn, title: 'Серія ' + en, iframe: ep.link ? 'https:' + ep.link : '' });
                });
            });
            return eps;
        }
    };

    // ══════════════════════════════════════════════════════════════════
    //  КАТАЛОГ
    // ══════════════════════════════════════════════════════════════════
    function CatalogComponent(object) {
        var self  = this;
        self.mode = (object.data && object.data.mode) || 'catalog';
        self.page = 1;
        self.busy = false;
        self.query = '';

        self.create = function () {
            injectStyles();
            self.wrap = $('<div class="ap-catalog"></div>');
            self.head = $(
                '<div class="ap-head">' +
                '  <div class="ap-logo"><span class="ap-logo-icon">鬼</span>' +
                '    <div><b class="ap-logo-name">AniPlex</b>' +
                '    <small class="ap-logo-sub">AniLibria · Kodik · YummyAnime</small></div></div>' +
                '  <div class="ap-tabs">' +
                '    <div class="ap-tab selector" data-m="catalog">Каталог</div>' +
                '    <div class="ap-tab selector" data-m="updates">Новинки</div>' +
                '    <div class="ap-tab selector" data-m="search">&#128269; Пошук</div>' +
                '  </div>' +
                '</div>'
            );
            self.grid   = $('<div class="ap-grid"></div>');
            self.loader = $('<div class="ap-loader" style="display:none"><div class="ap-spin"></div></div>');

            self.wrap.append(self.head).append(self.grid).append(self.loader);

            self.head.find('.ap-tab').on('click', function () {
                var m = $(this).data('m');
                if (m === 'search') { self.doSearch(); } else { self.switchMode(m); }
            });

            self.switchMode(self.mode);
            return self.wrap;
        };

        self.switchMode = function (m) {
            self.mode = m; self.page = 1; self.grid.empty();
            self.head.find('.ap-tab').removeClass('active');
            self.head.find('[data-m="' + m + '"]').addClass('active');
            self.load();
        };

        self.doSearch = function () {
            Lampa.Modal.open({
                title: 'Пошук аніме',
                html:  Lampa.Template.get('modal_search', {}),
                onSearch: function (q) {
                    self.query = q; self.mode = 'search'; self.page = 1; self.grid.empty();
                    self.head.find('.ap-tab').removeClass('active');
                    self.head.find('[data-m="search"]').addClass('active');
                    Lampa.Modal.close();
                    self.load();
                }
            });
        };

        self.load = function () {
            if (self.busy) return;
            self.busy = true;
            self.loader.show();
            get(AniLibria.listUrl(self.mode, self.page, self.query), function (data) {
                self.busy = false;
                self.loader.hide();
                (data.list || []).forEach(function (item) {
                    self.addCard(AniLibria.buildCard(item));
                });
                if (self.page === 1) self.grid.find('.ap-card').first().trigger('focus');
            });
        };

        self.addCard = function (card) {
            var el = $(
                '<div class="ap-card selector" tabindex="0">' +
                '  <div class="ap-card-img"><img src="' + esc(card.poster) + '" loading="lazy" onerror="this.src=\'./img/img_error.svg\'">' +
                '  <span class="ap-score">' + esc(card.score) + '\u2605</span></div>' +
                '  <div class="ap-card-body">' +
                '    <div class="ap-card-title">' + esc(card.title) + '</div>' +
                '    <div class="ap-card-year">' + esc(card.year) + '</div>' +
                '  </div>' +
                '</div>'
            );
            el.on('click keydown', function (e) {
                if (e.type === 'click' || e.keyCode === 13) self.openDetail(card);
            });
            self.grid.append(el);
        };

        self.openDetail = function (card) {
            Lampa.Activity.push({
                url:       '',
                title:     card.title,
                component: 'aniplex_detail',
                card:      card
            });
        };

        self.start = function () {
            Lampa.Controller.add('content', {
                toggle: function () { Lampa.Controller.toggle('content'); self.grid.find('.selector').first().focus(); },
                up: Lampa.noop, down: Lampa.noop,
                back: function () { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        self.pause = self.stop = self.destroy = Lampa.noop;
    }

    // ══════════════════════════════════════════════════════════════════
    //  ДЕТАЛІ — власний екран без стандартного full-компонента
    // ══════════════════════════════════════════════════════════════════
    function DetailComponent(object) {
        var self    = this;
        var card    = object.card;
        self.sources = [];

        self.create = function () {
            injectStyles();
            self.wrap = $('<div class="ap-detail"></div>');
            self.renderShell();
            self.fetchSources();
            return self.wrap;
        };

        self.renderShell = function () {
            self.wrap.html(
                '<div class="ap-detail-bg" style="background-image:url(' + esc(card.backdrop || card.poster) + ')"></div>' +
                '<div class="ap-detail-body">' +
                '  <div class="ap-detail-poster"><img src="' + esc(card.poster) + '" onerror="this.src=\'./img/img_error.svg\'"></div>' +
                '  <div class="ap-detail-info">' +
                '    <h2 class="ap-detail-title">' + esc(card.title) + '</h2>' +
                '    <div class="ap-detail-meta">' +
                        esc(card.year) + (card.genres ? ' \u00b7 ' + esc(card.genres) : '') +
                '    </div>' +
                '    <div class="ap-detail-desc">' + esc(card.overview) + '</div>' +
                '    <div class="ap-detail-btns" id="ap-detail-btns">' +
                '      <div class="ap-loading-row">Завантаження джерел <span class="ap-spin-sm"></span></div>' +
                '    </div>' +
                '  </div>' +
                '</div>'
            );
            self.$btns = self.wrap.find('#ap-detail-btns');
        };

        self.fetchSources = function () {
            // 1. AniLibria — синхронно з даних картки
            var aliEps = AniLibria.episodes(card._raw);
            if (aliEps.length) {
                self.sources.push({
                    label:    '\u{1F535} AniLibria \u00b7 ' + aliEps.length + ' \u0441\u0435\u0440.',
                    dub:      'AniLibria',
                    episodes: aliEps,
                    type:     'hls'
                });
            }

            // 2. Kodik — асинхронно
            var titleEn = card.original_title || card.title;
            Kodik.search(titleEn, function (results) {
                results.forEach(function (r) {
                    var dub = r.translation && r.translation.title ? r.translation.title : 'Kodik';
                    var eps = Kodik.episodes(r);
                    if (eps.length) {
                        self.sources.push({
                            label:    '\u{1F7E0} ' + dub + ' \u00b7 ' + eps.length + ' \u0441\u0435\u0440. [Kodik]',
                            dub:      dub,
                            episodes: eps,
                            type:     'iframe'
                        });
                    } else if (r.link) {
                        self.sources.push({
                            label:    '\u{1F7E0} ' + dub + ' (\u0444\u0456\u043b\u044c\u043c) [Kodik]',
                            dub:      dub,
                            episodes: [{ num: '1', title: card.title, iframe: 'https:' + r.link }],
                            type:     'iframe'
                        });
                    }
                });
                self.renderButtons();
            });
        };

        self.renderButtons = function () {
            self.$btns.empty();

            if (!self.sources.length) {
                self.$btns.html('<div class="ap-no-src">Відео не знайдено в жодному джерелі</div>');
                return;
            }

            // Головна кнопка «Дивитись»
            var btnWatch = $('<div class="ap-btn ap-btn--watch selector" tabindex="0">\u25B6 \u0414\u0438\u0432\u0438\u0442\u0438\u0441\u044c</div>');
            btnWatch.on('click keydown', function (e) {
                if (e.type === 'click' || e.keyCode === 13) self.pickSource();
            });
            self.$btns.append(btnWatch);

            // Список озвучок
            var dubs = self.sources.map(function (s) { return s.dub; }).join(' \u00b7 ');
            self.$btns.append($('<div class="ap-dubs">\u041e\u0437\u0432\u0443\u0447\u043a\u0438: ' + esc(dubs) + '</div>'));

            btnWatch.focus();
        };

        self.pickSource = function () {
            if (self.sources.length === 1) {
                self.pickEpisode(self.sources[0]);
                return;
            }
            Lampa.Select.show({
                title: '\u041e\u0431\u0435\u0440\u0456\u0442\u044c \u0434\u0436\u0435\u0440\u0435\u043b\u043e / \u043e\u0437\u0432\u0443\u0447\u043a\u0443',
                items: self.sources.map(function (s, i) { return { title: s.label, index: i }; }),
                onSelect: function (item) { self.pickEpisode(self.sources[item.index]); },
                onBack: Lampa.noop
            });
        };

        self.pickEpisode = function (source) {
            if (source.episodes.length === 1) {
                self.play(source.episodes[0], source.type);
                return;
            }
            Lampa.Select.show({
                title: card.title + ' \u2014 ' + source.dub,
                items: source.episodes.map(function (ep) {
                    return { title: ep.title || ('\u0421\u0435\u0440\u0456\u044f ' + ep.num), ep: ep, type: source.type };
                }),
                onSelect: function (item) { self.play(item.ep, item.type); },
                onBack: Lampa.noop
            });
        };

        self.play = function (ep, type) {
            if (type === 'iframe' && ep.iframe) {
                Lampa.Activity.push({
                    url:       ep.iframe,
                    title:     card.title + ' \u2014 ' + (ep.title || ''),
                    component: 'iframe'
                });
            } else if (ep.file) {
                Lampa.Player.play({ url: ep.file, title: card.title + ' \u00b7 ' + ep.title, quality: ep.quality || {} });
            } else {
                Lampa.Noty.show('\u041f\u043e\u0441\u0438\u043b\u0430\u043d\u043d\u044f \u0432\u0456\u0434\u0441\u0443\u0442\u043d\u0454');
            }
        };

        self.start = function () {
            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.toggle('content');
                    var btn = self.wrap.find('.selector').first();
                    if (btn.length) btn.focus();
                },
                up: Lampa.noop, down: Lampa.noop,
                back: function () { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        self.pause = self.stop = self.destroy = Lampa.noop;
    }

    // ══════════════════════════════════════════════════════════════════
    //  СТИЛІ
    // ══════════════════════════════════════════════════════════════════
    function injectStyles() {
        if (document.getElementById('aniplex-css')) return;
        var s = document.createElement('style');
        s.id = 'aniplex-css';
        s.textContent = [
            '.ap-catalog{padding:1.6em 2em;}',
            '.ap-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.3em;flex-wrap:wrap;gap:.7em;}',
            '.ap-logo{display:flex;align-items:center;gap:.65em;}',
            '.ap-logo-icon{font-size:2em;}',
            '.ap-logo-name{display:block;font-size:1.45em;font-weight:800;color:#e63946;}',
            '.ap-logo-sub{display:block;font-size:.7em;color:rgba(255,255,255,.4);}',
            '.ap-tabs{display:flex;gap:.45em;flex-wrap:wrap;}',
            '.ap-tab{padding:.38em 1em;border-radius:2em;background:rgba(255,255,255,.08);cursor:pointer;font-size:.86em;transition:background .2s;}',
            '.ap-tab:hover,.ap-tab:focus{background:rgba(255,255,255,.18);}',
            '.ap-tab.active{background:#e63946;color:#fff;font-weight:700;}',
            '.ap-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:1em;}',
            '.ap-card{border-radius:9px;overflow:hidden;background:rgba(255,255,255,.06);cursor:pointer;outline:none;transition:transform .17s,box-shadow .17s;}',
            '.ap-card:hover,.ap-card:focus{transform:translateY(-4px) scale(1.035);box-shadow:0 10px 32px rgba(0,0,0,.6);}',
            '.ap-card-img{position:relative;aspect-ratio:2/3;overflow:hidden;}',
            '.ap-card-img img{width:100%;height:100%;object-fit:cover;display:block;}',
            '.ap-score{position:absolute;top:.35em;right:.35em;background:rgba(0,0,0,.78);color:#ffd166;font-size:.7em;padding:.18em .46em;border-radius:1em;font-weight:700;}',
            '.ap-card-body{padding:.5em .6em .65em;}',
            '.ap-card-title{font-size:.8em;font-weight:600;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}',
            '.ap-card-year{font-size:.7em;color:rgba(255,255,255,.4);margin-top:.2em;}',
            '.ap-loader{display:flex;justify-content:center;padding:3em;}',
            '.ap-detail{position:relative;min-height:100%;overflow:hidden;}',
            '.ap-detail-bg{position:absolute;inset:0;background-size:cover;background-position:center top;filter:blur(18px) brightness(.32);transform:scale(1.08);z-index:0;}',
            '.ap-detail-body{position:relative;z-index:1;display:flex;gap:2em;padding:2em;align-items:flex-start;flex-wrap:wrap;}',
            '.ap-detail-poster{width:180px;flex-shrink:0;border-radius:10px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.7);}',
            '.ap-detail-poster img{width:100%;display:block;}',
            '.ap-detail-info{flex:1;min-width:220px;}',
            '.ap-detail-title{font-size:1.55em;font-weight:800;margin:0 0 .3em;line-height:1.2;}',
            '.ap-detail-meta{font-size:.82em;color:rgba(255,255,255,.5);margin-bottom:.8em;}',
            '.ap-detail-desc{font-size:.84em;line-height:1.55;color:rgba(255,255,255,.78);max-height:7em;overflow:hidden;margin-bottom:1.2em;}',
            '.ap-detail-btns{display:flex;flex-direction:column;gap:.65em;align-items:flex-start;}',
            '.ap-btn{display:inline-flex;align-items:center;padding:.55em 1.7em;border-radius:2em;font-size:.95em;font-weight:700;cursor:pointer;outline:none;transition:transform .15s,box-shadow .15s;}',
            '.ap-btn--watch{background:#e63946;color:#fff;}',
            '.ap-btn--watch:hover,.ap-btn--watch:focus{transform:scale(1.05);box-shadow:0 6px 22px rgba(230,57,70,.6);}',
            '.ap-dubs{font-size:.74em;color:rgba(255,255,255,.4);}',
            '.ap-no-src{font-size:.84em;color:rgba(255,255,255,.38);}',
            '.ap-loading-row{font-size:.84em;color:rgba(255,255,255,.45);display:flex;align-items:center;gap:.5em;}',
            '.ap-spin{width:36px;height:36px;border:3px solid rgba(255,255,255,.1);border-top-color:#e63946;border-radius:50%;animation:ap-rot .75s linear infinite;}',
            '.ap-spin-sm{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.15);border-top-color:#e63946;border-radius:50%;animation:ap-rot .75s linear infinite;}',
            '@keyframes ap-rot{to{transform:rotate(360deg);}}'
        ].join('');
        document.head.appendChild(s);
    }

    // ══════════════════════════════════════════════════════════════════
    //  РЕЄСТРАЦІЯ
    // ══════════════════════════════════════════════════════════════════
    function init() {
        Lampa.Component.add('aniplex',        CatalogComponent);
        Lampa.Component.add('aniplex_detail', DetailComponent);

        var menuItem = {
            title:    'AniPlex',
            subtitle: 'AniLibria + Kodik + YummyAnime',
            icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>',
            action: function () {
                Lampa.Activity.push({ url: '', title: 'AniPlex', component: 'aniplex', data: { mode: 'catalog' } });
            }
        };

        function tryMenu() { if (Lampa.Menu && Lampa.Menu.add) Lampa.Menu.add(menuItem); }
        tryMenu();
        Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') tryMenu(); });

        console.log('[AniPlex] v2 завантажено');
    }

    if (window.Lampa) init();
    else window.addEventListener('load', function () { if (window.Lampa) init(); });

})();
