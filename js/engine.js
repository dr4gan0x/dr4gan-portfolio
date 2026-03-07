const { config, posts } = window.Dr4ganData;

const DOM = {
    content: document.getElementById('main-content'),
    searchInput: document.getElementById('search-input'),
    recentList: document.getElementById('recent-updated-list'),
    navLinks: {
        home: document.getElementById('nav-home'),
        categories: document.getElementById('nav-categories'),
        archives: document.getElementById('nav-archives'),
        about: document.getElementById('nav-about'),
    },
    rightSidebar: document.getElementById('right-sidebar'),
    mobileNav: {
        header: document.getElementById('mobile-header'),
        searchBtn: document.getElementById('mobile-search-btn'),
        searchOverlay: document.getElementById('mobile-search-overlay'),
        closeSearch: document.getElementById('close-mobile-search'),
        searchInput: document.getElementById('mobile-search-input'),
        searchResults: document.getElementById('mobile-search-results'),
    }
};

/**
 * Initialize
 */
function init() {
    // URL Router
    const params = new URLSearchParams(window.location.search);
    const postSlug = params.get('post');
    const page = params.get('page') || 'home';

    // Highlight Active Nav
    updateActiveNav(page);

    // Mobile Search Handlers
    setupMobileSearch();

    // Initial Render
    if (postSlug) {
        // Show Right Sidebar (now used for TOC)
        if (DOM.rightSidebar) {
            DOM.rightSidebar.classList.remove('lg:hidden');
            DOM.rightSidebar.classList.add('lg:block');
        }
        renderPostBySlug(postSlug);
    } else {
        // SHOW Right Sidebar for Lists
        if (DOM.rightSidebar) {
            DOM.rightSidebar.classList.remove('lg:hidden');
            DOM.rightSidebar.classList.add('lg:block');
        }
        switch (page) {
            case 'categories': renderCategories(); break;
            case 'archives': renderArchives(); break;
            case 'about': renderAbout(); break;
            default: renderPostList(posts); // Home matches all posts
        }
    }

    // Hook Search
    if (DOM.searchInput) {
        DOM.searchInput.addEventListener('input', (e) => {
            handleSearch(e.target.value);
        });
    }

    // Render Recent Updates Sidebar
    renderRecentSidebar();

    // Copy Handlers (Desktop)
    setupCopyHandler('btn-copy-email', 'icon-email', 'drgan754@gmail.com', 'ph-envelope-simple');
    setupCopyHandler('btn-copy-discord', 'icon-discord', 'karabatik', 'ph-discord-logo');

    // Copy Handlers (Mobile)
    setupCopyHandler('mob-btn-copy-email', 'mob-icon-email', 'drgan754@gmail.com', 'ph-envelope-simple');
    setupCopyHandler('mob-btn-copy-discord', 'mob-icon-discord', 'karabatik', 'ph-discord-logo');
}

function setupCopyHandler(btnId, iconId, content, originalIconClass) {
    const btn = document.getElementById(btnId);
    const icon = document.getElementById(iconId);

    if (!btn || !icon) return;

    btn.addEventListener('click', () => {
        navigator.clipboard.writeText(content).then(() => {
            // Visual Feedback
            const originalClass = icon.className;

            // Switch to Checkmark
            icon.className = "ph ph-check text-lg text-green-400 relative z-10 scale-125 transition-transform duration-200";

            // Pulse Button
            btn.classList.add('ring-1', 'ring-green-500/50', 'bg-green-500/10');

            setTimeout(() => {
                // Revert
                icon.className = `ph ${originalIconClass} text-lg relative z-10 transition-transform duration-200`;
                btn.classList.remove('ring-1', 'ring-green-500/50', 'bg-green-500/10');
            }, 2000);
        });
    });
}

function updateActiveNav(pageName) {
    // Desktop Nav
    Object.values(DOM.navLinks).forEach(el => {
        if (el) {
            el.classList.remove('text-white', 'bg-white/10');
            el.classList.add('text-text-muted');
        }
    });

    // Mobile Nav Reset
    document.querySelectorAll('[id^="mob-nav-"]').forEach(el => {
        el.classList.remove('text-green-400');
        el.classList.add('text-text-muted');
        const icon = el.querySelector('i');
        if (icon) icon.className = icon.className.replace('-fill', '');
    });

    // Set Active Desktop
    const active = DOM.navLinks[pageName];
    if (active) {
        active.classList.remove('text-text-muted');
        active.classList.add('text-white', 'bg-white/10');
    }

    // Set Active Mobile
    const activeMob = document.getElementById(`mob-nav-${pageName}`);
    if (activeMob) {
        activeMob.classList.remove('text-text-muted');
        activeMob.classList.add('text-green-400');
        const icon = activeMob.querySelector('i');
        // If phosphor icons support filled variant logic, toggle it. 
        // Assuming regular names, we just add color.
    }
}

/**
 * Mobile Search Logic
 */
function setupMobileSearch() {
    if (!DOM.mobileNav.searchBtn) return;

    DOM.mobileNav.searchBtn.addEventListener('click', () => {
        DOM.mobileNav.searchOverlay.classList.remove('hidden');
        DOM.mobileNav.searchOverlay.classList.add('flex');
        DOM.mobileNav.searchInput.focus();
    });

    DOM.mobileNav.closeSearch.addEventListener('click', () => {
        DOM.mobileNav.searchOverlay.classList.add('hidden');
        DOM.mobileNav.searchOverlay.classList.remove('flex');
    });

    DOM.mobileNav.searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        if (!query) {
            DOM.mobileNav.searchResults.innerHTML = '';
            return;
        }

        const filtered = posts.filter(p =>
            p.title.toLowerCase().includes(query) ||
            (p.tags && p.tags.some(t => t.toLowerCase().includes(query)))
        );

        let html = '';
        if (filtered.length === 0) {
            html = `<div class="text-white/40 text-center italic py-4">Nothing found in the void.</div>`;
        } else {
            filtered.forEach(p => {
                html += `
                    <div onclick="window.location.search='?post=${p.id}'" class="bg-white/5 border border-white/10 p-4 rounded-xl active:bg-white/10 transition">
                        <div class="text-sm font-bold text-white mb-1">${p.title}</div>
                        <div class="text-xs text-white/50 font-mono">${p.date}</div>
                    </div>
                `;
            });
        }
        DOM.mobileNav.searchResults.innerHTML = html;
    });
}

/**
 * Search Logic
 */
function handleSearch(query) {
    if (!query) {
        renderPostList(posts);
        return;
    }

    const lowerQ = query.toLowerCase();
    const filtered = posts.filter(p =>
        p.title.toLowerCase().includes(lowerQ) ||
        p.description.toLowerCase().includes(lowerQ) ||
        (p.tags && p.tags.some(t => t.toLowerCase().includes(lowerQ)))
    );

    renderPostList(filtered, true);
}

/**
 * Render List of Posts (Cards)
 */
function renderPostList(postArray, isSearch = false) {
    if (postArray.length === 0) {
        DOM.content.innerHTML = `
            <div class="flex flex-col items-center justify-center h-64 text-center border border-dashed border-white/10 rounded-xl bg-white/[0.02] p-8">
                <i class="ph ph-ghost text-4xl text-neutral-600 mb-4"></i>
                <h3 class="text-xl text-white font-bold mb-2">No Signals Found</h3>
                <p class="text-sm text-text-muted">${isSearch ? 'Target not found in memory.' : 'The void stares back.'}</p>
            </div>
        `;
        return;
    }

    let html = `<div class="space-y-6">`;

    postArray.forEach((post, index) => {
        // Stagger delay calculation
        const delay = index * 100; // 100ms per item

        html += `
            <article 
                class="post-card group cursor-pointer flex flex-col gap-4 md:gap-8 items-start opacity-0 animate-enter w-full" 
                style="animation-delay: ${delay}ms;"
                onclick="window.location.search='?post=${post.id}'"
            >
                <div class="flex-1 w-full">
                    
                    <div class="text-[11px] font-bold text-text-muted mb-3 uppercase tracking-widest flex items-center gap-2">
                        <span class="text-green-500/80">●</span>
                        <span>${post.date}</span>
                        <span class="w-px h-3 bg-white/10"></span>
                        <span>${post.category}</span>
                    </div>

                    <h2 class="card-title text-xl md:text-2xl font-bold text-text-main mb-2 md:mb-3 transition-colors duration-200 break-words">
                        ${post.title}
                    </h2>
                    
                    <p class="text-xs md:text-sm text-text-muted leading-relaxed line-clamp-2 group-hover:text-gray-300 transition-colors break-words">
                        ${post.description}
                    </p>
                    
                    <div class="mt-4 flex items-center gap-2 text-xs font-mono text-text-muted opacity-60 group-hover:opacity-100 transition-opacity">
                         <span>READ_MEMORY_DUMP</span>
                         <i class="ph ph-arrow-right"></i>
                    </div>
                </div>
                
                ${post.image ? `
                <div class="w-full h-48 md:w-40 md:h-28 shrink-0 overflow-hidden rounded-lg border border-white/5 bg-black/20 relative group-hover:border-white/20 transition-colors">
                    <img src="${post.image}" class="w-full h-full object-cover opacity-60 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700 ease-out" alt="${post.title}">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </div>
                ` : ''}
            </article>
        `;
    });

    html += `</div>`;
    DOM.content.innerHTML = html;
}

/**
 * Render Single Post
 */
function renderPostBySlug(slug) {
    const post = posts.find(p => p.id === slug);
    if (!post) {
        DOM.content.innerHTML = `<div class="p-8 text-center text-red-500 font-mono">Error 0x404: SEGMENT_NOT_FOUND</div>`;
        return;
    }

    let tagHtml = post.tags ? post.tags.map(t => `<span class="text-xs font-mono text-text-muted bg-white/5 border border-white/5 px-2 py-1 rounded hover:bg-white/10 transition">#${t}</span>`).join(' ') : '';

    let html = `
        <div class="glass-panel rounded-2xl p-6 md:p-12 min-h-[80vh] opacity-0 animate-enter">
            
            <div class="mb-6 md:mb-8">
                <a href="?page=home" class="inline-flex items-center gap-2 text-xs font-bold text-text-muted hover:text-white uppercase tracking-wider transition-colors py-2 px-3 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/5">
                    <i class="ph ph-arrow-left"></i> Return to Root
                </a>
            </div>

            <header class="mb-8 md:mb-12 border-b border-white/5 pb-8 md:pb-10">
                <div class="flex gap-3 mb-4 md:mb-6">
                    <span class="px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs font-bold border border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.2)] uppercase tracking-wider">${post.category}</span>
                </div>
                <h1 class="text-2xl sm:text-3xl md:text-6xl text-white mb-6 md:mb-8 leading-tight font-extrabold tracking-tight text-glow w-full">${post.title}</h1>
                <div class="flex flex-col md:flex-row md:items-center gap-4 md:gap-6 text-xs md:text-sm text-text-muted font-medium font-mono border-l-2 border-green-500/50 pl-4">
                    <span class="flex items-center gap-2"><i class="ph ph-calendar-blank"></i> ${post.date}</span>
                    <span class="flex items-center gap-2"><i class="ph ph-user"></i> ${config.author.name}</span>
                    <span class="flex items-center gap-2"><i class="ph ph-code"></i> ${slug.length} bytes</span>
                    <span class="flex items-center gap-2"><i class="ph ph-eye"></i> READ_ONLY</span>
                </div>
            </header>

            <div class="prose prose-invert prose-sm sm:prose-base md:prose-lg lg:prose-xl w-full max-w-full 
                prose-headings:font-bold prose-headings:tracking-tight prose-headings:w-full
                prose-h2:text-xl sm:prose-h2:text-2xl md:prose-h2:text-3xl prose-h2:mt-8 md:prose-h2:mt-16 prose-h2:mb-3 md:prose-h2:mb-6 prose-h2:break-words
                prose-h3:text-base sm:prose-h3:text-lg md:prose-h3:text-xl prose-h3:mt-6 md:prose-h3:mt-10 prose-h3:mb-2 md:prose-h3:mb-4 prose-h3:break-words
                prose-p:text-gray-300 prose-p:leading-6 md:prose-p:leading-8 prose-p:mb-3 md:prose-p:mb-6 prose-p:w-full prose-p:break-words
                prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline prose-a:transition-all prose-a:break-words
                prose-strong:text-white prose-strong:font-bold
                prose-ul:list-disc prose-ul:pl-5 md:prose-ul:pl-6 prose-ul:mb-4 md:prose-ul:mb-6 prose-ul:w-full
                prose-ol:list-decimal prose-ol:pl-5 md:prose-ol:pl-6 prose-ol:mb-4 md:prose-ol:mb-6 prose-ol:w-full
                prose-li:text-gray-300 prose-li:mb-1 md:prose-li:mb-2 prose-li:break-words
                prose-code:bg-[#161b22] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-xs sm:prose-code:text-sm prose-code:border prose-code:border-white/10 prose-code:break-words prose-code:whitespace-pre-wrap
                prose-pre:bg-[#0d1117] prose-pre:border prose-pre:border-white/10 prose-pre:rounded-lg md:prose-pre:rounded-xl prose-pre:shadow-2xl prose-pre:mb-6 md:prose-pre:mb-8 prose-pre:overflow-x-auto prose-pre:max-w-full prose-pre:text-xs sm:prose-pre:text-sm
                prose-img:rounded-lg md:prose-img:rounded-xl prose-img:border prose-img:border-white/10 prose-img:shadow-2xl prose-img:bg-black/20 prose-img:my-6 md:prose-img:my-8 prose-img:max-w-full prose-img:h-auto
                prose-hr:border-white/10 prose-hr:my-8 md:prose-hr:my-12
                prose-table:w-full prose-table:overflow-x-auto prose-table:block prose-table:text-xs sm:prose-table:text-sm
                prose-td:break-words prose-th:break-words">
                ${post.content}
            </div>
             <div class="mt-16 pt-8 border-t border-white/5">
                <div class="flex gap-3 items-center flex-wrap">
                    <span class="text-xs text-gray-500 font-bold uppercase tracking-widest mr-2"><i class="ph ph-hash"></i> Tags:</span>
                    ${tagHtml}
                </div>
             </div>
        </div>
    `;

    DOM.content.innerHTML = html;

    // Trigger Prism Highlight
    if (window.Prism) {
        window.Prism.highlightAll();
    }

    // Generate Table of Contents in Right Sidebar
    generateTableOfContents();
}

/**
 * Generate Table of Contents (TOC)
 */
function generateTableOfContents() {
    if (!DOM.rightSidebar) return;

    const headers = DOM.content.querySelectorAll('h2');
    if (headers.length === 0) {
        DOM.rightSidebar.innerHTML = '';
        return;
    }

    let tocHtml = `
        <div class="hidden lg:block transition-all duration-300 pl-4">
            <h3 class="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-6">
                On This Page
            </h3>
            <ul class="space-y-3 relative border-l border-white/5">
    `;

    headers.forEach((header, index) => {
        // Generate ID if missing
        if (!header.id) {
            header.id = 'toc-' + index;
        }

        tocHtml += `
            <li class="group pl-5 relative">
                <!-- Active Indicator Line -->
                <span class="absolute left-[-1px] top-0 bottom-0 w-[2px] bg-blue-500 scale-y-0 group-[.active]:scale-y-100 transition-transform duration-300 origin-top rounded-full"></span>
                
                <a href="#${header.id}" 
                   class="toc-link block text-[13px] text-text-muted hover:text-white transition-colors duration-200 leading-relaxed group-[.active]:text-white group-[.active]:font-medium"
                   data-target="${header.id}">
                   ${header.innerText}
                </a>
            </li>
        `;
    });

    tocHtml += `</ul></div>`;
    DOM.rightSidebar.innerHTML = tocHtml;

    // Smooth Scroll & Spy Logic
    setupTocSpy(headers);
}

function setupTocSpy(headers) {
    const tocLinks = document.querySelectorAll('.toc-link');

    // Click Handler for Smooth Scroll
    tocLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-target');
            const target = document.getElementById(targetId);
            if (target) {
                // Offset for sticky header
                const headerOffset = 80;
                const elementPosition = target.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: "smooth"
                });
            }
        });
    });

    // Intersection Observer for Active State
    const observerOptions = {
        root: null,
        rootMargin: '-100px 0px -60% 0px', // Trigger when header is near top
        threshold: 0
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Remove active from all
                tocLinks.forEach(link => {
                    link.parentElement.classList.remove('active');
                    link.classList.remove('text-white', 'font-medium');
                });

                // Add active to current
                const activeLink = document.querySelector(`.toc-link[data-target="${entry.target.id}"]`);
                if (activeLink) {
                    activeLink.parentElement.classList.add('active');
                    activeLink.classList.add('text-white', 'font-medium');
                }
            }
        });
    }, observerOptions);

    headers.forEach(header => observer.observe(header));
}


/**
 * Render Categories Page
 */
function renderCategories() {
    // Extract Categories
    const counts = {};
    posts.forEach(p => {
        counts[p.category] = (counts[p.category] || 0) + 1;
    });

    const keys = Object.keys(counts);

    if (keys.length === 0) {
        renderEmptyPage("Categories", "No topics classified yet.");
        return;
    }

    let html = `
        <div class="glass-panel rounded-2xl p-6 md:p-8 min-h-[50vh] opacity-0 animate-enter">
            <h1 class="text-2xl md:text-3xl text-white font-bold mb-6 md:mb-8 flex items-center gap-3"><i class="ph ph-folder-open text-blue-400"></i> Categories</h1>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
    `;

    keys.forEach(cat => {
        html += `
            <div class="p-4 md:p-5 bg-white/[0.02] rounded-xl border border-white/5 hover:border-white/20 hover:bg-white/[0.05] cursor-pointer transition-all duration-300 flex justify-between items-center group relative overflow-hidden"
                 onclick="window.location.search='?page=home&q=category:${cat}'">
                
                <div class="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                <span class="text-gray-200 group-hover:text-white font-bold relative z-10 text-base md:text-lg break-words">${cat}</span>
                <span class="text-xs font-mono bg-black/40 text-gray-500 group-hover:text-white px-2 md:px-3 py-1 rounded-full border border-white/5 group-hover:border-white/20 transition-colors relative z-10 shrink-0">${counts[cat]}</span>
            </div>
        `;
    });

    html += `</div></div>`;
    DOM.content.innerHTML = html;
}

/**
 * Render Archives Page
 */
function renderArchives() {
    // Group by Year
    const groups = {};
    posts.forEach(p => {
        const year = new Date(p.date).getFullYear();
        if (!groups[year]) groups[year] = [];
        groups[year].push(p);
    });

    const years = Object.keys(groups).sort((a, b) => b - a); // Descending

    if (years.length === 0) {
        renderEmptyPage("Archives", "History is empty.");
        return;
    }

    let html = `
         <div class="glass-panel rounded-2xl p-6 md:p-8 min-h-[50vh] opacity-0 animate-enter">
            <h1 class="text-2xl md:text-3xl text-white font-bold mb-6 md:mb-8 flex items-center gap-3"><i class="ph ph-archive text-purple-400"></i> Archives</h1>
            <div class="space-y-10">
    `;

    years.forEach(year => {
        html += `
            <div class="relative pl-6 border-l border-white/5 ml-2">
                <h2 class="text-2xl text-white/90 font-bold mb-6 flex items-center gap-3 relative">
                    <span class="absolute -left-[29px] w-3 h-3 rounded-full bg-[#050505] border-2 border-white/20"></span>
                    ${year}
                </h2>
                <ul class="space-y-3">
                    ${groups[year].map(p => `
                        <li class="flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-xs md:text-sm group cursor-pointer p-3 rounded-lg hover:bg-white/5 transition-all duration-200 border border-transparent hover:border-white/5" onclick="window.location.search='?post=${p.id}'">
                            <span class="text-gray-400 group-hover:text-white transition font-medium break-words">${p.title}</span>
                            <span class="text-gray-600 font-mono text-xs border border-white/5 px-2 py-1 rounded bg-black/20 shrink-0">${p.date}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    });

    html += `</div></div>`;
    DOM.content.innerHTML = html;
}

/**
 * Render About Page
 */
function renderAbout() {
    let html = `
        <div class="glass-panel rounded-2xl p-6 md:p-16 min-h-[80vh] opacity-0 animate-enter">
             
             <!-- Centered Header -->
             <header class="mb-16 text-center max-w-3xl mx-auto">
                <h1 class="text-4xl md:text-5xl text-white font-bold mb-6 tracking-tight text-glow">${config.author.name}</h1>
                <p class="text-xl text-text-muted font-light leading-relaxed">${config.author.bio}</p>
             </header>

             <!-- Subtle Divider -->
             <div class="w-full max-w-sm mx-auto h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-16"></div>

             <!-- Content Container -->
             <div class="prose prose-invert prose-lg max-w-3xl mx-auto
                prose-p:text-gray-300 prose-p:leading-8 prose-p:font-light prose-p:mb-6
                prose-headings:text-white prose-headings:font-bold prose-headings:text-2xl prose-headings:mt-12 prose-headings:mb-6 prose-headings:tracking-tight
                prose-ul:list-disc prose-ul:pl-6 prose-li:text-gray-400 prose-li:mb-3
                prose-strong:text-white prose-strong:font-semibold
                prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline">
                ${config.aboutMe}
             </div>
        </div>
    `;
    DOM.content.innerHTML = html;
}

/**
 * Helper: Render Empty State
 */
function renderEmptyPage(title, subtitle) {
    DOM.content.innerHTML = `
        <div class="glass-panel rounded-xl border border-white/5 p-8 min-h-[50vh] flex flex-col items-center justify-center text-center">
            <h1 class="text-3xl text-gray-700 font-bold mb-2">${title}</h1>
            <p class="text-gray-500">${subtitle}</p>
        </div>
    `;
}

/**
 * Update the "Right Sidebar" list
 */
function renderRecentSidebar() {
    if (!DOM.recentList) return;

    // Take top 5 recent posts
    const recent = posts.slice(0, 5);

    if (recent.length === 0) {
        DOM.recentList.innerHTML = `<li class="text-xs text-gray-600 italic">No updates available.</li>`;
        return;
    }

    let html = '';
    recent.forEach(p => {
        html += `
            <li class="group">
                <a href="?post=${p.id}" class="flex items-center gap-3 text-text-muted hover:text-white transition-all duration-300 py-2" title="${p.title}">
                    <span class="w-1.5 h-1.5 rounded-full bg-neutral-800 group-hover:bg-green-500 group-hover:shadow-[0_0_8px_rgba(34,197,94,0.8)] transition-all duration-300"></span>
                    <span class="truncate text-xs font-medium">${p.title}</span>
                </a>
            </li>
        `;
    });
    DOM.recentList.innerHTML = html;
}

// Code Copy Handler
function copyCodeBlock(btn, codeId) {
    const code = document.getElementById(codeId);
    if (!code) return;

    const text = code.innerText;
    navigator.clipboard.writeText(text).then(() => {
        const icon = btn.querySelector('i');
        const span = btn.querySelector('span');

        // Success animation
        icon.className = 'ph ph-check text-green-400';
        span.textContent = 'Copied!';
        span.classList.add('text-green-400');
        btn.classList.add('border-green-500/50', 'bg-green-500/20', 'scale-105');

        // Flash effect on code block
        const pre = code.closest('pre');
        if (pre) {
            pre.style.boxShadow = '0 0 20px rgba(34, 197, 94, 0.3)';
            pre.style.borderColor = 'rgba(34, 197, 94, 0.5)';
        }

        setTimeout(() => {
            icon.className = 'ph ph-copy';
            span.textContent = 'Copy';
            span.classList.remove('text-green-400');
            btn.classList.remove('border-green-500/50', 'bg-green-500/20', 'scale-105');
            if (pre) {
                pre.style.boxShadow = '';
                pre.style.borderColor = '';
            }
        }, 2000);
    });
}

// Start
init();
