// kabarwarga.id - Application Logic (Strapi-powered)

// =========================================================================
// 0. Theme & Dark Mode Setup
// =========================================================================

const initThemeToggle = () => {
  const themeToggle = document.getElementById("theme-toggle");
  const body = document.body;

  // Load saved theme or default to light
  const savedTheme = localStorage.getItem("kw_theme") || "light";
  body.setAttribute("data-theme", savedTheme);

  themeToggle.addEventListener("click", () => {
    const currentTheme = body.getAttribute("data-theme");
    const newTheme = currentTheme === "light" ? "dark" : "light";

    body.setAttribute("data-theme", newTheme);
    localStorage.setItem("kw_theme", newTheme);

    // Add animation
    themeToggle.style.transform = "scale(0.9)";
    setTimeout(() => {
      themeToggle.style.transform = "";
    }, 150);
  });
};

// Reading Progress Bar
const initReadingProgress = () => {
  const progressBar = document.getElementById("reading-progress");

  const updateProgress = () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = (scrollTop / docHeight) * 100;

    if (progressBar) {
      progressBar.style.width = `${Math.min(progress, 100)}%`;
    }
  };

  window.addEventListener("scroll", updateProgress);
  updateProgress();
};

// Search Clear Button
const initSearchClear = () => {
  const searchInput = document.getElementById("search-input");
  const searchClear = document.getElementById("search-clear");

  if (!searchInput || !searchClear) return;

  const updateClearButton = () => {
    if (searchInput.value.trim().length > 0) {
      searchClear.classList.add("visible");
    } else {
      searchClear.classList.remove("visible");
    }
  };

  searchInput.addEventListener("input", updateClearButton);
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    searchInput.focus();
    searchClear.classList.remove("visible");
    window.location.hash = "#/";
  });

  updateClearButton();
};

// =========================================================================
// 1. Strapi Configuration
// =========================================================================
const STRAPI_URL = "http://localhost:1337"; // ganti ke URL Railway kamu saat production

// Data artikel di-fetch dari Strapi, bukan array statis.
let articles = [];

// =========================================================================
// 1. Strapi Fetch & Mapping
// =========================================================================

/**
 * Ambil semua artikel dari Strapi dan ubah bentuknya jadi shape yang sama
 * persis dengan mock database lama, supaya semua kode render di bawah
 * tidak perlu diubah sama sekali.
 */
const fetchArticlesFromStrapi = async () => {
  const res = await fetch(
    `${STRAPI_URL}/api/articles?populate=*&sort=publishedDate:desc`,
  );

  if (!res.ok) {
    throw new Error(`Gagal mengambil data artikel (status ${res.status})`);
  }

  const { data } = await res.json();

  return data.map((item) => ({
    id: item.documentId, // Strapi v5 pakai documentId (string), bukan id angka
    title: item.title,
    summary: item.excerpt,
    content: blocksToHtml(item.content),
    category: item.category?.name ?? "Umum",
    categoryColor: item.category?.color ?? "blue", // "blue" | "green", dari field color di Strapi
    author: item.author?.name ?? "Redaksi",
    date: formatTanggal(item.publishedDate),
    image: item.coverImage?.url
      ? `${STRAPI_URL}${item.coverImage.url}`
      : "assets/hero.png",
    featured: !!item.featured,
  }));
};

/**
 * Ubah tanggal ISO ("2026-07-12") jadi format Indonesia ("12 Juli 2026").
 */
const formatTanggal = (isoDate) => {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

/**
 * Escape karakter HTML dasar supaya teks dari Strapi aman dirender.
 */
const escapeHtml = (str) =>
  String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * Render children inline (bold, italic, underline, link, dst) dari
 * format Strapi Blocks jadi HTML.
 */
const renderInlineChildren = (children = []) =>
  children
    .map((child) => {
      if (child.type === "link") {
        return `<a href="${escapeHtml(child.url)}" target="_blank" rel="noopener">${renderInlineChildren(child.children)}</a>`;
      }
      let text = escapeHtml(child.text);
      if (child.bold) text = `<strong>${text}</strong>`;
      if (child.italic) text = `<em>${text}</em>`;
      if (child.underline) text = `<u>${text}</u>`;
      if (child.strikethrough) text = `<s>${text}</s>`;
      if (child.code) text = `<code>${text}</code>`;
      return text;
    })
    .join("");

/**
 * Ubah field `content` dari format Strapi Blocks (array of block objects)
 * jadi string HTML biasa, supaya bisa langsung di-inject seperti dulu.
 */
const blocksToHtml = (blocks) => {
  if (!Array.isArray(blocks)) return "";

  return blocks
    .map((block) => {
      switch (block.type) {
        case "paragraph":
          return `<p>${renderInlineChildren(block.children)}</p>`;
        case "heading": {
          const level = block.level || 2;
          return `<h${level}>${renderInlineChildren(block.children)}</h${level}>`;
        }
        case "quote":
          return `<blockquote>${renderInlineChildren(block.children)}</blockquote>`;
        case "list": {
          const tag = block.format === "ordered" ? "ol" : "ul";
          const items = (block.children || [])
            .map((li) => `<li>${renderInlineChildren(li.children)}</li>`)
            .join("");
          return `<${tag}>${items}</${tag}>`;
        }
        case "image":
          return block.image
            ? `<img src="${block.image.url}" alt="${escapeHtml(block.image.alternativeText || "")}">`
            : "";
        default:
          return `<p>${renderInlineChildren(block.children || [])}</p>`;
      }
    })
    .join("\n");
};

// =========================================================================
// 2. Local Storage Helpers for Community Interactions
// =========================================================================

if (!localStorage.getItem("kw_comments")) {
  localStorage.setItem("kw_comments", JSON.stringify({}));
}

if (!localStorage.getItem("kw_user_liked")) {
  localStorage.setItem("kw_user_liked", JSON.stringify([]));
}

const ensureLikesSeed = () => {
  const likes = localStorage.getItem("kw_likes")
    ? JSON.parse(localStorage.getItem("kw_likes"))
    : {};

  articles.forEach((a) => {
    if (!(a.id in likes)) {
      likes[a.id] = Math.floor(Math.random() * 50) + 10;
    }
  });

  localStorage.setItem("kw_likes", JSON.stringify(likes));
};

const getComments = (articleId) => {
  const comments = JSON.parse(localStorage.getItem("kw_comments"));
  return comments[articleId] || [];
};

const saveComment = (articleId, comment) => {
  const comments = JSON.parse(localStorage.getItem("kw_comments"));
  if (!comments[articleId]) {
    comments[articleId] = [];
  }
  comments[articleId].unshift(comment);
  localStorage.setItem("kw_comments", JSON.stringify(comments));
};

const getLikesCount = (articleId) => {
  const likes = JSON.parse(localStorage.getItem("kw_likes") || "{}");
  return likes[articleId] || 0;
};

const isArticleLikedByUser = (articleId) => {
  const userLiked = JSON.parse(localStorage.getItem("kw_user_liked"));
  return userLiked.includes(articleId);
};

const toggleLikeArticle = (articleId) => {
  const userLiked = JSON.parse(localStorage.getItem("kw_user_liked"));
  const likes = JSON.parse(localStorage.getItem("kw_likes") || "{}");
  let liked = false;

  const idx = userLiked.indexOf(articleId);
  if (idx > -1) {
    userLiked.splice(idx, 1);
    likes[articleId] = Math.max(0, (likes[articleId] || 1) - 1);
  } else {
    userLiked.push(articleId);
    likes[articleId] = (likes[articleId] || 0) + 1;
    liked = true;
  }

  localStorage.setItem("kw_user_liked", JSON.stringify(userLiked));
  localStorage.setItem("kw_likes", JSON.stringify(likes));
  return { liked, count: likes[articleId] };
};

// =========================================================================
// 3. UI Helpers
// =========================================================================

const showToast = (message) => {
  const toast = document.getElementById("toast-notification");
  const toastText = document.getElementById("toast-text");
  toastText.innerText = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
};

const showLoadingState = () => {
  document.getElementById("content-area").innerHTML = `
    <div class="empty-state">
      <h3 class="empty-state-title">Memuat berita...</h3>
      <p class="empty-state-desc">Sedang mengambil data terbaru dari server.</p>
    </div>
  `;
};

const showErrorState = (error) => {
  document.getElementById("content-area").innerHTML = `
    <div class="empty-state">
      <h3 class="empty-state-title">Gagal Memuat Berita</h3>
      <p class="empty-state-desc">
        Tidak bisa terhubung ke server. Pastikan Strapi sedang berjalan
        di <code>${STRAPI_URL}</code> dan CORS sudah diizinkan.<br>
        <span style="font-size: 0.85em; opacity: 0.7;">${escapeHtml(error.message)}</span>
      </p>
      <button class="btn-reset-search" id="btn-retry-load">Coba Lagi</button>
    </div>
  `;
  document.getElementById("btn-retry-load").addEventListener("click", () => {
    initApp();
  });
};

// =========================================================================
// 4. View Rendering Logic
// =========================================================================

const renderHomeView = (categoryFilter = null, searchQuery = "") => {
  const contentArea = document.getElementById("content-area");

  let filtered = [...articles];

  if (categoryFilter && categoryFilter.toLowerCase() !== "home") {
    filtered = filtered.filter(
      (a) => a.category.toLowerCase() === categoryFilter.toLowerCase(),
    );
  }

  if (searchQuery.trim() !== "") {
    const q = searchQuery.toLowerCase().trim();
    filtered = filtered.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q) ||
        a.content.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q),
    );
  }

  if (filtered.length === 0) {
    contentArea.innerHTML = `
      <div class="empty-state">
        <h3 class="empty-state-title">Berita Tidak Ditemukan</h3>
        <p class="empty-state-desc">Maaf, kami tidak menemukan berita yang cocok dengan kata kunci "${escapeHtml(searchQuery)}".</p>
        <button class="btn-reset-search" id="btn-reset-search">Reset Pencarian</button>
      </div>
    `;

    document
      .getElementById("btn-reset-search")
      .addEventListener("click", () => {
        document.getElementById("search-input").value = "";
        window.location.hash = "#/";
      });
    return;
  }

  let htmlContent = "";

  if (
    !searchQuery &&
    (!categoryFilter || categoryFilter.toLowerCase() === "home")
  ) {
    const heroArticle = articles.find((a) => a.featured) || articles[0];
    const categoryBadgeClass =
      heroArticle.categoryColor === "green" ? "badge-green" : "badge-blue";

    htmlContent += `
      <section class="hero-section" id="hero-article" data-id="${heroArticle.id}">
        <div class="hero-image-wrapper">
          <img src="${heroArticle.image}" alt="${escapeHtml(heroArticle.title)}" class="hero-image">
          <div class="trending-badge">
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M17.66 11.2C17.43 10.9 17.15 10.64 16.89 10.38C16.22 9.78 15.46 9.35 14.82 8.72C13.33 7.26 13 4.85 13.95 3C13 3.23 12.17 3.75 11.46 4.32C8.87 6.4 7.85 10.07 9.07 13.22C9.11 13.32 9.15 13.42 9.15 13.55C9.15 13.77 9 13.97 8.8 14.05C8.57 14.15 8.33 14.09 8.14 13.93C8.08 13.88 8.04 13.83 8 13.76C6.87 12.33 6.69 10.28 7.45 8.64C5.78 10 4.87 12.3 5 14.47C5.06 14.97 5.12 15.47 5.29 15.97C5.43 16.57 5.7 17.17 6 17.7C7.08 19.43 8.95 20.67 10.96 20.92C13.1 21.19 15.39 20.8 17.03 19.32C18.86 17.66 19.5 15 18.56 12.72L18.43 12.46C18.22 12 17.66 11.2 17.66 11.2Z"/>
            </svg>
            Sedang Hangat
          </div>
        </div>
        <div class="hero-meta">
          <span class="badge ${categoryBadgeClass}">${escapeHtml(heroArticle.category)}</span>
          <span class="hero-author-date">
            <span class="author-avatar">${heroArticle.author.charAt(0).toUpperCase()}</span>
            <span class="author-name">${escapeHtml(heroArticle.author)}</span> &bull; ${heroArticle.date}
          </span>
        </div>
        <h1 class="hero-title">${escapeHtml(heroArticle.title)}</h1>
        <p class="hero-summary">${escapeHtml(heroArticle.summary)}</p>
      </section>
    `;
  }

  let sectionTitleText = "Berita Terbaru";
  if (searchQuery) {
    sectionTitleText = `Hasil Pencarian: "${escapeHtml(searchQuery)}"`;
  } else if (categoryFilter && categoryFilter.toLowerCase() !== "home") {
    sectionTitleText = `Kategori: ${escapeHtml(categoryFilter)}`;
  }

  htmlContent += `
    <div class="section-header">
      <h2 class="section-title">${sectionTitleText}</h2>
      <span class="section-subtitle">${filtered.length} Artikel</span>
    </div>
    <div class="news-grid">
  `;

  filtered.forEach((article) => {
    if (
      !searchQuery &&
      (!categoryFilter || categoryFilter.toLowerCase() === "home") &&
      article.featured
    ) {
      return;
    }

    const catClass = article.categoryColor === "green" ? "daerah" : "";
    const likesCount = getLikesCount(article.id);
    const readTime = Math.max(1, Math.ceil(article.summary.length / 500));

    htmlContent += `
      <div class="card-berita" data-id="${article.id}">
        <div class="card-image-wrapper">
          <img src="${article.image}" alt="${escapeHtml(article.title)}" class="card-image">
          <span class="card-category-overlay">${escapeHtml(article.category)}</span>
        </div>
        <div class="card-content">
          <span class="card-category ${catClass}">${escapeHtml(article.category)}</span>
          <h3 class="card-title">${escapeHtml(article.title)}</h3>
          <p class="card-description">${escapeHtml(article.summary)}</p>
          <div class="card-footer">
            <span class="card-meta">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              ${escapeHtml(article.author)}
            </span>
            <span class="card-read-time">${readTime} min baca</span>
          </div>
        </div>
      </div>
    `;
  });

  htmlContent += `</div>`;
  contentArea.innerHTML = htmlContent;

  const heroCard = document.getElementById("hero-article");
  if (heroCard) {
    heroCard.addEventListener("click", () => {
      const id = heroCard.getAttribute("data-id");
      window.location.hash = `#/artikel/${id}`;
    });
  }

  document.querySelectorAll(".card-berita").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.getAttribute("data-id");
      window.location.hash = `#/artikel/${id}`;
    });
  });
};

const renderDetailView = (articleId) => {
  const contentArea = document.getElementById("content-area");

  // Safety net: bersihkan overlay lama kalau ada sisa dari render sebelumnya.
  const existingOverlay = document.querySelector(".share-overlay");
  if (existingOverlay) existingOverlay.remove();

  const article = articles.find((a) => a.id === articleId);

  if (!article) {
    contentArea.innerHTML = `
      <div class="empty-state">
        <h3 class="empty-state-title">Artikel Tidak Ditemukan</h3>
        <p class="empty-state-desc">Artikel yang Anda cari tidak ada atau telah dihapus.</p>
        <button class="btn-reset-search" onclick="window.location.hash = '#/'">Kembali ke Beranda</button>
      </div>
    `;
    return;
  }

  const categoryBadgeClass =
    article.categoryColor === "green" ? "badge-green" : "badge-blue";
  const initials = article.author
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  let htmlContent = `
    <div class="detail-view">
      <div class="detail-container">
        <div class="detail-header-row">
          <div class="detail-category">
            <span class="badge ${categoryBadgeClass}">${escapeHtml(article.category)}</span>
          </div>

          <div class="share-menu-wrapper">
            <button class="btn-share-icon" id="btn-share-article" aria-label="Bagikan">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
            </button>
            <div class="share-menu" id="share-menu">
              <a class="share-menu-item" data-network="facebook" href="#" target="_blank" rel="noopener">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#1877F2" stroke="none"><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z"/></svg>
                Facebook
              </a>
              <a class="share-menu-item" data-network="twitter" href="#" target="_blank" rel="noopener">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#1DA1F2" stroke="none"><path d="M22 5.8c-.7.32-1.46.54-2.25.64a3.94 3.94 0 0 0 1.72-2.17 7.86 7.86 0 0 1-2.49.95 3.93 3.93 0 0 0-6.69 3.58A11.14 11.14 0 0 1 3.8 4.6a3.93 3.93 0 0 0 1.22 5.24 3.9 3.9 0 0 1-1.78-.49v.05a3.93 3.93 0 0 0 3.15 3.85 3.94 3.94 0 0 1-1.77.07 3.93 3.93 0 0 0 3.67 2.73A7.88 7.88 0 0 1 2 18.13a11.12 11.12 0 0 0 6.01 1.76c7.21 0 11.15-5.97 11.15-11.15 0-.17 0-.34-.01-.51A7.96 7.96 0 0 0 22 5.8z"/></svg>
                Twitter / X
              </a>
              <a class="share-menu-item" data-network="whatsapp" href="#" target="_blank" rel="noopener">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366" stroke="none"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm5.8 14.16c-.24.68-1.42 1.3-1.95 1.35-.5.05-1.13.07-1.82-.12-.4-.12-.93-.29-1.61-.57-2.84-1.23-4.69-4.07-4.83-4.27-.14-.2-1.16-1.54-1.16-2.94 0-1.4.74-2.09 1-2.38.24-.28.53-.35.71-.35.18 0 .35 0 .5.01.16.01.38-.06.59.45.24.59.82 2.02.89 2.17.07.14.12.31.02.5-.1.19-.15.31-.29.48-.15.17-.31.37-.44.5-.15.14-.3.3-.13.58.17.29.75 1.24 1.61 2.01 1.11.99 2.04 1.3 2.33 1.45.29.14.46.12.63-.07.17-.19.71-.83.9-1.11.19-.29.38-.24.64-.14.26.09 1.66.78 1.94.92.29.14.48.21.55.33.07.12.07.69-.17 1.37z"/></svg>
                WhatsApp
              </a>
              <a class="share-menu-item" data-network="telegram" href="#" target="_blank" rel="noopener">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#0088CC" stroke="none"><path d="M21.94 4.6 18.9 19.04c-.22 1-.98 1.24-1.98.77l-5.47-4.03-2.64 2.54c-.3.3-.55.55-1.12.55l.39-5.6L18.6 5.7c.46-.42-.1-.65-.72-.24L6.34 12.6.84 10.86c-1-.31-1.02-1 .21-1.48l19.3-7.44c.89-.32 1.67.21 1.59 1.66z"/></svg>
                Telegram
              </a>
              <button class="share-menu-item" data-network="copy" type="button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                Salin Tautan
              </button>
            </div>
          </div>
        </div>

        <h1 class="detail-title">${escapeHtml(article.title)}</h1>

        <div class="detail-author-box">
          <div class="author-avatar">${initials}</div>
          <div class="author-info">
            <span class="author-info-name">${escapeHtml(article.author)}</span>
            <span class="author-info-meta">Dipublikasikan pada ${article.date} &bull; kabarwarga.id</span>
          </div>
        </div>

        <div class="detail-image-wrapper">
          <img src="${article.image}" alt="${escapeHtml(article.title)}" class="detail-image">
        </div>

        <article class="detail-content">
          ${article.content}
        </article>
      </div>
    </div>
  `;

  contentArea.innerHTML = htmlContent;

  // Share menu functionality
  const shareBtn = document.getElementById("btn-share-article");
  const shareMenu = document.getElementById("share-menu");
  const shareUrl = window.location.href;
  const shareTitle = article.title;
  let shareOverlay = null;
  let isShareMenuOpen = false;

  const closeShareMenu = () => {
    isShareMenuOpen = false;
    shareMenu.classList.remove("show");
    if (shareOverlay) {
      shareOverlay.remove();
      shareOverlay = null;
    }
  };

  const openShareMenu = () => {
    if (isShareMenuOpen) {
      closeShareMenu();
      return;
    }

    isShareMenuOpen = true;
    shareMenu.classList.add("show");

    const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    const tw = `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareTitle)}`;
    const wa = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareTitle + " " + shareUrl)}`;
    const tg = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareTitle)}`;

    shareMenu.querySelector('[data-network="facebook"]').href = fb;
    shareMenu.querySelector('[data-network="twitter"]').href = tw;
    shareMenu.querySelector('[data-network="whatsapp"]').href = wa;
    shareMenu.querySelector('[data-network="telegram"]').href = tg;

    if (!shareOverlay) {
      shareOverlay = document.createElement("div");
      shareOverlay.className = "share-overlay";
      shareOverlay.addEventListener("click", closeShareMenu);
      document.body.appendChild(shareOverlay);
    }
  };

  shareBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openShareMenu();
  });

  // Close menu when clicking outside
  document.addEventListener("click", (e) => {
    if (isShareMenuOpen && !shareMenu.contains(e.target) && !shareBtn.contains(e.target)) {
      closeShareMenu();
    }
  });

  shareMenu
    .querySelector('[data-network="copy"]')
    .addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast("Tautan berita berhasil disalin!");
      } catch (err) {
        console.error("Gagal menyalin tautan: ", err);
        const tempInput = document.createElement("input");
        tempInput.value = shareUrl;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
        showToast("Tautan berita berhasil disalin!");
      }
      closeShareMenu();
    });

  shareMenu.querySelectorAll("a[data-network]").forEach((link) => {
    link.addEventListener("click", () => {
      closeShareMenu();
    });
  });
};

const renderCommentsList = (comments) => {
  if (comments.length === 0) {
    return `<div style="text-align: center; color: var(--color-text-light); padding: 24px 0; font-style: italic;">Belum ada tanggapan. Jadilah warga pertama yang berkomentar!</div>`;
  }

  return comments
    .map((comment) => {
      const commentInitial = comment.name[0].toUpperCase();
      return `
      <div class="comment-card">
        <div class="comment-header">
          <div class="comment-author-info">
            <div class="comment-avatar">${commentInitial}</div>
            <div>
              <div class="comment-author-name">${escapeHtml(comment.name)}</div>
              <div style="font-size: 0.8rem; color: var(--color-text-muted);">${escapeHtml(comment.location)}</div>
            </div>
          </div>
          <div class="comment-date">${escapeHtml(comment.date)}</div>
        </div>
        <div class="comment-body">
          ${escapeHtml(comment.text)}
        </div>
      </div>
    `;
    })
    .join("");
};

// =========================================================================
// 5. Hash Router & Controller
// =========================================================================

const handleRouting = () => {
  const hash = window.location.hash || "#/";
  const searchInput = document.getElementById("search-input");

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.remove("active");
  });

  if (hash === "#/" || hash === "") {
    const homeNavItem = document.querySelector(
      '.nav-item[data-category="Home"]',
    );
    if (homeNavItem) homeNavItem.classList.add("active");

    searchInput.value = "";
    renderHomeView();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else if (hash.startsWith("#/kategori/")) {
    const category = decodeURIComponent(hash.substring(11));
    const navItem = document.querySelector(
      `.nav-item[data-category="${category}"]`,
    );
    if (navItem) navItem.classList.add("active");

    searchInput.value = "";
    renderHomeView(category);
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else if (hash.startsWith("#/artikel/")) {
    const id = hash.substring(10);
    renderDetailView(id); // documentId Strapi = string, tidak perlu parseInt
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else if (hash.startsWith("#/cari/")) {
    const query = decodeURIComponent(hash.substring(7));
    searchInput.value = query;
    renderHomeView(null, query);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
};

// =========================================================================
// 6. Event Listeners (tidak bergantung pada data artikel)
// =========================================================================

const setupEventListeners = () => {
  // Theme toggle
  initThemeToggle();

  // Reading progress
  initReadingProgress();

  // Search clear button
  initSearchClear();

  window.addEventListener("scroll", () => {
    const header = document.querySelector(".header-wrapper");
    if (window.scrollY > 20) {
      header.classList.add("scrolled");
    } else {
      header.classList.remove("scrolled");
    }
  });

  const searchInput = document.getElementById("search-input");
  let searchTimeout = null;

  searchInput.addEventListener("input", (e) => {
    const val = e.target.value;

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      if (val.trim() === "") {
        window.location.hash = "#/";
      } else {
        window.location.hash = `#/cari/${encodeURIComponent(val)}`;
      }
    }, 300);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      searchInput.value = "";
      window.location.hash = "#/";
    }
  });

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const catName = item.getAttribute("data-category");
      if (catName === "Home") {
        window.location.hash = "#/";
      } else {
        window.location.hash = `#/kategori/${encodeURIComponent(catName)}`;
      }
    });
  });

  document.querySelectorAll(".footer-nav-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const catName = link.getAttribute("data-category");
      if (catName === "Home") {
        window.location.hash = "#/";
      } else {
        window.location.hash = `#/kategori/${encodeURIComponent(catName)}`;
      }
    });
  });

  document.querySelectorAll(".logo-container").forEach((logo) => {
    logo.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.hash = "#/";
    });
  });
};

// =========================================================================
// 7. Application Initializer
// =========================================================================

const initApp = async () => {
  showLoadingState();

  try {
    articles = await fetchArticlesFromStrapi();
  } catch (error) {
    console.error("Gagal memuat artikel dari Strapi:", error);
    showErrorState(error);
    return;
  }

  ensureLikesSeed();
  handleRouting();
};

document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  window.addEventListener("hashchange", handleRouting);
  initApp();
});
