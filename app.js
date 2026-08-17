// TubeFlix - Aplicação JavaScript

// Zoom padrão aplicado às capas (miniaturas horizontais do YouTube exibidas em pôsteres verticais).
// Um valor abaixo de 100 evita ampliar demais a imagem para preencher o quadro vertical,
// centralizando o recorte e preservando mais qualidade/nitidez da capa.
const DEFAULT_POSTER_ZOOM = 85;

// 1. Configuração do Firebase Realtime Database
const firebaseConfig = {
    apiKey: "AIzaSyBn_IRWV1kVIWyJiJ7DUcuozUn3Se6JKvs",
    authDomain: "gameflix-e54bf.firebaseapp.com",
    projectId: "gameflix-e54bf",
    storageBucket: "gameflix-e54bf.firebasestorage.app",
    messagingSenderId: "702917790108",
    appId: "1:702917790108:web:7b8933a6a8a9a4f82de059",
    measurementId: "G-V9MZBT8ZMC"
};

// Inicialização segura do Firebase
let database;
let dbRef;
let useLocalStorageFallback = false;

try {
    firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    dbRef = database.ref("videos");

    // Ativar App Check (opcional, com ReCaptcha)
    try {
        const appCheck = firebase.appCheck();
        appCheck.activate(
            new firebase.appCheck.ReCaptchaV3Provider("6Lfp93UtAAAAAPPQxsgo74zH8g7_qlc21r4ZtbQW"),
            true
        );
    } catch (e) {
        console.warn("App Check não pôde ser ativado, prosseguindo diretamente.", e);
    }
} catch (error) {
    console.error("Falha ao inicializar o Firebase. Usando armazenamento local (LocalStorage).", error);
    useLocalStorageFallback = true;
}

// 2. Variáveis de Estado da Aplicação
const ADMIN_PASSWORD = "123"; // Senha padrão de fábrica (usada apenas se nenhuma senha customizada foi salva)

// Retorna a senha atual do painel: a customizada pelo admin (se houver), ou a padrão de fábrica
function getAdminPassword() {
    return localStorage.getItem('tubeflix_admin_password') || ADMIN_PASSWORD;
}
let allVideos = [];
let myFavoriteList = JSON.parse(localStorage.getItem('tubeflix_favorites')) || [];
let activeCategoryFilter = 'todos';
let currentSearchQuery = '';
let adminSearchQuery = ''; // Pesquisa dentro do painel administrativo, para localizar um vídeo a editar

// Nomes de categorias personalizáveis (o texto exibido pode mudar; a chave interna "filmes"/"series"/
// "documentarios"/"tutoriais" nunca muda, para não quebrar os vídeos já cadastrados)
const DEFAULT_CATEGORY_LABELS = {
    filmes: 'Filmes',
    series: 'Séries',
    documentarios: 'Documentários',
    tutoriais: 'Tutoriais / Tech'
};

function getCategoryLabels() {
    try {
        const saved = JSON.parse(localStorage.getItem('tubeflix_category_labels'));
        return { ...DEFAULT_CATEGORY_LABELS, ...(saved || {}) };
    } catch (e) {
        return { ...DEFAULT_CATEGORY_LABELS };
    }
}

// ===== Categorias Personalizadas (criadas pelo admin, além das 4 categorias padrão) =====

function getCustomCategories() {
    try {
        return JSON.parse(localStorage.getItem('tubeflix_custom_categories')) || [];
    } catch (e) {
        return [];
    }
}

function saveCustomCategories(categories) {
    localStorage.setItem('tubeflix_custom_categories', JSON.stringify(categories));
}

// Gera uma chave interna estável a partir do nome digitado (sem acentos/espaços/símbolos)
function slugifyCategoryKey(name) {
    const base = name
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return base || ('categoria_' + Date.now());
}

function escapeHtmlForCategory(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Cria a fileira (seção com carrossel) na página principal para cada categoria personalizada, se ainda não existir
function renderCustomCategorySections() {
    const mainContainer = document.getElementById('main-container');
    if (!mainContainer) return;

    getCustomCategories().forEach(cat => {
        if (document.getElementById(`section-${cat.key}`)) return; // já existe

        const section = document.createElement('section');
        section.className = 'video-row-section poster-grid-row';
        section.id = `section-${cat.key}`;
        section.innerHTML = `
            <h3 class="row-title">${escapeHtmlForCategory(cat.label)}</h3>
            <div class="row-carousel-container">
                <button class="carousel-control prev" onclick="scrollCarousel('carousel-${cat.key}', -1)">
                    <i data-lucide="chevron-left"></i>
                </button>
                <div class="row-carousel" id="carousel-${cat.key}"></div>
                <button class="carousel-control next" onclick="scrollCarousel('carousel-${cat.key}', 1)">
                    <i data-lucide="chevron-right"></i>
                </button>
            </div>
        `;
        mainContainer.appendChild(section);
    });

    lucide.createIcons();
}

// Insere os itens de menu de cada categoria personalizada, sempre antes de "Minha Lista"
function renderCustomCategoryNavLinks() {
    if (!navLinksList) return;
    const favoritosLi = navLinksList.querySelector('li[data-filter="favoritos"]');

    getCustomCategories().forEach(cat => {
        if (navLinksList.querySelector(`li[data-filter="${cat.key}"]`)) return; // já existe

        const li = document.createElement('li');
        li.setAttribute('data-filter', cat.key);
        li.innerHTML = `<span class="cat-label" data-cat-key="${cat.key}">${escapeHtmlForCategory(cat.label)}</span>`;
        if (favoritosLi) {
            navLinksList.insertBefore(li, favoritosLi);
        } else {
            navLinksList.appendChild(li);
        }
    });
}

// Adiciona a opção correspondente no <select> de categoria do formulário de cadastro/edição
function renderCustomCategorySelectOptions() {
    if (!newCategorySelect) return;
    getCustomCategories().forEach(cat => {
        if (newCategorySelect.querySelector(`option[value="${cat.key}"]`)) return;
        const option = document.createElement('option');
        option.value = cat.key;
        option.textContent = cat.label;
        newCategorySelect.appendChild(option);
    });
}

// Prepara tudo relacionado às categorias personalizadas: fileira na página, item de menu e opção no formulário
function setupCustomCategories() {
    renderCustomCategorySections();
    renderCustomCategoryNavLinks();
    renderCustomCategorySelectOptions();
}

// Lista as categorias personalizadas dentro do painel administrativo, com opção de excluir cada uma
function renderCustomCategoriesAdminList() {
    const container = document.getElementById('custom-categories-list');
    if (!container) return;
    const categories = getCustomCategories();

    if (categories.length === 0) {
        container.innerHTML = '<p style="font-size:0.8rem; color:var(--text-muted); margin-top:10px;">Nenhuma categoria personalizada criada ainda.</p>';
        return;
    }

    container.innerHTML = categories.map(cat => `
        <div class="custom-category-item">
            <span>${escapeHtmlForCategory(cat.label)}</span>
            <button type="button" class="btn-delete-custom-category" data-key="${cat.key}" title="Excluir categoria">
                <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
            </button>
        </div>
    `).join('');

    lucide.createIcons();

    container.querySelectorAll('.btn-delete-custom-category').forEach(btn => {
        btn.addEventListener('click', () => deleteCustomCategory(btn.getAttribute('data-key')));
    });
}

function deleteCustomCategory(key) {
    const inUse = allVideos.some(v => v.category === key);
    if (inUse) {
        alert('Essa categoria ainda tem vídeos cadastrados nela. Mude a categoria desses vídeos primeiro (editando cada um) antes de excluí-la.');
        return;
    }

    if (!confirm('Tem certeza que deseja excluir esta categoria?')) return;

    saveCustomCategories(getCustomCategories().filter(c => c.key !== key));

    const section = document.getElementById(`section-${key}`);
    if (section) section.remove();
    const navItem = navLinksList ? navLinksList.querySelector(`li[data-filter="${key}"]`) : null;
    if (navItem) navItem.remove();
    const option = newCategorySelect ? newCategorySelect.querySelector(`option[value="${key}"]`) : null;
    if (option) option.remove();

    renderCustomCategoriesAdminList();
    filterAndRenderRows();
    showToast('Categoria excluída.');
}

// Aplica os nomes de categoria salvos em todos os lugares onde eles aparecem no site
function applyCategoryLabels() {
    const labels = getCategoryLabels();

    // Menu de navegação
    document.querySelectorAll('.cat-label[data-cat-key]').forEach(el => {
        const key = el.getAttribute('data-cat-key');
        if (labels[key]) el.textContent = labels[key];
    });

    // Dropdown "Categoria" no formulário de cadastro/edição
    Object.keys(labels).forEach(key => {
        const option = document.querySelector(`#new-category option[value="${key}"]`);
        if (option) option.textContent = labels[key];
    });

    // Títulos das fileiras de conteúdo na tela principal (ex: "Filmes Imperdíveis" -> "Cinema Imperdíveis")
    const rowTitleTemplates = {
        filmes: (label) => `${label} Imperdíveis`,
        series: (label) => `${label} e Episódios`,
        documentarios: (label) => `${label} Fascinantes`,
        tutoriais: (label) => `${label}`
    };
    Object.keys(rowTitleTemplates).forEach(key => {
        const section = document.getElementById(`section-${key}`);
        const titleEl = section ? section.querySelector('.row-title') : null;
        if (titleEl) titleEl.textContent = rowTitleTemplates[key](labels[key]);
    });
}

// Histórico de reprodução (usado para popular "Minha Lista" com conteúdos assistidos recentemente)
function recordWatchHistory(videoId) {
    if (!videoId) return;
    let history = [];
    try { history = JSON.parse(localStorage.getItem('tubeflix_watch_history')) || []; } catch (e) { history = []; }
    history = history.filter(h => h.id !== videoId); // remove entrada antiga do mesmo vídeo, se houver
    history.unshift({ id: videoId, watchedAt: Date.now() });
    if (history.length > 50) history = history.slice(0, 50); // limita o tamanho do histórico
    localStorage.setItem('tubeflix_watch_history', JSON.stringify(history));
}

function getWatchHistory() {
    try {
        const history = JSON.parse(localStorage.getItem('tubeflix_watch_history')) || [];
        return history.sort((a, b) => b.watchedAt - a.watchedAt);
    } catch (e) {
        return [];
    }
}

// Monta a lista de vídeos de "Minha Lista": primeiro os assistidos recentemente (mais recente primeiro),
// depois os favoritados que ainda não foram assistidos
function getMyListVideos(videos) {
    const history = getWatchHistory();
    const historyIds = new Set(history.map(h => h.id));

    const recentlyWatched = history
        .map(h => videos.find(v => v.id === h.id))
        .filter(Boolean);

    const favoritesNotWatched = videos.filter(v => myFavoriteList.includes(v.id) && !historyIds.has(v.id));

    return recentlyWatched.concat(favoritesNotWatched);
}
let activeYoutubePlayer = null; // Instância do YT.Player quando a API estiver pronta
let pendingAutoplayVideoId = null; // Guarda o vídeo a carregar caso a API do YouTube ainda não tenha carregado
let currentPlayingVideo = null; // Vídeo atualmente aberto no player (usado para calcular o próximo capítulo)
let pendingNextEpisode = null; // Próximo capítulo aguardando confirmação/contagem regressiva
let nextEpisodeCountdownInterval = null;
let nextEpisodeSecondsLeft = 10;
let toastHideTimeout = null;

// Pool de nomes para gerador de elenco simulado
const actorPool = [
    "Keanu Reeves", "Scarlett Johansson", "Cillian Murphy", "Pedro Pascal", 
    "Jenna Ortega", "Tom Holland", "Zendaya", "Robert Downey Jr.", 
    "Florence Pugh", "Timothée Chalamet", "Ana de Armas", "Ryan Gosling"
];

const techActorPool = [
    "Linus Torvalds", "Steve Jobs", "Ada Lovelace", "Alan Turing",
    "Grace Hopper", "Tim Berners-Lee", "Dennis Ritchie", "Guido van Rossum"
];

// 3. Seleção de Elementos DOM
const navbar = document.getElementById('navbar');
const navToggleBtn = document.getElementById('nav-toggle-btn');
const navLinksList = document.getElementById('nav-links');
const navMobileBackdrop = document.getElementById('nav-mobile-backdrop');
const searchToggleBtn = document.getElementById('search-toggle-btn');
const searchInput = document.getElementById('search-input');
const searchContainer = searchToggleBtn.parentElement;
const btnAdminPanel = document.getElementById('btn-admin-panel');
const noVideosState = document.getElementById('no-videos-state');
const btnAddInitial = document.getElementById('btn-add-initial');

// Modais
const modalPassword = document.getElementById('modal-password');
const modalAdmin = document.getElementById('modal-admin');
const playerModal = document.getElementById('player-modal');
const modalSeriesEpisodes = document.getElementById('modal-series-episodes');const closeSeriesEpisodesBtn = document.getElementById('close-series-episodes-btn');
const seriesEpisodesTitle = document.getElementById('series-episodes-title');
const seriesEpisodesSubtitle = document.getElementById('series-episodes-subtitle');
const seriesEpisodesList = document.getElementById('series-episodes-list');

// Lightbox de capa (celular) e alternância de densidade da grade
const posterLightbox = document.getElementById('poster-lightbox');
const posterLightboxBackdrop = document.getElementById('poster-lightbox-backdrop');
const posterLightboxClose = document.getElementById('poster-lightbox-close');
const posterLightboxImage = document.getElementById('poster-lightbox-image');
const posterLightboxTitleEl = document.getElementById('poster-lightbox-title');
const posterLightboxMetaEl = document.getElementById('poster-lightbox-meta');
const posterLightboxWatchBtn = document.getElementById('poster-lightbox-watch');
const btnToggleGridDensity = document.getElementById('btn-toggle-grid-density');
const closePassModal = document.getElementById('close-pass-modal');
const closeAdminModal = document.getElementById('close-admin-modal');
const closePlayerBtn = document.getElementById('close-player-btn');
const nextEpisodeOverlay = document.getElementById('next-episode-overlay');
const nextEpisodeCountdownEl = document.getElementById('next-episode-countdown');
const nextEpisodeThumbEl = document.getElementById('next-episode-thumb');
const nextEpisodeTitleEl = document.getElementById('next-episode-title');
const btnCancelNextEpisode = document.getElementById('btn-cancel-next-episode');
const btnPlayNextEpisode = document.getElementById('btn-play-next-episode');
const btnSubmitPass = document.getElementById('btn-submit-pass');
const adminPassInput = document.getElementById('admin-pass-input');

// Formulários e Edições
const addVideoForm = document.getElementById('add-video-form');
const btnFetchUrl = document.getElementById('btn-fetch-url');
const newUrlInput = document.getElementById('new-url');
const imagePreview = document.getElementById('image-preview');
const newImageUrl = document.getElementById('new-image-url');
const editVideoIdInput = document.getElementById('edit-video-id');
const adminVideosContainer = document.getElementById('admin-videos-container');
const newImageFile = document.getElementById('new-image-file');
const btnUploadImage = document.getElementById('btn-upload-image');
const posterAlignPreview = document.getElementById('poster-align-preview');
const newImageZoom = document.getElementById('new-image-zoom');
const newImagePosX = document.getElementById('new-image-pos-x');
const newImagePosY = document.getElementById('new-image-pos-y');
const btnResetAlign = document.getElementById('btn-reset-align');
const btnCancelEdit = document.getElementById('btn-cancel-edit');
const adminSplitLayout = document.getElementById('admin-split-layout');
const btnBackToList = document.getElementById('btn-back-to-list');
const btnAddNewVideo = document.getElementById('btn-add-new-video');

// Nomes personalizáveis das categorias
const btnEditCategories = document.getElementById('btn-edit-categories');
const categoryLabelsPanel = document.getElementById('category-labels-panel');
const btnSaveCategoryLabels = document.getElementById('btn-save-category-labels');
const btnResetCategoryLabels = document.getElementById('btn-reset-category-labels');

// Troca de senha do painel administrativo
const btnEditPassword = document.getElementById('btn-edit-password');
const passwordChangePanel = document.getElementById('password-change-panel');
const btnSaveAdminPassword = document.getElementById('btn-save-admin-password');
const formActionTitle = document.getElementById('form-action-title');
const newCategorySelect = document.getElementById('new-category');
const seriesOrderFields = document.getElementById('series-order-fields');
const newSeriesName = document.getElementById('new-series-name');
const newEpisodeOrder = document.getElementById('new-episode-order');

// Destaque (Hero)
const heroTitle = document.getElementById('hero-title');
const heroDescription = document.getElementById('hero-description');
const heroBgImage = document.getElementById('hero-bg-image');
const heroMatch = document.getElementById('hero-match');
const heroYear = document.getElementById('hero-year');
const heroRating = document.getElementById('hero-rating');
const heroDuration = document.getElementById('hero-duration');

// Pesquisa de vídeos no painel admin
const adminSearchInput = document.getElementById('admin-search-input');
const btnClearAdminSearch = document.getElementById('btn-clear-admin-search');
const adminSearchCount = document.getElementById('admin-search-count');

// Backups e Outros
const btnExportJson = document.getElementById('btn-export-json');
const btnImportJsonTrigger = document.getElementById('btn-import-json-trigger');
const importJsonFile = document.getElementById('import-json-file');
const currentYearSpan = document.getElementById('current-year');

// 4. Inicialização do Site
document.addEventListener('DOMContentLoaded', () => {
    // Configurar ano no footer
    if (currentYearSpan) currentYearSpan.textContent = new Date().getFullYear();

    // Prepara as categorias personalizadas (fileiras, menu e opção no formulário) ANTES de carregar
    // os vídeos, para que a primeira renderização já encontre as seções corretas no DOM
    setupCustomCategories();

    // Inicializar Ícones Lucide
    lucide.createIcons();

    // Carregar Vídeos
    fetchVideos();

    // Configurar Event Listeners
    setupNavScroll();
    setupEventListeners();
    loadYoutubeIFrameAPI();
    toggleSeriesOrderFields();
    applyGridDensityPreference();
    applyCategoryLabels();
    enableDragToScroll(document.getElementById('carousel-destaques'));
});

// Efeito de escurecer a navbar ao rolar a página
// Permite rolar a fileira "Minha Lista" arrastando com o mouse (desktop) — no celular o toque/swipe
// já funciona nativamente, já que a fileira tem rolagem horizontal padrão do navegador
function enableDragToScroll(element) {
    if (!element) return;
    let isDragging = false;
    let startX = 0;
    let startScrollLeft = 0;
    let moved = false;

    element.addEventListener('mousedown', (e) => {
        isDragging = true;
        moved = false;
        startX = e.pageX;
        startScrollLeft = element.scrollLeft;
        element.classList.add('dragging');
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const delta = e.pageX - startX;
        if (Math.abs(delta) > 5) moved = true;
        element.scrollLeft = startScrollLeft - delta;
    });

    window.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        element.classList.remove('dragging');
    });

    // Evita que o arraste do mouse dispare o clique de abrir o vídeo/lightbox por engano
    element.addEventListener('click', (e) => {
        if (moved) {
            e.stopPropagation();
            e.preventDefault();
        }
    }, true);
}

function setupNavScroll() {
    window.addEventListener('scroll', () => {
        if (window.scrollY > 20) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
}

// 5. Configuração dos Event Listeners Gerais
function setupEventListeners() {
    // Animação de expandir barra de busca
    searchToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        searchContainer.classList.toggle('active');
        if (searchContainer.classList.contains('active')) {
            searchInput.focus();
        }
    });

    document.addEventListener('click', (e) => {
        if (!searchContainer.contains(e.target) && searchInput.value === '') {
            searchContainer.classList.remove('active');
        }
    });

    searchInput.addEventListener('input', (e) => {
        currentSearchQuery = e.target.value.toLowerCase().trim();
        filterAndRenderRows();
    });

    // Pesquisa de vídeos dentro do painel administrativo (para localizar rapidamente um vídeo a editar)
    if (adminSearchInput) {
        adminSearchInput.addEventListener('input', (e) => {
            adminSearchQuery = e.target.value.toLowerCase().trim();
            btnClearAdminSearch.classList.toggle('hidden', adminSearchQuery === '');
            renderAdminList();
        });
    }
    if (btnClearAdminSearch) {
        btnClearAdminSearch.addEventListener('click', () => {
            adminSearchQuery = '';
            adminSearchInput.value = '';
            btnClearAdminSearch.classList.add('hidden');
            renderAdminList();
            adminSearchInput.focus();
        });
    }

    // Filtros de Categorias no Topo (delegação de evento: funciona também para categorias
    // personalizadas criadas pelo admin depois que a página já carregou)
    if (navLinksList) {
        navLinksList.addEventListener('click', (e) => {
            const clickedLi = e.target.closest('li[data-filter]');
            if (!clickedLi) return;

            navLinksList.querySelectorAll('li[data-filter]').forEach(l => l.classList.remove('active'));
            clickedLi.classList.add('active');
            activeCategoryFilter = clickedLi.getAttribute('data-filter');

            // Fecha o menu mobile, se estiver aberto
            closeMobileNav();

            filterAndRenderRows();

            // Rolar suavemente até a fileira da categoria escolhida
            scrollToActiveCategory();
        });
    }

    // Menu de Navegação Mobile (Hambúrguer)
    if (navToggleBtn) {
        navToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = navLinksList.classList.toggle('open');
            navMobileBackdrop.classList.toggle('open', isOpen);
            navToggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            navToggleBtn.innerHTML = `<i data-lucide="${isOpen ? 'x' : 'menu'}"></i>`;
            lucide.createIcons();
        });
    }
    if (navMobileBackdrop) {
        navMobileBackdrop.addEventListener('click', closeMobileNav);
    }

    // Alterna a exibição dos campos de ordenação de série conforme a categoria
    if (newCategorySelect) {
        newCategorySelect.addEventListener('change', toggleSeriesOrderFields);

        // Garante que o campo "Ordem / Nº do Episódio" só aceite dígitos (campo de texto simples, sem setinhas)
        if (newEpisodeOrder) {
            newEpisodeOrder.addEventListener('input', () => {
                const digitsOnly = newEpisodeOrder.value.replace(/[^0-9]/g, '');
                if (digitsOnly !== newEpisodeOrder.value) newEpisodeOrder.value = digitsOnly;
            });
        }
    }

    // Botões administrativos
    btnAdminPanel.addEventListener('click', () => {
        modalPassword.classList.remove('hidden');
        adminPassInput.value = '';
        adminPassInput.focus();
    });

    btnAddInitial.addEventListener('click', () => {
        modalPassword.classList.remove('hidden');
        adminPassInput.value = '';
        adminPassInput.focus();
    });

    closePassModal.addEventListener('click', () => modalPassword.classList.add('hidden'));
    closeAdminModal.addEventListener('click', () => modalAdmin.classList.add('hidden'));
    closePlayerBtn.addEventListener('click', closePlayerModal);
    btnCancelNextEpisode.addEventListener('click', cancelNextEpisodeCountdown);
    btnPlayNextEpisode.addEventListener('click', playPendingNextEpisode);

    // Navegação entre lista e formulário no painel admin (relevante principalmente no celular)
    if (btnAddNewVideo) {
        btnAddNewVideo.addEventListener('click', () => {
            resetForm();
            showAdminFormView();
        });
    }

    // Painel de edição dos nomes das categorias
    if (btnEditCategories) {
        btnEditCategories.addEventListener('click', () => {
            const labels = getCategoryLabels();
            document.getElementById('cat-label-filmes').value = labels.filmes;
            document.getElementById('cat-label-series').value = labels.series;
            document.getElementById('cat-label-documentarios').value = labels.documentarios;
            document.getElementById('cat-label-tutoriais').value = labels.tutoriais;
            renderCustomCategoriesAdminList();
            if (passwordChangePanel) passwordChangePanel.classList.add('hidden');
            categoryLabelsPanel.classList.toggle('hidden');
        });
    }
    if (btnSaveCategoryLabels) {
        btnSaveCategoryLabels.addEventListener('click', () => {
            const newLabels = {
                filmes: document.getElementById('cat-label-filmes').value.trim() || DEFAULT_CATEGORY_LABELS.filmes,
                series: document.getElementById('cat-label-series').value.trim() || DEFAULT_CATEGORY_LABELS.series,
                documentarios: document.getElementById('cat-label-documentarios').value.trim() || DEFAULT_CATEGORY_LABELS.documentarios,
                tutoriais: document.getElementById('cat-label-tutoriais').value.trim() || DEFAULT_CATEGORY_LABELS.tutoriais
            };
            localStorage.setItem('tubeflix_category_labels', JSON.stringify(newLabels));
            applyCategoryLabels();
            categoryLabelsPanel.classList.add('hidden');
            showToast("Nomes das categorias atualizados!");
        });
    }
    if (btnResetCategoryLabels) {
        btnResetCategoryLabels.addEventListener('click', () => {
            document.getElementById('cat-label-filmes').value = DEFAULT_CATEGORY_LABELS.filmes;
            document.getElementById('cat-label-series').value = DEFAULT_CATEGORY_LABELS.series;
            document.getElementById('cat-label-documentarios').value = DEFAULT_CATEGORY_LABELS.documentarios;
            document.getElementById('cat-label-tutoriais').value = DEFAULT_CATEGORY_LABELS.tutoriais;
        });
    }

    // Criar nova categoria personalizada
    const btnAddCustomCategory = document.getElementById('btn-add-custom-category');
    if (btnAddCustomCategory) {
        btnAddCustomCategory.addEventListener('click', () => {
            const input = document.getElementById('new-custom-category-name');
            const name = input.value.trim();
            if (!name) {
                alert('Digite um nome para a nova categoria.');
                return;
            }

            const key = slugifyCategoryKey(name);
            const reserved = ['todos', 'favoritos', 'filmes', 'series', 'documentarios', 'tutoriais'];
            const existingCustom = getCustomCategories();

            if (reserved.includes(key) || existingCustom.some(c => c.key === key)) {
                alert('Já existe uma categoria com esse nome (ou um nome muito parecido). Escolha outro.');
                return;
            }

            existingCustom.push({ key, label: name });
            saveCustomCategories(existingCustom);

            setupCustomCategories();
            renderCustomCategoriesAdminList();
            filterAndRenderRows();

            input.value = '';
            showToast(`Categoria "${name}" criada com sucesso!`);
        });
    }

    // Painel de troca de senha
    if (btnEditPassword) {
        btnEditPassword.addEventListener('click', () => {
            document.getElementById('current-admin-password').value = '';
            document.getElementById('new-admin-password').value = '';
            document.getElementById('confirm-admin-password').value = '';
            if (categoryLabelsPanel) categoryLabelsPanel.classList.add('hidden');
            passwordChangePanel.classList.toggle('hidden');
        });
    }
    if (btnSaveAdminPassword) {
        btnSaveAdminPassword.addEventListener('click', () => {
            const current = document.getElementById('current-admin-password').value;
            const newPass = document.getElementById('new-admin-password').value;
            const confirmPass = document.getElementById('confirm-admin-password').value;

            if (current !== getAdminPassword()) {
                alert('A senha atual informada está incorreta.');
                return;
            }
            if (!newPass || newPass.length < 3) {
                alert('A nova senha deve ter pelo menos 3 caracteres.');
                return;
            }
            if (newPass !== confirmPass) {
                alert('A confirmação não é igual à nova senha. Tente novamente.');
                return;
            }

            localStorage.setItem('tubeflix_admin_password', newPass);
            passwordChangePanel.classList.add('hidden');
            showToast('Senha alterada com sucesso!');
        });
    }
    if (btnBackToList) {
        btnBackToList.addEventListener('click', () => {
            resetForm();
            showAdminListView();
        });
    }
    closeSeriesEpisodesBtn.addEventListener('click', closeSeriesEpisodesModal);
    // Fecha ao clicar fora do card de episódios (na área escurecida)
    modalSeriesEpisodes.addEventListener('click', (e) => {
        if (e.target === modalSeriesEpisodes) closeSeriesEpisodesModal();
    });

    // Lightbox de capa (celular)
    if (posterLightboxClose) posterLightboxClose.addEventListener('click', closePosterLightbox);
    if (posterLightboxBackdrop) posterLightboxBackdrop.addEventListener('click', closePosterLightbox);

    // Alternância de densidade da grade (3 vs 4/5 capas por fileira)
    if (btnToggleGridDensity) {
        btnToggleGridDensity.addEventListener('click', () => {
            const isDensity3Now = document.body.classList.contains('grid-density-3');
            localStorage.setItem('tubeflix_grid_density', isDensity3Now ? '4' : '3');
            applyGridDensityPreference();
        });
    }

    // Validação de senha
    btnSubmitPass.addEventListener('click', verifyAdminPassword);
    adminPassInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') verifyAdminPassword();
    });

    // Botão de extração rápida do link (YouTube, Vimeo, ou outros — cada um com seu próprio comportamento)
    btnFetchUrl.addEventListener('click', async () => {
        const url = newUrlInput.value.trim();
        if (!url) {
            alert('Por favor, insira um link de vídeo primeiro.');
            return;
        }

        const source = parseVideoSource(url);
        if (!source) {
            alert('Não foi possível reconhecer esse link como um vídeo válido. Verifique se começa com http:// ou https://');
            return;
        }

        if (source.sourceType === 'youtube') {
            // Feedback de carregamento
            btnFetchUrl.disabled = true;
            btnFetchUrl.innerHTML = `<div class="spinner" style="width:14px; height:14px; border-width:2px; margin-right:5px;"></div> Buscando...`;

            const metadata = await getYouTubeMetadata(url);

            btnFetchUrl.disabled = false;
            btnFetchUrl.innerHTML = `<i data-lucide="wand2"></i> <span>Extrair</span>`;
            lucide.createIcons();

            if (metadata) {
                fillFormWithMetadata(metadata, source.videoId);
            } else {
                // Caso falhe o noembed (CORS, limite de rede, etc.), gera localmente
                fillFormSimulated(source.videoId);
            }
        } else if (source.sourceType === 'vimeo') {
            btnFetchUrl.disabled = true;
            btnFetchUrl.innerHTML = `<div class="spinner" style="width:14px; height:14px; border-width:2px; margin-right:5px;"></div> Buscando...`;

            const metadata = await getVimeoMetadata(url);

            btnFetchUrl.disabled = false;
            btnFetchUrl.innerHTML = `<i data-lucide="wand2"></i> <span>Extrair</span>`;
            lucide.createIcons();

            if (metadata && metadata.title) {
                document.getElementById('new-title').value = metadata.title;
                document.getElementById('new-director').value = metadata.author_name || "Vimeo";
                if (metadata.thumbnail_url) {
                    newImageUrl.value = metadata.thumbnail_url;
                    imagePreview.src = metadata.thumbnail_url;
                }
                showToast("Título e capa extraídos do Vimeo! Confira e complete os demais campos.");
            } else {
                showToast("Não foi possível extrair os dados automaticamente do Vimeo. Preencha os campos manualmente.", { isError: true, duration: 4000 });
            }
        } else {
            // Link de outro site (arquivo de vídeo direto ou página com player embutido):
            // não há como extrair automaticamente título/capa de qualquer site, então avisa o
            // usuário para preencher manualmente os campos abaixo.
            showToast("Esse link não é do YouTube nem do Vimeo. Preencha o título, categoria e capa manualmente abaixo.", { duration: 4500 });
        }
    });

    // Atualiza o preview quando o usuário cola/edita o link da imagem manualmente
    newImageUrl.addEventListener('input', () => {
        if (newImageUrl.value.trim()) {
            imagePreview.src = newImageUrl.value.trim();
        }
    });

    // Carregar imagem de capa do computador
    btnUploadImage.addEventListener('click', () => newImageFile.click());

    newImageFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('Por favor, selecione um arquivo de imagem válido.');
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            const proceed = confirm('Essa imagem tem mais de 2MB e pode deixar o carregamento do site mais lento. Deseja continuar mesmo assim?');
            if (!proceed) {
                newImageFile.value = '';
                return;
            }
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
            const dataUrl = ev.target.result;
            newImageUrl.value = dataUrl;
            imagePreview.src = dataUrl;
            // Reseta o enquadramento ao trocar de imagem
            newImagePosX.value = 50;
            newImagePosY.value = 50;
            newImageZoom.value = 100;
            applyImageAlignToPreview();
        };
        reader.readAsDataURL(file);
    });

    // Zoom da capa
    newImageZoom.addEventListener('input', applyImageAlignToPreview);

    // Redefinir enquadramento (posição centralizada e zoom padrão, sem cortar demais a capa vertical)
    btnResetAlign.addEventListener('click', () => {
        newImagePosX.value = 50;
        newImagePosY.value = 50;
        newImageZoom.value = DEFAULT_POSTER_ZOOM;
        applyImageAlignToPreview();
    });

    // Arrastar a capa dentro do quadro de preview para reposicionar
    setupPosterDragAndDrop();

    // Salvar Vídeo (Novo ou Editado)
    addVideoForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const editId = editVideoIdInput.value;
        const rawUrl = newUrlInput.value.trim();
        const source = parseVideoSource(rawUrl) || { sourceType: null, videoId: null, embedUrl: null };

        const videoData = {
            url: rawUrl,
            sourceType: source.sourceType,
            videoId: source.videoId,
            embedUrl: source.embedUrl,
            title: document.getElementById('new-title').value.trim(),
            category: document.getElementById('new-category').value,
            rating: document.getElementById('new-rating').value,
            duration: document.getElementById('new-duration').value.trim(),
            year: parseInt(document.getElementById('new-year').value),
            director: document.getElementById('new-director').value.trim(),
            cast: document.getElementById('new-cast').value.trim(),
            description: document.getElementById('new-description').value.trim(),
            imageUrl: newImageUrl.value.trim() || (source.sourceType === 'youtube' ? `https://img.youtube.com/vi/${source.videoId}/maxresdefault.jpg` : ''),
            imagePosX: parseFloat(newImagePosX.value) || 50,
            imagePosY: parseFloat(newImagePosY.value) || 50,
            imageZoom: parseFloat(newImageZoom.value) || DEFAULT_POSTER_ZOOM,
            featured: document.getElementById('new-featured').checked,
            seriesName: (document.getElementById('new-category').value === 'series') ? newSeriesName.value.trim() : '',
            episodeOrder: (document.getElementById('new-category').value === 'series' && newEpisodeOrder.value !== '') ? parseFloat(newEpisodeOrder.value) : null,
            createdAt: new Date().getTime()
        };

        if (!source.sourceType) {
            alert("Link de vídeo inválido. Verifique se começa com http:// ou https://");
            return;
        }

        if (!videoData.imageUrl) {
            alert("Informe uma imagem de capa para este vídeo (não é possível extraí-la automaticamente para este tipo de link).");
            return;
        }

        if (videoData.category === 'series' && !videoData.seriesName) {
            alert("Para vídeos do tipo Série, informe o \"Nome da Série\" para agrupar os capítulos corretamente.");
            return;
        }

        // Preserva a data de criação original ao editar (não mexe na ordenação de "recentes")
        if (editId) {
            const existing = allVideos.find(v => v.id === editId);
            if (existing && existing.createdAt) {
                videoData.createdAt = existing.createdAt;
            }
        }

        // Se este vídeo for Destaque Principal, desativa os outros
        if (videoData.featured) {
            await clearAllFeaturedFlags();
        }

        try {
            let savedId = editId;

            if (useLocalStorageFallback) {
                if (editId) {
                    const index = allVideos.findIndex(v => v.id === editId);
                    if (index > -1) {
                        allVideos[index] = { id: editId, ...videoData };
                    }
                } else {
                    const newId = 'local_' + Math.random().toString(36).substr(2, 9);
                    allVideos.push({ id: newId, ...videoData });
                    savedId = newId;
                }
                localStorage.setItem('tubeflix_videos', JSON.stringify(allVideos));
            } else {
                if (editId) {
                    await database.ref("videos/" + editId).set(videoData);
                } else {
                    const pushResult = await dbRef.push(videoData);
                    savedId = pushResult.key;
                }
            }

            // Se este for o primeiro capítulo de uma série, replica a capa (imagem/enquadramento)
            // automaticamente para os demais capítulos já cadastrados dessa mesma série
            const replicatedCount = await replicateCoverToSeriesSiblings(videoData, savedId);

            let successMessage = editId ? "Vídeo atualizado com sucesso!" : "Vídeo salvo com sucesso!";
            if (replicatedCount > 0) {
                successMessage += ` Capa aplicada também a ${replicatedCount} outro${replicatedCount > 1 ? 's' : ''} capítulo${replicatedCount > 1 ? 's' : ''} da série.`;
            }
            showToast(successMessage, { duration: replicatedCount > 0 ? 4500 : 3000 });

            resetForm();
            if (!useLocalStorageFallback) {
                // O Firebase fará o update dinâmico no on('value')
            } else {
                filterAndRenderRows();
                renderAdminList();
            }
            // Permanece no painel administrativo após salvar (não fecha o modal nem exige senha novamente),
            // mas no celular volta para a lista em tela cheia (não fica preso na tela do formulário)
            showAdminListView();
        } catch (error) {
            console.error("Erro ao salvar:", error);
            alert("Ocorreu um erro ao salvar o vídeo.");
        }
    });

    btnCancelEdit.addEventListener('click', () => {
        resetForm();
        showAdminListView();
    });

    // Exportar e Importar JSON
    btnExportJson.addEventListener('click', exportLibraryToJson);
    btnImportJsonTrigger.addEventListener('click', () => importJsonFile.click());
    importJsonFile.addEventListener('change', importLibraryFromJson);
}

// Rola a página até a fileira correspondente à categoria selecionada no menu.
// "Início" vai para o topo do conteúdo; "Minha Lista" usa a fileira de destaques (reaproveitada para favoritos).
function scrollToActiveCategory() {
    const navbarHeight = 90; // compensa a navbar fixa no topo

    let targetSection = null;

    if (activeCategoryFilter === 'todos') {
        targetSection = document.querySelector('.main-container');
    } else if (activeCategoryFilter === 'favoritos') {
        targetSection = document.getElementById('section-destaques');
    } else {
        targetSection = document.getElementById('section-' + activeCategoryFilter);
    }

    // Se a seção não existe ou está oculta (sem vídeos naquela categoria), rola para o início do conteúdo
    if (!targetSection || targetSection.classList.contains('hidden')) {
        targetSection = document.querySelector('.main-container');
    }

    if (!targetSection) return;

    window.scrollTo({
        top: targetSection.offsetTop - navbarHeight,
        behavior: 'smooth'
    });
}

// Alterna entre a lista de vídeos e o formulário de adicionar/editar no painel admin.
// No celular, essas duas telas nunca ficam visíveis ao mesmo tempo (evita "dividir" a tela pequena).
// No desktop essas funções não têm efeito visual (o CSS só diferencia dentro da media query mobile).
function showAdminFormView() {
    if (adminSplitLayout) adminSplitLayout.classList.add('showing-form');
}

function showAdminListView() {
    if (adminSplitLayout) adminSplitLayout.classList.remove('showing-form');
}

// Fecha o menu de navegação mobile (usado ao selecionar um filtro ou clicar fora)
function closeMobileNav() {
    if (!navLinksList) return;
    navLinksList.classList.remove('open');
    if (navMobileBackdrop) navMobileBackdrop.classList.remove('open');
    if (navToggleBtn) {
        navToggleBtn.setAttribute('aria-expanded', 'false');
        navToggleBtn.innerHTML = `<i data-lucide="menu"></i>`;
        lucide.createIcons();
    }
}

// Mostra/oculta os campos de "Nome da Série" e "Ordem do Episódio" conforme a categoria escolhida
function toggleSeriesOrderFields() {
    if (!seriesOrderFields || !newCategorySelect) return;
    const isSeries = newCategorySelect.value === 'series';
    seriesOrderFields.classList.toggle('hidden', !isSeries);
}

// 6. Carregar Dados de Vídeos (Firebase ou LocalStorage)
function fetchVideos() {
    if (useLocalStorageFallback) {
        allVideos = JSON.parse(localStorage.getItem('tubeflix_videos')) || [];
        filterAndRenderRows();
        return;
    }

    dbRef.on('value', (snapshot) => {
        allVideos = [];
        const data = snapshot.val();
        if (data) {
            Object.keys(data).forEach((key) => {
                allVideos.push({ id: key, ...data[key] });
            });
        }

        // Ordenar por data de criação decrescente
        allVideos.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        filterAndRenderRows();
        if (!modalAdmin.classList.contains('hidden')) {
            renderAdminList();
        }
    }, (error) => {
        console.error("Erro ao ler do Firebase. Ativando fallback local.", error);
        useLocalStorageFallback = true;
        allVideos = JSON.parse(localStorage.getItem('tubeflix_videos')) || [];
        filterAndRenderRows();
    });
}

// Limpar flag "featured" de todos os vídeos para garantir apenas um destaque
// Quando o capítulo de MENOR ordem de uma série é salvo, replica automaticamente sua capa
// (imagem, posição e zoom) para os demais capítulos já cadastrados dessa mesma série — evita ter
// que repetir manualmente a mesma capa em cada episódio. Retorna quantos capítulos foram atualizados.
async function replicateCoverToSeriesSiblings(videoData, currentId) {
    if (videoData.category !== 'series' || !videoData.seriesName) return 0;

    const normalizedName = videoData.seriesName.trim().toLowerCase();
    const siblings = allVideos.filter(v =>
        v.category === 'series' &&
        v.seriesName &&
        v.seriesName.trim().toLowerCase() === normalizedName &&
        v.id !== currentId
    );

    if (siblings.length === 0) return 0; // ainda não há outros capítulos cadastrados dessa série

    // Só replica se o capítulo salvo for o de MENOR ordem entre todos (o "primeiro" da série)
    const currentOrder = (videoData.episodeOrder != null) ? videoData.episodeOrder : Infinity;
    const minSiblingOrder = Math.min(...siblings.map(s => (s.episodeOrder != null) ? s.episodeOrder : Infinity));
    if (currentOrder > minSiblingOrder) return 0;

    const imageUpdate = {
        imageUrl: videoData.imageUrl,
        imagePosX: videoData.imagePosX,
        imagePosY: videoData.imagePosY,
        imageZoom: videoData.imageZoom
    };

    let updatedCount = 0;
    for (const sibling of siblings) {
        try {
            if (useLocalStorageFallback) {
                const idx = allVideos.findIndex(v => v.id === sibling.id);
                if (idx > -1) allVideos[idx] = { ...allVideos[idx], ...imageUpdate };
            } else {
                await database.ref("videos/" + sibling.id).update(imageUpdate);
            }
            updatedCount++;
        } catch (err) {
            console.error("Erro ao replicar capa para o capítulo:", sibling.id, err);
        }
    }

    if (useLocalStorageFallback && updatedCount > 0) {
        localStorage.setItem('tubeflix_videos', JSON.stringify(allVideos));
    }

    return updatedCount;
}

async function clearAllFeaturedFlags() {
    if (useLocalStorageFallback) {
        allVideos.forEach(v => v.featured = false);
        localStorage.setItem('tubeflix_videos', JSON.stringify(allVideos));
        return;
    }

    try {
        const snapshot = await dbRef.once('value');
        const data = snapshot.val();
        if (data) {
            const updates = {};
            Object.keys(data).forEach((key) => {
                if (data[key].featured) {
                    updates[`/videos/${key}/featured`] = false;
                }
            });
            await database.ref().update(updates);
        }
    } catch (e) {
        console.error("Erro ao redefinir destaques anteriores:", e);
    }
}

// 7. Autenticação Administrativa
function verifyAdminPassword() {
    if (adminPassInput.value === getAdminPassword()) {
        modalPassword.classList.add('hidden');
        modalAdmin.classList.remove('hidden');
        resetForm();
        renderAdminList();
        showAdminListView(); // Sempre abre o painel mostrando a lista (relevante no celular)
    } else {
        alert("Senha incorreta!");
    }
}

// 8. Algoritmo de Extração de Metadados e Geração Inteligente
function extractYouTubeId(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// Identifica de onde vem um link de vídeo (YouTube, Vimeo, arquivo de vídeo direto, ou outro site
// qualquer) e monta as informações necessárias para exibi-lo no player mais adiante.
// Isso permite cadastrar vídeos de fora do YouTube: basta colar o link, o resto do cadastro
// (categoria, classificação, série, capa, etc.) funciona exatamente da mesma forma.
function parseVideoSource(url) {
    if (!url) return null;
    const trimmed = url.trim();

    // 1. YouTube (continua usando a API oficial do YouTube: autoplay, próximo episódio automático,
    // e abrir no YouTube se o embed for bloqueado)
    const youtubeId = extractYouTubeId(trimmed);
    if (youtubeId) {
        return { sourceType: 'youtube', videoId: youtubeId, embedUrl: null };
    }

    // 2. Vimeo (ex: https://vimeo.com/123456789)
    const vimeoMatch = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (vimeoMatch) {
        return { sourceType: 'vimeo', videoId: vimeoMatch[1], embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}` };
    }

    // 3. Arquivo de vídeo direto (.mp4, .webm, .ogg) — usa o player nativo do navegador
    if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(trimmed)) {
        return { sourceType: 'direct', videoId: null, embedUrl: trimmed };
    }

    // 4. Qualquer outro link http(s) — tenta incorporar diretamente em um iframe.
    // Nem todo site permite ser incorporado (alguns bloqueiam via cabeçalhos de segurança), mas a
    // grande maioria de players de vídeo de sites de notícia, blogs, etc. funciona dessa forma.
    if (/^https?:\/\//i.test(trimmed)) {
        return { sourceType: 'iframe', videoId: null, embedUrl: trimmed };
    }

    return null;
}

async function getYouTubeMetadata(videoUrl) {
    try {
        const response = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(videoUrl)}`);
        if (!response.ok) throw new Error("Erro de resposta.");
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        return data;
    } catch (e) {
        console.warn("API oEmbed falhou. Usando simulador local de dados.", e);
        return null;
    }
}

// Extração de metadados do Vimeo via oEmbed (funciona sem chave de API, similar ao noembed do YouTube)
async function getVimeoMetadata(videoUrl) {
    try {
        const response = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(videoUrl)}`);
        if (!response.ok) throw new Error("Erro de resposta.");
        const data = await response.json();
        return data;
    } catch (e) {
        console.warn("oEmbed do Vimeo falhou (preencha os campos manualmente).", e);
        return null;
    }
}

// Aplica a posição (arraste) e o zoom atuais ao preview da capa no painel admin
function applyImageAlignToPreview() {
    const zoom = parseFloat(newImageZoom.value) || 100;
    const posX = parseFloat(newImagePosX.value) || 50;
    const posY = parseFloat(newImagePosY.value) || 50;
    imagePreview.style.objectPosition = `${posX}% ${posY}%`;
    imagePreview.style.transform = `scale(${zoom / 100})`;
}

// Permite arrastar a imagem dentro do quadro de preview para reposicionar a capa
function setupPosterDragAndDrop() {
    let dragging = false;
    let startClientX = 0;
    let startClientY = 0;
    let startPosX = 50;
    let startPosY = 50;

    posterAlignPreview.addEventListener('pointerdown', (e) => {
        dragging = true;
        try { posterAlignPreview.setPointerCapture(e.pointerId); } catch (err) {}
        startClientX = e.clientX;
        startClientY = e.clientY;
        startPosX = parseFloat(newImagePosX.value) || 50;
        startPosY = parseFloat(newImagePosY.value) || 50;
    });

    posterAlignPreview.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const rect = posterAlignPreview.getBoundingClientRect();
        const deltaXPercent = ((e.clientX - startClientX) / rect.width) * 100;
        const deltaYPercent = ((e.clientY - startClientY) / rect.height) * 100;

        // Arrastar para a direita/baixo move o enquadramento visível para o lado oposto da imagem
        let newPosX = startPosX - deltaXPercent;
        let newPosY = startPosY - deltaYPercent;
        newPosX = Math.max(0, Math.min(100, newPosX));
        newPosY = Math.max(0, Math.min(100, newPosY));

        newImagePosX.value = newPosX.toFixed(1);
        newImagePosY.value = newPosY.toFixed(1);
        applyImageAlignToPreview();
    });

    const endDrag = (e) => {
        dragging = false;
        try { posterAlignPreview.releasePointerCapture(e.pointerId); } catch (err) {}
    };
    posterAlignPreview.addEventListener('pointerup', endDrag);
    posterAlignPreview.addEventListener('pointercancel', endDrag);
    posterAlignPreview.addEventListener('pointerleave', () => { dragging = false; });
}

// Gera o CSS inline (posição + zoom) para exibir a capa de um vídeo já alinhada pelo admin
function getPosterImageStyle(video) {
    const posX = (video && video.imagePosX != null) ? video.imagePosX : 50;
    const posY = (video && video.imagePosY != null) ? video.imagePosY : 50;
    const zoom = (video && video.imageZoom != null) ? video.imageZoom : DEFAULT_POSTER_ZOOM;
    return `object-position: ${posX}% ${posY}%; transform: scale(${zoom / 100});`;
}

// Preencher o formulário administrativo com dados oficiais da API oEmbed
function fillFormWithMetadata(metadata, videoId) {
    document.getElementById('new-title').value = cleanTitle(metadata.title);
    document.getElementById('new-director').value = metadata.author_name || "YouTube Creator";
    
    const highResThumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    newImageUrl.value = highResThumbnail;
    imagePreview.src = highResThumbnail;

    // Verificar se a imagem de alta definição existe de verdade (caso contrário usa a padrão HQ)
    checkImageExists(highResThumbnail, (exists) => {
        if (!exists) {
            const fallbackThumb = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            newImageUrl.value = fallbackThumb;
            imagePreview.src = fallbackThumb;
        }
    });

    // Enriquecimento Inteligente de Informações Adicionais baseadas na categoria e título
    const generatedMeta = generateSmartDetails(metadata.title, metadata.author_name);
    
    document.getElementById('new-duration').value = generatedMeta.duration;
    document.getElementById('new-year').value = generatedMeta.year;
    document.getElementById('new-category').value = generatedMeta.category;
    document.getElementById('new-cast').value = generatedMeta.cast;
    document.getElementById('new-rating').value = generatedMeta.rating;
    document.getElementById('new-description').value = generatedMeta.description;
}

// Preenchimento simulado caso a requisição oEmbed falhe (sem internet ou link bloqueado)
function fillFormSimulated(videoId) {
    const defaultTitle = `Vídeo do YouTube (${videoId})`;
    document.getElementById('new-title').value = defaultTitle;
    document.getElementById('new-director').value = "Canal Criador";
    
    const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    newImageUrl.value = thumbUrl;
    imagePreview.src = thumbUrl;

    const smartData = generateSmartDetails(defaultTitle, "Canal Criador");
    document.getElementById('new-duration').value = smartData.duration;
    document.getElementById('new-year').value = smartData.year;
    document.getElementById('new-category').value = smartData.category;
    document.getElementById('new-cast').value = smartData.cast;
    document.getElementById('new-rating').value = smartData.rating;
    document.getElementById('new-description').value = smartData.description;
}

// Utilitários de metadados
function cleanTitle(title) {
    if (!title) return "";
    return title
        .replace(/\[.*?\]/g, "") // remove colchetes e conteúdo
        .replace(/\(.*?\)/g, "") // remove parênteses e conteúdo
        .replace(/official video/gi, "")
        .replace(/clipe oficial/gi, "")
        .replace(/videoclipe/gi, "")
        .replace(/4k/gi, "")
        .replace(/hd/gi, "")
        .replace(/\s+/g, " ") // limpa espaços extras
        .trim();
}

function checkImageExists(url, callback) {
    const img = new Image();
    img.onload = () => callback(true);
    img.onerror = () => callback(false);
    img.src = url;
}

// Algoritmo que lê palavras chave do título e monta detalhes plausíveis de cinema
function generateSmartDetails(title, author) {
    const titleLower = title.toLowerCase();
    let category = "tutoriais";
    let duration = "25 min";
    let year = 2026;
    let rating = "L";
    let cast = "";
    
    // Tenta obter ano do título (ex: 2024, 2025)
    const yearMatch = title.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch) {
        year = parseInt(yearMatch[0]);
    } else {
        year = new Date().getFullYear();
    }

    // Identificar Categoria por palavras-chave
    if (titleLower.includes("filme") || titleLower.includes("movie") || titleLower.includes("trailer") || titleLower.includes("longa-metragem") || titleLower.includes("cinema")) {
        category = "filmes";
        duration = "1h 45m";
        rating = "12";
    } else if (titleLower.includes("episodio") || titleLower.includes("ep ") || titleLower.includes("temporada") || titleLower.includes("série") || titleLower.includes("series") || titleLower.includes("capitulo")) {
        category = "series";
        duration = "45 min";
        rating = "14";
    } else if (titleLower.includes("documentario") || titleLower.includes("historia de") || titleLower.includes("biografia") || titleLower.includes("vida de") || titleLower.includes("investiga") || titleLower.includes("ciencia")) {
        category = "documentarios";
        duration = "58 min";
        rating = "L";
    } else if (titleLower.includes("curso") || titleLower.includes("tutorial") || titleLower.includes("como fazer") || titleLower.includes("programar") || titleLower.includes("code") || titleLower.includes("review") || titleLower.includes("setup")) {
        category = "tutoriais";
        duration = "18 min";
        rating = "L";
    }

    // Escolhe elenco de acordo com a categoria
    const selectedPool = (category === "tutoriais") ? techActorPool : actorPool;
    const shuffled = [...selectedPool].sort(() => 0.5 - Math.random());
    cast = shuffled.slice(0, 3).join(", ");

    // Monta uma sinopse cativante simulando IA
    let description = `Uma produção eletrizante de ${author}. Nesta incrível jornada, exploramos as nuances de '${cleanTitle(title)}' sob uma perspectiva inovadora e imersiva. Imperdível para fãs do gênero.`;

    if (category === "tutoriais") {
        description = `Aprenda tudo sobre o tema com as explicações didáticas de ${author}. Neste guia completo de '${cleanTitle(title)}', você dominará as melhores práticas do setor do início ao fim.`;
    } else if (category === "documentarios") {
        description = `O canal ${author} apresenta uma investigação profunda e repleta de fatos históricos sobre '${cleanTitle(title)}'. Uma análise imperdível que desafiará sua percepção sobre o tema.`;
    }

    return { category, duration, year, rating, cast, description };
}

// 9. Renderização do Grid e Fileiras Estilo Netflix
function filterAndRenderRows() {
    // Filtrar vídeos por busca global
    let filteredVideos = allVideos;
    
    if (currentSearchQuery !== '') {
        filteredVideos = allVideos.filter(video => 
            video.title.toLowerCase().includes(currentSearchQuery) || 
            (video.director && video.director.toLowerCase().includes(currentSearchQuery)) || 
            (video.description && video.description.toLowerCase().includes(currentSearchQuery))
        );
    }

    // Exibir/Ocultar tela de biblioteca vazia
    if (allVideos.length === 0) {
        noVideosState.classList.remove('hidden');
        document.querySelectorAll('.video-row-section').forEach(sec => sec.classList.add('hidden'));
        return;
    } else {
        noVideosState.classList.add('hidden');
    }

    // Configurar Banner de Destaque (Hero Banner)
    setupHeroBanner();

    // Se houver busca ou filtro de gênero ativado, o comportamento muda (mostra grid ou oculta fileiras irrelevantes)
    const isSearching = currentSearchQuery !== '';
    const activeFilter = activeCategoryFilter;

    // Seletor de categorias e suas respectivas fileiras (inclui as categorias personalizadas criadas pelo admin)
    const rows = [
        { key: 'destaques', id: 'section-destaques', filterFn: v => v.featured || v.createdAt },
        { key: 'filmes', id: 'section-filmes', filterFn: v => v.category === 'filmes' },
        { key: 'series', id: 'section-series', filterFn: v => v.category === 'series' },
        { key: 'documentarios', id: 'section-documentarios', filterFn: v => v.category === 'documentarios' },
        { key: 'tutoriais', id: 'section-tutoriais', filterFn: v => v.category === 'tutoriais' },
        ...getCustomCategories().map(cat => ({
            key: cat.key,
            id: `section-${cat.key}`,
            filterFn: v => v.category === cat.key
        }))
    ];

    rows.forEach(row => {
        const section = document.getElementById(row.id);
        if (!section) return; // segurança: categoria personalizada pode ainda não ter sido renderizada
        const carousel = section.querySelector('.row-carousel');
        
        let rowVideos = filteredVideos.filter(row.filterFn);

        // Tratamento especial para "Destaques/Populares" (não repetir o banner se houver muitos, ou pegar os melhores)
        if (row.key === 'destaques') {
            rowVideos = rowVideos.slice(0, 10); // Limita a 10 itens
        }

        // Tratamento especial para "Séries": agrupa por série e ordena os capítulos pela ordem definida,
        // sem misturar episódios de séries diferentes
        if (row.key === 'series') {
            rowVideos = groupAndSortSeriesEpisodes(rowVideos);
        }

        // Filtro da barra lateral/superior (se categoria específica está ativa)
        // A fileira "destaques/Populares" não é mais exibida na navegação normal — ela só aparece
        // quando reaproveitada para mostrar "Minha Lista" (favoritos), tratado no bloco abaixo.
        const isSectionVisible = 
            row.key !== 'destaques' &&
            (activeFilter === 'todos' || activeFilter === row.key) && 
            rowVideos.length > 0;

        // Se o usuário filtrou a categoria "favoritos" (Minha Lista)
        if (activeFilter === 'favoritos') {
            if (row.key === 'destaques') {
                // "Minha Lista" mostra primeiro os vídeos assistidos recentemente (mais recente primeiro),
                // seguidos dos favoritados que ainda não foram assistidos
                rowVideos = getMyListVideos(filteredVideos);
                const favoriteSection = document.getElementById('section-destaques');
                favoriteSection.querySelector('.row-title').textContent = "Minha Lista de Vídeos";
                favoriteSection.classList.remove('hidden');
                renderCarouselCards(carousel, rowVideos);
            } else {
                section.classList.add('hidden');
            }
            return;
        } else {
            // Volta título normal da seção destaques
            if (row.key === 'destaques') {
                document.getElementById('section-destaques').querySelector('.row-title').textContent = "Populares na TubeFlix";
            }
        }

        if (isSectionVisible) {
            section.classList.remove('hidden');
            renderCarouselCards(carousel, rowVideos);
        } else {
            section.classList.add('hidden');
        }
    });

    // Recriar ícones lucide dinamicamente inseridos
    lucide.createIcons();
}

// Agrupa episódios da mesma série (por "seriesName") e os ordena pela "episodeOrder" definida no admin,
// garantindo que capítulos de séries diferentes não fiquem intercalados na fileira.
function groupAndSortSeriesEpisodes(videos) {
    const groups = new Map();

    videos.forEach(video => {
        // Vídeos sem "Nome da Série" definido formam seu próprio grupo (não se agrupam com outros)
        const key = (video.seriesName && video.seriesName.trim())
            ? video.seriesName.trim().toLowerCase()
            : `__single_${video.id}`;

        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(video);
    });

    const groupList = Array.from(groups.values());

    // Ordena os episódios dentro de cada série pela ordem definida (episódios sem ordem vão ao final, por data)
    groupList.forEach(group => {
        group.sort((a, b) => {
            const orderA = (a.episodeOrder != null) ? a.episodeOrder : Infinity;
            const orderB = (b.episodeOrder != null) ? b.episodeOrder : Infinity;
            if (orderA !== orderB) return orderA - orderB;
            return (a.createdAt || 0) - (b.createdAt || 0);
        });
    });

    // Ordena as séries entre si pela data mais recente de cada grupo (mantém o vídeo/série mais novo primeiro)
    groupList.sort((groupA, groupB) => {
        const maxA = Math.max(...groupA.map(v => v.createdAt || 0));
        const maxB = Math.max(...groupB.map(v => v.createdAt || 0));
        return maxB - maxA;
    });

    // Retorna apenas UM card por série (o primeiro capítulo), com a lista completa de episódios anexada.
    // Isso evita poluir a fileira com várias capas repetidas da mesma série.
    return groupList.map(group => ({ ...group[0], episodes: group }));
}

// Configurar o Banner de Destaque
function setupHeroBanner() {
    let featuredVideo = allVideos.find(v => v.featured);
    
    // Se não houver vídeo explicitamente marcado como destaque, escolhe o primeiro da lista
    if (!featuredVideo && allVideos.length > 0) {
        featuredVideo = allVideos[0];
    }

    if (!featuredVideo) {
        document.getElementById('hero-banner').classList.add('hidden');
        return;
    }

    document.getElementById('hero-banner').classList.remove('hidden');
    
    // Metadados do Hero
    heroTitle.textContent = featuredVideo.title;
    heroDescription.textContent = featuredVideo.description;
    heroBgImage.style.backgroundImage = `url('${featuredVideo.imageUrl}')`;
    // Aplica o enquadramento (posição e zoom) definido no painel admin, mantendo o "cover" como base
    const heroPosX = (featuredVideo.imagePosX != null) ? featuredVideo.imagePosX : 50;
    const heroPosY = (featuredVideo.imagePosY != null) ? featuredVideo.imagePosY : 20;
    const heroZoom = (featuredVideo.imageZoom != null) ? featuredVideo.imageZoom : 100;
    heroBgImage.style.backgroundPosition = `${heroPosX}% ${heroPosY}%`;
    heroBgImage.style.transform = `scale(${heroZoom / 100})`;
    
    // Porcentagem de match randômica persistente para o vídeo
    const matchVal = (100 - (featuredVideo.title.length % 10)).toString();
    heroMatch.textContent = `${matchVal}% Match`;
    
    heroYear.textContent = featuredVideo.year || "2026";
    heroDuration.textContent = featuredVideo.duration;

    // Configura classe da classificação indicativa do Hero
    heroRating.className = `age-rating rating-${featuredVideo.rating.toLowerCase()}`;
    heroRating.textContent = featuredVideo.rating === "L" ? "L" : `${featuredVideo.rating}+`;

    // Eventos dos botões do Hero
    // Busca os elementos atuais no DOM (podem já ter sido substituídos em uma chamada anterior) para
    // evitar erro ao tentar substituir um nó que não está mais no DOM
    const currentPlayBtn = document.getElementById('hero-play-btn');
    const currentInfoBtn = document.getElementById('hero-info-btn');
    const newPlayBtn = currentPlayBtn.cloneNode(true);
    const newInfoBtn = currentInfoBtn.cloneNode(true);
    currentPlayBtn.parentNode.replaceChild(newPlayBtn, currentPlayBtn);
    currentInfoBtn.parentNode.replaceChild(newInfoBtn, currentInfoBtn);

    document.getElementById('hero-play-btn').addEventListener('click', () => {
        openPlayerModal(featuredVideo);
    });

    document.getElementById('hero-info-btn').addEventListener('click', () => {
        openVideoDetails(featuredVideo);
    });
}

// Inserir os Cards no Slider
function renderCarouselCards(carouselElement, videos) {
    carouselElement.innerHTML = '';
    
    videos.forEach(video => {
        const wrapper = document.createElement('div');
        wrapper.className = 'video-card-wrapper';
        
        const isFavorite = myFavoriteList.includes(video.id);
        const favoriteIcon = isFavorite ? 'check' : 'plus';
        const favoriteTitle = isFavorite ? 'Remover da minha lista' : 'Adicionar à minha lista';

        // Match rating
        const matchVal = (100 - (video.title.length % 10)).toString();

        // Cards de série com mais de 1 capítulo mostram apenas 1 card (o primeiro capítulo)
        // e, ao clicar, abrem a lista de episódios em vez de tocar direto
        const isSeriesGroup = Array.isArray(video.episodes) && video.episodes.length > 1;
        const cardTitle = isSeriesGroup ? (video.seriesName || video.title) : video.title;

        // A fileira "Minha Lista" mostra a capa no formato original (sem o recorte/zoom configurado
        // para os pôsteres verticais), para o usuário reconhecer o vídeo como ele salvou originalmente
        const isMyListRow = (carouselElement.id === 'carousel-destaques');
        const imgStyleAttr = isMyListRow ? 'object-fit: contain; background-color: #000;' : getPosterImageStyle(video);
        const imgClass = isMyListRow ? 'video-card-thumbnail video-card-thumbnail-original' : 'video-card-thumbnail';

        wrapper.innerHTML = `
            <div class="video-card">
                <img src="${video.imageUrl}" alt="${cardTitle}" class="${imgClass}" loading="lazy" style="${imgStyleAttr}">
                
                ${isSeriesGroup ? `
                <div class="series-count-badge">
                    <i data-lucide="layers" style="width: 11px; height: 11px;"></i>
                    <span>${video.episodes.length} capítulos</span>
                </div>` : ''}

                <div class="video-card-mini-info">
                    <span class="video-card-mini-title">${cardTitle}</span>
                    <div class="card-play-icon">
                        <i data-lucide="${isSeriesGroup ? 'list' : 'play'}" style="width: 12px; height: 12px; fill: ${isSeriesGroup ? 'none' : 'currentColor'};"></i>
                    </div>
                </div>

                <!-- Detalhes expandidos ao passar o mouse (Hover Netflix) -->
                <div class="video-card-details">
                    <div class="details-row-1">
                        <div class="details-actions-left">
                            <button class="btn-card-circle btn-play-card" title="${isSeriesGroup ? 'Ver capítulos' : 'Assistir Agora'}">
                                <i data-lucide="${isSeriesGroup ? 'list' : 'play'}" style="width: 12px; height: 12px; fill: ${isSeriesGroup ? 'none' : 'currentColor'};"></i>
                            </button>
                            <button class="btn-card-circle btn-favorite-card" title="${favoriteTitle}">
                                <i data-lucide="${favoriteIcon}" style="width: 12px; height: 12px;"></i>
                            </button>
                        </div>
                        <button class="btn-card-circle btn-info-card" title="Mais Informações">
                            <i data-lucide="chevron-down" style="width: 12px; height: 12px;"></i>
                        </button>
                    </div>
                    
                    <div class="details-row-2">
                        <span class="match-score">${matchVal}% Match</span>
                        <span class="age-rating rating-${video.rating.toLowerCase()}">${video.rating === "L" ? "L" : video.rating + "+"}</span>
                        <span class="duration">${isSeriesGroup ? video.episodes.length + ' episódios' : video.duration}</span>
                    </div>

                    <div class="details-row-3">
                        ${video.description}
                    </div>

                    <div class="details-genres">
                        <span>• ${video.director}</span>
                        <span>• ${video.year}</span>
                    </div>
                </div>
            </div>
        `;

        // Eventos do Card
        // Séries com mais de 1 capítulo abrem a lista de episódios; os demais tocam direto o vídeo
        const handlePrimaryAction = () => {
            if (isSeriesGroup) {
                openSeriesEpisodesModal(video.episodes, video);
            } else {
                openPlayerModal(video);
            }
        };

        wrapper.querySelector('.video-card-thumbnail').addEventListener('click', () => {
            if (isMobileViewport()) {
                openPosterLightbox(video, isSeriesGroup, cardTitle);
            } else {
                handlePrimaryAction();
            }
        });
        wrapper.querySelector('.btn-play-card').addEventListener('click', (e) => {
            e.stopPropagation();
            handlePrimaryAction();
        });

        // Adicionar / Remover Favoritos
        wrapper.querySelector('.btn-favorite-card').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(video.id);
        });

        // Abrir Modal de Informações Detalhadas (para séries, mostra a lista de episódios também)
        wrapper.querySelector('.btn-info-card').addEventListener('click', (e) => {
            e.stopPropagation();
            if (isSeriesGroup) {
                openSeriesEpisodesModal(video.episodes, video);
            } else {
                openVideoDetails(video);
            }
        });

        carouselElement.appendChild(wrapper);
    });
}

// Rolar carrossel horizontalmente
window.scrollCarousel = function(carouselId, direction) {
    const carousel = document.getElementById(carouselId);
    const scrollAmount = carousel.clientWidth * 0.8;
    carousel.scrollBy({
        left: direction * scrollAmount,
        behavior: 'smooth'
    });
};

// Gerenciar "Minha Lista"
// Mostra uma notificação temporária no topo da tela (substitui os alert() de confirmação de sucesso,
// que exigiam clicar em OK). Some sozinha depois de alguns segundos.
function showToast(message, options = {}) {
    const toast = document.getElementById('app-toast');
    if (!toast) return;

    const duration = options.duration || 3000;
    const isError = options.isError || false;

    toast.textContent = message;
    toast.classList.toggle('toast-error', isError);

    // Reinicia a animação mesmo se um toast já estiver visível
    toast.classList.remove('show');
    // Força o navegador a recalcular o estilo antes de reaplicar a classe (garante a transição)
    void toast.offsetWidth;
    toast.classList.add('show');

    clearTimeout(toastHideTimeout);
    toastHideTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

function toggleFavorite(videoId) {
    const index = myFavoriteList.indexOf(videoId);
    if (index > -1) {
        myFavoriteList.splice(index, 1);
    } else {
        myFavoriteList.push(videoId);
    }
    localStorage.setItem('tubeflix_favorites', JSON.stringify(myFavoriteList));
    filterAndRenderRows();
}

// 10. API do YouTube IFrame para Player Customizado
function loadYoutubeIFrameAPI() {
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

// Função global chamada pelo YouTube Iframe API quando estiver pronta
window.onYouTubeIframeAPIReady = function() {
    console.log("YouTube Player API inicializada com sucesso.");
    // Se o usuário já tinha clicado em um vídeo antes da API terminar de carregar, cria o player agora
    if (pendingAutoplayVideoId) {
        const videoId = pendingAutoplayVideoId;
        pendingAutoplayVideoId = null;
        createOrLoadYoutubePlayer(videoId);
    }
};

// Cria o player do YouTube (via API oficial, necessária para detectar o fim do vídeo) ou reaproveita
// o player já existente, apenas trocando o vídeo carregado (evita recriar o iframe a cada clique)
// Decide qual player usar de acordo com a origem do vídeo (YouTube, Vimeo, arquivo direto ou outro
// site) e o carrega. Vídeos cadastrados antes desse recurso não têm o campo "sourceType" salvo — como
// todos eles vieram do YouTube e têm "videoId", assumimos 'youtube' nesse caso (compatibilidade).
function loadPlayerForVideo(video) {
    const sourceType = video.sourceType || (video.videoId ? 'youtube' : 'iframe');
    const ytPlaceholder = document.getElementById('youtube-player-placeholder');
    const genericContainer = document.getElementById('generic-player-container');

    if (sourceType === 'youtube') {
        genericContainer.innerHTML = '';
        genericContainer.classList.add('hidden');
        ytPlaceholder.classList.remove('hidden');
        // Usa a API oficial do YouTube (necessária para detectar o fim do vídeo e avançar o próximo
        // capítulo, e para saber quando um vídeo não pode ser incorporado)
        createOrLoadYoutubePlayer(video.videoId);
        return;
    }

    // Para vídeos que não são do YouTube: pausa e esconde o player do YouTube (se houver um tocando)
    // e mostra o player genérico (iframe ou vídeo direto) no lugar.
    if (activeYoutubePlayer && typeof activeYoutubePlayer.stopVideo === 'function') {
        try { activeYoutubePlayer.stopVideo(); } catch (err) { /* player pode não estar pronto ainda */ }
    }
    ytPlaceholder.classList.add('hidden');
    genericContainer.classList.remove('hidden');

    if (sourceType === 'direct') {
        // Arquivo de vídeo direto (.mp4/.webm/.ogg): usa o player nativo do navegador
        genericContainer.innerHTML = `<video id="generic-video-element" src="${video.embedUrl}" controls autoplay playsinline></video>`;
        const videoEl = document.getElementById('generic-video-element');
        if (videoEl) {
            // Ao terminar o vídeo, oferece o próximo capítulo da série (mesma lógica usada no YouTube)
            videoEl.addEventListener('ended', () => {
                const next = findNextEpisode(currentPlayingVideo);
                if (next) startNextEpisodeCountdown(next);
            });
        }
    } else if (sourceType === 'vimeo') {
        genericContainer.innerHTML = `<iframe src="${video.embedUrl}?autoplay=1" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
    } else {
        // Link genérico de outro site — nem todo site permite ser incorporado (embutido) em um iframe;
        // por isso o link "Assistir no site original" fica sempre visível para esses casos.
        genericContainer.innerHTML = `<iframe src="${video.embedUrl}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
    }
}

function createOrLoadYoutubePlayer(videoId) {
    if (typeof YT === 'undefined' || !YT.Player) {
        // A API do YouTube ainda não carregou; guarda o vídeo para tocar assim que ela ficar pronta
        pendingAutoplayVideoId = videoId;
        return;
    }

    if (activeYoutubePlayer && typeof activeYoutubePlayer.loadVideoById === 'function') {
        activeYoutubePlayer.loadVideoById(videoId);
        return;
    }

    activeYoutubePlayer = new YT.Player('youtube-player-placeholder', {
        videoId: videoId,
        playerVars: { autoplay: 1, rel: 0 },
        events: {
            onStateChange: handlePlayerStateChange,
            onError: handlePlayerError
        }
    });
}

// Alguns vídeos não podem ser reproduzidos embutidos no site (o dono do vídeo bloqueou a incorporação,
// o vídeo foi removido/é privado, etc). Nesses casos o player do YouTube mostraria uma mensagem de erro
// como "Vídeo indisponível" com um link para assistir no YouTube — em vez de mostrar essa mensagem,
// fechamos nosso player e abrimos o vídeo diretamente no YouTube em uma nova aba.
// Alguns vídeos não podem ser reproduzidos embutidos no site (o dono do vídeo bloqueou a incorporação,
// ou o vídeo foi removido/é privado). Nesses casos o player do YouTube mostraria uma mensagem de erro
// como "Vídeo indisponível" com um link para assistir no YouTube — em vez de mostrar essa mensagem,
// fechamos nosso player e abrimos o vídeo diretamente no YouTube em uma nova aba.
//
// IMPORTANTE: só fazemos isso para os códigos de erro que realmente significam "não é possível
// incorporar este vídeo". Outros códigos (parâmetro inválido, erro genérico do player HTML5) podem
// ser falhas passageiras e NÃO significam que o vídeo está indisponível — nesses casos não redirecionamos,
// para não abrir o YouTube desnecessariamente em vídeos que na verdade funcionam.
function handlePlayerError(event) {
    const code = event.data;

    // 100 = vídeo não encontrado (removido ou privado)
    // 101 / 150 = o dono do vídeo não permite reprodução incorporada (embed) neste site
    const NOT_EMBEDDABLE_CODES = [100, 101, 150];
    if (!NOT_EMBEDDABLE_CODES.includes(code)) {
        console.warn(`YouTube Player: erro código ${code} ignorado (não indica bloqueio de incorporação).`);
        return;
    }

    const videoId = currentPlayingVideo ? currentPlayingVideo.videoId : null;

    cancelNextEpisodeCountdown();
    closePlayerModal();

    if (videoId) {
        window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank', 'noopener');
    }
}

// Detecta o fim da reprodução para oferecer o próximo capítulo automaticamente (apenas séries)
function handlePlayerStateChange(event) {
    if (typeof YT === 'undefined') return;

    if (event.data === YT.PlayerState.ENDED) {
        const next = findNextEpisode(currentPlayingVideo);
        if (next) {
            startNextEpisodeCountdown(next);
        }
    } else if (event.data === YT.PlayerState.PLAYING) {
        // Se o vídeo voltou a tocar (ex: usuário deu replay), cancela qualquer contagem pendente
        cancelNextEpisodeCountdown();
    }
}

// Encontra o próximo capítulo da mesma série (pela ordem definida no painel admin), sem misturar séries diferentes
function findNextEpisode(video) {
    if (!video || video.category !== 'series' || !video.seriesName || !video.seriesName.trim()) {
        return null;
    }

    const normalizedName = video.seriesName.trim().toLowerCase();
    const siblings = allVideos.filter(v =>
        v.category === 'series' &&
        v.seriesName &&
        v.seriesName.trim().toLowerCase() === normalizedName
    );

    if (siblings.length < 2) return null;

    siblings.sort((a, b) => {
        const orderA = (a.episodeOrder != null) ? a.episodeOrder : Infinity;
        const orderB = (b.episodeOrder != null) ? b.episodeOrder : Infinity;
        if (orderA !== orderB) return orderA - orderB;
        return (a.createdAt || 0) - (b.createdAt || 0);
    });

    const currentIndex = siblings.findIndex(v => v.id === video.id);
    if (currentIndex === -1 || currentIndex === siblings.length - 1) return null; // é o último capítulo

    return siblings[currentIndex + 1];
}

// Mostra o aviso de "Próximo capítulo" com contagem regressiva de 10 segundos
function startNextEpisodeCountdown(next) {
    pendingNextEpisode = next;
    nextEpisodeSecondsLeft = 10;

    nextEpisodeTitleEl.textContent = next.title;
    nextEpisodeThumbEl.src = next.imageUrl;
    nextEpisodeThumbEl.setAttribute('style', getPosterImageStyle(next));
    nextEpisodeCountdownEl.textContent = nextEpisodeSecondsLeft;
    nextEpisodeOverlay.classList.remove('hidden');

    if (nextEpisodeCountdownInterval) clearInterval(nextEpisodeCountdownInterval);
    nextEpisodeCountdownInterval = setInterval(() => {
        nextEpisodeSecondsLeft -= 1;
        nextEpisodeCountdownEl.textContent = Math.max(nextEpisodeSecondsLeft, 0);
        if (nextEpisodeSecondsLeft <= 0) {
            playPendingNextEpisode();
        }
    }, 1000);
}

// Cancela a contagem regressiva (usuário clicou em "Cancelar", fechou o player, ou trocou de vídeo manualmente)
function cancelNextEpisodeCountdown() {
    if (nextEpisodeCountdownInterval) {
        clearInterval(nextEpisodeCountdownInterval);
        nextEpisodeCountdownInterval = null;
    }
    pendingNextEpisode = null;
    nextEpisodeOverlay.classList.add('hidden');
}

// Inicia o próximo capítulo (chamado ao fim da contagem ou ao clicar em "Assistir agora")
function playPendingNextEpisode() {
    const next = pendingNextEpisode;
    cancelNextEpisodeCountdown();
    if (next) openPlayerModal(next);
}

// Abrir Vídeo no Modal
function openPlayerModal(video) {
    playerModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Travar rolagem do fundo

    // Cancela qualquer contagem de "próximo capítulo" pendente do vídeo anterior
    cancelNextEpisodeCountdown();
    currentPlayingVideo = video;

    // Registra no histórico de "assistidos recentemente" (usado para popular a fileira "Minha Lista")
    recordWatchHistory(video.id);

    // Configura as informações do modal
    document.getElementById('modal-video-title').textContent = video.title;
    document.getElementById('modal-video-description').textContent = video.description;
    document.getElementById('modal-video-cast').textContent = video.cast || "Não informado";
    document.getElementById('modal-video-director').textContent = video.director;
    const catLabels = getCategoryLabels();
    document.getElementById('modal-video-category').textContent = (catLabels[video.category] || video.category).toUpperCase();
    document.getElementById('modal-video-duration').textContent = video.duration;
    document.getElementById('modal-video-year').textContent = video.year;
    
    const ageRate = document.getElementById('modal-video-rating');
    ageRate.className = `age-rating rating-${video.rating.toLowerCase()}`;
    ageRate.textContent = video.rating === "L" ? "L" : `${video.rating}+`;

    const matchVal = (100 - (video.title.length % 10)).toString();
    document.getElementById('modal-video-match').textContent = `${matchVal}% Match`;

    // Link "Assistir no site original": só aparece para vídeos que não são do YouTube, já que não temos
    // como detectar automaticamente se a incorporação (embed) de um site de terceiros vai falhar
    // silenciosamente — é um atalho manual de segurança para o usuário caso o player não funcione.
    const externalLink = document.getElementById('modal-video-external-link');
    const effectiveSourceType = video.sourceType || (video.videoId ? 'youtube' : 'iframe');
    if (effectiveSourceType !== 'youtube' && video.url) {
        externalLink.href = video.url;
        externalLink.classList.remove('hidden');
    } else {
        externalLink.classList.add('hidden');
    }

    // Carrega o player adequado para a origem do vídeo (YouTube, Vimeo, arquivo direto, ou outro site)
    loadPlayerForVideo(video);
}

function closePlayerModal() {
    playerModal.classList.add('hidden');
    document.body.style.overflow = 'auto'; // Destravar rolagem do fundo

    // Cancela qualquer contagem de próximo capítulo em andamento
    cancelNextEpisodeCountdown();
    currentPlayingVideo = null;

    // Interrompe a reprodução/áudio instantaneamente sem destruir o player (reaproveitado na próxima abertura)
    if (activeYoutubePlayer && typeof activeYoutubePlayer.stopVideo === 'function') {
        activeYoutubePlayer.stopVideo();
    }

    // Limpa o player genérico (iframe do Vimeo/outro site, ou vídeo direto) para interromper a reprodução
    const genericContainer = document.getElementById('generic-player-container');
    if (genericContainer) {
        genericContainer.innerHTML = '';
        genericContainer.classList.add('hidden');
    }
}

// Abre a lista de capítulos de uma série, para o usuário escolher qual episódio assistir
// (evita poluir a fileira de séries com uma capa repetida para cada capítulo)
function openSeriesEpisodesModal(episodes, representative) {
    modalSeriesEpisodes.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    seriesEpisodesTitle.textContent = representative.seriesName || representative.title;
    seriesEpisodesSubtitle.textContent = `${episodes.length} capítulo${episodes.length > 1 ? 's' : ''}`;

    seriesEpisodesList.innerHTML = '';
    episodes.forEach((episode, index) => {
        const orderLabel = (episode.episodeOrder != null) ? episode.episodeOrder : (index + 1);

        const item = document.createElement('div');
        item.className = 'series-episode-item';
        item.innerHTML = `
            <span class="series-episode-number">${orderLabel}</span>
            <img src="${episode.imageUrl}" alt="${episode.title}" class="series-episode-thumb" style="${getPosterImageStyle(episode)}">
            <div class="series-episode-info">
                <span class="series-episode-title">${episode.title}</span>
                <span class="series-episode-meta">${episode.duration || ''}</span>
            </div>
            <div class="series-episode-play">
                <i data-lucide="play" style="width: 14px; height: 14px; fill: currentColor;"></i>
            </div>
        `;
        item.addEventListener('click', () => {
            closeSeriesEpisodesModal();
            openPlayerModal(episode);
        });
        seriesEpisodesList.appendChild(item);
    });

    lucide.createIcons();
}

function closeSeriesEpisodesModal() {
    modalSeriesEpisodes.classList.add('hidden');
    document.body.style.overflow = 'auto';
}

// Considera "celular" a mesma largura usada no restante do site para o menu hambúrguer/layout mobile
function isMobileViewport() {
    return window.innerWidth <= 860;
}

// No celular, tocar na capa abre uma prévia ampliada (lightbox) com botão de Assistir e Fechar,
// em vez de abrir o player direto — evita toques acidentais e dá mais destaque à capa.
function openPosterLightbox(video, isSeriesGroup, cardTitle) {
    posterLightboxImage.src = video.imageUrl;
    posterLightboxImage.setAttribute('style', getPosterImageStyle(video));
    posterLightboxTitleEl.textContent = cardTitle;

    const matchVal = (100 - (video.title.length % 10)).toString();
    posterLightboxMetaEl.innerHTML = `
        <span class="match-score">${matchVal}% Match</span>
        <span class="age-rating rating-${video.rating.toLowerCase()}">${video.rating === "L" ? "L" : video.rating + "+"}</span>
        <span class="duration">${isSeriesGroup ? video.episodes.length + ' episódios' : video.duration}</span>
    `;

    posterLightboxWatchBtn.innerHTML = isSeriesGroup
        ? `<i data-lucide="list"></i><span>Ver Capítulos</span>`
        : `<i data-lucide="play" style="fill: currentColor;"></i><span>Assistir</span>`;

    posterLightboxWatchBtn.onclick = () => {
        closePosterLightbox();
        if (isSeriesGroup) {
            openSeriesEpisodesModal(video.episodes, video);
        } else {
            openPlayerModal(video);
        }
    };

    posterLightbox.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    lucide.createIcons();
}

function closePosterLightbox() {
    posterLightbox.classList.add('hidden');
    document.body.style.overflow = 'auto';
}

// Lembra a preferência de densidade da grade (3 ou 4/5 capas por fileira) entre visitas
function applyGridDensityPreference() {
    const isDensity3 = localStorage.getItem('tubeflix_grid_density') === '3';
    document.body.classList.toggle('grid-density-3', isDensity3);
    if (btnToggleGridDensity) {
        btnToggleGridDensity.innerHTML = isDensity3
            ? `<i data-lucide="grid-2x2"></i>`
            : `<i data-lucide="grid-3x3"></i>`;
        btnToggleGridDensity.title = isDensity3
            ? "Mostrar mais capas por fileira"
            : "Mostrar capas maiores (3 por fileira)";
        lucide.createIcons();
    }
}

// Mostrar mais informações do vídeo no modal do player
function openVideoDetails(video) {
    // Emula a funcionalidade da Netflix abrindo o player no modal, mostrando a sinopse em destaque
    openPlayerModal(video);
}

// 11. Lista de Gerenciamento no Painel Admin (CRUD)
function renderAdminList() {
    adminVideosContainer.innerHTML = '';
    
    if (allVideos.length === 0) {
        if (adminSearchCount) adminSearchCount.textContent = '';
        adminVideosContainer.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted); text-align:center; padding: 20px;">Nenhum vídeo cadastrado.</p>';
        return;
    }

    // Filtra pela pesquisa do painel admin (título, canal/diretor, nome da série ou categoria)
    let videosToShow = allVideos;
    if (adminSearchQuery !== '') {
        videosToShow = allVideos.filter(video => {
            const haystack = [
                video.title,
                video.director,
                video.seriesName,
                video.category,
                video.cast
            ].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(adminSearchQuery);
        });
    }

    if (adminSearchCount) {
        adminSearchCount.textContent = adminSearchQuery !== ''
            ? `${videosToShow.length} de ${allVideos.length} vídeo${allVideos.length !== 1 ? 's' : ''}`
            : `${allVideos.length} vídeo${allVideos.length !== 1 ? 's' : ''}`;
    }

    if (videosToShow.length === 0) {
        adminVideosContainer.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted); text-align:center; padding: 20px;">Nenhum vídeo encontrado para essa pesquisa.</p>';
        return;
    }

    videosToShow.forEach(video => {
        const row = document.createElement('div');
        row.className = 'admin-video-row';
        row.innerHTML = `
            <div class="admin-video-row-left">
                <img src="${video.imageUrl}" alt="Capa" class="admin-video-thumb">
                <div class="admin-video-text">
                    <span class="admin-video-title-item">${video.title}</span>
                    <span class="admin-video-channel">${video.director} (${video.category})</span>
                </div>
            </div>
            <div class="admin-video-actions">
                <button class="btn-action-icon btn-edit-item" onclick="prepareEditVideo('${video.id}')" title="Editar informações">
                    <i data-lucide="edit-3" style="width: 14px; height: 14px;"></i>
                </button>
                <button class="btn-action-icon btn-delete-item" onclick="deleteVideo('${video.id}')" title="Excluir vídeo">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
            </div>
        `;
        adminVideosContainer.appendChild(row);
    });

    lucide.createIcons();
}

window.prepareEditVideo = function(id) {
    const video = allVideos.find(v => v.id === id);
    if (!video) return;

    // Preencher campos do formulário
    editVideoIdInput.value = video.id;
    newUrlInput.value = video.url;
    document.getElementById('new-title').value = video.title;
    document.getElementById('new-category').value = video.category;
    document.getElementById('new-rating').value = video.rating;
    document.getElementById('new-duration').value = video.duration;
    document.getElementById('new-year').value = video.year;
    document.getElementById('new-director').value = video.director;
    document.getElementById('new-cast').value = video.cast || "";
    document.getElementById('new-description').value = video.description;
    newImageUrl.value = video.imageUrl;
    imagePreview.src = video.imageUrl;
    newImagePosX.value = (video.imagePosX != null) ? video.imagePosX : 50;
    newImagePosY.value = (video.imagePosY != null) ? video.imagePosY : 50;
    newImageZoom.value = (video.imageZoom != null) ? video.imageZoom : DEFAULT_POSTER_ZOOM;
    applyImageAlignToPreview();
    document.getElementById('new-featured').checked = video.featured || false;
    newSeriesName.value = video.seriesName || "";
    newEpisodeOrder.value = (video.episodeOrder != null) ? video.episodeOrder : "";
    toggleSeriesOrderFields();

    // Atualizar títulos do painel
    formActionTitle.textContent = "Editar Vídeo";
    btnCancelEdit.classList.remove('hidden');
    document.getElementById('btn-save-video').innerHTML = `<i data-lucide="check"></i> Atualizar Vídeo`;
    lucide.createIcons();

    // No celular, abre o formulário em tela cheia (a lista fica em segundo plano até salvar/cancelar)
    showAdminFormView();
};

window.deleteVideo = async function(id) {
    if (!confirm("Tem certeza que deseja remover este vídeo do catálogo?")) {
        return;
    }

    try {
        if (useLocalStorageFallback) {
            allVideos = allVideos.filter(v => v.id !== id);
            localStorage.setItem('tubeflix_videos', JSON.stringify(allVideos));
            showToast("Vídeo removido com sucesso!");
            filterAndRenderRows();
            renderAdminList();
        } else {
            await database.ref("videos/" + id).remove();
            showToast("Vídeo removido com sucesso!");
        }
    } catch (e) {
        console.error("Erro ao deletar:", e);
        alert("Ocorreu um erro ao excluir.");
    }
};

function resetForm() {
    addVideoForm.reset();
    editVideoIdInput.value = '';
    imagePreview.src = "https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=600";
    newImagePosX.value = 50;
    newImagePosY.value = 50;
    newImageZoom.value = DEFAULT_POSTER_ZOOM;
    applyImageAlignToPreview();
    toggleSeriesOrderFields();
    formActionTitle.textContent = "Adicionar Novo Vídeo";
    btnCancelEdit.classList.add('hidden');
    document.getElementById('btn-save-video').innerHTML = `<i data-lucide="check"></i> Salvar Vídeo`;
    lucide.createIcons();
}

// 12. Backup e Restauração de Biblioteca em JSON
function exportLibraryToJson() {
    if (allVideos.length === 0) {
        alert("Não há dados na biblioteca para exportar.");
        return;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allVideos, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `tubeflix_backup_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function importLibraryFromJson(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(evt) {
        try {
            const importedData = JSON.parse(evt.target.result);
            if (!Array.isArray(importedData)) {
                throw new Error("Formato inválido. O arquivo JSON deve ser um array de vídeos.");
            }

            if (importedData.length === 0) {
                alert("O arquivo selecionado não contém nenhum vídeo para importar.");
                e.target.value = '';
                return;
            }

            if (!confirm(`Deseja importar ${importedData.length} vídeo(s) para sua biblioteca? Eles serão adicionados aos vídeos já existentes (nada será apagado).`)) {
                e.target.value = '';
                return;
            }

            if (useLocalStorageFallback) {
                // Soma aos vídeos já existentes (não substitui a biblioteca).
                // Garante que cada vídeo importado tenha um ID único, mesmo que o arquivo não traga um.
                const existingIds = new Set(allVideos.map(v => v.id));
                const newVideos = importedData.map((video, idx) => {
                    let id = video.id;
                    if (!id || existingIds.has(id)) {
                        id = `imported_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 8)}`;
                    }
                    existingIds.add(id);
                    return { ...video, id };
                });
                allVideos = allVideos.concat(newVideos);
                localStorage.setItem('tubeflix_videos', JSON.stringify(allVideos));
                showToast(`${newVideos.length} vídeo(s) importado(s) com sucesso!`);
                filterAndRenderRows();
                renderAdminList();
            } else {
                // Salvar no Firebase Realtime Database (cada vídeo recebe uma nova chave gerada pelo Firebase).
                // Importante: a escrita é feita relativa a "dbRef" (o nó /videos), da mesma forma que um
                // cadastro individual normal (dbRef.push(...)) — evita problemas com regras de segurança que
                // podem rejeitar atualizações multi-caminho feitas a partir da raiz do banco de dados.
                const updates = {};
                importedData.forEach(video => {
                    const newRefKey = dbRef.push().key;
                    // Remove o id antigo (se existir) para evitar confusão com a nova chave do Firebase,
                    // e remove quaisquer campos "undefined" (o Firebase rejeita valores undefined).
                    const { id, ...cleanVideo } = video;
                    Object.keys(cleanVideo).forEach(key => {
                        if (cleanVideo[key] === undefined) delete cleanVideo[key];
                    });
                    updates[newRefKey] = cleanVideo;
                });

                await dbRef.update(updates);
                showToast(`${importedData.length} vídeo(s) importado(s) no Firebase com sucesso!`);
            }
        } catch (err) {
            console.error("Erro ao importar JSON:", err);
            alert("Não foi possível importar o arquivo.\n\nDetalhe do erro: " + err.message);
        } finally {
            e.target.value = ''; // Permite selecionar o mesmo arquivo novamente, se necessário
        }
    };
    reader.onerror = function() {
        alert("Não foi possível ler o arquivo selecionado. Verifique se ele não está corrompido.");
        e.target.value = '';
    };
    reader.readAsText(file);
}
