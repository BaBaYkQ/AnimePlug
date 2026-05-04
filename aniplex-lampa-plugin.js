(function () {
    'use strict';

    // ══════════════════════════════════════════════════════════════════
    //  КОНФІГ
    // ══════════════════════════════════════════════════════════════════
    var CFG = {
        anilibria: {
            api:   'https://api.anilibria.tv/v3',
            img:   'https://www.anilibria.tv',
            label: 'AniLibria',
            color: '#e63946'
        },
        yummyAnime: {
            base:  'https://yummyanime.tv',
            label: 'YummyAnime.TV',
            color: '#f4a261'
        },
        yummyOld: {
            base:  'https://old.yummyani.me',
            label: 'YummyAnime (старый)',
            color: '#e9c46a'
        },
        // Kodik — універсальний плеєр, який використовують обидва YummyAnime-сайти
        kodik: {
            search: 'https://kodikapi.com/search',
            // token публічний (демо) — якщо не працює, замінити своїм
            token:  'd7b9c4e3a1f8e2d6c0b5a9f3e7d1c8b4'
        }
    };

    // ══════════════════════════════════════════════════════════════════
    //  УТИЛІТИ
    // ══════════════════════════════════════════════════════════════════
    function get(url, cb) {
        fetch(url)
            .then(function (r) { return r.json(); })
            .then(cb)
            .catch(function (e) {
                console.warn('[AniPlex]', url, e);
            });
    }

    function esc(s) {
        return String(s || '').replace(/[&<>"']/g, function (c) {
            return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
        });
    }

    function posterUrl(path, base) {
        if (!path) return './img/img_error.svg';
        return path.startsWith('http') ? path : (base || '') + path;
    }

    // ══════════════════════════════════════════════════════════════════
    //  ANILIBRIA API
    // ══════════════════════════════════════════════════════════════════
    var AniLibria = {
        buildCard: function (item) {
            var poster = posterUrl(
                item.posters && item.posters.medium && item.posters.medium.url,
                CFG.anilibria.img
            );
            var title = (item.names && item.names.ru) || (item.names && item.names.en) || '—';
            return {
                id:             item.id,
                title:          title,
                original_title: (item.names && item.names.en) || '',
                poster:         poster,
                poster_path:    poster,
                backdrop_path:  posterUrl(item.posters && item.posters.original && item.posters.original.url, CFG.anilibria.img),
                overview:       item.description || '',
                vote_average:   item.rating ? Number(item.rating.average || 0).toFixed(1) : '0',
                release_date:   item.season && item.season.year ? item.season.year + '-01-01' : '',
                genres:         (item.genres || []).map(function (g) { return { name: g }; }),
                media_type:     'tv',
                _source:        'anilibria',
                _raw:           item
            };
        },

        listUrl: function (mode, page, query) {
            var f = '&filter=id,names,posters,description,genres,season,rating,player';
            if (mode === 'search' && query) {
                return CFG.anilibria.api + '/title/search?search=' + encodeURIComponent(query) +
                    '&limit=20&page=' + page + f;
            }
            if (mode === 'updates') {
                return CFG.anilibria.api + '/title/updates?limit=20&page=' + page + f;
            }
            return CFG.anilibria.api + '/title/list?limit=20&page=' + page + f +
                '&order_by=rating_votes&sort_direction=1';
        },

        episodes: function (raw) {
            if (!raw.player || !raw.player.list) return [];
            var host = raw.player.host ? 'https://' + raw.player.host : 'https://cache.libria.fun';
            return Object.keys(raw.player.list)
                .sort(function (a, b) { return parseInt(a) - parseInt(b); })
                .map(function (n) {
                    var ep = raw.player.list[n];
                    var hls = ep.hls || {};
                    var q   = {};
                    if (hls.fhd) q['1080p'] = host + hls.fhd;
                    if (hls.hd)  q['720p']  = host + hls.hd;
                    if (hls.sd)  q['480p']  = host + hls.sd;
                    return {
                        episode: n,
                        title:   ep.name || ('Серія ' + n),
                        file:    q['1080p'] || q['720p'] || q['480p'] || '',
                        quality: q,
                        source:  'AniLibria'
                    };
                });
        }
    };

    // ══════════════════════════════════════════════════════════════════
    //  KODIK (плеєр для YummyAnime та інших сайтів)
    //  Kodik — агрегатор, який надає HLS/iframe для багатьох аніме-сайтів
    //  включаючи yummyanime.tv, anime1.best, animesss.com
    // ══════════════════════════════════════════════════════════════════
    var Kodik = {
        // Пошук за назвою
        search: function (title, cb) {
            var url = CFG.kodik.search +
                '?token=' + CFG.kodik.token +
                '&title=' + encodeURIComponent(title) +
                '&limit=5&with_episodes=true&anime_status=ongoing,released' +
                '&types=anime-serial,anime';
            get(url, function (data) {
                cb(data && data.results ? data.results : []);
            });
        },

        // Отримати пряме посилання на відео через iframe Kodik
        playerUrl: function (kodikId) {
            // Kodik iframe URL формат
            return 'https://kodik.info' + kodikId;
        },

        // Парсити епізоди з результатів Kodik
        parseEpisodes: function (result) {
            if (!result || !result.seasons) return [];
            var episodes = [];
            Object.keys(result.seasons).forEach(function (sNum) {
                var season = result.seasons[sNum];
                if (!season.episodes) return;
                Object.keys(season.episodes).forEach(function (eNum) {
                    var ep = season.episodes[eNum];
                    episodes.push({
                        episode:  eNum,
                        season:   sNum,
                        title:    'Серія ' + eNum,
                        // Kodik iframe для конкретного епізоду
                        iframe:   ep.link ? ('https:' + ep.link) : '',
                        source:   'Kodik / YummyAnime'
                    });
                });
            });
            return episodes.sort(function (a, b) {
                return parseInt(a.episode) - parseInt(b.episode);
            });
        }
    };

    // ══════════════════════════════════════════════════════════════════
    //  КОМПОНЕНТ ВИБОРУ ДЖЕРЕЛА
    // ══════════════════════════════════════════════════════════════════
    function showSourcePicker(card, anilibriaEps, kodikResults) {
        var sources = [];

        // AniLibria
        if (anilibriaEps && anilibriaEps.length) {
            sources.push({
                label:    '🔵 AniLibria (HLS, ' + anilibriaEps.length + ' еп.)',
                color:    CFG.anilibria.color,
                episodes: anilibriaEps,
                type:     'hls'
            });
        }

        // Kodik-результати (YummyAnime та ін.)
        if (kodikResults && kodikResults.length) {
            kodikResults.forEach(function (r) {
                var dubbing = r.translation && r.translation.title ? r.translation.title : 'Озвучка';
                var eps = Kodik.parseEpisodes(r);
                if (eps.length) {
                    sources.push({
                        label:    '🟠 ' + dubbing + ' [Kodik] (' + eps.length + ' еп.)',
                        color:    CFG.yummyAnime.color,
                        episodes: eps,
                        type:     'iframe',
                        raw:      r
                    });
                } else if (r.link) {
                    // Фільм або без розбивки — один iframe
                    sources.push({
                        label:    '🟠 ' + dubbing + ' [Kodik] (фільм/1 еп.)',
                        color:    CFG.yummyAnime.color,
                        episodes: [{
                            episode: '1',
                            title:   card.title,
                            iframe:  'https:' + r.link,
                            source:  'Kodik'
                        }],
                        type:     'iframe',
                        raw:      r
                    });
                }
            });
        }

        if (!sources.length) {
            Lampa.Noty.show('Відео не знайдено ні в одному джерелі');
            return;
        }

        if (sources.length === 1) {
            openEpisodeList(card, sources[0]);
            return;
        }

        // Показати меню вибору джерела
        var items = sources.map(function (s, i) {
            return { title: s.label, index: i };
        });

        Lampa.Select.show({
            title:  'Оберіть джерело / озвучку',
            items:  items,
            onSelect: function (item) {
                openEpisodeList(card, sources[item.index]);
            },
            onBack: Lampa.noop
        });
    }

    function openEpisodeList(card, source) {
        if (source.episodes.length === 1) {
            playEpisode(card, source.episodes[0], source.type);
            return;
        }

        var items = source.episodes.map(function (ep) {
            return { title: ep.title || ('Серія ' + ep.episode), ep: ep, type: source.type };
        });

        Lampa.Select.show({
            title:  card.title + ' — ' + (source.label || 'Серії'),
            items:  items,
            onSelect: function (item) {
                playEpisode(card, item.ep, item.type);
            },
            onBack: Lampa.noop
        });
    }

    function playEpisode(card, ep, type) {
        if (type === 'iframe' && ep.iframe) {
            // Відкрити iframe-плеєр
            Lampa.Activity.push({
                url:       ep.iframe,
                title:     card.title + ' — ' + ep.title,
                component: 'iframe',
                card:      card
            });
        } else if (ep.file || (ep.quality && Object.keys(ep.quality).length)) {
            // HLS / пряме посилання
            var file = ep.file;
            var files = ep.quality || {};
            Lampa.Player.play({
                url:     file,
                title:   card.title + ' · ' + ep.title,
                quality: files
            });
        } else {
            Lampa.Noty.show('Посилання на відео відсутнє');
        }
    }

    // ══════════════════════════════════════════════════════════════════
    //  ГОЛОВНИЙ КОМПОНЕНТ
    // ══════════════════════════════════════════════════════════════════
    function AniPlexComponent(object) {
        var comp   = this;
        comp.activity = object;
        comp.scroll   = new Lampa.Scroll({ mask: true, over: true });
        comp.items    = [];
        comp.page     = 1;
        comp.loading  = false;
        comp.query    = '';
        comp.mode     = (object.data && object.data.mode) || 'catalog';

        comp.create = function () {
            comp.view = render();
            return comp.view;
        };

        function render() {
            var html = $([
                '<div class="aniplex-wrap">',
                '  <div class="aniplex-header">',
                '    <div class="aniplex-logo">',
                '      <span class="aniplex-logo__kanji">鬼</span>',
                '      <div class="aniplex-logo__titles">',
                '        <span class="aniplex-logo__main">AniPlex</span>',
                '        <span class="aniplex-logo__sub">AniLibria · YummyAnime · Kodik</span>',
                '      </div>',
                '    </div>',
                '    <div class="aniplex-tabs" id="ap-tabs">',
                '      <div class="aniplex-tab selector" data-mode="catalog">Каталог</div>',
                '      <div class="aniplex-tab selector" data-mode="updates">Новинки</div>',
                '      <div class="aniplex-tab selector" data-mode="search">🔍 Пошук</div>',
                '    </div>',
                '  </div>',
                '  <div class="aniplex-grid" id="ap-grid"></div>',
                '  <div class="aniplex-loader" id="ap-loader" style="display:none">',
                '    <div class="aniplex-spinner"></div>',
                '  </div>',
                '</div>'
            ].join(''));

            comp.$grid   = html.find('#ap-grid');
            comp.$loader = html.find('#ap-loader');
            comp.$tabs   = html.find('.aniplex-tab');

            injectStyles();

            comp.$tabs.on('click', function () {
                var mode = $(this).data('mode');
                if (mode === 'search') { comp.openSearch(); }
                else { comp.switchMode(mode); }
            });

            comp.switchMode(comp.mode);
            return html;
        }

        comp.switchMode = function (mode) {
            comp.mode = mode; comp.page = 1; comp.items = [];
            comp.$grid.empty();
            comp.$tabs.removeClass('active');
            comp.$tabs.filter('[data-mode="' + mode + '"]').addClass('active');
            comp.load();
        };

        comp.openSearch = function () {
            Lampa.Modal.open({
                title: 'Пошук аніме',
                html:  Lampa.Template.get('modal_search', {}),
                onSearch: function (q) {
                    comp.query = q; comp.mode = 'search';
                    comp.page  = 1; comp.items = [];
                    comp.$grid.empty();
                    comp.$tabs.removeClass('active');
                    comp.$tabs.filter('[data-mode="search"]').addClass('active');
                    Lampa.Modal.close();
                    comp.load();
                }
            });
        };

        comp.load = function () {
            if (comp.loading) return;
            comp.loading = true;
            comp.$loader.show();

            var url = AniLibria.listUrl(comp.mode, comp.page, comp.query);
            get(url, function (data) {
                comp.loading = false;
                comp.$loader.hide();
                (data.list || []).forEach(function (item) {
                    var card = AniLibria.buildCard(item);
                    comp.items.push(card);
                    comp.appendCard(card);
                });
                if (comp.page === 1 && comp.items.length) {
                    comp.$grid.find('.ap-card').first().focus();
                }
            });
        };

        comp.appendCard = function (card) {
            var year = card.release_date ? card.release_date.substr(0, 4) : '';
            var el = $([
                '<div class="ap-card selector" tabindex="0">',
                '  <div class="ap-card__img">',
                '    <img src="' + esc(card.poster) + '" loading="lazy" onerror="this.src=\'./img/img_error.svg\'">',
                '    <span class="ap-card__score">' + esc(card.vote_average) + '★</span>',
                '  </div>',
                '  <div class="ap-card__body">',
                '    <div class="ap-card__title">' + esc(card.title) + '</div>',
                '    <div class="ap-card__meta">' + esc(year) + '</div>',
                '    <div class="ap-card__sources">',
                '      <span class="ap-badge" style="background:' + CFG.anilibria.color + '">AniLibria</span>',
                '      <span class="ap-badge" style="background:' + CFG.yummyAnime.color + '">Kodik</span>',
                '    </div>',
                '  </div>',
                '</div>'
            ].join(''));

            el.on('click keydown', function (e) {
                if (e.type === 'click' || e.keyCode === 13) comp.openCard(card);
            });
            comp.$grid.append(el);
        };

        comp.openCard = function (card) {
            comp.$loader.show();
            var raw    = card._raw;
            var title  = card.original_title || card.title;
            var aliEps = AniLibria.episodes(raw);
            var done   = 0;
            var kodikRes = [];

            function tryShow() {
                done++;
                if (done >= 2) {
                    comp.$loader.hide();
                    showSourcePicker(card, aliEps, kodikRes);
                }
            }

            // AniLibria епізоди вже готові
            done = 1;

            // Kodik пошук по англійській назві
            Kodik.search(title, function (results) {
                kodikRes = results;
                tryShow();
            });
        };

        comp.start = function () {
            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.toggle('content');
                    comp.$grid.find('.selector').first().focus();
                },
                up: Lampa.noop, down: Lampa.noop,
                back: function () { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        comp.pause = comp.stop = comp.destroy = Lampa.noop;
    }

    // ══════════════════════════════════════════════════════════════════
    //  СТИЛІ
    // ══════════════════════════════════════════════════════════════════
    function injectStyles() {
        if (document.getElementById('aniplex-css')) return;
        var s = document.createElement('style');
        s.id = 'aniplex-css';
        s.textContent = [
            /* Wrap */
            '.aniplex-wrap{padding:1.8em 2em;}',

            /* Header */
            '.aniplex-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.4em;flex-wrap:wrap;gap:.8em;}',
            '.aniplex-logo{display:flex;align-items:center;gap:.7em;}',
            '.aniplex-logo__kanji{font-size:2.2em;line-height:1;}',
            '.aniplex-logo__main{display:block;font-size:1.5em;font-weight:800;color:#e63946;letter-spacing:.03em;}',
            '.aniplex-logo__sub{display:block;font-size:.72em;color:rgba(255,255,255,.45);margin-top:.1em;}',

            /* Tabs */
            '.aniplex-tabs{display:flex;gap:.5em;flex-wrap:wrap;}',
            '.aniplex-tab{padding:.4em 1.1em;border-radius:2em;background:rgba(255,255,255,.08);cursor:pointer;font-size:.88em;transition:background .2s;}',
            '.aniplex-tab:hover,.aniplex-tab:focus{background:rgba(255,255,255,.18);}',
            '.aniplex-tab.active{background:#e63946;color:#fff;font-weight:700;}',

            /* Grid */
            '.aniplex-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:1.1em;}',

            /* Card */
            '.ap-card{border-radius:10px;overflow:hidden;background:rgba(255,255,255,.06);cursor:pointer;outline:none;transition:transform .18s,box-shadow .18s;}',
            '.ap-card:hover,.ap-card:focus{transform:translateY(-4px) scale(1.03);box-shadow:0 10px 36px rgba(0,0,0,.55);}',
            '.ap-card__img{position:relative;aspect-ratio:2/3;overflow:hidden;}',
            '.ap-card__img img{width:100%;height:100%;object-fit:cover;display:block;}',
            '.ap-card__score{position:absolute;top:.4em;right:.4em;background:rgba(0,0,0,.75);color:#ffd166;font-size:.72em;padding:.2em .5em;border-radius:1em;font-weight:700;}',
            '.ap-card__body{padding:.55em .65em .7em;}',
            '.ap-card__title{font-size:.82em;font-weight:600;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}',
            '.ap-card__meta{font-size:.72em;color:rgba(255,255,255,.45);margin-top:.25em;}',
            '.ap-card__sources{display:flex;flex-wrap:wrap;gap:.3em;margin-top:.4em;}',
            '.ap-badge{font-size:.62em;padding:.15em .45em;border-radius:1em;color:#fff;font-weight:600;opacity:.85;}',

            /* Loader */
            '.aniplex-loader{display:flex;justify-content:center;padding:3em;}',
            '.aniplex-spinner{width:38px;height:38px;border:3px solid rgba(255,255,255,.12);border-top-color:#e63946;border-radius:50%;animation:ap-spin .75s linear infinite;}',
            '@keyframes ap-spin{to{transform:rotate(360deg);}}'
        ].join('\n');
        document.head.appendChild(s);
    }

    // ══════════════════════════════════════════════════════════════════
    //  РЕЄСТРАЦІЯ
    // ══════════════════════════════════════════════════════════════════
    function init() {
        Lampa.Component.add('aniplex', AniPlexComponent);

        var menuItem = {
            title:    'AniPlex',
            subtitle: 'AniLibria + YummyAnime + Kodik',
            icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>',
            action: function () {
                Lampa.Activity.push({
                    url:       '',
                    title:     'AniPlex — Аніме',
                    component: 'aniplex',
                    data:      { mode: 'catalog' }
                });
            }
        };

        function tryAddMenu() {
            if (Lampa.Menu && Lampa.Menu.add) Lampa.Menu.add(menuItem);
        }

        tryAddMenu();
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') tryAddMenu();
        });

        console.log('[AniPlex Plugin] Завантажено ✓  (AniLibria + Kodik/YummyAnime)');
    }

    if (window.Lampa) { init(); }
    else { window.addEventListener('load', function () { if (window.Lampa) init(); }); }

})();
