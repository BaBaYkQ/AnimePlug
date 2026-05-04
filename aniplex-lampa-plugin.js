(function(){

function start(){
if(!window.Lampa) return;

var API = 'https://api.anilibria.tv/v3';

// ===== helper =====
function get(url, ok, err){
    fetch(url)
    .then(r=>r.json())
    .then(ok)
    .catch(()=>{ if(err) err(); });
}

// ===== COMPONENT =====
function AniPlex(params){
var self = this;

self.create = function(){
    self.el = $('<div style="padding:20px"></div>');

    self.header = $('<div style="margin-bottom:20px"></div>');
    self.header.append('<button class="ap_btn" data-m="updates">Новинки</button>');
    self.header.append('<button class="ap_btn" data-m="catalog">Каталог</button>');
    self.header.append('<button class="ap_btn" data-m="search">Пошук</button>');

    self.list = $('<div></div>');

    self.el.append('<h2>AniPlex PRO</h2>');
    self.el.append(self.header);
    self.el.append(self.list);

    self.header.find('.ap_btn').on('click', function(){
        var m = $(this).data('m');
        if(m === 'search') search();
        else load(m);
    });

    load('updates');

    return self.el;
};

// ===== LOAD =====
function load(mode){
    self.list.empty();

    var url = API + '/title/updates?limit=30';
    if(mode === 'catalog'){
        url = API + '/title/list?limit=30&order_by=rating';
    }

    get(url, function(data){
        (data.list || []).forEach(addCard);
    });
}

// ===== SEARCH =====
function search(){
    Lampa.Modal.open({
        title:'Пошук',
        html:Lampa.Template.get('modal_search',{}),
        onSearch:function(q){
            self.list.empty();
            get(API+'/title/search?search='+encodeURIComponent(q), function(data){
                (data.list || []).forEach(addCard);
            });
            Lampa.Modal.close();
        }
    });
}

// ===== CARD =====
function addCard(i){
    var title = (i.names && i.names.ru) || (i.names && i.names.en) || '—';

    var el = $('<div style="margin:10px 0;padding:10px;background:#222;cursor:pointer;border-radius:8px">'+title+'</div>');

    el.on('click', function(){
        openDetail(i, title);
    });

    self.list.append(el);
}

// ===== DETAIL =====
function openDetail(i, title){
    var eps = [];

    try{
        var list = i.player.list;
        var host = 'https://cache.libria.fun';

        Object.keys(list).sort((a,b)=>a-b).forEach(function(n){
            var ep = list[n];
            eps.push({
                title:'Серія '+n,
                url: host + (ep.hls.fhd || ep.hls.hd || ep.hls.sd)
            });
        });
    }catch(e){}

    if(!eps.length){
        Lampa.Noty.show('Нема серій');
        return;
    }

    Lampa.Select.show({
        title:title,
        items: eps.map(e=>({title:e.title, url:e.url})),
        onSelect:function(item){
            Lampa.Player.play({
                url:item.url,
                title:title + ' — ' + item.title
            });
        }
    });
}

// ===== INIT =====
Lampa.Component.add('aniplex', AniPlex);

Lampa.Menu.add({
    title:'AniPlex PRO',
    action:function(){
        Lampa.Activity.push({
            url:'',
            title:'AniPlex',
            component:'aniplex'
        });
    }
});

console.log('AniPlex PRO loaded');
}

if(window.Lampa) start();
else{
    var t=setInterval(()=>{
        if(window.Lampa){
            clearInterval(t);
            start();
        }
    },200);
}

})();
