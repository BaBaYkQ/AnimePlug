// AniPlex Plugin for Lampa
// Sources: AniLibria (HLS) + Kodik (iframe)

(function() {

var API_ALI  = 'https://api.anilibria.tv/v3';
var IMG_ALI  = 'https://www.anilibria.tv';
var API_KOD  = 'https://kodikapi.com/search';
var TOK_KOD  = 'd7b9c4e3a1f8e2d6c0b5a9f3e7d1c8b4';

// ---------- helpers ----------

function ajax(url, ok, fail) {
    fetch(url)
        .then(function(r){ return r.json(); })
        .then(ok)
        .catch(function(e){ console.warn('[AniPlex]', e); if(fail) fail(); });
}

function imgUrl(p, base) {
    if (!p) return '';
    return p.indexOf('http') === 0 ? p : (base || '') + p;
}

function safeText(s) {
    return (s || '').toString()
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;');
}

// ---------- CSS ----------

function addStyles() {
    if (document.getElementById('aniplex_style')) return;
    var el = document.createElement('style');
    el.id  = 'aniplex_style';
    el.textContent = ''
        + '.aniplex_wrap{padding:20px 30px}'
        + '.aniplex_head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px}'
        + '.aniplex_logo{font-size:22px;font-weight:900;color:#e63946;letter-spacing:1px}'
        + '.aniplex_tabs{display:flex;gap:8px}'
        + '.aniplex_tab{padding:6px 16px;border-radius:20px;background:rgba(255,255,255,0.1);cursor:pointer;font-size:14px}'
        + '.aniplex_tab:hover,.aniplex_tab:focus{background:rgba(255,255,255,0.22);outline:none}'
        + '.aniplex_tab.on{background:#e63946;color:#fff;font-weight:700}'
        + '.aniplex_grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:14px}'
        + '.aniplex_card{border-radius:8px;overflow:hidden;background:rgba(255,255,255,0.07);cursor:pointer;outline:none}'
        + '.aniplex_card:hover,.aniplex_card:focus{transform:scale(1.04);box-shadow:0 8px 28px rgba(0,0,0,0.55)}'
        + '.aniplex_card img{width:100%;aspect-ratio:2/3;object-fit:cover;display:block}'
        + '.aniplex_card_body{padding:7px 9px 10px}'
        + '.aniplex_card_title{font-size:13px;font-weight:600;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}'
        + '.aniplex_card_year{font-size:11px;color:rgba(255,255,255,0.4);margin-top:3px}'
        + '.aniplex_spin_wrap{display:flex;justify-content:center;padding:40px}'
        + '.aniplex_spin{width:36px;height:36px;border:3px solid rgba(255,255,255,0.1);border-top-color:#e63946;border-radius:50%;animation:aniplex_rot 0.8s linear infinite}'
        + '@keyframes aniplex_rot{to{transform:rotate(360deg)}}'
        // detail
        + '.aniplex_detail{position:relative;overflow:hidden;min-height:100%}'
        + '.aniplex_detail_bg{position:absolute;top:0;left:0;right:0;bottom:0;background-size:cover;background-position:center;filter:blur(20px) brightness(0.3);transform:scale(1.1);z-index:0}'
        + '.aniplex_detail_inner{position:relative;z-index:1;display:flex;gap:24px;padding:24px;flex-wrap:wrap;align-items:flex-start}'
        + '.aniplex_detail_poster{width:170px;flex-shrink:0;border-radius:8px;overflow:hidden;box-shadow:0 10px 36px rgba(0,0,0,0.6)}'
        + '.aniplex_detail_poster img{width:100%;display:block}'
        + '.aniplex_detail_right{flex:1;min-width:200px}'
        + '.aniplex_detail_title{font-size:26px;font-weight:800;margin:0 0 6px;line-height:1.2}'
        + '.aniplex_detail_meta{font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:12px}'
        + '.aniplex_detail_desc{font-size:13px;line-height:1.55;color:rgba(255,255,255,0.75);max-height:100px;overflow:hidden;margin-bottom:18px}'
        + '.aniplex_btn{display:inline-block;padding:10px 28px;border-radius:24px;font-size:15px;font-weight:700;cursor:pointer;outline:none;margin-bottom:10px}'
        + '.aniplex_btn_play{background:#e63946;color:#fff}'
        + '.aniplex_btn_play:hover,.aniplex_btn_play:focus{background:#ff4d5a;box-shadow:0 4px 18px rgba(230,57,70,0.55)}'
        + '.aniplex_src_hint{font-size:12px;color:rgba(255,255,255,0.35);margin-top:4px}'
        + '.aniplex_loading_hint{font-size:13px;color:rgba(255,255,255,0.4);display:flex;align-items:center;gap:8px}'
        + '.aniplex_spin_sm{width:14px;height:14px;border:2px solid rgba(255,255,255,0.15);border-top-color:#e63946;border-radius:50%;animation:aniplex_rot 0.8s linear infinite;display:inline-block}'
        ;
    document.head.appendChild(el);
}

// ============================================================
//  CATALOG COMPONENT
// ============================================================

function CatalogComp(params) {
    var self   = this;
    self.params = params;
    self.mode  = (params.data && params.data.mode) || 'catalog';
    self.page  = 1;
    self.busy  = false;
    self.query = '';
    self.$grid = null;
    self.$spin = null;

    self.create = function() {
        addStyles();

        self.$root = $('<div class="aniplex_wrap"></div>');

        // header
        self.$root.append(
            '<div class="aniplex_head">'
          + '<div class="aniplex_logo">&#9760; AniPlex</div>'
          + '<div class="aniplex_tabs">'
          + '<div class="aniplex_tab selector" data-mode="catalog">Каталог</div>'
          + '<div class="aniplex_tab selector" data-mode="updates">Новинки</div>'
          + '<div class="aniplex_tab selector" data-mode="search">Пошук</div>'
          + '</div></div>'
        );

        self.$grid = $('<div class="aniplex_grid"></div>');
        self.$spin = $('<div class="aniplex_spin_wrap" style="display:none"><div class="aniplex_spin"></div></div>');

        self.$root.append(self.$grid).append(self.$spin);

        self.$root.find('.aniplex_tab').on('click', function() {
            var m = $(this).data('mode');
            if (m === 'search') { self.openSearch(); }
            else { self.go(m); }
        });

        self.go(self.mode);

        return self.$root;
    };

    self.go = function(m) {
        self.mode = m;
        self.page = 1;
        self.$grid.empty();
        self.$root.find('.aniplex_tab').removeClass('on');
        self.$root.find('[data-mode="' + m + '"]').addClass('on');
        self.load();
    };

    self.openSearch = function() {
        Lampa.Modal.open({
            title: 'Пошук аніме',
            html: Lampa.Template.get('modal_search', {}),
            onSearch: function(q) {
                self.query = q;
                self.mode  = 'search';
                self.page  = 1;
                self.$grid.empty();
                self.$root.find('.aniplex_tab').removeClass('on');
                self.$root.find('[data-mode="search"]').addClass('on');
                Lampa.Modal.close();
                self.load();
            }
        });
    };

    self.load = function() {
        if (self.busy) return;
        self.busy = true;
        self.$spin.show();

        var url;
        var f = '&filter=id,names,posters,description,genres,season,rating,player';
        if (self.mode === 'search' && self.query) {
            url = API_ALI + '/title/search?search=' + encodeURIComponent(self.query) + '&limit=20&page=' + self.page + f;
        } else if (self.mode === 'updates') {
            url = API_ALI + '/title/updates?limit=20&page=' + self.page + f;
        } else {
            url = API_ALI + '/title/list?limit=20&page=' + self.page + f + '&order_by=rating_votes&sort_direction=1';
        }

        ajax(url, function(data) {
            self.busy = false;
            self.$spin.hide();
            var list = data.list || [];
            list.forEach(function(item) { self.addCard(item); });
            if (self.page === 1 && list.length) {
                self.$grid.find('.aniplex_card').first().focus();
            }
        }, function() {
            self.busy = false;
            self.$spin.hide();
            Lampa.Noty.show('Помилка завантаження AniLibria');
        });
    };

    self.addCard = function(item) {
        var title  = (item.names && item.names.ru) || (item.names && item.names.en) || '—';
        var poster = imgUrl(item.posters && item.posters.medium && item.posters.medium.url, IMG_ALI);
        var year   = (item.season && item.season.year) ? String(item.season.year) : '';

        var $card = $(
            '<div class="aniplex_card selector" tabindex="0">'
          + '<img src="' + safeText(poster) + '" loading="lazy" onerror="this.src=\'./img/img_error.svg\'">'
          + '<div class="aniplex_card_body">'
          + '<div class="aniplex_card_title">' + safeText(title) + '</div>'
          + '<div class="aniplex_card_year">' + safeText(year) + '</div>'
          + '</div></div>'
        );

        $card.on('click keydown', function(e) {
            if (e.type === 'click' || e.keyCode === 13) {
                self.openDetail(item, title, poster);
            }
        });

        self.$grid.append($card);
    };

    self.openDetail = function(raw, title, poster) {
        Lampa.Activity.push({
            url:       '',
            title:     title,
            component: 'aniplex_detail',
            _ani_raw:  raw,
            _ani_poster: poster
        });
    };

    self.start = function() {
        Lampa.Controller.add('content', {
            toggle: function() {
                Lampa.Controller.toggle('content');
                self.$grid.find('.selector').first().focus();
            },
            up:   Lampa.noop,
            down: Lampa.noop,
            back: function() { Lampa.Activity.backward(); }
        });
        Lampa.Controller.toggle('content');
    };

    self.pause   = function() {};
    self.stop    = function() {};
    self.destroy = function() {};
}

// ============================================================
//  DETAIL COMPONENT  — власний екран, без full/card
// ============================================================

function DetailComp(params) {
    var self    = this;
    self.params = params;
    self.raw    = params._ani_raw    || {};
    self.poster = params._ani_poster || '';
    self.title  = params.title       || '';
    self.sources = [];
    self.$btns   = null;

    self.create = function() {
        addStyles();

        var backdrop = imgUrl(
            self.raw.posters && self.raw.posters.original && self.raw.posters.original.url,
            IMG_ALI
        ) || self.poster;

        var desc  = (self.raw.description || '').substring(0, 400);
        var year  = self.raw.season && self.raw.season.year ? String(self.raw.season.year) : '';
        var genres = (self.raw.genres || []).join(', ');

        self.$root = $(
            '<div class="aniplex_detail">'
          + '<div class="aniplex_detail_bg" style="background-image:url(' + safeText(backdrop) + ')"></div>'
          + '<div class="aniplex_detail_inner">'
          + '<div class="aniplex_detail_poster"><img src="' + safeText(self.poster) + '" onerror="this.src=\'./img/img_error.svg\'"></div>'
          + '<div class="aniplex_detail_right">'
          + '<div class="aniplex_detail_title">' + safeText(self.title) + '</div>'
          + '<div class="aniplex_detail_meta">' + safeText(year) + (genres ? ' &bull; ' + safeText(genres) : '') + '</div>'
          + '<div class="aniplex_detail_desc">' + safeText(desc) + '</div>'
          + '<div id="aniplex_btns"><div class="aniplex_loading_hint">Завантаження... <span class="aniplex_spin_sm"></span></div></div>'
          + '</div></div></div>'
        );

        self.$btns = self.$root.find('#aniplex_btns');

        self.loadSources();

        return self.$root;
    };

    self.loadSources = function() {
        // --- AniLibria episodes ---
        var aliEps = [];
        if (self.raw.player && self.raw.player.list) {
            var host = self.raw.player.host ? 'https://' + self.raw.player.host : 'https://cache.libria.fun';
            var list = self.raw.player.list;
            Object.keys(list).sort(function(a,b){ return parseInt(a)-parseInt(b); }).forEach(function(n) {
                var ep  = list[n];
                var hls = ep.hls || {};
                var q   = {};
                if (hls.fhd) q['1080p'] = host + hls.fhd;
                if (hls.hd)  q['720p']  = host + hls.hd;
                if (hls.sd)  q['480p']  = host + hls.sd;
                var file = q['1080p'] || q['720p'] || q['480p'] || '';
                aliEps.push({ num: n, title: ep.name || ('Серія ' + n), file: file, quality: q });
            });
        }
        if (aliEps.length) {
            self.sources.push({ label: 'AniLibria (' + aliEps.length + ' сер.)', dub: 'AniLibria', episodes: aliEps, type: 'hls' });
        }

        // --- Kodik ---
        var titleEn = (self.raw.names && self.raw.names.en) || self.title;
        var url = API_KOD
            + '?token=' + TOK_KOD
            + '&title=' + encodeURIComponent(titleEn)
            + '&limit=8&with_episodes=true&types=anime-serial,anime';

        ajax(url, function(data) {
            var results = data && data.results ? data.results : [];
            results.forEach(function(r) {
                var dub  = (r.translation && r.translation.title) ? r.translation.title : 'Kodik';
                var eps  = [];
                if (r.seasons) {
                    Object.keys(r.seasons).sort(function(a,b){return parseInt(a)-parseInt(b);}).forEach(function(sn) {
                        var s = r.seasons[sn];
                        if (!s.episodes) return;
                        Object.keys(s.episodes).sort(function(a,b){return parseInt(a)-parseInt(b);}).forEach(function(en) {
                            var ep = s.episodes[en];
                            if (ep.link) eps.push({ num: en, title: 'Серія ' + en, iframe: 'https:' + ep.link });
                        });
                    });
                }
                if (eps.length) {
                    self.sources.push({ label: dub + ' (' + eps.length + ' сер.) [Kodik]', dub: dub, episodes: eps, type: 'iframe' });
                } else if (r.link) {
                    self.sources.push({ label: dub + ' [Kodik]', dub: dub, episodes: [{ num:'1', title: self.title, iframe: 'https:' + r.link }], type: 'iframe' });
                }
            });
            self.renderButtons();
        }, function() {
            self.renderButtons();
        });
    };

    self.renderButtons = function() {
        self.$btns.empty();

        if (!self.sources.length) {
            self.$btns.html('<div style="color:rgba(255,255,255,0.4);font-size:13px">Відео не знайдено</div>');
            return;
        }

        var $btn = $(
            '<div class="aniplex_btn aniplex_btn_play selector" tabindex="0">'
          + '&#9654; Дивитись'
          + '</div>'
        );
        $btn.on('click keydown', function(e) {
            if (e.type === 'click' || e.keyCode === 13) self.pickSource();
        });

        var dubs = self.sources.map(function(s){ return s.dub; }).join(' · ');
        self.$btns.append($btn);
        self.$btns.append('<div class="aniplex_src_hint">Джерела: ' + safeText(dubs) + '</div>');

        $btn.focus();
    };

    self.pickSource = function() {
        if (self.sources.length === 1) { self.pickEp(self.sources[0]); return; }
        Lampa.Select.show({
            title: 'Оберіть озвучку',
            items: self.sources.map(function(s, i) { return { title: s.label, index: i }; }),
            onSelect: function(item) { self.pickEp(self.sources[item.index]); },
            onBack: Lampa.noop
        });
    };

    self.pickEp = function(src) {
        if (src.episodes.length === 1) { self.play(src.episodes[0], src.type); return; }
        Lampa.Select.show({
            title: self.title + ' — ' + src.dub,
            items: src.episodes.map(function(ep) {
                return { title: ep.title || ('Серія ' + ep.num), ep: ep, type: src.type };
            }),
            onSelect: function(item) { self.play(item.ep, item.type); },
            onBack: Lampa.noop
        });
    };

    self.play = function(ep, type) {
        if (type === 'iframe' && ep.iframe) {
            Lampa.Activity.push({ url: ep.iframe, title: self.title + ' — ' + ep.title, component: 'iframe' });
        } else if (ep.file) {
            Lampa.Player.play({ url: ep.file, title: self.title + ' — ' + ep.title, quality: ep.quality || {} });
        } else {
            Lampa.Noty.show('Посилання на відео відсутнє');
        }
    };

    self.start = function() {
        Lampa.Controller.add('content', {
            toggle: function() {
                Lampa.Controller.toggle('content');
                var $f = self.$root.find('.selector').first();
                if ($f.length) $f.focus();
            },
            up:   Lampa.noop,
            down: Lampa.noop,
            back: function() { Lampa.Activity.backward(); }
        });
        Lampa.Controller.toggle('content');
    };

    self.pause   = function() {};
    self.stop    = function() {};
    self.destroy = function() {};
}

// ============================================================
//  INIT
// ============================================================

function start() {
    if (!window.Lampa) return;

    Lampa.Component.add('aniplex',        CatalogComp);
    Lampa.Component.add('aniplex_detail', DetailComp);

    var item = {
        title:    'AniPlex',
        subtitle: 'Аніме з озвучкою',
        icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>',
        action: function() {
            Lampa.Activity.push({ url: '', title: 'AniPlex', component: 'aniplex', data: { mode: 'catalog' } });
        }
    };

    if (Lampa.Menu && Lampa.Menu.add) {
        Lampa.Menu.add(item);
    }

    Lampa.Listener.follow('app', function(e) {
        if (e.type === 'ready' && Lampa.Menu && Lampa.Menu.add) {
            Lampa.Menu.add(item);
        }
    });

    console.log('[AniPlex] Plugin loaded OK');
}

if (window.Lampa) {
    start();
} else {
    var _t = setInterval(function() {
        if (window.Lampa) { clearInterval(_t); start(); }
    }, 100);
}

})();
