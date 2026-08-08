// TubeFlix - Aplicação JavaScript

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
const ADMIN_PASSWORD = "123";
let allVideos = [];
let myFavoriteList = JSON.parse(localStorage.getItem('tubeflix_favorites')) || [];
let activeCategoryFilter = 'todos';
let currentSearchQuery = '';
let activeYoutubePlayer = null;

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
const closePassModal = document.getElementById('close-pass-modal');
const closeAdminModal = document.getElementById('close-admin-modal');
const closePlayerBtn = document.getElementById('close-player-btn');
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
const btnCancelEdit = document.getElementById('btn-cancel-edit');
const formActionTitle = document.getElementById('form-action-title');

// Destaque (Hero)
const heroTitle = document.getElementById('hero-title');
const heroDescription = document.getElementById('hero-description');
const heroBgImage = document.getElementById('hero-bg-image');
const heroMatch = document.getElementById('hero-match');
const heroYear = document.getElementById('hero-year');
const heroRating = document.getElementById('hero-rating');
const heroDuration = document.getElementById('hero-duration');
const heroPlayBtn = document.getElementById('hero-play-btn');
const heroInfoBtn = document.getElementById('hero-info-btn');

// Backups e Outros
const btnExportJson = document.getElementById('btn-export-json');
const btnImportJsonTrigger = document.getElementById('btn-import-json-trigger');
const importJsonFile = document.getElementById('import-json-file');
const currentYearSpan = document.getElementById('current-year');

// 4. Inicialização do Site
document.addEventListener('DOMContentLoaded', () => {
    // Configurar ano no footer
    if (currentYearSpan) currentYearSpan.textContent = new Date().getFullYear();

    // Inicializar Ícones Lucide
    lucide.createIcons();

    // Carregar Vídeos
    fetchVideos();

    // Configurar Event Listeners
    setupNavScroll();
    setupEventListeners();
    loadYoutubeIFrameAPI();
});

// Efeito de escurecer a navbar ao rolar a página
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

    // Filtros de Categorias no Topo
    const navLinks = document.querySelectorAll('.nav-links li');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            navLinks.forEach(l => l.classList.remove('active'));
            e.target.classList.add('active');
            activeCategoryFilter = e.target.getAttribute('data-filter');
            
            // Rolar suavemente até o início das fileiras
            window.scrollTo({
                top: document.querySelector('.main-container').offsetTop - 100,
                behavior: 'smooth'
            });

            filterAndRenderRows();
        });
    });

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

    // Validação de senha
    btnSubmitPass.addEventListener('click', verifyAdminPassword);
    adminPassInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') verifyAdminPassword();
    });

    // Botão de extração rápida do link do YouTube
    btnFetchUrl.addEventListener('click', async () => {
        const url = newUrlInput.value.trim();
        if (!url) {
            alert('Por favor, insira uma URL do YouTube válida primeiro.');
            return;
        }

        const videoId = extractYouTubeId(url);
        if (!videoId) {
            alert('Não foi possível identificar o ID do vídeo do YouTube. Verifique o link.');
            return;
        }

        // Feedback de carregamento
        btnFetchUrl.disabled = true;
        btnFetchUrl.innerHTML = `<div class="spinner" style="width:14px; height:14px; border-width:2px; margin-right:5px;"></div> Buscando...`;

        const metadata = await getYouTubeMetadata(url);
        
        btnFetchUrl.disabled = false;
        btnFetchUrl.innerHTML = `<i data-lucide="wand2"></i> <span>Extrair</span>`;
        lucide.createIcons();

        if (metadata) {
            fillFormWithMetadata(metadata, videoId);
        } else {
            // Caso falhe o noembed (CORS, limite de rede, etc.), gera localmente
            fillFormSimulated(videoId);
        }
    });

    // Salvar Vídeo (Novo ou Editado)
    addVideoForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const editId = editVideoIdInput.value;
        const videoData = {
            url: newUrlInput.value.trim(),
            videoId: extractYouTubeId(newUrlInput.value.trim()),
            title: document.getElementById('new-title').value.trim(),
            category: document.getElementById('new-category').value,
            rating: document.getElementById('new-rating').value,
            duration: document.getElementById('new-duration').value.trim(),
            year: parseInt(document.getElementById('new-year').value),
            director: document.getElementById('new-director').value.trim(),
            cast: document.getElementById('new-cast').value.trim(),
            description: document.getElementById('new-description').value.trim(),
            imageUrl: newImageUrl.value.trim() || `https://img.youtube.com/vi/${extractYouTubeId(newUrlInput.value.trim())}/maxresdefault.jpg`,
            featured: document.getElementById('new-featured').checked,
            createdAt: new Date().getTime()
        };

        if (!videoData.videoId) {
            alert("URL do YouTube inválida.");
            return;
        }

        // Se este vídeo for Destaque Principal, desativa os outros
        if (videoData.featured) {
            await clearAllFeaturedFlags();
        }

        try {
            if (useLocalStorageFallback) {
                if (editId) {
                    const index = allVideos.findIndex(v => v.id === editId);
                    if (index > -1) {
                        allVideos[index] = { id: editId, ...videoData };
                    }
                } else {
                    const newId = 'local_' + Math.random().toString(36).substr(2, 9);
                    allVideos.push({ id: newId, ...videoData });
                }
                localStorage.setItem('tubeflix_videos', JSON.stringify(allVideos));
                alert("Salvo com sucesso (Armazenamento Local)!");
            } else {
                if (editId) {
                    await database.ref("videos/" + editId).set(videoData);
                    alert("Vídeo atualizado no Firebase!");
                } else {
                    await dbRef.push(videoData);
                    alert("Vídeo adicionado ao Firebase!");
                }
            }

            resetForm();
            if (!useLocalStorageFallback) {
                // O Firebase fará o update dinâmico no on('value')
            } else {
                filterAndRenderRows();
                renderAdminList();
            }
            modalAdmin.classList.add('hidden');
        } catch (error) {
            console.error("Erro ao salvar:", error);
            alert("Ocorreu um erro ao salvar o vídeo.");
        }
    });

    btnCancelEdit.addEventListener('click', resetForm);

    // Exportar e Importar JSON
    btnExportJson.addEventListener('click', exportLibraryToJson);
    btnImportJsonTrigger.addEventListener('click', () => importJsonFile.click());
    importJsonFile.addEventListener('change', importLibraryFromJson);
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
    if (adminPassInput.value === ADMIN_PASSWORD) {
        modalPassword.classList.add('hidden');
        modalAdmin.classList.remove('hidden');
        resetForm();
        renderAdminList();
    } else {
        alert("Senha incorreta! Use a senha padrão '123'.");
    }
}

// 8. Algoritmo de Extração de Metadados e Geração Inteligente
function extractYouTubeId(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
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

    // Seletor de categorias e suas respectivas fileiras
    const rows = [
        { key: 'destaques', id: 'section-destaques', filterFn: v => v.featured || v.createdAt },
        { key: 'filmes', id: 'section-filmes', filterFn: v => v.category === 'filmes' },
        { key: 'series', id: 'section-series', filterFn: v => v.category === 'series' },
        { key: 'documentarios', id: 'section-documentarios', filterFn: v => v.category === 'documentarios' },
        { key: 'tutoriais', id: 'section-tutoriais', filterFn: v => v.category === 'tutoriais' }
    ];

    rows.forEach(row => {
        const section = document.getElementById(row.id);
        const carousel = section.querySelector('.row-carousel');
        
        let rowVideos = filteredVideos.filter(row.filterFn);

        // Tratamento especial para "Destaques/Populares" (não repetir o banner se houver muitos, ou pegar os melhores)
        if (row.key === 'destaques') {
            rowVideos = rowVideos.slice(0, 10); // Limita a 10 itens
        }

        // Filtro da barra lateral/superior (se categoria específica está ativa)
        const isSectionVisible = 
            (activeFilter === 'todos' || activeFilter === row.key) && 
            rowVideos.length > 0;

        // Se o usuário filtrou a categoria "favoritos" (Minha Lista)
        if (activeFilter === 'favoritos') {
            if (row.key === 'destaques') {
                rowVideos = filteredVideos.filter(v => myFavoriteList.includes(v.id));
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
    
    // Porcentagem de match randômica persistente para o vídeo
    const matchVal = (100 - (featuredVideo.title.length % 10)).toString();
    heroMatch.textContent = `${matchVal}% Match`;
    
    heroYear.textContent = featuredVideo.year || "2026";
    heroDuration.textContent = featuredVideo.duration;

    // Configura classe da classificação indicativa do Hero
    heroRating.className = `age-rating rating-${featuredVideo.rating.toLowerCase()}`;
    heroRating.textContent = featuredVideo.rating === "L" ? "L" : `${featuredVideo.rating}+`;

    // Eventos dos botões do Hero
    // Limpar listeners antigos
    const newPlayBtn = heroPlayBtn.cloneNode(true);
    const newInfoBtn = heroInfoBtn.cloneNode(true);
    heroPlayBtn.parentNode.replaceChild(newPlayBtn, heroPlayBtn);
    heroInfoBtn.parentNode.replaceChild(newInfoBtn, heroInfoBtn);

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

        wrapper.innerHTML = `
            <div class="video-card">
                <img src="${video.imageUrl}" alt="${video.title}" class="video-card-thumbnail" loading="lazy">
                
                <div class="video-card-mini-info">
                    <span class="video-card-mini-title">${video.title}</span>
                    <div class="card-play-icon">
                        <i data-lucide="play" style="width: 12px; height: 12px; fill: currentColor;"></i>
                    </div>
                </div>

                <!-- Detalhes expandidos ao passar o mouse (Hover Netflix) -->
                <div class="video-card-details">
                    <div class="details-row-1">
                        <div class="details-actions-left">
                            <button class="btn-card-circle btn-play-card" title="Assistir Agora">
                                <i data-lucide="play" style="width: 12px; height: 12px; fill: currentColor;"></i>
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
                        <span class="duration">${video.duration}</span>
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
        // Abrir Player ao clicar no card ou no botão play do hover
        wrapper.querySelector('.video-card-thumbnail').addEventListener('click', () => openPlayerModal(video));
        wrapper.querySelector('.btn-play-card').addEventListener('click', (e) => {
            e.stopPropagation();
            openPlayerModal(video);
        });

        // Adicionar / Remover Favoritos
        wrapper.querySelector('.btn-favorite-card').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(video.id);
        });

        // Abrir Modal de Informações Detalhadas
        wrapper.querySelector('.btn-info-card').addEventListener('click', (e) => {
            e.stopPropagation();
            openVideoDetails(video);
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
};

// Abrir Vídeo no Modal
function openPlayerModal(video) {
    playerModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Travar rolagem do fundo

    // Configura as informações do modal
    document.getElementById('modal-video-title').textContent = video.title;
    document.getElementById('modal-video-description').textContent = video.description;
    document.getElementById('modal-video-cast').textContent = video.cast || "Não informado";
    document.getElementById('modal-video-director').textContent = video.director;
    document.getElementById('modal-video-category').textContent = video.category.toUpperCase();
    document.getElementById('modal-video-duration').textContent = video.duration;
    document.getElementById('modal-video-year').textContent = video.year;
    
    const ageRate = document.getElementById('modal-video-rating');
    ageRate.className = `age-rating rating-${video.rating.toLowerCase()}`;
    ageRate.textContent = video.rating === "L" ? "L" : `${video.rating}+`;

    const matchVal = (100 - (video.title.length % 10)).toString();
    document.getElementById('modal-video-match').textContent = `${matchVal}% Match`;

    // Embed robusto via Iframe com autoplay (Funciona em file:// e http://)
    const wrapper = document.querySelector('.video-iframe-wrapper');
    wrapper.innerHTML = `
        <iframe 
            src="https://www.youtube.com/embed/${video.videoId}?autoplay=1&rel=0" 
            title="YouTube video player" 
            frameborder="0" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
            referrerpolicy="strict-origin-when-cross-origin"
            allowfullscreen>
        </iframe>
    `;
}

function closePlayerModal() {
    playerModal.classList.add('hidden');
    document.body.style.overflow = 'auto'; // Destravar rolagem do fundo

    // Limpa o Iframe para interromper a reprodução de vídeo/áudio instantaneamente
    const wrapper = document.querySelector('.video-iframe-wrapper');
    wrapper.innerHTML = '<div id="youtube-player-placeholder"></div>';
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
        adminVideosContainer.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted); text-align:center; padding: 20px;">Nenhum vídeo cadastrado.</p>';
        return;
    }

    allVideos.forEach(video => {
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
    document.getElementById('new-featured').checked = video.featured || false;

    // Atualizar títulos do painel
    formActionTitle.textContent = "Editar Vídeo";
    btnCancelEdit.classList.remove('hidden');
    document.getElementById('btn-save-video').innerHTML = `<i data-lucide="check"></i> Atualizar Vídeo`;
    lucide.createIcons();
};

window.deleteVideo = async function(id) {
    if (!confirm("Tem certeza que deseja remover este vídeo do catálogo?")) {
        return;
    }

    try {
        if (useLocalStorageFallback) {
            allVideos = allVideos.filter(v => v.id !== id);
            localStorage.setItem('tubeflix_videos', JSON.stringify(allVideos));
            alert("Vídeo removido localmente!");
            filterAndRenderRows();
            renderAdminList();
        } else {
            await database.ref("videos/" + id).remove();
            alert("Vídeo removido com sucesso!");
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

            if (!confirm(`Deseja importar ${importedData.length} vídeos para sua biblioteca? Destaques anteriores poderão ser reescritos.`)) {
                return;
            }

            if (useLocalStorageFallback) {
                // Sobrescrever ou fundir no LocalStorage
                allVideos = importedData;
                localStorage.setItem('tubeflix_videos', JSON.stringify(allVideos));
                alert("Dados importados no LocalStorage com sucesso!");
                filterAndRenderRows();
                renderAdminList();
            } else {
                // Salvar no Firebase Realtime Database
                const updates = {};
                importedData.forEach(video => {
                    const newRefKey = dbRef.push().key;
                    // Remove id antigo se existir para evitar confusão no Firebase
                    const { id, ...cleanVideo } = video;
                    updates[`/videos/${newRefKey}`] = cleanVideo;
                });

                await database.ref().update(updates);
                alert("Dados importados no Firebase Database com sucesso!");
            }
        } catch (err) {
            console.error("Erro ao importar JSON:", err);
            alert("Não foi possível importar. Certifique-se de que o arquivo JSON de backup está correto.");
        }
    };
    reader.readAsText(file);
}
